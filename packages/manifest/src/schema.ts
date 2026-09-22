import { z } from 'zod';

import { MANIFEST_LIMITS, SEMVER_FORMAT, baseManifestSchema as manifestSchema } from './base.ts';
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
import { migrationsSchema } from './migrations.ts';

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

const placementSettingSchema = z.object({
  type: z.enum(['string', 'url']),
  label: z.string().min(1).max(60),
  required: z.boolean().optional(),
  placeholder: z.string().max(200).optional(),
});

export type PlacementSettingSpec = z.infer<typeof placementSettingSchema>;

const placementSchema = z.object({
  kind: z.enum(['project-tab', 'project-sidebar', 'workspace-sidebar']),
  screen: z.string().min(1).max(FIELD_LIMITS.nameChars),
  label: z.string().min(1).max(60).optional(),
  icon: z.string().max(60).optional(),
  settings: z.record(z.string().regex(FIELD_NAME), placementSettingSchema).optional(),
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

/** Most custom tools one app may declare (A3-F08). */
export const MAX_CUSTOM_TOOLS = 20;

/** A tool name the model and a policy row can both use as it is. */
export const CUSTOM_TOOL_NAME = /^[a-z][a-z0-9_]{0,59}$/;

/**
 * A tool the app writes itself (A3-F08-S01): a handler file in its bundle,
 * run on Brydio's side in a box, taking `input` in the field-type grammar.
 */
const customToolSchema = z.object({
  name: z.string().regex(CUSTOM_TOOL_NAME, 'A tool name is lower case letters, digits and underscores, starting with a letter.'),
  description: z.string().min(1).max(1024),
  /** Relative to the bundle's root: `handlers/list_prs.js`. */
  handler: z
    .string()
    .min(1)
    .max(200)
    .regex(/^(?!\/)(?!.*\.\.)[A-Za-z0-9_\-./]+\.m?js$/, 'A handler is a .js or .mjs path inside the bundle.'),
  /** Field name to type, as a collection's schema writes it (`"string?"`). */
  input: z.record(z.string(), z.unknown()).optional(),
  /** True when running it changes something: it asks first, like a generated write. */
  write: z.boolean().optional(),
  /** The collection it works on, when it works on one: its grant then needs that collection too. */
  collection: z.string().optional(),
});

export type CustomToolSpec = z.infer<typeof customToolSchema>;

const toolsSchema = z.object({
  /** Off only when the app supplies every tool itself (A3-F08). */
  generated: z.boolean().optional(),
  custom: z.array(customToolSchema).max(MAX_CUSTOM_TOOLS).optional(),
});

/** Most secrets one app may declare (ADR-A24). */
export const MAX_APP_SECRETS = 20;

/** The longest value one secret may hold, in characters. */
export const MAX_SECRET_CHARS = 8 * 1024;

/** A secret's name, as a handler asks for it: `api_key`. */
export const SECRET_NAME = /^[a-z][a-z0-9_]{0,59}$/;

/**
 * A secret the app needs (ADR-A24): named here, never valued here. The value
 * is entered in the app's settings by an administrator, or stored by the
 * app's own handler with `secrets.set`, and only that app's handlers can read
 * it, with `secrets.get`. A screen never can.
 *
 * `install` (the default) is one value for the whole install; `instance` is
 * one per instance.
 */
const secretSchema = z.object({
  name: z.string().regex(SECRET_NAME, 'A secret name is lower case letters, digits and underscores, starting with a letter.'),
  label: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  required: z.boolean().optional(),
  scope: z.enum(['install', 'instance']).optional(),
});

export type SecretSpec = z.infer<typeof secretSchema>;

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
  /** The secrets its handlers read (ADR-A24): names only, never values. */
  secrets: z.array(secretSchema).max(MAX_APP_SECRETS).optional(),
  /**
   * How records move when the schema changes between versions (A3-F07).
   * Checked against the previous version when a version is published, and
   * again when a workspace's pin moves; here only its shape.
   */
  migrations: migrationsSchema.optional(),
  /**
   * The `@brydio/app` version the bundle was built against, written by
   * `brydio build` and never by hand. Optional, so a bundle from before it
   * still loads; `POST /apps/publish` requires it and checks it (A5-F04-S03).
   */
  sdk: z.string().max(MANIFEST_LIMITS.versionChars).regex(SEMVER_FORMAT).optional(),
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
  | 'grant_collection_missing'
  | 'grant_tool_missing'
  | 'custom_name_taken'
  | 'custom_collection_unknown'
  | 'custom_input_invalid'
  | 'placement_screen_unknown'
  | 'secret_name_taken'
  | 'grant_secrets_missing';

type Additions = z.infer<z.ZodObject<typeof extensionShape>>;

/**
 * Everything wrong with an app's additions that a type cannot say.
 *
 * Exported on its own so E5's validator can fold the codes into its import
 * report; the zod schemas below run it too, so a parse never accepts what
 * this refuses.
 */
export function dataProblems(additions: Additions, options: { grants?: boolean } = {}): DataProblem[] {
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
        message: `${collection} is not a collection name: lower-case letters, digits and _, starting with a letter, at most ${FIELD_LIMITS.nameChars} characters.`,
      });
    }

    const label = labelOf(collection, declared.label);

    if (!COLLECTION_NAME.test(label) || label.length > FIELD_LIMITS.nameChars) {
      problems.push({
        code: 'data_label_format',
        collection,
        message: `${collection}'s label must be one lower-case word the tools can be named with, at most ${FIELD_LIMITS.nameChars} characters.`,
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
          message: `${collection}.${field} is not a field name: letters, digits and _, starting with a lower-case letter, at most ${FIELD_LIMITS.nameChars} characters.`,
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

  // What the app keeps must be what it asks to keep (A3-F06-S01): a
  // collection the grants leave out would be data a workspace never agreed to
  // hold, found only when the first write is refused.
  const granted = additions.grants?.collections ?? [];

  if (options.grants !== false && !granted.includes('*')) {
    for (const [collection] of collections) {
      if (!granted.includes(collection)) {
        problems.push({
          code: 'grant_collection_missing',
          collection,
          message: `${collection} is kept but not asked for: add it to grants.collections.`,
        });
      }
    }
  }

  problems.push(...customToolProblems(additions, options));
  problems.push(...secretProblems(additions, options));

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

/**
 * A custom tool must be granted by name (or `*`), take a name no generated
 * tool has, name a collection the app keeps, and take input in the field-type
 * grammar (A3-F08-S01). That its handler file is in the bundle is checked
 * where the files are: `POST /apps/publish`.
 */
function customToolProblems(additions: Additions, options: { grants?: boolean }): DataProblem[] {
  const problems: DataProblem[] = [];
  const custom = additions.tools?.custom ?? [];
  // Named from the manifest directly: `collectionsOf` validates through this
  // very check, and would come back here.
  const generated =
    additions.tools?.generated === false
      ? new Set<string>()
      : new Set(
          Object.entries(additions.data ?? {}).flatMap(([name, declared]) => {
            const label = labelOf(name, declared.label);
            const plural = `${label}s`;

            return [
              `create_${label}`,
              `update_${label}`,
              `get_${label}`,
              `delete_${label}`,
              `list_${plural}`,
              `search_${plural}`,
              `batch_${plural}`,
            ];
          })
        );
  const seen = new Set<string>();
  const granted = additions.grants?.tools ?? [];

  for (const tool of custom) {
    if (generated.has(tool.name) || seen.has(tool.name)) {
      problems.push({
        code: 'custom_name_taken',
        message: `${tool.name} is already a tool this app has: give the custom tool another name, or switch generated tools off.`,
      });
    }

    seen.add(tool.name);

    if (tool.collection !== undefined && !additions.data?.[tool.collection]) {
      problems.push({
        code: 'custom_collection_unknown',
        collection: tool.collection,
        message: `${tool.name} works on ${tool.collection}, which the app does not keep.`,
      });
    }

    for (const [field, raw] of Object.entries(tool.input ?? {})) {
      try {
        parseFieldType(raw);
      } catch (error: unknown) {
        problems.push({
          code: 'custom_input_invalid',
          field,
          message: `${tool.name}'s input ${field}: ${error instanceof Error ? error.message : 'not a field type'}`,
        });
      }
    }

    if (options.grants !== false && !granted.includes('*') && !granted.includes(tool.name)) {
      problems.push({
        code: 'grant_tool_missing',
        message: `${tool.name} is a custom tool but not asked for: add it to grants.tools.`,
      });
    }
  }

  return problems;
}

/**
 * Each secret declared once, and asked for (ADR-A24): an app that declares
 * secrets without the `secrets` host grant could never read one.
 */
function secretProblems(additions: Additions, options: { grants?: boolean }): DataProblem[] {
  const problems: DataProblem[] = [];
  const secrets = additions.secrets ?? [];
  const seen = new Set<string>();

  for (const secret of secrets) {
    if (seen.has(secret.name)) {
      problems.push({
        code: 'secret_name_taken',
        field: secret.name,
        message: `The secret ${secret.name} is declared twice; keep one.`,
      });
    }

    seen.add(secret.name);
  }

  const host = additions.grants?.host ?? [];

  if (options.grants !== false && secrets.length && !host.includes('secrets') && !host.includes('*')) {
    problems.push({
      code: 'grant_secrets_missing',
      message: 'The app declares secrets but does not ask to read them: add "secrets" to grants.host.',
    });
  }

  return problems;
}

const refuse = (additions: Additions, ctx: z.RefinementCtx, options: { grants?: boolean } = {}) => {
  for (const problem of dataProblems(additions, options)) {
    ctx.addIssue({
      code: 'custom',
      message: problem.message,
      path: problem.code === 'grant_tool_missing'
        ? ['grants', 'tools']
        : problem.code === 'grant_secrets_missing'
        ? ['grants', 'host']
        : problem.code === 'secret_name_taken'
        ? ['secrets']
        : problem.code.startsWith('grant_')
        ? ['grants', 'collections']
        : problem.code.startsWith('custom_')
        ? ['tools', 'custom']
        : problem.collection
          ? ['data', problem.collection, ...(problem.field ? ['schema', problem.field] : [])]
          : [],
      params: { code: problem.code },
    });
  }
};

/** The additions alone, for code that has the rest of the manifest already. */
export const manifestExtensionsSchema = z.object(extensionShape).superRefine((additions, ctx) => refuse(additions, ctx));

/**
 * The additions as code reads a manifest that was checked whole when it was
 * published. Everything but the grants cross-check: what is granted is the
 * install's record to answer (A3-F06), not the stored manifest's.
 */
export const storedExtensionsSchema = z.object(extensionShape).superRefine((additions, ctx) => refuse(additions, ctx, { grants: false }));

/** E5's manifest with the additions: the whole `.brydio/app.json` of an app. */
export const appManifestSchema = manifestSchema.extend(extensionShape).superRefine((additions, ctx) => refuse(additions, ctx));

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
  const parsed = storedExtensionsSchema.parse({ data: manifest.data ?? {} });

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
