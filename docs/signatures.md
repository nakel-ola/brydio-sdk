# Signatures

Use the `sign` host grant from a handler. `sign.request` needs a write tool;
`sign.get` also works from a read tool. Neither is available to public visitors.
The native service sends email invitations and handles the PDF and certificate.
The caller must currently be able to read the source document.
Supply optional `expectedSourceHash` when placing fields against a prior preview.
Brydio refuses a changed source instead of sending different bytes.

```ts
const request = await client.sign.request({
  key: `quote:${deal.id}:${deal.version}`,
  title: 'Quote for signature',
  source: {kind: 'app-file', id: quotePdf.id},
  mode: 'sequential',
  recipients: [{key: 'buyer', name: 'Buyer', identity: {email: 'buyer@example.com'}, order: 1}],
  fields: [{key: 'buyer_signature', recipient: 'buyer', type: 'signature', page: 1,
    x: 10, y: 80, width: 35, height: 8, required: true}],
  record: {collection: 'deals', id: deal.id, statusField: 'signature_status'},
  onStatus: {tool: 'signature_changed'},
});
```

Coordinates are percentages from the top-left of the displayed PDF page.
Page numbers start at 1. Supported fields are signature, initials, date and text.
Equal sequential orders sign together. Template requests use template role keys
and cannot override its frozen field positions. Keys are idempotent within the
workspace and calling app instance; changed input with the same key is refused.

The normal custom tool named in `onStatus.tool` receives `{event}` with
`id,eventId,revision,status,occurredAt` and completed `pdf,certificate,sha256`
references. Delivery is durable and at least once. Deduplicate `eventId` and
ignore older revisions in your own record updates. Call `sign.get(id)` to
reconcile. An app can read only envelopes that instance requested.

`pending` means recipients are signing; `sealing` means the last recipient
signed and Brydio is producing the cryptographic seal. Only `completed` has
final downloadable files. Failed sealing stays in processing with a visible
error and retries. Removed membership or app/record grants refuse delivery;
callbacks never run with elevated identity.

A development Brydio certificate is not an independently trusted identity.
Consent text remains versioned and provisional until the owner approves it.
In fake-host, supply `FakeHandlerOptions.sign` as an explicit stand-in. It does
not generate or pretend to validate a certificate.
