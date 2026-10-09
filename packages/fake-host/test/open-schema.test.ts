import { describe, expect, test } from 'bun:test';

import { FixtureStore, type StoreChange, type ToolResultShape } from '../src/index.ts';
import { OPEN_SCHEMA_MANIFEST } from '../../manifest/test/open-schema-manifest.fixture.ts';

/** The Database app's store, with a table `t1` of two fields and a row or two. */
function database(options: { rowsPerTable?: number } = {}) {
  const store = new FixtureStore(
    OPEN_SCHEMA_MANIFEST,
    {
      rows: [
        { id: 'row_1', table: 't1', title: 'Acme', amount: '1,200', stage: 'won' },
        { id: 'row_2', table: 't1', title: 'Globex', amount: 'big', stage: 'lost' },
      ],
      columns: [
        { id: 'col_amount', table: 't1', key: 'amount', name: 'Amount', type: 'text', choices: [] },
        { id: 'col_stage', table: 't1', key: 'stage', name: 'Stage', type: 'select', choices: ['lead', 'won', 'lost'] },
      ],
    },
    options,
  );
  const tools = store.tools();
  const call = async (tool: string, input: Record<string, unknown>) => (await tools[tool]!(input)) as ToolResultShape;
  const said = (result: ToolResultShape) => result.content?.[0]?.text;
  const row = (id: string) => store.records('rows').find(one => one.id === id)!;

  return { store, call, said, row };
}

describe('an open-schema collection in the fake host (P5)', () => {
  test('seeds field definitions before the rows they check, and keeps open values by key', () => {
    const { row } = database();

    expect(row('row_1')).toMatchObject({ table: 't1', title: 'Acme', amount: '1,200', stage: 'won' });
  });

  test('takes open fields by key on create, and refuses an unknown key naming the table’s fields', async () => {
    const { call, said, store } = database();
    const made = await call('create_row', { table: 't1', title: 'Initech', amount: '90', stage: 'lead' });

    expect(made.isError).toBeUndefined();
    expect(store.records('rows').at(-1)).toMatchObject({ amount: '90', stage: 'lead' });

    const unknown = await call('create_row', { table: 't1', colour: 'red' });

    expect(unknown.isError).toBe(true);
    expect(said(unknown)).toBe("colour is not a field of this row's table; its fields are table, title, amount, stage.");
  });

  test('holds values to the live definitions: choices, required on create only, and the table on every write', async () => {
    const { call, said, store } = database();

    expect(said(await call('create_row', { table: 't1', stage: 'maybe' }))).toMatch(/^stage must be one of/);
    // The tool's arguments refuse a row with no table; so does the store, for a write from elsewhere.
    expect(said(await call('create_row', { title: 'Nowhere' }))).toBe('table: Invalid input: expected string, received undefined.');
    expect(() => store.put('rows', { table: '', title: 'Nowhere' })).toThrow('table names the table this row belongs to, and is required.');

    await call('create_column', { table: 't1', name: 'Owner email', type: 'email', choices: [], required: true });
    expect(said(await call('create_row', { table: 't1', title: 'No owner' }))).toBe('owner_email ("Owner email") is required.');
    expect(said(await call('create_row', { table: 't1', owner_email: 'nobody' }))).toBe('owner_email ("Owner email") must be an email address.');

    // An older row is never stuck: required is checked on create only.
    const older = store.records('rows')[0]!;
    const renamed = await call('update_row', { id: older.id, version: older.version, title: 'Acme Ltd' });

    expect(renamed.isError).toBeUndefined();
    expect(said(await call('update_row', { id: older.id, version: 2, table: 't2' }))).toBe('A row stays in its table: table never changes.');
  });

  test('a table’s fields are its own: another table neither sees nor takes them', async () => {
    const { call, said } = database();

    expect(said(await call('create_row', { table: 't2', amount: '5' }))).toBe("amount is not a field of this row's table; its fields are table, title.");
  });

  test('fills a key from the name, keeps it on rename, and refuses a taken, reserved or changed key', async () => {
    const { call, said, store } = database();
    const made = await call('create_column', { table: 't1', name: 'Deal size', type: 'currency', choices: [] });

    expect(made.structuredContent).toMatchObject({ key: 'deal_size' });
    expect(said(await call('create_column', { table: 't1', key: 'amount', name: 'Amount again', type: 'number', choices: [] }))).toBe(
      'key "amount" is already a field of this table.',
    );
    expect(said(await call('create_column', { table: 't1', key: 'title', name: 'Title', type: 'text', choices: [] }))).toBe(
      'key "title" is a field Brydio or the app already keeps.',
    );
    expect(said(await call('create_column', { table: 't1', name: 'Status', type: 'select', choices: [] }))).toBe('A select field needs at least one choice.');

    const deal = store.records('columns').at(-1)!;
    const renamed = await call('update_column', { id: deal.id, version: 1, name: 'Deal value' });

    expect(renamed.structuredContent).toMatchObject({ key: 'deal_size', name: 'Deal value' });
    expect(renamed.structuredContent).not.toHaveProperty('fieldChange');
    expect(said(await call('update_column', { id: deal.id, version: 2, key: 'deal_value' }))).toBe(
      "A field's key never changes, so rows and tools keep finding it; change its name instead.",
    );
    expect(said(await call('update_column', { id: deal.id, version: 2, table: 't2' }))).toBe('A field stays in its table: table never changes.');
  });

  test('a retype converts or clears each value, and says how many', async () => {
    const { call, row, store } = database();
    const heard: StoreChange[] = [];

    store.onChange(change => void heard.push(change));

    const retyped = await call('update_column', { id: 'col_amount', version: 1, type: 'number' });

    expect((retyped.structuredContent as { fieldChange: unknown }).fieldChange).toEqual({ field: 'amount', op: 'retype', rows: 2, kept: 0, converted: 1, cleared: 1 });
    expect(row('row_1')).toMatchObject({ amount: 1200, version: 2, updatedOrigin: 'migration' });
    expect(row('row_2')).not.toHaveProperty('amount');
    expect(heard.map(change => `${change.collection} ${change.id} ${change.op}`)).toEqual(['rows row_1 update', 'rows row_2 update', 'columns col_amount update']);

    // Now a number: it filters and sorts once the filter names the table.
    const listed = await call('list_rows', { filter: { table: 't1', amount: 1200 }, sort: { field: 'amount' } });

    expect((listed.structuredContent as { items: { id: string }[] }).items.map(item => item.id)).toEqual(['row_1']);
  });

  test('fewer choices clear the values no longer offered; a delete takes the field’s values with it', async () => {
    const { call, row } = database();
    const narrowed = await call('update_column', { id: 'col_stage', version: 1, choices: ['lead', 'won'] });

    expect((narrowed.structuredContent as { fieldChange: unknown }).fieldChange).toEqual({ field: 'stage', op: 'choices', rows: 2, kept: 1, converted: 0, cleared: 1 });
    expect(row('row_1')).toMatchObject({ stage: 'won' });
    expect(row('row_2')).not.toHaveProperty('stage');

    await call('delete_column', { id: 'col_amount' });
    expect(row('row_1')).not.toHaveProperty('amount');
    expect(row('row_2')).not.toHaveProperty('amount');
  });

  test('lists filter and sort open fields only when the filter names the table', async () => {
    const { call, said } = database();

    expect(said(await call('list_rows', { filter: { stage: 'won' } }))).toBe("stage: name the table in the filter to filter or sort on a table's own fields.");
    expect(said(await call('list_rows', { filter: { table: 't1' }, sort: { field: 'title' } }))).toBe('title is not a field a list can be sorted by.');

    const won = await call('list_rows', { filter: { table: 't1', stage: 'won' } });

    expect((won.structuredContent as { items: { id: string }[] }).items.map(item => item.id)).toEqual(['row_1']);
    // Words are sealed: an open text field never filters.
    expect(said(await call('list_rows', { filter: { table: 't1', amount: '1,200' } }))).toBe('amount is not a field a list can be filtered by.');
  });

  test('refuses a row once its table is full, and a batch that moved values undoes all of it', async () => {
    const { call, said, row } = database({ rowsPerTable: 2 });

    expect(said(await call('create_row', { table: 't1' }))).toBe('This table already holds 2 rows, the most one table may hold. Delete some to make room.');
    expect((await call('create_row', { table: 't2' })).isError).toBeUndefined();

    const batch = await call('batch_columns', {
      changes: [
        { op: 'update', id: 'col_amount', version: 1, fields: { type: 'number' } },
        { op: 'update', id: 'col_stage', version: 1, fields: { key: 'phase' } },
      ],
    });

    expect(batch.isError).toBe(true);
    expect(row('row_1')).toMatchObject({ amount: '1,200', version: 1 });
  });
});

describe('range and set operators in the fixture store (P5)', () => {
  test('filter an open table as Brydio does', async () => {
    const { FixtureStore } = await import('../src/index.ts');
    const store = new FixtureStore({
      data: {
        columns: { schema: { table: 'string', key: 'string?', name: 'string', type: ['number', 'date', 'select', 'multi_select', 'person', 'link', 'checkbox', 'text'], choices: 'string[]' } },
        rows: { schema: { table: 'string' }, openSchema: { fields: 'columns', table: 'table' } },
      },
      tools: { generated: true },
    } as never);
    const tools = store.tools();

    for (const [name, type, choices] of [['Amount', 'number', []], ['Due', 'date', []], ['Stage', 'select', ['won', 'lost', 'open']], ['Tags', 'multi_select', ['vip', 'new']], ['Owner', 'person', []], ['Links', 'link', []], ['Paid', 'checkbox', []]] as const) {
      await tools.create_column!({ table: 't', name, type, choices: [...choices] });
    }
    const rows = [
      { amount: 5, due: '2026-10-01', stage: 'won', tags: ['vip'], owner: 'user_a', links: ['r1', 'r2'], paid: true },
      { amount: 50, due: '2026-10-20', stage: 'lost', tags: ['vip', 'new'], owner: 'user_b', links: ['r3'], paid: false },
      { amount: 500, stage: 'open', tags: [], links: [] },
    ];

    for (const row of rows) await tools.create_row!({ table: 't', ...row });
    const amounts = async (filter: Record<string, unknown>) =>
      ((await tools.list_rows!({ filter: { table: 't', ...filter }, sort: { field: 'amount', dir: 'asc' } })).structuredContent as { items: { amount: number }[] }).items.map(one => one.amount);

    expect(await amounts({ amount: { gte: 50 } })).toEqual([50, 500]);
    expect(await amounts({ amount: { between: [1, 60] } })).toEqual([5, 50]);
    expect(await amounts({ due: { lt: '2026-10-10' } })).toEqual([5]);
    expect(await amounts({ due: { empty: true } })).toEqual([500]);
    expect(await amounts({ stage: { anyOf: ['won', 'open'] } })).toEqual([5, 500]);
    expect(await amounts({ stage: { noneOf: ['won'] } })).toEqual([50, 500]);
    expect(await amounts({ tags: { containsAll: ['vip', 'new'] } })).toEqual([50]);
    expect(await amounts({ tags: { containsAny: ['new'] } })).toEqual([50]);
    expect(await amounts({ owner: { in: ['user_a', 'user_z'] } })).toEqual([5]);
    expect(await amounts({ links: { in: ['r3', 'r9'] } })).toEqual([50]);
    expect(await amounts({ paid: { is: true } })).toEqual([5]);
    expect((await tools.list_rows!({ filter: { table: 't', amount: { near: 3 } } })).isError).toBe(true);
  });
});
