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
  /** Who last wrote it, and through which door (Brydio `569a36c`): a screen, the assistant, a migration. */
  updatedBy: string | null;
  updatedOrigin: 'screen' | 'assistant' | 'migration' | null;
}

export type Fixtures = Record<string, Record<string, unknown>[]>;

/** A committed change, as Brydio's document events carry it: never the record. */
export interface StoreChange {
  collection: string;
  id: string;
  op: 'create' | 'update' | 'delete';
  version: number;
}

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
  readonly #listeners = new Set<(change: StoreChange) => void>();
  #clock: number;
  #next = 0;

  constructor(manifest: Pick<ManifestExtensions, 'data' | 'tools'>, fixtures: Fixtures = {}, options: { now?: Date } = {}) {
    this.#specs = manifest.tools?.generated === false ? [] : collectionsOf(manifest);
    this.#clock = (options.now ?? new Date('2026-09-12T09:00:00.000Z')).getTime();

    for (const spec of this.#specs) this.#records.set(spec.name, []);

    for (const [collection, seeds] of Object.entries(fixtures)) {
      const spec = this.#spec(collection);

      for (const seed of seeds) {
        const { id, version, createdBy, updatedBy, updatedOrigin, ...fields } = seed as {
          id?: unknown;
          version?: unknown;
          createdBy?: unknown;
          updatedBy?: unknown;
          updatedOrigin?: unknown;
        };
        const body = checked(spec, fields, {});

        this.#records.get(spec.name)!.push({
          id: typeof id === 'string' ? id : this.#id(spec),
          version: typeof version === 'number' ? version : 1,
          body,
          createdBy: typeof createdBy === 'string' ? createdBy : 'user_fixture',
          updatedBy: typeof updatedBy === 'string' ? updatedBy : null,
          updatedOrigin: updatedOrigin === 'screen' || updatedOrigin === 'assistant' || updatedOrigin === 'migration' ? updatedOrigin : null,
          ...this.#stamp(),
        });
      }
    }
  }

  /** A collection's records as they stand, flat, oldest first. */
  records(collection: string): Record<string, unknown>[] {
    return (this.#records.get(this.#spec(collection).name) ?? []).map(flat);
  }

  /** Hears every change after it is made, by a tool or by a test. Returns a function that stops. */
  onChange(listener: (change: StoreChange) => void): () => void {
    this.#listeners.add(listener);

    return () => this.#listeners.delete(listener);
  }

  /**
   * Changes a record as somebody other than the screen would: another person,
   * an agent, a tool call elsewhere. With an `id` that exists, the fields are
   * merged in and the version goes up; otherwise a record is made, with that
   * id if one is given. Checked as the store checks a write. Answers the
   * record as the tools hand it out.
   */
  put(collection: string, fields: Record<string, unknown>): Record<string, unknown> {
    const spec = this.#spec(collection);
    const { id, version: _version, ...changes } = fields;
    const records = this.#records.get(spec.name)!;
    const current = typeof id === 'string' ? records.find(record => record.id === id) : undefined;

    try {
      if (current) {
        current.body = checked(spec, changes, current.body);
        current.version += 1;
        current.updatedAt = this.#stamp().updatedAt;
        // Somebody else: the assistant, acting for another person.
        current.updatedBy = 'user_other';
        current.updatedOrigin = 'assistant';
        this.#emit(spec, current, 'update');

        return flat(current);
      }

      const made: StoredDocument = {
        id: typeof id === 'string' ? id : this.#id(spec),
        version: 1,
        body: checked(spec, changes, {}),
        createdBy: 'user_other',
        updatedBy: 'user_other',
        updatedOrigin: 'assistant',
        ...this.#stamp(),
      };

      records.push(made);
      this.#emit(spec, made, 'create');

      return flat(made);
    } catch (error) {
      if (error instanceof Refused) throw new Error(error.message);

      throw error;
    }
  }

  /** Deletes a record as somebody other than the screen would. */
  remove(collection: string, id: string): void {
    const spec = this.#spec(collection);
    const records = this.#records.get(spec.name)!;
    const found = records.find(record => record.id === id);

    if (!found) throw new Error(`There is no such ${spec.label}.`);

    records.splice(records.indexOf(found), 1);
    this.#emit(spec, found, 'delete');
  }

  /** Whether the manifest declares this collection. */
  has(collection: string): boolean {
    return this.#specs.some(one => one.name === collection);
  }

  #emit(spec: CollectionSpec, doc: StoredDocument, op: StoreChange['op']): void {
    const change: StoreChange = { collection: spec.name, id: doc.id, op, version: doc.version };

    for (const listener of [...this.#listeners]) listener(change);
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

      handlers[`batch_${spec.plural}`] = input => this.#batch(spec, input);
    }

    return handlers;
  }

  /**
   * `batch_<plural>` (Brydio `f872f42`, G13): several creates, updates and
   * deletes under one approval, all or none. Each change is checked by its
   * single write's own schema and rules, in order, against the records as the
   * changes before it left them; a refusal names the change and writes
   * nothing. Changes are heard by a watch only once the batch has applied.
   */
  #batch(spec: CollectionSpec, input: Record<string, unknown>): ToolResultShape {
    const changes = (input ?? {}).changes;
    const plural = spec.plural;

    if (!Array.isArray(changes) || changes.length < 1 || changes.length > 50) {
      return refusal(`changes: ${Array.isArray(changes) && changes.length > 50 ? 'Too big: expected array to have <=50 items' : 'Too small: expected array to have >=1 items'}.`);
    }

    const records = this.#records.get(spec.name)!;
    const saved = records.map(record => ({ ...record, body: { ...record.body } }));
    const clock = this.#clock;
    const next = this.#next;
    const listeners = [...this.#listeners];
    const heard: StoreChange[] = [];
    const results: Record<string, unknown>[] = [];
    const words = { create: 0, update: 0, delete: 0 };

    // Changes are held back from any watch until every one has applied.
    this.#listeners.clear();
    this.#listeners.add(change => void heard.push(change));

    try {
      for (const [index, raw] of changes.entries()) {
        const change = (raw ?? {}) as { op?: unknown; id?: unknown; version?: unknown; fields?: unknown };
        const op = change.op;

        if (op !== 'create' && op !== 'update' && op !== 'delete') return this.#undo(spec, saved, clock, next, `changes.${index}.op: Invalid input.`);

        const args = op === 'create' ? (change.fields as Record<string, unknown>) : op === 'update' ? { ...(change.fields as object), id: change.id, version: change.version } : { id: change.id };
        const parsed = inputFor(op, spec).safeParse(args ?? {});

        if (!parsed.success) return this.#undo(spec, saved, clock, next, `Change ${index + 1} of ${changes.length}: ${problemOf(parsed.error)} Nothing in the batch was written.`);

        try {
          const done = this.#run(op, spec, parsed.data as Record<string, unknown>);

          words[op] += 1;
          results.push(op === 'delete' ? { op, id: String(parsed.data.id) } : { op, ...(done.structuredContent as object) });
        } catch (error) {
          if (!(error instanceof Refused)) throw error;

          return this.#undo(spec, saved, clock, next, `Change ${index + 1} of ${changes.length}: ${error.message.split('\n')[0]} Nothing in the batch was written.`, { ...error.data, change: index });
        }
      }
    } finally {
      this.#listeners.clear();
      for (const listener of listeners) this.#listeners.add(listener);
    }

    for (const change of heard) for (const listener of listeners) listener(change);

    const summary = (['create', 'update', 'delete'] as const)
      .filter(op => words[op] > 0)
      .map((op, at) => {
        const verb = { create: 'Create', update: 'change', delete: 'delete' }[op];
        const said = at === 0 ? verb[0]!.toUpperCase() + verb.slice(1) : verb.toLowerCase();

        return `${said} ${words[op]} ${words[op] === 1 ? spec.label : plural}`;
      })
      .join(', ');

    return answer(`${summary}: done.`, { changes: results }, summary);
  }

  /** Puts a collection back as it was before a refused batch, and answers the refusal. */
  #undo(spec: CollectionSpec, saved: StoredDocument[], clock: number, next: number, message: string, data?: Record<string, unknown>): ToolResultShape {
    this.#records.set(spec.name, saved);
    this.#clock = clock;
    this.#next = next;

    return refusal(message, data);
  }

  #run(verb: ToolVerb, spec: CollectionSpec, input: Record<string, unknown>): ToolResultShape {
    const records = this.#records.get(spec.name)!;
    const { label } = spec;
    const article = /^[aeiou]/.test(label) ? 'an' : 'a';

    switch (verb) {
      case 'create': {
        const made: StoredDocument = {
          id: this.#id(spec),
          version: 1,
          body: checked(spec, input, {}),
          createdBy: 'user_fixture',
          updatedBy: 'user_fixture',
          updatedOrigin: 'screen',
          ...this.#stamp(),
        };

        records.push(made);
        this.#emit(spec, made, 'create');

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
        // The screen, as the person testing it.
        current.updatedBy = 'user_fixture';
        current.updatedOrigin = 'screen';
        this.#emit(spec, current, 'update');

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
        this.#emit(spec, found, 'delete');

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

  /** A new id, never one a seeded or earlier record already has. */
  #id(spec: CollectionSpec): string {
    const taken = new Set(this.#records.get(spec.name)?.map(record => record.id));
    let id: string;

    do id = `${spec.label}_${++this.#next}`;
    while (taken.has(id));

    return id;
  }

  /** Every write a millisecond after the last, so "newest first" is never a tie. */
  #stamp(): { createdAt: string; updatedAt: string } {
    const at = new Date((this.#clock += 1)).toISOString();

    return { createdAt: at, updatedAt: at };
  }
}

/** A record as the tools hand it out: the kept fields beside the body's, flat. */
function flat(doc: StoredDocument): Record<string, unknown> {
  return {
    id: doc.id,
    version: doc.version,
    ...doc.body,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
    updatedOrigin: doc.updatedOrigin,
  };
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
