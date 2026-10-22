import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { BRAND, OWNED } from '../../../test-support/owner-rules.ts';
import { build, main, nextVersion, pack, validate, version, type VersionOptions } from '../src/index.ts';
import { brydioHome, fakeRegistry, type FakeRegistry } from './fake-registry.ts';

/** `brydio version`, the one version source, and `brydio pack` (PB03). */

const made: string[] = [];
const registries: FakeRegistry[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const one of registries.splice(0)) one.stop();
});

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-version-'));

  made.push(root);

  for (const [path, content] of Object.entries({ ...OWNED, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return root;
}

const manifestOf = (version: string, schema: Record<string, unknown> = { title: 'string' }, extra: Record<string, unknown> = {}) => ({
  name: 'tracker',
  version,
  ...BRAND,
  data: { issues: { schema, label: 'issue' } },
  screens: { home: { entry: 'screens/home.js' } },
  grants: { tools: ['*'], collections: ['*'] },
  ...extra,
});

const tracker = (manifest: object, extra: Record<string, string> = {}) =>
  app({ '.brydio/app.json': JSON.stringify(manifest, null, 2), 'src/screens/home.ts': 'export const home = 1;\n', ...extra });

const written = (root: string) => JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8')) as Record<string, unknown> & { migrations?: { version: string; steps: unknown[] }[] };

async function run(words: string[], root: string, options: VersionOptions = {}) {
  const lines: string[] = [];
  const home = brydioHome(null);

  made.push(home);

  // Not logged in and nothing committed, unless the test says otherwise.
  const code = await version(words, root, { home, registry: 'http://127.0.0.1:1', committed: () => null, out: line => lines.push(line), ...options });

  return { code, text: lines.join('\n') };
}

describe('the next number', () => {
  test('counts the way npm does, a prerelease going to its own release first', () => {
    expect(nextVersion('1.2.3', 'patch')).toBe('1.2.4');
    expect(nextVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(nextVersion('1.2.3', 'major')).toBe('2.0.0');
    expect(nextVersion('1.2.3-beta.1', 'patch')).toBe('1.2.3');
    expect(nextVersion('1.3.0-beta.1', 'minor')).toBe('1.3.0');
    expect(nextVersion('1.2.3-beta.1', 'minor')).toBe('1.3.0');
    expect(nextVersion('2.0.0-rc.1', 'major')).toBe('2.0.0');
    expect(nextVersion('1.2.3+build.4', 'patch')).toBe('1.2.4');
  });
});

describe('brydio version', () => {
  test('writes the new number into the manifest and nowhere else', async () => {
    const root = tracker(manifestOf('0.1.0'), { 'package.json': JSON.stringify({ name: 'tracker', private: true }) });
    const before = readFileSync(join(root, 'package.json'), 'utf8');
    const { code, text } = await run(['minor'], root);

    expect(code).toBe(0);
    expect(text).toContain('tracker 0.1.0 → 0.2.0, in .brydio/app.json.');
    expect(written(root)).toEqual({ ...manifestOf('0.2.0') });
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(before);
  });

  test('takes a number, and refuses one that is not higher or not a number', async () => {
    const root = tracker(manifestOf('1.0.0'));

    expect(await run(['1.0.0'], root)).toMatchObject({ code: 1, text: expect.stringContaining('1.0.0 is not higher than 1.0.0, the manifest\'s version now. A version number only goes up. [version_not_higher]') });
    expect(await run(['0.9.0'], root)).toMatchObject({ code: 1, text: expect.stringContaining('[version_not_higher]') });
    expect(await run(['soon'], root)).toMatchObject({ code: 2, text: expect.stringContaining('"soon" is not patch, minor, major, or a version number') });
    expect(await run([], root)).toMatchObject({ code: 2, text: expect.stringContaining('Say which: brydio version patch, minor, major') });
    expect(written(root).version).toBe('1.0.0');
    expect((await run(['2.0.0-beta.1'], root)).code).toBe(0);
    expect(written(root).version).toBe('2.0.0-beta.1');
  });

  test('refuses while package.json carries a version too, so the two cannot drift', async () => {
    const root = tracker(manifestOf('0.1.0'), { 'package.json': JSON.stringify({ name: 'tracker', version: '0.1.0' }) });
    const { code, text } = await run(['patch'], root);

    expect(code).toBe(1);
    expect(text).toContain('package.json says "version": "0.1.0". An app\'s version lives in .brydio/app.json alone: take the line out of package.json, then run brydio version again. [version_in_package_json]');
    expect(written(root).version).toBe('0.1.0');
  });

  test('refuses an app with no manifest, or a version it cannot count from', async () => {
    expect(await run(['patch'], app({}))).toMatchObject({ code: 1, text: expect.stringContaining('[manifest_missing]') });
    expect(await run(['patch'], tracker({ ...manifestOf('0.1.0'), version: 'one' }))).toMatchObject({ code: 1, text: expect.stringContaining('is not a number like 1.2.0') });
  });

  test('adds a migrations entry from the last published version on the registry, when logged in', async () => {
    const reg = fakeRegistry();

    registries.push(reg);

    const published = manifestOf('0.1.0', { title: 'string', notes: 'text?', status: ['open', 'doing', 'done'] });

    reg.apps.set('tracker', {
      key: 'tracker',
      publisher: 'pub_acme',
      access: 'workspace',
      retired: false,
      tags: { latest: '0.1.0' },
      history: {},
      versions: [{ version: '0.1.0', fingerprint: 'f', sdk: '0.1.0', manifest: published, state: 'live', publishedAt: 'then', tag: 'latest', body: {} }],
    });

    // `due` came, `notes` went and `summary` came of its kind, `doing` was taken out of the choice.
    const root = tracker(manifestOf('0.1.0', { title: 'string', summary: 'text?', due: 'date', status: ['open', 'done'] }));
    const home = brydioHome(reg.url);

    made.push(home);

    const lines: string[] = [];
    const code = await version(['minor'], root, { home, registry: reg.url, committed: () => null, out: line => lines.push(line) });
    const text = lines.join('\n');

    expect(code).toBe(0);
    expect(text).toContain(`Registry ${reg.url}: comparing the schema with tracker 0.1.0, the last version published.`);
    expect(written(root).migrations).toEqual([
      {
        version: '0.2.0',
        steps: [
          { op: 'add', collection: 'issues', field: 'due' },
          { op: 'replace', collection: 'issues', field: 'status', from: 'doing', to: '' },
          { op: 'rename', collection: 'issues', from: 'notes', to: 'summary' },
        ],
      },
    ]);
    expect(text).toContain('add issues.due: it is required, so give the step a "default"');
    expect(text).toContain('rename issues.notes to summary: one field went and one of the same type came, so it reads as a rename.');
    expect(text).toContain('replace in issues.status: say which value records holding "doing" hold instead, in "to". brydio validate refuses it until then.');

    // The unfinished steps are refused until a person finishes them.
    expect((await build(root)).ok).toBe(true);

    const checked = validate(root, { previous: join(app({ 'app.json': JSON.stringify(published) }), 'app.json') });

    expect(checked.ok).toBe(false);
    expect(checked.problems.map(problem => problem.code)).toContain('migration_missing');
  });

  test('says there is nothing to migrate from before the first publish', async () => {
    const reg = fakeRegistry();

    registries.push(reg);

    const root = tracker(manifestOf('0.1.0'));
    const home = brydioHome(reg.url);

    made.push(home);

    const lines: string[] = [];

    expect(await version(['patch'], root, { home, registry: reg.url, committed: () => null, out: line => lines.push(line) })).toBe(0);
    expect(lines.join('\n')).toContain('tracker has no published version yet, so there is nothing to migrate from.');
    expect(written(root).migrations).toBeUndefined();
  });

  test('compares with the manifest at git HEAD when not logged in, and drops a collection that went', async () => {
    const committed = manifestOf('0.1.0', { title: 'string' }, { data: { issues: { schema: { title: 'string' }, label: 'issue' }, labels: { schema: { name: 'string' }, label: 'label' } } });
    const root = tracker(manifestOf('0.1.0'));
    const { code, text } = await run(['patch'], root, { committed: () => JSON.stringify(committed) });

    expect(code).toBe(0);
    expect(text).toContain('Comparing the schema with the manifest at git HEAD (0.1.0)');
    expect(written(root).migrations).toEqual([{ version: '0.1.1', steps: [{ op: 'dropCollection', collection: 'labels' }] }]);
    expect(text).toContain('dropCollection labels: every record in it is deleted when a workspace upgrades.');
  });

  test('reads git HEAD for real in a checkout', async () => {
    const root = tracker(manifestOf('0.1.0'));
    const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });

    git('init', '-q');
    git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'add', '.brydio/app.json');
    git('-c', 'user.email=a@b.c', '-c', 'user.name=t', 'commit', '-qm', 'one');
    writeFileSync(join(root, '.brydio/app.json'), JSON.stringify(manifestOf('0.1.0', { title: 'string', done: 'boolean?' })));

    const { code, text } = await run(['patch'], root, { committed: undefined });

    expect(code).toBe(0);
    expect(text).toContain('git HEAD');
    expect(written(root).migrations).toEqual([{ version: '0.1.1', steps: [{ op: 'add', collection: 'issues', field: 'done' }] }]);
  });

  test('adds nothing when the steps already declared explain the change, or there was no change', async () => {
    const committed = manifestOf('0.1.0');
    const stepped = tracker(manifestOf('0.2.0', { title: 'string', done: 'boolean?' }, { migrations: [{ version: '0.2.0', steps: [{ op: 'add', collection: 'issues', field: 'done' }] }] }));
    const one = await run(['patch'], stepped, { committed: () => JSON.stringify(committed) });

    expect(one.code).toBe(0);
    expect(written(stepped).migrations).toHaveLength(1);
    expect(one.text).toContain('the migrations already declared explain every change');

    const same = tracker(manifestOf('0.1.0'));

    expect((await run(['patch'], same, { committed: () => JSON.stringify(committed) })).code).toBe(0);
    expect(written(same).migrations).toBeUndefined();
  });

  test('says what no step can do: a field that changed type', async () => {
    const root = tracker(manifestOf('0.1.0', { title: 'number' }));
    const { text } = await run(['patch'], root, { committed: () => JSON.stringify(manifestOf('0.1.0')) });

    expect(text).toContain('issues.title: no step can do this. issues.title changed type;');
    expect(written(root).migrations).toBeUndefined();
  });

  test('runs from the command line, the bump first and the folder after', async () => {
    const root = tracker(manifestOf('0.1.0'));
    const was = process.env.BRYDIO_HOME;

    process.env.BRYDIO_HOME = mkdtempSync(join(tmpdir(), 'brydio-home-'));
    made.push(process.env.BRYDIO_HOME);

    try {
      const lines: string[] = [];

      expect(await main(['version', 'major', root, '--registry', 'http://127.0.0.1:1'], line => lines.push(line))).toBe(0);
      expect(written(root).version).toBe('1.0.0');
    } finally {
      if (was === undefined) delete process.env.BRYDIO_HOME;
      else process.env.BRYDIO_HOME = was;
    }
  });
});

describe('one version source', () => {
  test('the build refuses a package.json that says another version', async () => {
    const root = tracker(manifestOf('0.2.0'), { 'package.json': JSON.stringify({ name: 'tracker', version: '0.1.0' }) });
    const built = await build(root);

    expect(built.ok).toBe(false);
    expect(built.problems.find(problem => problem.code === 'version_mismatch')).toMatchObject({
      severity: 'error',
      file: 'package.json',
      message: 'package.json says version "0.1.0" and the manifest says "0.2.0". An app\'s version lives in the manifest alone.',
    });
  });

  test('builds with package.json carrying no version, or the same one', async () => {
    expect((await build(tracker(manifestOf('0.2.0'), { 'package.json': JSON.stringify({ name: 'tracker' }) }))).ok).toBe(true);
    expect((await build(tracker(manifestOf('0.2.0'), { 'package.json': JSON.stringify({ name: 'tracker', version: '0.2.0' }) }))).ok).toBe(true);
  });

  test('the templates carry no version in package.json', () => {
    for (const template of ['preact', 'plain']) {
      expect(JSON.parse(readFileSync(join(import.meta.dir, '..', '..', '..', 'templates', template, 'package.json'), 'utf8'))).not.toHaveProperty('version');
    }
  });
});

describe('brydio pack', () => {
  test('lists every file going into the bundle with its size, and the total against the cap, sending nothing', async () => {
    const root = tracker(manifestOf('0.3.0'));
    const lines: string[] = [];
    const code = await pack(root, { out: line => lines.push(line) });
    const text = lines.join('\n');
    const built = await build(root);

    expect(code).toBe(0);
    expect(text).toContain(`tracker 0.3.0: ${built.files.size} files`);

    for (const path of built.files.keys()) expect(text).toContain(`  ${path}`);

    expect(text).toMatch(/Total [\d.]+ KB of the 1\.00 MB a bundle may be \(\d+%\), [\d.]+ KB zipped\./);
    expect(text).toContain(`Fingerprint ${built.hash}`);
    expect(text).toContain('Nothing was sent.');
  });

  test('says why when the app does not build', async () => {
    const root = tracker(manifestOf('0.3.0'), { 'package.json': JSON.stringify({ version: '9.9.9' }) });
    const lines: string[] = [];

    expect(await pack(root, { out: line => lines.push(line) })).toBe(1);
    expect(lines.join('\n')).toContain('[version_mismatch]');
    expect(lines.join('\n')).toContain('Not built, so there is nothing to pack.');
  });
});
