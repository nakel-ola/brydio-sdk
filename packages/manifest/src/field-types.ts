/**
 * A collection's field types (contracts §5).
 *
 * A field type is written in the manifest as a short string, or as a list of
 * strings for an enumeration. The table in §5 is read strictly: exactly the
 * forms it lists are accepted. It lists `"boolean"`, `"string[]"` and
 * `"token"` without a `?` form and an enumeration as a bare list, so
 * `"boolean?"` is refused rather than guessed at. A boolean that is not set is
 * false and a list that is not set is empty, so neither needs one; see
 * CONTRACT-NOTES.md.
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

/** The manifest string forms, exactly as §5 lists them. */
export const FIELD_TYPE_STRINGS = [
  'string',
  'string?',
  'text',
  'text?',
  'member',
  'member?',
  'project',
  'project?',
  'date',
  'date?',
  'number',
  'number?',
  'boolean',
  'string[]',
  'token',
] as const;

export type FieldTypeString = (typeof FIELD_TYPE_STRINGS)[number];

/** A field type as the manifest writes it: a string form, or an enumeration's values. */
export type FieldType = FieldTypeString | readonly string[];

/** A field type, understood. */
export interface ParsedFieldType {
  kind: FieldKind;
  optional: boolean;
  /** An enumeration's values, in the manifest's order. */
  values?: readonly string[];
  /**
   * Whether the value is also written plainly to `app_document.fields`, where
   * lists filter and sort without decrypting (§3, §5, ADR-A06). Text is not;
   * a short `string` is only when the collection lists it in `index`.
   */
  structured: boolean;
}

/** A short string, per §5. */
export const STRING_MAX_CHARS = 512;

const STRUCTURED: Readonly<Record<FieldKind, boolean>> = {
  string: false,
  text: false,
  enum: true,
  member: true,
  project: true,
  date: true,
  number: true,
  boolean: true,
  'string[]': true,
  token: true,
};

/**
 * Reads one field type, or answers `null` for something that is not one.
 *
 * An enumeration is a non-empty list of distinct, non-empty strings. Anything
 * else in a list is not an enumeration, and saying so is kinder than storing
 * a status nobody can choose.
 */
export function parseFieldType(value: unknown): ParsedFieldType | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (!value.every(one => typeof one === 'string' && one.length > 0)) return null;
    if (new Set(value).size !== value.length) return null;

    return { kind: 'enum', optional: false, values: [...value] as string[], structured: true };
  }

  if (typeof value !== 'string' || !(FIELD_TYPE_STRINGS as readonly string[]).includes(value)) return null;

  const optional = value.endsWith('?');
  const kind = (optional ? value.slice(0, -1) : value) as FieldKind;

  return { kind, optional, structured: STRUCTURED[kind] };
}

// --- The document type a schema describes (A5-F01-S03) --------------------

type Optional<T> = T extends `${string}?` ? true : false;

/** The TypeScript type of one field's value. */
export type FieldValue<T> = T extends readonly (infer V)[]
  ? V
  : T extends 'number' | 'number?'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'string[]'
        ? string[]
        : T extends FieldTypeString
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
 * A document of a collection, as a screen reads it: its id and version beside
 * the schema's fields.
 *
 * ```ts
 * const schema = { title: 'string', status: ['todo', 'doing', 'done'] } as const;
 * type Issue = DocumentOf<typeof schema>;   // { id; version; title: string; status: 'todo' | … }
 * ```
 */
export type DocumentOf<S> = Simplify<{ id: string; version: number } & FieldsOf<S>>;
