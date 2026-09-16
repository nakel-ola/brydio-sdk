import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { build, publish, sdkVersionFor, zipFiles, type PublishOptions } from '../src/index.ts';

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
  body: Record<string, unknown>;
}

/** What the pretend Brydio says at `GET /apps/sdk`: a range, or a status with nothing behind it. */
type SdkAnswer = { oldest: string; before: string } | number;

/** A pretend publish route that answers with a status and a body, and remembers what it was sent. */
function server(
  status: number,
  body: (sent: Sent) => unknown,
  sdk: SdkAnswer = { oldest: '0.1.0-alpha.0', before: '0.2.0' },
  latest: { version: string; manifest: unknown } | null = null,
) {
  const sent: Sent[] = [];
  const asked: string[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    if (url.endsWith('/api/v1/apps/sdk')) {
      asked.push(new Headers(init.headers).get('authorization') ?? '');

      return typeof sdk === 'number'
        ? new Response(JSON.stringify({ statusCode: sdk }), { status: sdk })
        : new Response(JSON.stringify(sdk), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (url.endsWith('/latest')) {
      asked.push(url);

      return latest ? new Response(JSON.stringify({ appKey: 'x', ...latest }), { status: 200 }) : new Response(JSON.stringify({ statusCode: 404 }), { status: 404 });
    }

    const one = {
      url,
      headers: new Headers(init.headers),
      archive: new Uint8Array(Buffer.from(JSON.parse(String(init.body)).archiveBase64, 'base64')),
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    };

    sent.push(one);

    return new Response(JSON.stringify(body(one)), { status, headers: { 'content-type': 'application/json' } });
  };

  return { sent, asked, fetch };
}

const run = async (
  root: string,
  route: ReturnType<typeof server> | null,
  options: { token?: string; apiUrl?: string; screenshots?: PublishOptions['screenshots'] } = {},
) => {
  const lines: string[] = [];
  const code = await publish(root, {
    apiUrl: options.apiUrl ?? 'http://brydio.test/',
    token: options.token ?? 'session-token',
    out: line => lines.push(line),
    // The pictures are their own tests below; these are about the upload.
    screenshots: 'screenshots' in options ? options.screenshots : false,
    ...(route ? { fetch: route.fetch } : { fetch: () => Promise.reject(new Error('no request expected')) }),
  });

  return { code, text: lines.join('\n') };
};

describe('pictures of each screen at publish (A5-F04-S04)', () => {
  const tree = { root: 'root', nodes: [{ id: 'root', type: 'bry-stack', children: [] }] };
  const created = (hash: string) => ({ created: true, appKey: 'tiny', version: '1.0.0', versionId: 'v', bundleHash: hash, publishedBy: 'u', publishedAt: 'now', files: [] });

  test('sends the rendered trees with the bundle, one per screen, width and theme', async () => {
    const root = tiny();
    const built = await build(root);
    const route = server(201, () => created(built.hash!));
    const pictures = (['narrow', 'wide'] as const).flatMap(width => (['light', 'dark'] as const).map(theme => ({ screen: 'home', width, theme, tree })));
    const { code, text } = await run(root, route, { screenshots: async () => ({ screenshots: pictures, problems: [] }) });

    expect(code).toBe(0);
    expect(text).toContain('Pictured 1 screen(s), 4 pictures.');
    expect(route.sent[0]!.body).toMatchObject({ screenshots: pictures });
  });

  test('stops before uploading when a screen can’t be pictured, naming it', async () => {
    const root = tiny();
    const route = server(201, () => ({}));
    const { code, text } = await run(root, route, {
      screenshots: async () => ({ screenshots: [], problems: [{ screen: 'home', width: 'wide', theme: 'dark', message: 'It drew nothing.' }] }),
    });

    expect(code).toBe(1);
    expect(text).toContain('error   home, wide, dark: It drew nothing. [screenshot_failed]');
    expect(text).toContain('A screen could not be pictured, so nothing was published.');
    expect(route.sent).toEqual([]);
  });

  test('says how to get pictures when @brydio/fake-host can’t be found from the app', async () => {
    const root = tiny();
    const route = server(201, () => ({}));
    const { code, text } = await run(root, route, { screenshots: undefined });

    expect(code).toBe(1);
    expect(text).toContain('bun add -d @brydio/fake-host');
    expect(route.sent).toEqual([]);
  });
});

describe('a schema change against the version Brydio has (A5-F03-S02)', () => {
  const manifest = (version: string, schema: Record<string, unknown>, migrations?: unknown) => ({
    name: 'tracker',
    version,
    data: { issues: { schema, label: 'issue' } },
    screens: { home: { entry: 'screens/home.js' } },
    grants: { tools: ['*'], collections: ['*'] },
    ...(migrations ? { migrations } : {}),
  });
  const V1 = manifest('0.1.0', { title: 'string' });
  const tracker = (next: object) => app({ '.brydio/app.json': JSON.stringify(next), 'src/screens/home.ts': 'export const home = 1;\n' });

  test('refuses before uploading a version whose schema changed with no migration step, naming the field', async () => {
    const root = tracker(manifest('0.2.0', { title: 'string', due: 'date?' }));
    const route = server(201, () => ({}), undefined, { version: '0.1.0', manifest: V1 });
    const { code, text } = await run(root, route);

    expect(code).toBe(1);
    expect(route.asked).toContain('http://brydio.test/api/v1/apps/publish/tracker/latest');
    expect(text).toContain('issues.due is new; add it with a step. (0.2.0 against 0.1.0, the version before it.) [migration_missing]');
    expect(route.sent).toEqual([]);
  });

  test('uploads once the step is declared, and when the app has no version yet', async () => {
    const stepped = tracker(manifest('0.2.0', { title: 'string', due: 'date?' }, [{ version: '0.2.0', steps: [{ op: 'add', collection: 'issues', field: 'due' }] }]));
    const withStep = server(201, () => ({ created: true, appKey: 'tracker', version: '0.2.0', versionId: 'v', bundleHash: 'h', publishedBy: 'u', publishedAt: 'now', files: [] }), undefined, {
      version: '0.1.0',
      manifest: V1,
    });

    expect((await run(stepped, withStep)).code).toBe(0);
    expect(withStep.sent).toHaveLength(1);

    const first = tracker(manifest('0.2.0', { title: 'string', due: 'date?' }));
    const none = server(201, () => ({ created: true, appKey: 'tracker', version: '0.2.0', versionId: 'v', bundleHash: 'h', publishedBy: 'u', publishedAt: 'now', files: [] }));

    expect((await run(first, none)).code).toBe(0);
    expect(none.sent).toHaveLength(1);
  });
});

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

  test('asks which SDKs Brydio runs first, and refuses in the server’s words before uploading', async () => {
    const route = server(201, () => ({}), { oldest: '0.2.0', before: '0.3.0' });
    const { code, text } = await run(tiny(), route);

    expect(code).toBe(1);
    expect(route.asked).toEqual(['Bearer session-token']);
    expect(route.sent).toEqual([]);
    expect(text).toContain(
      `Brydio would refuse this version at sdk: This app was built with SDK ${sdkVersionFor(tmpdir())}. Brydio runs apps built with SDK 0.2.0 or newer, before 0.3.0. [sdk_unsupported]`,
    );
  });

  test('uploads, saying the SDK was not checked, to a Brydio with no SDK route', async () => {
    const route = server(201, () => ({ created: true, appKey: 'tiny', version: '1.0.0', versionId: 'v', bundleHash: 'x', publishedBy: 'u', publishedAt: 't', files: [] }), 404);
    const { code, text } = await run(tiny(), route);

    expect(code).toBe(0);
    expect(route.sent).toHaveLength(1);
    expect(text).toContain('does not check SDK versions yet');
    expect(JSON.parse(new TextDecoder().decode((await import('node:zlib')).inflateRawSync(sliceFirst(route.sent[0]!.archive)))).sdk).toBe(sdkVersionFor(tmpdir()));
  });

  test('stops before building when the SDK route turns the token or the workspace away', async () => {
    const root = tiny();

    expect(await run(root, server(201, () => ({}), 401))).toMatchObject({ code: 1, text: expect.stringContaining('did not accept the token') });
    expect(await run(root, server(201, () => ({}), 423))).toMatchObject({ code: 1, text: expect.stringContaining('Apps are not on') });
    expect(existsSync(join(root, 'dist'))).toBe(false);
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
    expect((await run(tiny(), server(403, () => ({ statusCode: 403 })))).text).toContain('did not accept the token in BRYDIO_TOKEN');
  });

  test('says what Brydio said when a signed-in account may not publish the app, not that the token is bad', async () => {
    const message = 'tiny is published by other accounts. Ask one of them to add you as a publisher.';
    const { code, text } = await run(tiny(), server(403, () => ({ statusCode: 403, reason: 'not_publisher', message })));

    expect(code).toBe(1);
    expect(text).toContain(`Brydio refused this: ${message} [not_publisher]`);
    expect(text).not.toContain('token');
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
    const route = server(201, () => ({}));
    const { code, text } = await run(root, route);

    expect(code).toBe(1);
    expect(route.sent).toEqual([]);
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

/** The deflated bytes of a zip's first entry, which `zipFiles` sorts to `app.json`. */
function sliceFirst(zip: Uint8Array): Uint8Array {
  const view = Buffer.from(zip);
  const size = view.readUInt32LE(18);
  const start = 30 + view.readUInt16LE(26) + view.readUInt16LE(28);

  return view.subarray(start, start + size);
}

