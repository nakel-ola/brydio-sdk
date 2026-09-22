import { z } from 'zod';

/**
 * The manifest every Brydio app has had since before apps drew screens.
 *
 * A copy of Brydio's `apps/api/src/extensions/apps/manifest.schema.ts` (E5's
 * canonical `.brydio/app.json`) and the three numbers and formats it takes
 * from `manifest-codes.ts`. Copied rather than imported because the SDK
 * imports nothing from Brydio's tree (A5-F01-S01); `test/manifest.test.ts`
 * holds the two side by side whenever a Brydio checkout is beside this one.
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
} as const;

/** Kebab-case: "acme-projects", not "Acme Projects". */
export const APP_NAME_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Semver, the permissive reading: `1.0.0-beta.2` is a version. */
export const SEMVER_FORMAT =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const authorSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  url: z.string().optional(),
});

export const linksSchema = z.object({
  privacy: z.string().optional(),
  terms: z.string().optional(),
  support: z.string().optional(),
});

/**
 * One of an app's two images, in its two variants (ADR-A20): `color` for a
 * tile and the app's own page, `mono` for the sidebar, where the theme tints
 * it. Both are `./`-prefixed paths inside the app.
 */
export const brandImagesSchema = z.object({
  color: z.string(),
  mono: z.string(),
});

export const requiresSchema = z.object({
  servers: z.array(z.string()).default([]),
  integrations: z.array(z.string()).default([]),
  builtin: z.array(z.string()).default([]),
});

export const baseManifestSchema = z.object({
  name: z.string().min(1).max(MANIFEST_LIMITS.nameChars).regex(APP_NAME_FORMAT),
  version: z.string().max(MANIFEST_LIMITS.versionChars).regex(SEMVER_FORMAT),
  displayName: z.string().max(MANIFEST_LIMITS.displayNameChars).optional(),
  summary: z.string().max(MANIFEST_LIMITS.summaryChars).optional(),
  description: z.string().max(MANIFEST_LIMITS.descriptionChars).optional(),
  author: authorSchema.optional(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
  license: z.string().max(MANIFEST_LIMITS.licenseChars).optional(),
  keywords: z.array(z.string()).max(MANIFEST_LIMITS.keywords).optional(),
  links: linksSchema.optional(),
  /** Required to publish (ADR-A20); optional here so every stored manifest still reads. */
  logo: brandImagesSchema.optional(),
  /** The two-variant icon (ADR-A20), or the one path every app had before it, still read. */
  icon: z.union([z.string(), brandImagesSchema]).optional(),
  brandColor: z.string().optional(),
  brandColorDark: z.string().optional(),
  defaultPrompts: z.array(z.string()).max(MANIFEST_LIMITS.defaultPrompts).optional(),
  skills: z.string().optional(),
  servers: z.string().optional(),
  integrations: z.string().optional(),
  requires: requiresSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
