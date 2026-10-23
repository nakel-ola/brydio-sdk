import { bundleProblem, frameWarnings, validateManifest } from '@brydio/manifest';
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { BRAND, OWNED } from '../../../test-support/owner-rules.ts';
import { framePort, inFrameScreen } from '../../app/src/port.ts';
import { build, validate } from '../src/index.ts';
import { pack } from '../src/pack.ts';

/**
 * Frame screens (`tasks/app-publishing` PB27) on the builder's machine: the
 * manifest says which screens are frames, `brydio build` copies the page and
 * the assets and builds the script beside it, `brydio pack` counts the assets
 * apart, `brydio validate` warns about a password field, and the SDK's
 * bridge speaks to the window above from a page.
 */

const made: string[] = [];

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-frame-'));

  made.push(root);
  for (const [path, content] of Object.entries({ ...OWNED, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return root;
}

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

const MANIFEST = { name: 'framed', version: '1.0.0', ...BRAND, screens: { settings: { kind: 'frame', entry: 'screens/settings.html' } } };
const PAGE = '<!doctype html><html><head><link rel="stylesheet" href="../assets/app.css"></head><body><h1>Hi</h1><script type="module" src="./settings.js"></script></body></html>';

describe('a frame screen in the manifest', () => {
  test('is a frame with an .html page; anything else is refused with its code', () => {
    expect(validateManifest(MANIFEST).problems).toEqual([]);
    expect(validateManifest({ ...MANIFEST, screens: { settings: { entry: 'screens/settings.html' } } }).problems.map(one => one.code)).toEqual(['screen_kind_entry']);
  });
});

describe('brydio build, pack and validate with a frame screen', () => {
  test('copy the page and the assets, build the script beside it, and count the assets apart', async () => {
    const root = app({
      '.brydio/app.json': JSON.stringify(MANIFEST),
      'src/screens/settings.html': PAGE,
      'src/screens/settings.ts': "import { connect } from '@brydio/app';\nawait connect();\ndocument.querySelector('h1')!.textContent = 'Ready';\n",
      'src/assets/app.css': 'h1 { color: var(--fg) }',
      'src/assets/font.woff2': 'not kept',
    });

    // Resolves `@brydio/app` as an app made by `brydio create` does.
    symlinkSync(join(import.meta.dir, '..', '..', '..', 'templates', 'preact', 'node_modules'), join(root, 'node_modules'));
    const result = await build(root);

    expect(result.problems.filter(one => one.severity === 'error')).toEqual([]);
    expect([...result.files.keys()].filter(path => !path.startsWith('brand/')).sort()).toEqual(['app.json', 'assets/app.css', 'screens/settings.html', 'screens/settings.js']);

    const said: string[] = [];

    expect(await pack(root, { out: line => void said.push(line) })).toBe(0);
    expect(said.find(line => line.startsWith('Frame screens'))).toMatch(/^Frame screens' pages, styles, images and media: .* of the 4\.00 MB they may be/);
    expect(validate(root).ok).toBe(true);
  });

  test('warn about a password field', async () => {
    const root = app({
      '.brydio/app.json': JSON.stringify(MANIFEST),
      'src/screens/settings.html': '<form><input type="password"></form>',
    });

    await build(root);
    expect(validate(root).problems.filter(one => one.code === 'frame_password_field').map(one => one.severity)).toEqual(['warning']);
    expect(frameWarnings(MANIFEST, new Map([['screens/settings.html', new TextEncoder().encode('<input type=password>')]]))[0]!.code).toBe('frame_password_field');
  });

  test('keep pages, styles and pictures out of a bundle with no frame screen', () => {
    const files = new Map([
      ['app.json', new TextEncoder().encode(JSON.stringify({ name: 'plain', version: '1.0.0', screens: { home: { entry: 'screens/home.js' } } }))],
      ['screens/home.js', new TextEncoder().encode('')],
      ['assets/app.css', new TextEncoder().encode('')],
    ]);

    expect(bundleProblem(files)?.message).toBe('"assets/app.css" is not a script. A bundle holds only .js files and app.json.');
  });
});

describe('the bridge in a frame screen', () => {
  test('talks to the window above, and hears only it', () => {
    const above = { posted: [] as unknown[], postMessage(message: unknown, target: string) { this.posted.push([message, target]); } };
    const listeners: ((event: { data: unknown; source: unknown }) => void)[] = [];
    const scope = {
      parent: above,
      document: {},
      addEventListener: (_: string, listener: (event: { data: unknown; source: unknown }) => void) => void listeners.push(listener),
      removeEventListener: () => undefined,
    };
    const heard: unknown[] = [];
    const port = framePort(scope);

    expect(inFrameScreen(scope as never)).toBe(true);
    port.post({ jsonrpc: '2.0', method: 'worker/ready' } as never);
    port.listen(message => void heard.push(message));
    listeners.forEach(listener => listener({ data: 'from above', source: above }));
    listeners.forEach(listener => listener({ data: 'from elsewhere', source: {} }));

    expect(above.posted).toEqual([[{ jsonrpc: '2.0', method: 'worker/ready' }, '*']]);
    expect(heard).toEqual(['from above']);
    expect(inFrameScreen({} as never)).toBe(false);
  });
});
