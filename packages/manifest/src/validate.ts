import { appManifestSchema, type AppManifestWithData, type DataProblemCode } from './schema.ts';

/**
 * Reading a manifest and saying what is wrong with it, the way Brydio would.
 *
 * The answer is the schema's: a manifest is valid here exactly when
 * `appManifestSchema` accepts it, which is the server's schema, copied. Each
 * problem keeps the server's code where it has one (`data_label_taken`,
 * `placement_screen_unknown`), and a field that is simply the wrong shape is
 * `manifest_invalid` with the path to it, so an app's builder can find the
 * line.
 */

export type ManifestProblemCode = DataProblemCode | 'manifest_not_json' | 'manifest_invalid';

export interface ManifestProblem {
  code: ManifestProblemCode;
  message: string;
  /** Where in the manifest, like `placements.0.screen`. */
  path?: string;
}

export interface ManifestValidation {
  ok: boolean;
  /** Present only when `ok`: the manifest as Brydio parses it. */
  manifest?: AppManifestWithData;
  problems: ManifestProblem[];
}

export function validateManifest(source: unknown): ManifestValidation {
  const parsed = appManifestSchema.safeParse(source);

  if (parsed.success) return { ok: true, manifest: parsed.data, problems: [] };

  return {
    ok: false,
    problems: parsed.error.issues.map(issue => {
      const params = (issue as { params?: { code?: unknown } }).params;
      const code = typeof params?.code === 'string' ? (params.code as DataProblemCode) : 'manifest_invalid';
      const path = issue.path.map(String).join('.');

      return { code, message: issue.message, ...(path ? { path } : {}) };
    }),
  };
}

/** Parses the text of `.brydio/app.json` and validates it. */
export function validateManifestText(text: string): ManifestValidation {
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      problems: [{ code: 'manifest_not_json', message: `The manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }],
    };
  }

  return validateManifest(json);
}
