import { describe, expect, test } from 'bun:test';
import { runHandler } from '../src/handler.ts';
import type { Handler, HandlerFinance } from '@brydio/app/handler';
const methods = ['documentSource', 'purchaseTemplate', 'budgetDashboards', 'saveBudgetMetric'] as const;
describe('Finance additive host operations', () => {
  for (const method of methods)
    test(method + ' enforces finance, metrics, visitor and write gates', async () => {
      const fn: Handler = (_, c) => (c.finance[method] as (input: unknown) => Promise<unknown>)({});
      const finance = { [method]: async (input: unknown) => ({ method, input }) } as unknown as Partial<HandlerFinance>;
      expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: [] } }, finance })).error).toContain('not_granted');
      expect(
        (await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['finance', 'metrics'] } }, finance, caller: { role: 'anonymous' } })).error,
      ).toContain("can't use finance");
      if (method === 'saveBudgetMetric')
        expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['finance', 'metrics'] } }, finance, write: false })).error).toContain(
          'read tool',
        );
      else
        expect(
          (await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['finance', 'metrics'] } }, finance, write: false })).result,
        ).toMatchObject({ method });
      if (method === 'saveBudgetMetric' || method === 'budgetDashboards')
        expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['finance'] } }, finance })).error).toContain('Metrics');
      expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['finance', 'metrics'] } }, finance })).result).toMatchObject({ method });
    });
  test('model calls refuse a missing model grant before invoking the fixture', async () => {
    let calls = 0;
    const model = {
      generate: async <T>() => {
        calls++;
        return { value: 1 } as T;
      },
      generateMany: async <T>() => {
        calls++;
        return [] as T[];
      },
    };
    for (const many of [false, true]) {
      const before = calls;
      const fn: Handler = (_, c) => (many ? c.model.generateMany([]) : c.model.generate({ prompt: 'x', schema: {} }));
      expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: [] } }, model })).error).toContain('not_granted');
      expect(calls).toBe(before);
      expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['model'] } }, model })).error).toBeUndefined();
    }
  });
});

test('accounting read fixtures also need the exact provider connection grant', async () => {
  const fn: Handler = (_, c) => c.finance.accountingCompanies({ provider: 'xero' });
  const finance = { accountingCompanies: async () => ({ companies: [{ id: 'tenant', name: 'Example' }] }) };
  expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['finance'] } }, finance })).error).toContain('connection');
  expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['finance', 'connection:xero'] } }, finance, write: false })).result).toEqual(
    { companies: [{ id: 'tenant', name: 'Example' }] },
  );
});

test('durable export starts require a screen and write tool; status and preview are reads', async () => {
  const manifest = { name: 'finance', grants: { host: ['finance'] } };
  const job = { exportId: 'export_1', status: 'queued' as const, files: [], completed: 0, total: 2 };
  const finance = {
    exportTransactions: async () => job,
    exportStatus: async () => job,
    previewTransactions: async () => ({
      sha256: 'a'.repeat(64),
      name: 'statement.csv',
      headers: ['Date', 'Amount'],
      totalRows: 0,
      totalErrors: 0,
      duplicates: 0,
      warnings: [],
      errors: [],
      rows: [],
      nextCursor: null,
    }),
  };
  const start: Handler = (_, c) =>
    c.finance.exportTransactions({ ids: ['t1'], csv: true, xlsx: true, delimiter: ',', includeReceipts: true, idempotencyKey: 'export_1' });
  expect((await runHandler(start, {}, { manifest, finance })).error).toContain('screen_only');
  expect((await runHandler(start, {}, { manifest, finance, caller: { origin: 'screen' }, write: false })).error).toContain('read tool');
  expect((await runHandler(start, {}, { manifest, finance, caller: { origin: 'screen' }, write: true })).result).toEqual(job);
  const status: Handler = (_, c) => c.finance.exportStatus({ exportId: 'export_1' });
  expect((await runHandler(status, {}, { manifest, finance, write: false })).result).toEqual(job);
  const preview: Handler = (_, c) => c.finance.previewTransactions({ fileId: 'statement', mapping: '{}' });
  expect((await runHandler(preview, {}, { manifest, finance, write: false })).result).toMatchObject({ totalRows: 0, rows: [] });
  expect((await runHandler(preview, {}, { manifest: { name: 'finance', grants: { host: [] } }, finance, write: false })).error).toContain('not_granted');
});

test('native signature links require both Finance and sign and work as a read', async () => {
  const fn: Handler = (_, c) => c.finance.signatureLink({ requestId: 'sig_1' });
  const finance = { signatureLink: async () => ({ url: 'https://brydio.test/signatures?id=sig_1' }) };
  expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['finance'] } }, finance, write: false })).error).toContain('not_granted');
  expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['sign'] } }, finance, write: false })).error).toContain('not_granted');
  expect((await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['finance', 'sign'] } }, finance, write: false })).result).toEqual({
    url: 'https://brydio.test/signatures?id=sig_1',
  });
  expect(
    (await runHandler(fn, {}, { manifest: { name: 'finance', grants: { host: ['finance', 'sign'] } }, finance, caller: { role: 'anonymous' } })).error,
  ).toContain("can't use finance");
});

for (const method of ['cancelInvoice', 'recordManualPayment', 'clearManualPayment'] as const)
  test(method + ' requires a screen caller before invoking its fixture', async () => {
    let calls = 0;
    const finance = {
      [method]: async () => {
        calls++;
        return { done: true };
      },
    } as unknown as Partial<HandlerFinance>;
    const manifest = { name: 'finance', grants: { host: ['finance'] } };
    const handler: Handler = (_, c) =>
      (c.finance[method] as (input: unknown) => Promise<unknown>)({ invoiceId: 'inv_1', amountMinor: 100, date: '2026-10-16', reason: 'Verified receipt' });
    for (const origin of ['assistant', 'timer'] as const)
      expect((await runHandler(handler, {}, { manifest, finance, caller: { origin }, write: true })).error).toContain('screen_only');
    expect(calls).toBe(0);
    expect((await runHandler(handler, {}, { manifest, finance, caller: { origin: 'screen' }, write: false })).error).toContain('read tool');
    expect((await runHandler(handler, {}, { manifest, finance, caller: { origin: 'screen' }, write: true })).result).toEqual({ done: true });
    expect(calls).toBe(1);
  });

for (const provider of ['xero', 'quickbooks'] as const) {
  test(provider + ' accounting status is a read with current Finance and exact connection grants', async () => {
    const input = { provider, companyId: 'company_1', kind: 'invoice' as const, id: 'invoice_1' };
    const handler: Handler = (_, c) => c.finance.accountingStatus(input);
    let calls = 0;
    const finance = { accountingStatus: async (actual: typeof input) => {
      calls++;
      expect(actual).toEqual(input);
      return { status: 'not_exported' as const, attachments: 0 };
    } };
    const granted = { name: 'finance', grants: { host: ['finance', `connection:${provider}`] } };
    for (const host of [[], ['finance'], [`connection:${provider}`], ['finance', `connection:${provider === 'xero' ? 'quickbooks' : 'xero'}`]])
      expect((await runHandler(handler, {}, { manifest: { name: 'finance', grants: { host } }, finance, write: false })).error).toContain('not_granted');
    expect((await runHandler(handler, {}, { manifest: granted, finance, write: false, caller: { role: 'anonymous' } })).error).toContain("can't use finance");
    expect(calls).toBe(0);
    expect((await runHandler(handler, {}, { manifest: granted, finance, write: false })).result).toEqual({ status: 'not_exported', attachments: 0 });
    expect(calls).toBe(1);
    expect((await runHandler(handler, {}, { manifest: granted, write: false })).error).toContain('finance_unavailable');
  });
}

test('accounting status preserves durable states and provider details without an export write', async () => {
  for (const status of ['not_exported', 'pending', 'partial', 'uncertain', 'exported'] as const) {
    const result = { status, providerId: 'remote_1', entityType: 'Invoice', sourceRevision: 3, attachments: 2, error: 'Reconcile the provider result' };
    const handler: Handler = (_, c) => c.finance.accountingStatus({ provider: 'xero', companyId: 'tenant_1', kind: 'expense', id: 'claim_1' });
    expect((await runHandler(handler, {}, {
      manifest: { name: 'finance', grants: { host: ['finance', 'connection:xero'] } },
      finance: { accountingStatus: async () => result }, write: false,
    })).result).toEqual(result);
  }
});
