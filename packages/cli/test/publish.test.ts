import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { build, publish, zipFiles } from '../src/index.ts';

const brydio = process.env.BRYDIO_DIR ?? join(import.meta.dir, '..', '..', '..', '..', 'brydio');
const serverPublish = join(brydio, 'apps/api/src/apps/publishing/app-publish.service.ts');
const made: string[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-publish-'));

  made.push(root);

  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return root;
}

const tiny = () =>
  app({
    '.brydio/app.json': JSON.stringify({ name: 'tiny', version: '1.0.0', screens: { home: { entry: 'screens/home.js' } } }),
    'src/screens/home.ts': 'export const home = 1;\n',
  });

interface Sent {
  url: string;
  headers: Headers;
  archive: Uint8Array;
}

/** A pretend publish route that answers with a status and a body, and remembers what it was sent. */
function server(status: number, body: (sent: Sent) => unknown) {
  const sent: Sent[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    const one = {
      url,
      headers: new Headers(init.headers),
      archive: new Uint8Array(Buffer.from(JSON.parse(String(init.body)).archiveBase64, 'base64')),
    };

    sent.push(one);

    return new Response(JSON.stringify(body(one)), { status, headers: { 'content-type': 'application/json' } });
  };

  return { sent, fetch };
}

const run = async (root: string, route: ReturnType<typeof server> | null, options: { token?: string; apiUrl?: string } = {}) => {
  const lines: string[] = [];
  const code = await publish(root, {
    apiUrl: options.apiUrl ?? 'http://brydio.test/',
    token: options.token ?? 'session-token',
    out: line => lines.push(line),
    ...(route ? { fetch: route.fetch } : { fetch: () => Promise.reject(new Error('no request expected')) }),
  });

  return { code, text: lines.join('\n') };
};

describe('brydio publish', () => {
  test('builds, validates, and uploads the bundle as a zip, signed in with the token', async () => {
    const root = tiny();
    const built = await build(root);
    const route = server(201, () => ({
      created: true,
      appKey: 'tiny',
      version: '1.0.0',
      versionId: 'version_1',
      bundleHash: built.hash,
      publishedBy: 'user_1',
      publishedAt: '2026-09-16T14:30:00.000Z',
      files: [`/api/v1/apps/bundles/${built.hash}/screens/home.js`],
    }));
    const { code, text } = await run(root, route);

    expect(code).toBe(0);
    expect(route.sent).toHaveLength(1);
    expect(route.sent[0]!.url).toBe('http://brydio.test/api/v1/apps/publish');
    expect(route.sent[0]!.headers.get('authorization')).toBe('Bearer session-token');
    expect(route.sent[0]!.archive).toEqual(zipFiles(built.files));
    expect(text).toContain('Published tiny 1.0.0.');
    expect(text).toContain(`http://brydio.test/api/v1/apps/bundles/${built.hash}/screens/home.js`);
    expect(text).not.toContain('not the one worked out here');
  });

  test('says so, and succeeds, when exactly this version was already published', async () => {
    const route = server(200, () => ({ created: false, appKey: 'tiny', version: '1.0.0', versionId: 'v', bundleHash: 'x', publishedBy: 'u', publishedAt: 't', files: [] }));
    const { code, text } = await run(tiny(), route);

    expect(code).toBe(0);
    expect(text).toContain('tiny 1.0.0 was already published, exactly as it is now.');
  });

  test('refuses a version number the server already has, in the server’s words', async () => {
    const message = 'tiny 1.0.0 was already published with fingerprint aaa; this is bbb. A version is never replaced.';
    const route = server(409, () => ({ statusCode: 409, reason: 'version_exists', message }));
    const { code, text } = await run(tiny(), route);

    expect(code).toBe(1);
    expect(text).toContain(message);
    expect(text).toContain('new version number');
  });

  test('prints what the server refused, and where', async () => {
    const route = server(422, () => ({ statusCode: 422, reason: 'grant_unknown', message: 'app.json asks for "camera".', at: 'grants.host' }));
    const { code, text } = await run(tiny(), route);

    expect(code).toBe(1);
    expect(text).toContain('Brydio refused this version at grants.host: app.json asks for "camera". [grant_unknown]');
  });

  test('explains a Brydio with no publish route, Apps off, and a token it did not take', async () => {
    expect((await run(tiny(), server(404, () => ({ statusCode: 404 })))).text).toContain('has no publish route');
    expect((await run(tiny(), server(423, () => ({ statusCode: 423 })))).text).toContain('Apps are not on');
    expect((await run(tiny(), server(401, () => ({ statusCode: 401 })))).text).toContain('did not accept the token in BRYDIO_TOKEN');
  });

  test('asks for the sign-in and the address before building anything', async () => {
    const root = tiny();

    expect(await run(root, null, { token: '' })).toMatchObject({ code: 2, text: expect.stringContaining('BRYDIO_TOKEN') });
    expect(await run(root, null, { apiUrl: 'brydio.test' })).toMatchObject({ code: 2, text: expect.stringContaining('BRYDIO_API_URL') });
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });

  test('uploads nothing when the app does not build or validate', async () => {
    const root = app({
      '.brydio/app.json': JSON.stringify({ name: 'tiny', version: '1.0.0', screens: { home: { entry: 'screens/home.js' } } }),
      'src/screens/home.tsx': 'export const Home = () => <bry-stack style={{}} />;\n',
    });
    const { code, text } = await run(root, null);

    expect(code).toBe(1);
    expect(text).toContain('Not built, so not published.');
  });
});

describe('the zip', () => {
  test('is the same bytes for the same files, whatever order they come in', () => {
    const a = new Map([['app.json', new TextEncoder().encode('{}')], ['screens/a.js', new TextEncoder().encode('x')]]);
    const b = new Map([...a].reverse());

    expect(zipFiles(a)).toEqual(zipFiles(b));
  });

  test.skipIf(!existsSync(serverPublish))('unpacks on the server to exactly the files that were built', async () => {
    const { unpack } = await import(serverPublish);
    const built = await build(join(import.meta.dir, '..', '..', '..', 'templates', 'preact'));
    const unpacked: Map<string, Uint8Array> = await unpack(Buffer.from(zipFiles(built.files)));

    expect([...unpacked.keys()].sort()).toEqual([...built.files.keys()].sort());

    for (const [path, bytes] of built.files) expect(new Uint8Array(unpacked.get(path)!)).toEqual(new Uint8Array(bytes));
  });
});
