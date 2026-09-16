import { describe, expect, test } from 'bun:test';

import { FixtureStore, type StoreChange } from '../src/index.ts';

const MANIFEST = { data: { issues: { schema: { title: 'string', status: ['todo', 'done'], rank: 'number?' }, label: 'issue' } } } as never;

describe('batch_<plural>, several writes under one approval (G13)', () => {
  test('applies creates, updates and deletes in order, all at once, and a watch hears them only after', () => {
    const store = new FixtureStore(MANIFEST, { issues: [{ id: 'a', title: 'A', status: 'todo', rank: 5 }, { id: 'b', title: 'B', status: 'todo', rank: 5 }] });
    const heard: StoreChange[] = [];

    store.onChange(change => heard.push(change));

    const result = store.tools().batch_issues!({
      changes: [
        { op: 'update', id: 'a', version: 1, fields: { rank: 1024 } },
        { op: 'update', id: 'b', version: 1, fields: { rank: 2048, status: 'done' } },
        { op: 'create', fields: { title: 'C', status: 'todo' } },
        { op: 'delete', id: 'a' },
      ],
    }) as { structuredContent: { changes: { op: string; id: string }[] }; content: { text: string }[]; isError?: boolean };

    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toBe('Create 1 issue, change 2 issues, delete 1 issue: done.');
    expect(result.structuredContent.changes.map(one => [one.op, one.id])).toEqual([['update', 'a'], ['update', 'b'], ['create', 'issue_1'], ['delete', 'a']]);
    expect(store.records('issues').map(one => [one.id, one.status, one.rank, one.version])).toEqual([['b', 'done', 2048, 2], ['issue_1', 'todo', undefined, 1]]);
    expect(heard.map(one => `${one.op} ${one.id}`)).toEqual(['update a', 'update b', 'create issue_1', 'delete a']);
  });

  test('refuses the whole batch at the first change its single write would refuse, naming it, and writes nothing', () => {
    const store = new FixtureStore(MANIFEST, { issues: [{ id: 'a', title: 'A', status: 'todo' }, { id: 'b', title: 'B', status: 'todo' }] });
    const heard: StoreChange[] = [];

    store.onChange(change => heard.push(change));

    const stale = store.tools().batch_issues!({
      changes: [
        { op: 'update', id: 'a', version: 1, fields: { rank: 1 } },
        { op: 'update', id: 'b', version: 7, fields: { rank: 2 } },
      ],
    }) as { isError: boolean; content: { text: string }[]; structuredContent: { error: string; change: number } };

    expect(stale.isError).toBe(true);
    expect(stale.content[0]!.text).toBe('Change 2 of 2: This issue changed since you read it. Here it is as it is now; make the change again on version 1. Nothing in the batch was written.');
    expect(stale.structuredContent).toMatchObject({ error: 'stale', change: 1 });

    const invalid = store.tools().batch_issues!({ changes: [{ op: 'create', fields: { title: 'C', status: 'blocked' } }] }) as { isError: boolean; content: { text: string }[] };

    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]!.text).toStartWith('Change 1 of 1: status:');
    expect(store.records('issues').map(one => [one.id, one.rank, one.version])).toEqual([['a', undefined, 1], ['b', undefined, 1]]);
    expect(heard).toEqual([]);
  });
});
