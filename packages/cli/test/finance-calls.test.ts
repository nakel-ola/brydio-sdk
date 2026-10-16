import { expect, test } from 'bun:test';
import { callsOf } from '../src/calls.ts';
test('recognizes Finance, its additional metrics requirement and managed model grants', () => {
  const calls = callsOf(
    'finance.ts',
    `export default async(i,c)=>{await c.finance.documentSource(i);await c.finance.purchaseTemplate({});await c.finance.budgetDashboards({});await c.finance.saveBudgetMetric(i);await c.finance.signatureLink(i);await c.model.generate(i);return c.model.generateMany([]);}`,
  );
  expect(calls.filter((c) => c.kind === 'host').map((c) => c.name)).toEqual([
    'finance',
    'finance',
    'finance',
    'metrics',
    'finance',
    'metrics',
    'finance',
    'sign',
    'model',
    'model',
  ]);
});

test('recognizes read-only accounting export status as Finance', () => {
  const calls = callsOf('status.ts', 'export default (i,c)=>c.finance.accountingStatus(i)');
  expect(calls.filter((call) => call.kind === 'host').map((call) => call.name)).toEqual(['finance']);
});
