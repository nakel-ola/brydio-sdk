import { z } from 'zod';

import { baseManifestSchema as manifestSchema } from './base.ts';
import {
  COLLECTION_NAME,
  FIELD_LIMITS,
  FIELD_NAME,
  FieldTypeInvalid,
  isSearchable,
  isSortable,
  isStructured,
  parseFieldType,
  RESERVED_FIELDS,
  type FieldType,
} from './field-types.ts';

export {
  COLOUR_TOKENS,
  FIELD_LIMITS,
  parseFieldType,
  RESERVED_FIELDS,
  structuredFields,
  type FieldKind,
  type FieldType,
} from './field-types.ts';

/**
 * What an app adds to `.brydio/app.json` to be more than a bundle of servers
 * and skills: where it is shown, what it keeps, the tools that come from what
 * it keeps, its screens, and what it asks the workspace for (contracts §4).
 *
 * Every key is optional, so every manifest E5 already imports still parses.
 * A copy of Brydio's `apps/api/src/apps/manifest/manifest-ext.schema.ts`, the
 * schema the server reads an installed app's manifest with. The two change
 * together; `test/manifest.test.ts` parses the same manifests with both.
 *
 * Zod says what the additions *are*. The checks that are claims about one
 * field against another — a search list naming a date, a placement naming a
 * screen nobody declared — are `dataProblems` below, with a code each, so an
 * import report can say which collection and which field, not just "invalid".
 */

const placementSchema = z.object({
  kind: z.enum(['project-tab', 'project-sidebar', 'workspace-sidebar']),
  screen: z.string().min(1).max(FIELD_LIMITS.nameChars),
  label: z.string().min(1).max(60).optional(),
  icon: z.string().max(60).optional(),
});

const collectionSchema = z.object({
  /** Field name to type, in the manifest's spelling (`"member?"`, `["todo","done"]`). */
  schema: z.record(z.string(), z.unknown()),
  /** Fields the assistant may one day search by their words. */
  search: z.array(z.string()).optional(),
  /** The singular noun the tools are named with: `issue` gives `create_issue`. */
  label: z.string().optional(),
});

const screenSchema = z.object({
  /**
   * Relative to the bundle's root: `screens/board.js` or `screens/board.mjs`.
   * The server's schema said `.js` only while its store and the mount took
   * `.mjs` too; the schema gives (E1 and Hodler, 16 Sep 14:04 and 14:12).
   */
  entry: z
    .string()
    .min(1)
    .max(200)
    .regex(/^(?!\/)(?!.*\.\.)[A-Za-z0-9_\-./]+\.m?js$/, 'An entry is a .js or .mjs path inside the bundle.'),
});

const toolsSchema = z.object({
  /** Off only when the app supplies every tool itself (A3-F08). */
  generated: z.boolean().optional(),
  /** Tools with handler scripts arrive in Phase 3; empty until then. */
  custom: z.array(z.unknown()).max(0, 'Custom tools are not available yet.').optional(),
});

const grantsSchema = z.object({
  tools: z.array(z.string().max(100)).max(200).optional(),
  collections: z.array(z.string().max(100)).max(FIELD_LIMITS.collections + 1).optional(),
  host: z.array(z.string().max(60)).max(20).optional(),
});

const extensionShape = {
  placements: z.array(placementSchema).max(20).optional(),
  data: z.record(z.string(), collectionSchema).optional(),
  tools: toolsSchema.optional(),
  screens: z.record(z.string(), screenSchema).optional(),
  grants: grantsSchema.optional(),
};

/** One problem with an app's additions, named down to the field. */
export interface DataProblem {
  code: DataProblemCode;
  collection?: string;
  field?: string;
  message: string;
}

export type DataProblemCode =
  | FieldTypeInvalid['code']
  | 'data_too_many_collections'
  | 'data_too_many_fields'
  | 'data_collection_name_format'
  | 'data_field_name_format'
  | 'data_field_reserved'
  | 'data_label_format'
  | 'data_label_taken'
  | 'data_project_field_twice'
  | 'data_search_unknown_field'
  | 'data_search_not_text'
  | 'placement_screen_unknown';

type Additions = z.infer<z.ZodObject<typeof extensionShape>>;

/**
 * Everything wrong with an app's additions that a type cannot say.
 *
 * Exported on its own so E5's validator can fold the codes into its import
 * report; the zod schemas below run it too, so a parse never accepts what
 * this refuses.
 */
export function dataProblems(additions: Additions): DataProblem[] {
  const problems: DataProblem[] = [];
  const collections = Object.entries(additions.data ?? {});

  if (collections.length > FIELD_LIMITS.collections) {
    problems.push({
      code: 'data_too_many_collections',
      message: `An app may keep at most ${FIELD_LIMITS.collections} collections.`,
    });
  }

  const labels = new Map<string, string>();

  for (const [collection, declared] of collections) {
    if (!COLLECTION_NAME.test(collection) || collection.length > FIELD_LIMITS.nameChars) {
      problems.push({
        code: 'data_collection_name_format',
        collection,
        message: `${collection} is not a collection name: lower-case letters, digits and _, starting with a letter.`,
      });
    }

    const label = labelOf(collection, declared.label);

    if (!COLLECTION_NAME.test(label) || label.length > FIELD_LIMITS.nameChars) {
      problems.push({
        code: 'data_label_format',
        collection,
        message: `${collection}'s label must be one lower-case word the tools can be named with.`,
      });
    } else if (labels.has(label)) {
      // Two collections called "issue" would give two `create_issue` tools.
      problems.push({
        code: 'data_label_taken',
        collection,
        message: `${collection} and ${labels.get(label)} would both make tools called ${label}.`,
      });
    } else {
      labels.set(label, collection);
    }

    const fields = Object.entries(declared.schema);

    if (fields.length > FIELD_LIMITS.fields) {
      problems.push({
        code: 'data_too_many_fields',
        collection,
        message: `A collection may have at most ${FIELD_LIMITS.fields} fields.`,
      });
    }

    const types = new Map<string, FieldType>();
    let projectField: string | null = null;

    for (const [field, raw] of fields) {
      if (RESERVED_FIELDS.has(field)) {
        problems.push({
          code: 'data_field_reserved',
          collection,
          field,
          message: `${collection}.${field}: Brydio keeps ${field} on every record itself.`,
        });
        continue;
      }

      if (!FIELD_NAME.test(field) || field.length > FIELD_LIMITS.nameChars) {
        problems.push({
          code: 'data_field_name_format',
          collection,
          field,
          message: `${collection}.${field} is not a field name: letters, digits and _, starting with a lower-case letter.`,
        });
        continue;
      }

      try {
        const type = parseFieldType(raw);

        types.set(field, type);

        if (type.kind === 'project') {
          // The record's project is copied to one indexed column, so a second
          // `project` field would have nowhere to go.
          if (projectField) {
            problems.push({
              code: 'data_project_field_twice',
              collection,
              field,
              message: `${collection} links to a project twice (${projectField} and ${field}); keep one.`,
            });
          }

          projectField = field;
        }
      } catch (error: unknown) {
        if (!(error instanceof FieldTypeInvalid)) throw error;

        problems.push({
          code: error.code,
          collection,
          field,
          message: `${collection}.${field}: ${error.message}`,
        });
      }
    }

    for (const field of declared.search ?? []) {
      const type = types.get(field);

      if (!type) {
        problems.push({
          code: 'data_search_unknown_field',
          collection,
          field,
          message: `${collection} searches ${field}, which is not one of its fields.`,
        });
      } else if (!isSearchable(type)) {
        problems.push({
          code: 'data_search_not_text',
          collection,
          field,
          message: `${collection}.${field} cannot be searched: only text fields can.`,
        });
      }
    }
  }

  const screens = new Set(Object.keys(additions.screens ?? {}));

  for (const placement of additions.placements ?? []) {
    if (!screens.has(placement.screen)) {
      problems.push({
        code: 'placement_screen_unknown',
        message: `A ${placement.kind} placement opens "${placement.screen}", which is not one of the app's screens.`,
      });
    }
  }

  return problems;
}

const refuse = (additions: Additions, ctx: z.RefinementCtx) => {
  for (const problem of dataProblems(additions)) {
    ctx.addIssue({
      code: 'custom',
      message: problem.message,
      path: problem.collection
        ? ['data', problem.collection, ...(problem.field ? ['schema', problem.field] : [])]
        : [],
      params: { code: problem.code },
    });
  }
};

/** The additions alone, for code that has the rest of the manifest already. */
export const manifestExtensionsSchema = z.object(extensionShape).superRefine(refuse);

/** E5's manifest with the additions: the whole `.brydio/app.json` of an app. */
export const appManifestSchema = manifestSchema.extend(extensionShape).superRefine(refuse);

export type ManifestExtensions = z.infer<typeof manifestExtensionsSchema>;
export type AppManifestWithData = z.infer<typeof appManifestSchema>;

/**
 * A collection as the store and the tools read it: parsed once, with the
 * names everything else would otherwise work out for itself.
 */
export interface CollectionSpec {
  name: string;
  /** Singular: `issue`. */
  label: string;
  /** For the list tools: `issues`. */
  plural: string;
  fields: Record<string, FieldType>;
  /** In declaration order. */
  structured: string[];
  sortable: string[];
  search: string[];
  /** The one `project` field, whose value is copied to `app_document.project_id`. */
  projectField: string | null;
}

/**
 * The singular a collection's tools are named with: the manifest's, else the
 * collection's name with a trailing "s" taken off (`issues` → `issue`).
 */
export function labelOf(collection: string, label?: string): string {
  if (label) return label;

  return collection.length > 1 && collection.endsWith('s') ? collection.slice(0, -1) : collection;
}

/**
 * Every collection an app declares, parsed. Throws on a manifest that
 * `dataProblems` would refuse: callers read manifests that were validated
 * when they were stored, and a bad one here is a bug, not input.
 */
export function collectionsOf(manifest: { data?: ManifestExtensions['data'] }): CollectionSpec[] {
  const parsed = manifestExtensionsSchema.parse({ data: manifest.data ?? {} });

  return Object.entries(parsed.data ?? {}).map(([name, declared]) => {
    const fields = Object.fromEntries(
      Object.entries(declared.schema).map(([field, raw]) => [field, parseFieldType(raw)])
    );
    const label = labelOf(name, declared.label);
    const names = Object.keys(fields);

    return {
      name,
      label,
      plural: `${label}s`,
      fields,
      structured: names.filter(field => isStructured(fields[field]!)),
      sortable: names.filter(field => isSortable(fields[field]!)),
      search: declared.search ?? [],
      projectField: names.find(field => fields[field]!.kind === 'project') ?? null,
    };
  });
}

/** One collection by name, or null when the app keeps no such thing. */
export function collectionOf(
  manifest: { data?: ManifestExtensions['data'] },
  collection: string
): CollectionSpec | null {
  return collectionsOf(manifest).find(one => one.name === collection) ?? null;
}
