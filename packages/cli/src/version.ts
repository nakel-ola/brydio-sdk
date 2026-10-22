import {
  SEMVER_FORMAT,
  compareVersions,
  diffSchemas,
  migrationProblems,
  migrationsSchema,
  schemaOf,
  type FieldType,
  type MigrationStep,
  type SchemaChange,
} from '@brydio/manifest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { readProject } from './project.ts';
import { registryApp } from './publish.ts';
import { RegistryRefused, bodyOf, path, readLogins, registry, registryOf, type RegistryOptions } from './registry.ts';

/**
 * `brydio version patch|minor|major|<semver>`: the app's next number, written
 * to the manifest and nowhere else (PB03). The manifest is the one place an
 * app's version lives; `package.json` carries none, and `brydio build`
 * refuses one that says a different number (`version_mismatch`).
 *
 * When a collection's fields changed since the last published version, it
 * also adds a `migrations` entry for the new number with a step for each
 * change it can describe, and says what is left for a person to decide. The
 * last published version is the registry's, when this computer is logged in
 * to it; otherwise the manifest as committed at git `HEAD`.
 *
 * A step it cannot finish is written so that `brydio validate` refuses it
 * until someone does: an `add` of a required field has no default, and a
 * `replace` of a removed choice has an empty `to`.
 */

export const BUMPS = ['patch', 'minor', 'major'] as const;

export interface VersionOptions extends RegistryOptions {
  /** For tests: the manifest at git HEAD, read some other way. */
  committed?: (root: string, file: string) => string | null;
}

/** The number after `current` for a bump, the way npm counts: a prerelease bumps to its own release first. */
export function nextVersion(current: string, bump: (typeof BUMPS)[number]): string {
  const [core = '', pre] = current.split('+')[0]!.split(/-(.*)/s);
  const [major = 0, minor = 0, patch = 0] = core.split('.').map(Number);

  switch (bump) {
    case 'patch':
      return pre ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
    case 'minor':
      return pre && patch === 0 ? `${major}.${minor}.0` : `${major}.${minor + 1}.0`;
    case 'major':
      return pre && minor === 0 && patch === 0 ? `${major}.0.0` : `${major + 1}.0.0`;
  }
}

export async function version(words: string[], dir: string, options: VersionOptions = {}): Promise<number> {
  const out = options.out ?? console.log;
  const [wanted] = words;

  if (!wanted) {
    out('Say which: brydio version patch, minor, major, or a number like 1.4.0.');

    return 2;
  }

  const project = readProject(dir);

  if (!existsSync(project.manifestFile)) {
    out(`There is no manifest in ${project.root}. Put one at .brydio/app.json. [manifest_missing]`);

    return 1;
  }

  const current = project.raw.version;

  if (typeof current !== 'string' || !SEMVER_FORMAT.test(current)) {
    out(`The manifest's version is ${JSON.stringify(current)}, which is not a number like 1.2.0, so there is nothing to count up from. Write one in .brydio/app.json.`);

    return 1;
  }

  const next = (BUMPS as readonly string[]).includes(wanted) ? nextVersion(current, wanted as (typeof BUMPS)[number]) : wanted;

  if (!SEMVER_FORMAT.test(next)) {
    out(`"${wanted}" is not patch, minor, major, or a version number like 1.4.0.`);

    return 2;
  }

  if (compareVersions(next, current) <= 0) {
    out(`${next} is not higher than ${current}, the manifest's version now. A version number only goes up. [version_not_higher]`);

    return 1;
  }

  // The manifest is the one source. A package.json that carries a number too
  // would disagree the moment this writes, and the build would then refuse.
  const pkgFile = join(project.root, 'package.json');
  const pkg = existsSync(pkgFile) ? (JSON.parse(readFileSync(pkgFile, 'utf8')) as { version?: unknown }) : null;

  if (pkg && pkg.version !== undefined) {
    out(
      `package.json says "version": ${JSON.stringify(pkg.version)}. An app's version lives in .brydio/app.json alone: take the line out of package.json, then run brydio version again. [version_in_package_json]`,
    );

    return 1;
  }

  const previous = await lastPublished(project.root, project.manifestFile, String(project.raw.name ?? ''), options, out);
  const raw: Record<string, unknown> = { ...project.raw, version: next };
  const notes: string[] = [];

  if (previous) {
    const stub = migrationStub(previous.manifest, raw, previous.version, next);

    notes.push(...stub.notes);

    if (stub.steps.length) {
      const migrations = Array.isArray(raw.migrations) ? [...(raw.migrations as unknown[])] : [];

      migrations.push({ version: next, steps: stub.steps });
      raw.migrations = migrations;
    }
  }

  writeFileSync(project.manifestFile, `${JSON.stringify(raw, null, 2)}\n`);
  out(`${String(project.raw.name)} ${current} → ${next}, in ${relative(project.root, project.manifestFile)}.`);

  for (const note of notes) out(note);

  return 0;
}

/** The version published before, from the registry when logged in, else from git HEAD. Null when there is none. */
async function lastPublished(
  root: string,
  manifestFile: string,
  key: string,
  options: VersionOptions,
  out: (line: string) => void,
): Promise<{ version: string; manifest: unknown; from: string } | null> {
  let url: string | null = null;

  try {
    url = registryOf(options);
  } catch {
    url = null;
  }

  const loggedIn = url && (options.token || readLogins(options).logins[url]);

  if (url && loggedIn && key) {
    try {
      const reg = registry(options, 'signedIn');
      const found = await registryApp(reg, key);

      if (!found) {
        out(`Registry ${reg.url}: ${key} has no published version yet, so there is nothing to migrate from.`);

        return null;
      }

      const highest = found.versions
        .map(one => one.version)
        .sort(compareVersions)
        .at(-1);

      if (!highest) return null;

      const detail = bodyOf<{ manifest?: unknown }>(await reg.send('GET', path.version(key, highest)), reg, [200]);

      out(`Registry ${reg.url}: comparing the schema with ${key} ${highest}, the last version published.`);

      return { version: highest, manifest: detail.manifest ?? null, from: reg.url };
    } catch (error) {
      if (!(error instanceof RegistryRefused)) throw error;

      out(`${error.message} Comparing with the manifest at git HEAD instead.`);
    }
  }

  const text = (options.committed ?? committedFile)(root, relative(root, manifestFile));

  if (text === null) {
    out('Not logged in to a registry and no committed manifest to compare with, so no migration was checked. brydio publish checks it against the registry.');

    return null;
  }

  try {
    const manifest = JSON.parse(text) as { version?: unknown };

    out(`Comparing the schema with the manifest at git HEAD (${String(manifest.version)}); log in with brydio login to compare with the version actually published.`);

    return { version: String(manifest.version ?? ''), manifest, from: 'HEAD' };
  } catch {
    out('The manifest at git HEAD is not valid JSON, so no migration was checked.');

    return null;
  }
}

function committedFile(root: string, file: string): string | null {
  const shown = spawnSync('git', ['show', `HEAD:./${file}`], { cwd: root, encoding: 'utf8' });

  return shown.status === 0 ? shown.stdout : null;
}

/**
 * The steps that take `previous`'s records to `next`'s, for what the steps
 * the manifest already declares since `previousVersion` don't explain, and a
 * sentence for each change only a person can decide.
 */
export function migrationStub(previous: unknown, next: Record<string, unknown>, previousVersion: string, nextVersionNumber: string): { steps: MigrationStep[]; notes: string[] } {
  const declared = migrationsSchema.safeParse(next.migrations ?? []);
  const existing = declared.success
    ? declared.data.filter(entry => SEMVER_FORMAT.test(previousVersion) && compareVersions(entry.version, previousVersion) > 0).flatMap(entry => entry.steps)
    : [];
  const unexplained = migrationProblems(previous, next, existing);

  if (!unexplained.length) return { steps: [], notes: diffSchemas(previous, next).length ? ['The schema changed, and the migrations already declared explain every change.'] : [] };

  if (declared.success && declared.data.some(entry => entry.version === nextVersionNumber)) {
    return { steps: [], notes: [`There is already a migrations entry for ${nextVersionNumber}; brydio validate says what it is missing.`] };
  }

  const open = (collection: string, field?: string) => unexplained.some(problem => problem.collection === collection && (field === undefined || problem.field === undefined || problem.field === field));
  const changes = diffSchemas(previous, next).filter(change => open(change.collection, 'field' in change ? change.field : undefined));
  const after = schemaOf(next);
  const steps: MigrationStep[] = [];
  const notes: string[] = [];
  const renamed = renames(changes);
  const renamedFrom = new Set([...renamed].map(([to, from]) => `${to.split('.')[0]}.${from}`));

  for (const change of changes) {
    const where = 'field' in change ? `${change.collection}.${change.field}` : change.collection;

    switch (change.kind) {
      case 'collection_removed':
        steps.push({ op: 'dropCollection', collection: change.collection });
        notes.push(`  dropCollection ${change.collection}: every record in it is deleted when a workspace upgrades.`);
        break;
      case 'field_added': {
        const rename = renamed.get(`${change.collection}.${change.field}`);

        if (rename) {
          steps.push({ op: 'rename', collection: change.collection, from: rename, to: change.field });
          notes.push(`  rename ${change.collection}.${rename} to ${change.field}: one field went and one of the same type came, so it reads as a rename. If it is not, write a drop and an add instead.`);
          break;
        }

        const type = after.get(change.collection)?.get(change.field);
        const required = type && !type.optional && type.kind !== 'string[]';

        if (type?.default !== undefined) {
          steps.push({ op: 'add', collection: change.collection, field: change.field, default: type.default });
        } else {
          steps.push({ op: 'add', collection: change.collection, field: change.field });
          if (required) notes.push(`  add ${where}: it is required, so give the step a "default" for the records already kept. brydio validate refuses it until then.`);
        }
        break;
      }
      case 'field_removed':
        if (renamedFrom.has(`${change.collection}.${change.field}`)) break;
        steps.push({ op: 'drop', collection: change.collection, field: change.field });
        notes.push(`  drop ${where}: deletes it from every record. If it was renamed, write a rename step instead.`);
        break;
      case 'values_removed':
        for (const value of change.values) {
          steps.push({ op: 'replace', collection: change.collection, field: change.field, from: value, to: '' });
        }
        notes.push(`  replace in ${where}: say which value records holding ${change.values.map(one => `"${one}"`).join(', ')} hold instead, in "to". brydio validate refuses it until then.`);
        break;
      case 'field_type_changed':
      case 'field_now_required':
        notes.push(`  ${where}: no step can do this. ${unexplained.find(problem => problem.collection === change.collection && problem.field === change.field)?.message ?? ''}`.trimEnd());
        break;
      default:
        break;
    }
  }

  for (const problem of unexplained.filter(one => one.code === 'migration_anonymous_changed')) notes.push(`  ${problem.message}`);

  return {
    steps,
    notes: steps.length || notes.length ? [`The schema changed since ${previousVersion}. ${steps.length ? `Added a migrations entry for ${nextVersionNumber} with ${steps.length} step${steps.length === 1 ? '' : 's'}; read it before publishing:` : 'Nothing could be written for it:'}`, ...notes] : [],
  };
}

/** In each collection with exactly one field gone and exactly one come of its type: the new field's name to the old one's. */
function renames(changes: SchemaChange[]): Map<string, string> {
  const found = new Map<string, string>();
  const byCollection = new Map<string, { added: SchemaChange[]; removed: SchemaChange[] }>();

  for (const change of changes) {
    if (change.kind !== 'field_added' && change.kind !== 'field_removed') continue;

    const entry = byCollection.get(change.collection) ?? { added: [], removed: [] };

    (change.kind === 'field_added' ? entry.added : entry.removed).push(change);
    byCollection.set(change.collection, entry);
  }

  for (const [collection, { added, removed }] of byCollection) {
    if (removed.length !== 1) continue;

    const gone = removed[0] as { field: string; type: FieldType };
    const like = (added as { field: string; type: FieldType }[]).filter(come => come.type.kind === gone.type.kind && come.type.optional === gone.type.optional);

    if (like.length === 1) found.set(`${collection}.${like[0]!.field}`, gone.field);
  }

  return found;
}
