import { expect, test } from 'bun:test';
import { callsOf } from '../src/calls.ts';

test('recognizes People operations as the People capability', () => {
  const calls = callsOf('people.ts', "export default async (input, client) => client.people.call('context', input)");
  expect(calls.filter(call => call.kind === 'host').map(call => call.name)).toEqual(['people']);
  expect(calls.filter(call => call.kind === 'tool')).toEqual([]);
});
