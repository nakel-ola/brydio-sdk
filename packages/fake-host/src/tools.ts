import {
  ANONYMOUS_WRITER,
  FIELD_LIMITS,
  OPEN_LIMITS,
  coeditedFields,
  collectionsOf,
  definitionOf,
  definitionTypeProblem,
  describeType,
  fieldTypeOf,
  hasChoices,
  keyFromName,
  keyProblem,
  missingRequired,
  moveValue,
  openSpec,
  openValueProblem,
  toolNames,
  valueProblem,
  valueSchema,
  type CollectionSpec,
  type FieldType,
  type ManifestExtensions,
  type Moved,
  type OpenField,
  type OpenFieldChange,
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
  /** From an anonymous collection (P13): handed out with no writer. */
  anonymous?: true;
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
  /** The most rows one open-schema table may hold (P5); an option so a test can lower it. */
  readonly #rowsPerTable: number;

  constructor(
    manifest: Pick<ManifestExtensions, 'data' | 'tools'>,
    fixtures: Fixtures = {},
    options: { now?: Date; rowsPerTable?: number } = {},
  ) {
    this.#specs = manifest.tools?.generated === false ? [] : collectionsOf(manifest);
    this.#clock = (options.now ?? new Date('2026-09-12T09:00:00.000Z')).getTime();
    this.#rowsPerTable = options.rowsPerTable ?? OPEN_LIMITS.rowsPerTable;

    for (const spec of this.#specs) this.#records.set(spec.name, []);

    // Field definitions first, so an open collection's seeded rows are
    // checked against them (P5).
    const seeded = Object.entries(fixtures).sort(
      ([a], [b]) => Number(Boolean(this.#specs.find(one => one.name === b)?.definesFieldsOf)) - Number(Boolean(this.#specs.find(one => one.name === a)?.definesFieldsOf)),
    );

    for (const [collection, seeds] of seeded) {
      const spec = this.#spec(collection);

      for (const seed of seeds) {
        const { id, version, createdBy, updatedBy, updatedOrigin, ...fields } = seed as {
          id?: unknown;
          version?: unknown;
          createdBy?: unknown;
          updatedBy?: unknown;
          updatedOrigin?: unknown;
        };
        const body = this.#created(spec, fields);

        if (spec.anonymous) {
          this.#records.get(spec.name)!.push(this.#anonymous(typeof id === 'string' ? id : this.#id(spec), body));
          continue;
        }

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
      if (spec.anonymous) {
        if (current) throw immutable(spec);

        const made = this.#anonymous(typeof id === 'string' ? id : this.#id(spec), this.#created(spec, changes));

        records.push(made);

        return flat(made);
      }

      if (current) {
        current.body = this.#changed(spec, current, changes).body;
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
        body: this.#created(spec, changes),
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

    this.#removed(spec, found);
    records.splice(records.indexOf(found), 1);
    this.#emit(spec, found, 'delete');
  }

  /**
   * Why a screen can't watch this collection, or null: an anonymous one's
   * answers are never told as they arrive (P13, `anonymous_no_watch`).
   */
  unwatchable(collection: string): string | null {
    const spec = this.#specs.find(one => one.name === collection);

    return spec?.anonymous ? `${spec.plural} are anonymous, so their changes aren’t told as they happen. Read them again instead. (anonymous_no_watch)` : null;
  }

  /** Whether the manifest declares this collection. */
  has(collection: string): boolean {
    return this.#specs.some(one => one.name === collection);
  }

  #emit(spec: CollectionSpec, doc: StoredDocument, op: StoreChange['op']): void {
    // An anonymous answer's arrival or removal is told to nobody (P13).
    if (spec.anonymous) return;

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

    if (spec.anonymous) return refusal(immutable(spec).message, { error: 'anonymous_immutable' });

    if (!Array.isArray(changes) || changes.length < 1 || changes.length > 50) {
      return refusal(`changes: ${Array.isArray(changes) && changes.length > 50 ? 'Too big: expected array to have <=50 items' : 'Too small: expected array to have >=1 items'}.`);
    }

    // Every collection, since a field definition's change moves its table's rows too (P5).
    const saved = new Map([...this.#records].map(([name, records]) => [name, records.map(record => ({ ...record, body: { ...record.body } }))]));
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
  #undo(_spec: CollectionSpec, saved: Map<string, StoredDocument[]>, clock: number, next: number, message: string, data?: Record<string, unknown>): ToolResultShape {
    for (const [name, records] of saved) this.#records.set(name, records);
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
        if (spec.anonymous) {
          const body = this.#created(spec, input);

          // An answer never carries who gave it: here, the person testing.
          if (JSON.stringify(body).toLowerCase().includes(FIXTURE_USER)) {
            throw new Refused('This answer is anonymous, so it can’t carry who is giving it. (anonymous_names_writer)', { error: 'anonymous_names_writer' });
          }

          const made = this.#anonymous(this.#id(spec), body);

          records.push(made);

          return answer(`Created ${label} ${made.id}.`, flat(made), `Created ${article} ${label}`);
        }

        const made: StoredDocument = {
          id: this.#id(spec),
          version: 1,
          body: this.#created(spec, input),
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
        if (spec.anonymous) throw immutable(spec);

        const { id, version, ...changes } = input;
        const current = this.#find(spec, String(id));

        // A field's key and table, and a row's table, never change (P5):
        // refused before the version is looked at, as in Brydio.
        this.#settled(spec, current, changes);

        // A co-edited field (DW01) leaves the version check, as in Brydio:
        // several people write it at once and its text comes back without a
        // new version. A change that touches only such fields keeps the version.
        const coedited = new Set(coeditedFields(spec.fields));
        const ordinary = Object.keys(changes).some(field => !coedited.has(field));

        if (ordinary && current.version !== version) {
          throw new Refused(
            `This ${label} changed since you read it. Here it is as it is now; make the change again on version ${current.version}.\n${JSON.stringify(flat(current))}`,
            { error: 'stale', current: flat(current) },
          );
        }

        const { body, fieldChange } = this.#changed(spec, current, changes);

        current.body = body;
        if (ordinary) current.version += 1;
        current.updatedAt = this.#stamp().updatedAt;
        // The screen, as the person testing it.
        current.updatedBy = 'user_fixture';
        current.updatedOrigin = 'screen';
        this.#emit(spec, current, 'update');

        // A field definition's change says what it did to the table (P5).
        return answer(
          `Changed ${label} ${current.id}; it is at version ${current.version} now.`,
          { ...flat(current), ...(fieldChange ? { fieldChange } : {}) },
          `Changed ${article} ${label}`,
        );
      }
      case 'get': {
        const record = this.#find(spec, String(input.id));

        // Only once its group holds enough answers to hide it among (P13).
        if (spec.anonymous) {
          const group = spec.anonymous.group;

          if (records.filter(one => one.body[group] === record.body[group]).length < spec.anonymous.minimum) throw tooFew(spec);
        }

        const found = flat(record);

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

        this.#removed(spec, found);
        records.splice(records.indexOf(found), 1);
        this.#emit(spec, found, 'delete');

        return answer(`Deleted ${label} ${found.id}.`, { id: found.id }, `Deleted ${article} ${label}`);
      }
    }
  }

  #page(declared: CollectionSpec, filter: Record<string, unknown>, input: Record<string, unknown>) {
    const sort = (input.sort as { field: string; dir?: 'asc' | 'desc' } | undefined) ?? { field: 'updatedAt' };
    const spec = declared.openSchema ? this.#listedTable(declared, filter, sort) : declared;

    for (const field of Object.keys(filter)) {
      if (!spec.structured.includes(field)) {
        throw new Refused(spec.fields[field] ? `${field} is not a field a list can be filtered by.` : notAField(spec, field), { error: 'invalid', field });
      }
    }

    const time = sort.field === 'updatedAt' || sort.field === 'createdAt';

    // An open table's sort is checked here: its fields are not the schema's enum.
    if (!time && !spec.sortable.includes(sort.field)) {
      throw new Refused(spec.fields[sort.field] ? `${sort.field} is not a field a list can be sorted by.` : notAField(spec, sort.field), {
        error: 'invalid',
        field: sort.field,
      });
    }

    // One whole group at a time, named before anything is read (P13).
    if (spec.anonymous) {
      const value = filter[spec.anonymous.group];

      if (!(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') || value === '') {
        throw new Refused(`${spec.plural} are anonymous: name one ${spec.anonymous.group} in the filter to read them. (anonymous_needs_group)`, { error: 'anonymous_needs_group' });
      }
    }

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

    // Every filter must match enough answers to hide each among; else nothing, not even how many (P13).
    if (spec.anonymous && matching.length < spec.anonymous.minimum) throw tooFew(spec);

    const items = matching.slice(offset, offset + limit);
    const more = matching.length > offset + limit;

    return {
      items,
      nextCursor: more ? String(offset + limit) : null,
      ...(capped ? { note: `At most ${limit} come back at once.` } : {}),
    };
  }

  // --- Open-schema collections (P5), as Brydio's document store keeps them --

  /** A new record's body: for an open table, checked against its live fields; for a field definition, given its key. */
  #created(spec: CollectionSpec, input: Record<string, unknown>): Record<string, unknown> {
    if (spec.definesFieldsOf) return checked(spec, this.#newDefinition(spec, input), {});

    if (!spec.openSchema) return checked(spec, input, {});

    const live = this.#openRow(spec, input, input, true);

    if (this.#tableRows(spec, live.table).length >= this.#rowsPerTable) {
      throw new Refused(
        `This table already holds ${this.#rowsPerTable.toLocaleString('en-GB')} ${spec.plural}, the most one table may hold. Delete some to make room.`,
        { error: 'full' },
      );
    }

    return checked(live.spec, input, {});
  }

  /** What an update leaves a record as, and, for a field definition whose type or choices changed, what it did to the table. */
  #changed(
    spec: CollectionSpec,
    current: StoredDocument,
    changes: Record<string, unknown>,
  ): { body: Record<string, unknown>; fieldChange?: OpenFieldChange } {
    this.#settled(spec, current, changes);

    if (spec.openSchema) return { body: checked(this.#openRow(spec, changes, current.body, false).spec, changes, current.body) };

    if (!spec.definesFieldsOf) return { body: checked(spec, changes, current.body) };

    const table = this.#ownerOf(spec).openSchema!.table;
    const body = checked(spec, changes, current.body);
    const problem = definitionTypeProblem(body);

    if (problem) throw new Refused(problem, { error: 'invalid', field: 'choices' });

    const before = definitionOf(current.id, current.body, table);
    const after = definitionOf(current.id, body, table);

    if (!before || !after) return { body };

    const retyped = before.type !== after.type;
    const narrowed = hasChoices(after.type) && before.choices.some(choice => !after.choices.includes(choice));

    if (!retyped && !narrowed) return { body };

    return {
      body,
      fieldChange: this.#rewriteTable(spec, before, retyped ? 'retype' : 'choices', value => moveValue(value, before, after), after),
    };
  }

  /** Refuses a change to what never changes: a field's key and table, and a row's table. */
  #settled(spec: CollectionSpec, current: StoredDocument, changes: Record<string, unknown>): void {
    if (spec.openSchema) {
      const field = spec.openSchema.table;

      if (field && Object.hasOwn(changes, field) && changes[field] !== current.body[field]) {
        throw new Refused(`A ${spec.label} stays in its table: ${field} never changes.`, { error: 'invalid', field });
      }
    }

    if (spec.definesFieldsOf) {
      const field = this.#ownerOf(spec).openSchema!.table;

      if (field && Object.hasOwn(changes, field) && changes[field] !== current.body[field]) {
        throw new Refused(`A field stays in its table: ${field} never changes.`, { error: 'invalid', field });
      }

      if (Object.hasOwn(changes, 'key') && changes.key !== current.body.key) {
        throw new Refused(`A field's key never changes, so rows and tools keep finding it; change its name instead.`, { error: 'invalid', field: 'key' });
      }
    }
  }

  /** A field definition's delete takes its values from every row of its table. */
  #removed(spec: CollectionSpec, found: StoredDocument): void {
    if (!spec.definesFieldsOf) return;

    const gone = definitionOf(found.id, found.body, this.#ownerOf(spec).openSchema!.table);

    if (gone) this.#rewriteTable(spec, gone, 'delete', () => ({ outcome: 'cleared' }));
  }

  /** The open collection a companion defines the fields of. */
  #ownerOf(companion: CollectionSpec): CollectionSpec {
    return this.#spec(companion.definesFieldsOf!);
  }

  /** One table's live fields, in the order they were made. */
  #liveFields(owner: CollectionSpec, table: string | null): OpenField[] {
    const { fields, table: field } = owner.openSchema!;

    return (this.#records.get(fields) ?? [])
      .map(record => definitionOf(record.id, record.body, field))
      .filter((one): one is OpenField => one !== null && one.table === table);
  }

  /** The live rows of one table. */
  #tableRows(owner: CollectionSpec, table: string | null): StoredDocument[] {
    return this.#records.get(owner.name)!.filter(record => tableValue(owner.openSchema!.table, record.body) === table);
  }

  /**
   * A row write's schema: its table named, its live fields folded in, and
   * what the store's own types cannot say checked (a web address, a rating's
   * range, a create leaving a required field out).
   */
  #openRow(spec: CollectionSpec, given: Record<string, unknown>, body: Record<string, unknown>, create: boolean) {
    const field = spec.openSchema!.table;
    const table = tableValue(field, body);

    if (field && table === null) {
      throw new Refused(`${field} names the table this ${spec.label} belongs to, and is required.`, { error: 'invalid', field });
    }

    const fields = this.#liveFields(spec, table);

    for (const one of fields) {
      if (create && missingRequired(one, given[one.key])) {
        throw new Refused(`${one.key} ("${one.name}") is required.`, { error: 'invalid', field: one.key });
      }

      const problem = Object.hasOwn(given, one.key) ? openValueProblem(one, given[one.key]) : null;

      if (problem) throw new Refused(problem, { error: 'invalid', field: one.key });
    }

    return { spec: openSpec(spec, fields), table, fields };
  }

  /** A list's table: named in its filter, or the only one. Without it, only the manifest's fields filter and sort. */
  #listedTable(spec: CollectionSpec, filter: Record<string, unknown>, sort: { field: string }): CollectionSpec {
    const field = spec.openSchema!.table;
    const named = field ? filter[field] : null;

    if (field && typeof named !== 'string') {
      const asked = [...Object.keys(filter), sort.field].find(key => !spec.fields[key] && key !== 'updatedAt' && key !== 'createdAt');

      if (asked) {
        throw new Refused(`${asked}: name the ${field} in the filter to filter or sort on a table's own fields.`, { error: 'invalid', field: asked });
      }

      return spec;
    }

    return openSpec(spec, this.#liveFields(spec, field ? (named as string) : null));
  }

  /**
   * A new field definition: its table named, room for one more field, a key
   * (made from its name when left out) that is free, and its choices.
   */
  #newDefinition(spec: CollectionSpec, input: Record<string, unknown>): Record<string, unknown> {
    const owner = this.#ownerOf(spec);
    const field = owner.openSchema!.table;
    const table = tableValue(field, input);

    if (field && table === null) throw new Refused(`${field} names the table this field belongs to, and is required.`, { error: 'invalid', field });

    const live = this.#liveFields(owner, table);

    if (live.length >= OPEN_LIMITS.fieldsPerTable) {
      throw new Refused(`A table may have at most ${OPEN_LIMITS.fieldsPerTable} fields.`, { error: 'invalid', field: 'key' });
    }

    const taken = new Set(live.map(one => one.key));
    const fixed = new Set(Object.keys(owner.fields));
    const key =
      input.key === undefined || input.key === null || input.key === ''
        ? keyFromName(typeof input.name === 'string' ? input.name : '', new Set([...taken, ...fixed]))
        : input.key;

    if (typeof key !== 'string') throw new Refused('key must be text.', { error: 'invalid', field: 'key' });

    const wrong = keyProblem(key, fixed, taken) ?? definitionTypeProblem(input);

    if (wrong) throw new Refused(wrong, { error: 'invalid', field: keyProblem(key, fixed, taken) ? 'key' : 'choices' });

    return { ...input, key };
  }

  /**
   * Moves one field's value in every row of its table that holds one, after
   * its definition changed. Each moved row gets a new version and is heard
   * as a migration's change, as in Brydio; its `updatedAt` is left alone.
   */
  #rewriteTable(companion: CollectionSpec, field: OpenField, op: OpenFieldChange['op'], move: (value: unknown) => Moved, to?: OpenField): OpenFieldChange {
    const owner = this.#ownerOf(companion);
    const report: OpenFieldChange = { field: field.key, op, rows: 0, kept: 0, converted: 0, cleared: 0 };

    for (const row of this.#tableRows(owner, field.table)) {
      if (!Object.hasOwn(row.body, field.key)) continue;

      // An empty list is how a list field is kept when nobody set it: it
      // stays for a list, goes quietly for anything else, and is no value to report.
      const blank = Array.isArray(row.body[field.key]) && (row.body[field.key] as unknown[]).length === 0;

      if (blank && to && fieldTypeOf(to).kind === 'string[]') continue;
      if (!blank) report.rows += 1;

      const moved: Moved = blank ? { outcome: 'cleared' } : move(row.body[field.key]);

      if (!blank) report[moved.outcome] += 1;
      if (moved.outcome === 'kept') continue;

      const next = { ...row.body };

      if (moved.outcome === 'cleared') delete next[field.key];
      else next[field.key] = moved.value;

      row.body = next;
      row.version += 1;
      // An anonymous answer's move keeps no mover (P13); #emit tells nobody.
      row.updatedOrigin = owner.anonymous ? null : 'migration';
      row.updatedBy = owner.anonymous ? null : 'user_fixture';
      this.#emit(owner, row, 'update');
    }

    return report;
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

  /** An anonymous answer as Brydio keeps it (P13): by nobody, from nowhere, at the start of its day. */
  #anonymous(id: string, body: Record<string, unknown>): StoredDocument {
    const at = new Date((this.#clock += 1));
    const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())).toISOString();

    return { id, version: 1, body, createdBy: ANONYMOUS_WRITER, updatedBy: null, updatedOrigin: null, createdAt: day, updatedAt: day, anonymous: true };
  }

  /** Every write a millisecond after the last, so "newest first" is never a tie. */
  #stamp(): { createdAt: string; updatedAt: string } {
    const at = new Date((this.#clock += 1)).toISOString();

    return { createdAt: at, updatedAt: at };
  }
}

/** Who the person testing a screen is, to the store. */
const FIXTURE_USER = 'user_fixture';

const immutable = (spec: CollectionSpec) =>
  new Refused(`Anonymous ${spec.label} answers are never changed once given; only removed. (anonymous_immutable)`, { error: 'anonymous_immutable' });

const tooFew = (spec: CollectionSpec) =>
  new Refused(
    `There aren’t enough ${spec.plural} to show yet: anonymous answers are read only ${spec.anonymous!.minimum} or more at a time. (too_few_answers)`,
    { error: 'too_few_answers' },
  );

/** A record as the tools hand it out: the kept fields beside the body's, flat. An anonymous answer says when (to the day), never who. */
function flat(doc: StoredDocument): Record<string, unknown> {
  if (doc.anonymous) return { id: doc.id, version: doc.version, ...doc.body, createdAt: doc.createdAt, updatedAt: doc.updatedAt };

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

/** Brydio's `notAField`: an open table's fields are the live ones, so it names them (P5). */
function notAField(spec: CollectionSpec, field: string): string {
  if (spec.openSchema) {
    return `${field} is not a field of this ${spec.label}'s table; its fields are ${Object.keys(spec.fields).join(', ')}.`;
  }

  return `${field} is not a field of ${spec.label}.`;
}

/** The table a row or definition names, or null when the collection has none. */
function tableValue(tableField: string | null, body: Record<string, unknown>): string | null {
  if (!tableField) return null;

  const value = body[tableField];

  return typeof value === 'string' && value.length > 0 && value.length <= FIELD_LIMITS.stringChars ? value : null;
}

/** The store's rules for a write, from `document-store.service.ts`. */
function checked(spec: CollectionSpec, changes: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = { ...base };

  for (const [field, value] of Object.entries(changes)) {
    if (!spec.fields[field]) throw new Refused(notAField(spec, field), { error: 'invalid', field });
    // A drawing's summary is the host's to write, from its board (WB01).
    if (spec.fields[field].kind === 'canvas') {
      throw new Refused(`${field} is a drawing: it is changed on its board, never written.`, { error: 'invalid', field });
    }

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
  // A drawing is changed on its board, never by a tool (WB01), as in Brydio.
  const fields = (as: (type: FieldType) => ZodType) =>
    Object.fromEntries(
      Object.entries(spec.fields)
        .filter(([, type]) => type.kind !== 'canvas')
        .map(([field, type]) => [field, as(type)]),
    );

  // An open table's own fields (P5) are given by key beside the manifest's;
  // the store checks them against the table's live definitions.
  const openKeys = (shape: z.ZodObject): z.ZodObject => (spec.openSchema ? shape.catchall(z.unknown()) : shape);

  switch (verb) {
    case 'create':
      return openKeys(z.object(fields(createField)));
    case 'update':
      return openKeys(z.object({ id: idSchema, version: z.number().int().min(1), ...fields(updateField) }));
    case 'get':
    case 'delete':
      return z.object({ id: idSchema });
    case 'list':
      return z.object({
        filter: filterSchema(spec),
        sort: z
          .object({
            field: spec.openSchema
              ? z.string().min(1).max(FIELD_LIMITS.nameChars)
              : z.enum([...spec.sortable, 'updatedAt', 'createdAt'] as unknown as [string, ...string[]]),
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
