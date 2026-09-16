/**
 * `@brydio/manifest`: the shape of `.brydio/app.json`, its collections' field
 * types, the tools Brydio generates from them, and the bundle rules. Each is
 * a copy of the server's own, so an app that passes here passes there.
 */

export { APP_NAME_FORMAT, MANIFEST_LIMITS, SEMVER_FORMAT, baseManifestSchema } from './base.ts';

export {
  BUNDLE_MANIFEST,
  BUNDLE_MAX_BYTES,
  BUNDLE_PATH_MAX_CHARS,
  bundleBytes,
  bundleHash,
  bundleProblem,
  codeOf,
  isBundlePath,
  isScriptPath,
  sizeOf,
  type BundleFiles,
  type BundleProblem,
  type BundleProblemCode,
} from './bundle.ts';

export {
  COLOUR_TOKENS,
  FIELD_LIMITS,
  RESERVED_FIELDS,
  describeType,
  isSearchable,
  isSortable,
  isStructured,
  parseFieldType,
  structuredFields,
  valueProblem,
  valueSchema,
  FieldTypeInvalid,
  type DocumentOf,
  type FieldKind,
  type FieldType,
  type FieldValue,
  type FieldsOf,
} from './field-types.ts';

export {
  appManifestSchema,
  collectionOf,
  collectionsOf,
  dataProblems,
  labelOf,
  manifestExtensionsSchema,
  storedExtensionsSchema,
  type AppManifestWithData,
  type CollectionSpec,
  type DataProblem,
  type DataProblemCode,
  type ManifestExtensions,
} from './schema.ts';

export { DOCUMENT_LIMITS } from './document-limits.ts';

export { HOST_CAPABILITIES, KNOWN_HOST_GRANTS, isHostCapability, unknownHostGrant } from './grants.ts';

export {
  diffSchemas,
  migrationProblems,
  migrationSchema,
  migrationStepSchema,
  migrationsSchema,
  publishedMigrationProblems,
  schemaOf,
  type Migration,
  type MigrationCode,
  type MigrationProblem,
  type MigrationStep,
  type SchemaChange,
} from './migrations.ts';

export { SECRET_MESSAGE, findSecrets, secretsInJson, type SecretFound } from './secrets.ts';

export { compareVersions, sdkRefusal, type SdkSupport } from './sdk.ts';

export { TOOL_WRITES, generatedToolsOf, toolNames, type GeneratedTool, type ToolVerb } from './tools.ts';

export {
  validateManifest,
  validateManifestText,
  type ManifestProblem,
  type ManifestProblemCode,
  type ManifestValidation,
} from './validate.ts';
export { defineManifest, type ManifestShape, type ScreenNameOf, type WithDeclaredScreens } from './define.ts';
