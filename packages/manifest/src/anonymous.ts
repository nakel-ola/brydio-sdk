import { z } from 'zod';

import {
  FIELD_LIMITS,
  isStructured,
  parseFieldType,
  type FieldType,
} from './field-types.ts';

/**
 * An anonymous collection (P13): answers nobody can tie back to the person
 * who gave them. Mirrors Brydio's `apps/api/src/apps/manifest/anonymous.ts`;
 * the two change together.
 *
 * An app only declares it: which structured field groups the answers (a
 * form, a survey round: a number, a choice, a date), and how many answers a
 * group must hold before any of them is read. Brydio does the rest in the store, never the app: no writer kept
 * on the record, times cut to the day, no live change told, no update, a
 * create naming its own writer refused, and reads only of a whole group of
 * at least `minimum` answers.
 */

export const ANONYMOUS_LIMITS = {
  /** The fewest answers a group, or a narrowed read of one, may be read at. */
  minimum: 5,
  /** The most an app may ask for. */
  maximum: 1000,
} as const;

/** What the store writes as `created_by` on every anonymous record. */
export const ANONYMOUS_WRITER = 'anonymous';

export const anonymousSchema = z
  .object({
    /** A structured field of the same collection, never a member: which group an answer belongs to. */
    group: z.string().min(1).max(FIELD_LIMITS.nameChars),
    /** At least 5, the default. */
    minimum: z.number().int().max(ANONYMOUS_LIMITS.maximum).optional(),
  })
  .strict();

export type AnonymousDeclared = z.infer<typeof anonymousSchema>;

/** As the host reads it, on `CollectionSpec.anonymous`. */
export interface AnonymousSpec {
  group: string;
  minimum: number;
}

export type AnonymousProblemCode =
  | 'data_anonymous_group'
  | 'data_anonymous_member'
  | 'data_anonymous_minimum'
  | 'data_anonymous_coedit';

export function anonymousProblems(
  collection: string,
  declared: { schema: Record<string, unknown>; anonymous?: AnonymousDeclared }
): { code: AnonymousProblemCode; collection: string; field?: string; message: string }[] {
  const anonymous = declared.anonymous;

  if (!anonymous) return [];

  const problems: ReturnType<typeof anonymousProblems> = [];
  const types = new Map<string, FieldType>();

  for (const [field, raw] of Object.entries(declared.schema)) {
    try {
      types.set(field, parseFieldType(raw));
    } catch {
      // Refused as a field type already.
    }
  }

  // Kept in plain, so a read can name its group; words never are.
  const group = types.get(anonymous.group);

  if (!group || !isStructured(group) || group.kind === 'member') {
    problems.push({
      code: 'data_anonymous_group',
      collection,
      field: anonymous.group,
      message: `${collection}.anonymous.group must name one of its structured fields (a number, choice, date, boolean, token or project); ${anonymous.group} is not.`,
    });
  }

  if (anonymous.minimum !== undefined && anonymous.minimum < ANONYMOUS_LIMITS.minimum) {
    problems.push({
      code: 'data_anonymous_minimum',
      collection,
      message: `${collection}.anonymous.minimum is at least ${ANONYMOUS_LIMITS.minimum}: fewer answers than that can be told apart.`,
    });
  }

  for (const [field, type] of types) {
    // A member field names a person on the record, which is what this is for not doing.
    if (type.kind === 'member') {
      problems.push({
        code: 'data_anonymous_member',
        collection,
        field,
        message: `${collection} is anonymous, so it can't name a member: ${field} would.`,
      });
    }

    // Writing together shows who is typing, and changes a record after it is given.
    if (type.coedit) {
      problems.push({
        code: 'data_anonymous_coedit',
        collection,
        field,
        message: `${collection} is anonymous, so its answers can't be written together: ${field} would be.`,
      });
    }
  }

  return problems;
}

export function anonymousSpec(declared: AnonymousDeclared): AnonymousSpec {
  return { group: declared.group, minimum: declared.minimum ?? ANONYMOUS_LIMITS.minimum };
}
