import { afterEach, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';

import { main } from '../src/main.ts';
import { access, deprecate, retire, tag, tags } from '../src/registry-commands.ts';
import { ADA, ADA_TOKEN, brydioHome, fakeRegistry, type FakeApp, type FakeRegistry } from './fake-registry.ts';

/** `brydio tag`, `tags`, `deprecate`, `access` and `retire` against the registry (PB04, PB17). */

const made: string[] = [];
const registries: FakeRegistry[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const one of registries.splice(0)) one.stop();
});

const version = (number: string) => ({ version: number, fingerprint: `f${number}`, sdk: '0.1.0', manifest: { name: 'tasks', version: number }, state: 'live' as const, publishedAt: `at ${number}`, tag: 'latest', body: {} });

/** A registry holding `tasks` 1.3.0, 1.4.0 (latest) and 1.5.0 (beta), Acme's. */
function registry(over: Partial<FakeApp> = {}, options: Parameters<typeof fakeRegistry>[0] = {}): FakeRegistry {
  const one = fakeRegistry(options);

  registries.push(one);
  one.apps.set('tasks', {
    key: 'tasks',
    publisher: 'pub_acme',
    access: 'workspace',
    retired: false,
    tags: { latest: '1.4.0', beta: '1.5.0' },
    history: { latest: [{ version: '1.4.0', movedBy: ADA.id, movedAt: 'then' }] },
    versions: [version('1.3.0'), version('1.4.0'), version('1.5.0')],
    ...over,
  });

  return one;
}

type Command = (words: string[], options: Parameters<typeof tag>[1]) => Promise<number>;

async function run(command: Command, words: string[], reg: FakeRegistry, options: Parameters<typeof tag>[1] & { loggedIn?: boolean } = {}) {
  const lines: string[] = [];
  const { loggedIn = true, ...rest } = options;
  const home = brydioHome(loggedIn ? reg.url : null);

  made.push(home);

  const code = await command(words, { registry: reg.url, home, out: line => lines.push(line), ...rest });

  return { code, text: lines.join('\n') };
}

const writes = (reg: FakeRegistry) => reg.writes().map(one => `${one.method} ${one.path} ${JSON.stringify(one.body)}`);

describe('brydio tag', () => {
  test('promotes a beta to latest, saying where it moved from, and the registry keeps the move', async () => {
    const reg = registry();
    const { code, text } = await run(tag, ['tasks@1.5.0', 'latest'], reg);

    expect(code).toBe(0);
    expect(text).toContain(`Registry ${reg.url}`);
    expect(text).toContain("tasks's latest tag now points at 1.5.0, moved from 1.4.0.");
    expect(writes(reg)).toEqual(['PUT /v1/apps/tasks/tags/latest {"version":"1.5.0"}']);
    expect(reg.received.find(one => one.method === 'PUT')!.authorization).toBe(`Bearer ${ADA_TOKEN}`);
    expect(reg.apps.get('tasks')!.history.latest!.map(one => one.version)).toEqual(['1.4.0', '1.5.0']);
  });

  test('moves latest back, and says when nothing changed', async () => {
    const reg = registry();

    expect((await run(tag, ['tasks@1.3.0', 'latest'], reg)).text).toContain('now points at 1.3.0, moved from 1.4.0');
    expect((await run(tag, ['tasks@1.3.0', 'latest'], reg)).text).toContain("tasks's latest tag already pointed at 1.3.0. Nothing changed.");
  });

  test('refuses words that are not an app@version and a tag before asking anything', async () => {
    const reg = registry();

    expect(await run(tag, ['tasks', 'latest'], reg)).toMatchObject({ code: 2, text: expect.stringContaining('Say which version: brydio tag <app>@<version> <tag>') });
    expect(await run(tag, ['tasks@1.5.0'], reg)).toMatchObject({ code: 2, text: expect.stringContaining('Say which tag') });
    expect(await run(tag, ['tasks@1.5.0', 'Latest'], reg)).toMatchObject({ code: 2, text: expect.stringContaining('"Latest" is not a tag.') });
    expect(await run(tag, ['tasks@1.5.0', 'latest'], reg, { loggedIn: false })).toMatchObject({ code: 2, text: expect.stringContaining('is not logged in to') });
    expect(reg.received).toEqual([]);
  });

  test('says what the registry said: no such version, no such app, not your app, retired', async () => {
    const reg = registry();

    expect(await run(tag, ['tasks@9.9.9', 'latest'], reg)).toMatchObject({ code: 1, text: 'Registry ' + reg.url + '\ntasks has no version 9.9.9. [version_not_found]' });
    expect((await run(tag, ['nope@1.0.0', 'latest'], reg)).text).toContain('has no app called nope.');

    const theirs = registry({ publisher: 'pub_other' });

    expect((await run(tag, ['tasks@1.5.0', 'latest'], theirs)).text).toContain('The registry refused this: tasks is published by another publisher. [not_publisher]');

    const retired = registry({ retired: true });

    expect((await run(tag, ['tasks@1.5.0', 'latest'], retired)).text).toContain('tasks is retired. [retired]');
  });
});

describe('brydio tags', () => {
  test('lists the tags and the versions with their state and deprecations, with no login needed', async () => {
    const reg = registry();

    reg.apps.get('tasks')!.versions[0]!.deprecated = 'data bug, use 1.3.1';

    const { code, text } = await run(tags, ['tasks'], reg, { loggedIn: false });

    expect(code).toBe(0);
    expect(text).toContain('tasks, published by Acme Ltd (pub_acme), workspace access');
    expect(text).toContain('  beta       1.5.0');
    expect(text).toContain('  latest     1.4.0');
    expect(text).toContain('deprecated: data bug, use 1.3.1');
  });

  test('prints every move of one tag', async () => {
    const reg = registry();

    await run(tag, ['tasks@1.5.0', 'latest'], reg);

    const { text } = await run(tags, ['tasks', 'latest'], reg);

    expect(text).toContain('then  1.4.0         by user_ada');
    expect(text).toMatch(/1\.5\.0\s+by user_ada/);
  });
});

describe('brydio deprecate', () => {
  test('puts the message on the version, and --undo takes it off', async () => {
    const reg = registry();
    const marked = await run(deprecate, ['tasks@1.3.0', 'data', 'bug,', 'use', '1.3.1'], reg);

    expect(marked.code).toBe(0);
    expect(marked.text).toContain('tasks 1.3.0 is deprecated. Admins of workspaces on it see: "data bug, use 1.3.1". It still installs and runs; nothing is removed.');
    expect(reg.apps.get('tasks')!.versions[0]!.deprecated).toBe('data bug, use 1.3.1');

    const undone = await run(deprecate, ['tasks@1.3.0'], reg, { undo: true });

    expect(undone).toMatchObject({ code: 0, text: expect.stringContaining('tasks 1.3.0 is no longer deprecated.') });
    expect(writes(reg)).toEqual(['PUT /v1/apps/tasks/versions/1.3.0/deprecation {"message":"data bug, use 1.3.1"}', 'PUT /v1/apps/tasks/versions/1.3.0/deprecation {"message":null}']);
    expect(reg.apps.get('tasks')!.versions[0]!.deprecated).toBeUndefined();
  });

  test('wants a message, or --undo with none, of a sensible length, before asking anything', async () => {
    const reg = registry();

    expect(await run(deprecate, ['tasks@1.3.0'], reg)).toMatchObject({ code: 2, text: expect.stringContaining('Say why, for the admins of workspaces on it') });
    expect(await run(deprecate, ['tasks@1.3.0', 'why'], reg, { undo: true })).toMatchObject({ code: 2, text: expect.stringContaining('--undo takes the message off') });
    expect(await run(deprecate, ['tasks@1.3.0', 'x'.repeat(501)], reg)).toMatchObject({ code: 2, text: expect.stringContaining('Keep it to 500') });
    expect(await run(deprecate, ['tasks', 'why'], reg)).toMatchObject({ code: 2, text: expect.stringContaining('Say which version: brydio deprecate <app>@<version>') });
    expect(reg.received).toEqual([]);
  });

  test('says when the version is not there', async () => {
    expect((await run(deprecate, ['tasks@9.0.0', 'why'], registry())).text).toContain('tasks has no version 9.0.0. [version_not_found]');
  });
});

describe('brydio access', () => {
  test('moves an app to public and back, saying what each means for installs', async () => {
    const reg = registry();
    const up = await run(access, ['tasks', 'public'], reg);

    expect(up.code).toBe(0);
    expect(up.text).toContain("tasks now has public access.\nIts versions go to Brydio's review, and it shows in the store once one is approved.");

    const down = await run(access, ['tasks', 'workspace'], reg);

    expect(down.text).toContain('It leaves the store and no new workspace can install it. Workspaces that have it keep it and keep getting new versions on their tag.');
    expect(writes(reg)).toEqual(['PUT /v1/apps/tasks/access {"access":"public"}', 'PUT /v1/apps/tasks/access {"access":"workspace"}']);
  });

  test('says when nothing changes, and refuses another word for access before asking', async () => {
    const reg = registry();

    expect((await run(access, ['tasks', 'workspace'], reg)).text).toContain('tasks already has workspace access. Nothing changed.');
    expect(writes(reg)).toEqual([]);
    expect(await run(access, ['tasks', 'private'], reg)).toMatchObject({ code: 2, text: expect.stringContaining('not "private"') });
    expect(await run(access, ['tasks'], reg)).toMatchObject({ code: 2 });
  });
});

describe('brydio retire', () => {
  test('says what retiring means and does nothing without --yes', async () => {
    const reg = registry();
    const { code, text } = await run(retire, ['tasks'], reg);

    expect(code).toBe(2);
    expect(text).toContain('Retiring tasks is never undone');
    expect(text).toContain('brydio retire tasks --yes');
    expect(reg.received).toEqual([]);
  });

  test('retires with --yes, and then no version can be published or tagged', async () => {
    const reg = registry();

    expect(await run(retire, ['tasks'], reg, { yes: true })).toMatchObject({ code: 0, text: expect.stringContaining('tasks is retired.') });
    expect(reg.apps.get('tasks')!.retired).toBe(true);
    expect((await run(tag, ['tasks@1.5.0', 'latest'], reg)).text).toContain('[retired]');
  });

  test('says when there is no such app, or it is not yours', async () => {
    expect((await run(retire, ['nope'], registry(), { yes: true })).text).toContain('There is no app called nope. [app_not_found]');
    expect((await run(retire, ['tasks'], registry({ publisher: 'pub_other' }), { yes: true })).text).toContain('[not_publisher]');
  });
});

describe('the command line', () => {
  test('runs the registry commands through brydio itself, switches taking no word', async () => {
    const reg = registry();
    const was = process.env.BRYDIO_HOME;
    const home = brydioHome(reg.url);

    made.push(home);
    process.env.BRYDIO_HOME = home;

    try {
      const said = async (words: string[]) => {
        const lines: string[] = [];
        const code = await main([...words, '--registry', reg.url], line => lines.push(line));

        return { code, text: lines.join('\n') };
      };

      expect(await said(['tag', 'tasks@1.5.0', 'latest'])).toMatchObject({ code: 0, text: expect.stringContaining('now points at 1.5.0') });
      expect(await said(['deprecate', 'tasks@1.3.0', 'use', '1.3.1'])).toMatchObject({ code: 0 });
      // `--undo` before the version leaves the version where it is.
      expect(await said(['deprecate', '--undo', 'tasks@1.3.0'])).toMatchObject({ code: 0, text: expect.stringContaining('no longer deprecated') });
      expect(await said(['access', 'tasks', 'public'])).toMatchObject({ code: 0 });
      expect(await said(['tags', 'tasks'])).toMatchObject({ code: 0, text: expect.stringContaining('public access') });
      expect(await said(['retire', '--yes', 'tasks'])).toMatchObject({ code: 0, text: expect.stringContaining('tasks is retired.') });
      expect(await said(['whoami'])).toMatchObject({ code: 0, text: expect.stringContaining('Ada (user_ada)') });
      expect(await said(['publish', '--api', 'http://localhost:4000'])).toMatchObject({ code: 2, text: expect.stringContaining('never to a Brydio API') });

      const help = (await said(['help'])).text;

      for (const command of ['brydio login', 'brydio logout', 'brydio whoami', 'brydio pack', 'brydio version', 'brydio tag <app>@<version> <tag>', 'brydio deprecate', 'brydio access', 'brydio retire', 'brydio upgrade-sdk', '--tag <tag>', '--access <workspace|public>']) {
        expect(help).toContain(command);
      }

      expect(help).not.toContain('api.brydio');
    } finally {
      if (was === undefined) delete process.env.BRYDIO_HOME;
      else process.env.BRYDIO_HOME = was;
    }
  });
});
