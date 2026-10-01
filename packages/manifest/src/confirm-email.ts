import { z } from 'zod';

import { FIELD_LIMITS, parseFieldType } from './field-types.ts';

/**
 * The confirmation email of a public form (FO04). Mirrors Brydio's
 * `apps/api/src/apps/manifest/confirm-email.ts`; the two change together.
 *
 * An app only declares it: which field of a `publicSubmit` collection holds
 * the visitor's address, and a short plain text to say. Brydio decides the
 * rest — when it is sent, to whom, how often, from whom — so an anonymous
 * page can never be used to send anybody anything else.
 */

export const CONFIRM_LIMITS = {
  subjectChars: 120,
  messageChars: 600,
} as const;

export const confirmEmailSchema = z
  .object({
    /** A `string` field of the same collection: the visitor's address. */
    field: z.string().min(1).max(FIELD_LIMITS.nameChars),
    subject: z.string().min(1).max(CONFIRM_LIMITS.subjectChars).optional(),
    /** Plain text; a blank line starts a new paragraph. */
    message: z.string().min(1).max(CONFIRM_LIMITS.messageChars).optional(),
    /** One button back to the public page the visitor answered. */
    link: z.boolean().optional(),
  })
  .strict();

export type ConfirmEmailDeclared = z.infer<typeof confirmEmailSchema>;

/** As the host reads it, on `CollectionSpec.confirmEmail`. */
export interface ConfirmEmailSpec {
  field: string;
  subject: string | null;
  message: string | null;
  link: boolean;
}

export type ConfirmProblemCode =
  | 'data_confirm_submit'
  | 'data_confirm_field'
  | 'data_confirm_text';

/** A link, an address a client would turn into one, or markup. */
const NOT_PLAIN = /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|[<>]|\]\(|mailto:)/i;

export function confirmEmailProblems(
  collection: string,
  declared: {
    schema: Record<string, unknown>;
    publicSubmit?: boolean;
    confirmEmail?: ConfirmEmailDeclared;
  }
): { code: ConfirmProblemCode; collection: string; field?: string; message: string }[] {
  const confirm = declared.confirmEmail;

  if (!confirm) return [];

  const problems: ReturnType<typeof confirmEmailProblems> = [];

  if (!declared.publicSubmit) {
    problems.push({
      code: 'data_confirm_submit',
      collection,
      message: `${collection} sends a confirmation email but visitors can't submit to it: mark it publicSubmit.`,
    });
  }

  const raw = declared.schema[confirm.field];
  let kind: string | null = null;

  try {
    kind = raw === undefined ? null : parseFieldType(raw).kind;
  } catch {
    kind = null;
  }

  if (kind !== 'string') {
    problems.push({
      code: 'data_confirm_field',
      collection,
      field: confirm.field,
      message: `${collection}.confirmEmail.field must name one of its string fields; ${confirm.field} is not.`,
    });
  }

  for (const [key, text] of [
    ['subject', confirm.subject],
    ['message', confirm.message],
  ] as const) {
    if (text !== undefined && NOT_PLAIN.test(text)) {
      problems.push({
        code: 'data_confirm_text',
        collection,
        message: `${collection}.confirmEmail.${key} is plain text: no links, addresses or markup.`,
      });
    }
  }

  return problems;
}

export function confirmEmailSpec(declared: ConfirmEmailDeclared): ConfirmEmailSpec {
  return {
    field: declared.field,
    subject: declared.subject?.trim() || null,
    message: declared.message?.trim() || null,
    link: declared.link === true,
  };
}
