import { STRING_MAX_CHARS, parseFieldType } from './field-types.ts';

/**
 * Whether a document's fields fit its collection's schema.
 *
 * The real store makes this check on every write; the fake host makes it on
 * every seed and every generated write, so a test cannot set up a state the
 * store would refuse (A5-F05-S03). Answers with one sentence per field, each
 * naming the field, the way a generated tool's refusal names it (A8-F01-TC003).
 *
 * `partial` is an update: absent fields are left alone rather than missing.
 * Membership of `member` and existence of `project` are the host's to judge;
 * here they only have to be ids.
 */
export function checkDocument(
  schema: Record<string, unknown>,
  fields: Record<string, unknown>,
  options: { partial?: boolean } = {},
): string[] {
  const problems: string[] = [];

  for (const name of Object.keys(fields)) {
    if (!(name in schema)) problems.push(`"${name}" is not a field of this collection.`);
  }

  for (const [name, raw] of Object.entries(schema)) {
    const type = parseFieldType(raw);

    if (!type) continue;

    const present = Object.prototype.hasOwnProperty.call(fields, name);
    const value = fields[name];

    if (!present || value === undefined || value === null) {
      const needed = !type.optional && type.kind !== 'boolean' && type.kind !== 'string[]';

      if (needed && !(options.partial && !present)) problems.push(`"${name}" is required.`);

      continue;
    }

    const why = wrongValue(type.kind, type.values, value);

    if (why) problems.push(`"${name}" ${why}`);
  }

  return problems;
}

function wrongValue(kind: string, values: readonly string[] | undefined, value: unknown): string | null {
  switch (kind) {
    case 'enum':
      return values!.includes(value as string)
        ? null
        : `is one of ${values!.map(one => `"${one}"`).join(', ')}, not ${JSON.stringify(value)}.`;
    case 'string':
      if (typeof value !== 'string') return 'must be text.';

      return value.length > STRING_MAX_CHARS ? `is at most ${STRING_MAX_CHARS} characters.` : null;
    case 'text':
    case 'member':
    case 'project':
    case 'token':
      return typeof value === 'string' ? null : 'must be text.';
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? null : 'must be an ISO date, like 2026-09-12.';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'must be a number.';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false.';
    case 'string[]':
      return Array.isArray(value) && value.every(one => typeof one === 'string') ? null : 'must be a list of text.';
    default:
      return null;
  }
}
