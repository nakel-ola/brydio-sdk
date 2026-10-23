import { createHash } from 'node:crypto';

import { brandPathsOf } from './requirements.ts';
import { framePagesOf } from './screen-kinds.ts';

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

/**
 * What a bundle with frame screens may carry beside its code (PB27): their
 * pages, styles, images and media, 4 MB of them, on top of the 1 MB of code.
 */
export const FRAME_ASSETS_MAX_BYTES = 4 * 1024 * 1024;

/** The manifest, at the root of every published bundle. Never stored, never hashed. */
export const BUNDLE_MANIFEST = 'app.json';

export const BUNDLE_PATH_MAX_CHARS = 200;

/** The files of one bundle, by path inside it. */
export type BundleFiles = ReadonlyMap<string, Uint8Array>;

const SCRIPT = /\.m?js$/;

/** What a frame screen's page may load from its own bundle (PB27), by extension. No fonts. Brydio's list. */
export const FRAME_ASSET_TYPES: Readonly<Record<string, string>> = {
  html: 'text/plain; charset=utf-8',
  css: 'text/css; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

const extensionOf = (path: string) => /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? '';

/** Whether a file is a frame screen's asset rather than code. */
export const isFrameAsset = (path: string): boolean =>
  !SCRIPT.test(path) && Object.prototype.hasOwnProperty.call(FRAME_ASSET_TYPES, extensionOf(path));

/** The type a file is served with, or null for one the store never holds. Brydio's answer. */
export function contentTypeOf(path: string): string | null {
  if (SCRIPT.test(path)) return 'text/javascript; charset=utf-8';

  return isFrameAsset(path) ? FRAME_ASSET_TYPES[extensionOf(path)]! : null;
}

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

/**
 * The logo and icon files the bundle's manifest names (ADR-A20), by path: the
 * one kind of file beside code a bundle may hold, and only at those paths.
 * Brydio keeps them with the version, never as code, so they are not in the
 * fingerprint.
 */
export function brandOf(files: BundleFiles): BundleFiles {
  const named = new Set(brandPathsOf(manifestIn(files)).values());

  return new Map([...files].filter(([path]) => named.has(path)));
}

/** The bundle's manifest, read leniently: anything unreadable names no files. */
function manifestIn(files: BundleFiles): unknown {
  const bytes = files.get(BUNDLE_MANIFEST);

  if (!bytes) return null;

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

/** The files the store keeps and the fingerprint covers: every one but the root manifest and its brand images. */
export function codeOf(files: BundleFiles): BundleFiles {
  const brand = brandOf(files);

  return new Map([...files].filter(([path]) => path !== BUNDLE_MANIFEST && !brand.has(path)));
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
  const brand = brandOf(files);
  const pages = framePagesOf(manifestIn(files));
  const framed = pages.size > 0;

  for (const path of files.keys()) {
    if (!isBundlePath(path)) {
      return { code: 'bundle_path_invalid', message: `"${JSON.stringify(path).slice(1, -1)}" is not a path a bundle can hold.`, file: path };
    }

    if (path !== BUNDLE_MANIFEST && !brand.has(path) && !SCRIPT.test(path)) {
      // A frame screen's page, styles, images and media (PB27); nothing else.
      const asset = framed && isFrameAsset(path) && (!path.endsWith('.html') || pages.has(path));

      if (!asset) {
        return {
          code: 'bundle_file_not_code',
          message: framed
            ? `"${path}" is not a script, a frame screen's page, a stylesheet, an image or media. A bundle holds only those and ${BUNDLE_MANIFEST}.`
            : `"${path}" is not a script. A bundle holds only .js files and ${BUNDLE_MANIFEST}.`,
          file: path,
        };
      }
    }
  }

  if (!files.has(BUNDLE_MANIFEST)) {
    return { code: 'bundle_manifest_missing', message: `That bundle has no ${BUNDLE_MANIFEST} at its root.` };
  }

  if (codeOf(files).size === 0) {
    return { code: 'bundle_empty', message: 'That bundle has no screens in it, only a manifest.' };
  }

  const assets = [...files].filter(([path]) => isFrameAsset(path) && !brand.has(path));
  const assetBytes = assets.reduce((sum, [, bytes]) => sum + bytes.length, 0);

  if (assetBytes > FRAME_ASSETS_MAX_BYTES) {
    const [largest] = [...assets].sort(([, a], [, b]) => b.length - a.length);

    return {
      code: 'bundle_too_large',
      message:
        `The frame screens' pages, styles, images and media are ${sizeOf(assetBytes)}, over the ${sizeOf(FRAME_ASSETS_MAX_BYTES)} cap. ` +
        `The largest is "${largest![0]}" at ${sizeOf(largest![1].length)}.`,
      file: largest![0],
    };
  }

  const counted = [...files].filter(([path]) => !(isFrameAsset(path) && !brand.has(path)));
  const total = counted.reduce((sum, [, bytes]) => sum + bytes.length, 0);

  if (total > BUNDLE_MAX_BYTES) {
    const [largest] = [...counted].sort(([, a], [, b]) => b.length - a.length);

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

/** Every file's bytes, the manifest included. */
export const bundleBytes = (files: BundleFiles): number => [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0);

/** A frame screen's pages, styles, images and media, which have a cap of their own (PB27). */
export const frameAssetBytes = (files: BundleFiles): number => {
  const brand = brandOf(files);

  return [...files].filter(([path]) => isFrameAsset(path) && !brand.has(path)).reduce((sum, [, bytes]) => sum + bytes.length, 0);
};

export function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
