import { describe, expect, test } from 'bun:test';

import type { Handler } from '@brydio/app/handler';

import { runHandler } from '../src/index.ts';

/** `timers.*` in the fake host (PJ01): Brydio's checks on set, kept by key, and a timer's caller. */

const MANIFEST = {
  name: 'forms',
  tools: {
    custom: [
      { name: 'schedule', description: 'Sets.', handler: 'handlers/schedule.js', write: true },
      { name: 'start_round', description: 'Starts a round.', handler: 'handlers/start.js', write: true },
    ],
  },
  grants: { tools: ['*'], collections: ['*'], host: ['timers'] },
};

const schedule: Handler<{ key: string; tool?: string }> = async ({ key, tool }, { timers }) =>
  timers.set({ key, tool: tool ?? 'start_round', input: { id: 'f1' }, rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9', start: '2026-10-12T08:00:00.000Z', zone: 'Africa/Lagos' });

describe('timers in the fake host (PJ01)', () => {
  test('sets one by key, moves it by the same key, lists and cancels it', async () => {
    const first = await runHandler(schedule, { key: 'round:f1' }, { manifest: MANIFEST as never, caller: { userId: 'ada' } });

    expect(first.result).toMatchObject({ key: 'round:f1', tool: 'start_round', rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9', zone: 'Africa/Lagos', setBy: 'ada', status: 'active' });
    expect(first.timers.get('round:f1')?.input).toEqual({ id: 'f1' });

    const listed = await runHandler(async (_input, { timers }) => {
      await timers.set({ key: 'round:f1', tool: 'start_round', at: '2026-10-20T09:00:00.000Z' });
      const list = await timers.list();
      const gone = await timers.cancel('round:f1');

      return { list, gone, again: await timers.cancel('round:f1') };
    }, {}, { manifest: MANIFEST as never, timers: [...first.timers.values()] });

    expect(listed.result).toMatchObject({ list: { items: [{ key: 'round:f1', at: '2026-10-20T09:00:00.000Z', rrule: null }] }, gone: { cancelled: true }, again: { cancelled: false } });
    expect(listed.timers.size).toBe(0);
  });

  test('refuses what Brydio refuses, each with its code', async () => {
    const unknown = await runHandler(schedule, { key: 'k', tool: 'drop_tables' }, { manifest: MANIFEST as never });
    const ungranted = await runHandler(schedule, { key: 'k' }, { manifest: { ...MANIFEST, grants: { ...MANIFEST.grants, host: [] } } as never });
    const read = await runHandler(schedule, { key: 'k' }, { manifest: MANIFEST as never, write: false });
    const visitor = await runHandler(schedule, { key: 'k' }, { manifest: MANIFEST as never, caller: { origin: 'public' } });

    expect(unknown.error).toContain('(timer_unknown_tool)');
    expect(ungranted.error).toContain('(not_granted)');
    expect(read.error).toContain('(read_tool)');
    expect(visitor.error).toContain('visitor');
  });

  test('runs a handler as a timer’s run: caller.origin is timer, with its key and due time', async () => {
    const who: Handler = async (_input, { caller }) => caller;
    const run = await runHandler(who, {}, {
      caller: { userId: 'ada', origin: 'timer', role: 'member', timer: { key: 'round:f1', due: '2026-10-12T08:00:00.000Z' } } as never,
    });

    expect(run.result).toEqual({ userId: 'ada', origin: 'timer', role: 'member', timer: { key: 'round:f1', due: '2026-10-12T08:00:00.000Z' } });
  });
});
