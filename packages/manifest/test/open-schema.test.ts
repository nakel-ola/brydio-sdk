import { describe, expect, test } from 'bun:test';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';

import {
  OPEN_LIMITS,
  OPEN_TYPES,
  appManifestSchema,
  collectionsOf,
  dataProblems,
  definitionOf,
  describeField,
  keyFromName,
  keyProblem,
  moveValue,
  openSpec,
  openValueProblem,
  validateManifest,
  type OpenField,
} from '../src/index.ts';
import { OPEN_SCHEMA_MANIFEST } from './open-schema-manifest.fixture.ts';

const SERVER_SCHEMA = 'apps/api/src/apps/manifest/manifest-ext.schema.ts';
const SERVER_OPEN = 'apps/api/src/apps/manifest/open-schema.ts';
const SERVER_FIXTURE = 'apps/api/src/apps/manifest/open-schema-manifest.fixture.ts';

type Data = Record<string, { schema: Record<string, unknown>; openSchema?: { fields: string; table?: string }; label?: string }>;

const data = (): Data => JSON.parse(JSON.stringify(OPEN_SCHEMA_MANIFEST.data)) as Data;
const codes = (changed: Data) =>
  dataProblems({ data: changed } as never, { grants: false })
    .filter(problem => problem.code.startsWith('data_open'))
    .map(problem => `${problem.code}${problem.field ? `:${problem.field}` : ''}`);

const def = (over: Partial<OpenField>): OpenField => ({
  id: 'col_1',
  key: 'amount',
  name: 'Amount',
  type: 'text',
  table: 't1',
  choices: [],
  required: false,
  ...over,
});

/** The manifests both sides are asked about: each a change to the Database fixture. */
function corpus(): Data[] {
  const missing = data();
  missing.rows!.openSchema = { fields: 'nothing', table: 'table' };

  const itself = data();
  itself.rows!.openSchema = { fields: 'rows' };

  const nested = data();
  nested.columns!.openSchema = { fields: 'tables' };

  const bare = data();
  delete bare.columns!.schema.key;
  bare.columns!.schema.name = 'string?';
  bare.columns!.schema.type = ['text', 'spreadsheet'];
  bare.columns!.schema.required = 'string?';

  const kinds = data();
  kinds.columns!.schema.choices = 'string';
  kinds.columns!.schema.precision = 'string?';
  kinds.columns!.schema.description = 'text?';

  const notChoice = data();
  notChoice.columns!.schema.type = 'string';

  const oneSide = data();
  delete oneSide.columns!.schema.table;

  const optional = data();
  optional.rows!.schema.table = 'string?';

  const twice = data();
  twice.more = { schema: { table: 'string' }, openSchema: { fields: 'columns', table: 'table' } };

  const untabled = data();
  delete untabled.rows!.openSchema!.table;

  return [data(), missing, itself, nested, bare, kinds, notChoice, oneSide, optional, twice, untabled];
}

/** One answer per manifest: what the schema read and what `dataProblems` said, sentences and all. */
function answers(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  problems: (additions: never, options: { grants: boolean }) => unknown[],
) {
  return corpus().map(changed => {
    const manifest = { ...OPEN_SCHEMA_MANIFEST, data: changed };
    const parsed = schema.safeParse(manifest);

    return { ok: parsed.success, data: parsed.success ? (parsed.data as { data: unknown }).data : null, problems: problems({ data: changed } as never, { grants: false }) };
  });
}

/** The value moves both sides are asked about. */
const MOVES = [
  ['text', 'number', '1,200'],
  ['text', 'number', 'big'],
  ['number', 'text', 42],
  ['number', 'currency', 42],
  ['number', 'rating', 4.4],
  ['number', 'rating', 40],
  ['text', 'checkbox', 'Yes'],
  ['text', 'checkbox', 'perhaps'],
  ['text', 'date', '2026-10-01T09:00:00Z'],
  ['date', 'datetime', '2026-10-01'],
  ['text', 'select', 'WON'],
  ['text', 'select', 'big'],
  ['text', 'multi_select', 'won, lost, other'],
  ['multi_select', 'select', ['lost', 'won']],
  ['select', 'multi_select', 'won'],
  ['multi_select', 'text', ['won', 'lost']],
  ['person', 'text', 'user_1'],
  ['text', 'person', 'Sam'],
  ['text', 'url', 'not a url'],
  ['link', 'attachment', ['rec_1']],
] as const;

const NAMES = ['Deal size', '2026 target', 'Café ☕', 'Version', '', 'A very long field name that goes on and on and on'];

describe('the openSchema collection flag (P5)', () => {
  test('accepts the Database shape and reads it into the spec', () => {
    expect(appManifestSchema.safeParse(OPEN_SCHEMA_MANIFEST).success).toBe(true);
    expect(validateManifest(OPEN_SCHEMA_MANIFEST).problems).toEqual([]);

    const specs = collectionsOf(OPEN_SCHEMA_MANIFEST);
    const rows = specs.find(one => one.name === 'rows')!;
    const columns = specs.find(one => one.name === 'columns')!;

    expect(rows.openSchema).toEqual({ fields: 'columns', table: 'table' });
    expect(columns.definesFieldsOf).toBe('rows');
    // The table is kept plain on both sides, so it filters and counts.
    expect(rows.fields.table).toEqual({ kind: 'string', optional: false, plain: true });
    expect(rows.structured).toContain('table');
    expect(rows.sortable).toContain('table');
    expect(columns.structured).toContain('table');
    expect(specs.find(one => one.name === 'tables')).not.toHaveProperty('openSchema');
    expect(specs.find(one => one.name === 'tables')).not.toHaveProperty('definesFieldsOf');
  });

  test('reads a collection with no table field as one table per instance', () => {
    const untabled = corpus()[10]!;
    const rows = collectionsOf({ data: untabled } as never).find(one => one.name === 'rows')!;

    expect(codes(untabled)).toEqual([]);
    expect(rows.openSchema).toEqual({ fields: 'columns', table: null });
    expect(rows.fields.table).toEqual({ kind: 'string', optional: false });
  });

  test('takes the flag only as fields and an optional table', () => {
    const extra = { ...OPEN_SCHEMA_MANIFEST, data: { ...data(), rows: { ...data().rows, openSchema: { fields: 'columns', view: 'grid' } } } };
    const empty = { ...OPEN_SCHEMA_MANIFEST, data: { ...data(), rows: { ...data().rows, openSchema: { fields: '' } } } };

    expect(validateManifest(extra).problems[0]).toMatchObject({ code: 'manifest_invalid', path: 'data.rows.openSchema' });
    expect(validateManifest(empty).problems[0]).toMatchObject({ code: 'manifest_invalid', path: 'data.rows.openSchema.fields' });
  });

  test('refuses a companion that is missing, itself, or open itself', () => {
    const [, missing, itself, nested] = corpus();

    expect(codes(missing!)).toEqual(['data_open_fields_unknown']);
    expect(codes(itself!)).toEqual(['data_open_fields_unknown']);
    expect(codes(nested!)).toContain('data_open_fields_unknown');
    expect(validateManifest({ ...OPEN_SCHEMA_MANIFEST, data: missing }).problems).toEqual([
      {
        code: 'data_open_fields_unknown',
        path: 'data.rows',
        message: 'rows.openSchema.fields names nothing, which must be another collection of this app.',
      },
    ]);
  });

  test('refuses a companion without key, name and type as the host reads them', () => {
    const [, , , , bare, kinds, notChoice] = corpus();

    expect(codes(bare!)).toEqual(['data_open_fields_shape:key', 'data_open_fields_shape:name', 'data_open_fields_shape:type', 'data_open_fields_shape:required']);
    // `description` may be short or long text; the rest must be the kind Brydio reads.
    expect(codes(kinds!)).toEqual(['data_open_fields_shape:choices', 'data_open_fields_shape:precision']);
    expect(codes(notChoice!)).toEqual(['data_open_fields_shape:type']);
  });

  test('refuses a table field missing on one side, or optional', () => {
    const [, , , , , , , oneSide, optional] = corpus();

    expect(codes(oneSide!)).toEqual(['data_open_table_unknown:table']);
    expect(codes(optional!)).toEqual(['data_open_table_unknown:table']);
  });

  test('refuses one companion for two collections', () => {
    const twice = corpus()[9]!;

    expect(codes(twice)).toEqual(['data_open_fields_unknown']);
    expect(dataProblems({ data: twice } as never, { grants: false }).at(-1)?.message).toBe("columns already defines rows's fields; give more its own.");
  });

  test('folds a table’s live fields into the spec: plain types filter and sort, lists filter only, words neither', () => {
    const rows = collectionsOf(OPEN_SCHEMA_MANIFEST).find(one => one.name === 'rows')!;
    const spec = openSpec(rows, [
      def({ key: 'amount', type: 'currency' }),
      def({ key: 'tags', type: 'multi_select', choices: ['a'] }),
      def({ key: 'notes', type: 'long_text' }),
      def({ key: 'stage', type: 'select', choices: ['won', 'lost'] }),
      def({ key: 'site', type: 'url' }),
    ]);

    expect(spec.structured).toEqual(['table', 'amount', 'tags', 'stage']);
    expect(spec.sortable).toEqual(['table', 'amount', 'stage']);
    expect(spec.search).toEqual(['title', 'notes']);
    expect(spec.fields.stage).toMatchObject({ kind: 'enum', values: ['won', 'lost'], optional: true });
  });

  test('is the server’s fixture, field for field', async () => {
    const server = await brydioAnswers('open-schema-fixture', [SERVER_FIXTURE], async () => (await import(inBrydio(SERVER_FIXTURE))).OPEN_SCHEMA_MANIFEST);

    expect(JSON.parse(JSON.stringify(OPEN_SCHEMA_MANIFEST))).toEqual(server);
  });

  test('accepts and refuses exactly what the server does, in its words', async () => {
    const server = await brydioAnswers('open-schema-manifests', [SERVER_SCHEMA, SERVER_OPEN], async () => {
      const theirs = await import(inBrydio(SERVER_SCHEMA));

      return answers(theirs.appManifestSchema, theirs.dataProblems);
    });

    expect(JSON.parse(JSON.stringify(answers(appManifestSchema, dataProblems as never)))).toEqual(server);
  });
});

describe('field definitions and their values (P5)', () => {
  test('makes a key from a name, free and never reserved', () => {
    expect(keyFromName('Deal size', new Set())).toBe('deal_size');
    expect(keyFromName('Deal size', new Set(['deal_size', 'deal_size_2']))).toBe('deal_size_3');
    expect(keyFromName('2026 target', new Set())).toBe('f_2026_target');
    expect(keyFromName('Café ☕', new Set())).toBe('cafe');
    expect(keyFromName('Version', new Set())).toBe('version_2');
    expect(keyFromName('', new Set())).toBe('field');
    expect(keyProblem('Bad key', new Set(), new Set())).toMatch(/letters, digits/);
    expect(keyProblem('title', new Set(['title']), new Set())).toMatch(/already keeps/);
    expect(keyProblem('amount', new Set(), new Set(['amount']))).toMatch(/already a field of this table/);
    expect(keyProblem('amount', new Set(), new Set())).toBeNull();
  });

  test('says what the store’s own types cannot: web addresses, emails, ratings, dates, choices', () => {
    expect(openValueProblem(def({ type: 'url' }), 'javascript:alert(1)')).toMatch(/web address/);
    expect(openValueProblem(def({ type: 'url' }), 'https://acme.com')).toBeNull();
    expect(openValueProblem(def({ type: 'email' }), 'nobody')).toMatch(/email/);
    expect(openValueProblem(def({ type: 'rating' }), 11)).toMatch(/0 to 10/);
    expect(openValueProblem(def({ type: 'rating' }), 2.5)).toMatch(/whole number/);
    expect(openValueProblem(def({ type: 'date' }), '2026-10-01T10:00:00Z')).toMatch(/YYYY-MM-DD/);
    expect(openValueProblem(def({ type: 'datetime' }), '2026-10-01')).toMatch(/date and time/);
    expect(openValueProblem(def({ type: 'multi_select', choices: ['a', 'b'] }), ['a', 'c'])).toMatch(/only "a", "b"/);
    expect(openValueProblem(def({ type: 'multi_select', choices: ['a'] }), ['a', 'a'])).toMatch(/twice/);
    expect(OPEN_LIMITS).toEqual({ rowsPerTable: 50_000, fieldsPerTable: 200, ratingMax: 10 });
    expect(OPEN_TYPES).toHaveLength(17);
  });

  test('reads a companion record as a definition, and refuses one it cannot read', () => {
    expect(definitionOf('col_1', { table: 't1', key: 'stage', name: 'Stage', type: 'select', choices: ['won'], required: true }, 'table')).toEqual(
      def({ key: 'stage', name: 'Stage', type: 'select', choices: ['won'], required: true }),
    );
    expect(definitionOf('col_1', { key: 'stage', name: 'Stage', type: 'select' }, 'table')).toBeNull();
    expect(definitionOf('col_1', { key: 'stage', name: 'Stage', type: 'spreadsheet' }, null)).toBeNull();
    expect(describeField(def({ key: 'deal_size', name: 'Deal size', type: 'currency', currency: 'USD', required: true }))).toBe(
      'deal_size ("Deal size"): currency, USD, required',
    );
  });

  test.each([
    ['text', 'number', '1,200', { outcome: 'converted', value: 1200 }],
    ['text', 'number', 'big', { outcome: 'cleared' }],
    ['number', 'text', 42, { outcome: 'converted', value: '42' }],
    ['number', 'currency', 42, { outcome: 'kept', value: 42 }],
    ['number', 'rating', 4.4, { outcome: 'converted', value: 4 }],
    ['number', 'rating', 40, { outcome: 'cleared' }],
    ['text', 'checkbox', 'Yes', { outcome: 'converted', value: true }],
    ['text', 'checkbox', 'perhaps', { outcome: 'cleared' }],
    ['text', 'date', '2026-10-01T09:00:00Z', { outcome: 'converted', value: '2026-10-01' }],
    ['date', 'datetime', '2026-10-01', { outcome: 'converted', value: '2026-10-01T00:00:00.000Z' }],
    ['text', 'select', 'WON', { outcome: 'converted', value: 'won' }],
    ['text', 'multi_select', 'won, lost, other', { outcome: 'converted', value: ['won', 'lost'] }],
    ['multi_select', 'select', ['lost', 'won'], { outcome: 'converted', value: 'lost' }],
    ['select', 'multi_select', 'won', { outcome: 'converted', value: ['won'] }],
    ['multi_select', 'text', ['won', 'lost'], { outcome: 'converted', value: 'won, lost' }],
    ['person', 'text', 'user_1', { outcome: 'kept', value: 'user_1' }],
    ['text', 'person', 'Sam', { outcome: 'cleared' }],
    ['text', 'url', 'not a url', { outcome: 'cleared' }],
    ['link', 'attachment', ['rec_1'], { outcome: 'cleared' }],
  ] as const)('moves %s → %s: %j', (from, to, value, moved) => {
    const choices = ['won', 'lost'];

    expect(moveValue(value, def({ type: from, choices }), def({ type: to, choices }))).toEqual(moved as never);
  });

  test('clears a choice no longer offered and keeps one that is', () => {
    const before = def({ type: 'select', choices: ['lead', 'won', 'lost'] });
    const after = def({ type: 'select', choices: ['lead', 'won'] });

    expect(moveValue('won', before, after)).toEqual({ outcome: 'kept', value: 'won' });
    expect(moveValue('lost', before, after)).toEqual({ outcome: 'cleared' });
  });

  test('moves values and makes keys exactly as the server does', async () => {
    const ask = (move: typeof moveValue, key: typeof keyFromName) => ({
      moves: MOVES.map(([from, to, value]) => move(value, def({ type: from, choices: ['won', 'lost'] }), def({ type: to, choices: ['won', 'lost'] }))),
      keys: NAMES.map(name => key(name, new Set(['deal_size']))),
    });
    const server = await brydioAnswers('open-schema-values', [SERVER_OPEN], async () => {
      const theirs = await import(inBrydio(SERVER_OPEN));

      return ask(theirs.moveValue, theirs.keyFromName);
    });

    expect(JSON.parse(JSON.stringify(ask(moveValue, keyFromName)))).toEqual(server);
  });
});
