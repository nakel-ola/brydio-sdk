import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { login, logout, publishers, whoami } from '../src/login.ts';
import { DEFAULT_REGISTRY, LOGIN_FILE, RegistryRefused, readLogins, registryOf, writeLogins } from '../src/registry.ts';
import { ADA, ADA_TOKEN, brydioHome, fakeRegistry, type FakeRegistry } from './fake-registry.ts';

/** `brydio login`, `logout`, `whoami`, `publishers`, and where the registry and the token come from (PB03). */

const made: string[] = [];
const registries: FakeRegistry[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const one of registries.splice(0)) one.stop();
});

function registry(options: Parameters<typeof fakeRegistry>[0] = {}): FakeRegistry {
  const one = fakeRegistry(options);

  registries.push(one);

  return one;
}

function home(url: string | null = null): string {
  const at = url ? brydioHome(url) : mkdtempSync(join(tmpdir(), 'brydio-home-'));

  made.push(at);

  return at;
}

const said = async (work: (out: (line: string) => void) => Promise<number>) => {
  const lines: string[] = [];
  const code = await work(line => lines.push(line));

  return { code, text: lines.join('\n') };
};

describe('brydio login', () => {
  test('starts the device flow, shows the code and the page, waits for the browser, and keeps the token for that registry only this account can read', async () => {
    const reg = registry({ login: ['pending', 'pending', 'approved'] });
    const at = home();
    const opened: string[] = [];
    const waits: number[] = [];
    const { code, text } = await said(out => login({ registry: reg.url, home: at, out, open: url => opened.push(url), sleep: async ms => void waits.push(ms) }));

    expect(code).toBe(0);
    expect(text).toContain(`Logging in to ${reg.url}.`);
    expect(text).toContain(`Open ${reg.url}/login?code=WXYZ-1234 and sign in with your Brydio account.`);
    expect(text).toContain('Check that the page shows this code: WXYZ-1234');
    expect(text).toContain(`Logged in to ${reg.url} as Ada (user_ada).`);
    expect(text).not.toContain(ADA_TOKEN);
    expect(opened).toEqual([`${reg.url}/login?code=WXYZ-1234`]);
    expect(waits).toEqual([2000, 2000]);
    expect(reg.received.map(one => `${one.method} ${one.path}`)).toEqual(['POST /v1/login/start', 'POST /v1/login/poll', 'POST /v1/login/poll', 'POST /v1/login/poll']);
    // The start carries no token, whatever was kept.
    expect(reg.received[0]!.authorization).toBe(null);

    const file = join(at, LOGIN_FILE);

    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(at).mode & 0o077).toBe(0);
    expect(readLogins({ home: at })).toMatchObject({ current: reg.url, logins: { [reg.url]: { token: ADA_TOKEN, user: ADA } } });
  });

  test('keeps a login to each registry, and the last one is where commands go', async () => {
    const one = registry();
    const two = registry();
    const at = home();

    for (const reg of [one, two]) expect((await said(out => login({ registry: reg.url, home: at, out, open: false, sleep: async () => {} }))).code).toBe(0);

    const kept = readLogins({ home: at });

    expect(Object.keys(kept.logins).sort()).toEqual([one.url, two.url].sort());
    expect(registryOf({ home: at }, {})).toBe(two.url);
  });

  test('says when the code ran out and when the browser turned it down, and keeps nothing', async () => {
    for (const [answer, sentence] of [
      ['expired', 'The code ran out before the sign-in finished. Run brydio login again.'],
      ['denied', 'The sign-in was turned down in the browser, so this computer is not logged in.'],
    ] as const) {
      const reg = registry({ login: [answer] });
      const at = home();
      const { code, text } = await said(out => login({ registry: reg.url, home: at, out, open: false, sleep: async () => {} }));

      expect(code).toBe(1);
      expect(text).toContain(sentence);
      expect(existsSync(join(at, LOGIN_FILE))).toBe(false);
    }
  });

  test('gives up when the code’s time is up, without asking forever', async () => {
    const reg = registry({ login: ['pending'] });
    let now = Date.now();
    const real = Date.now;

    Date.now = () => now;

    try {
      const { code, text } = await said(out => login({ registry: reg.url, home: home(), out, open: false, sleep: async () => void (now += 700_000) }));

      expect(code).toBe(1);
      expect(text).toContain('The code ran out');
    } finally {
      Date.now = real;
    }
  });

  test('refuses an address that is not one, and says when the registry can’t be reached or is not a registry', async () => {
    expect(await said(out => login({ registry: 'registry.brydio.com', home: home(), out, open: false }))).toMatchObject({
      code: 2,
      text: '"registry.brydio.com" is not a registry address. Give one like https://registry.brydio.com or http://localhost:4300.',
    });
    expect((await said(out => login({ registry: 'http://127.0.0.1:1', home: home(), out, open: false }))).text).toContain('Could not reach the registry at http://127.0.0.1:1');

    const reg = registry();

    reg.refuseNext('POST', /login\/start/, 200, { hello: 'world' });
    expect((await said(out => login({ registry: reg.url, home: home(), out, open: false }))).text).toContain('Is that a Brydio app registry?');
  });
});

describe('where the registry and the token come from', () => {
  test('--registry, then BRYDIO_REGISTRY_URL, then the last login, then registry.brydio.com', () => {
    const at = home();

    expect(registryOf({ home: at }, {})).toBe(DEFAULT_REGISTRY);

    writeLogins({ current: 'http://localhost:4300', logins: {} }, { home: at });
    expect(registryOf({ home: at }, {})).toBe('http://localhost:4300');
    expect(registryOf({ home: at }, { BRYDIO_REGISTRY_URL: 'https://staging.example/' })).toBe('https://staging.example');
    expect(registryOf({ home: at, registry: 'http://localhost:4300/v1/' }, { BRYDIO_REGISTRY_URL: 'https://staging.example' })).toBe('http://localhost:4300');
  });

  test('refuses a login file other accounts can read, and one that is not JSON', () => {
    const at = home();

    writeLogins({ logins: {} }, { home: at });
    chmodSync(join(at, LOGIN_FILE), 0o644);
    expect(() => readLogins({ home: at })).toThrow(RegistryRefused);
    expect(() => readLogins({ home: at })).toThrow(/can be read by other accounts on this computer/);

    writeFileSync(join(at, LOGIN_FILE), 'nope', { mode: 0o600 });
    chmodSync(join(at, LOGIN_FILE), 0o600);
    expect(() => readLogins({ home: at })).toThrow(/not a login file this can read/);
  });
});

describe('brydio logout', () => {
  test('revokes the token at the registry and forgets it here', async () => {
    const reg = registry();
    const at = home(reg.url);
    const { code, text } = await said(out => logout({ registry: reg.url, home: at, out }));

    expect(code).toBe(0);
    expect(text).toBe(`Logged out of ${reg.url}.`);
    expect(reg.received).toMatchObject([{ method: 'POST', path: '/v1/logout', authorization: `Bearer ${ADA_TOKEN}` }]);
    expect(readLogins({ home: at }).logins).toEqual({});
    expect(reg.users[ADA_TOKEN]).toBeUndefined();
  });

  test('forgets the token even when the registry can’t be told, and says the token still works there', async () => {
    const at = home('http://127.0.0.1:1');
    const { code, text } = await said(out => logout({ registry: 'http://127.0.0.1:1', home: at, out }));

    expect(code).toBe(0);
    expect(text).toContain('The registry could not be told, so the token still works there until it runs out. It is gone from this computer.');
    expect(readLogins({ home: at }).logins).toEqual({});
  });

  test('says there is nothing to log out of', async () => {
    const reg = registry();

    expect((await said(out => logout({ registry: reg.url, home: home(), out }))).text).toContain('is not logged in to');
    expect(reg.received).toEqual([]);
  });
});

describe('brydio whoami and brydio publishers', () => {
  test('says who this computer is logged in as, where, and their publishers', async () => {
    const reg = registry();
    const { code, text } = await said(out => whoami({ registry: reg.url, home: home(reg.url), out }));

    expect(code).toBe(0);
    expect(text).toContain(`Ada (user_ada) on ${reg.url}.`);
    expect(text).toContain('  Acme Ltd (pub_acme), owner');
  });

  test('asks for a login, and says a revoked one is no good', async () => {
    const reg = registry();

    expect(await said(out => whoami({ registry: reg.url, home: home(), out }))).toMatchObject({ code: 2, text: expect.stringContaining('Run brydio login --registry') });

    reg.refuseNext('GET', /\/v1\/me/, 401, { code: 'unauthorized', message: 'Revoked.' });
    expect(await said(out => whoami({ registry: reg.url, home: home(reg.url), out }))).toMatchObject({ code: 1, text: expect.stringContaining("did not accept this computer's login") });
  });

  test('makes a publisher, refuses a taken or reserved name in the registry’s words, and shows one', async () => {
    const reg = registry();
    const at = home(reg.url);

    expect(await said(out => publishers(['create', 'Side', 'Project'], { registry: reg.url, home: at, out }))).toMatchObject({ code: 0, text: expect.stringContaining('Made the publisher Side Project (pub_2)') });
    expect((await said(out => publishers(['create', 'Acme', 'Ltd'], { registry: reg.url, home: at, out }))).text).toContain('The registry did not make it: Acme Ltd is taken. [publisher_name_taken]');
    expect((await said(out => publishers(['create', 'Brydio'], { registry: reg.url, home: at, out }))).text).toContain('Brydio is reserved. [publisher_name_reserved]');
    expect(await said(out => publishers(['create'], { registry: reg.url, home: at, out }))).toMatchObject({ code: 2 });

    const listed = await said(out => publishers([], { registry: reg.url, home: at, out }));

    expect(listed.text).toContain('Side Project (pub_2), owner');
    expect((await said(out => publishers(['show', 'Side Project'], { registry: reg.url, home: at, out }))).text).toContain('Workspaces  none linked yet');
    expect((await said(out => publishers(['fiddle'], { registry: reg.url, home: at, out }))).code).toBe(2);
  });

  test('tells someone in no publisher how to make one', async () => {
    const reg = registry({ publishers: [] });
    const { text } = await said(out => whoami({ registry: reg.url, home: home(reg.url), out }));

    expect(text).toContain('Not in any publisher yet. Make one with brydio publishers create "<name>".');
  });
});

describe('the login file', () => {
  test('never holds more than tokens, users and addresses', async () => {
    const reg = registry();
    const at = home();

    await said(out => login({ registry: reg.url, home: at, out, open: false, sleep: async () => {} }));

    const kept = JSON.parse(readFileSync(join(at, LOGIN_FILE), 'utf8')) as { logins: Record<string, Record<string, unknown>> };

    expect(Object.keys(kept.logins[reg.url]!).sort()).toEqual(['savedAt', 'token', 'user']);
  });
});
