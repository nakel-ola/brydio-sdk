import { describe, expect, test } from 'bun:test';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';
import { FIELD_LIMITS, isStructured, parseFieldType, valueProblem } from '../src/field-types.ts';

describe('the limits a record is held to, as Brydio holds them', () => {
  test('a short text takes 1,000 characters, what bry-input lets a person type, and no more', () => {
    const title = parseFieldType('string');

    expect(FIELD_LIMITS.stringChars).toBe(1_000);
    expect(valueProblem('title', title, 'x'.repeat(1_000))).toBeNull();
    expect(valueProblem('title', title, 'x'.repeat(1_001))).toBe('title is longer than 1,000 characters.');
  });
});

describe('field defaults and choice labels, as Brydio reads them (A3-F01-S01, A8-F01-S04)', () => {
  const SERVER_TYPES = 'apps/api/src/apps/manifest/field-types.ts';

  const cases: unknown[] = [
    'boolean',
    ['todo', 'done'],
    { type: ['todo', 'doing', 'done'], optional: true, default: 'todo' },
    { type: 'boolean?', default: false },
    { type: 'date', optional: true },
    { type: 'string?', default: 'Untitled' },
    { type: ['todo', 'done'], default: 'todo' },
    { type: ['low', 'high'], optional: true, default: 'urgent' },
    { type: 'boolean?', default: 'yes' },
    { kind: 'string' },
    { optional: true },
    { type: ['todo', 'doing', 'done'], labels: { todo: 'To do', done: 'Done' } },
    { type: 'string', labels: { a: 'A' } },
    { type: ['todo', 'done'], labels: { blocked: 'Blocked' } },
    { type: ['low', 'high'], labels: { low: '' } },
    { type: ['s', 'l'], labels: { l: 'x'.repeat(61) } },
    { type: ['s', 'l'], labels: ['S'] },
  ];

  const outcome = (parse: (raw: unknown) => unknown, raw: unknown) => {
    try {
      return { type: parse(raw) };
    } catch (error) {
      return { code: (error as { code?: string }).code };
    }
  };

  test('reads a default on an optional choice or boolean, and refuses the rest by code', () => {
    expect(cases.map(raw => outcome(parseFieldType, raw))).toEqual([
      { type: { kind: 'boolean', optional: false } },
      { type: { kind: 'enum', optional: false, values: ['todo', 'done'] } },
      { type: { kind: 'enum', optional: true, values: ['todo', 'doing', 'done'], default: 'todo' } },
      { type: { kind: 'boolean', optional: true, default: false } },
      { type: { kind: 'date', optional: true } },
      { code: 'data_default_not_allowed' },
      { code: 'data_default_on_required' },
      { code: 'data_default_invalid' },
      { code: 'data_default_invalid' },
      { code: 'data_field_key_unknown' },
      { code: 'data_field_type_unknown' },
      { type: { kind: 'enum', optional: false, values: ['todo', 'doing', 'done'], labels: { todo: 'To do', done: 'Done' } } },
      { code: 'data_labels_not_allowed' },
      { code: 'data_label_unknown_value' },
      { code: 'data_label_invalid' },
      { code: 'data_label_invalid' },
      { code: 'data_label_invalid' },
    ]);
  });

  test("answers every case exactly as brydio's field-types.ts does", async () => {
    const server = await brydioAnswers('field-types', [SERVER_TYPES], async () => {
      const { parseFieldType: parse } = (await import(inBrydio(SERVER_TYPES))) as { parseFieldType: (raw: unknown) => unknown };

      return cases.map(raw => outcome(parse, raw));
    });

    expect(JSON.parse(JSON.stringify(cases.map(raw => outcome(parseFieldType, raw))))).toEqual(server);
  });
});

describe('what is kept in plain, as Brydio keeps it (A3-F01-S02)', () => {
  test('words are never filterable: short text, long text and a list of words', () => {
    for (const raw of ['string', 'text?', 'string[]']) expect(isStructured(parseFieldType(raw))).toBe(false);
    for (const raw of [['a', 'b'], 'member?', 'project?', 'date', 'number', 'boolean', 'token']) expect(isStructured(parseFieldType(raw))).toBe(true);
  });
});

