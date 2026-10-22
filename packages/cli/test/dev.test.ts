import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { BUILD_PATH, create, dev, DevRefused, main, type DevSession } from '../src/index.ts';

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
      placements: [{ kind: 'project-widget', screen: 'home', sizes: ['large'] }],
      screens: { home: { entry: 'screens/home.js' } },
    }),
    'src/screens/home.ts': 'export const home = 1;\n',
  });

async function run(root: string, more: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const session = await dev(root, { port: port++, out: line => void lines.push(line), watch: false, ...more });

  sessions.push(session);

  return { session, lines };
}

const served = async (session: DevSession) => (await (await fetch(`${session.url}${BUILD_PATH}`)).json()) as Record<string, any>;

describe('brydio dev with no token (PB09)', () => {
  test('makes no network call at all: it only builds and serves', async () => {
    const real = globalThis.fetch;
    const asked: string[] = [];

    // Any request this process starts on its own is a call to somewhere.
    globalThis.fetch = (async (url: string | URL | Request) => {
      asked.push(String(url));
      throw new Error('brydio dev must not call anything');
    }) as unknown as typeof fetch;

    try {
      const root = tiny();
      const { session, lines } = await run(root);

      writeFileSync(join(root, 'src/screens/home.ts'), 'export const home = 2;\n');
      await session.rebuild();
      await session.stop();
      sessions.splice(0);

      expect(asked).toEqual([]);
      expect(lines.join('\n')).toContain('Nothing here talks to Brydio or needs a key');
    } finally {
      globalThis.fetch = real;
    }
  });

  test('reads no BRYDIO_TOKEN or BRYDIO_API_URL, and its source names neither', async () => {
    const source = await Bun.file(join(import.meta.dir, '..', 'src', 'dev.ts')).text();

    expect(source).not.toMatch(/BRYDIO_TOKEN|BRYDIO_API_URL|process\.env/);
  });

  test('says how to load it in Brydio: Settings > Developer > Load from localhost, with its port', async () => {
    const { session, lines } = await run(tiny());
    const said = lines.join('\n');

    expect(said).toContain(`Serving dist/ at ${session.url}.`);
    expect(said).toContain(`in Settings > Developer choose Load from localhost, port ${new URL(session.url).port}, and a project you own.`);
    expect(said).toContain('never touches an installed copy of the app or its secrets');
  });

  test('serves what the browser relays: the build number, the manifest and the handlers', async () => {
    const root = app({
      '.brydio/app.json': JSON.stringify({
        name: 'tooled',
        version: '1.0.0',
        displayName: 'Tooled',
        placements: [{ kind: 'project-sidebar', screen: 'home' }],
        screens: { home: { entry: 'screens/home.js' } },
        tools: { custom: [{ name: 'whoami', description: 'Who is using the app.', handler: 'handlers/whoami.js', input: {} }] },
        grants: { tools: ['whoami'] },
      }),
      'src/screens/home.ts': 'export const home = 1;\n',
      'src/handlers/whoami.ts': 'export default async (_input: unknown, { caller }: { caller: { userId: string } }) => ({ member: caller.userId });\n',
    });
    const { session } = await run(root);
    const answer = await fetch(`${session.url}${BUILD_PATH}`);
    const body = (await answer.json()) as Record<string, any>;

    expect(answer.headers.get('access-control-allow-origin')).toBe('*');
    expect(answer.headers.get('access-control-allow-private-network')).toBe('true');
    expect(answer.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({ build: 1, manifest: { name: 'tooled' }, problem: null });
    expect(Object.keys(body.handlers)).toEqual(['handlers/whoami.js']);
    expect(body.handlers['handlers/whoami.js']).toContain('userId');

    const preflight = await fetch(`${session.url}${BUILD_PATH}`, { method: 'OPTIONS' });

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-private-network')).toBe('true');
  });

  test('counts every build, keeps the last good manifest when one fails, and says why it failed', async () => {
    const root = tiny();
    const { session, lines } = await run(root);

    writeFileSync(join(root, 'src/screens/home.ts'), 'export const home = 2;\n');
    await session.rebuild();
    expect(await served(session)).toMatchObject({ build: 2, manifest: { name: 'tiny' }, problem: null });

    writeFileSync(join(root, 'src/screens/home.ts'), 'export const home = ;\n');
    await session.rebuild();

    const failed = await served(session);

    expect(failed.build).toBe(3);
    expect(failed.manifest).toMatchObject({ name: 'tiny' });
    expect(typeof failed.problem.message).toBe('string');
    expect(failed.problem.message.length).toBeGreaterThan(0);
    expect(lines.join('\n')).toContain('the app in Brydio keeps the last good build');

    writeFileSync(join(root, 'src/screens/home.ts'), 'export const home = 3;\n');
    await session.rebuild();
    expect(await served(session)).toMatchObject({ build: 4, problem: null });
  });

  test('serves the built files, and only them, from localhost with the headers the frame needs', async () => {
    // A5-F02-TC001.
    const { session } = await run(tiny());
    const screen = await fetch(`${session.url}/screens/home.js`);

    expect(screen.status).toBe(200);
    expect(screen.headers.get('access-control-allow-origin')).toBe('*');
    expect(screen.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(screen.headers.get('content-type')).toContain('text/javascript');
    expect((await fetch(`${session.url}/../.brydio/app.json`)).status).toBe(404);
    expect((await fetch(`${session.url}/%2e%2e/src/screens/home.ts`)).status).toBe(404);
    expect((await fetch(`${session.url}/screens/missing.js`)).status).toBe(404);
  });

  test('says --api and --project are not used any more', async () => {
    const was = process.env.BRYDIO_HOME;
    const lines: string[] = [];
    const root = tiny();
    // `main` waits for Ctrl-C: give it a moment, then stop it the way the terminal would.
    const running = main(['dev', root, '--api', 'http://localhost:4000', '--project', 'p_1', '--port', String(port++)], line => void lines.push(line));

    for (let at = 0; at < 100 && !lines.some(line => line.includes('Serving')); at++) await new Promise(done => setTimeout(done, 50));
    process.emit('SIGINT');

    expect(await running).toBe(0);
    expect(lines.join('\n')).toContain('--api is not used any more');
    expect(lines.join('\n')).toContain('--project is not used any more');
    if (was !== undefined) process.env.BRYDIO_HOME = was;
  });
});

describe('brydio dev and hot reload', () => {
  test("serves a Preact app's shared chunk beside its screen, and says saves keep what is on the tab", async () => {
    // A5-F02-S02: the entry imports `./chunk-….js`, which the frame fetches
    // from here with the same headers. `hot.test.ts` runs the swap itself.
    const root = app({
      '.brydio/app.json': JSON.stringify({
        name: 'counter',
        version: '1.0.0',
        placements: [{ kind: 'project-widget', screen: 'home', sizes: ['large'] }],
        screens: { home: { entry: 'screens/home.js' } },
      }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@brydio/app/preact' } }),
      'src/screens/home.tsx': "import { mount } from '@brydio/app/preact';\n\nvoid mount(() => <bry-text text=\"Hello\" />);\n",
    });

    symlinkSync(join(import.meta.dir, '..', '..', '..', 'templates', 'preact', 'node_modules'), join(root, 'node_modules'));

    const { session, lines } = await run(root);
    const entry = await (await fetch(`${session.url}/screens/home.js?build=1`)).text();
    const chunk = /from "\.\/(chunk-[a-z0-9]+\.js)"/.exec(entry)?.[1];

    expect(chunk).toBeDefined();

    const shared = await fetch(`${session.url}/screens/${chunk}`);

    expect(shared.status).toBe(200);
    expect(shared.headers.get('access-control-allow-origin')).toBe('*');
    expect(await shared.text()).toContain('__PREFRESH__');
    expect(lines.join('\n')).toContain('swapped into what is open, keeping what is on it');
  });

  test('builds an app that is not Preact whole, and starts its tab over on a save', async () => {
    const { session, lines } = await run(tiny());

    expect(await (await fetch(`${session.url}/screens/home.js`)).text()).not.toContain('chunk-');
    expect(lines.join('\n')).toContain('starts what is open over with the new code');
  });
});

describe('brydio dev on a new app', () => {
  test.each(['preact', 'plain'] as const)(
    'runs an app fresh from the %s template, with no edits',
    async template => {
      // A5-F06-S01: the result runs in brydio dev with no edits.
      const into = mkdtempSync(join(tmpdir(), 'brydio-dev-create-'));

      made.push(into);

      const root = await create(`fresh-${template}`, { into, template, out: () => {} });
      const { session } = await run(root);

      expect(await served(session)).toMatchObject({ manifest: { name: `fresh-${template}`, screens: { home: { entry: 'screens/home.js' } } }, problem: null });
      expect((await fetch(`${session.url}/screens/home.js`)).status).toBe(200);
    },
    120_000,
  );
});
