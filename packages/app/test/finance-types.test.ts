import { expect, test } from 'bun:test';
import type { FinanceTransactionExportInput, FinanceTransactionExportSettings } from '../src/handler.ts';
const settings: FinanceTransactionExportSettings = { csv: true, xlsx: false, delimiter: ',', includeReceipts: false, idempotencyKey: 'export_1' };
const selected: FinanceTransactionExportInput = { ...settings, ids: ['tx_1'] };
const filtered: FinanceTransactionExportInput = { ...settings, selection: { currency: 'USD', assignee: 'user_1' } };
// @ts-expect-error A start has one source selector, not both.
const both: FinanceTransactionExportInput = { ...settings, ids: ['tx_1'], selection: { currency: 'USD' } };
// @ts-expect-error A start requires an explicit source selector.
const neither: FinanceTransactionExportInput = { ...settings };
test('export types distinguish bounded selected rows, server-side filters and retry', () => {
  expect('ids' in selected).toBe(true);
  expect('selection' in filtered).toBe(true);
  const retry: FinanceTransactionExportInput = { exportId: 'job_1', retry: true };
  expect(retry.retry).toBe(true);
  void both;
  void neither;
});

test('catalog and public document types expose normalized choices and share-scoped files',()=>{
  const request: import('../src/handler.ts').AccountingCatalogRequest={provider:'xero',companyId:'company',kind:'contacts',cursor:'opaque'};
  const document: import('../src/handler.ts').PublicFinanceDocument={title:'Shared',markdown:'Public text',files:[{id:'opaque_file',name:'file.pdf',url:'https://brydio.test/share/download'}],expiresAt:'2026-10-17T00:00:00.000Z'};
  expect(request.kind).toBe('contacts');expect(document.files[0]!.id).toBe('opaque_file');
});
