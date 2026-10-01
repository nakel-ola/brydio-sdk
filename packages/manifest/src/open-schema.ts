// A copy of Brydio's `apps/api/src/apps/manifest/open-schema.ts`, kept exact so
// a companion the SDK accepts is one the server accepts, and a value moved by
// the fake host is moved as the real store moves it. Only the part after
// "The SDK's own" at the end is not the server's.

import {
  FIELD_LIMITS,
  FIELD_NAME,
  isSortable,
  isStructured,
  parseFieldType,
  quoted,
  RESERVED_FIELDS,
  type FieldType,
} from './field-types.ts';
import type { CollectionSpec } from './schema.ts';

/**
 * Open-schema collections (P5).
 *
 * A collection flagged `openSchema: { fields: "columns", table?: "table" }`
 * keeps the fields its manifest declares, and also the fields its companion
 * collection's records define, per table. This file is the manifest half:
 * which types a definition may name, what the companion must declare, how a
 * definition reads as a `FieldType` the store already knows, and how a value
 * moves when its field changes type. The store half is
 * `apps/data/open-schema.ts`.
 */

/** The types a field definition may name. */
export const OPEN_TYPES = [
  'text',
  'long_text',
  'number',
  'currency',
  'percent',
  'rating',
  'date',
  'datetime',
  'checkbox',
  'select',
  'multi_select',
  'person',
  'link',
  'url',
  'email',
  'phone',
  'attachment',
] as const;

export type OpenType = (typeof OPEN_TYPES)[number];

export const OPEN_LIMITS = {
  /** Live rows one table may hold (DB-Q2, owner 30 Sep): measured at this size. */
  rowsPerTable: 50_000,
  /** Live field definitions one table may hold. */
  fieldsPerTable: 200,
  /** The highest a rating may be. */
  ratingMax: 10,
} as const;

/** The flag as the manifest writes it. */
export interface OpenSchemaFlag {
  /** The companion collection whose records define the fields. */
  fields: string;
  /** A `string` field on both collections naming a row's or a definition's table. */
  table?: string;
}

/** One live field, read from a companion record. */
export interface OpenField {
  /** The companion record's id. */
  id: string;
  /** Stable across renames: what rows, tools, filters and sorts use. */
  key: string;
  name: string;
  type: OpenType;
  /** Null for a collection with no `table`. */
  table: string | null;
  choices: string[];
  required: boolean;
  currency?: string;
  precision?: number;
  linkTo?: string;
  description?: string;
}

/**
 * What the companion must declare: the three it must have, and the kinds of
 * the ones the host reads when they are there. Anything else is the app's own.
 */
const REQUIRED_COMPANION = { key: 'string', name: 'string', type: 'enum' } as const;
const OPTIONAL_COMPANION: Readonly<Record<string, readonly FieldType['kind'][]>> = {
  choices: ['string[]'],
  required: ['boolean'],
  currency: ['string'],
  precision: ['number'],
  linkTo: ['string'],
  description: ['string', 'text'],
};

export type OpenProblemCode = 'data_open_fields_unknown' | 'data_open_fields_shape' | 'data_open_table_unknown';

export interface OpenProblem {
  code: OpenProblemCode;
  field?: string;
  message: string;
}

const kindOf = (raw: unknown): FieldType | null => {
  try {
    return parseFieldType(raw);
  } catch {
    // Its own problem is reported by the field check; nothing to add here.
    return null;
  }
};

/**
 * Everything wrong with one collection's `openSchema`, given every
 * collection's raw schema. Empty when it is right.
 */
export function openSchemaProblems(
  collection: string,
  flag: OpenSchemaFlag,
  data: Readonly<Record<string, { schema: Record<string, unknown>; openSchema?: OpenSchemaFlag }>>
): OpenProblem[] {
  const companion = data[flag.fields];

  if (!companion || flag.fields === collection) {
    return [
      {
        code: 'data_open_fields_unknown',
        message: `${collection}.openSchema.fields names ${flag.fields}, which must be another collection of this app.`,
      },
    ];
  }

  if (companion.openSchema) {
    return [
      {
        code: 'data_open_fields_unknown',
        message: `${flag.fields} defines ${collection}'s fields, so it cannot have open fields itself.`,
      },
    ];
  }

  const problems: OpenProblem[] = [];
  const shape = `${flag.fields} defines ${collection}'s fields`;

  for (const [field, kind] of Object.entries(REQUIRED_COMPANION)) {
    const type = field in companion.schema ? kindOf(companion.schema[field]) : null;

    if (!type || type.kind !== kind || (field !== 'key' && type.optional)) {
      problems.push({
        code: 'data_open_fields_shape',
        field,
        message:
          kind === 'enum'
            ? `${shape}, so it needs type: a choice of some of ${quoted(OPEN_TYPES)}.`
            : `${shape}, so it needs ${field}: "${kind}${field === 'key' ? '?' : ''}".`,
      });
      continue;
    }

    if (kind === 'enum') {
      const unknown = (type.values ?? []).find(value => !(OPEN_TYPES as readonly string[]).includes(value));

      if (unknown) {
        problems.push({
          code: 'data_open_fields_shape',
          field,
          message: `${flag.fields}.type offers "${unknown}", which is not an open field type; use some of ${quoted(OPEN_TYPES)}.`,
        });
      }
    }
  }

  for (const [field, kinds] of Object.entries(OPTIONAL_COMPANION)) {
    if (!(field in companion.schema)) continue;

    const type = kindOf(companion.schema[field]);

    if (type && !kinds.includes(type.kind)) {
      problems.push({
        code: 'data_open_fields_shape',
        field,
        message: `${flag.fields}.${field} is read by Brydio as ${kinds.join(' or ')}; declare it so.`,
      });
    }
  }

  if (flag.table !== undefined) {
    for (const [name, schema] of [
      [collection, data[collection]?.schema ?? {}],
      [flag.fields, companion.schema],
    ] as const) {
      const type = flag.table in schema ? kindOf(schema[flag.table]) : null;

      if (!type || type.kind !== 'string' || type.optional) {
        problems.push({
          code: 'data_open_table_unknown',
          field: flag.table,
          message: `${collection}.openSchema.table is ${flag.table}, so ${name} needs ${flag.table}: "string", naming each record's table.`,
        });
      }
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Definitions

/** A definition's type as the store's own field type: what `checked` and the list path read. */
export function fieldTypeOf(field: OpenField): FieldType {
  switch (field.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return { kind: 'string', optional: true };
    case 'long_text':
      return { kind: 'text', optional: true };
    case 'number':
    case 'currency':
    case 'percent':
    case 'rating':
      return { kind: 'number', optional: true };
    case 'date':
    case 'datetime':
      return { kind: 'date', optional: true };
    case 'checkbox':
      return { kind: 'boolean', optional: true };
    case 'select':
      return { kind: 'enum', optional: true, values: field.choices };
    case 'multi_select':
      return { kind: 'string[]', optional: true, plain: true, values: field.choices };
    case 'person':
      return { kind: 'member', optional: true };
    case 'link':
      return { kind: 'string[]', optional: true, plain: true };
    case 'attachment':
      return { kind: 'string[]', optional: true };
  }
}

/** True for a type whose values a definition must list. */
export const hasChoices = (type: OpenType): boolean => type === 'select' || type === 'multi_select';

/** A definition in a few words, for an answer or a tool: `Amount (deal_size): currency, USD`. */
export function describeField(field: OpenField): string {
  const extra = hasChoices(field.type)
    ? `, one of ${quoted(field.choices)}`
    : field.type === 'currency' && field.currency
      ? `, ${field.currency}`
      : '';

  return `${field.key} ("${field.name}"): ${field.type.replace('_', ' ')}${extra}${field.required ? ', required' : ''}`;
}

/**
 * A key made from a name: `"Deal size"` → `deal_size`, suffixed when taken.
 * Always a field name the tools can use, never a reserved one.
 */
export function keyFromName(name: string, taken: ReadonlySet<string>): string {
  const slug =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, FIELD_LIMITS.nameChars - 4) || 'field';
  const base = /^[a-z]/.test(slug) ? slug : `f_${slug}`.slice(0, FIELD_LIMITS.nameChars - 4);
  const free = (key: string) => !taken.has(key) && !RESERVED_FIELDS.has(key);

  if (free(base)) return base;

  for (let n = 2; ; n += 1) {
    if (free(`${base}_${n}`)) return `${base}_${n}`;
  }
}

/** Why a key cannot be a field's key here, or null. */
export function keyProblem(key: string, fixed: ReadonlySet<string>, taken: ReadonlySet<string>): string | null {
  if (!FIELD_NAME.test(key) || key.length > FIELD_LIMITS.nameChars) {
    return `key "${key}" must be letters, digits and _, starting with a lower-case letter, at most ${FIELD_LIMITS.nameChars} characters.`;
  }

  if (RESERVED_FIELDS.has(key) || fixed.has(key)) return `key "${key}" is a field Brydio or the app already keeps.`;
  if (taken.has(key)) return `key "${key}" is already a field of this table.`;

  return null;
}

/** The choices a definition lists, checked: some, short, distinct. */
export function choicesProblem(type: OpenType, choices: readonly string[]): string | null {
  if (!hasChoices(type)) return null;
  if (!choices.length) return `A ${type.replace('_', ' ')} field needs at least one choice.`;
  if (choices.length > FIELD_LIMITS.enumValues) return `A field may offer at most ${FIELD_LIMITS.enumValues} choices.`;

  if (choices.some(choice => !choice.trim() || choice.length > FIELD_LIMITS.enumValueChars)) {
    return `Each choice is 1 to ${FIELD_LIMITS.enumValueChars} characters.`;
  }

  if (new Set(choices).size !== choices.length) return 'A field offers the same choice twice.';

  return null;
}

// ---------------------------------------------------------------------------
// Values

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+()0-9 .\-/]{3,40}$/;

const isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * What the store's own field type cannot say about an open value: a web
 * address, an email, a rating's range, a date with no time, the choices of a
 * multi-select. Null when it is fine; `checked` then checks the rest.
 */
export function openValueProblem(field: OpenField, value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const named = `${field.key} ("${field.name}")`;

  switch (field.type) {
    case 'url':
      return typeof value === 'string' && isWebAddress(value) ? null : `${named} must be a web address, starting http:// or https://.`;
    case 'email':
      return typeof value === 'string' && EMAIL.test(value) ? null : `${named} must be an email address.`;
    case 'phone':
      return typeof value === 'string' && PHONE.test(value) ? null : `${named} must be a phone number.`;
    case 'rating':
      return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= OPEN_LIMITS.ratingMax
        ? null
        : `${named} must be a whole number from 0 to ${OPEN_LIMITS.ratingMax}.`;
    case 'date':
      return typeof value === 'string' && DATE_ONLY.test(value) && !Number.isNaN(Date.parse(value))
        ? null
        : `${named} must be a date, written YYYY-MM-DD.`;
    case 'datetime':
      return typeof value === 'string' && DATE_TIME.test(value) && !Number.isNaN(Date.parse(value))
        ? null
        : `${named} must be a date and time, written YYYY-MM-DDTHH:MM:SSZ.`;
    case 'multi_select': {
      if (!Array.isArray(value)) return null;

      const wrong = value.find(one => typeof one !== 'string' || !field.choices.includes(one));

      if (wrong !== undefined) return `${named} may hold only ${quoted(field.choices)}.`;

      return new Set(value).size === value.length ? null : `${named} names the same choice twice.`;
    }
    default:
      return null;
  }
}

/** True when a create leaves a required field out. */
export const missingRequired = (field: OpenField, value: unknown): boolean => field.required && isEmpty(value);

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);

    return (url.protocol === 'http:' || url.protocol === 'https:') && value.length <= FIELD_LIMITS.stringChars;
  } catch {
    return false;
  }
}

/** What happened to one value when its field changed. */
export type Moved = { outcome: 'kept' | 'converted'; value: unknown } | { outcome: 'cleared' };

const textOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.map(one => textOf(one) ?? '').filter(Boolean).join(', ');

  return null;
};

const choiceOf = (choices: readonly string[], value: string): string | undefined =>
  choices.find(choice => choice === value) ?? choices.find(choice => choice.toLowerCase() === value.trim().toLowerCase());

/**
 * One value moved from a field's old definition to its new one (P5 retype):
 * kept when it is still right, converted when it can be read as the new type,
 * else cleared. Never invents a choice.
 */
export function moveValue(value: unknown, from: OpenField, to: OpenField): Moved {
  const moved = convert(value, from, to);

  if (moved === undefined || isEmpty(moved)) return { outcome: 'cleared' };

  const settled = openValueProblem(to, moved) === null;

  if (!settled) return { outcome: 'cleared' };

  return { outcome: JSON.stringify(moved) === JSON.stringify(value) ? 'kept' : 'converted', value: moved };
}

function convert(value: unknown, from: OpenField, to: OpenField): unknown {
  const text = textOf(value);

  switch (to.type) {
    case 'text':
      return text === null ? undefined : text.slice(0, FIELD_LIMITS.stringChars);
    case 'long_text':
      return text === null ? undefined : text.slice(0, FIELD_LIMITS.textChars);
    case 'url':
    case 'email':
    case 'phone':
      return text === null ? undefined : text.trim();
    case 'number':
    case 'currency':
    case 'percent':
    case 'rating': {
      const number =
        typeof value === 'number'
          ? value
          : typeof value === 'boolean'
            ? Number(value)
            : typeof value === 'string' && value.trim()
              ? Number(value.trim().replace(/[\s,%$€£¥]/g, ''))
              : Number.NaN;

      if (!Number.isFinite(number)) return undefined;

      return to.type === 'rating' ? Math.round(number) : number;
    }
    case 'checkbox':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'string') {
        if (/^(true|yes|y|1|x|checked|done)$/i.test(value.trim())) return true;
        if (/^(false|no|n|0|unchecked)$/i.test(value.trim())) return false;
      }

      return undefined;
    case 'date':
    case 'datetime': {
      if (typeof value !== 'string') return undefined;

      const head = value.trim();

      if (to.type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(head)) return head.slice(0, 10);

      const at = Date.parse(DATE_ONLY.test(head) ? `${head}T00:00:00Z` : head);

      if (Number.isNaN(at)) return undefined;

      return to.type === 'date' ? new Date(at).toISOString().slice(0, 10) : new Date(at).toISOString();
    }
    case 'select': {
      const candidates = Array.isArray(value) ? value : [text ?? ''];

      for (const one of candidates) {
        const found = typeof one === 'string' ? choiceOf(to.choices, one) : undefined;

        if (found) return found;
      }

      return undefined;
    }
    case 'multi_select': {
      const candidates = Array.isArray(value) ? value : (text ?? '').split(',');
      const found = candidates
        .map(one => (typeof one === 'string' ? choiceOf(to.choices, one) : undefined))
        .filter((one): one is string => Boolean(one));

      return [...new Set(found)];
    }
    case 'person':
      return from.type === 'person' ? value : undefined;
    case 'link':
    case 'attachment':
      return from.type === to.type ? value : undefined;
  }
}

// ---------------------------------------------------------------------------
// The SDK's own: what a definition write answers, and the store's reading of
// a companion record, for app code and the fake host. Each is the same as
// Brydio's `apps/data/open-schema.ts` and `document-errors.ts`.

/**
 * What a field definition's change did to its table's rows: counts, never
 * values. `rows` is how many held a value for the field. A definition's
 * `update` or `delete` answer carries it as `fieldChange` when values moved.
 */
export interface OpenFieldChange {
  field: string;
  op: 'retype' | 'choices' | 'delete';
  rows: number;
  kept: number;
  converted: number;
  cleared: number;
}

/** One value an open field may hold, as a row hands it out. */
export type OpenFieldValue = string | number | boolean | string[] | null;

/** Open types whose values are kept in the plain column: filtered, and all but the two lists sorted. */
export const isPlainOpenType = (type: OpenType): boolean =>
  !['text', 'long_text', 'url', 'email', 'phone', 'attachment'].includes(type);

/**
 * One companion record as a definition, or null when it cannot be one.
 * `table` is the field naming its table, if the collection has tables.
 */
export function definitionOf(id: string, body: Record<string, unknown>, table: string | null): OpenField | null {
  const { key, name, type } = body;

  if (typeof key !== 'string' || typeof name !== 'string' || !(OPEN_TYPES as readonly string[]).includes(type as string)) {
    return null;
  }

  const tableValue = table ? body[table] : null;

  if (table && typeof tableValue !== 'string') return null;

  return {
    id,
    key,
    name,
    type: type as OpenType,
    table: (tableValue as string | null) ?? null,
    choices: Array.isArray(body.choices) ? body.choices.filter((one): one is string => typeof one === 'string') : [],
    required: body.required === true,
    ...(typeof body.currency === 'string' ? { currency: body.currency } : {}),
    ...(typeof body.precision === 'number' ? { precision: body.precision } : {}),
    ...(typeof body.linkTo === 'string' ? { linkTo: body.linkTo } : {}),
    ...(typeof body.description === 'string' ? { description: body.description } : {}),
  };
}

/**
 * The collection's spec with one table's live fields folded in: what a row
 * is checked against and what a list filters and sorts on. A fixed field
 * always wins over a definition of the same key.
 */
export function openSpec(base: CollectionSpec, fields: readonly OpenField[]): CollectionSpec {
  const added = fields.filter(field => !base.fields[field.key]);
  const types = Object.fromEntries(added.map(field => [field.key, fieldTypeOf(field)]));
  const keys = added.map(field => field.key);

  return {
    ...base,
    fields: { ...base.fields, ...types },
    structured: [...base.structured, ...keys.filter(key => isStructured(types[key]!))],
    sortable: [...base.sortable, ...keys.filter(key => isSortable(types[key]!))],
    search: [...base.search, ...added.filter(field => field.type === 'text' || field.type === 'long_text').map(field => field.key)],
  };
}

/** Why a definition's type and choices don't go together, or null. */
export function definitionTypeProblem(body: Record<string, unknown>): string | null {
  const type = body.type;

  if (typeof type !== 'string' || !(OPEN_TYPES as readonly string[]).includes(type)) return null;

  const choices = Array.isArray(body.choices) ? body.choices.filter((one): one is string => typeof one === 'string') : [];

  return choicesProblem(type as OpenType, choices);
}
