import { isScriptPath } from './bundle.ts';
import {
  APP_NAME_FORMAT,
  COLLECTION_NAME_FORMAT,
  FIELD_NAME_FORMAT,
  HOST_GRANTS,
  MANIFEST_LIMITS,
  PLACEMENT_KINDS,
  RESERVED_FIELD_NAMES,
  SCREEN_NAME_FORMAT,
  SEMVER_FORMAT,
  problem,
  type Problem,
} from './codes.ts';
import { parseFieldType, type ParsedFieldType } from './field-types.ts';
import { manifestSchema, type AppManifest } from './schema.ts';
import { generatedTools } from './tools.ts';

/**
 * Reading a manifest and saying exactly what is wrong with it.
 *
 * Every check produces a code, and the checks Brydio's own reader makes
 * (`manifest-validator.ts`) produce the codes it produces, so a mistake fixed
 * here is fixed at publish too. Checks that need the package's files (the
 * icon) or Brydio's colour tokens (a brand colour's contrast) are left to
 * the host; see CONTRACT-NOTES.md. Checks that need the app's source (does a
 * screen's entry exist, what does it draw) are the CLI's.
 *
 * Hand-written rather than delegated to zod's error list, for the same reason
 * as the host's: "this placement names a screen you did not declare" is a
 * claim about two fields at once, and has to name both.
 */

export interface ManifestValidation {
  ok: boolean;
  /** Present only when `ok`. */
  manifest?: AppManifest;
  errors: Problem[];
  warnings: Problem[];
}

type Raw = Record<string, unknown>;

export function validateManifest(source: unknown): ManifestValidation {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];

  if (!isObject(source)) {
    return { ok: false, errors: [problem('plugin_manifest_not_object')], warnings };
  }

  identity(source, errors);
  prose(source, errors);
  attribution(source, errors);
  prompts(source, errors);

  const screens = screensOf(source, errors);

  placements(source, screens, errors);

  const collections = dataOf(source, errors);

  tools(source, errors);
  grants(source, collections, errors);

  if (errors.length) return { ok: false, errors, warnings };

  const parsed = manifestSchema.safeParse(source);

  if (!parsed.success) {
    // Everything above has passed, so this is a field the schema knows and
    // the checks do not. Reported against the field, so it is still actionable.
    return {
      ok: false,
      errors: parsed.error.issues.map(issue =>
        problem('plugin_manifest_malformed', { path: issue.path.join('.'), detail: issue.message }),
      ),
      warnings,
    };
  }

  return { ok: true, manifest: parsed.data, errors, warnings };
}

/** Parses the text of `.brydio/app.json` and validates it. */
export function validateManifestText(text: string): ManifestValidation {
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [problem('plugin_manifest_malformed', { detail: error instanceof Error ? error.message : undefined })],
      warnings: [],
    };
  }

  return validateManifest(json);
}

function identity(raw: Raw, errors: Problem[]): void {
  const name = raw.name;

  if (name === undefined || name === null) errors.push(problem('plugin_name_missing', { path: 'name' }));
  else if (typeof name !== 'string') errors.push(problem('plugin_name_wrong_type', { path: 'name' }));
  else if (!name.length) errors.push(problem('plugin_name_empty', { path: 'name' }));
  else if (name.length > MANIFEST_LIMITS.nameChars) errors.push(problem('plugin_name_too_long', { path: 'name' }));
  else if (!APP_NAME_FORMAT.test(name)) errors.push(problem('plugin_name_format', { path: 'name' }));

  const version = raw.version;

  if (version === undefined || version === null) errors.push(problem('plugin_version_missing', { path: 'version' }));
  else if (typeof version !== 'string') errors.push(problem('plugin_version_wrong_type', { path: 'version' }));
  else if (version.length > MANIFEST_LIMITS.versionChars) errors.push(problem('plugin_version_too_long', { path: 'version' }));
  else if (!SEMVER_FORMAT.test(version)) errors.push(problem('plugin_version_format', { path: 'version' }));
}

function prose(raw: Raw, errors: Problem[]): void {
  const fields = [
    ['displayName', MANIFEST_LIMITS.displayNameChars, 'brydio_display_name_wrong_type', 'brydio_display_name_too_long'],
    ['summary', MANIFEST_LIMITS.summaryChars, 'brydio_summary_wrong_type', 'brydio_summary_too_long'],
    ['description', MANIFEST_LIMITS.descriptionChars, 'plugin_description_wrong_type', 'plugin_description_too_long'],
  ] as const;

  for (const [field, limit, wrongType, tooLong] of fields) {
    const value = raw[field];

    if (value === undefined || value === null) continue;

    if (typeof value !== 'string') errors.push(problem(wrongType, { path: field }));
    else if (value.length > limit) errors.push(problem(tooLong, { path: field }));
  }
}

function attribution(raw: Raw, errors: Problem[]): void {
  const author = raw.author;

  if (author !== undefined && author !== null) {
    if (!isObject(author)) errors.push(problem('plugin_author_wrong_type', { path: 'author' }));
    else if (typeof author.name !== 'string' || !author.name.trim()) {
      errors.push(problem('plugin_author_name_missing', { path: 'author.name' }));
    }
  }

  const keywords = raw.keywords;

  if (keywords !== undefined && keywords !== null) {
    if (!isStringList(keywords)) errors.push(problem('brydio_keywords_wrong_type', { path: 'keywords' }));
    else if (keywords.length > MANIFEST_LIMITS.keywords) errors.push(problem('brydio_keywords_too_many', { path: 'keywords' }));
  }

  // The format only. Contrast is judged against Brydio's grounds, which live
  // in Brydio's kit; the host checks it at publish.
  const hex = /^#[0-9a-fA-F]{6}$/;

  if (raw.brandColor !== undefined && !(typeof raw.brandColor === 'string' && hex.test(raw.brandColor))) {
    errors.push(problem('plugin_brand_color_format', { path: 'brandColor' }));
  }

  if (raw.brandColorDark !== undefined && !(typeof raw.brandColorDark === 'string' && hex.test(raw.brandColorDark))) {
    errors.push(problem('plugin_brand_color_dark_format', { path: 'brandColorDark' }));
  }
}

function prompts(raw: Raw, errors: Problem[]): void {
  const value = raw.defaultPrompts;

  if (value === undefined || value === null) return;

  if (!isStringList(value)) {
    errors.push(problem('plugin_default_prompt_wrong_type', { path: 'defaultPrompts' }));

    return;
  }

  if (value.length > MANIFEST_LIMITS.defaultPrompts) {
    errors.push(problem('plugin_default_prompt_too_many', { path: 'defaultPrompts' }));
  }

  value.forEach((one, at) => {
    const path = `defaultPrompts[${at}]`;

    if (!one.trim()) errors.push(problem('plugin_default_prompt_empty', { path }));
    else if (one.length > MANIFEST_LIMITS.defaultPromptChars) errors.push(problem('plugin_default_prompt_too_long', { path }));
  });
}

/** The declared screens' names, for the placements to be checked against. */
function screensOf(raw: Raw, errors: Problem[]): Set<string> {
  const names = new Set<string>();
  const value = raw.screens;

  if (value === undefined) return names;

  if (!isObject(value)) {
    errors.push(problem('brydio_screens_wrong_type', { path: 'screens' }));

    return names;
  }

  const entries = new Map<string, string>();

  for (const [name, screen] of Object.entries(value)) {
    const path = `screens.${name}`;

    // A badly named screen still counts as declared, so a placement pointing
    // at it is not reported twice for one mistake.
    names.add(name);

    if (!SCREEN_NAME_FORMAT.test(name) || name.length > MANIFEST_LIMITS.identifierChars) {
      errors.push(problem('brydio_screen_name_format', { path, detail: name }));
    }

    if (!isObject(screen)) {
      errors.push(problem('brydio_screen_wrong_type', { path }));
      continue;
    }

    if (screen.entry === undefined || screen.entry === null || screen.entry === '') {
      errors.push(problem('brydio_screen_entry_missing', { path: `${path}.entry` }));
      continue;
    }

    if (typeof screen.entry !== 'string' || !isScriptPath(screen.entry)) {
      errors.push(problem('brydio_screen_entry_invalid', { path: `${path}.entry`, detail: String(screen.entry) }));
      continue;
    }

    const other = entries.get(screen.entry);

    if (other !== undefined) {
      errors.push(problem('brydio_screen_entry_duplicate', { path: `${path}.entry`, detail: `"${name}" and "${other}" both use ${screen.entry}.` }));
    }

    entries.set(screen.entry, name);
  }

  return names;
}

function placements(raw: Raw, screens: Set<string>, errors: Problem[]): void {
  const value = raw.placements;

  if (value === undefined) return;

  if (!Array.isArray(value)) {
    errors.push(problem('brydio_placements_wrong_type', { path: 'placements' }));

    return;
  }

  const kinds = new Set<string>();

  value.forEach((placement: unknown, at) => {
    const path = `placements[${at}]`;

    if (!isObject(placement)) {
      errors.push(problem('brydio_placement_wrong_type', { path }));

      return;
    }

    const { kind, screen, label, icon } = placement;

    if (typeof kind !== 'string' || !(PLACEMENT_KINDS as readonly string[]).includes(kind)) {
      errors.push(problem('brydio_placement_kind_invalid', { path: `${path}.kind`, detail: String(kind) }));
    } else if (kinds.has(kind)) {
      errors.push(problem('brydio_placement_kind_duplicate', { path: `${path}.kind`, detail: kind }));
    } else {
      kinds.add(kind);
    }

    if (typeof screen !== 'string' || !screen) {
      errors.push(problem('brydio_placement_screen_missing', { path: `${path}.screen` }));
    } else if (!screens.has(screen)) {
      const declared = [...screens];

      errors.push(
        problem('brydio_placement_screen_undeclared', {
          path: `${path}.screen`,
          detail: `The ${String(kind)} placement names "${screen}"; ${
            declared.length ? `the screens are ${declared.map(one => `"${one}"`).join(', ')}` : 'no screens are declared'
          }.`,
        }),
      );
    }

    if (label !== undefined && typeof label !== 'string') {
      errors.push(problem('brydio_placement_label_wrong_type', { path: `${path}.label` }));
    }

    if (icon !== undefined && typeof icon !== 'string') {
      errors.push(problem('brydio_placement_icon_wrong_type', { path: `${path}.icon` }));
    }
  });
}

/** The declared collections' names and generated tool names, for the grants. */
interface Declared {
  collections: Set<string>;
  tools: Set<string>;
}

function dataOf(raw: Raw, errors: Problem[]): Declared {
  const declared: Declared = { collections: new Set(), tools: new Set() };
  const value = raw.data;

  if (value === undefined) return declared;

  if (!isObject(value)) {
    errors.push(problem('brydio_schema_data_wrong_type', { path: 'data' }));

    return declared;
  }

  const generated = !(isObject(raw.tools) && raw.tools.generated === false);
  const toolOwners = new Map<string, string>();

  for (const [name, collection] of Object.entries(value)) {
    const path = `data.${name}`;

    declared.collections.add(name);

    if (!COLLECTION_NAME_FORMAT.test(name) || name.length > MANIFEST_LIMITS.identifierChars) {
      errors.push(problem('brydio_schema_collection_name_format', { path, detail: name }));
    }

    if (!isObject(collection)) {
      errors.push(problem('brydio_schema_collection_wrong_type', { path }));
      continue;
    }

    const fields = schemaOf(collection.schema, `${path}.schema`, errors);

    const label = collection.label;

    if (label !== undefined && (typeof label !== 'string' || !COLLECTION_NAME_FORMAT.test(label) || label.length > MANIFEST_LIMITS.identifierChars)) {
      errors.push(problem('brydio_schema_label_format', { path: `${path}.label`, detail: String(label) }));
    }

    fieldList(collection.search, `${path}.search`, fields, errors, {
      wrongType: 'brydio_schema_search_wrong_type',
      unknown: 'brydio_schema_search_field_unknown',
      wrongKind: 'brydio_schema_search_field_not_text',
      allowed: kind => kind === 'string' || kind === 'text',
    });

    fieldList(collection.index, `${path}.index`, fields, errors, {
      wrongType: 'brydio_schema_index_wrong_type',
      unknown: 'brydio_schema_index_field_unknown',
      wrongKind: 'brydio_schema_index_field_not_string',
      allowed: kind => kind === 'string',
    });

    if (!generated) continue;

    for (const tool of generatedTools(name, typeof label === 'string' ? label : undefined)) {
      declared.tools.add(tool.name);

      if (tool.name.length > MANIFEST_LIMITS.toolNameChars) {
        errors.push(problem('brydio_schema_tool_name_too_long', { path, detail: tool.name }));
      }

      const owner = toolOwners.get(tool.name);

      if (owner !== undefined && owner !== name) {
        errors.push(problem('brydio_schema_tool_name_clash', { path, detail: `"${owner}" and "${name}" both make ${tool.name}.` }));
      }

      toolOwners.set(tool.name, name);
    }
  }

  return declared;
}

function schemaOf(value: unknown, path: string, errors: Problem[]): Map<string, ParsedFieldType> {
  const fields = new Map<string, ParsedFieldType>();

  if (!isObject(value) || Object.keys(value).length === 0) {
    errors.push(problem('brydio_schema_missing', { path }));

    return fields;
  }

  for (const [field, type] of Object.entries(value)) {
    const at = `${path}.${field}`;

    if ((RESERVED_FIELD_NAMES as readonly string[]).includes(field)) {
      errors.push(problem('brydio_schema_field_reserved', { path: at }));
    } else if (!FIELD_NAME_FORMAT.test(field) || field.length > MANIFEST_LIMITS.fieldNameChars) {
      errors.push(problem('brydio_schema_field_name_format', { path: at, detail: field }));
    }

    const parsed = parseFieldType(type);

    if (!parsed) {
      errors.push(problem('brydio_schema_field_type_invalid', { path: at, detail: JSON.stringify(type) }));
      continue;
    }

    fields.set(field, parsed);
  }

  return fields;
}

function fieldList(
  value: unknown,
  path: string,
  fields: Map<string, ParsedFieldType>,
  errors: Problem[],
  codes: {
    wrongType: 'brydio_schema_search_wrong_type' | 'brydio_schema_index_wrong_type';
    unknown: 'brydio_schema_search_field_unknown' | 'brydio_schema_index_field_unknown';
    wrongKind: 'brydio_schema_search_field_not_text' | 'brydio_schema_index_field_not_string';
    allowed: (kind: ParsedFieldType['kind']) => boolean;
  },
): void {
  if (value === undefined) return;

  if (!isStringList(value)) {
    errors.push(problem(codes.wrongType, { path }));

    return;
  }

  value.forEach((field, at) => {
    const type = fields.get(field);

    // An unreadable schema has been reported already; naming its fields as
    // unknown here would be the same mistake reported twice.
    if (fields.size === 0) return;

    if (!type) errors.push(problem(codes.unknown, { path: `${path}[${at}]`, detail: field }));
    else if (!codes.allowed(type.kind)) errors.push(problem(codes.wrongKind, { path: `${path}[${at}]`, detail: field }));
  });
}

function tools(raw: Raw, errors: Problem[]): void {
  const value = raw.tools;

  if (value === undefined) return;

  if (!isObject(value)) {
    errors.push(problem('brydio_tools_wrong_type', { path: 'tools' }));

    return;
  }

  if (value.generated !== undefined && typeof value.generated !== 'boolean') {
    errors.push(problem('brydio_tools_generated_wrong_type', { path: 'tools.generated' }));
  }

  // An error, not a warning: an app that declares a custom tool and silently
  // does not get it would find out from a person, which is the one way this
  // exists to prevent.
  if (value.custom !== undefined && !(Array.isArray(value.custom) && value.custom.length === 0)) {
    errors.push(problem('brydio_tools_custom_unsupported', { path: 'tools.custom' }));
  }
}

function grants(raw: Raw, declared: Declared, errors: Problem[]): void {
  const value = raw.grants;

  if (value === undefined) return;

  if (!isObject(value)) {
    errors.push(problem('brydio_grants_wrong_type', { path: 'grants' }));

    return;
  }

  const lists = [
    ['tools', declared.tools, 'brydio_grant_tool_undeclared'],
    ['collections', declared.collections, 'brydio_grant_collection_undeclared'],
    ['host', new Set<string>(HOST_GRANTS), 'brydio_grant_host_unknown'],
  ] as const;

  for (const [key, known, code] of lists) {
    const list = value[key];

    if (list === undefined) continue;

    if (!isStringList(list)) {
      errors.push(problem('brydio_grant_list_wrong_type', { path: `grants.${key}` }));
      continue;
    }

    list.forEach((name, at) => {
      if (name === '*' && key !== 'host') return;

      if (!known.has(name)) errors.push(problem(code, { path: `grants.${key}[${at}]`, detail: name }));
    });
  }
}

function isObject(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(one => typeof one === 'string');
}
