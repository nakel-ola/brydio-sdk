import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { FIELD_LIMITS, parseFieldType, valueProblem } from '../src/field-types.ts';

describe('the limits a record is held to, as Brydio holds them', () => {
  test('a short text takes 1,000 characters, what bry-input lets a person type, and no more', () => {
    const title = parseFieldType('string');

    expect(FIELD_LIMITS.stringChars).toBe(1_000);
    expect(valueProblem('title', title, 'x'.repeat(1_000))).toBeNull();
    expect(valueProblem('title', title, 'x'.repeat(1_001))).toBe('title is longer than 1,000 characters.');
  });
});

describe('field defaults, as Brydio reads them (A3-F01-S01)', () => {
  const brydio = process.env.BRYDIO_DIR ?? join(import.meta.dir, '..', '..', '..', '..', 'brydio');
  const serverTypes = join(brydio, 'apps/api/src/apps/manifest/field-types.ts');

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
    ]);
  });

  test.if(existsSync(serverTypes))("answers every case exactly as brydio's field-types.ts does", async () => {
    const server = (await import(serverTypes)) as { parseFieldType: (raw: unknown) => unknown };

    expect(cases.map(raw => outcome(parseFieldType, raw))).toEqual(cases.map(raw => outcome(server.parseFieldType, raw)));
  });
});
