import { build } from '@brydio/cli';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FakeHost, FixtureStore, type StoreChange } from '../src/index.ts';

/** An anonymous collection in the fake host, as Brydio's store keeps one (P13). */

const SURVEY = {
  data: {
    answers: {
      schema: { round: 'number', mood: ['good', 'bad'], comment: 'text?' },
      label: 'answer',
      anonymous: { group: 'round' },
    },
  },
  tools: { generated: true },
} as never;

const DAY = '2026-09-12T00:00:00.000Z';
const error = (result: { isError?: boolean; structuredContent?: unknown }) =>
  result.isError ? (result.structuredContent as { error?: string }).error : null;

describe('anonymous answers in the fixture store', () => {
  test('are kept by nobody, at the start of their day, and told to nobody', async () => {
    const store = new FixtureStore(SURVEY);
    const heard: StoreChange[] = [];

    store.onChange(change => void heard.push(change));

    const made = await store.tools().create_answer!({ round: 1, mood: 'good', comment: 'Fine' });

    expect(made.structuredContent).toEqual({ id: 'answer_1', version: 1, round: 1, mood: 'good', comment: 'Fine', createdAt: DAY, updatedAt: DAY });
    expect(heard).toEqual([]);

    await store.tools().delete_answer!({ id: 'answer_1' });
    expect(heard).toEqual([]);
  });

  test('are never changed, batched or made naming the person testing', async () => {
    const store = new FixtureStore(SURVEY, { answers: [{ id: 'a', round: 1, mood: 'good' }] });
    const tools = store.tools();

    expect(error(await tools.update_answer!({ id: 'a', version: 1, mood: 'bad' }))).toBe('anonymous_immutable');
    expect(error(await tools.batch_answers!({ changes: [{ op: 'create', fields: { round: 1, mood: 'good' } }] }))).toBe('anonymous_immutable');
    expect(error(await tools.create_answer!({ round: 1, mood: 'good', comment: 'by user_fixture' }))).toBe('anonymous_names_writer');
    expect(() => store.put('answers', { id: 'a', mood: 'bad' })).toThrow('never changed');
  });

  test('are read one whole group of five or more at a time', async () => {
    const seeds = [1, 2, 3, 4].map(n => ({ id: `a${n}`, round: 1, mood: n < 3 ? 'bad' : 'good' }));
    const store = new FixtureStore(SURVEY, { answers: [...seeds, { id: 'b1', round: 2, mood: 'good' }] });
    const tools = store.tools();

    expect(error(await tools.list_answers!({}))).toBe('anonymous_needs_group');
    expect(error(await tools.list_answers!({ filter: { mood: 'good' } }))).toBe('anonymous_needs_group');

    const few = await tools.list_answers!({ filter: { round: 1 } });

    expect(error(few)).toBe('too_few_answers');
    expect(few.structuredContent).toEqual({ error: 'too_few_answers' });
    // The code is in the words too, for a screen that hears only those.
    expect(few.content![0]!.text).toContain('(too_few_answers)');
    expect(error(await tools.get_answer!({ id: 'a1' }))).toBe('too_few_answers');

    store.put('answers', { round: 1, mood: 'good' });

    const page = (await tools.list_answers!({ filter: { round: 1 }, limit: 2 })).structuredContent as { items: Record<string, unknown>[] };

    expect(page.items).toHaveLength(2);
    for (const item of page.items) expect(Object.keys(item)).not.toContain('createdBy');
    expect(error(await tools.get_answer!({ id: 'a1' }))).toBeNull();
    // A filter narrowing the group under five, or another group, reads nothing.
    expect(error(await tools.list_answers!({ filter: { round: 1, mood: 'bad' } }))).toBe('too_few_answers');
    expect(error(await tools.list_answers!({ filter: { round: 2 } }))).toBe('too_few_answers');
    expect(error(await tools.get_answer!({ id: 'b1' }))).toBe('too_few_answers');
  });
});

describe('a screen watching an anonymous collection', () => {
  const app = join(import.meta.dir, 'fixtures', 'plain');
  const manifest = JSON.parse(readFileSync(join(app, '.brydio/app.json'), 'utf8'));
  let host: FakeHost | null = null;

  beforeAll(async () => {
    expect((await build(app, { minify: false, checkSource: false })).problems).toEqual([]);
  });

  afterEach(() => {
    host?.stop();
    host = null;
  });

  test('is ended as Brydio ends it, in words', async () => {
    const anonymous = {
      ...manifest,
      data: { ...manifest.data, elsewhere: { schema: { round: 'number' }, label: 'answer', anonymous: { group: 'round' } } },
    };

    host = FakeHost.start({ entry: join(app, 'dist', 'screens', 'watched.js'), manifest: anonymous, fixtures: { notes: [{ id: 'note_a', title: 'First' }] } });

    await host.mounted();
    await host.waitFor(() => host!.byText('Elsewhere: answers are anonymous, so their changes aren’t told as they happen. Read them again instead. (anonymous_no_watch)'), {
      what: 'the refused watch',
    });

    expect(host.watching).toEqual(['notes']);
  });
});

describe('removing a whole anonymous group, unread (P13 delete-only)', () => {
  test('takes every answer of the group, even under five, and says the same however many', async () => {
    const store = new FixtureStore(SURVEY);
    const heard: StoreChange[] = [];

    store.onChange(change => void heard.push(change));
    for (const mood of ['good', 'bad', 'good'] as const) await store.tools().create_answer!({ round: 2, mood });
    await store.tools().create_answer!({ round: 3, mood: 'good' });

    expect(error(await store.tools().list_answers!({ filter: { round: 2 } }))).toBe('too_few_answers');
    expect(store.removeGroup('answers', 2)).toEqual({ removedGroup: 2 });
    expect(store.records('answers').map(one => one.round)).toEqual([3]);
    expect(store.removeGroup('answers', 9)).toEqual({ removedGroup: 9 });
    expect(heard).toEqual([]);
  });

  test('refuses outside an anonymous collection, and without one group', () => {
    const store = new FixtureStore({ data: { ...((SURVEY as { data: object }).data), notes: { schema: { text: 'string' }, label: 'note' } }, tools: { generated: true } } as never);

    expect(() => store.removeGroup('notes', 'x')).toThrow('(not_anonymous)');
    expect(() => store.removeGroup('answers', '')).toThrow('(anonymous_needs_group)');
    expect(() => store.removeGroup('answers', { round: 1 })).toThrow('(anonymous_needs_group)');
  });

  test('reaches a handler as data.removeGroup, from a write tool and never a visitor', async () => {
    const { runHandler } = await import('../src/index.ts');
    const store = new FixtureStore(SURVEY);
    const data = { removeGroup: async (collection: string, group: string | number | boolean) => store.removeGroup(collection, group) as never };
    const clear = async ({ round }: { round: number }, client: { data: { removeGroup: (c: string, g: number) => Promise<unknown> } }) => client.data.removeGroup('answers', round);

    await store.tools().create_answer!({ round: 4, mood: 'good' });

    expect((await runHandler(clear as never, { round: 4 }, { data: data as never })).result).toEqual({ removedGroup: 4 });
    expect(store.records('answers')).toEqual([]);
    expect((await runHandler(clear as never, { round: 4 }, { data: data as never, write: false })).error).toContain('read tool');
    expect((await runHandler(clear as never, { round: 4 }, { data: data as never, caller: { origin: 'public' } })).error).toContain('never change or remove');
  });
});
