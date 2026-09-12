import { z } from 'zod';

import {
  APP_NAME_FORMAT,
  HOST_GRANTS,
  MANIFEST_LIMITS,
  PLACEMENT_KINDS,
  SEMVER_FORMAT,
} from './codes.ts';
import { parseFieldType, type FieldType } from './field-types.ts';

/**
 * The manifest as a shape: Brydio's `.brydio/app.json` with the four
 * additions from contracts §4.
 *
 * As in Brydio's own reader, the schema and the validator do different jobs.
 * This says what a manifest *is* and gives every consumer a type; the
 * validator (`validate.ts`) says what is *wrong* with one, in codes. Every
 * addition is optional, so a manifest written before apps had screens still
 * parses (§4: "Everything optional so today's bundle apps still parse").
 */

export const placementKindSchema = z.enum(PLACEMENT_KINDS);

export const placementSchema = z.object({
  kind: placementKindSchema,
  /** A key of `screens`. */
  screen: z.string(),
  label: z.string().optional(),
  /** A Brydio icon's name, like `kanban`. */
  icon: z.string().optional(),
});

export const fieldTypeSchema = z.custom<FieldType>(value => parseFieldType(value) !== null, {
  message: 'not a field type',
});

export const collectionSchema = z.object({
  schema: z.record(z.string(), fieldTypeSchema),
  /** Fields the collection's `search_*` tool looks in. Text search is Phase 2. */
  search: z.array(z.string()).optional(),
  /** The singular noun tool names are made from: `issue` → `create_issue`. */
  label: z.string().optional(),
  /** `string` fields to also keep plainly in `fields`, per §5's "unless listed in `index`". */
  index: z.array(z.string()).optional(),
});

export const toolsSchema = z.object({
  /** Whether Brydio generates create, update, get, list, search and delete. Defaults to true. */
  generated: z.boolean().optional(),
  /** Phase 3. Must be empty until then. */
  custom: z.array(z.unknown()).optional(),
});

export const screenSchema = z.object({
  /** The screen's script, as a path inside the bundle: `screens/board.js`. */
  entry: z.string(),
});

export const grantsSchema = z.object({
  tools: z.array(z.string()).optional(),
  collections: z.array(z.string()).optional(),
  host: z.array(z.enum(HOST_GRANTS)).optional(),
});

/** The fields every Brydio manifest has had since before apps drew screens. */
const baseShape = {
  name: z.string().min(1).max(MANIFEST_LIMITS.nameChars).regex(APP_NAME_FORMAT),
  version: z.string().max(MANIFEST_LIMITS.versionChars).regex(SEMVER_FORMAT),
  displayName: z.string().max(MANIFEST_LIMITS.displayNameChars).optional(),
  summary: z.string().max(MANIFEST_LIMITS.summaryChars).optional(),
  description: z.string().max(MANIFEST_LIMITS.descriptionChars).optional(),
  author: z.object({ name: z.string().min(1), email: z.string().optional(), url: z.string().optional() }).optional(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
  license: z.string().max(MANIFEST_LIMITS.licenseChars).optional(),
  keywords: z.array(z.string()).max(MANIFEST_LIMITS.keywords).optional(),
  icon: z.string().optional(),
  brandColor: z.string().optional(),
  brandColorDark: z.string().optional(),
  defaultPrompts: z.array(z.string()).max(MANIFEST_LIMITS.defaultPrompts).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
};

/** The additions of contracts §4, on their own. */
export const manifestExtensionSchema = z.object({
  placements: z.array(placementSchema).optional(),
  data: z.record(z.string(), collectionSchema).optional(),
  tools: toolsSchema.optional(),
  screens: z.record(z.string(), screenSchema).optional(),
  grants: grantsSchema.optional(),
});

export const manifestSchema = z.object({ ...baseShape, ...manifestExtensionSchema.shape });

export type AppManifest = z.infer<typeof manifestSchema>;
export type ManifestExtension = z.infer<typeof manifestExtensionSchema>;
export type Placement = z.infer<typeof placementSchema>;
export type PlacementKind = z.infer<typeof placementKindSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type Screen = z.infer<typeof screenSchema>;
export type Grants = z.infer<typeof grantsSchema>;
export type HostGrant = (typeof HOST_GRANTS)[number];
