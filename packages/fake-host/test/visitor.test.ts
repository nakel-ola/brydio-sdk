import { build } from '@brydio/cli';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Handler } from '@brydio/app/handler';

import { FakeHost, NotForVisitors, VISITOR_CONTEXT, fakeHandlerClient, refusal, runHandler } from '../src/index.ts';

/**
 * A public page (P3), as a visitor with no Brydio account meets it: a screen
 * that reaches only what the app marks public, and a public tool's handler
 * that runs for an anonymous caller.
 */

const app = join(import.meta.dir, 'fixtures', 'plain');
const plain = JSON.parse(readFileSync(join(app, '.brydio/app.json'), 'utf8'));

/** Notes anyone may read, signups anyone may send, staff nobody outside may see. */
const manifest = {
  ...plain,
  data: {
    notes: { schema: { title: 'string', pinned: 'boolean?' }, publicRead: true },
    signups: { schema: { name: 'string' }, publicSubmit: true },
    staff: { schema: { name: 'string' } },
  },
  tools: {
    custom: [
      { name: 'book', description: 'Books a slot.', handler: 'handlers/book.js', write: true, public: true },
      { name: 'internal', description: 'Staff only.', handler: 'handlers/internal.js' },
    ],
  },
  grants: { ...plain.grants, host: ['*'] },
};
const fixtures = {
  notes: [{ id: 'note_a', title: 'Opening hours', createdBy: 'user_ada' }],
  signups: [{ id: 'signup_a', name: 'Earlier', createdBy: 'user_ada' }],
  staff: [{ id: 'staff_a', name: 'Ada' }],
};
const tools = {
  book: () => ({ content: [{ type: 'text' as const, text: 'Booked.' }], structuredContent: { booked: true } }),
  internal: () => refusal('Never reached.'),
};
let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(app, { minify: false, checkSource: false })).problems).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

const lines = () => host!.findAll(node => node.type === 'bry-text').map(node => String(node.props.text));
const NOT_HERE = '-32601 That isn’t available on a public page.';

describe('a screen run as a public page', () => {
  test('is told it is a public page for an anonymous viewer, and gets only what a visitor may', async () => {
    host = FakeHost.start({ entry: join(app, 'dist', 'screens', 'visitor.js'), manifest, fixtures, tools, visitor: true });
    await host.mounted();

    const [context, ...answers] = lines();

    expect(context).toBe('anonymous public-page public');
    expect(answers).toEqual([
      expect.stringMatching(/^data\/list ok \{"items":\[\{"id":"note_a","version":1,"title":"Opening hours",.*\],"nextCursor":null\}$/),
      expect.stringMatching(/^data\/get ok \{"id":"note_a","version":1,"title":"Opening hours",/),
      'data/list -32000 signups is not open to visitors on a public page.',
      'data/get -32000 staff is not open to visitors on a public page.',
      expect.stringMatching(/^tools\/call ok \{"id":"signup_\w+","version":1,"name":"Ada",/),
      'tools/call -32000 update_signup is not open to visitors on a public page.',
      'tools/call -32000 list_signups is not open to visitors on a public page.',
      'tools/call -32000 delete_signup is not open to visitors on a public page.',
      'tools/call -32000 batch_signups is not open to visitors on a public page.',
      'tools/call -32000 create_note is not open to visitors on a public page.',
      expect.stringMatching(/^tools\/call ok \{"id":"note_a",/),
      'tools/call ok {"booked":true}',
      'tools/call -32000 internal is not open to visitors on a public page.',
      `data/subscribe ${NOT_HERE}`,
      `host/members ${NOT_HERE}`,
      `host/projects ${NOT_HERE}`,
      `host/approval ${NOT_HERE}`,
      `api/call ${NOT_HERE}`,
      `ui/message ${NOT_HERE}`,
      `ui/download ${NOT_HERE}`,
      `ui/copy ${NOT_HERE}`,
      'ui/copy ok {"copied":true}',
      `ui/navigate ${NOT_HERE}`,
      'ui/navigate ok {"opened":true}',
    ]);

    // Nothing a visitor reads or makes says which member made or changed it.
    expect(answers.join('\n')).not.toContain('createdBy');
    expect(answers.join('\n')).not.toContain('updatedBy');
    // Only the create in the submit-only collection went through; the earlier signup is untouched.
    expect(host.store!.records('signups').map(entry => entry.name)).toEqual(['Earlier', 'Ada']);
    expect(host.store!.records('notes')).toHaveLength(1);
    expect(host.watching).toEqual([]);
    expect(host.apiCalls).toEqual([]);
    expect(host.asks).toEqual([]);
    expect(host.downloads).toEqual([]);
    expect(host.copied).toEqual([{ text: 'hello' }]);
    expect(host.navigations).toEqual([{ kind: 'route', path: '/thanks', opened: true }]);
  });

  test('starts from the public page context, under whatever the test sets', async () => {
    host = FakeHost.start({ entry: join(app, 'dist', 'screens', 'visitor.js'), manifest, fixtures, tools, visitor: true, context: { theme: 'dark' } });
    await host.mounted();

    expect(VISITOR_CONTEXT).toMatchObject({ role: 'anonymous', placement: { kind: 'public-page' }, instance: { scope: 'public' } });
    expect(lines()[0]).toBe('anonymous public-page public');
  });

  test('a member on the same screen is not held to the visitor rules', async () => {
    host = FakeHost.start({ entry: join(app, 'dist', 'screens', 'visitor.js'), manifest, fixtures, tools });
    await host.mounted();

    const answers = lines();

    expect(answers[0]).toBe('undefined project-widget workspace');
    expect(answers[3]).toMatch(/^data\/list ok /);
    // `internal` ran (and refused in its own words, with no structured content).
    expect(answers[13]).toBe('tools/call ok undefined');
    expect(answers[1]).toContain('"createdBy":"user_ada"');
    expect(answers.filter(line => line.includes('public page'))).toEqual([]);
  });
});

describe('a public tool’s handler, run for a visitor', () => {
  const visitor = { role: 'anonymous' as const };
  const records = {
    get: async (_collection: string, id: string) => ({ id, version: 1, title: 'Opening hours', createdBy: 'user_ada', updatedBy: 'user_ada' }),
    list: async () => ({ items: [{ id: 'note_a', version: 1, createdBy: 'user_ada' }], nextCursor: null }),
    create: async (_collection: string, fields: Record<string, unknown>) => ({ id: 'signup_1', version: 1, ...fields, createdBy: 'visitor:page_1' }),
    update: async () => ({ id: 'signup_1', version: 2 }),
    remove: async () => ({ removed: 'signup_1' }),
    batch: async () => [],
  };

  test('is called by an anonymous caller with no id', async () => {
    const who: Handler = async (_input, { caller }) => (caller.role === 'anonymous' ? { visitor: caller.userId, origin: caller.origin } : { member: caller.userId });

    expect((await runHandler(who, {}, { manifest, caller: visitor })).result).toEqual({ visitor: null, origin: 'public' });
    expect((await runHandler(who, {}, { manifest, caller: { origin: 'public' } })).result).toEqual({ visitor: null, origin: 'public' });
    expect((await runHandler(who, {}, { manifest })).result).toEqual({ member: 'user_test' });
  });

  test('reads only publicRead collections and creates only in publicSubmit ones, without member ids', async () => {
    const { client } = fakeHandlerClient({ manifest, caller: visitor, data: records, tool: 'book' });

    expect(await client.data.get('notes', 'note_a')).toEqual({ id: 'note_a', version: 1, title: 'Opening hours' });
    expect(await client.data.list('notes')).toEqual({ items: [{ id: 'note_a', version: 1 }], nextCursor: null });
    expect(await client.data.create('signups', { name: 'Ada' })).toEqual({ id: 'signup_1', version: 1, name: 'Ada' });

    await expect(client.data.list('signups')).rejects.toThrow('signups is not open to visitors on a public page.');
    await expect(client.data.get('staff', 'staff_a')).rejects.toThrow('staff is not open to visitors on a public page.');
    await expect(client.data.create('notes', { title: 'Mine' })).rejects.toThrow('notes is not open to visitors on a public page.');
    await expect(client.data.update('signups', 'signup_1', 1, { name: 'Bea' })).rejects.toThrow('A visitor on a public page can only add records, never change or remove them.');
    await expect(client.data.remove('signups', 'signup_1')).rejects.toThrow('never change or remove them');
    await expect(client.data.batch('signups', [])).rejects.toThrow('never change or remove them');
    await expect(client.data.remove('signups', 'signup_1')).rejects.toBeInstanceOf(NotForVisitors);
  });

  test('calls only other public tools', async () => {
    const { client } = fakeHandlerClient({ manifest, caller: visitor, tools: { call: async () => ({ ok: true }) as never }, tool: 'book' });

    expect(await client.tools.call<{ ok: boolean }>('book')).toEqual({ ok: true });
    await expect(client.tools.call('internal')).rejects.toThrow('internal is not open to visitors on a public page.');
    await expect(client.tools.call('create_signup')).rejects.toThrow('create_signup is not open to visitors on a public page.');
  });

  test('refuses everything else of the workspace’s with not_for_visitors', async () => {
    const { client } = fakeHandlerClient({
      manifest: { ...manifest, secrets: [{ name: 'api_key', label: 'API key' }] },
      caller: visitor,
      secrets: { api_key: 'sk_test_4f9c2b7e1d' },
      connection: async () => ({ status: 200, body: null }),
      model: { generate: async () => ({}) as never, generateMany: async () => [] },
      tool: 'book',
    });
    const notice = { to: 'user_ada', kind: 'assigned' as const, collection: 'signups', record: 'signup_1', title: 'New signup' };
    const refusals = await Promise.all(
      [
        () => client.connection('billing').request({ path: '/x' }),
        () => client.model.generate({ prompt: 'x', schema: {} }),
        () => client.model.generateMany([]),
        () => client.secrets.get('api_key'),
        () => client.secrets.set('api_key', 'x'),
        () => client.members.canSeeProject('project_1', 'user_ada'),
        () => client.notify.send(notice),
        () => client.notify.at({ ...notice, at: '2026-10-02T09:00:00Z', key: 'k' }),
        () => client.notify.cancel('k'),
        () => client.approvals.request({ title: 'x', steps: [{ approvers: [{ type: 'role', role: 'admin' }], rule: 'any' }], record: { collection: 'signups', id: 'signup_1' } }),
        () => client.approvals.get('approval_1'),
        () => client.approvals.cancel('approval_1'),
      ].map(run => run().then(() => null, (error: unknown) => error)),
    );

    expect(refusals.map(error => (error as NotForVisitors).code)).toEqual(Array(12).fill('not_for_visitors'));
    expect((refusals[0] as Error).message).toBe("book runs for a visitor on a public page, who can't use connection.");
    expect((refusals[3] as Error).message).toBe("book runs for a visitor on a public page, who can't use secrets.");
  });
});
