import { z } from 'zod';

import { FIELD_LIMITS, parseFieldType } from './field-types.ts';

/**
 * Record readers (P16): a record only the people it
 * names may read.
 *
 * An app names one of the collection's own `string[]` fields, which holds
 * user ids. When a record's list is empty, everyone who can read the
 * instance reads it, as before; when it names anyone, nobody else finds it —
 * not on a screen, not through a tool, not through the assistant, not on the
 * co-edit socket. There is no admin past it: an app that wants its admins
 * in puts them in the list. Brydio keeps the list in plain beside the record
 * (`app_document.readers`), so every read can be narrowed before anything
 * is decrypted. Mirrors Brydio's `apps/api/src/apps/manifest/readers.ts`;
 * the two change together.
 */

export const readersSchema = z.string().min(1).max(FIELD_LIMITS.nameChars);

export type ReadersProblemCode = 'data_readers_field' | 'data_readers_anonymous';

/** The most people one record's list may name. */
export const READERS_LIMIT = 1_000;

export function readersProblems(
  collection: string,
  declared: { schema: Record<string, unknown>; readers?: string; anonymous?: unknown }
): { code: ReadersProblemCode; collection: string; field?: string; message: string }[] {
  if (!declared.readers) return [];

  const problems: ReturnType<typeof readersProblems> = [];
  const raw = declared.schema[declared.readers];
  let listed = false;

  try {
    listed = raw !== undefined && parseFieldType(raw).kind === 'string[]';
  } catch {
    // Refused as a field type already.
  }

  if (!listed) {
    problems.push({
      code: 'data_readers_field',
      collection,
      field: declared.readers,
      message: `"${collection}" names "${declared.readers}" as its readers, which must be one of its own string[] fields holding user ids.`,
    });
  }

  // An anonymous answer names nobody; a list of who may read it would.
  if (declared.anonymous) {
    problems.push({
      code: 'data_readers_anonymous',
      collection,
      message: `"${collection}" can't be anonymous and name its readers.`,
    });
  }

  return problems;
}

/** The plain list a record is kept with: its readers, or null for everyone who can read the instance. */
export function readersOf(field: string | undefined, body: Record<string, unknown>): string[] | null {
  if (!field) return null;
  const value = body[field];

  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.filter((one): one is string => typeof one === 'string' && one.length > 0))];

  return ids.length ? ids.sort() : null;
}
