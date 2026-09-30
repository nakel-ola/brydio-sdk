import { describe, expect, test } from 'bun:test';

import type { Handler } from '@brydio/app/handler';

import { SECRET_PLACEHOLDER, runHandler } from '../src/handler.ts';

/** ADR-A24: a handler's secrets, answered as Brydio answers them. */

const manifest = {
  name: 'billing',
  displayName: 'Billing',
  secrets: [
    { name: 'api_key', label: 'API key', required: true },
    { name: 'refresh_token', label: 'Refresh token' },
  ],
  grants: { host: ['secrets'] },
};

const KEY = 'sk_test_4f9c2b7e1d';

describe('a handler’s secrets in the fake host', () => {
  test('reads a declared secret, and null while none is set', async () => {
    const reads: Handler = async (_input, { secrets }) => ({
      key: (await secrets.get('api_key'))?.length ?? null,
      refresh: await secrets.get('refresh_token'),
    });

    expect((await runHandler(reads, {}, { manifest, secrets: { api_key: KEY } })).result).toEqual({ key: KEY.length, refresh: null });
  });

  test('refuses a name the manifest does not declare, and a manifest without the grant', async () => {
    const asks: Handler<{ name: string }> = async ({ name }, { secrets }) => secrets.get(name);

    expect((await runHandler(asks, { name: 'stripe_key' }, { manifest })).error).toBe('Billing has no secret called stripe_key.');
    expect((await runHandler(asks, { name: 'api_key' }, { manifest: { ...manifest, grants: { host: [] } } })).error).toBe(
      'Billing did not ask to keep its own secrets.',
    );
  });

  test('stores one the handler obtained, and keeps its value out of the answer', async () => {
    const keeps: Handler = async (_input, { secrets }) => {
      await secrets.set('refresh_token', 'rt_new_91aa03');

      return { stored: 'rt_new_91aa03' };
    };
    const run = await runHandler(keeps, {}, { manifest });

    expect(run.result).toEqual({ stored: SECRET_PLACEHOLDER });
    expect(run.secrets.get('refresh_token')).toBe('rt_new_91aa03');
    expect(JSON.stringify(run.calls)).not.toContain('rt_new_91aa03');
  });

  test('replaces a held value in what the handler returns and throws, as Brydio does', async () => {
    const returns: Handler = async (_input, { secrets }) => ({ key: await secrets.get('api_key') });
    const throws: Handler = async (_input, { secrets }) => {
      throw new Error(`failed with ${await secrets.get('api_key')}`);
    };

    expect((await runHandler(returns, {}, { manifest, secrets: { api_key: KEY } })).result).toEqual({ key: SECRET_PLACEHOLDER });
    expect((await runHandler(throws, {}, { manifest, secrets: { api_key: KEY } })).error).toBe(`failed with ${SECRET_PLACEHOLDER}`);
  });

  test('refuses a held value on its way into a record', async () => {
    const writes: Handler = async (_input, { secrets, data }) => data.create('notes', { title: await secrets.get('api_key') });
    const run = await runHandler(writes, {}, {
      manifest,
      tool: 'save_key',
      secrets: { api_key: KEY },
      data: { create: async () => ({ id: 'n1', version: 1 }) },
    });

    expect(run.error).toBe("save_key can't pass one of Billing's secrets on.");
  });

  test('tells the handler who is calling, and nothing that could sign a request', async () => {
    const who: Handler = async (_input, { caller }) => ({ caller, keys: Object.keys(caller) });

    expect((await runHandler(who, {}, { caller: { userId: 'user_ada', origin: 'screen' } })).result).toEqual({
      caller: { userId: 'user_ada', origin: 'screen', role: 'owner' },
      keys: ['userId', 'origin', 'role'],
    });
  });
});

describe('asking who can see a project, in the fake host', () => {
  test('answers from the test\'s own rule, and refuses without the members grant', async () => {
    const sees: Handler<{ project: string; member: string }> = async (input, { members }) => ({ sees: await members.canSeeProject(input.project, input.member) });
    const rule = (projectId: string, userId: string) => projectId === 'prj_1' && userId === 'user_ada';

    expect((await runHandler(sees, { project: 'prj_1', member: 'user_ada' }, { canSeeProject: rule })).result).toEqual({ sees: true });
    expect((await runHandler(sees, { project: 'prj_1', member: 'user_bo' }, { canSeeProject: rule })).result).toEqual({ sees: false });

    const refused = await runHandler(sees, { project: 'prj_1', member: 'user_ada' }, { manifest: { displayName: 'Tasks', grants: { host: [] } } as never });

    expect(refused.error).toBe('Tasks did not ask to see the names of people.');
  });
});

describe('notifying a member, in the fake host (TK01)', () => {
  const tell: Handler<{ to: string; due?: string }> = async (input, { notify }) => {
    const now = await notify.send({ to: input.to, kind: 'assigned', collection: 'issues', record: 'iss_1', title: 'WEB-1 Ship it' });
    const later = input.due ? await notify.at({ to: input.to, kind: 'due_soon', collection: 'issues', record: 'iss_1', title: 'WEB-1 Ship it', at: input.due, key: 'due:iss_1' }) : null;

    return { now, later };
  };

  test('keeps what was sent and set, and answers "self" for the caller, as Brydio does', async () => {
    const run = await runHandler(tell, { to: 'user_bo', due: '2026-10-02T09:00:00Z' }, { caller: { userId: 'user_ada' } });

    expect(run.result).toEqual({ now: { notified: true }, later: { scheduled: true } });
    expect(run.notices.sent.map(one => one.to)).toEqual(['user_bo']);
    expect([...run.notices.pending.keys()]).toEqual(['user_bo:due:iss_1']);

    const own = await runHandler(tell, { to: 'user_ada', due: '2026-10-02T09:00:00Z' }, { caller: { userId: 'user_ada' } });

    // Told of what you did: no. A due date for yourself: yes.
    expect(own.result).toEqual({ now: { notified: false, reason: 'self' }, later: { scheduled: true } });
  });

  test("answers cannot_see from the test's rule, moves a pending one by key, and cancels it", async () => {
    const hidden = await runHandler(tell, { to: 'user_cy' }, { canNotify: to => to !== 'user_cy' });

    expect(hidden.result).toEqual({ now: { notified: false, reason: 'cannot_see' }, later: null });

    const move: Handler = async (_input, { notify }) => {
      const base = { to: 'user_bo', kind: 'overdue' as const, collection: 'issues', record: 'iss_1', title: 'Late', key: 'late:iss_1' };

      await notify.at({ ...base, at: '2026-10-02T09:00:00Z' });
      await notify.at({ ...base, at: '2026-10-03T09:00:00Z' });
      const kept = { ...base, at: '2026-10-04T09:00:00Z', key: 'late:iss_2' };

      await notify.at(kept);

      return notify.cancel('late:iss_1', 'user_bo');
    };
    const run = await runHandler(move, {});

    expect(run.result).toEqual({ cancelled: 1 });
    expect([...run.notices.pending.keys()]).toEqual(['user_bo:late:iss_2']);
  });

  test('refuses without the notify grant, from a read tool, and a kind Brydio does not know', async () => {
    const refused = await runHandler(tell, { to: 'user_bo' }, { manifest: { displayName: 'Tasks', grants: { host: [] } } as never });

    expect(refused.error).toBe('Tasks did not ask to notify people about its records.');
    expect((await runHandler(tell, { to: 'user_bo' }, { write: false, tool: 'list_issues' })).error).toBe("list_issues is a read tool, so its handler can't notify anyone.");

    const odd: Handler = async (_input, { notify }) => notify.send({ to: 'user_bo', kind: 'shouting' as never, collection: 'issues', record: 'iss_1', title: 'x' });

    expect((await runHandler(odd, {})).error).toMatch(/kind is one of assigned/);
  });
});
