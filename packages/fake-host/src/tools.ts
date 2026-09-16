import {
  FIELD_LIMITS,
  collectionsOf,
  describeType,
  toolNames,
  valueProblem,
  valueSchema,
  type CollectionSpec,
  type FieldType,
  type ManifestExtensions,
  type ToolVerb,
} from '@brydio/manifest';
import { z, type ZodType } from 'zod';

/**
 * The generated tools, answered from memory (contracts §6).
 *
 * What a screen calls in a workspace is Brydio's executor over the encrypted
 * document store. Here it is a map of records per collection, but the tools
 * take the same arguments, refuse the same things with the same sentences,
 * and answer in the same shape (`content`, `structuredContent`, `isError`),
 * so a screen tested here meets no surprise there. The argument schemas are
 * the server's `inputFor` for a screen's call (`apps/api/src/apps/tools/
 * generated-tools.ts`, instance bound), and the store's rules are
 * `apps/api/src/apps/data/document-store.service.ts`'s `checked`.
 */

/** A tool's answer, as the executor shapes it. */
export interface ToolResultShape {
  content?: { type: 'text'; text: string }[];
  structuredContent?: unknown;
  isError?: boolean;
  summary?: string;
}

/** A record as the store keeps it here: the body and Brydio's own fields. */
export interface StoredDocument {
  id: string;
  version: number;
  body: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type Fixtures = Record<string, Record<string, unknown>[]>;

/** One tool of the fake host: given the input, an answer. */
export type ToolHandler = (input: Record<string, unknown>) => ToolResultShape | Promise<ToolResultShape>;

const answer = (text: string, structuredContent: unknown, summary: string): ToolResultShape => ({
  content: [{ type: 'text', text }],
  structuredContent,
  summary,
});

export const refusal = (text: string, structuredContent?: unknown): ToolResultShape => ({
  isError: true,
  content: [{ type: 'text', text }],
  ...(structuredContent === undefined ? {} : { structuredContent }),
});

class Refused extends Error {
  constructor(
    message: string,
    readonly data: Record<string, unknown>,
  ) {
    super(message);
  }
}

/**
 * The in-memory store and its tools, for one manifest's collections.
 *
 * Seeded from fixtures, each checked as a create would check it, so a test
 * can't begin from a state the real store would never have allowed.
 */
export class FixtureStore {
  readonly #specs: CollectionSpec[];
  readonly #records = new Map<string, StoredDocument[]>();
  #clock: number;
  #next = 0;

  constructor(manifest: Pick<ManifestExtensions, 'data' | 'tools'>, fixtures: Fixtures = {}, options: { now?: Date } = {}) {
    this.#specs = manifest.tools?.generated === false ? [] : collectionsOf(manifest);
    this.#clock = (options.now ?? new Date('2026-09-12T09:00:00.000Z')).getTime();

    for (const spec of this.#specs) this.#records.set(spec.name, []);

    for (const [collection, seeds] of Object.entries(fixtures)) {
      const spec = this.#spec(collection);

      for (const seed of seeds) {
        const { id, version, createdBy, ...fields } = seed as { id?: unknown; version?: unknown; createdBy?: unknown };
        const body = checked(spec, fields, {});

        this.#records.get(spec.name)!.push({
          id: typeof id === 'string' ? id : this.#id(spec),
          version: typeof version === 'number' ? version : 1,
          body,
          createdBy: typeof createdBy === 'string' ? createdBy : 'user_fixture',
          ...this.#stamp(),
        });
      }
    }
  }

  /** A collection's records as they stand, flat, oldest first. */
  records(collection: string): Record<string, unknown>[] {
    return (this.#records.get(this.#spec(collection).name) ?? []).map(flat);
  }

  /** Every generated tool, by name. */
  tools(): Record<string, ToolHandler> {
    const handlers: Record<string, ToolHandler> = {};

    for (const spec of this.#specs) {
      for (const [verb, name] of Object.entries(toolNames(spec)) as [ToolVerb, string][]) {
        const schema = inputFor(verb, spec);

        handlers[name] = input => {
          const parsed = schema.safeParse(input ?? {});

          if (!parsed.success) return refusal(problemOf(parsed.error));

          try {
            return this.#run(verb, spec, parsed.data as Record<string, unknown>);
          } catch (error) {
            if (error instanceof Refused) return refusal(error.message, error.data);

            throw error;
          }
        };
      }
    }

    return handlers;
  }

  #run(verb: ToolVerb, spec: CollectionSpec, input: Record<string, unknown>): ToolResultShape {
    const records = this.#records.get(spec.name)!;
    const { label } = spec;
    const article = /^[aeiou]/.test(label) ? 'an' : 'a';

    switch (verb) {
      case 'create': {
        const made: StoredDocument = { id: this.#id(spec), version: 1, body: checked(spec, input, {}), createdBy: 'user_fixture', ...this.#stamp() };

        records.push(made);

        return answer(`Created ${label} ${made.id}.`, flat(made), `Created ${article} ${label}`);
      }
      case 'update': {
        const { id, version, ...changes } = input;
        const current = this.#find(spec, String(id));

        if (current.version !== version) {
          throw new Refused(
            `This ${label} changed since you read it. Here it is as it is now; make the change again on version ${current.version}.\n${JSON.stringify(flat(current))}`,
            { error: 'stale', current: flat(current) },
          );
        }

        current.body = checked(spec, changes, current.body);
        current.version += 1;
        current.updatedAt = this.#stamp().updatedAt;

        return answer(`Changed ${label} ${current.id}; it is at version ${current.version} now.`, flat(current), `Changed ${article} ${label}`);
      }
      case 'get': {
        const found = flat(this.#find(spec, String(input.id)));

        return answer(JSON.stringify(found), found, `Read ${article} ${label}`);
      }
      case 'list':
      case 'search': {
        const filter = { ...(verb === 'search' ? searchFilter(spec, String(input.q ?? '')) : {}), ...((input.filter as object) ?? {}) };
        const page = this.#page(spec, filter, input);

        return answer(JSON.stringify(page), page, `${page.items.length} ${page.items.length === 1 ? label : spec.plural}`);
      }
      case 'delete': {
        const found = this.#find(spec, String(input.id));

        records.splice(records.indexOf(found), 1);

        return answer(`Deleted ${label} ${found.id}.`, { id: found.id }, `Deleted ${article} ${label}`);
      }
    }
  }

  #page(spec: CollectionSpec, filter: Record<string, unknown>, input: Record<string, unknown>) {
    for (const field of Object.keys(filter)) {
      if (!spec.structured.includes(field)) {
        throw new Refused(
          spec.fields[field] ? `${field} is not a field a list can be filtered by.` : `${field} is not a field of ${spec.label}.`,
          { error: 'invalid', field },
        );
      }
    }

    const sort = (input.sort as { field: string; dir?: 'asc' | 'desc' } | undefined) ?? { field: 'updatedAt' };
    const time = sort.field === 'updatedAt' || sort.field === 'createdAt';
    const dir = sort.dir ?? (time ? 'desc' : 'asc');
    // The store's paging: 50 unless asked, never more than 200.
    const limit = input.limit === undefined ? 50 : Math.min(Number(input.limit), 200);
    const capped = typeof input.limit === 'number' && input.limit > 200;
    const offset = typeof input.cursor === 'string' ? Number.parseInt(input.cursor, 10) || 0 : 0;

    const matching = this.#records
      .get(spec.name)!
      .map(flat)
      .filter(record =>
        Object.entries(filter).every(([field, want]) => {
          const have = record[field];

          if (want === null) return have === undefined || have === null || (Array.isArray(have) && !have.length);
          if (Array.isArray(have)) return (Array.isArray(want) ? want : [want]).every(one => have.includes(one));

          return have === want;
        }),
      )
      .sort((a, b) => {
        const [x, y] = [a[sort.field], b[sort.field]] as [string | number, string | number];
        const order = x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : 1;

        return dir === 'asc' ? order : -order;
      });

    const items = matching.slice(offset, offset + limit);
    const more = matching.length > offset + limit;

    return {
      items,
      nextCursor: more ? String(offset + limit) : null,
      ...(capped ? { note: `At most ${limit} come back at once.` } : {}),
    };
  }

  #find(spec: CollectionSpec, id: string): StoredDocument {
    const found = this.#records.get(spec.name)!.find(record => record.id === id);

    if (!found) throw new Refused(`There is no such ${spec.label}.`, { error: 'not_found' });

    return found;
  }

  #spec(collection: string): CollectionSpec {
    const spec = this.#specs.find(one => one.name === collection);

    if (!spec) throw new Error(`The manifest declares no collection called "${collection}".`);

    return spec;
  }

  #id(spec: CollectionSpec): string {
    return `${spec.label}_${++this.#next}`;
  }

  /** Every write a millisecond after the last, so "newest first" is never a tie. */
  #stamp(): { createdAt: string; updatedAt: string } {
    const at = new Date((this.#clock += 1)).toISOString();

    return { createdAt: at, updatedAt: at };
  }
}

/** A record as the tools hand it out: the kept fields beside the body's, flat. */
function flat(doc: StoredDocument): Record<string, unknown> {
  return { id: doc.id, version: doc.version, ...doc.body, createdBy: doc.createdBy, createdAt: doc.createdAt, updatedAt: doc.updatedAt };
}

/** The store's rules for a write, from `document-store.service.ts`. */
function checked(spec: CollectionSpec, changes: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = { ...base };

  for (const [field, value] of Object.entries(changes)) {
    if (!spec.fields[field]) throw new Refused(`${field} is not a field of ${spec.label}.`, { error: 'invalid', field });

    if (value === null || value === undefined) delete body[field];
    else body[field] = value;
  }

  for (const [field, type] of Object.entries(spec.fields)) {
    const value = body[field];

    if (value === undefined) {
      if (type.kind === 'string[]') {
        body[field] = [];
        continue;
      }

      if (!type.optional) throw new Refused(`${field} is required.`, { error: 'invalid', field });
      continue;
    }

    const problem = valueProblem(field, type, value);

    if (problem) throw new Refused(problem, { error: 'invalid', field });
  }

  return body;
}

/** Phase 0's search: words of `q` that are allowed values of a choice become filters. */
function searchFilter(spec: CollectionSpec, q: string): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  for (const word of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    const hit = Object.entries(spec.fields).find(
      ([field, type]) =>
        (type.kind === 'enum' || type.kind === 'token') && filter[field] === undefined && (type.values ?? []).some(value => value.toLowerCase() === word),
    );

    if (hit) filter[hit[0]] = (hit[1].values ?? []).find(value => value.toLowerCase() === word);
  }

  return filter;
}

// --- The server's argument schemas, for a screen's call -----------------------

function problemOf(error: z.ZodError): string {
  const issue = error.issues[0];
  const where = issue?.path.length ? issue.path.join('.') : 'The arguments';
  const message = (issue?.message ?? 'not what this tool takes').replace(/\.$/, '');

  return `${where}: ${message}.`;
}

function createField(type: FieldType): ZodType {
  const base = valueSchema(type).describe(describeType(type));

  return type.optional || type.kind === 'string[]' ? base.optional() : base;
}

function updateField(type: FieldType): ZodType {
  const base = valueSchema(type).describe(describeType(type));

  return (type.optional ? base.nullable() : base).optional();
}

function filterSchema(spec: CollectionSpec): ZodType {
  const shape: Record<string, ZodType> = {};

  for (const field of spec.structured) {
    const type = spec.fields[field]!;
    const one =
      type.kind === 'string[]'
        ? z.union([z.string().max(FIELD_LIMITS.stringChars), z.array(z.string().max(FIELD_LIMITS.stringChars))])
        : valueSchema(type);

    shape[field] = one.nullable().optional();
  }

  return z.object(shape).catchall(z.unknown()).optional();
}

const idSchema = z.string().min(1).max(200);
const limitSchema = z.number().int().min(1).optional();

function inputFor(verb: ToolVerb, spec: CollectionSpec): z.ZodObject {
  const fields = (as: (type: FieldType) => ZodType) =>
    Object.fromEntries(Object.entries(spec.fields).map(([field, type]) => [field, as(type)]));

  switch (verb) {
    case 'create':
      return z.object(fields(createField));
    case 'update':
      return z.object({ id: idSchema, version: z.number().int().min(1), ...fields(updateField) });
    case 'get':
    case 'delete':
      return z.object({ id: idSchema });
    case 'list':
      return z.object({
        filter: filterSchema(spec),
        sort: z
          .object({
            field: z.enum([...spec.sortable, 'updatedAt', 'createdAt'] as unknown as [string, ...string[]]),
            dir: z.enum(['asc', 'desc']).optional(),
          })
          .optional(),
        limit: limitSchema,
        cursor: z.string().max(2_000).optional(),
      });
    case 'search':
      return z.object({ q: z.string().min(1).max(200), filter: filterSchema(spec), limit: limitSchema });
  }
}
