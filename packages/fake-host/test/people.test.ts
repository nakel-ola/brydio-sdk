import { describe, expect, test } from 'bun:test';
import type { Handler } from '@brydio/app/handler';
import { runHandler } from '../src/handler.ts';

const manifest = { name: 'People', grants: { host: ['people'] } };
const context: Handler = (_, client) => client.people.call<{ userId: string; isHr: boolean }>('context');
const configure: Handler = (input, client) => client.people.call('configure', input);

describe('the native People capability', () => {
  test('requires a People grant even when Directory was granted', async () => {
    const run = await runHandler(context, {}, {
      manifest: { name: 'Directory app', grants: { host: ['directory'] } },
      people: { results: { context: { userId: 'person_1', isHr: false } } },
    });
    expect(run.error).toContain('not_granted');
  });

  test('refuses visitors before invoking a People fixture', async () => {
    const run = await runHandler(context, {}, {
      manifest,
      caller: { role: 'anonymous' },
      people: { call: async () => { throw new Error('fixture reached'); } },
    });
    expect(run.error).toContain("can't use people");
    expect(run.error).not.toContain('fixture reached');
  });

  test('fails closed with no fixture or no exact operation result', async () => {
    expect((await runHandler(context, {}, { manifest })).error).toContain('people_unavailable');
    expect((await runHandler(context, {}, { manifest, people: { results: {} } })).error).toContain('people_unavailable');
    const inherited: Handler = (_, client) => client.people.call('toString');
    expect((await runHandler(inherited, {}, { manifest, people: { results: {} } })).error).toContain('people_unavailable');
  });

  test('allows context and listPeople from a read tool but refuses unknown operations', async () => {
    const people = { results: { context: { userId: 'person_1', isHr: false }, listPeople: [], configure: { saved: true } } };
    expect((await runHandler(context, {}, { manifest, write: false, people })).result).toEqual({ userId: 'person_1', isHr: false });
    const list: Handler = (_, client) => client.people.call('listPeople', {});
    expect((await runHandler(list, {}, { manifest, write: false, people })).result).toEqual([]);
    expect((await runHandler(configure, {}, { manifest, write: false, people })).error).toContain('read_tool');
    const unknown: Handler = (_, client) => client.people.call('futureOperation', {});
    expect((await runHandler(unknown, {}, { manifest, write: false, people })).error).toContain('read_tool');
  });

  test('reads the minimal approved-leave projection through whoOut from a read tool', async () => {
    const whoOut: Handler = (input, client) => client.people.call('whoOut', input);
    const run = await runHandler(whoOut, { from: '2026-10-17', to: '2026-10-24' }, {
      manifest,
      write: false,
      people: { results: { whoOut: { items: [{ person: 'person_2', name: 'Ada', from: '2026-10-19', to: '2026-10-20', cover: 'person_3' }] } } },
    });
    expect(run.result).toEqual({ items: [{ person: 'person_2', name: 'Ada', from: '2026-10-19', to: '2026-10-20', cover: 'person_3' }] });
  });

  test('forwards operation and input to an explicit fixture and records the call', async () => {
    const run = await runHandler(configure, { hrGroupId: 'group_hr' }, {
      manifest,
      write: true,
      people: { call: async (operation, input) => ({ operation, selectedGroup: input?.hrGroupId }) },
    });
    expect(run.result).toEqual({ operation: 'configure', selectedGroup: 'group_hr' });
    expect(run.calls).toContainEqual({ method: 'people.call', args: ['configure', { hrGroupId: 'group_hr' }] });
  });

  test('does not forward a secret held by the handler to People', async () => {
    const handler: Handler = async (_, client) => {
      const held = await client.secrets.get('private_key');
      return client.people.call('configure', { hrGroupId: held });
    };
    const run = await runHandler(handler, {}, {
      manifest: { ...manifest, secrets: [{ name: 'private_key', label: 'Private key' }], grants: { host: ['people', 'secrets'] } },
      secrets: { private_key: 'do-not-pass-this' },
      people: { results: { configure: { saved: true } } },
    });
    expect(run.error).toContain("can't pass one of");
    expect(run.result).toBeUndefined();
  });
});
