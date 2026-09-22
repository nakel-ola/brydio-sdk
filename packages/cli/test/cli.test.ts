import { bundleHash } from '@brydio/manifest';
import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { BRAND, BRAND_PATHS, OWNED } from '../../../test-support/owner-rules.ts';
import { build, main, sdkVersionFor, validate } from '../src/index.ts';

const template = join(import.meta.dir, '..', '..', '..', 'templates', 'preact');
const made: string[] = [];

/** A throwaway app folder with these files in it, and a logo, an icon and a server beside them. */
function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-cli-'));

  made.push(root);

  for (const [path, content] of Object.entries({ ...OWNED, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return root;
}

const manifest = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name: 'tiny', version: '1.0.0', ...BRAND, screens: { home: { entry: 'screens/home.js' } }, ...extra });

const codes = (problems: { code: string }[]) => problems.map(problem => problem.code);
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('brydio build', () => {
  test('builds every screen of the template to one module under dist/, with app.json beside it', async () => {
    const result = await build(template);

    expect(result.problems).toEqual([]);
    expect([...result.files.keys()].sort()).toEqual(['app.json', ...BRAND_PATHS, 'screens/home.js']);

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
    expect([...result.files.keys()].sort()).toEqual(['app.json', ...BRAND_PATHS, 'screens/home.mjs']);
    expect(validate(root)).toEqual({ ok: true, problems: [] });
  });

  test('refuses to build a screen validate would refuse, before bundling it', async () => {
    const root = app({ '.brydio/app.json': manifest(), 'src/screens/home.tsx': 'export const Home = () => <bry-stack gap="9" />;\n' });
    const result = await build(root);

    expect(result.ok).toBe(false);
    expect(result.problems.map(problem => [problem.file, problem.line, problem.code])).toEqual([['src/screens/home.tsx', 1, 'prop_value_invalid']]);
    expect(result.files.size).toBe(0);
  });

  test('refuses a screen that brings in CSS or HTML, naming what it brought', async () => {
    const root = app({
      '.brydio/app.json': manifest(),
      'src/screens/home.ts': "import './home.css';\nexport const home = 1;\n",
      'src/screens/home.css': 'p { color: red; }\n',
    });
    const result = await build(root);

    expect(codes(result.problems)).toEqual(['bundle_file_not_code']);
    expect(result.problems[0]!.message).toContain('"screen.css"');
  });

  test('writes the @brydio/app version it built against into dist/app.json as sdk', async () => {
    const appVersion = JSON.parse(readFileSync(join(import.meta.dir, '../../app/package.json'), 'utf8')).version;
    const result = await build(template);

    expect(sdkVersionFor(template)).toBe(appVersion);
    expect(JSON.parse(readFileSync(join(template, 'dist/app.json'), 'utf8')).sdk).toBe(appVersion);
    expect(JSON.parse(readFileSync(join(template, '.brydio/app.json'), 'utf8')).sdk).toBeUndefined();
    expect(result.hash).toBe(bundleHash(result.files));
    expect(validate(template)).toEqual({ ok: true, problems: [] });
  });

  test('overwrites an sdk written by hand, and says so', async () => {
    const root = app({ '.brydio/app.json': manifest({ sdk: '9.9.9' }), 'src/screens/home.ts': 'export const home = 1;\n' });
    const result = await build(root);

    expect(result.ok).toBe(true);
    expect(result.problems).toMatchObject([{ code: 'manifest_sdk_overwritten', severity: 'warning', path: 'sdk' }]);
    expect(JSON.parse(readFileSync(join(root, 'dist/app.json'), 'utf8')).sdk).toBe(sdkVersionFor(root));
    expect(sdkVersionFor(root)).not.toBe('9.9.9');
  });

  test('is reproducible: the same source builds to the same fingerprint twice', async () => {
    const first = await build(template);
    const second = await build(template);

    expect(second.hash).toBe(first.hash!);
    expect([...second.files]).toEqual([...first.files]);
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

  test('catches a custom tool whose handler was never built, and passes once it is', () => {
    const tools = {
      generated: false,
      custom: [{ name: 'close_issue', description: 'Closes one.', handler: 'handlers/close_issue.js', write: true }],
    };
    const built = { '.brydio/app.json': manifest({ tools, grants: { tools: ['close_issue'], collections: [] } }) };
    const missing = app({ ...built, 'dist/app.json': manifest({ tools, grants: { tools: ['close_issue'], collections: [] } }), 'dist/screens/home.js': 'export {};' });

    expect(codes(validate(missing).problems)).toEqual(['handler_not_built']);
    expect(validate(missing).problems[0]).toMatchObject({
      path: 'tools.custom.0.handler',
      message: 'The "close_issue" tool runs "handlers/close_issue.js", which is not a script in this bundle. Run brydio build.',
    });

    const shipped = app({
      ...built,
      'dist/app.json': manifest({ tools, grants: { tools: ['close_issue'], collections: [] } }),
      'dist/screens/home.js': 'export {};',
      'dist/handlers/close_issue.js': 'export default async () => ({ ok: true });',
    });

    expect(validate(shipped)).toEqual({ ok: true, problems: [] });
  });

  test('passes with warnings, and fails only on errors', async () => {
    const root = app({ '.brydio/app.json': manifest(), 'src/screens/home.ts': 'export const home = 1;\n' });

    await build(root);
    writeFileSync(join(root, '.brydio/app.json'), manifest({ displayName: 'Tiny' }));

    expect(validate(root)).toMatchObject({ ok: true, problems: [{ code: 'bundle_stale', severity: 'warning' }] });
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
      [5, 'style_forbidden'],
      [6, 'style_forbidden'],
      [6, 'dom_global'],
      [10, 'network_global'],
    ]);
  });
});

describe('brydio test', () => {
  test('builds the app, then runs its tests against the build, saying which build', async () => {
    const root = app({ '.brydio/app.json': manifest(), 'src/screens/home.ts': 'export const home = 1;\n' });

    mkdirSync(join(root, 'test'));
    writeFileSync(
      join(root, 'test/home.test.ts'),
      [
        "import { expect, test } from 'bun:test';",
        "import { existsSync } from 'node:fs';",
        "test('sees the build', () => {",
        "  expect(existsSync('dist/screens/home.js')).toBe(true);",
        `  expect(process.env.BRYDIO_TEST_BUILT).toBe(${JSON.stringify(root)});`,
        '});',
      ].join('\n'),
    );
    const lines: string[] = [];

    expect(await main(['test', root], line => lines.push(line))).toBe(0);
    expect(lines.join('\n')).toContain('1 pass');
  });

  test('answers 1 when a test fails, and passes words after -- to bun test', async () => {
    const root = app({
      '.brydio/app.json': manifest(),
      'src/screens/home.ts': 'export const home = 1;\n',
      'test/home.test.ts': "import { expect, test } from 'bun:test';\ntest('right', () => {});\ntest('wrong', () => expect(1).toBe(2));\n",
    });
    const lines: string[] = [];

    expect(await main(['test', root], line => lines.push(line))).toBe(1);
    expect(await main(['test', root, '--', '--test-name-pattern', 'right'], line => lines.push(line))).toBe(0);
  });

  test('runs the template’s own tests, which use the fake host', async () => {
    const lines: string[] = [];

    expect(await main(['test', template], line => lines.push(line))).toBe(0);
    expect(lines.join('\n')).toMatch(/[1-9]\d* pass[\s\S]*\b0 fail/);
  });

  test('runs no test when the app does not build', async () => {
    const root = app({
      '.brydio/app.json': manifest(),
      'src/screens/home.tsx': 'export const Home = () => <div />;\n',
      'test/home.test.ts': "import { test } from 'bun:test';\ntest('never', () => { throw new Error('ran'); });\n",
    });
    const lines: string[] = [];

    expect(await main(['test', root], line => lines.push(line))).toBe(1);
    expect(lines.join('\n')).toContain('Not built, so not tested.');
    expect(lines.join('\n')).not.toContain('ran');
  });
});

test('the command line answers with an exit code and says what it did', async () => {
  const lines: string[] = [];

  expect(await main(['build', template], line => lines.push(line))).toBe(0);
  expect(lines.join('\n')).toMatch(/Fingerprint [0-9a-f]{64}/);
  expect(lines.join('\n')).toContain(`screens/home.js  ${(readFileSync(join(template, 'dist/screens/home.js')).length / 1024).toFixed(1)} KB  sha256 ${sha(readFileSync(join(template, 'dist/screens/home.js')))}`);
  expect(await main(['validate', template], line => lines.push(line))).toBe(0);
  expect(await main(['nonsense'], line => lines.push(line))).toBe(2);
});
