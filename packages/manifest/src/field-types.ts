import { z, type ZodType } from 'zod';

// A copy of Brydio's `apps/api/src/apps/manifest/field-types.ts`, kept exact so
// a schema the SDK accepts is one the server accepts, and a value the fake
// host stores is one the real store would. Only the document types at the
// end are the SDK's own.

/**
 * The field types an app's collection may declare (contracts §5, A3-F01).
 *
 * Deliberately few. A tracker, a library and a folder can all be written in
 * these, and every one of them is something Brydio knows how to store, how to
 * validate, how to describe to the assistant and how to draw in a form. A
 * type an app could invent would be a type none of those four knew about.
 *
 * The manifest writes a type as a string (`"member?"`) or, for a choice, as
 * the list of allowed values. `parseFieldType` turns either into one shape,
 * and everything downstream — the store, the generated tools, the screen's
 * form — reads that shape, never the manifest's spelling.
 */

export type FieldKind =
  | 'string'
  | 'text'
  | 'enum'
  | 'member'
  | 'project'
  | 'date'
  | 'number'
  | 'boolean'
  | 'string[]'
  | 'token';

export interface FieldType {
  kind: FieldKind;
  /** Written with a trailing `?`: may be left out on create. */
  optional: boolean;
  /** The allowed values, for an enumeration and for a token. */
  values?: readonly string[];
}

/**
 * The bounds a schema and a record are held to (A3-F01-S03).
 *
 * `stringChars` is 1,000 (E1, 16 Sep: the feature file wins over contracts'
 * old 512), the same as `bry-input`'s `INPUT_MAX`, so nothing a person can
 * type into a text field is refused by the store.
 */
export const FIELD_LIMITS = {
  collections: 20,
  fields: 40,
  enumValues: 50,
  enumValueChars: 64,
  stringChars: 1_000,
  textChars: 100_000,
  listEntries: 100,
  nameChars: 40,
} as const;

/**
 * The colours a `token` field may hold, by design-token name.
 *
 * The status roles `DESIGN_SYSTEM.md` already gives a solid, a text, a tint
 * and an edge, plus the brand and a neutral. A label picks one by name and
 * the host draws it in the current theme, so an app never holds a colour
 * value it could get wrong in dark mode (ADR-A13). `@brydio/manifest` carries
 * the same list.
 */
export const COLOUR_TOKENS = ['neutral', 'brand', 'success', 'warn', 'danger'] as const;

/**
 * Names Brydio keeps on every record, or that the generated tools already
 * use for their own arguments. A field called `version` would be ambiguous in
 * `update_issue`, and one called `instance` would shadow ADR-A09's argument.
 */
export const RESERVED_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'version',
  'instance',
  'createdAt',
  'createdBy',
  'updatedAt',
  'deletedAt',
]);

/** A field, collection or label name: an identifier the tools can use as-is. */
export const FIELD_NAME = /^[a-z][a-zA-Z0-9_]*$/;
export const COLLECTION_NAME = /^[a-z][a-z0-9_]*$/;

/** Kept in the plain `fields` column: filterable, and sortable unless a list. */
const STRUCTURED: ReadonlySet<FieldKind> = new Set<FieldKind>([
  'enum',
  'member',
  'project',
  'date',
  'number',
  'boolean',
  'string[]',
  'token',
]);

/** Only the words in these may one day be searched (A3-F01-S02). */
const SEARCHABLE: ReadonlySet<FieldKind> = new Set<FieldKind>(['string', 'text', 'string[]']);

const SCALARS = new Set(['string', 'text', 'member', 'project', 'date', 'number', 'boolean', 'token']);

/** A field type the manifest wrote that Brydio does not have, or a bad list. */
export class FieldTypeInvalid extends Error {
  constructor(
    readonly code:
      | 'data_field_type_unknown'
      | 'data_enum_empty'
      | 'data_enum_too_many'
      | 'data_enum_value_invalid'
      | 'data_enum_duplicate',
    message: string
  ) {
    super(message);
    this.name = 'FieldTypeInvalid';
  }
}

/**
 * One field's manifest spelling, as a type.
 *
 * Throws `FieldTypeInvalid` with a code rather than returning null, because
 * "unknown type" and "a choice with 51 values" are different mistakes and the
 * import report has to say which.
 */
export function parseFieldType(raw: unknown): FieldType {
  if (Array.isArray(raw)) return parseEnumeration(raw);

  if (typeof raw !== 'string') {
    throw new FieldTypeInvalid(
      'data_field_type_unknown',
      'A field type is a name such as "string?" or a list of allowed values.'
    );
  }

  const optional = raw.endsWith('?');
  const name = optional ? raw.slice(0, -1) : raw;

  if (name === 'string[]') return { kind: 'string[]', optional };
  if (name === 'token') return { kind: 'token', optional, values: COLOUR_TOKENS };
  if (SCALARS.has(name)) return { kind: name as FieldKind, optional };

  throw new FieldTypeInvalid('data_field_type_unknown', `"${raw}" is not a field type.`);
}

function parseEnumeration(values: unknown[]): FieldType {
  if (!values.length) {
    throw new FieldTypeInvalid('data_enum_empty', 'A choice needs at least one allowed value.');
  }

  if (values.length > FIELD_LIMITS.enumValues) {
    throw new FieldTypeInvalid(
      'data_enum_too_many',
      `A choice may have at most ${FIELD_LIMITS.enumValues} values.`
    );
  }

  for (const value of values) {
    if (typeof value !== 'string' || !value.trim() || value.length > FIELD_LIMITS.enumValueChars) {
      throw new FieldTypeInvalid(
        'data_enum_value_invalid',
        `Each allowed value is a word or two of text, at most ${FIELD_LIMITS.enumValueChars} characters.`
      );
    }
  }

  if (new Set(values).size !== values.length) {
    throw new FieldTypeInvalid('data_enum_duplicate', 'A choice names the same value twice.');
  }

  return { kind: 'enum', optional: false, values: values as string[] };
}

/** True for a type whose value lands in the plain `fields` column. */
export const isStructured = (type: FieldType): boolean => STRUCTURED.has(type.kind);

/** True for a type a list can be ordered by: structured, and one value. */
export const isSortable = (type: FieldType): boolean =>
  STRUCTURED.has(type.kind) && type.kind !== 'string[]';

export const isSearchable = (type: FieldType): boolean => SEARCHABLE.has(type.kind);

/**
 * The names of a schema's structured fields: the ones kept in plain beside the
 * encrypted body, and so the ones a list may filter on.
 *
 * One function, imported by the store and by the tools, so what is written
 * plainly and what may be filtered cannot drift apart (A3-F01's note). Accepts
 * the manifest's spelling or parsed types.
 */
export function structuredFields(schema: Record<string, unknown>): string[] {
  return Object.entries(schema)
    .filter(([, raw]) => isStructured(asType(raw)))
    .map(([name]) => name);
}

const asType = (raw: unknown): FieldType =>
  raw && typeof raw === 'object' && !Array.isArray(raw) && 'kind' in raw
    ? (raw as FieldType)
    : parseFieldType(raw);

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2}))?$/;

/**
 * What one value of this type may be, as zod.
 *
 * The same schema checks a record in the store and describes the argument to
 * the model, so the tool never accepts something the store then refuses.
 * Always the required form: callers add `.optional()` where they mean it.
 */
export function valueSchema(type: FieldType): ZodType {
  switch (type.kind) {
    case 'string':
      return z.string().max(FIELD_LIMITS.stringChars);
    case 'text':
      return z.string().max(FIELD_LIMITS.textChars);
    case 'enum':
    case 'token':
      return z.enum(type.values as [string, ...string[]]);
    case 'member':
    case 'project':
      return z.string().min(1).max(200);
    case 'date':
      return z
        .string()
        .regex(ISO_DATE)
        .refine(value => !Number.isNaN(Date.parse(value)));
    case 'number':
      return z.number().finite();
    case 'boolean':
      return z.boolean();
    case 'string[]':
      return z.array(z.string().max(FIELD_LIMITS.stringChars)).max(FIELD_LIMITS.listEntries);
  }
}

/**
 * Why a value is not one of this type, in words the assistant can repeat to
 * the person, naming the field. Null when it is fine.
 */
export function valueProblem(field: string, type: FieldType, value: unknown): string | null {
  if (valueSchema(type).safeParse(value).success) return null;

  switch (type.kind) {
    case 'string':
      return typeof value === 'string'
        ? `${field} is longer than ${FIELD_LIMITS.stringChars.toLocaleString('en-GB')} characters.`
        : `${field} must be text.`;
    case 'text':
      return typeof value === 'string'
        ? `${field} is longer than ${FIELD_LIMITS.textChars.toLocaleString('en-GB')} characters.`
        : `${field} must be text.`;
    case 'enum':
    case 'token':
      return `${field} must be one of ${quoted(type.values ?? [])}.`;
    case 'member':
      return `${field} must be a workspace member's user id.`;
    case 'project':
      return `${field} must be a project id.`;
    case 'date':
      return `${field} must be a date, written YYYY-MM-DD.`;
    case 'number':
      return `${field} must be a number.`;
    case 'boolean':
      return `${field} must be true or false.`;
    case 'string[]':
      return Array.isArray(value) && value.length > FIELD_LIMITS.listEntries
        ? `${field} may hold at most ${FIELD_LIMITS.listEntries} entries.`
        : `${field} must be a list of short texts, each at most ${FIELD_LIMITS.stringChars.toLocaleString('en-GB')} characters.`;
  }
}

/** A type in a few words, for a tool's description: every allowed value named. */
export function describeType(type: FieldType): string {
  switch (type.kind) {
    case 'string':
      return 'short text';
    case 'text':
      return 'long text';
    case 'enum':
      return `one of ${quoted(type.values ?? [])}`;
    case 'token':
      return `a colour, one of ${quoted(type.values ?? [])}`;
    case 'member':
      return "a workspace member's user id";
    case 'project':
      return 'a project id';
    case 'date':
      return 'a date, YYYY-MM-DD';
    case 'number':
      return 'a number';
    case 'boolean':
      return 'true or false';
    case 'string[]':
      return 'a list of short texts';
  }
}

export const quoted = (values: readonly string[]): string =>
  values.map(value => `"${value}"`).join(', ');

// ---------------------------------------------------------------------------
// The SDK's own: the document type a schema describes (A5-F01-S03)

type Optional<T> = T extends `${string}?` ? true : false;

/** The TypeScript type of one field's value, from its manifest spelling. */
export type FieldValue<T> = T extends readonly (infer V)[]
  ? V
  : T extends 'number' | 'number?'
    ? number
    : T extends 'boolean' | 'boolean?'
      ? boolean
      : T extends 'string[]' | 'string[]?'
        ? string[]
        : T extends 'token' | 'token?'
          ? (typeof COLOUR_TOKENS)[number]
          : T extends string
            ? string
            : never;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** A schema's fields as a type: optional fields may be absent or null. */
export type FieldsOf<S> = Simplify<
  { -readonly [K in keyof S as Optional<S[K]> extends true ? never : K]: FieldValue<S[K]> } & {
    -readonly [K in keyof S as Optional<S[K]> extends true ? K : never]?: FieldValue<S[K]> | null;
  }
>;

/**
 * A record of a collection, as the generated tools hand it out: its id and
 * version beside the schema's fields, flat, so what `get` returns is the
 * shape `update` takes.
 *
 * ```ts
 * const schema = { title: 'string', status: ['todo', 'doing', 'done'] } as const;
 * type Issue = DocumentOf<typeof schema>;   // { id; version; title: string; status: 'todo' | … }
 * ```
 */
export type DocumentOf<S> = Simplify<
  { id: string; version: number; createdBy?: string; createdAt?: string; updatedAt?: string } & FieldsOf<S>
>;
