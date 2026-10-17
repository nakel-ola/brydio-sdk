import { expect, test } from 'bun:test';
import { isHostCapability, unknownHostGrant } from '../src/index.ts';

test('accepts the People grant without broadening Directory access', () => {
  expect(isHostCapability('people')).toBe(true);
  expect(unknownHostGrant({ grants: { host: ['people'] } })).toBeNull();
  expect(unknownHostGrant({ grants: { host: ['people-private'] } })?.code).toBe('grant_unknown');
});
