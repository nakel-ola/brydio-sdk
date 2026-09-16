import { bundleHash } from '@brydio/manifest';
import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { build, checkSource, main, validate } from '../src/index.ts';

const template = join(import.meta.dir, '..', '..', '..', 'templates', 'preact');
const made: string[] = [];

/** A throwaway app folder with these files in it. */
function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-cli-'));

  made.push(root);

  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return root;
}

const manifest = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name: 'tiny', version: '1.0.0', screens: { home: { entry: 'screens/home.js' } }, ...extra });

const codes = (problems: { code: string }[]) => problems.map(problem => problem.code);
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('brydio build', () => {
  test('builds every screen of the template to one module under dist/, with app.json beside it', async () => {
    const result = await build(template);

    expect(result.problems).toEqual([]);
    expect([...result.files.keys()].sort()).toEqual(['app.json', 'screens/home.js']);

    const code = readFileSync(join(template, 'dist/screens/home.js'), 'utf8');

    // One whole module: nothing left to import in a worker that can fetch nothing.
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).toContain('brydio-tree/1');
    expect(JSON.parse(readFileSync(join(template, 'dist/app.json'), 'utf8')).name).toBe('checklist');
  });

  test('prints the fingerprint the server will compute: code files only, by the recipe', async () => {
    const result = await build(template);
    const home = readFileSync(join(template, 'dist/screens/home.js'));

    expect(result.hash).toBe(sha(`screens/home.js\0${sha(home)}\n`));
    expect(result.hash).toBe(bundleHash(result.files));
  });

  test('refuses a bundle over 1 MB, naming the largest file', async () => {
    const root = app({
      '.brydio/app.json': manifest(),
      'src/screens/home.ts': `export const padding = ${JSON.stringify('x'.repeat(1_100_000))};\n`,
    });
    const result = await build(root, { minify: false });

    expect(result.ok).toBe(false);
    expect(codes(result.problems)).toEqual(['bundle_too_large']);
    expect(result.problems[0]!.message).toContain('"screens/home.js"');
  });

  test('says which screen has no source, and which did not build', async () => {
    const missing = await build(app({ '.brydio/app.json': manifest() }));

    expect(codes(missing.problems)).toEqual(['screen_source_missing']);

    const broken = await build(app({ '.brydio/app.json': manifest(), 'src/screens/home.ts': "import './nowhere.ts';\n" }));

    expect(codes(broken.problems)).toEqual(['screen_build_failed']);
  });

  test('builds and validates a screen whose entry is .mjs, from the source of the same name', async () => {
    const root = app({
      '.brydio/app.json': manifest({ screens: { home: { entry: 'screens/home.mjs' } } }),
      'src/screens/home.ts': 'export const home = 1;\n',
    });
    const result = await build(root);

    expect(result.problems).toEqual([]);
    expect([...result.files.keys()].sort()).toEqual(['app.json', 'screens/home.mjs']);
    expect(validate(root)).toEqual({ ok: true, problems: [] });
  });

  test('refuses a manifest the server would refuse, with the server’s code', async () => {
    const result = await build(app({ '.brydio/app.json': manifest({ placements: [{ kind: 'project-tab', screen: 'nowhere' }] }) }));

    expect(codes(result.problems)).toEqual(['placement_screen_unknown']);
  });
});

describe('brydio validate', () => {
  test('passes the built template', async () => {
    await build(template);

    expect(validate(template)).toEqual({ ok: true, problems: [] });
  });

  test('catches a bundle that was never built, and a screen missing from it', () => {
    expect(codes(validate(app({ '.brydio/app.json': manifest() })).problems)).toEqual(['bundle_not_built']);

    const root = app({
      '.brydio/app.json': manifest({ screens: { home: { entry: 'screens/home.js' }, other: { entry: 'screens/other.js' } } }),
      'dist/app.json': manifest(),
      'dist/screens/home.js': 'export {};',
    });

    expect(codes(validate(root).problems)).toEqual(['screen_not_built', 'bundle_stale']);
  });

  test('catches what the store refuses: a file that is not a script, and more than 1 MB', () => {
    const css = app({ '.brydio/app.json': manifest(), 'dist/app.json': manifest(), 'dist/screens/home.js': '', 'dist/screens/home.css': '' });

    expect(codes(validate(css).problems)).toEqual(['bundle_file_not_code']);

    const big = app({ '.brydio/app.json': manifest(), 'dist/app.json': manifest(), 'dist/screens/home.js': 'x'.repeat(1_048_577) });

    expect(codes(validate(big).problems)).toEqual(['bundle_too_large']);
  });

  test('catches an invalid manifest, naming where', () => {
    const result = validate(app({ '.brydio/app.json': JSON.stringify({ name: 'Tiny App', version: '1' }) }));

    expect(result.ok).toBe(false);
    expect(result.problems.map(problem => problem.path)).toEqual(['name', 'version']);
  });

  test('reads the source for elements, settings, styles and a page that is not there', () => {
    const root = app({
      '.brydio/app.json': manifest(),
      'dist/app.json': manifest(),
      'dist/screens/home.js': '',
      'src/screens/home.tsx': [
        "import { mount } from '@brydio/app/preact';",
        'const Home = () => (',
        '  <bry-stack gap="9">',
        '    <div />',
        '    <bry-text text="Hi" colour="red" />',
        "    <bry-card className=\"box\" onPress={() => document.title = 'x'} />",
        '    <bry-heading text={title} level={2} />',
        '  </bry-stack>',
        ');',
        "fetch('https://example.com');",
        'mount(Home);',
      ].join('\n'),
    });

    expect(validate(root).problems.map(problem => [problem.line, problem.code])).toEqual([
      [3, 'prop_value_invalid'],
      [4, 'element_unknown'],
      [5, 'prop_unknown'],
      [6, 'style_forbidden'],
      [6, 'dom_global'],
      [10, 'dom_global'],
    ]);
  });

  test('checkSource: h() with an unknown element, a handler for an event the element lacks', () => {
    expect(codes(checkSource('a.ts', "h('span', null);"))).toEqual(['element_unknown']);
    expect(codes(checkSource('a.tsx', '<bry-text text="x" onPress={go} />'))).toEqual(['event_unknown']);
    expect(checkSource('a.tsx', 'const x = useState<string>(""); if (a <b) {}')).toEqual([]);
  });
});

test('the command line answers with an exit code and says what it did', async () => {
  const lines: string[] = [];

  expect(await main(['build', template], line => lines.push(line))).toBe(0);
  expect(lines.join('\n')).toMatch(/Fingerprint [0-9a-f]{64}/);
  expect(await main(['validate', template], line => lines.push(line))).toBe(0);
  expect(await main(['nonsense'], line => lines.push(line))).toBe(2);
});
