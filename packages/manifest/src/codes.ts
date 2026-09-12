/**
 * Every way a manifest can be wrong, as a stable code and a sentence.
 *
 * Mirrors Brydio's `apps/api/src/extensions/apps/manifest-codes.ts` for the
 * fields both sides check (`plugin_*` where OpenAI's validator has the same
 * rule, `brydio_*` for Brydio's own), and adds the families A5-F03 asks for:
 * `brydio_placement_*`, `brydio_screen_*`, `brydio_schema_*` and
 * `brydio_bundle_*`, plus `brydio_tools_*` and `brydio_grant_*` for the other
 * two additions in contracts §4. The same code means the same complaint
 * whether it came from `brydio validate` on a laptop or from a refused
 * publish, so a message can be searched for.
 *
 * The limits are Brydio's numbers, copied rather than imported because the
 * SDK imports nothing from Brydio's tree (A5-F01-S01).
 */

export const MANIFEST_LIMITS = {
  nameChars: 64,
  versionChars: 64,
  displayNameChars: 80,
  summaryChars: 240,
  descriptionChars: 4_000,
  licenseChars: 64,
  keywords: 20,
  defaultPrompts: 3,
  defaultPromptChars: 512,
  /** Collection, label and screen names; they end up inside tool names. */
  identifierChars: 40,
  fieldNameChars: 64,
  /** MCP's limit on a tool name, which a generated tool name has to fit. */
  toolNameChars: 64,
} as const;

/** Kebab-case, as Brydio's reader requires. */
export const APP_NAME_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Semver, the permissive reading Brydio's reader uses. */
export const SEMVER_FORMAT =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** A collection's name or label: it becomes part of a tool's name (`create_issue`). */
export const COLLECTION_NAME_FORMAT = /^[a-z][a-z0-9_]*$/;

/** A field's name: it becomes a key in a tool's input. */
export const FIELD_NAME_FORMAT = /^[a-z][A-Za-z0-9_]*$/;

/** A screen's name. */
export const SCREEN_NAME_FORMAT = /^[a-z][a-z0-9-]*$/;

/**
 * Field names Brydio uses itself. The generated tools take `{ instance?, id,
 * version, ...fields }` (contracts §6), so a field with one of these names
 * could never be written.
 */
export const RESERVED_FIELD_NAMES = ['id', 'version', 'instance'] as const;

/** The host capabilities a manifest may ask for (contracts §4). */
export const HOST_GRANTS = ['navigate', 'message'] as const;

/** The places an instance can be shown (contracts §3, §4). */
export const PLACEMENT_KINDS = ['project-tab', 'project-sidebar', 'workspace-sidebar'] as const;

const SENTENCES = {
  // The file itself.
  plugin_manifest_missing: 'There is no manifest. An app keeps it at `.brydio/app.json`.',
  plugin_manifest_malformed: 'The manifest is not valid JSON, or a field is not the shape Brydio expects.',
  plugin_manifest_not_object: 'The manifest must be a JSON object.',

  // Identity.
  plugin_name_missing: 'The manifest needs a `name`.',
  plugin_name_empty: 'The `name` is empty.',
  plugin_name_wrong_type: 'The `name` must be text.',
  plugin_name_format: 'A name is lowercase letters, numbers and hyphens — "acme-projects", not "Acme Projects".',
  plugin_name_too_long: `A name is at most ${MANIFEST_LIMITS.nameChars} characters.`,
  plugin_version_missing: 'The manifest needs a `version`.',
  plugin_version_wrong_type: 'The `version` must be text.',
  plugin_version_format: 'A version is three numbers, like `1.2.0`.',
  plugin_version_too_long: `A version is at most ${MANIFEST_LIMITS.versionChars} characters.`,

  // Prose.
  plugin_description_wrong_type: 'The `description` must be text.',
  plugin_description_too_long: `A description is at most ${MANIFEST_LIMITS.descriptionChars} characters.`,
  brydio_display_name_wrong_type: 'The `displayName` must be text.',
  brydio_display_name_too_long: `A display name is at most ${MANIFEST_LIMITS.displayNameChars} characters.`,
  brydio_summary_wrong_type: 'The `summary` must be text.',
  brydio_summary_too_long: `A summary is at most ${MANIFEST_LIMITS.summaryChars} characters — it sits on one line of a row.`,

  // Attribution.
  plugin_author_wrong_type: 'The `author` must be an object with a `name`.',
  plugin_author_name_missing: 'The `author` needs a `name`.',
  brydio_keywords_wrong_type: '`keywords` must be a list of text.',
  brydio_keywords_too_many: `A package carries at most ${MANIFEST_LIMITS.keywords} keywords.`,
  plugin_brand_color_format: 'A brand colour is a six-digit hex value, like `#1ABCFE`.',
  plugin_brand_color_dark_format: 'A dark brand colour is a six-digit hex value, like `#8FD9FF`.',

  // Openers.
  plugin_default_prompt_wrong_type: '`defaultPrompts` must be a list of text.',
  plugin_default_prompt_empty: 'A starter prompt is empty.',
  plugin_default_prompt_too_long: `A starter prompt is at most ${MANIFEST_LIMITS.defaultPromptChars} characters.`,
  plugin_default_prompt_too_many: `A package offers at most ${MANIFEST_LIMITS.defaultPrompts} starter prompts.`,

  // Placements (§4).
  brydio_placements_wrong_type: '`placements` must be a list.',
  brydio_placement_wrong_type: 'A placement must be an object with a `kind` and a `screen`.',
  brydio_placement_kind_invalid: `A placement's \`kind\` is one of ${PLACEMENT_KINDS.map(one => `\`${one}\``).join(', ')}.`,
  brydio_placement_kind_duplicate: 'Each kind of placement is offered once.',
  brydio_placement_screen_missing: 'A placement needs a `screen`: the name of one of the manifest’s screens.',
  brydio_placement_screen_undeclared: 'That placement names a screen the manifest does not declare under `screens`.',
  brydio_placement_label_wrong_type: 'A placement’s `label` must be text.',
  brydio_placement_icon_wrong_type: 'A placement’s `icon` must be the name of a Brydio icon.',

  // Screens (§4, §11).
  brydio_screens_wrong_type: '`screens` must be an object, from each screen’s name to its entry.',
  brydio_screen_name_format: 'A screen’s name is lowercase letters, numbers and hyphens, starting with a letter.',
  brydio_screen_wrong_type: 'A screen must be an object with an `entry`.',
  brydio_screen_entry_missing: 'A screen needs an `entry`, like `screens/board.js`.',
  brydio_screen_entry_invalid: 'A screen’s entry is a path inside the bundle ending in `.js`, like `screens/board.js`.',
  brydio_screen_entry_duplicate: 'Two screens share one entry; each screen is its own script.',
  brydio_screen_entry_not_found: 'There is no source file for that screen’s entry.',
  brydio_screen_element_unknown: 'That element is not in Brydio’s catalogue.',
  brydio_screen_prop_unknown: 'That element has no such setting.',
  brydio_screen_prop_value_invalid: 'That value is not one the setting allows.',
  brydio_screen_dom_access: 'A screen has no page to reach: it runs in a worker and draws only through the catalogue.',

  // Collections (§4, §5).
  brydio_schema_data_wrong_type: '`data` must be an object, from each collection’s name to its schema.',
  brydio_schema_collection_name_format: 'A collection’s name is lowercase letters, numbers and underscores, starting with a letter.',
  brydio_schema_collection_wrong_type: 'A collection must be an object with a `schema`.',
  brydio_schema_missing: 'A collection needs a `schema` with at least one field.',
  brydio_schema_field_name_format: 'A field’s name starts with a lowercase letter and holds only letters, numbers and underscores.',
  brydio_schema_field_reserved: '`id`, `version` and `instance` are Brydio’s own; a field cannot use them.',
  brydio_schema_field_type_invalid:
    'A field’s type is one of `string`, `text`, `member`, `project`, `date`, `number` (each with an optional `?`), `boolean`, `string[]`, `token`, or a list of choices.',
  brydio_schema_label_format: 'A collection’s `label` is a singular noun in lowercase letters, numbers and underscores, like `issue`.',
  brydio_schema_search_wrong_type: '`search` must be a list of field names.',
  brydio_schema_search_field_unknown: '`search` names a field the schema does not have.',
  brydio_schema_search_field_not_text: '`search` covers text fields only: `string` or `text`.',
  brydio_schema_index_wrong_type: '`index` must be a list of field names.',
  brydio_schema_index_field_unknown: '`index` names a field the schema does not have.',
  brydio_schema_index_field_not_string: '`index` is for `string` fields; every other kind is already indexed.',
  brydio_schema_tool_name_clash: 'Two collections would generate a tool with the same name; give one a different `label`.',
  brydio_schema_tool_name_too_long: `A generated tool's name is at most ${MANIFEST_LIMITS.toolNameChars} characters; shorten the collection's name or label.`,

  // Tools (§4, §6).
  brydio_tools_wrong_type: '`tools` must be an object.',
  brydio_tools_generated_wrong_type: '`tools.generated` is true or false.',
  brydio_tools_custom_unsupported: 'Custom tools arrive in a later version of Brydio; `tools.custom` must be empty for now.',

  // Grants (§4, ADR-A11).
  brydio_grants_wrong_type: '`grants` must be an object.',
  brydio_grant_list_wrong_type: 'Each grant is a list of names.',
  brydio_grant_host_unknown: `A host grant is one of ${HOST_GRANTS.map(one => `\`${one}\``).join(', ')}.`,
  brydio_grant_collection_undeclared: 'That grant names a collection the manifest does not declare.',
  brydio_grant_tool_undeclared: 'That grant names a tool the manifest does not generate.',

  // The built bundle (§11, A7-F02).
  brydio_bundle_too_large: 'The bundle is over the 1 MB cap.',
  brydio_bundle_file_not_code: 'A bundle holds only scripts and `app.json`; there is no HTML or CSS in a Brydio app.',
  brydio_bundle_build_failed: 'The screen could not be bundled.',
} as const;

export type ProblemCode = keyof typeof SENTENCES;

/** Every check reports one of these. Errors fail the build; warnings do not. */
export interface Problem {
  code: ProblemCode;
  severity: 'error' | 'warning';
  message: string;
  /** The manifest field it is about, like `placements[0].screen`. */
  path?: string;
  /** The file it is about, relative to the app. */
  file?: string;
  /** The line in that file, from 1. */
  line?: number;
  /** Extra words for when the code alone is not the whole story. */
  detail?: string;
}

export const explain = (code: ProblemCode): string => SENTENCES[code];

/** One error, with the sentence filled in from the code. */
export function problem(
  code: ProblemCode,
  where: { path?: string; file?: string; line?: number; detail?: string } = {},
  severity: Problem['severity'] = 'error',
): Problem {
  return {
    code,
    severity,
    message: explain(code),
    ...(where.path === undefined ? {} : { path: where.path }),
    ...(where.file === undefined ? {} : { file: where.file }),
    ...(where.line === undefined ? {} : { line: where.line }),
    ...(where.detail === undefined ? {} : { detail: where.detail }),
  };
}

/** Every code, for a help text or a test that no code went missing. */
export const PROBLEM_CODES = Object.keys(SENTENCES) as ProblemCode[];
