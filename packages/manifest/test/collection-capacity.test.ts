import { expect, test } from 'bun:test';
import { storedExtensionsSchema } from '../src/schema.ts';
import { FIELD_LIMITS } from '../src/field-types.ts';
const sample = (count: number) => ({ data: Object.fromEntries(Array.from({ length: count }, (_, i) => [`records_${i}`, { schema: { title: 'string' } }])) });
test('accepts forty app collections and refuses forty-one while preserving the field limit', () => {
  expect(storedExtensionsSchema.safeParse(sample(40)).success).toBe(true);
  expect(storedExtensionsSchema.safeParse(sample(41)).success).toBe(false);
  expect(FIELD_LIMITS.fields).toBe(40);
});
