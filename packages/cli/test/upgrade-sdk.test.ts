import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upgradeSdk, type UpgradeSdkOptions } from '../src/upgrade-sdk.ts';
import { brydioHome, fakeRegistry, type FakeRegistry } from './fake-registry.ts';

/** `brydio upgrade-sdk` (PB19): one SDK version for every @brydio pin, against a pretend npm and registry. */

const made: string[] = [];
const servers: { stop: () => void }[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const one of servers.splice(0)) one.stop();
});

const SDK = ['app', 'cli', 'fake-host', 'manifest', 'ui', 'api'];

/** npm with every @brydio package at these versions, and these dist-tags, unless `missing` leaves one out. */
function npm(versions: string[], tags: Record<string, string>, missing: Record<string, string[]> = {}) {
  const asked: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const name = decodeURIComponent(new URL(request.url).pathname.slice(1));

      asked.push(name);

      if (!SDK.some(one => name === `@brydio/${one}`)) return Response.json({ error: 'Not found' }, { status: 404 });

      const has = versions.filter(one => !(missing[name] ?? []).includes(one));

      return Response.json({ name, 'dist-tags': tags, versions: Object.fromEntries(has.map(one => [one, {}])) });
    },
  });

  servers.push(server);

  return { url: `http://127.0.0.1:${server.port}`, asked };
}

function registry(sdk: NonNullable<Parameters<typeof fakeRegistry>[0]>['sdk']): FakeRegistry {
  const one = fakeRegistry({ sdk });

  servers.push(one);

  return one;
}

const pkg = (over: Record<string, unknown> = {}) => ({
  name: 'tracker',
  private: true,
  dependencies: { '@brydio/app': '0.1.0-alpha.7', preact: '10.27.2' },
  devDependencies: { '@brydio/cli': '0.1.0-alpha.12', '@brydio/fake-host': 'file:../brydio-sdk/packages/fake-host', '@brydio/manifest': '^0.1.0-alpha.7', typescript: '5.9.3' },
  ...over,
});

function app(contents: unknown = pkg()): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-upgrade-'));

  made.push(root);
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(contents, null, 2)}\n`);

  return root;
}

async function run(wanted: string | undefined, root: string, options: UpgradeSdkOptions) {
  const lines: string[] = [];
  const steps: string[] = [];
  const home = brydioHome(null);

  made.push(home);

  const code = await upgradeSdk(wanted, root, {
    home,
    install: dir => (steps.push(`install ${dir}`), true),
    check: dir => (steps.push(`check ${dir}`), true),
    out: line => lines.push(line),
    ...options,
  });

  return { code, text: lines.join('\n'), steps };
}

const pins = (root: string) => {
  const read = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, Record<string, string>>;

  return { ...read.dependencies, ...read.devDependencies };
};

describe('brydio upgrade-sdk', () => {
  test('moves every @brydio pin to the newest of latest and next, installs, then builds and validates', async () => {
    const registryOne = registry({ minimum: '0.1.0-alpha.40' });
    const store = npm(['0.1.0-alpha.0', '0.1.0-alpha.59', '0.1.0-alpha.60'], { latest: '0.1.0-alpha.0', next: '0.1.0-alpha.60' });
    const root = app();
    const { code, text, steps } = await run(undefined, root, { npm: store.url, registry: registryOne.url });

    expect(code).toBe(0);
    expect(text).toContain('The newest SDK on npm is 0.1.0-alpha.60 (latest 0.1.0-alpha.0, next 0.1.0-alpha.60).');
    expect(pins(root)).toEqual({
      '@brydio/app': '0.1.0-alpha.60',
      preact: '10.27.2',
      '@brydio/cli': '0.1.0-alpha.60',
      '@brydio/fake-host': '0.1.0-alpha.60',
      '@brydio/manifest': '0.1.0-alpha.60',
      typescript: '5.9.3',
    });
    expect(text).toContain('@brydio/fake-host    file:../brydio-sdk/packages/fake-host → 0.1.0-alpha.60 (was a local link)');
    expect(text).toContain(`Registry ${registryOne.url}`);
    expect(text).toContain('takes new versions from SDK 0.1.0-alpha.40; 0.1.0-alpha.60 is fine.');
    expect(text).toContain('On SDK 0.1.0-alpha.60, built and valid.');
    expect(steps).toEqual([`install ${root}`, `check ${root}`]);
    expect(readFileSync(join(root, 'package.json'), 'utf8').endsWith('}\n')).toBe(true);
  });

  test('takes a version or a dist-tag name, and warns when it is below the registry’s minimum or an announced one', async () => {
    const store = npm(['0.1.0-alpha.30', '0.1.0-alpha.60'], { latest: '0.1.0-alpha.30', next: '0.1.0-alpha.60' });
    const below = registry({ minimum: '0.1.0-alpha.40' });
    const old = await run('0.1.0-alpha.30', app(), { npm: store.url, registry: below.url });

    expect(old.code).toBe(0);
    expect(old.text).toContain("0.1.0-alpha.30 is below 0.1.0-alpha.40, the oldest SDK the registry takes a new version from, so a version built on it can't be published.");

    const announced = registry({ minimum: '0.1.0-alpha.0', upcoming: { minimum: '0.1.0-alpha.50', from: '2027-01-20' } });
    const tagged = await run('latest', app(), { npm: store.url, registry: announced.url });

    expect(tagged.text).toContain("npm's latest tag is 0.1.0-alpha.30.");
    expect(tagged.text).toContain('From 2027-01-20 the registry takes new versions built with SDK 0.1.0-alpha.50 or newer; 0.1.0-alpha.30 is below that.');
  });

  test('changes nothing when one pinned package lacks the version', async () => {
    const store = npm(['0.1.0-alpha.60'], { next: '0.1.0-alpha.60' }, { '@brydio/fake-host': ['0.1.0-alpha.60'] });
    const root = app();
    const before = readFileSync(join(root, 'package.json'), 'utf8');
    const { code, text, steps } = await run(undefined, root, { npm: store.url, registry: registry(null).url });

    expect(code).toBe(1);
    expect(text).toContain('npm has no 0.1.0-alpha.60 of @brydio/fake-host, so nothing was changed.');
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(before);
    expect(steps).toEqual([]);
  });

  test('refuses a word that is neither a version nor a tag, a folder with no package.json, and one pinning no SDK', async () => {
    const store = npm(['0.1.0-alpha.60'], { next: '0.1.0-alpha.60' });

    expect(await run('soon', app(), { npm: store.url })).toMatchObject({ code: 2, text: expect.stringContaining('"soon" is not a version or one of @brydio/app\'s tags on npm (next).') });

    const empty = mkdtempSync(join(tmpdir(), 'brydio-upgrade-'));

    made.push(empty);
    expect(await run(undefined, empty, { npm: store.url })).toMatchObject({ code: 2, text: expect.stringContaining('There is no package.json in') });
    expect(await run(undefined, app({ name: 'plain', dependencies: { preact: '10.27.2' } }), { npm: store.url })).toMatchObject({ code: 2, text: expect.stringContaining('pins no @brydio package') });
  });

  test('says when the install or the check fails, with the pins already moved', async () => {
    const store = npm(['0.1.0-alpha.60'], { next: '0.1.0-alpha.60' });
    const root = app();
    const failedInstall = await run(undefined, root, { npm: store.url, registry: registry(null).url, install: () => false });

    expect(failedInstall).toMatchObject({ code: 1, text: expect.stringContaining("The dependencies didn't install. package.json now pins 0.1.0-alpha.60") });

    const failedCheck = await run(undefined, app(), { npm: store.url, registry: registry(null).url, check: () => false });

    expect(failedCheck).toMatchObject({ code: 1, text: expect.stringContaining('The app does not build or validate on SDK 0.1.0-alpha.60.') });
  });

  test('says when every pin is there already, and still installs and checks', async () => {
    const store = npm(['0.1.0-alpha.60'], { next: '0.1.0-alpha.60' });
    const all = { '@brydio/app': '0.1.0-alpha.60' };
    const { code, text, steps } = await run(undefined, app({ name: 'x', dependencies: all }), { npm: store.url, registry: registry(null).url });

    expect(code).toBe(0);
    expect(text).toContain('Every @brydio package is already on 0.1.0-alpha.60.');
    expect(text).toContain('says no SDK minimum.');
    expect(steps).toHaveLength(2);
  });

  test('upgrades when the registry can’t be reached, saying the minimum was not checked', async () => {
    const store = npm(['0.1.0-alpha.60'], { next: '0.1.0-alpha.60' });
    const { code, text } = await run(undefined, app(), { npm: store.url, registry: 'http://127.0.0.1:1' });

    expect(code).toBe(0);
    expect(text).toContain('The SDK minimum was not checked.');
  });

  test('says when npm can’t be reached', async () => {
    expect(await run(undefined, app(), { npm: 'http://127.0.0.1:1' })).toMatchObject({ code: 1, text: expect.stringContaining('Could not reach npm at http://127.0.0.1:1') });
  });
});
