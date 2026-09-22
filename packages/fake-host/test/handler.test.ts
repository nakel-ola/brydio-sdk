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
      caller: { userId: 'user_ada', origin: 'screen' },
      keys: ['userId', 'origin'],
    });
  });
});
