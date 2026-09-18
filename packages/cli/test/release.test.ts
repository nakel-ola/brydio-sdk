import { afterAll, describe, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  changelogRefusal,
  commitOf,
  commitRefusal,
  publishedBin,
  RELEASED,
  ROOT,
  releaseBuild,
  supportRefusal,
} from '../../../scripts/release-build.ts';

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
  test('writes npm-valid executable paths without a leading dot segment', () => {
    expect(publishedBin({ brydio: './bin/brydio.ts' })).toEqual({ brydio: 'bin/brydio.js' });
  });

  test(
    'installs from its tarballs into a new app, which builds, validates, tests and type-checks',
    async () => {
      // Read around the build, not after it: this checkout is shared, and a
      // commit landing mid-test would otherwise fail on a moving HEAD. In CI
      // the two readings are always the same.
      const before = commitOf(ROOT).commit;
      const built = await releaseBuild({ dry: true, out: () => {} });
      const after = commitOf(ROOT).commit;
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
      for (const [name, folder] of Object.entries(built)) {
        const licence = readFileSync(join(folder, 'LICENSE'), 'utf8');
        const pkg = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
        const source = JSON.parse(readFileSync(join(ROOT, 'packages', basename(folder), 'package.json'), 'utf8'));

        expect(licence, name).toContain('Copyright (c) 2026 Brydio Inc.');
        expect(pkg.license, name).toBe('MIT');
        expect([before, after], name).toContain(pkg.gitHead);
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
   * "Published from a build anyone can reproduce" (A9-F03-S04), asked rather
   * than asserted: the same checkout built twice has to give the same bytes.
   *
   * A build that quietly varies — a timestamp written into a file, a folder
   * read in whatever order the filesystem gave it — cannot be checked against
   * what was published, so `gitHead` would name a commit nobody could build
   * their way back to. This is what makes the commit worth carrying.
   */
  test(
    'gives the same bytes when the same checkout is built twice',
    async () => {
      const bytesOf = (built: Record<string, string>) => {
        const files = new Map<string, string>();

        for (const [name, folder] of Object.entries(built)) {
          for (const file of new Bun.Glob('**/*').scanSync({ cwd: folder, onlyFiles: true })) {
            files.set(`${name}/${file}`, Bun.hash(readFileSync(join(folder, file))).toString(16));
          }
        }

        return files;
      };

      const first = bytesOf(await releaseBuild({ dry: true, out: () => {} }));
      const second = bytesOf(await releaseBuild({ dry: true, out: () => {} }));

      expect(first.size).toBeGreaterThan(20);
      expect([...second.keys()].sort()).toEqual([...first.keys()].sort());

      const differed = [...first].filter(([file, hash]) => second.get(file) !== hash).map(([file]) => file);

      expect(differed).toEqual([]);
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

  /**
   * A9-F03-S04. The pages exist and everything ours is decided; the address
   * itself is the owner's, and an invented one would be worse than none —
   * somebody would write to it and hear nothing. So the build stops rather
   * than shipping packages that tell people to report problems nowhere.
   */
  test('will not publish packages that say nowhere to report a problem', () => {
    const settled = { support: 'apps@brydio.test', security: 'security@brydio.test' };

    expect(supportRefusal(settled, false)).toBeNull();

    const neither = supportRefusal({}, false);

    expect(neither, 'packages with no support address were allowed to be published').not.toBeNull();
    expect(neither).toContain('support');
    expect(neither).toContain('security');
    expect(neither).toContain('--dry');

    // One without the other is still a refusal, and it names the one missing.
    expect(supportRefusal({ support: settled.support }, false)).toContain('no security address');
    expect(supportRefusal({ security: settled.security }, false)).toContain('no support address');

    // Every test builds --dry, which is why the suite still runs today.
    expect(supportRefusal({}, true)).toBeNull();
  });

  /**
   * A9-F03-S03. A release with no entry leaves the people who depend on the
   * SDK to diff two tarballs to find out what moved — and at 0.x, where a
   * minor may break them, that is the difference between an upgrade and an
   * afternoon. The entry has to exist before the version goes out; afterwards
   * never comes.
   */
  test('will not publish a version the changelog does not mention', () => {
    const log = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
    const version = JSON.parse(readFileSync(join(ROOT, 'packages', RELEASED[0], 'package.json'), 'utf8')).version;

    // The version being built today has its section, so a release is not blocked.
    expect(changelogRefusal(version, log, false)).toBeNull();

    const missing = changelogRefusal('9.9.9', log, false);

    expect(missing, 'a version with no changelog entry was allowed out').not.toBeNull();
    expect(missing).toContain('## 9.9.9');

    // A mention in prose is not an entry: the heading is what is asked for.
    expect(changelogRefusal('2.0.0', 'Coming soon: 2.0.0, which changes everything.', false)).not.toBeNull();
    expect(changelogRefusal('2.0.0', '## 2.0.0\n\nWhat changed.', false)).toBeNull();

    expect(changelogRefusal('9.9.9', log, true)).toBeNull();
  });

  test('the tag workflow publishes every released package in dependency order', () => {
    const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
    const names = workflow
      .match(/for package in ([^;]+); do/)?.[1]
      ?.trim()
      .split(/\s+/);

    expect(names).toEqual([...RELEASED]);
    expect(workflow).toContain('npm publish --access public --tag next');
    expect(workflow).not.toContain('--provenance');
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
