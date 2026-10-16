import type { ApprovalStepInput, HandlerRecord } from './handler.ts';
/** Host-owned Finance capabilities. These operations never pay or refund money. */
export interface InvoicePaymentInput {
  invoiceId: string;
  provider?: 'stripe' | 'paystack';
}
/** Latest checkout identity with aggregate verified settlement facts across attempts. */
export interface InvoicePayment {
  id: string;
  provider: 'stripe' | 'paystack';
  url: string | null;
  status: 'pending' | 'partial' | 'paid' | 'refunded' | 'failed';
  amountMinor: number;
  currency: string;
  paidMinor: number;
  refundedMinor: number;
  expiresAt: string;
  /** True when verified provider facts could not yet update the app record. */
  projectionPending?: boolean;
}
export interface ReceiptSource {
  id: string;
  name: string;
  mimeType: string;
  text: string;
  sha256: string;
  readable: boolean;
  size: number;
}
/** Permission-checked file metadata, bounded extracted text and its host file URL. */
export interface FinanceDocumentSource extends ReceiptSource {
  size: number;
  url: string;
}
export interface CanonicalTransaction {
  title: string;
  accountKey: string;
  amountMinor: number;
  currency: string;
  date: string;
  vendor: string;
  description: string;
  reference: string | null;
  balanceMinor: number | null;
  sourceId: string;
  dedupKey: string;
  category: string;
  department: string;
  receiptId: null;
  excluded: boolean;
}
export interface AccountingExportInput {
  provider: 'xero' | 'quickbooks';
  companyId: string;
  kind: 'invoice' | 'expense' | 'transaction';
  id: string;
  revision: number;
  mapping: {
    contactId: string;
    bankAccountId?: string;
    accountCode?: string;
    taxCode: string;
    itemId?: string;
    discountTaxCode?: string;
    lineMappings?: { accountCode?: string; taxCode?: string; itemId?: string }[];
  };
}
/** Reads the durable export without creating or retrying a provider request. */
export interface AccountingStatusRequest {
  provider: 'xero' | 'quickbooks';
  companyId: string;
  kind: 'invoice' | 'expense' | 'transaction';
  id: string;
}
export interface AccountingStatus {
  status: 'not_exported' | 'pending' | 'partial' | 'uncertain' | 'exported';
  providerId?: string;
  entityType?: string;
  sourceRevision?: number;
  attachments: number;
  error?: string;
}
export interface AccountingExportResult {
  status: 'exported';
  providerId: string;
  entityType: string;
  key: string;
  provider: 'xero' | 'quickbooks';
  companyId: string;
  attachments: number;
}
export interface FinancePurchaseTemplate {
  id: string;
  kind: string;
  builtin: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  enabled: boolean;
  fields: { key: string; label: string; type: string; required?: boolean; options?: string[]; help?: string }[];
  /** Native template steps can include conditions and Directory routing. The host reloads these by templateId when submitting. */
  steps: ApprovalStepInput[];
  policy: {
    remindAfterHours?: number;
    remindEveryHours?: number;
    remindMax?: number;
    escalateAfterHours?: number | null;
    escalateTo?: 'manager' | 'admins';
    expireAfterDays?: number | null;
  } | null;
}
export interface FinanceBudgetMetric {
  budgetId: string;
  metricId: string;
  dashboardId: string;
  revision: number;
  target: number;
  unit: string;
}
/** CSV mapping serialized into previewTransactions.mapping. Column names refer to the uploaded header row. */
export interface FinanceCsvMapping {
  accountKey: string;
  currency: string;
  dateColumn: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  descriptionColumn?: string;
  vendorColumn?: string;
  referenceColumn?: string;
  currencyColumn?: string;
  balanceColumn?: string;
  dateFormat: 'YMD' | 'DMY' | 'MDY';
  delimiter: ',' | ';' | '\t';
  decimal: '.' | ',';
  grouping: '' | ',' | '.' | ' ' | "'";
  amountMode: 'signed' | 'debit-credit';
  invert: boolean;
}
export interface FinanceCsvHeaderMapping {
  action: 'headers';
  delimiter: ',' | ';' | '\t';
}
/** A bounded server-side transaction filter; omitted properties do not constrain the selection. */
export interface FinanceTransactionSelection {
  currency?: string;
  from?: string;
  to?: string;
  search?: string;
  category?: string;
  department?: string;
  assignee?: string;
  reviewStatus?: string;
  missingReceipt?: boolean;
  excluded?: boolean;
}
export interface FinanceTransactionExportSettings {
  csv: boolean;
  xlsx: boolean;
  delimiter: ',' | ';' | '\t';
  includeReceipts: boolean;
  email?: string;
  copySender?: boolean;
  idempotencyKey: string;
}
/** Select up to 50 explicit IDs or all caller-visible matching rows (at most 5,000), never both. */
export type FinanceTransactionExportInput =
  | (FinanceTransactionExportSettings & ({ ids: string[]; selection?: never } | { ids?: never; selection: FinanceTransactionSelection }))
  | { exportId: string; retry: true };
export interface FinanceTransactionExport {
  exportId: string;
  status: 'queued' | 'reading' | 'files' | 'attachments' | 'email' | 'ready' | 'error';
  files: { id: string; name: string; url: string }[];
  error?: string;
  completed: number;
  total: number;
}
/** Requires the finance grant, the current member and current instance access. */
export interface HandlerFinance {
  /** Write tool. Creates or recovers a checkout using the saved invoice, never caller-supplied totals. */
  createPaymentLink(input: InvoicePaymentInput): Promise<InvoicePayment>;
  getPayment(input: { invoiceId: string }): Promise<InvoicePayment | null>;
  receiptSource(input: { fileId: string }): Promise<ReceiptSource>;
  documentSource(input: { fileId: string }): Promise<FinanceDocumentSource>;
  registerReceipt(input: {
    fileId: string;
    source: 'upload' | 'chat';
    title?: string;
    readers?: string[];
  }): Promise<{ receipt: HandlerRecord; source: ReceiptSource }>;
  transactionSource(input: { fileId: string }): Promise<{ id: string; name: string; text: string; sha256: string }>;
  /** Host validates the complete bounded source, then returns at most 50 canonical rows. */
  previewTransactions(input: { fileId: string; mapping: string; cursor?: string }): Promise<{
    sha256: string;
    name: string;
    headers: string[];
    totalRows: number;
    errors: { row: number; message: string }[];
    totalErrors: number;
    duplicates: number;
    warnings: string[];
    rows: CanonicalTransaction[];
    nextCursor: string | null;
  }>;
  /** Screen-only write. Starts or retries a durable file/receipt/email export job. */
  exportTransactions(input: FinanceTransactionExportInput): Promise<FinanceTransactionExport>;
  exportStatus(input: { exportId: string }): Promise<FinanceTransactionExport>;
  importTransactions(input: { accountKey: string; rows: CanonicalTransaction[] }): Promise<{ created: number; duplicates: number }>;
  /** Write tool. Stable deliveryKey recovers the same delivery; a new explicit key permits a reminder delivery. */
  sendInvoice(input: { invoiceId: string; deliveryKey?: string }): Promise<{ queued: boolean; pdfFileId: string; url: string }>;
  invoicePdf(input: { invoiceId: string }): Promise<{ pdfFileId: string }>;
  /** Public-page exception: the host validates token, page and instance binding before exposing invoice data. */
  publicInvoice(input: { token: string }): Promise<Record<string, unknown>>;
  cancelInvoice(input: { invoiceId: string; reason?: string }): Promise<{ cancelled: boolean }>;
  recordManualPayment(input: { invoiceId: string; amountMinor: number; date: string; reason: string }): Promise<HandlerRecord>;
  clearManualPayment(input: { invoiceId: string; reason: string }): Promise<HandlerRecord>;
  dateInZone(input: { at: string; zone: string }): Promise<{ date: string }>;
  purchaseTemplate(input: Record<string, never>): Promise<FinancePurchaseTemplate>;
  /** Also requires sign; the host validates the current instance’s envelope before returning its native page URL. */
  signatureLink(input: { requestId: string }): Promise<{ url: string }>;
  /** Also requires metrics. Lists only dashboards the caller can edit. */
  budgetDashboards(input: Record<string, never>): Promise<{ dashboards: { id: string; name: string; canEdit: true }[] }>;
  /** Write tool, also requires metrics. Binds an editable native dashboard metric to the canonical saved budget. */
  saveBudgetMetric(input: { budgetId: string; dashboardId: string }): Promise<FinanceBudgetMetric>;
  accountingCompanies(input: { provider: 'xero' | 'quickbooks' }): Promise<{ companies: { id: string; name: string }[] }>;
  accountingAccounts(input: { provider: 'xero' | 'quickbooks'; companyId: string }): Promise<{ accounts: Record<string, unknown>[] }>;
  /** Also requires the provider connection; checks current source and receipt permissions before reading durable progress. */
  accountingStatus(input: AccountingStatusRequest): Promise<AccountingStatus>;
  /** Write tool, also requires the provider connection. The host loads and validates the exact canonical source revision. */
  exportAccounting(input: AccountingExportInput): Promise<AccountingExportResult>;
}
