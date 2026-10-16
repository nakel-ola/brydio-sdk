import { expect, test } from 'bun:test';
import { storedExtensionsSchema } from '../src/schema.ts';
const tools = (count: number) => ({
  tools: {
    generated: false,
    custom: Array.from({ length: count }, (_, i) => ({
      name: `action_${i}`,
      description: 'A specific action with its own audit and permission.',
      handler: 'handlers/action.js',
      input: {},
    })),
  },
});
test('accepts one hundred explicit app actions and refuses one hundred and one', () => {
  expect(storedExtensionsSchema.safeParse(tools(100)).success).toBe(true);
  expect(storedExtensionsSchema.safeParse(tools(101)).success).toBe(false);
});
