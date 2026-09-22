import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { brydioAnswers, brydioHas, inBrydio } from '../../../test-support/contracts.ts';
import { brandOf, brandProblems, bundleHash, bundleProblem, pngVerdict, toolsProblem, validateManifest } from '../src/index.ts';

/**
 * The owner's two rules (ADR-A20, ADR-A19): a logo and an icon in colour and
 * in one colour, and something for the assistant to call. `src/requirements.ts`
 * is a copy of Brydio's, and these hold the two to the same answers.
 */

const SERVER_REQUIREMENTS = 'apps/api/src/apps/manifest/requirements.ts';
const SERVER_BUNDLE = 'apps/api/src/apps/bundles/bundle-files.ts';

const templates = join(import.meta.dir, '..', '..', '..', 'templates');
const bytes = (text: string) => new TextEncoder().encode(text);

/** The four files the templates ship, by their path in the app. */
const brandFiles = (): Map<string, Uint8Array> =>
  new Map(
    ['logo.svg', 'logo-mono.svg', 'icon.svg', 'icon-mono.svg'].map(name => [
      `brand/${name}`,
      readFileSync(join(templates, 'preact', 'brand', name)),
    ]),
  );

const BRAND = {
  logo: { color: './brand/logo.svg', mono: './brand/logo-mono.svg' },
  icon: { color: './brand/icon.svg', mono: './brand/icon-mono.svg' },
};

/** A PNG of the given RGBA pixels, row by row. */
function pngOf(width: number, height: number, pixel: (x: number, y: number) => number[]): Uint8Array {
  const rows: number[] = [];

  for (let y = 0; y < height; y += 1) {
    rows.push(0);
    for (let x = 0; x < width; x += 1) rows.push(...pixel(x, y));
  }

  const chunk = (kind: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);

    view.setUint32(0, body.length);
    out.set(bytes(kind), 4);
    out.set(body, 8);

    return out;
  };
  const header = new Uint8Array(13);

  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header[8] = 8;
  header[9] = 6;

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(new Uint8Array(rows)))),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((sum, one) => sum + one.length, 0));
  let at = 0;

  for (const one of parts) {
    out.set(one, at);
    at += one.length;
  }

  return out;
}

const glyph = (x: number, y: number) => (x > 16 && x < 48 && y > 16 && y < 48 ? [0, 0, 0, 255] : [0, 0, 0, 0]);

/** Manifests and files on both sides of every rule, for comparing with Brydio's answers. */
const CORPUS: [Record<string, unknown>, Map<string, Uint8Array>][] = (() => {
  const files = brandFiles();

  files.set('brand/two.svg', bytes('<svg viewBox="0 0 48 48"><path fill="#000"/><path fill="#fff"/></svg>'));
  files.set('brand/implicit.svg', bytes('<svg viewBox="0 0 48 48"><path/><path style="fill: red"/></svg>'));
  files.set('brand/glyph.png', pngOf(64, 64, glyph));
  files.set('brand/two.png', pngOf(64, 64, (x, y) => (x > 40 ? [255, 0, 0, 255] : glyph(x, y))));
  files.set('brand/solid.png', pngOf(64, 64, () => [0, 0, 0, 255]));
  files.set('brand/wide.png', pngOf(400, 50, glyph));
  files.set('brand/tall.png', pngOf(50, 100, glyph));
  files.set('brand/script.svg', bytes('<svg viewBox="0 0 48 48"><script>1</script></svg>'));

  const mono = (path: string) => ({ ...BRAND, icon: { color: './brand/icon.svg', mono: path } });

  return [
    [BRAND, files],
    [{}, files],
    [{ icon: './brand/icon.svg' }, files],
    [{ logo: 'x', icon: [] }, files],
    [{ ...BRAND, logo: { color: '../logo.svg', mono: './brand/none.svg' } }, files],
    [mono('./brand/two.svg'), files],
    [mono('./brand/implicit.svg'), files],
    [mono('./brand/glyph.png'), files],
    [mono('./brand/two.png'), files],
    [mono('./brand/solid.png'), files],
    [mono('./brand/script.svg'), files],
    [{ ...BRAND, logo: { color: './brand/wide.png', mono: './brand/tall.png' } }, files],
    [{ ...BRAND, icon: { color: './brand/wide.png', mono: './brand/logo-mono.svg' } }, files],
  ];
})();

const TOOLS: [Record<string, unknown>, { servers?: number; integrations?: number }][] = [
  [{}, {}],
  [{ data: { a: { schema: {} } } }, {}],
  [{ data: { a: { schema: {} } }, tools: { generated: false } }, {}],
  [{ tools: { custom: [{ name: 'x' }] } }, {}],
  [{ tools: { custom: [] } }, {}],
  [{}, { servers: 1 }],
  [{}, { integrations: 2 }],
  [{ requires: { servers: [], integrations: ['billing'] } }, {}],
];

describe('a logo and an icon, in colour and in one colour (ADR-A20)', () => {
  test('the templates pass, and each rule names its field', () => {
    expect(brandProblems(BRAND, brandFiles())).toEqual([]);
    expect(CORPUS.map(([manifest, files]) => brandProblems(manifest, files).map(one => `${one.path} ${one.code}`))).toEqual([
      [],
      ['logo brand_logo_missing', 'icon brand_icon_missing'],
      ['logo brand_logo_missing', 'icon brand_icon_missing'],
      ['logo brand_logo_missing', 'icon brand_icon_missing'],
      ['logo.color brand_path_invalid', 'logo.mono brand_file_missing'],
      ['icon.mono brand_mono_colours'],
      ['icon.mono brand_mono_colours'],
      [],
      ['icon.mono brand_mono_colours'],
      ['icon.mono brand_mono_colours'],
      ['icon.mono brand_file_unreadable'],
      ['logo.color brand_logo_shape', 'logo.mono brand_logo_shape'],
      ['icon.color brand_icon_shape', 'icon.mono brand_icon_shape'],
    ]);
  });

  test('reads a mono PNG pixel by pixel', () => {
    expect(pngVerdict(pngOf(64, 64, glyph))).toBe('one');
    expect(pngVerdict(pngOf(64, 64, (x, y) => (x === 16 ? [0, 0, 0, 100] : glyph(x, y))))).toBe('one');
    expect(pngVerdict(pngOf(64, 64, () => [0, 0, 0, 255]))).toBe('opaque');
  });

  test('keeps the old one-path icon readable, and reads the two-variant one', () => {
    expect(validateManifest({ name: 'a', version: '1.0.0', icon: './icon.png' }).ok).toBe(true);
    expect(validateManifest({ name: 'a', version: '1.0.0', ...BRAND }).manifest).toMatchObject(BRAND);
    expect(validateManifest({ name: 'a', version: '1.0.0', icon: { color: './a.svg' } }).problems[0]).toMatchObject({ code: 'manifest_invalid', path: 'icon' });
  });

  test('carries the brand files in a bundle beside the code, and never in its fingerprint', () => {
    const code = new Map<string, Uint8Array>([
      ['app.json', bytes(JSON.stringify({ name: 'a', version: '1.0.0', ...BRAND }))],
      ['screens/a.js', bytes('export {};')],
    ]);
    const branded = new Map([...code, ...brandFiles()]);

    expect(bundleProblem(branded)).toBeNull();
    expect([...brandOf(branded).keys()].sort()).toEqual(['brand/icon-mono.svg', 'brand/icon.svg', 'brand/logo-mono.svg', 'brand/logo.svg']);
    expect(bundleHash(branded)).toBe(bundleHash(code));
    expect(bundleProblem(new Map([...branded, ['brand/other.png', bytes('x')]]))?.code).toBe('bundle_file_not_code');
  });
});

describe('every app gives the assistant something to call (ADR-A19)', () => {
  test('refuses an app with none of the four, and takes any one of them', () => {
    expect(TOOLS.map(([manifest, parts]) => toolsProblem(manifest, parts)?.code ?? null)).toEqual([
      'app_has_no_tools',
      null,
      'app_has_no_tools',
      null,
      'app_has_no_tools',
      null,
      null,
      null,
    ]);
  });
});

describe('the same answers as Brydio', () => {
  test('for every brand and tool case, word for word', async () => {
    const plain = (files: Map<string, Uint8Array>) => [...files].map(([path, data]) => [path, [...data]] as const);
    const server = await brydioAnswers('requirements', [SERVER_REQUIREMENTS], async () => {
      const theirs = await import(inBrydio(SERVER_REQUIREMENTS));

      return {
        brand: CORPUS.map(([manifest, files]) => theirs.brandProblems(manifest, new Map(plain(files).map(([path, data]) => [path, Buffer.from(data)])))),
        tools: TOOLS.map(([manifest, parts]) => theirs.toolsProblem(manifest, parts)),
      };
    });

    expect(JSON.parse(JSON.stringify(CORPUS.map(([manifest, files]) => brandProblems(manifest, files))))).toEqual(server.brand);
    expect(JSON.parse(JSON.stringify(TOOLS.map(([manifest, parts]) => toolsProblem(manifest, parts))))).toEqual(server.tools);
  });

  test('is the same file as Brydio’s, below its opening comment', async () => {
    const body = (text: string) => text.slice(text.indexOf('export const BRAND_LIMITS'));
    const server = await brydioAnswers('requirements-source', [SERVER_REQUIREMENTS], () => body(readFileSync(inBrydio(SERVER_REQUIREMENTS), 'utf8')));

    expect(body(readFileSync(join(import.meta.dir, '..', 'src', 'requirements.ts'), 'utf8'))).toBe(server);
  });

  test.skipIf(!brydioHas([SERVER_BUNDLE]))('holds a bundle with brand files as the store does', async () => {
    const { checkBundle, bundleHash: theirHash } = await import(inBrydio(SERVER_BUNDLE));
    const files = new Map<string, Buffer>([
      ['app.json', Buffer.from(JSON.stringify({ name: 'a', version: '1.0.0', ...BRAND }))],
      ['screens/a.js', Buffer.from('export {};')],
      ...[...brandFiles()].map(([path, data]) => [path, Buffer.from(data)] as [string, Buffer]),
    ]);

    expect(() => checkBundle(files)).not.toThrow();
    expect(theirHash(files)).toBe(bundleHash(files));
  });
});
