import { BUNDLE_MANIFEST, bundleProblem, isScriptPath } from '@brydio/manifest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { DIST, SOURCE_EXTENSIONS, readProject, type Problem } from './project.ts';
import { checkSource } from './source-checks.ts';

/**
 * `brydio validate`: everything Brydio would refuse about this app, found on
 * the builder's own machine (A5-F03).
 *
 * The manifest, by the server's schema. The built bundle, by the store's
 * rules and the version record's (every screen's entry a script in the
 * bundle). The source, parsed, by what the catalogue and the worker allow
 * (`source-checks.ts`). Run it
 * after `brydio build`; it reads the bundle as it was built.
 */

export interface ValidateResult {
  ok: boolean;
  problems: Problem[];
}

export function validate(dir: string, options: { outDir?: string } = {}): ValidateResult {
  const project = readProject(dir);
  const problems: Problem[] = [...project.problems];
  const outDir = join(project.root, options.outDir ?? DIST);
  const dist = relative(project.root, outDir);

  if (project.manifest) {
    const built = existsSync(outDir) ? filesUnder(outDir) : null;

    if (!built) {
      problems.push({ code: 'bundle_not_built', severity: 'error', message: `There is no ${dist}/ yet. Run brydio build first.` });
    } else {
      for (const [screen, { entry }] of Object.entries(project.manifest.screens ?? {})) {
        // What `AppVersionService.record` refuses: an entry that is not a script in the bundle.
        if (!isScriptPath(entry) || !built.has(entry)) {
          problems.push({
            code: 'screen_not_built',
            severity: 'error',
            path: `screens.${screen}.entry`,
            message: `The "${screen}" screen names "${entry}", which is not a script in ${dist}/. Run brydio build.`,
          });
        }
      }

      const refused = bundleProblem(built);

      if (refused) {
        problems.push({ code: refused.code, severity: 'error', message: refused.message, ...(refused.file ? { file: `${dist}/${refused.file}` } : {}) });
      }

      const shipped = built.get(BUNDLE_MANIFEST);

      // `sdk` is the build's to write, so it is left out of the comparison on both sides.
      const withoutSdk = (manifest: Record<string, unknown>) => JSON.stringify({ ...manifest, sdk: undefined });

      if (shipped && withoutSdk(JSON.parse(new TextDecoder().decode(shipped))) !== withoutSdk(project.raw)) {
        problems.push({
          code: 'bundle_stale',
          severity: 'warning',
          file: `${dist}/${BUNDLE_MANIFEST}`,
          message: 'The built manifest is not the manifest as it is now. Run brydio build again.',
        });
      }
    }
  }

  problems.push(...checkSources(project.root));

  return { ok: !problems.some(problem => problem.severity === 'error'), problems };
}

/** What the source checks find in every screen source under `src/`, tests aside. */
export function checkSources(root: string): Problem[] {
  const src = join(root, 'src');
  const problems: Problem[] = [];

  if (!existsSync(src)) return problems;

  for (const [path, bytes] of filesUnder(src)) {
    if (!SOURCE_EXTENSIONS.some(extension => path.endsWith(extension)) || path.endsWith('.d.ts')) continue;
    // Tests run in the fake host, not in a workspace; they may do what a screen may not.
    if (/(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[jt]sx?$/.test(path)) continue;

    problems.push(...checkSource(`src/${path}`, new TextDecoder().decode(bytes)));
  }

  return problems;
}

/** Every file under a folder, by its `/`-separated path inside it. */
function filesUnder(root: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const walk = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);

      if (statSync(path).isDirectory()) walk(path);
      else files.set(relative(root, path).split('\\').join('/'), readFileSync(path));
    }
  };

  walk(root);

  return files;
}
