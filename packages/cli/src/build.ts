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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';

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
  /**
   * A development build a screen can take in place (`brydio dev`, A5-F02-S02):
   * each screen's entry holds only the app's code, and one shared chunk beside
   * it holds Preact, the runtime and `@brydio/app/hot`. Never for a bundle
   * that is published: `publish` and `build` leave it off.
   */
  hot?: boolean;
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

    const built = await bundle(project.root, source, baked, options.minify ?? true, options.hot === true);

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

    // Minified only: a debugging build's size says nothing about what ships.
    if (built.runtimeBytes !== null && built.runtimeBytes > RUNTIME_MAX_BYTES) {
      problems.push({
        code: 'runtime_too_large',
        severity: 'error',
        file: relative(project.root, source),
        message:
          `The "${screen}" screen carries ${(built.runtimeBytes / 1024).toFixed(1)} KB of Brydio's runtime, over the ${RUNTIME_MAX_BYTES / 1024} KB a screen may carry. ` +
          'Something in @brydio is being bundled that this screen does not use.',
      });
      continue;
    }

    files.set(entry, built.code);

    // Beside the entry, which imports them as `./chunk-….js`. Screens that
    // share a runtime share its file.
    for (const [name, bytes] of built.chunks) files.set(join(dirname(entry), name), bytes);
  }

  // A custom tool's handler (`tasks/apps` A3-F08): the app's own code, which
  // Brydio runs on its side in a box with no page and no network — so it is
  // built like a screen, from `src/`, and never carries the screen runtime.
  for (const tool of manifest.tools?.custom ?? []) {
    const source = sourceOf(project.root, tool.handler);

    if (!source) {
      problems.push({
        code: 'handler_source_missing',
        severity: 'error',
        path: `tools.custom.${tool.name}.handler`,
        message: `The "${tool.name}" tool is built from src/${tool.handler.replace(/\.m?js$/, '')}.ts (or .js), and there is no such file.`,
      });
      continue;
    }

    const built = await bundle(project.root, source, baked, options.minify ?? true);

    if (typeof built === 'string') {
      problems.push({
        code: 'handler_build_failed',
        severity: 'error',
        file: relative(project.root, source),
        message: `The "${tool.name}" tool did not build: ${built}`,
      });
      continue;
    }

    if (built.others.length) {
      problems.push({
        code: 'bundle_file_not_code',
        severity: 'error',
        file: relative(project.root, source),
        message:
          `The "${tool.name}" tool brings in ${built.others.map(name => `"${name}"`).join(', ')}, which a bundle cannot hold. ` +
          'A handler is code and nothing else.',
      });
      continue;
    }

    files.set(tool.handler, built.code);

    for (const [name, bytes] of built.chunks) files.set(join(dirname(tool.handler), name), bytes);
  }

  if (problems.some(problem => problem.severity === 'error')) return failed();

  // Which SDK built it, for Brydio to check at publish (A5-F04-S03). Written
  // here and only here: a hand-written `sdk` could claim a runtime the screens
  // were never built with.
  const sdk = sdkVersionFor(project.root);

  if (project.raw.sdk !== undefined) {
    problems.push({
      code: 'manifest_sdk_overwritten',
      severity: 'warning',
      file: relative(project.root, project.manifestFile),
      path: 'sdk',
      message: `The manifest says "sdk": ${JSON.stringify(project.raw.sdk)}, which brydio build writes itself. The build says ${sdk}; take the line out of the manifest.`,
    });
  }

  files.set(BUNDLE_MANIFEST, new TextEncoder().encode(`${JSON.stringify({ ...project.raw, sdk }, null, 2)}\n`));

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
/**
 * The most of Brydio's own runtime (`@brydio/app`, `@brydio/ui`,
 * `@brydio/manifest`, minified) one screen may carry (A5-F03-S01). The
 * worker can fetch nothing, so each screen brings its runtime with it
 * (contracts §11); trimming keeps that to what the screen uses, and this
 * catches a change that makes a screen carry what it doesn't. Preact and the
 * app's own code are not counted.
 */
export const RUNTIME_MAX_BYTES = 30 * 1024;

/** The SDK packages whose modules count as the runtime, by their folders as `root` resolves them. */
function runtimeFolders(root: string): string[] {
  const folders: string[] = [];

  for (const name of ['@brydio/app', '@brydio/ui', '@brydio/manifest']) {
    try {
      let at = dirname(Bun.resolveSync(name, root));

      while (!existsSync(join(at, 'package.json')) && dirname(at) !== at) at = dirname(at);

      folders.push(`${realpathSync(at)}/`);
    } catch {
      // Not installed in this app: nothing of it can be bundled.
    }
  }

  return folders;
}

/** How many bytes of the output came from the runtime's modules, from `bun build`'s metafile. */
export function runtimeBytesOf(metafile: { outputs?: Record<string, { inputs?: Record<string, { bytesInOutput?: number }> }> }, root: string): number {
  const folders = runtimeFolders(root);
  let bytes = 0;

  for (const output of Object.values(metafile.outputs ?? {})) {
    for (const [input, { bytesInOutput = 0 }] of Object.entries(output.inputs ?? {})) {
      const path = resolve(root, input);
      const real = existsSync(path) ? realpathSync(path) : path;

      if (folders.some(folder => real.startsWith(folder))) bytes += bytesInOutput;
    }
  }

  return bytes;
}

/** What a hot build's shared chunk is made from, as `root` resolves them. */
const HOT_RUNTIME = ['@brydio/app/hot', '@brydio/app', '@brydio/app/preact', '@brydio/app/preact/jsx-runtime', '@brydio/app/preact/jsx-dev-runtime'];

/**
 * The two entries of a hot build, written into `scratch`: the screen, with
 * the hot runtime imported first so components can register, and the runtime
 * alone. What both import is what the bundler moves into the shared chunk.
 */
function hotEntries(root: string, source: string, scratch: string): string[] | string {
  const runtime: string[] = [];

  for (const name of HOT_RUNTIME) {
    try {
      runtime.push(Bun.resolveSync(name, root));
    } catch {
      if (name === '@brydio/app/hot') return 'this app\'s @brydio/app has no hot runtime. Update @brydio/app.';
    }
  }

  const imports = (paths: string[]) => paths.map(path => `import ${JSON.stringify(path)};`).join('\n');
  const screen = join(scratch, 'entries', 'screen.ts');
  const shared = join(scratch, 'entries', 'runtime.ts');

  mkdirSync(dirname(screen), { recursive: true });
  writeFileSync(screen, `${imports([runtime[0]!, source])}\n`);
  writeFileSync(shared, `${imports(runtime)}\n`);

  return [screen, shared];
}

/** A hot build's output files that are its own: the two entries and the shared chunks. */
const CHUNK_FILE = /^chunk-[a-z0-9]+\.js$/;

async function bundle(
  root: string,
  source: string,
  baked: object,
  minify: boolean,
  hot = false,
): Promise<{ code: Uint8Array; chunks: Map<string, Uint8Array>; others: string[]; runtimeBytes: number | null } | string> {
  const scratch = mkdtempSync(join(tmpdir(), 'brydio-build-'));
  const out = hot ? join(scratch, 'out') : scratch;

  try {
    const entries = hot ? hotEntries(root, source, scratch) : [source];

    if (typeof entries === 'string') return entries;

    const child = Bun.spawn(
      [
        process.execPath,
        'build',
        ...entries,
        ...(hot ? ['--splitting', '--react-fast-refresh', '--chunk-naming=chunk-[hash].[ext]', '--entry-naming=[name].[ext]'] : ['--entry-naming=screen.[ext]']),
        '--target=browser',
        '--format=esm',
        // A folder, not one file, so a stylesheet or an image the screen
        // imports is written beside it where it can be seen and refused.
        `--outdir=${out}`,
        `--metafile=${join(scratch, '..', `${basename(scratch)}.meta.json`)}`,
        `--define=__BRYDIO_APP__=${JSON.stringify(JSON.stringify(baked))}`,
        '--define=process.env.NODE_ENV="production"',
        ...(minify ? ['--minify'] : []),
      ],
      { cwd: root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, NO_COLOR: '1' } },
    );
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);

    if (code !== 0) return (stderr || stdout).trim().split('\n').filter(Boolean).slice(-6).join(' ');

    const written = (readdirSync(out, { recursive: true }) as string[]).filter(name => !statSync(join(out, name)).isDirectory());
    const chunks = new Map<string, Uint8Array>();

    if (hot) for (const name of written.filter(one => CHUNK_FILE.test(one))) chunks.set(name, new Uint8Array(readFileSync(join(out, name))));

    const others = written.filter(name => name !== 'screen.js' && !(hot && (name === 'runtime.js' || chunks.has(name))));

    const meta = join(scratch, '..', `${basename(scratch)}.meta.json`);
    const runtimeBytes = minify && !hot && existsSync(meta) ? runtimeBytesOf(JSON.parse(readFileSync(meta, 'utf8')), root) : null;

    return { code: new Uint8Array(readFileSync(join(out, 'screen.js'))), chunks, others: others.sort(), runtimeBytes };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(join(scratch, '..', `${basename(scratch)}.meta.json`), { force: true });
  }
}

/**
 * The version of `@brydio/app` an app's screens are built against: the copy
 * the app's own folder resolves, since that is what `bun build` bundles. An
 * app that never imports it (a screen of plain messages, a test fixture) gets
 * this CLI's version, which every `@brydio` package shares.
 */
export function sdkVersionFor(root: string): string {
  try {
    let at = dirname(Bun.resolveSync('@brydio/app', root));

    for (;;) {
      const manifest = join(at, 'package.json');

      if (existsSync(manifest)) {
        const found = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; version?: string };

        if (found.name === '@brydio/app' && found.version) return found.version;
      }

      if (dirname(at) === at) break;

      at = dirname(at);
    }
  } catch {
    // Not resolvable from the app's folder; fall through to the CLI's own.
  }

  return (JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as { version: string }).version;
}

