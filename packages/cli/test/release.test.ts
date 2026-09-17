import { afterAll, describe, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { commitOf, commitRefusal, RELEASED, ROOT, releaseBuild } from '../../../scripts/release-build.ts';

/**
 * The packages as a registry would get them (A9-F03, Phase 4 groundwork).
 *
 * `release:build --dry` compiles each package. Its tarball goes into a fresh
 * copy of the Preact template, installed with no workspace links and nothing
 * from this checkout's source. The app then builds, validates, passes its
 * own fake-host tests and type-checks, through the installed `brydio` command.
 */

const made: string[] = [];

afterAll(() => {
  for (const folder of made) rmSync(folder, { recursive: true, force: true });
});

const run = (command: string[], cwd: string) => {
  const result = Bun.spawnSync(command, { cwd, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, NO_COLOR: '1' } });

  return { code: result.exitCode, output: `${result.stdout}${result.stderr}` };
};

describe('the release build', () => {
  test(
    'installs from its tarballs into a new app, which builds, validates, tests and type-checks',
    async () => {
      const built = await releaseBuild({ dry: true, out: () => {} });
      const tarballs = mkdtempSync(join(tmpdir(), 'brydio-tarballs-'));

      made.push(tarballs);

      const tarball: Record<string, string> = {};

      for (const [name, folder] of Object.entries(built)) {
        const packed = run([process.execPath, 'pm', 'pack', '--destination', tarballs, '--quiet'], folder);

        expect(packed.code, packed.output).toBe(0);
        tarball[name] = join(tarballs, basename(packed.output.trim().split('\n').at(-1)!));
        expect(existsSync(tarball[name]!), tarball[name]).toBe(true);
      }

      expect(Object.keys(tarball).sort()).toEqual(RELEASED.map(name => `@brydio/${name}`).sort());

      // A copy of the template, pointed at the tarballs and nothing else of this checkout's.
      const app = join(mkdtempSync(join(tmpdir(), 'brydio-released-')), 'released');

      made.push(join(app, '..'));
      cpSync(join(ROOT, 'templates', 'preact'), app, { recursive: true, filter: from => !['node_modules', 'dist'].includes(basename(from)) });

      const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
      const linked = (section: Record<string, string>) =>
        Object.fromEntries(Object.entries(section).map(([name, version]) => [name, tarball[name] ? `file:${tarball[name]}` : version]));

      writeFileSync(
        join(app, 'package.json'),
        JSON.stringify({
          ...pkg,
          name: 'released',
          dependencies: linked(pkg.dependencies),
          devDependencies: linked(pkg.devDependencies),
          overrides: Object.fromEntries(Object.entries(tarball).map(([name, path]) => [name, `file:${path}`])),
        }),
      );

      const tsconfig = JSON.parse(readFileSync(join(app, 'tsconfig.json'), 'utf8'));
      const base = JSON.parse(readFileSync(join(ROOT, 'tsconfig.base.json'), 'utf8'));
      const { extends: _, ...own } = tsconfig;

      writeFileSync(join(app, 'tsconfig.json'), JSON.stringify({ ...own, compilerOptions: { ...base.compilerOptions, ...tsconfig.compilerOptions } }));

      const installed = run([process.execPath, 'install'], app);

      expect(installed.code, installed.output).toBe(0);

      // The licence travels with every package, as MIT asks, and so does the
      // commit it was built from: months later that is how anyone works out
      // what actually shipped.
      const head = commitOf(ROOT).commit;

      for (const [name, folder] of Object.entries(built)) {
        const licence = readFileSync(join(folder, 'LICENSE'), 'utf8');
        const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
        const source = JSON.parse(readFileSync(join(ROOT, 'packages', basename(folder), 'package.json'), 'utf8'));

        expect(licence, name).toContain('Copyright (c) 2026 Brydio Inc.');
        expect(pkg.license, name).toBe('MIT');
        expect(pkg.gitHead, name).toBe(head);
        expect(pkg.version, name).toBe(source.version);
      }

      // The installed runtime is the compiled package, not a link to this checkout.
      const runtime = join(app, 'node_modules', '@brydio', 'app');

      expect(existsSync(join(runtime, 'src', 'index.js'))).toBe(true);
      expect(existsSync(join(runtime, 'src', 'index.d.ts'))).toBe(true);
      expect(readdirSync(join(runtime, 'src')).filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'))).toEqual([]);
      expect(readFileSync(join(runtime, 'LICENSE'), 'utf8')).toContain('Copyright (c) 2026 Brydio Inc.');

      const brydio = join(app, 'node_modules', '.bin', 'brydio');

      for (const command of [[brydio, 'build'], [brydio, 'validate'], [brydio, 'test'], [process.execPath, 'run', 'check-types']]) {
        const result = run(command, app);

        expect(result.code, `${command.join(' ')}\n${result.output}`).toBe(0);
      }

      // The packages' own declarations, checked as library files (the app's
      // own tsconfig skips them), so a declaration that doesn't hold up for
      // an editor fails here.
      writeFileSync(
        join(app, 'tsconfig.consumer.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            lib: ['ES2023', 'DOM'],
            types: ['bun'],
            strict: true,
            noEmit: true,
            skipLibCheck: false,
            jsx: 'react-jsx',
            jsxImportSource: '@brydio/app/preact',
          },
          files: ['node_modules/@brydio/app/src/index.d.ts', 'node_modules/@brydio/app/src/preact/index.d.ts', 'node_modules/@brydio/manifest/src/index.d.ts'],
        }),
      );

      const consumer = run([process.execPath, 'x', 'tsc', '-p', 'tsconfig.consumer.json'], app);
      const ours = consumer.output.split('\n').filter(line => line.includes('node_modules/@brydio/'));

      expect(ours, consumer.output).toEqual([]);

      mkdirSync(join(app, 'dist'), { recursive: true });
      expect(existsSync(join(app, 'dist', 'screens', 'home.js'))).toBe(true);
    },
    300_000,
  );

  /**
   * What `gitHead` is worth depends entirely on this. A build from a tree
   * with uncommitted changes would write a commit that does not contain the
   * files in the tarball, and nothing about the package would look wrong.
   *
   * Asked of a repository made here rather than of this checkout, so the test
   * says the same thing whether or not somebody is part-way through a change.
   */
  test('reads the commit of a checkout, and sees what is not in it', () => {
    const repository = mkdtempSync(join(tmpdir(), 'brydio-commit-'));

    made.push(repository);

    const git = (...args: string[]) => run(['git', ...args], repository);

    git('init', '-q');
    git('config', 'user.email', 'test@brydio.test');
    git('config', 'user.name', 'Test');
    writeFileSync(join(repository, 'a.txt'), 'one');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'first');

    const clean = commitOf(repository);

    expect(clean.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(clean.uncommitted).toEqual([]);

    writeFileSync(join(repository, 'a.txt'), 'one, edited');
    writeFileSync(join(repository, 'b.txt'), 'two');

    const dirty = commitOf(repository);

    expect(dirty.commit).toBe(clean.commit);
    expect(dirty.uncommitted.sort()).toEqual(['a.txt', 'b.txt']);

    // Somewhere that is not a checkout at all names no commit.
    expect(commitOf(mkdtempSync(join(tmpdir(), 'brydio-nogit-'))).commit).toBe('');
  });

  test('will not build publishable packages from a tree that has changes in it', () => {
    const commit = 'a'.repeat(40);

    expect(commitRefusal({ commit, uncommitted: [] }, false)).toBeNull();

    const changed = commitRefusal({ commit, uncommitted: ['packages/app/src/index.ts'] }, false);

    expect(changed, 'a tree with changes in it was allowed to build publishable packages').not.toBeNull();

    // The refusal says which files, and what to do instead.
    expect(changed).toContain('packages/app/src/index.ts');
    expect(changed).toContain(commit.slice(0, 7));
    expect(changed).toContain('--dry');

    expect(commitRefusal({ commit: '', uncommitted: [] }, false)).toContain('not a git checkout');

    // A dry build is for testing and says so, so it is allowed either way.
    expect(commitRefusal({ commit: '', uncommitted: ['packages/app/src/index.ts'] }, true)).toBeNull();
  });
});
