import {
  BUNDLE_MANIFEST,
  bundleProblem,
  compareVersions,
  findSecrets,
  secretsInJson,
  isScriptPath,
  publishedMigrationProblems,
  unknownHostGrant,
} from '@brydio/manifest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { callsOf, type ScreenCall } from './calls.ts';
import { grantProblems } from './grant-checks.ts';
import { DIST, readProject, type Problem } from './project.ts';
import { isScreenSource } from './screen-sources.ts';
import { checkSource } from './source-checks.ts';

/**
 * `brydio validate`: everything Brydio would refuse about this app, found on
 * the builder's own machine (A5-F03).
 *
 * The manifest, by the server's schema. The built bundle, by the store's
 * rules and the version record's (every screen's entry a script in the
 * bundle). The source, parsed, by what the catalogue and the worker allow
 * (`source-checks.ts`), and what the screens call against the grants
 * (`grant-checks.ts`). Run it after `brydio build`; it reads the bundle as
 * it was built.
 *
 * `docs/publish-checklist.md` lists every check, its code and its sentence,
 * and which of them Brydio's publish route runs again (A8-F04-S03).
 */

export interface ValidateResult {
  ok: boolean;
  problems: Problem[];
}

export interface ValidateOptions {
  outDir?: string;
  /**
   * The manifest of the version published before this one, as a file, or a
   * folder holding `app.json` (a built bundle) or `.brydio/app.json`. Without
   * it, a built `dist/app.json` with a lower version stands in, and without
   * that the migration check is left to the publish route.
   */
  previous?: string;
}

export function validate(dir: string, options: ValidateOptions = {}): ValidateResult {
  const project = readProject(dir);
  const problems: Problem[] = [...project.problems];
  const outDir = join(project.root, options.outDir ?? DIST);
  const dist = relative(project.root, outDir);
  const manifestFile = relative(project.root, project.manifestFile);
  const grant = unknownHostGrant(project.raw);

  if (grant) problems.push({ code: grant.code, severity: 'error', file: manifestFile, path: grant.path, message: grant.message });

  // The manifest is served to every screen that opens the app, so it holds nothing private either.
  for (const secret of secretsInJson(project.raw, BUNDLE_MANIFEST)) {
    problems.push({ code: secret.code, severity: 'error', file: manifestFile, path: secret.path, message: secret.message });
  }

  if (project.manifest) {
    const built = existsSync(outDir) ? filesUnder(outDir) : null;

    problems.push(...migrationCheck(project.raw, manifestFile, built, dist, options.previous, project.root));

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
            file: `${dist}/`,
            message: `The "${screen}" screen names "${entry}", which is not a script in this bundle. Run brydio build.`,
          });
        }
      }

      const refused = bundleProblem(built);

      if (refused) {
        problems.push({ code: refused.code, severity: 'error', message: refused.message, ...(refused.file ? { file: `${dist}/${refused.file}` } : {}) });
      }

      for (const secret of findSecrets(built)) {
        problems.push({ code: secret.code, severity: 'error', file: `${dist}/${secret.path.split('.json')[0]}.json`, path: secret.path, message: secret.message });
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

  if (project.manifest && existsSync(join(project.root, 'src'))) {
    problems.push(...grantProblems(project.manifest, screenCalls(project.root), manifestFile));
  }

  return { ok: !problems.some(problem => problem.severity === 'error'), problems };
}

/** Every screen source under `src/`, tests aside, by its path from the app's root. */
function screenSources(root: string): [string, string][] {
  const src = join(root, 'src');

  if (!existsSync(src)) return [];

  return [...filesUnder(src)]
    .filter(([path]) => isScreenSource(`src/${path}`))
    .map(([path, bytes]) => [`src/${path}`, new TextDecoder().decode(bytes)]);
}

/** What the source checks find in every screen source under `src/`, tests aside. */
export function checkSources(root: string): Problem[] {
  return screenSources(root).flatMap(([file, text]) => checkSource(file, text));
}

/** Every tool, collection and host grant the screens name plainly, with where. */
export function screenCalls(root: string): (ScreenCall & { file: string })[] {
  return screenSources(root).flatMap(([file, text]) => {
    try {
      return callsOf(file, text).map(call => ({ ...call, file }));
    } catch {
      // A file that does not parse is `source_syntax` already.
      return [];
    }
  });
}

/**
 * A schema change without its migration, against the version before this
 * one, in the words of `POST /apps/publish` (`migration_missing`, at
 * `migrations`). One item per problem, where the route stops at the first.
 */
function migrationCheck(
  raw: Record<string, unknown>,
  manifestFile: string,
  built: Map<string, Uint8Array> | null,
  dist: string,
  previous: string | undefined,
  root: string,
): Problem[] {
  const version = raw.version as string;
  let before: Record<string, unknown> | null = null;
  let from = '';

  if (previous !== undefined) {
    const path = resolve(root, previous);
    const file = [path, join(path, BUNDLE_MANIFEST), join(path, '.brydio', BUNDLE_MANIFEST)].find(one => existsSync(one) && statSync(one).isFile());

    if (!file) {
      return [{ code: 'previous_unreadable', severity: 'error', message: `There is no manifest at ${previous} to compare this version with.` }];
    }

    try {
      before = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return [{ code: 'previous_unreadable', severity: 'error', file: relative(root, file), message: `${relative(root, file)} is not valid JSON, so this version can't be compared with it.` }];
    }

    from = relative(root, file);

    if (typeof before?.version !== 'string' || compareVersions(before.version, version) >= 0) {
      return [
        {
          code: 'previous_not_older',
          severity: 'error',
          file: from,
          message: `${from} is version ${String(before?.version)}, not one before ${version}, so it can't say what this version changes.`,
        },
      ];
    }
  } else {
    const shipped = built?.get(BUNDLE_MANIFEST);

    try {
      const parsed = shipped ? JSON.parse(new TextDecoder().decode(shipped)) : null;

      // A build of an earlier version, not yet rebuilt: the version this one follows.
      if (typeof parsed?.version === 'string' && compareVersions(parsed.version, version) < 0) {
        before = parsed;
        from = `${dist}/${BUNDLE_MANIFEST}`;
      }
    } catch {
      // An unreadable built manifest is the bundle checks' to report.
    }
  }

  if (!before) return [];

  return publishedMigrationProblems(before, raw).map(problem => ({
    code: 'migration_missing',
    severity: 'error' as const,
    file: manifestFile,
    path: 'migrations',
    message: `${problem.message} (${version} against ${before.version}, the version before it.)`,
  }));
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
