#!/usr/bin/env bun
/**
 * `bun run release:build [--dry]`: the SDK's packages as they would be
 * published, built into `release/<package>/` (A9-F03, Phase 4 groundwork).
 *
 * In the workspace, every package exports its TypeScript source, which Bun,
 * the templates and Issues read directly. A published package can't assume
 * that, so this compiles each one with `tsc` into `.js` and `.d.ts` beside
 * each other, keeping the source layout (`src/index.ts` becomes
 * `src/index.js` and `src/index.d.ts`), copies what isn't TypeScript (the
 * editor plugin, the tokens stylesheet), and writes a `package.json` whose
 * `exports` and `bin` point at the compiled files.
 *
 * Nothing is published. `bun pm pack` in a `release/<package>/` folder makes
 * the tarball a registry would get, which `packages/cli/test/release.test.ts`
 * installs into a fresh app to prove it works without workspace links.
 *
 * The licence is MIT and the scope is `@brydio`, both the owner's decision
 * (E1, 17 Sep, OQ-A05). It is read from `release.json`, and a build without
 * one stops before writing publishable package files, unless `--dry` says the
 * result is only for testing.
 *
 * Still the owner's, and so not written here: the repository's address (it
 * goes in `release.json` as `repository`), and the copyright line a `LICENSE`
 * file needs, which wants the owner's legal name.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dir, '..');
export const RELEASE = join(ROOT, 'release');

/** In the order they depend on one another, so each is built after what it imports. */
export const RELEASED = ['manifest', 'ui', 'app', 'fake-host', 'cli'] as const;

/** What each package ships that isn't compiled from TypeScript, relative to its folder. */
const COPIED: Partial<Record<(typeof RELEASED)[number], string[]>> = {
  ui: ['src/web/tokens.css'],
  cli: ['ts-plugin'],
};

interface PackageJson {
  name: string;
  version: string;
  description?: string;
  type?: string;
  exports?: Record<string, string>;
  bin?: Record<string, string>;
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

export class ReleaseRefused extends Error {}

/** A source path's compiled form: `./src/index.ts` → `./src/index.js`. Anything else is kept. */
const compiled = (path: string) => path.replace(/\.tsx?$/, '.js');

/** An export entry for a published package: the types beside the code for TypeScript sources. */
function exportEntry(path: string): string | { types: string; default: string } {
  return /\.tsx?$/.test(path) ? { types: path.replace(/\.tsx?$/, '.d.ts'), default: compiled(path) } : path;
}

export interface ReleaseOptions {
  /** Build without a licence, for tests; the result is not publishable. */
  dry?: boolean;
  out?: (line: string) => void;
}

export async function releaseBuild(options: ReleaseOptions = {}): Promise<Record<string, string>> {
  const out = options.out ?? console.log;
  const settings = existsSync(join(ROOT, 'release.json'))
    ? (JSON.parse(readFileSync(join(ROOT, 'release.json'), 'utf8')) as { license?: string; repository?: string })
    : {};

  if (!settings.license && !options.dry) {
    throw new ReleaseRefused('No licence in release.json. The owner chooses it; build with --dry to test without one.');
  }

  const commit = Bun.spawnSync(['git', '-C', ROOT, 'rev-parse', 'HEAD']).stdout.toString().trim();
  const built: Record<string, string> = {};

  rmSync(RELEASE, { recursive: true, force: true });

  for (const name of RELEASED) {
    const source = join(ROOT, 'packages', name);
    const target = join(RELEASE, name);
    const pkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')) as PackageJson;
    const includes = ['src', ...(existsSync(join(source, 'bin')) ? ['bin'] : [])];

    mkdirSync(target, { recursive: true });

    // A tsconfig inside the repository, so `@types/bun` and the workspace
    // packages resolve as they do for `check-types`.
    const tsconfig = join(RELEASE, `tsconfig.${name}.json`);

    writeFileSync(
      tsconfig,
      `${JSON.stringify(
        {
          extends: relative(RELEASE, join(ROOT, 'tsconfig.base.json')),
          compilerOptions: {
            noEmit: false,
            declaration: true,
            rewriteRelativeImportExtensions: true,
            rootDir: relative(RELEASE, source),
            outDir: relative(RELEASE, target),
          },
          include: includes.map(folder => relative(RELEASE, join(source, folder))),
          exclude: [relative(RELEASE, join(source, 'test'))],
        },
        null,
        2,
      )}\n`,
    );

    const tsc = Bun.spawnSync([process.execPath, 'x', 'tsc', '-p', tsconfig], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });

    if (tsc.exitCode !== 0) {
      throw new ReleaseRefused(`@brydio/${name} did not compile:\n${`${tsc.stdout}${tsc.stderr}`.trim()}`);
    }

    // `tsc` rewrites `./x.ts` to `./x.js` in the code it emits, but not in the
    // declarations. TypeScript follows either, but other tools reading them
    // only find the `.js` and `.d.ts` files a package ships, so they match.
    for (const file of new Bun.Glob('**/*.d.ts').scanSync(target)) {
      const path = join(target, file);

      writeFileSync(path, readFileSync(path, 'utf8').replace(/(from\s+|import\s+|import\()(['"])(\.{1,2}\/[^'"]+?)\.tsx?\2/g, '$1$2$3.js$2'));
    }

    for (const path of COPIED[name] ?? []) cpSync(join(source, path), join(target, path), { recursive: true });

    const published: PackageJson = {
      name: pkg.name,
      version: pkg.version,
      ...(pkg.description ? { description: pkg.description } : {}),
      type: pkg.type ?? 'module',
      ...(settings.license ? { license: settings.license } : {}),
      ...(settings.repository ? { repository: { type: 'git', url: settings.repository, directory: `packages/${name}` } } : {}),
      gitHead: commit,
      exports: Object.fromEntries(Object.entries(pkg.exports ?? {}).map(([key, path]) => [key, exportEntry(path)])) as never,
      ...(pkg.bin ? { bin: Object.fromEntries(Object.entries(pkg.bin).map(([key, path]) => [key, compiled(path)])) } : {}),
      files: [...includes, ...(COPIED[name] ?? []).map(path => path.split('/')[0]!)].filter((one, index, all) => all.indexOf(one) === index),
      ...(pkg.dependencies ? { dependencies: pkg.dependencies } : {}),
    };

    writeFileSync(join(target, 'package.json'), `${JSON.stringify(published, null, 2)}\n`);
    if (existsSync(join(source, 'README.md'))) cpSync(join(source, 'README.md'), join(target, 'README.md'));

    built[pkg.name] = target;
    out(`Built ${pkg.name}@${pkg.version} into ${relative(ROOT, target)}/`);
  }

  return built;
}

if (import.meta.main) {
  try {
    await releaseBuild({ dry: process.argv.includes('--dry') });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

