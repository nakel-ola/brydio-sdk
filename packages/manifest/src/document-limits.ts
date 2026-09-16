/**
 * The bounds on one app's records, as Brydio's store holds them (A3-F02-S04).
 *
 * A copy of `DOCUMENT_LIMITS` in Brydio's `apps/api/src/apps/data/document-query.ts`,
 * held to it by `limits-doc.test.ts`, and listed for app builders in
 * `docs/manifest.md`. `FIELD_LIMITS` holds the bounds on a schema and its values.
 */
export const DOCUMENT_LIMITS = {
  /** Records a list or search returns when it doesn't say how many. */
  pageDefault: 50,
  /** The most records one list or search page may return. */
  pageMax: 200,
  /** One record's stored body, in bytes: 256 KB, so a `text` field's 100,000 characters fit. */
  bodyBytes: 256 * 1024,
  /** A page stops adding records once it passes this many bytes, and hands back a cursor. */
  pageBytes: 2 * 1024 * 1024,
  /** Live records one instance's collection may hold. */
  recordsPerCollection: 100_000,
  /** Changes one `batch_<plural>` call may make. */
  batchChanges: 50,
} as const;
