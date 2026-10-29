import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash, createPrivateKey, createPublicKey, verify } from 'node:crypto';

import { BUNDLE_MANIFEST } from '@brydio/manifest';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';
import { BRAND, OWNED } from '../../../test-support/owner-rules.ts';
import { build, publish, sdkVersionFor, signingMessage, writeKeyFile, zipFiles, type PublishOptions } from '../src/index.ts';
import { ADA, ADA_TOKEN, brydioHome, fakeRegistry, localEnv, unzip, type FakeRegistry } from './fake-registry.ts';

const SERVER_PUBLISH = 'apps/api/src/apps/publishing/app-publish.service.ts';
const made: string[] = [];
const registries: FakeRegistry[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const one of registries.splice(0)) one.stop();
});

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-publish-'));

  made.push(root);

  // A logo, an icon and a server beside whatever the test is about.
  for (const [path, content] of Object.entries({ ...OWNED, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return root;
}

const tiny = (version = '1.0.0', extra: Record<string, string> = {}) =>
  app({
    '.brydio/app.json': JSON.stringify({ name: 'tiny', version, ...BRAND, screens: { home: { entry: 'screens/home.js' } } }),
    'src/screens/home.ts': 'export const home = 1;\n',
    ...extra,
  });

function registry(options: Parameters<typeof fakeRegistry>[0] = {}): FakeRegistry {
  const one = fakeRegistry(options);

  registries.push(one);

  return one;
}

/** Publishes with a logged-in home, to the fake registry; the pictures are their own tests below. */
async function run(root: string, reg: FakeRegistry, options: Partial<PublishOptions> & { loggedIn?: boolean } = {}) {
  const lines: string[] = [];
  const { loggedIn = true, ...rest } = options;
  const home = brydioHome(loggedIn ? reg.url : null);

  made.push(home);

  const code = await publish(root, { registry: reg.url, home, env: localEnv(), screenshots: false, out: line => lines.push(line), ...rest });

  return { code, text: lines.join('\n') };
}

const uploads = (reg: FakeRegistry) => reg.received.filter(one => one.method === 'POST' && one.path.endsWith('/versions'));

describe('brydio publish to the registry (PB03)', () => {
  test('builds, validates and uploads the bundle as a zip, logged in, under latest with workspace access', async () => {
    const reg = registry();
    const root = tiny();
    const built = await build(root);
    const { code, text } = await run(root, reg);

    expect(code).toBe(0);
    expect(uploads(reg)).toHaveLength(1);

    const sent = uploads(reg)[0]!;

    expect(sent.path).toBe('/v1/apps/tiny/versions');
    expect(sent.authorization).toBe(`Bearer ${ADA_TOKEN}`);
    expect(Buffer.from(String(sent.body!.archiveBase64), 'base64').equals(Buffer.from(zipFiles(built.files)))).toBe(true);
    // A new app goes to Ada's only publisher, by id, and nothing names an account.
    expect(Object.keys(sent.body!).sort()).toEqual(['archiveBase64', 'publisher', 'tag']);
    expect(sent.body).toMatchObject({ tag: 'latest', publisher: 'pub_acme' });

    expect(text).toContain(`Registry ${reg.url}`);
    expect(text).toContain(`Published tiny 1.0.0 to ${reg.url}.`);
    expect(text).toContain('  Tag          latest');
    expect(text).toContain('  Access       workspace');
    expect(text).toContain("live: your publisher's workspaces can install it now");
    expect(text).toContain(`  Fingerprint  ${built.hash}`);
    expect(text).toContain(`  SDK          ${sdkVersionFor(tmpdir())}`);
    expect(text).not.toContain('not the one worked out here');
    // The line from before pictures were taken is gone.
    expect(text).not.toContain('No pictures of the screens were attached');
    expect(reg.apps.get('tiny')!.tags).toEqual({ latest: '1.0.0' });
  });

  test('--tag beta and --access public go up as given, and a public version waits for review', async () => {
    const reg = registry();
    const { code, text } = await run(tiny(), reg, { tag: 'beta', access: 'public' });

    expect(code).toBe(0);
    expect(uploads(reg)[0]!.body).toMatchObject({ tag: 'beta', access: 'public' });
    expect(text).toContain('under the beta tag with public access');
    expect(text).toContain("pending: it shows in the store once Brydio's review approves it");
    expect(reg.apps.get('tiny')!.tags).toEqual({ beta: '1.0.0' });
  });

  test('a published app keeps its own access when none is given, and ignores --publisher', async () => {
    const reg = registry();

    expect((await run(tiny('1.0.0'), reg, { access: 'public' })).code).toBe(0);

    const { code, text } = await run(tiny('1.1.0'), reg, { publisher: 'Someone else' });

    expect(code).toBe(0);
    expect(uploads(reg)[1]!.body).not.toHaveProperty('access');
    expect(uploads(reg)[1]!.body).not.toHaveProperty('publisher');
    expect(text).toContain('with public access');
    expect(text).toContain('tiny is already published by Acme Ltd (pub_acme), so --publisher is not used');
  });

  test('refuses a bad tag or access, and a computer not logged in, before building or asking anything', async () => {
    const reg = registry();
    const root = tiny();

    expect(await run(root, reg, { tag: 'Beta!' })).toMatchObject({ code: 2, text: expect.stringContaining('"Beta!" is not a tag.') });
    expect(await run(root, reg, { access: 'private' })).toMatchObject({ code: 2, text: expect.stringContaining('--access is workspace') });
    expect(await run(root, reg, { loggedIn: false })).toMatchObject({
      code: 2,
      text: expect.stringContaining(`This computer is not logged in to ${reg.url}. Run brydio login --registry ${reg.url} first.`),
    });
    expect(existsSync(join(root, 'dist'))).toBe(false);
    expect(reg.received).toEqual([]);
  });

  test('asks which publisher a new app belongs to when the account is in several, and turns a name into its id', async () => {
    const reg = registry({
      publishers: [
        { id: 'pub_acme', name: 'Acme Ltd', members: [ADA.id] },
        { id: 'pub_side', name: 'Side Project', members: [ADA.id] },
      ],
    });

    expect(await run(tiny(), reg)).toMatchObject({
      code: 2,
      text: expect.stringContaining('Ada is in more than one publisher. Say which tiny belongs to with --publisher: Acme Ltd (pub_acme), Side Project (pub_side).'),
    });
    expect(await run(tiny(), reg, { publisher: 'Nobody' })).toMatchObject({ code: 1, text: expect.stringContaining('Ada is not in a publisher called "Nobody".') });
    expect(uploads(reg)).toEqual([]);

    expect((await run(tiny(), reg, { publisher: 'side project' })).code).toBe(0);
    expect(uploads(reg)[0]!.body!.publisher).toBe('pub_side');
  });

  test('refuses locally, in the registry’s code, a build below the registry’s SDK minimum', async () => {
    const reg = registry({ sdk: { minimum: '9.0.0' } });
    const { code, text } = await run(tiny(), reg);

    expect(code).toBe(1);
    expect(text).toContain(
      `This app was built with SDK ${sdkVersionFor(tmpdir())}, below 9.0.0, the oldest SDK the registry takes a new version from. Run brydio upgrade-sdk, then publish again. [sdk_below_minimum]`,
    );
    expect(uploads(reg)).toEqual([]);
  });

  test('warns, and still publishes, when a higher minimum is announced', async () => {
    const reg = registry({ sdk: { minimum: '0.0.0', upcoming: { minimum: '9.0.0', from: '2027-01-20' } } });
    const { code, text } = await run(tiny(), reg);

    expect(code).toBe(0);
    expect(text).toContain('From 2027-01-20 the registry takes new versions built with SDK 9.0.0 or newer');
  });

  test('says exactly this version was already published, and succeeds', async () => {
    const reg = registry();

    expect((await run(tiny(), reg)).code).toBe(0);

    const { code, text } = await run(tiny(), reg);

    expect(code).toBe(0);
    expect(text).toContain('tiny 1.0.0 was already published, exactly as it is now. Nothing changed.');
  });

  test('refuses a number taken by a different bundle, in the registry’s words', async () => {
    const reg = registry();

    expect((await run(tiny(), reg)).code).toBe(0);

    const { code, text } = await run(tiny('1.0.0', { 'src/screens/home.ts': 'export const home = 2;\n' }), reg);

    expect(code).toBe(1);
    expect(text).toContain('tiny 1.0.0 is already published with fingerprint');
    expect(text).toContain('[version_exists]');
    expect(text).toContain('A version is never replaced. Give this build a new number with brydio version patch');
  });

  test('refuses a number below the highest published before building, and says the registry’s 409 when it gets one', async () => {
    const reg = registry();

    expect((await run(tiny('2.0.0'), reg)).code).toBe(0);

    const root = tiny('1.5.0');
    const local = await run(root, reg);

    expect(local.code).toBe(1);
    expect(local.text).toContain('tiny 1.5.0 is lower than 2.0.0, the highest version on');
    expect(local.text).toContain('[version_lower]');
    expect(existsSync(join(root, 'dist'))).toBe(false);

    reg.refuseNext('POST', /\/versions$/, 409, { code: 'version_lower', message: '2.1.0 is below 3.0.0.' });
    expect((await run(tiny('2.1.0'), reg)).text).toContain('2.1.0 is below 3.0.0. [version_lower]');
  });

  test('prints a check’s refusal with where it is, and every other status in words', async () => {
    const reg = registry();
    const say = async (status: number, body: unknown) => {
      reg.refuseNext('POST', /\/versions$/, status, body);

      return (await run(tiny(), reg)).text;
    };

    expect(await say(422, { code: 'grant_unknown', message: 'app.json asks for "camera".', at: 'grants.host' })).toContain(
      'The registry refused this version at grants.host: app.json asks for "camera". [grant_unknown]',
    );
    expect(
      await say(422, {
        code: 'grant_unknown',
        message: 'app.json asks for "camera".',
        at: 'grants.host',
        problems: [
          { code: 'grant_unknown', message: 'app.json asks for "camera".', at: 'grants.host' },
          { code: 'secret_in_bundle', message: 'That package contains a secret.' },
        ],
      }),
    ).toContain('  and: That package contains a secret. [secret_in_bundle]');
    expect(await say(403, { code: 'not_publisher', message: 'tiny is published by another publisher.' })).toContain(
      'The registry refused this: tiny is published by another publisher. [not_publisher]',
    );
    expect(await say(423, { code: 'retired', message: 'tiny is retired.' })).toContain('so no new version of it can be published. [retired]');
    expect(await say(401, { code: 'unauthorized' })).toContain("did not accept this computer's login: it was revoked or has run out. Run brydio login");
    expect(await say(413, { code: 'archive_too_large', message: 'That upload is larger than 2 MB.' })).toContain(
      'The registry refused the upload as too large: That upload is larger than 2 MB. [archive_too_large]',
    );
    expect(await say(400, { code: 'archive_unreadable', message: 'Not a zip.' })).toContain('The registry could not read the upload: Not a zip. [archive_unreadable]');
    expect(await say(503, { message: 'Down for a moment.' })).toContain('The registry answered 503: Down for a moment.');
  });

  test('refuses a retired app before building', async () => {
    const reg = registry();

    expect((await run(tiny(), reg)).code).toBe(0);
    reg.apps.get('tiny')!.retired = true;

    const root = tiny('1.1.0');

    expect(await run(root, reg)).toMatchObject({ code: 1, text: expect.stringContaining('tiny is retired on') });
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });

  test('says it could not reach the registry, naming it', async () => {
    const home = brydioHome('http://127.0.0.1:1');

    made.push(home);

    const lines: string[] = [];
    const code = await publish(tiny(), { registry: 'http://127.0.0.1:1', home, env: localEnv(), screenshots: false, out: line => lines.push(line) });

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('Could not reach the registry at http://127.0.0.1:1');
  });

  test('uploads nothing when the app does not build or validate', async () => {
    const reg = registry();
    const root = app({
      '.brydio/app.json': JSON.stringify({ name: 'tiny', version: '1.0.0', ...BRAND, screens: { home: { entry: 'screens/home.js' } } }),
      'src/screens/home.tsx': 'export const Home = () => <bry-stack style={{}} />;\n',
    });
    const { code, text } = await run(root, reg);

    expect(code).toBe(1);
    expect(uploads(reg)).toEqual([]);
    expect(text).toContain('Not built, so not published.');
  });

  test('the registry got exactly the files that were built, and works out the same fingerprint', async () => {
    const reg = registry();
    const root = tiny();
    const built = await build(root);

    expect((await run(root, reg)).code).toBe(0);
    expect([...unzip(new Uint8Array(Buffer.from(String(uploads(reg)[0]!.body!.archiveBase64), 'base64'))).keys()].sort()).toEqual([...built.files.keys()].sort());
    expect(reg.apps.get('tiny')!.versions[0]!.fingerprint).toBe(built.hash!);
  });
});

describe('pictures of each screen at publish (A5-F04-S04)', () => {
  const tree = { root: 'root', nodes: [{ id: 'root', type: 'bry-stack', children: [] }] };

  test('sends the rendered trees with the bundle, one per screen, width and theme', async () => {
    const reg = registry();
    const pictures = (['narrow', 'wide'] as const).flatMap(width => (['light', 'dark'] as const).map(theme => ({ screen: 'home', width, theme, tree })));
    const { code, text } = await run(tiny(), reg, { screenshots: async () => ({ screenshots: pictures, problems: [] }) });

    expect(code).toBe(0);
    expect(text).toContain('Pictured 1 screen(s), 4 pictures.');
    expect(uploads(reg)[0]!.body).toMatchObject({ screenshots: pictures });
  });

  test('stops before uploading when a screen can’t be pictured, naming it', async () => {
    const reg = registry();
    const { code, text } = await run(tiny(), reg, {
      screenshots: async () => ({ screenshots: [], problems: [{ screen: 'home', width: 'wide', theme: 'dark', message: 'It drew nothing.' }] }),
    });

    expect(code).toBe(1);
    expect(text).toContain('error   home, wide, dark: It drew nothing. [screenshot_failed]');
    expect(text).toContain('A screen could not be pictured, so nothing was published.');
    expect(uploads(reg)).toEqual([]);
  });

  test('says how to get pictures when @brydio/fake-host can’t be found from the app', async () => {
    const reg = registry();
    const { code, text } = await run(tiny(), reg, { screenshots: undefined });

    expect(code).toBe(1);
    expect(text).toContain('bun add -d @brydio/fake-host');
    expect(uploads(reg)).toEqual([]);
  });
});

describe('a schema change against the version the registry has (A5-F03-S02)', () => {
  const manifest = (version: string, schema: Record<string, unknown>, migrations?: unknown) => ({
    name: 'tracker',
    version,
    data: { issues: { schema, label: 'issue' } },
    screens: { home: { entry: 'screens/home.js' } },
    grants: { tools: ['*'], collections: ['*'] },
    ...(migrations ? { migrations } : {}),
  });
  const tracker = (next: object) => app({ '.brydio/app.json': JSON.stringify({ ...BRAND, ...next }), 'src/screens/home.ts': 'export const home = 1;\n' });

  test('refuses before uploading a version whose schema changed with no migration step, naming the field', async () => {
    const reg = registry();

    expect((await run(tracker(manifest('0.1.0', { title: 'string' })), reg)).code).toBe(0);

    const { code, text } = await run(tracker(manifest('0.2.0', { title: 'string', due: 'date?' })), reg);

    expect(code).toBe(1);
    expect(reg.received.some(one => one.method === 'GET' && one.path === '/v1/apps/tracker/versions/0.1.0')).toBe(true);
    expect(text).toContain('issues.due is new; add it with a step. (0.2.0 against 0.1.0, the version before it.) [migration_missing]');
    expect(uploads(reg)).toHaveLength(1);
  });

  test('uploads once the step is declared', async () => {
    const reg = registry();

    expect((await run(tracker(manifest('0.1.0', { title: 'string' })), reg)).code).toBe(0);
    expect(
      (await run(tracker(manifest('0.2.0', { title: 'string', due: 'date?' }, [{ version: '0.2.0', steps: [{ op: 'add', collection: 'issues', field: 'due' }] }])), reg)).code,
    ).toBe(0);
    expect(uploads(reg)).toHaveLength(2);
  });
});

describe('the zip', () => {
  test('is the same bytes for the same files, whatever order they come in', () => {
    const a = new Map([
      ['app.json', new TextEncoder().encode('{}')],
      ['screens/a.js', new TextEncoder().encode('x')],
    ]);
    const b = new Map([...a].reverse());

    expect(zipFiles(a)).toEqual(zipFiles(b));
  });

  test('unpacks on the server to exactly the files that were zipped', async () => {
    // Fixed files, so Brydio's answer can be recorded: nested paths, a large
    // script that deflates, an empty one, and the manifest.
    const files = new Map<string, Uint8Array>([
      ['app.json', new TextEncoder().encode('{"name":"tiny","version":"1.0.0"}')],
      ['screens/home.js', new TextEncoder().encode('export const home = "Ünïcode";\n'.repeat(4_000))],
      ['screens/empty.js', new Uint8Array()],
      ['lib/deep/a.mjs', new TextEncoder().encode('export default 1;\n')],
    ]);
    const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    const zipped = zipFiles(files);
    const server = await brydioAnswers('publish-unpack', [SERVER_PUBLISH], async () => {
      const { unpack } = await import(inBrydio(SERVER_PUBLISH));
      const unpacked: Map<string, Uint8Array> = await unpack(Buffer.from(zipped));

      return { zip: digest(zipped), files: Object.fromEntries([...unpacked].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, digest(new Uint8Array(bytes))])) };
    });

    // The zip Brydio unpacked is the one this SDK makes, and it came back file for file.
    expect(digest(zipped)).toBe(server.zip);
    expect(server.files).toEqual(Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => [path, digest(bytes)])));
  });
});

describe('signing a version at publish (A7-F05-S03)', () => {
  /** A fixed key, so what a test signs is the same every run. */
  const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIPUnuBSae5o4IbpSyfELyEjLNOEjcUx1XUvVBvtPEYMc
-----END PRIVATE KEY-----
`;

  /** A key file as `brydio keys create` writes one. */
  function keyFile(over: { mode?: number } = {}): string {
    const home = mkdtempSync(join(tmpdir(), 'brydio-publish-key-'));

    made.push(home);

    const path = join(home, 'key_one.json');

    writeKeyFile(path, {
      keyId: 'key_one',
      publisherId: 'pub_acme',
      publisher: 'Acme Ltd',
      publicKey: createPublicKey(createPrivateKey(PRIVATE_KEY)).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64'),
      privateKey: PRIVATE_KEY,
      label: 'Acme on this computer',
      createdAt: 'then',
    });

    if (over.mode !== undefined) chmodSync(path, over.mode);

    return path;
  }

  test('signs the fingerprint and the manifest with the key file’s key, and sends only the signature', async () => {
    const reg = registry();
    const root = tiny();
    const built = await build(root);
    const { code, text } = await run(root, reg, { key: keyFile() });
    const sent = uploads(reg)[0]!.body!.signature as { keyId: string; value: string };
    const manifest = JSON.parse(new TextDecoder().decode(built.files.get(BUNDLE_MANIFEST)!)) as Record<string, unknown>;
    const publicKey = createPublicKey(createPrivateKey(PRIVATE_KEY));

    expect(code).toBe(0);
    expect(sent.keyId).toBe('key_one');
    // Over exactly the bytes the registry rebuilds: the app, the number, the fingerprint and the manifest.
    expect(verify(null, signingMessage({ appKey: 'tiny', version: '1.0.0', bundleHash: built.hash!, manifest }), publicKey, Buffer.from(sent.value, 'base64'))).toBe(true);
    // Signing a different build does not make this signature.
    expect(verify(null, signingMessage({ appKey: 'tiny', version: '1.0.0', bundleHash: 'b'.repeat(64), manifest }), publicKey, Buffer.from(sent.value, 'base64'))).toBe(false);
    expect(JSON.stringify(uploads(reg)[0]!.body)).not.toContain('PRIVATE KEY');
    expect(text).toContain('Signing as Acme Ltd with "Acme on this computer" (key_one).');
    expect(text).toContain('this version reads Verified');
  });

  test('publishes unsigned with no key, exactly as before', async () => {
    const reg = registry();

    expect((await run(tiny(), reg)).code).toBe(0);
    expect(uploads(reg)[0]!.body).not.toHaveProperty('signature');
  });

  test('stops before building or asking the registry on a key file other accounts can read, and on a key handed over instead of a path', async () => {
    const reg = registry();
    const root = tiny();
    const loose = keyFile({ mode: 0o644 });

    expect(await run(root, reg, { key: loose })).toMatchObject({ code: 2, text: expect.stringContaining('can be read by other accounts on this computer') });
    expect(await run(root, reg, { key: PRIVATE_KEY })).toMatchObject({ code: 2, text: expect.stringContaining('not the key itself') });
    expect(await run(root, reg, { key: join(dirname(loose), 'nothing.json') })).toMatchObject({ code: 2, text: expect.stringContaining('brydio keys create') });
    expect(existsSync(join(root, 'dist'))).toBe(false);
    expect(reg.received).toEqual([]);
  });

  test('says what the registry said about a signature it would not take', async () => {
    const reg = registry();
    const message = 'The key "Old laptop" was retired; sign with an active key.';

    reg.refuseNext('POST', /\/versions$/, 422, { code: 'key_retired', message });

    const { code, text } = await run(tiny(), reg, { key: keyFile() });

    expect(code).toBe(1);
    expect(text).toContain(`The registry refused this version: ${message} [key_retired]`);
  });
});
