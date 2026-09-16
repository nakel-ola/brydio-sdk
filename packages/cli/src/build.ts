import {
  BUNDLE_MANIFEST,
  BUNDLE_MAX_BYTES,
  bundleBytes,
  bundleHash,
  bundleProblem,
  collectionsOf,
  sizeOf,
} from '@brydio/manifest';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { DIST, readProject, sourceOf, type Problem } from './project.ts';
import { checkSources } from './validate.ts';

/**
 * `brydio build`: an app's source in, the bundle Brydio loads out (A5-F02).
 *
 * One ES module per screen, each whole on its own (Preact, the runtime and
 * the screen, with nothing left to fetch, because the worker can fetch
 * nothing), written where the manifest's `entry` says, plus `app.json`. Then
 * the checks the store will make, with its numbers: only scripts and the
 * manifest, 1 MB for everything. And the fingerprint the server will serve
 * the code under, worked out by its recipe, so the number printed here is the
 * number in the URL.
 */

export interface BuildResult {
  ok: boolean;
  problems: Problem[];
  /** The folder the bundle was written to. */
  outDir: string;
  /** Every file of the bundle, by its path inside it. */
  files: Map<string, Uint8Array>;
  /** The fingerprint of the code files. */
  hash: string | null;
  bytes: number;
}

export interface BuildOptions {
  outDir?: string;
  /** Smaller bundles by default; off when a stack trace should be readable. */
  minify?: boolean;
  /**
   * Refuse what `validate` refuses in the source first. On by default; off
   * only for a fixture that breaks the rules on purpose, to prove the runtime
   * or the prelude stops it.
   */
  checkSource?: boolean;
}

export async function build(dir: string, options: BuildOptions = {}): Promise<BuildResult> {
  const project = readProject(dir);
  const outDir = join(project.root, options.outDir ?? DIST);
  const files = new Map<string, Uint8Array>();
  const problems: Problem[] = [...project.problems];
  const failed = (): BuildResult => ({ ok: false, problems, outDir, files, hash: null, bytes: 0 });

  // What `validate` would refuse in the source is refused before anything is
  // bundled (A5-F03-S01), so a build that succeeds is one that validates.
  if (options.checkSource !== false) problems.push(...checkSources(project.root));

  if (!project.manifest || problems.some(problem => problem.severity === 'error')) return failed();

  const manifest = project.manifest;
  // What the runtime needs to know about the app without reading a manifest
  // it has no way to fetch: who it is, what it may ask for, and what its
  // collections' tools are called.
  const baked = {
    name: manifest.name,
    version: manifest.version,
    grants: manifest.grants ?? {},
    collections: Object.fromEntries(collectionsOf(manifest).map(spec => [spec.name, { label: spec.label, plural: spec.plural }])),
  };

  for (const [screen, { entry }] of Object.entries(manifest.screens ?? {})) {
    const source = sourceOf(project.root, entry);

    if (!source) {
      problems.push({
        code: 'screen_source_missing',
        severity: 'error',
        path: `screens.${screen}.entry`,
        message: `The "${screen}" screen is built from src/${entry.replace(/\.m?js$/, '')}.tsx (or .ts, .jsx, .js), and there is no such file.`,
      });
      continue;
    }

    const built = await bundle(project.root, source, baked, options.minify ?? true);

    if (typeof built === 'string') {
      problems.push({
        code: 'screen_build_failed',
        severity: 'error',
        file: relative(project.root, source),
        message: `The "${screen}" screen did not build: ${built}`,
      });
      continue;
    }

    if (built.others.length) {
      // CSS, HTML or an image the screen imported. Refused by name here rather
      // than dropped, so a builder never ships a screen that expected it.
      problems.push({
        code: 'bundle_file_not_code',
        severity: 'error',
        file: relative(project.root, source),
        message:
          `The "${screen}" screen brings in ${built.others.map(name => `"${name}"`).join(', ')}, which a bundle cannot hold. ` +
          'A Brydio app has no CSS, HTML or images: Brydio draws every element itself.',
      });
      continue;
    }

    files.set(entry, built.code);
  }

  if (problems.some(problem => problem.severity === 'error')) return failed();

  files.set(BUNDLE_MANIFEST, new TextEncoder().encode(`${JSON.stringify(project.raw, null, 2)}\n`));

  const refused = bundleProblem(files);

  if (refused) {
    problems.push({ code: refused.code, severity: 'error', message: refused.message, ...(refused.file ? { file: `${DIST}/${refused.file}` } : {}) });

    return failed();
  }

  // A fresh folder each time, so a screen that was renamed leaves nothing
  // behind for the store to refuse.
  rmSync(outDir, { recursive: true, force: true });

  for (const [path, bytes] of files) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    writeFileSync(join(outDir, path), bytes);
  }

  return { ok: true, problems, outDir, files, hash: bundleHash(files), bytes: bundleBytes(files) };
}

/** What `brydio build` prints on success. */
export function describeBuild(result: BuildResult, root: string): string {
  const lines = [...result.files]
    .sort(([a], [b]) => a.localeCompare(b))
    // Each file's own sha256, the one its line of the fingerprint is made from.
    .map(([path, bytes]) => `  ${join(relative(root, result.outDir) || '.', path)}  ${sizeOf(bytes.length)}  sha256 ${createHash('sha256').update(bytes).digest('hex')}`);

  return [
    'Built:',
    ...lines,
    `Total ${sizeOf(result.bytes)} of ${sizeOf(BUNDLE_MAX_BYTES)}.`,
    `Fingerprint ${result.hash}`,
  ].join('\n');
}

/**
 * One screen, bundled whole into one ES module, or why it could not be.
 *
 * Run as `bun build` in its own process from the app's folder, rather than
 * `Bun.build` in this one, so the app's own tsconfig (its JSX source) and
 * its own node_modules decide how the screen is read, whoever is calling:
 * inside `bun test` in another folder, `Bun.build` resolves against that
 * folder instead.
 */
async function bundle(root: string, source: string, baked: object, minify: boolean): Promise<{ code: Uint8Array; others: string[] } | string> {
  const scratch = mkdtempSync(join(tmpdir(), 'brydio-build-'));

  try {
    const child = Bun.spawn(
      [
        process.execPath,
        'build',
        source,
        '--target=browser',
        '--format=esm',
        // A folder, not one file, so a stylesheet or an image the screen
        // imports is written beside it where it can be seen and refused.
        `--outdir=${scratch}`,
        '--entry-naming=screen.[ext]',
        `--define=__BRYDIO_APP__=${JSON.stringify(JSON.stringify(baked))}`,
        '--define=process.env.NODE_ENV="production"',
        ...(minify ? ['--minify'] : []),
      ],
      { cwd: root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, NO_COLOR: '1' } },
    );
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);

    if (code !== 0) return (stderr || stdout).trim().split('\n').filter(Boolean).slice(-6).join(' ');

    const others = (readdirSync(scratch, { recursive: true }) as string[]).filter(name => name !== 'screen.js' && !statSync(join(scratch, name)).isDirectory());

    return { code: new Uint8Array(readFileSync(join(scratch, 'screen.js'))), others: others.sort() };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
