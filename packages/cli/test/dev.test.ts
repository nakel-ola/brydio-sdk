import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { DEV_CONFIG, dev, DevRefused, type DevSession } from '../src/index.ts';

const made: string[] = [];
const sessions: DevSession[] = [];
let port = 5300 + Math.floor(Math.random() * 400);

afterEach(async () => {
  for (const session of sessions.splice(0)) await session.stop();
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-dev-'));

  made.push(root);

  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return root;
}

const tiny = () =>
  app({
    '.brydio/app.json': JSON.stringify({
      name: 'tiny',
      version: '1.0.0',
      displayName: 'Tiny',
      placements: [{ kind: 'project-tab', screen: 'home' }],
      screens: { home: { entry: 'screens/home.js' } },
    }),
    'src/screens/home.ts': 'export const home = 1;\n',
  });

interface Call {
  method: string;
  path: string;
  body: any;
}

/** A pretend Brydio: answers by method and path, and remembers every call. */
function brydio(answers: Record<string, (body: any) => [number, unknown]> = {}) {
  const calls: Call[] = [];
  const defaults: Record<string, (body: any) => [number, unknown]> = {
    'GET /api/v1/projects': () => [200, [{ id: 'p_1', name: 'Launch' }, { id: 'p_2', name: 'Bugs' }]],
    'GET /api/v1/extensions?kind=app': () => [200, []],
    'POST /api/v1/extensions/apps': () => [201, { id: 'ext_tiny' }],
    'POST /api/v1/apps/development': body => [201, { id: 'dev_1', instanceId: 'i_1', placementId: 'pl_1', projectId: body.projectId, build: 0 }],
    'POST /api/v1/apps/development/dev_1/heartbeat': body => [200, { build: body.build ?? 0 }],
    'DELETE /api/v1/apps/development/dev_1': () => [204, null],
  };
  const fetch = async (url: string, init: RequestInit) => {
    const path = url.replace('http://brydio.test', '');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const key = `${method} ${path}`;

    calls.push({ method, path, body });

    const answer = answers[key] ?? defaults[key];

    if (!answer) return new Response(JSON.stringify({ message: `no route ${key}` }), { status: 404 });

    const [status, json] = answer(body);

    return new Response(status === 204 ? null : JSON.stringify(json), { status });
  };

  return { calls, fetch };
}

async function run(root: string, server: ReturnType<typeof brydio>, more: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const session = await dev(root, {
    port: port++,
    apiUrl: 'http://brydio.test',
    token: 'tok',
    fetch: server.fetch,
    out: line => void lines.push(line),
    ask: async () => '2',
    watch: false,
    ...more,
  });

  sessions.push(session);

  return { session, lines };
}

describe('brydio dev, signed in', () => {
  test('puts the app on the shelf, asks for the project once, and starts a development tab from this machine', async () => {
    const root = tiny();
    const server = brydio();
    const { session, lines } = await run(root, server);

    expect(server.calls.map(call => `${call.method} ${call.path}`)).toEqual([
      'GET /api/v1/projects',
      'GET /api/v1/extensions?kind=app',
      'POST /api/v1/extensions/apps',
      'POST /api/v1/apps/development',
    ]);

    const started = server.calls.at(-1)!.body;

    expect(started).toMatchObject({ appId: 'ext_tiny', projectId: 'p_2', origin: session.url });
    expect(started.manifest).toMatchObject({ name: 'tiny', screens: { home: { entry: 'screens/home.js' } } });
    expect(session.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(JSON.parse(readFileSync(join(root, DEV_CONFIG), 'utf8'))).toEqual({ apiUrl: 'http://brydio.test', projectId: 'p_2' });
    expect(lines.join('\n')).toContain('/projects/p_2?tab=app-pl_1');

    // The second run remembers the project and finds the app on the shelf.
    await session.stop();
    sessions.splice(0);

    const again = brydio({ 'GET /api/v1/extensions?kind=app': () => [200, [{ id: 'ext_tiny', slug: 'tiny' }]] });

    await run(root, again, { ask: async () => { throw new Error('asked again'); } });

    expect(again.calls.map(call => `${call.method} ${call.path}`)).toEqual([
      'GET /api/v1/extensions?kind=app',
      'POST /api/v1/apps/development',
    ]);
  });

  test('serves the built files, and only them, from localhost with the headers the frame needs', async () => {
    // A5-F02-TC001.
    const { session } = await run(tiny(), brydio());
    const screen = await fetch(`${session.url}/screens/home.js`);

    expect(screen.status).toBe(200);
    expect(screen.headers.get('access-control-allow-origin')).toBe('*');
    expect(screen.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(screen.headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(`${session.url}/../.brydio/app.json`)).status).toBe(404);
    expect((await fetch(`${session.url}/%2e%2e/src/screens/home.ts`)).status).toBe(404);
    expect((await fetch(`${session.url}/screens/missing.js`)).status).toBe(404);
  });

  test('tells Brydio about each good build, with its manifest, and keeps the tab when one fails', async () => {
    const root = tiny();
    const server = brydio();
    const { session, lines } = await run(root, server);

    writeFileSync(join(root, 'src/screens/home.ts'), 'export const home = 2;\n');
    await session.rebuild();

    const beats = server.calls.filter(call => call.path.endsWith('/heartbeat'));

    expect(beats).toHaveLength(1);
    expect(beats[0]!.body).toMatchObject({ build: 1, manifest: { name: 'tiny' } });

    writeFileSync(join(root, 'src/screens/home.ts'), 'export const home = ;\n');
    await session.rebuild();

    expect(server.calls.filter(call => call.path.endsWith('/heartbeat'))).toHaveLength(1);
    expect(lines.join('\n')).toContain('the tab keeps the last good build');

    writeFileSync(join(root, 'src/screens/home.ts'), 'export const home = 3;\n');
    await session.rebuild();

    expect(server.calls.filter(call => call.path.endsWith('/heartbeat')).at(-1)!.body.build).toBe(2);
  });

  test('says what Brydio said about a build it turned down', async () => {
    const root = tiny();
    const server = brydio({
      'POST /api/v1/apps/development/dev_1/heartbeat': () => [422, { message: 'app.json: "screens": needs at least one screen.' }],
    });
    const { session, lines } = await run(root, server);

    await session.rebuild();

    expect(lines.join('\n')).toContain('Brydio didn\'t take this build: app.json: "screens": needs at least one screen.');
  });

  test('removes the tab when stopped', async () => {
    const server = brydio();
    const { session } = await run(tiny(), server);

    await session.stop();

    expect(server.calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/v1/apps/development/dev_1' });
    expect(session.development).toBeNull();
  });

  test('stops, in Brydio\'s words, where adding apps is not allowed or Apps are off', async () => {
    const forbidden = brydio({
      'POST /api/v1/apps/development': () => [403, { message: 'Only an admin can install apps in this workspace.' }],
    });

    await expect(run(tiny(), forbidden, { projectId: 'p_1' })).rejects.toThrow(
      new DevRefused('Only an admin can install apps in this workspace.'),
    );

    const off = brydio({ 'GET /api/v1/extensions?kind=app': () => [423, { message: 'Locked' }] });

    await expect(run(tiny(), off, { projectId: 'p_1' })).rejects.toThrow(/Apps aren't switched on/);
  });
});

describe('brydio dev, not signed in', () => {
  test('only serves and builds, and says how to see it as a tab', async () => {
    const lines: string[] = [];
    const root = tiny();
    const session = await dev(root, { port: port++, apiUrl: '', token: '', out: line => void lines.push(line), watch: false });

    sessions.push(session);

    expect(session.development).toBeNull();
    expect(existsSync(join(root, DEV_CONFIG))).toBe(false);
    expect(lines.join('\n')).toContain('set BRYDIO_API_URL and BRYDIO_TOKEN');
  });
});
