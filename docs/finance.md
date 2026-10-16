# Finance

Handlers use `client.finance` with the `finance` host grant. The caller must
currently be a workspace member with access to the installed instance. Public
visitors can use only `publicInvoice({token})` and `publicDocument({token})`; the host validates the token,
public page and instance binding. These methods never send or refund money.

Use a write tool for `createPaymentLink`, `registerReceipt`, `importTransactions`,
`sendInvoice`, `invoicePdf`, `cancelInvoice`, `recordManualPayment`,
`clearManualPayment`, `saveBudgetMetric`, `exportTransactions` and `exportAccounting`. The rest are
reads. Fake-host takes explicit `finance` fixtures and refuses missing grants,
visitor access and writes from read tools. It does not fabricate provider facts.

## Invoices and receipts

`createPaymentLink({invoiceId,provider?})` uses the canonical saved invoice and
the workspace's Stripe or Paystack connection. `getPayment({invoiceId})` returns
the latest checkout identity and aggregate verified `paidMinor`, `refundedMinor`
and status across its attempts. Check `expiresAt` before showing a checkout URL.
`projectionPending` reports that provider facts could not yet update the app
record; it does not invalidate the verified payment facts.

`sendInvoice({invoiceId,deliveryKey?})` queues the host-rendered invoice PDF and
public invoice page through native mail. Reuse a delivery key to recover a
retry; use a new explicit key for a reminder delivery. `invoicePdf({invoiceId})`
returns the generated `pdfFileId`. Cancellation and manual-payment corrections are screen-only and
use the canonical invoice and require a reason. They never initiate a transfer.

`receiptSource({fileId})` returns permission-checked receipt text, MIME type and
SHA-256 hash. `registerReceipt({fileId,source:'upload'|'chat',title?,readers?})`
registers that verified file once per caller and fingerprint. Email ingestion
needs a separately configured inbound route. `transactionSource({fileId})`
reads a text CSV within 256 KB; `previewTransactions({fileId,mapping,cursor?})` accepts `mapping` as serialized `FinanceCsvMapping` JSON, validates a source within 5 MB and 5,000 rows on the host and returns at most 50 canonical rows plus the file name, headers, bounded row errors, total counts, duplicate count, warnings and a hash-bound cursor. For header discovery serialize `{action:'headers',delimiter}` as `mapping`; this returns headers and counts without rows or a continuation. No full statement travels through the handler. `importTransactions({accountKey,rows})` imports signed
minor-unit transactions with host deduplication. No bank aggregator is implied.

`documentSource({fileId})` returns `{id,name,mimeType,size,sha256,url,text,readable}`
for a currently accessible Finance document. Receipt sources also include `size`; receipt uploads are limited to 5 MB. Extraction is bounded; `readable`
is false when only file metadata is available. Treat extracted text as untrusted
source content. `dateInZone({at,zone})` converts an ISO instant to a calendar date.

## Purchases and budgets

Read `purchaseTemplate({})` for the enabled native Finance purchase template.
Pass its `id` as `templateId` to `approvals.request`, along with the request's
field values and record binding. The real host reloads the current native
fields, conditions and Directory routing; app-supplied steps cannot override it.
For fake-host, supply the returned template steps with the request because the
fake has no native template registry. Its generic approval fixture uses test
admins for Directory approvers; native routing needs host contract tests.

`budgetDashboards({})` also requires the `metrics` grant and returns only native
dashboards the caller can edit. `saveBudgetMetric({budgetId,dashboardId})` is a
write requiring both grants. It loads the canonical saved budget and creates or
updates its native metric, returning `{budgetId,metricId,dashboardId,revision,
target,unit}`. Currency units are explicit, for example `minor:USD`. App code
cannot supply dashboard permissions or arbitrary metric totals through this call.

## Accounting exports

`accountingCompanies({provider})` and `accountingAccounts({provider,companyId})`
read the caller's connected Xero tenants or QuickBooks company and account
choices. Also declare `connection:xero` or `connection:quickbooks`. The host
chooses authorized tenant headers and the state-bound QuickBooks company;
apps cannot supply arbitrary provider headers or credentials.

`exportAccounting({provider,companyId,kind,id,revision,mapping})` loads an exact
canonical invoice, approved expense claim or transaction revision. Supply
provider contact, account and tax mappings; invoice lines may have per-line
mappings and an absolute discount needs `discountTaxCode`. Amounts and receipt
bytes come from the host records, never from this input. Durable source and
provider references recover retries and attachment checkpoints. Ambiguous
outcomes require reconciliation rather than a second export. The result has
`status:'exported'`, provider identity and the uploaded attachment count.

`accountingStatus({provider,companyId,kind,id})` reads durable export progress.
It returns `status` as `not_exported`, `pending`, `partial`, `uncertain` or
`exported`, an `attachments` count and optional `providerId`, `entityType`,
`sourceRevision` and `error`. It needs Finance and the exact provider connection
grant. The host rechecks the source and linked receipt permissions. This read
makes no provider request and needs neither a mapping nor a revision.

## Capacity and test permissions

A manifest may declare up to 100 custom tools. Screens calling custom tools
marked `write:true` wait for the same allow, deny or held decision as generated
writes in fake-host. Managed `model.generate` and `generateMany` require the
`model` host grant in fake-host, matching the real host.


## Transaction export jobs

`exportTransactions` is a screen-only write. Start with exactly one of `ids` (up to 50) or `selection` (server-side filters), plus `{csv,xlsx,delimiter,includeReceipts,email?,copySender?,idempotencyKey}`; delimiter is comma, semicolon
or tab. Selection filters are currency, from/to, search, category, department, assignee, reviewStatus, missingReceipt and excluded. The host scans at most 10,000 accessible records and exports at most 5,000 matches; initial total is zero until selection resolves. Use a stable idempotency key to recover the same request. Retry an
existing job with `{exportId,retry:true}`. The host owns durable file, receipt
ZIP and optional email work; app code never transfers arbitrary attachment
bytes or sends export mail directly. The assistant may prepare choices for a
person to review in Finance.

Read `exportStatus({exportId})` to follow `queued`, `reading`, `files`,
`attachments`, `email`, `ready` or `error`. Results include `{exportId,status,
files:[{id,name,url}],error?,completed,total}`. File access checks current owner
and source-row permissions; a job result does not grant anyone new file rights.


`signatureLink({requestId})` is a read requiring both `finance` and `sign`.
It validates the caller's current access to an envelope raised by this app
instance and returns `{url}` for its configured native signature page. Request
and read the envelope through `client.sign`; a link never grants signature
access or bypasses envelope permissions.

## Accounting catalog choices

`accountingCatalog({provider,companyId,kind,search?,cursor?})` is a read. `kind` is `contacts`, `taxCodes` or `items`. Finance and the exact `connection:xero` or `connection:quickbooks` grant are required. The host rechecks the current workspace connection and selected tenant. Responses contain at most 100 normalized `{id,label,kind?,currency?,rateBps?}` choices and optional `nextCursor`. Contact kind is `customer`, `supplier` or `both` when reported. Pass the opaque cursor with the same provider/company/kind/search. Search is at most 100 characters. Provider-reported rates are display metadata; accepted source tax remains authoritative. The host creates no accounts, contacts, products or tax settings.

## Revocable document shares

A member on a screen can call `shareDocument({documentId})` in a write tool, receiving `{shareId,url,expiresAt}`. `revokeDocumentShare({shareId})` is also a screen-only write and returns `{revoked:true}`. The host requires current permission to the Finance document and its connected native Docs source.

`publicDocument({token})` is the additional Finance visitor exception. It returns `{title,markdown,files,expiresAt}` after host capability checks. Each file has `{id,name,url,mimeType?,size?}`. File IDs are opaque share-scoped keys; URLs are authorized host downloads. This method does not grant access to private document sources or permit sharing writes. Fake-host supplies no share service by default; tests must provide explicit Finance fixtures.
