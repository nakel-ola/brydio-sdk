import { createHash } from 'node:crypto';

/**
 * What a bundle may hold, and the fingerprint its code is served under
 * (contracts §11, A7-F02).
 *
 * The rules and the recipe are Brydio's, from
 * `apps/api/src/apps/bundles/bundle-files.ts`, which refuses a bundle at the
 * store. The SDK applies them first so a refusal is something the builder sees
 * on their own machine, with the same numbers and the same words, and so
 * `brydio build` can print the fingerprint the server will serve the code
 * under before anything is uploaded.
 */

/** 1 MB per version, every file counted, the manifest included. */
export const BUNDLE_MAX_BYTES = 1024 * 1024;

/** The manifest, at the root of every published bundle. Never stored, never hashed. */
export const BUNDLE_MANIFEST = 'app.json';

export const BUNDLE_PATH_MAX_CHARS = 200;

/** The files of one bundle, by path inside it. */
export type BundleFiles = ReadonlyMap<string, Uint8Array>;

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

/** Whether a path is a script a bundle can hold. */
export const isScriptPath = (path: string): boolean => isBundlePath(path) && SCRIPT.test(path);

/** The files the store keeps and the fingerprint covers: every one but the root manifest. */
export function codeOf(files: BundleFiles): BundleFiles {
  return new Map([...files].filter(([path]) => path !== BUNDLE_MANIFEST));
}

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

/**
 * The fingerprint: sha256, lowercase hex, over the sorted list of the code
 * files, each written as its path, one NUL byte, the sha256 hex of its bytes
 * and one newline.
 *
 * Over the files rather than an archive, because two zips of the same files
 * differ by their timestamps. Without `app.json`, because the manifest carries
 * the version number, and the same code under two numbers has to be one
 * bundle. Sorted by JavaScript's default string order, as the server sorts.
 */
export function bundleHash(files: BundleFiles): string {
  const code = codeOf(files);
  const lines = [...code.keys()].sort().map(path => `${path}\0${sha256(code.get(path)!)}\n`);

  return sha256(lines.join(''));
}

export type BundleProblemCode =
  | 'bundle_too_large'
  | 'bundle_file_not_code'
  | 'bundle_path_invalid'
  | 'bundle_manifest_missing'
  | 'bundle_empty';

export interface BundleProblem {
  code: BundleProblemCode;
  message: string;
  file?: string;
}

/**
 * What the store would refuse about these files, or null. The server's order
 * and words: every path first, then the manifest, then the code, then the size.
 */
export function bundleProblem(files: BundleFiles): BundleProblem | null {
  for (const path of files.keys()) {
    if (!isBundlePath(path)) {
      return { code: 'bundle_path_invalid', message: `"${JSON.stringify(path).slice(1, -1)}" is not a path a bundle can hold.`, file: path };
    }

    if (path !== BUNDLE_MANIFEST && !SCRIPT.test(path)) {
      return {
        code: 'bundle_file_not_code',
        message: `"${path}" is not a script. A bundle holds only .js files and ${BUNDLE_MANIFEST}.`,
        file: path,
      };
    }
  }

  if (!files.has(BUNDLE_MANIFEST)) {
    return { code: 'bundle_manifest_missing', message: `That bundle has no ${BUNDLE_MANIFEST} at its root.` };
  }

  if (codeOf(files).size === 0) {
    return { code: 'bundle_empty', message: 'That bundle has no screens in it, only a manifest.' };
  }

  const total = bundleBytes(files);

  if (total > BUNDLE_MAX_BYTES) {
    const [largest] = [...files].sort(([, a], [, b]) => b.length - a.length);

    return {
      code: 'bundle_too_large',
      message:
        `That bundle is ${sizeOf(total)}, over the ${sizeOf(BUNDLE_MAX_BYTES)} cap. ` +
        `The largest file is "${largest![0]}" at ${sizeOf(largest![1].length)}.`,
      file: largest![0],
    };
  }

  return null;
}

/** Every file's bytes, the manifest included: what the cap is measured on. */
export const bundleBytes = (files: BundleFiles): number => [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0);

export function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
