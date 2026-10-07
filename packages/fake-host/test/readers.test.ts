import { describe, expect, test } from 'bun:test';

import { FixtureStore } from '../src/index.ts';

/** Records that name their readers in the fake host, as Brydio's store keeps them (P16). */

const DOCS = {
  data: {
    pages: { schema: { title: 'string', readers: 'string[]' }, label: 'page', readers: 'readers' },
  },
  tools: { generated: true },
} as never;

const error = (result: { isError?: boolean; structuredContent?: unknown }) =>
  result.isError ? (result.structuredContent as { error?: string }).error : null;

describe('record readers in the fixture store', () => {
  test('lets the people a record names find it, and nobody else', async () => {
    const store = new FixtureStore(DOCS, {
      pages: [
        { id: 'secret', title: 'Salaries', readers: ['user_test'] },
        { id: 'theirs', title: 'Their plan', readers: ['user_other'] },
        { id: 'open', title: 'Roadmap', readers: [] },
      ],
    });
    const tools = store.tools();
    const titles = async () => ((await tools.list_pages!({})).structuredContent as { items: { title: string }[] }).items.map(one => one.title).sort();

    expect(await titles()).toEqual(['Roadmap', 'Salaries']);
    expect(error(await tools.get_page!({ id: 'theirs' }))).toBe('not_found');
    expect(error(await tools.update_page!({ id: 'theirs', version: 1, title: 'Mine' }))).toBe('not_found');

    store.viewer = 'user_other';
    expect(await titles()).toEqual(['Roadmap', 'Their plan']);
    expect(error(await tools.get_page!({ id: 'secret' }))).toBe('not_found');

    store.viewer = null;
    expect(await titles()).toEqual(['Roadmap']);
  });
});

describe('record editors in the fixture store (DW06)', () => {
  const POLICY = {
    data: { pages: { schema: { title: 'string', editors: 'string[]' }, label: 'page', editors: 'editors' } },
    tools: { generated: true },
  } as never;

  test('lets everyone read a record, and only the people it names change it', async () => {
    const store = new FixtureStore(POLICY, { pages: [{ id: 'p', title: 'Policy', editors: ['user_ada'] }] });
    const tools = store.tools();

    expect(error(await tools.get_page!({ id: 'p' }))).toBeNull();
    expect(error(await tools.update_page!({ id: 'p', version: 1, title: 'Mine' }))).toBe('not_granted');
    expect(error(await tools.delete_page!({ id: 'p' }))).toBe('not_granted');

    store.viewer = 'user_ada';
    expect(error(await tools.update_page!({ id: 'p', version: 1, title: 'Ada’s' }))).toBeNull();
  });
});
