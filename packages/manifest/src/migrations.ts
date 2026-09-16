import { z } from 'zod';

import { SEMVER_FORMAT } from './base.ts';
import { FIELD_NAME, parseFieldType, valueProblem, type FieldType } from './field-types.ts';

// A copy of the pure half of Brydio's `apps/api/src/apps/manifest/migrations.ts`
// (the steps, the schema comparison and the check the publish route runs),
// kept word for word so `brydio validate` refuses a missing migration with
// the server's sentence. Planning and running a migration are the server's
// alone and are left out. `test/migrations.test.ts` compares the two.

/**
 * How a version says what happens to the records already kept when its
 * schema changes (A3-F07, ADR-A11).
 *
 * Five steps, each with a rule a machine can check and a person can read:
 * add a field (with a default when it is required), rename one, drop one,
 * drop a whole collection, and replace an allowed value that a choice no
 * longer has. Nothing cleverer. A computed value or a merge is an app's own
 * job after the migration has run (A3-F08).
 *
 * A version's `migrations` lists every step since the schema began, each
 * entry naming the version it brings the schema to, so a workspace two
 * versions behind runs both entries in order. Everything here is pure: the
 * store's half, which rewrites records, is `SchemaMigrations` in `data/`.
 */

const collection = z.string().min(1).max(40);
const field = z.string().min(1).max(40);

export const migrationStepSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), collection, field, default: z.unknown().optional() }),
  z.object({ op: z.literal('rename'), collection, from: field, to: field }),
  z.object({ op: z.literal('drop'), collection, field }),
  z.object({ op: z.literal('dropCollection'), collection }),
  /** A choice lost `from`: records holding it hold `to` instead. */
  z.object({ op: z.literal('replace'), collection, field, from: z.string().max(64), to: z.string().max(64) }),
]);

export const migrationSchema = z.object({
  /** The version these steps bring the schema to. */
  version: z.string().max(64).regex(SEMVER_FORMAT),
  steps: z.array(migrationStepSchema).min(1).max(100),
});

export const migrationsSchema = z.array(migrationSchema).max(200);

export type MigrationStep = z.infer<typeof migrationStepSchema>;
export type Migration = z.infer<typeof migrationSchema>;

// ---------------------------------------------------------------------------
// The schemas, compared

type Schema = Map<string, Map<string, FieldType>>;

/** A version's collections and their field types, read tolerantly: a stored manifest was checked when published. */
export function schemaOf(manifest: unknown): Schema {
  const schema: Schema = new Map();
  const data = record(record(manifest).data);

  for (const [name, declared] of Object.entries(data)) {
    const fields = new Map<string, FieldType>();

    for (const [fieldName, raw] of Object.entries(record(record(declared).schema))) {
      try {
        fields.set(fieldName, parseFieldType(raw));
      } catch {
        // Unreadable here means unreadable to the store too; leaving it out
        // makes it a difference that has to be explained, which is right.
      }
    }

    schema.set(name, fields);
  }

  return schema;
}

export type SchemaChange =
  | { kind: 'collection_added' | 'collection_removed'; collection: string }
  | { kind: 'field_added' | 'field_removed'; collection: string; field: string; type: FieldType }
  | { kind: 'field_type_changed'; collection: string; field: string; from: FieldType; to: FieldType }
  | { kind: 'field_now_required' | 'field_now_optional'; collection: string; field: string }
  | { kind: 'values_added' | 'values_removed'; collection: string; field: string; values: string[] };

/**
 * Every way the records one schema describes differ from another's, collection
 * by collection and field by field, in a fixed order.
 *
 * About storage only: labels, search lists and everything outside `data` are
 * Hodler's `diffManifests` to show, and none of them moves a record.
 */
export function diffSchemas(from: unknown, to: unknown): SchemaChange[] {
  return compare(schemaOf(from), schemaOf(to));
}

function compare(a: Schema, b: Schema): SchemaChange[] {
  const changes: SchemaChange[] = [];

  for (const name of sorted(new Set([...a.keys(), ...b.keys()]))) {
    const before = a.get(name);
    const after = b.get(name);

    if (!before) {
      changes.push({ kind: 'collection_added', collection: name });
      continue;
    }

    if (!after) {
      changes.push({ kind: 'collection_removed', collection: name });
      continue;
    }

    for (const fieldName of sorted(new Set([...before.keys(), ...after.keys()]))) {
      const was = before.get(fieldName);
      const is = after.get(fieldName);

      if (!was) {
        changes.push({ kind: 'field_added', collection: name, field: fieldName, type: is! });
      } else if (!is) {
        changes.push({ kind: 'field_removed', collection: name, field: fieldName, type: was });
      } else if (was.kind !== is.kind) {
        changes.push({ kind: 'field_type_changed', collection: name, field: fieldName, from: was, to: is });
      } else {
        if (was.optional !== is.optional) {
          changes.push({
            kind: is.optional ? 'field_now_optional' : 'field_now_required',
            collection: name,
            field: fieldName,
          });
        }

        if (was.kind === 'enum') {
          const removed = (was.values ?? []).filter(value => !(is.values ?? []).includes(value));
          const added = (is.values ?? []).filter(value => !(was.values ?? []).includes(value));

          if (removed.length) changes.push({ kind: 'values_removed', collection: name, field: fieldName, values: removed });
          if (added.length) changes.push({ kind: 'values_added', collection: name, field: fieldName, values: added });
        }
      }
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Steps against the difference

export type MigrationCode =
  | 'migration_step_invalid'
  | 'migration_step_pointless'
  | 'migration_default_missing'
  | 'migration_default_invalid'
  | 'migration_unexplained'
  | 'migration_type_changed'
  | 'migration_value_removed';

export interface MigrationProblem {
  code: MigrationCode;
  collection: string;
  field?: string;
  message: string;
}

/**
 * Whether `steps` take the records `from` describes to the records `to`
 * describes: every difference explained by a step, every step making one.
 *
 * Worked out by running the steps over a copy of the old schema and
 * comparing what comes out with the new one, so a rename followed by an add
 * under the old name is judged as the two moves it is, not as "nothing
 * changed". An empty list means the steps are right.
 */
export function migrationProblems(from: unknown, to: unknown, steps: readonly MigrationStep[]): MigrationProblem[] {
  const target = schemaOf(to);
  const { schema, problems } = run(schemaOf(from), target, steps);

  for (const change of compare(schema, target)) {
    const where = 'field' in change ? `${change.collection}.${change.field}` : change.collection;

    switch (change.kind) {
      case 'collection_added':
      case 'field_now_optional':
      case 'values_added':
        // Nothing already kept is unreadable after any of these.
        break;
      case 'collection_removed':
        problems.push({
          code: 'migration_unexplained',
          collection: change.collection,
          message: `${change.collection} is no longer declared; say dropCollection to remove its records.`,
        });
        break;
      case 'field_added':
        problems.push({
          code: 'migration_unexplained',
          collection: change.collection,
          field: change.field,
          message: `${where} is new; add it with a step${change.type.optional || change.type.kind === 'string[]' ? '' : ' and a default'}.`,
        });
        break;
      case 'field_removed':
        problems.push({
          code: 'migration_unexplained',
          collection: change.collection,
          field: change.field,
          message: `${where} is gone; drop it or rename it with a step.`,
        });
        break;
      case 'field_type_changed':
        problems.push({
          code: 'migration_type_changed',
          collection: change.collection,
          field: change.field,
          message: `${where} changed type; drop \`${change.field}\` and add it again under a new name.`,
        });
        break;
      case 'field_now_required':
        problems.push({
          code: 'migration_type_changed',
          collection: change.collection,
          field: change.field,
          message: `${where} became required, and records without it would not be readable; add a new field with a default instead.`,
        });
        break;
      case 'values_removed':
        problems.push({
          code: 'migration_value_removed',
          collection: change.collection,
          field: change.field,
          message: `${where} no longer allows ${change.values.map(value => `"${value}"`).join(', ')}; say which value replaces each.`,
        });
        break;
    }
  }

  return problems;
}

/** The old schema with the steps applied, and every step that could not apply or changed nothing. */
function run(start: Schema, target: Schema, steps: readonly MigrationStep[]): { schema: Schema; problems: MigrationProblem[] } {
  const schema: Schema = new Map([...start].map(([name, fields]) => [name, new Map(fields)]));
  const problems: MigrationProblem[] = [];
  const invalid = (step: MigrationStep, message: string, fieldName?: string) =>
    problems.push({ code: 'migration_step_invalid', collection: step.collection, ...(fieldName ? { field: fieldName } : {}), message });
  const pointless = (step: MigrationStep, message: string, fieldName?: string) =>
    problems.push({ code: 'migration_step_pointless', collection: step.collection, ...(fieldName ? { field: fieldName } : {}), message });

  for (const step of steps) {
    const fields = schema.get(step.collection);

    if (step.op === 'dropCollection') {
      if (!fields) invalid(step, `dropCollection ${step.collection}: there is no such collection to drop.`);
      else if (target.has(step.collection)) pointless(step, `dropCollection ${step.collection}: the new version still keeps it.`);
      else schema.delete(step.collection);
      continue;
    }

    if (!fields) {
      invalid(step, `${step.op} in ${step.collection}: there is no such collection.`);
      continue;
    }

    const wanted = target.get(step.collection);

    switch (step.op) {
      case 'add': {
        const type = wanted?.get(step.field);

        if (fields.has(step.field)) {
          invalid(step, `add ${step.collection}.${step.field}: it is already a field.`, step.field);
        } else if (!type) {
          pointless(step, `add ${step.collection}.${step.field}: the new version does not declare it.`, step.field);
        } else {
          const required = !type.optional && type.kind !== 'string[]';

          if (step.default === undefined && required) {
            problems.push({
              code: 'migration_default_missing',
              collection: step.collection,
              field: step.field,
              message: `add ${step.collection}.${step.field}: a required field needs a default for the records already kept.`,
            });
          } else if (step.default !== undefined) {
            const problem = valueProblem(step.field, type, step.default);

            if (problem) {
              problems.push({
                code: 'migration_default_invalid',
                collection: step.collection,
                field: step.field,
                message: `add ${step.collection}.${step.field}: the default is not valid; ${problem}`,
              });
            }
          }

          fields.set(step.field, type);
        }
        break;
      }
      case 'rename': {
        const type = fields.get(step.from);

        if (!type) {
          invalid(step, `rename ${step.collection}.${step.from}: there is no such field.`, step.from);
        } else if (step.from === step.to || !FIELD_NAME.test(step.to)) {
          invalid(step, `rename ${step.collection}.${step.from} to "${step.to}": not a new field name.`, step.from);
        } else if (fields.has(step.to)) {
          invalid(step, `rename ${step.collection}.${step.from} to ${step.to}: ${step.to} is already a field.`, step.to);
        } else if (!wanted?.has(step.to)) {
          pointless(step, `rename ${step.collection}.${step.from} to ${step.to}: the new version does not use the new name in its place.`, step.from);
        } else {
          fields.delete(step.from);
          fields.set(step.to, type);
        }
        break;
      }
      case 'drop': {
        if (!fields.has(step.field)) {
          invalid(step, `drop ${step.collection}.${step.field}: there is no such field.`, step.field);
        } else if (wanted?.has(step.field)) {
          pointless(
            step,
            `drop ${step.collection}.${step.field}: the new version still declares it. To change its type, drop \`${step.field}\` and add it again under a new name.`,
            step.field
          );
        } else {
          fields.delete(step.field);
        }
        break;
      }
      case 'replace': {
        const type = fields.get(step.field);
        const next = wanted?.get(step.field);

        if (!type || type.kind !== 'enum' || !(type.values ?? []).includes(step.from)) {
          invalid(step, `replace in ${step.collection}.${step.field}: "${step.from}" is not one of its values.`, step.field);
        } else if (!next || next.kind !== 'enum' || !(next.values ?? []).includes(step.to)) {
          invalid(step, `replace in ${step.collection}.${step.field}: "${step.to}" is not one of the new version's values.`, step.field);
        } else if ((next.values ?? []).includes(step.from)) {
          pointless(step, `replace in ${step.collection}.${step.field}: the new version still allows "${step.from}".`, step.field);
        } else {
          fields.set(step.field, { ...type, values: (type.values ?? []).filter(value => value !== step.from) });
        }
        break;
      }
    }
  }

  return { schema, problems };
}

// ---------------------------------------------------------------------------
// Publishing and pinning

/**
 * What is wrong with a version's migration against the version published
 * before it (A3-F07-S01): the check the publish route runs, so a version
 * that could never be pinned never reaches a workspace. `previous` is null
 * for an app's first version, which has nothing to migrate.
 */
export function publishedMigrationProblems(previous: unknown, next: unknown): MigrationProblem[] {
  if (previous === null || previous === undefined) return [];

  const version = versionOf(next);
  const steps = migrationsOf(next)
    .filter(entry => entry.version === version)
    .flatMap(entry => entry.steps);

  return migrationProblems(previous, next, steps);
}

// ---------------------------------------------------------------------------

const versionOf = (manifest: unknown): string | null => {
  const version = record(manifest).version;

  return typeof version === 'string' ? version : null;
};

function migrationsOf(manifest: unknown): Migration[] {
  const parsed = migrationsSchema.safeParse(record(manifest).migrations ?? []);

  return parsed.success ? parsed.data : [];
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const sorted = (values: Iterable<string>): string[] => [...values].sort();
