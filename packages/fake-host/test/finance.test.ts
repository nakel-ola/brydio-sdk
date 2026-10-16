import { describe, expect, test } from 'bun:test';
import { runHandler } from '../src/handler.ts';
import type { Handler } from '@brydio/app/handler';
const create: Handler = (_, client) => client.finance.createPaymentLink({ invoiceId: 'inv_1' });
const read: Handler = (_, client) => client.finance.getPayment({ invoiceId: 'inv_1' });
const source: Handler = (_, client) => client.finance.receiptSource({ fileId: 'file_1' });
const finance = {
  createPaymentLink: async () => ({
    id: 'pay_1',
    provider: 'stripe' as const,
    url: 'https://checkout.stripe.com/test',
    status: 'pending' as const,
    amountMinor: 1200,
    currency: 'USD',
    expiresAt: '2026-10-17T00:00:00Z',
    paidMinor: 0,
    refundedMinor: 0,
  }),
  getPayment: async () => null,
  receiptSource: async () => ({ id: 'file_1', name: 'receipt.txt', mimeType: 'text/plain',size:12, text: 'Paid USD 12.00', sha256: 'a'.repeat(64), readable: true }),
  sendInvoice: async () => ({ queued: true, pdfFileId: 'pdf_1', url: 'https://brydio.test/p/invoice' }),
};
describe('Finance host capability', () => {
  test('recognizes the grant and refuses missing grant, read writes and visitors', async () => {
    expect((await runHandler(create, {}, { manifest: { name: 'Finance', grants: { host: [] } }, finance })).error).toContain('not_granted');
    expect((await runHandler(create, {}, { manifest: { name: 'Finance', grants: { host: ['finance'] } }, write: false, finance })).error).toContain(
      'read tool',
    );
    expect((await runHandler(create, {}, { manifest: { name: 'Finance', grants: { host: ['finance'] } }, write: true, finance })).result).toMatchObject({
      id: 'pay_1',
      amountMinor: 1200,
    });
    expect(
      (await runHandler(read, {}, { manifest: { name: 'Finance', grants: { host: ['finance'] } }, caller: { role: 'anonymous' }, finance })).error,
    ).toContain("can't use finance");
  });
  test('reads a payment and receipt source with a read tool and records calls', async () => {
    const result = await runHandler(source, {}, { manifest: { name: 'Finance', grants: { host: ['finance'] } }, write: false, finance });
    expect(result.result).toMatchObject({ id: 'file_1', text: 'Paid USD 12.00' });
    expect((await runHandler(read, {}, { manifest: { name: 'Finance', grants: { host: ['finance'] } }, write: false, finance })).result).toBeNull();
  });
  test('fails explicitly when Finance is unavailable', async () => {
    expect((await runHandler(read, {}, { manifest: { name: 'Finance', grants: { host: ['finance'] } } })).error).toContain('finance_unavailable');
  });
});
