import { describe, expect, test } from 'bun:test';

import { FixtureStore } from '../src/index.ts';

const MANIFEST = {
  data: { pages: { schema: { title: 'string', status: ['draft', 'done'], body: { type: 'text?', coedit: true }, board: 'canvas' }, label: 'page' } },
} as never;

type Result = { isError?: boolean; structuredContent?: Record<string, unknown> };

describe('a co-edited field in the fake host, as in Brydio (DW01)', () => {
  test('a change to it alone is not version-checked and keeps the version', () => {
    const store = new FixtureStore(MANIFEST, { pages: [{ id: 'p', title: 'Plan', status: 'draft', body: 'One.', version: 3 }] });

    const result = store.tools().update_page!({ id: 'p', version: 1, body: 'One.\n\nTwo.' }) as Result;

    expect(result.isError).toBeUndefined();
    expect(store.records('pages')[0]).toMatchObject({ body: 'One.\n\nTwo.', version: 3 });
  });

  test('an ordinary field beside it is still version-checked and moves the version', () => {
    const store = new FixtureStore(MANIFEST, { pages: [{ id: 'p', title: 'Plan', status: 'draft', body: 'One.', version: 3 }] });

    expect((store.tools().update_page!({ id: 'p', version: 1, status: 'done', body: 'x' }) as Result).isError).toBe(true);
    expect((store.tools().update_page!({ id: 'p', version: 3, status: 'done' }) as Result).isError).toBeUndefined();
    expect(store.records('pages')[0]).toMatchObject({ status: 'done', version: 4, body: 'One.' });
  });

  test('a drawing is never written by a tool: the input leaves it out (WB01)', () => {
    const store = new FixtureStore(MANIFEST, { pages: [{ id: 'p', title: 'Plan', status: 'draft', version: 1 }] });

    store.tools().update_page!({ id: 'p', version: 1, board: { elements: 9, text: 'x' } });
    expect(store.records('pages')[0]).not.toHaveProperty('board');
  });
});
