import { describe, expect, test } from 'bun:test';

import { FIELD_LIMITS, parseFieldType, valueProblem } from '../src/field-types.ts';

describe('the limits a record is held to, as Brydio holds them', () => {
  test('a short text takes 1,000 characters, what bry-input lets a person type, and no more', () => {
    const title = parseFieldType('string');

    expect(FIELD_LIMITS.stringChars).toBe(1_000);
    expect(valueProblem('title', title, 'x'.repeat(1_000))).toBeNull();
    expect(valueProblem('title', title, 'x'.repeat(1_001))).toBe('title is longer than 1,000 characters.');
  });
});
