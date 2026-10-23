import { BUNDLE_MAX_BYTES, FRAME_ASSETS_MAX_BYTES, bundleBytes, frameAssetBytes, sizeOf } from '@brydio/manifest';

import { build } from './build.ts';
import { formatProblem, readProject } from './project.ts';
import { zipFiles } from './zip.ts';

/**
 * `brydio pack`: what `brydio publish` would send, file by file, and its size
 * against the cap (PB03). Builds the app as publish does and sends nothing.
 *
 * The cap is measured as the registry measures it: every file's own bytes,
 * the manifest included, before compression. The zip's size is said too,
 * since that is what goes over the wire.
 */

export interface PackOptions {
  out?: (line: string) => void;
}

export async function pack(dir: string, options: PackOptions = {}): Promise<number> {
  const out = options.out ?? console.log;
  const project = readProject(dir);
  const built = await build(dir);

  for (const problem of built.problems) out(formatProblem(problem));

  if (!built.ok) {
    out('Not built, so there is nothing to pack.');

    return 1;
  }

  const paths = [...built.files.keys()].sort();
  const width = Math.max(...paths.map(one => one.length));
  // A frame screen's pages, styles, images and media have a cap of their own (PB27).
  const assets = frameAssetBytes(built.files);
  const total = bundleBytes(built.files) - assets;

  out(`${String(project.raw.name)} ${String(project.raw.version)}: ${paths.length} file${paths.length === 1 ? '' : 's'}`);

  for (const path of paths) out(`  ${path.padEnd(width)}  ${sizeOf(built.files.get(path)!.length).padStart(10)}`);

  out(`Total ${sizeOf(total)} of the ${sizeOf(BUNDLE_MAX_BYTES)} a bundle may be (${Math.round((total / BUNDLE_MAX_BYTES) * 100)}%), ${sizeOf(zipFiles(built.files).length)} zipped.`);
  if (assets) {
    out(`Frame screens' pages, styles, images and media: ${sizeOf(assets)} of the ${sizeOf(FRAME_ASSETS_MAX_BYTES)} they may be (${Math.round((assets / FRAME_ASSETS_MAX_BYTES) * 100)}%), counted apart.`);
  }
  out(`Fingerprint ${built.hash}`);
  out('Nothing was sent. brydio publish uploads exactly these files.');

  return 0;
}
