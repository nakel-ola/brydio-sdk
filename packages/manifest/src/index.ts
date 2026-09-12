/**
 * `@brydio/manifest`: the shape of `.brydio/app.json` and what can be wrong
 * with one. Written from contracts §4 and §5, checked by the same codes as
 * Brydio's own reader.
 */

export {
  BUNDLE_MANIFEST,
  BUNDLE_MAX_BYTES,
  BUNDLE_PATH_MAX_CHARS,
  contentTypeOf,
  isBundlePath,
  isScriptPath,
} from './bundle.ts';

export {
  APP_NAME_FORMAT,
  COLLECTION_NAME_FORMAT,
  FIELD_NAME_FORMAT,
  HOST_GRANTS,
  MANIFEST_LIMITS,
  PLACEMENT_KINDS,
  PROBLEM_CODES,
  RESERVED_FIELD_NAMES,
  SCREEN_NAME_FORMAT,
  SEMVER_FORMAT,
  explain,
  problem,
  type Problem,
  type ProblemCode,
} from './codes.ts';

export { checkDocument } from './documents.ts';

export {
  FIELD_TYPE_STRINGS,
  STRING_MAX_CHARS,
  parseFieldType,
  type DocumentOf,
  type FieldKind,
  type FieldType,
  type FieldTypeString,
  type FieldValue,
  type FieldsOf,
  type ParsedFieldType,
} from './field-types.ts';

export {
  collectionSchema,
  fieldTypeSchema,
  grantsSchema,
  manifestExtensionSchema,
  manifestSchema,
  placementKindSchema,
  placementSchema,
  screenSchema,
  toolsSchema,
  type AppManifest,
  type Collection,
  type Grants,
  type HostGrant,
  type ManifestExtension,
  type Placement,
  type PlacementKind,
  type Screen,
} from './schema.ts';

export { generatedTools, generatedToolsOf, type GeneratedTool, type ToolVerb } from './tools.ts';

export { validateManifest, validateManifestText, type ManifestValidation } from './validate.ts';
