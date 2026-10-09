import { describe, expect, it } from 'bun:test';

import type { CalendarOccurrence, Handler, HandlerCalendar } from '@brydio/app/handler';

type Range = Awaited<ReturnType<HandlerCalendar['range']>>;

import { runHandler } from '../src/index.ts';

const manifest = (host: string[] = ['calendar']) => ({
  name: 'calendar',
  version: '0.1.0',
  tools: { custom: [{ name: 'week', description: 'w', handler: 'handlers/week.js' }] },
  grants: { tools: ['*'], collections: ['*'], host },
});

const WEEK = { from: '2026-10-12T00:00:00.000Z', to: '2026-10-19T00:00:00.000Z' };
const STANDUP = { id: 'evt_1', owner: 'user_ada', title: 'Standup', start: '2026-10-12T09:00:00.000Z', end: '2026-10-12T09:15:00.000Z' };

describe('calendar in the fake host (CA02)', () => {
  it('reads the caller’s week, series expanded, with exdates and moved occurrences', async () => {
    const read: Handler<typeof WEEK, Range> = async (query, { calendar }) => calendar.range(query);
    const run = await runHandler(read, WEEK, {
      manifest: manifest() as never,
      caller: { userId: 'user_ada' },
      calendar: {
        events: [
          { ...STANDUP, rrule: 'FREQ=DAILY;COUNT=5', exdates: ['2026-10-14T09:00:00.000Z'] },
          { id: 'evt_2', owner: 'user_ada', title: 'Moved', start: '2026-10-13T11:00:00.000Z', end: '2026-10-13T11:15:00.000Z', series: 'evt_1', originalStart: '2026-10-13T09:00:00.000Z' },
        ],
      },
    });

    expect(run.error).toBeUndefined();
    expect(run.result!.events.map(one => `${one.start.slice(0, 16)} ${one.title}`)).toEqual([
      '2026-10-12T09:00 Standup',
      '2026-10-13T11:00 Moved',
      '2026-10-15T09:00 Standup',
      '2026-10-16T09:00 Standup',
    ]);
    expect(run.result!.events[0]).toMatchObject({ id: 'evt_1@2026-10-12T09:00:00.000Z', series: 'evt_1', editable: true });
  });

  it('shows a colleague busy-only unless they share details', async () => {
    const read: Handler<typeof WEEK, Range> = async (query, { calendar }) => calendar.range({ ...query, people: ['user_sam'] });
    const options = (sharing: 'busy' | 'details') => ({
      manifest: manifest() as never,
      caller: { userId: 'user_ada' },
      calendar: { events: [{ ...STANDUP, owner: 'user_sam' }], people: [{ member: 'user_sam', sharing }] },
    });

    expect((await runHandler(read, WEEK, options('busy'))).result!.events[0]).toMatchObject({ busyOnly: true, editable: false });
    expect((await runHandler(read, WEEK, options('busy'))).result!.events[0]!.title).toBeUndefined();
    expect((await runHandler(read, WEEK, options('details'))).result!.events[0]).toMatchObject({ busyOnly: false, title: 'Standup' });
  });

  it('creates, moves one occurrence, cancels and answers as Brydio does', async () => {
    const write: Handler<Record<string, never>, CalendarOccurrence | null> = async (_input, { calendar }) => {
      const made = await calendar.create({ title: 'Review', start: STANDUP.start, end: STANDUP.end, timeZone: 'UTC', rrule: 'FREQ=WEEKLY', attendees: [{ member: 'user_sam' }, { email: 'G@x.io' }] });
      await calendar.update(`${made!.event}@2026-10-19T09:00:00.000Z`, { title: 'Later', start: '2026-10-19T10:00:00.000Z', end: '2026-10-19T10:15:00.000Z', timeZone: 'UTC' }, { scope: 'this' });
      await calendar.cancel(`${made!.event}@2026-10-26T09:00:00.000Z`, { scope: 'this' });
      return made;
    };
    const run = await runHandler(write, {}, { manifest: manifest() as never, caller: { userId: 'user_ada' }, calendar: { members: ['user_ada', 'user_sam'] } });

    expect(run.error).toBeUndefined();
    expect(run.result!.attendees).toEqual([
      { kind: 'person', member: 'user_sam', response: 'needs_action' },
      { kind: 'email', email: 'g@x.io', response: 'needs_action' },
    ]);
    const series = run.calendar.get(run.result!.event)!;

    expect(series.exdates).toEqual(['2026-10-26T09:00:00.000Z']);
    expect([...run.calendar.values()].find(one => one.series === series.id)).toMatchObject({ title: 'Later', originalStart: '2026-10-19T09:00:00.000Z' });

    const answer: Handler<Record<string, never>, CalendarOccurrence | null> = async (_input, { calendar }) => calendar.respond(series.id, 'accepted');
    const answered = await runHandler(answer, {}, { manifest: manifest() as never, caller: { userId: 'user_sam' }, calendar: { events: [...run.calendar.values()] } });

    expect(answered.result!.attendees![0]).toMatchObject({ member: 'user_sam', response: 'accepted' });
  });

  it('refuses what Brydio refuses: no grant, a read tool writing, someone else’s event, a stranger', async () => {
    const read: Handler<typeof WEEK, Range> = async (query, { calendar }) => calendar.range(query);
    const write: Handler<Record<string, never>> = async (_input, { calendar }) => calendar.cancel('evt_1');
    const stranger: Handler<typeof WEEK, Range> = async (query, { calendar }) => calendar.range({ ...query, people: ['user_nobody'] });

    expect((await runHandler(read, WEEK, { manifest: manifest([]) as never })).error).toBe('calendar did not ask to read and change your calendar. (not_granted)');
    expect((await runHandler(write, {}, { manifest: manifest() as never, write: false, calendar: { events: [STANDUP] } })).error).toContain('(read_tool)');
    expect((await runHandler(write, {}, { manifest: manifest() as never, caller: { userId: 'user_sam' }, calendar: { events: [STANDUP] } })).error).toContain('(calendar_forbidden)');
    expect((await runHandler(stranger, WEEK, { manifest: manifest() as never, caller: { userId: 'user_ada' } })).error).toContain('(calendar_not_found)');
  });
});
