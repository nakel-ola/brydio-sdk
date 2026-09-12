/**
 * What a bundle may hold (contracts §11, A7-F02).
 *
 * Copied from Brydio's `apps/api/src/apps/bundles/bundle-files.ts`, which is
 * what refuses a bundle at the store. The SDK checks the same rules first so a
 * refusal is something the builder sees on their own machine, with the same
 * numbers and the same words.
 */

/** 1 MB per version, every file included, `app.json` too (A4-F06). */
export const BUNDLE_MAX_BYTES = 1024 * 1024;

/** The manifest, at the root of every bundle. */
export const BUNDLE_MANIFEST = 'app.json';

export const BUNDLE_PATH_MAX_CHARS = 200;

const SCRIPT = /\.m?js$/;

/**
 * Whether a path can name a file inside a bundle: relative, forward slashes,
 * no empty, `.` or `..` segment, no hidden segment, plain printable ASCII.
 */
export function isBundlePath(path: string): boolean {
  if (path.length === 0 || path.length > BUNDLE_PATH_MAX_CHARS) return false;
  if (!/^[A-Za-z0-9._\-/]+$/.test(path)) return false;

  return path.split('/').every(segment => segment.length > 0 && !segment.startsWith('.'));
}

/** Whether a path is a script a bundle can serve as a screen's entry. */
export const isScriptPath = (path: string): boolean => isBundlePath(path) && SCRIPT.test(path);

/**
 * The content type a bundle file is served with, or null for one a bundle
 * may not hold. Two answers only, as in the store.
 */
export function contentTypeOf(path: string): string | null {
  if (path === BUNDLE_MANIFEST) return 'application/json; charset=utf-8';
  if (SCRIPT.test(path)) return 'text/javascript; charset=utf-8';

  return null;
}
