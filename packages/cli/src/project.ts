import { validateManifest, type AppManifestWithData, type ManifestProblem } from '@brydio/manifest';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Where an app's parts are, by convention (A5-F02).
 *
 * The manifest is `.brydio/app.json`, as every Brydio package keeps it, or
 * `app.json` at the root for an app that has nothing else. A screen whose
 * entry is `screens/board.js` is written in `src/screens/board.tsx` (or
 * `.ts`, `.jsx`, `.js`), so the built bundle and the source have the same
 * shape and nobody has to write the mapping down.
 */

export const MANIFEST_PATHS = ['.brydio/app.json', 'app.json'] as const;
export const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const;
export const DIST = 'dist';

/** One thing wrong, named down to the file and line where there is one. */
export interface Problem {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  file?: string;
  line?: number;
  /** Where in the manifest, like `placements.0.screen`. */
  path?: string;
}

export interface Project {
  root: string;
  manifestFile: string;
  /** The manifest as written, whole, which is what goes into the bundle. */
  raw: Record<string, unknown>;
  /** The manifest as Brydio parses it, when it parses. */
  manifest: AppManifestWithData | null;
  problems: Problem[];
}

/** Reads an app's manifest and says what is wrong with it. */
export function readProject(dir: string): Project {
  const root = resolve(dir);
  const found = MANIFEST_PATHS.map(path => join(root, path)).find(path => existsSync(path));

  if (!found) {
    return {
      root,
      manifestFile: join(root, MANIFEST_PATHS[0]),
      raw: {},
      manifest: null,
      problems: [{ code: 'manifest_missing', severity: 'error', message: `There is no manifest. Put one at ${MANIFEST_PATHS[0]}.` }],
    };
  }

  const file = relative(root, found);
  let raw: unknown;

  try {
    raw = JSON.parse(readFileSync(found, 'utf8'));
  } catch (error) {
    return {
      root,
      manifestFile: found,
      raw: {},
      manifest: null,
      problems: [{ code: 'manifest_not_json', severity: 'error', file, message: `The manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }],
    };
  }

  const checked = validateManifest(raw);

  return {
    root,
    manifestFile: found,
    raw: (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>,
    manifest: checked.manifest ?? null,
    problems: checked.problems.map((problem: ManifestProblem) => ({ ...problem, severity: 'error' as const, file })),
  };
}

/** The source file a screen's entry is built from, or null when there is none. */
export function sourceOf(root: string, entry: string): string | null {
  const stem = join(root, 'src', entry.replace(/\.m?js$/, ''));

  return SOURCE_EXTENSIONS.map(extension => stem + extension).find(path => existsSync(path)) ?? null;
}

/** A problem as one line: `file:line  code  message`. */
export function formatProblem(problem: Problem): string {
  const where = problem.file ? `${problem.file}${problem.line ? `:${problem.line}` : ''}${problem.path ? ` (${problem.path})` : ''}` : (problem.path ?? '');

  return `${problem.severity === 'error' ? 'error  ' : 'warning'} ${where ? `${where}  ` : ''}${problem.message} [${problem.code}]`;
}
