import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  KNOWN_HOST_GRANTS,
  SECRET_MESSAGE,
  findSecrets,
  migrationProblems,
  publishedMigrationProblems,
  unknownHostGrant,
  validateManifest,
} from '../src/index.ts';
import { ISSUES_MANIFEST } from './issues-manifest.fixture.ts';

/**
 * The publish route's own checks, copied into `@brydio/manifest` for
 * `brydio validate` (A8-F04-S03): the migration a schema change must declare,
 * the host grants Brydio knows, and the secret scan. Each is compared with
 * the server's whenever a Brydio checkout sits beside this repository.
 */

const brydio = process.env.BRYDIO_DIR ?? join(import.meta.dir, '..', '..', '..', '..', 'brydio');
const api = join(brydio, 'apps/api/src');
const serverMigrations = join(api, 'apps/manifest/migrations.ts');
const serverSecrets = join(api, 'extensions/apps/secret-scan.ts');
const serverCodes = join(api, 'extensions/apps/manifest-codes.ts');
const serverDiff = join(api, 'apps/versions/diff-manifests.ts');
const bytes = (text: string) => new TextEncoder().encode(text);

const v = (version: string, schema: Record<string, unknown>, migrations?: unknown) => ({
  ...ISSUES_MANIFEST,
  version,
  data: { issues: { schema, label: 'issue' } },
  grants: { tools: ['*'], collections: ['*'] },
  ...(migrations ? { migrations } : {}),
});

const BEFORE = v('0.2.0', { title: 'string', status: ['todo', 'done'], owner: 'member?' });

/** Next versions, each with or without the steps its change needs. */
const NEXT: unknown[] = [
  v('0.3.0', { title: 'string', status: ['todo', 'done'], owner: 'member?', due: 'date?' }),
  v('0.3.0', { title: 'string', status: ['todo', 'done'], owner: 'member?', due: 'date?' }, [
    { version: '0.3.0', steps: [{ op: 'add', collection: 'issues', field: 'due' }] },
  ]),
  v('0.3.0', { title: 'string', status: ['todo', 'done'], owner: 'member?', points: 'number' }, [
    { version: '0.3.0', steps: [{ op: 'add', collection: 'issues', field: 'points' }] },
  ]),
  v('0.3.0', { title: 'string', status: ['todo', 'done'], assignee: 'member?' }),
  v('0.3.0', { title: 'string', status: ['todo', 'done'], assignee: 'member?' }, [
    { version: '0.3.0', steps: [{ op: 'rename', collection: 'issues', from: 'owner', to: 'assignee' }] },
  ]),
  v('0.3.0', { title: 'string', status: ['todo', 'doing'], owner: 'member?' }),
  v('0.3.0', { title: 'number', status: ['todo', 'done'], owner: 'member?' }),
  v('0.3.0', { title: 'string', status: ['todo', 'done'], owner: 'member' }),
  v('0.3.0', { title: 'string', status: ['todo', 'done'] }, [{ version: '0.2.0', steps: [{ op: 'drop', collection: 'issues', field: 'owner' }] }]),
];

describe('a schema change declares its migration', () => {
  test('refuses a field added, renamed or narrowed without its step, naming the field', () => {
    expect(publishedMigrationProblems(null, NEXT[0])).toEqual([]);
    expect(publishedMigrationProblems(BEFORE, NEXT[0]).map(problem => problem.message)).toEqual(['issues.due is new; add it with a step.']);
    expect(publishedMigrationProblems(BEFORE, NEXT[1])).toEqual([]);
    expect(publishedMigrationProblems(BEFORE, NEXT[2]).map(problem => problem.code)).toEqual(['migration_default_missing']);
    expect(publishedMigrationProblems(BEFORE, NEXT[3]).map(problem => problem.code)).toEqual(['migration_unexplained', 'migration_unexplained']);
    expect(publishedMigrationProblems(BEFORE, NEXT[4])).toEqual([]);
    expect(publishedMigrationProblems(BEFORE, NEXT[5]).map(problem => problem.code)).toEqual(['migration_value_removed']);
    // Steps for another version are not this version's.
    expect(publishedMigrationProblems(BEFORE, NEXT[8]).map(problem => problem.message)).toEqual(['issues.owner is gone; drop it or rename it with a step.']);
  });

  test('parses migrations in the manifest, and refuses a step the server would not read', () => {
    expect(validateManifest(NEXT[1]).ok).toBe(true);
    expect(validateManifest({ ...(NEXT[1] as object), migrations: [{ version: '0.3.0', steps: [{ op: 'merge', collection: 'issues' }] }] }).ok).toBe(false);
  });

  test.skipIf(!existsSync(serverMigrations))('says what Brydio’s migrations.ts says, for every pair', async () => {
    const server = await import(serverMigrations);

    for (const next of NEXT) {
      expect(publishedMigrationProblems(BEFORE, next)).toEqual(server.publishedMigrationProblems(BEFORE, next));
    }

    const steps = [{ op: 'replace', collection: 'issues', field: 'status', from: 'done', to: 'nope' }] as const;

    expect(migrationProblems(BEFORE, NEXT[5], steps)).toEqual(server.migrationProblems(BEFORE, NEXT[5], steps));
  });
});

describe('collection grants', () => {
  test('refuses a collection the app keeps but does not ask for, at grants.collections', () => {
    const manifest = { ...v('0.2.0', { title: 'string' }), grants: { tools: ['*'], collections: ['labels'] } };

    expect(validateManifest(manifest).problems).toEqual([
      { code: 'grant_collection_missing', message: 'issues is kept but not asked for: add it to grants.collections.', path: 'grants.collections' },
    ]);
    expect(validateManifest({ ...manifest, grants: { collections: ['issues'] } }).ok).toBe(true);
  });
});

describe('host grants', () => {
  test('refuses one Brydio does not grant, by name', () => {
    expect(unknownHostGrant(ISSUES_MANIFEST)).toBeNull();
    expect(unknownHostGrant({ grants: { host: ['navigate', 'camera'] } })).toEqual({
      code: 'grant_unknown',
      message: 'app.json asks for "camera", which Brydio does not grant. An app may ask for navigate and message.',
      path: 'grants.host',
    });
  });

  test.skipIf(!existsSync(serverDiff))('knows the grants Brydio’s diff-manifests.ts knows', async () => {
    expect([...KNOWN_HOST_GRANTS]).toEqual([...(await import(serverDiff)).KNOWN_HOST_GRANTS]);
  });
});

describe('the secret scan', () => {
  const files = (entries: Record<string, string>) => new Map(Object.entries(entries).map(([path, text]) => [path, bytes(text)]));
  const CASES = [
    files({ 'app.json': '{}', 'screens/board.js': 'const apiKey = "sk_live_123";' }),
    files({ 'servers.json': JSON.stringify({ github: { headers: [{ name: 'Authorization', value: 'Bearer abc123' }] } }) }),
    files({ 'servers.json': JSON.stringify({ github: { headers: [{ name: 'Authorization', value: '${user_config.token}' }] } }) }),
    files({ 'integrations/jira.json': JSON.stringify({ auth: { clientSecret: 'shh', token: '<your token>' } }) }),
    files({ 'integrations/jira.json': '{ not json' }),
  ];

  test('finds a declared value and never quotes it', () => {
    expect(CASES.map(one => findSecrets(one).map(found => found.path))).toEqual([[], ['servers.json.github.headers[0].value'], [], ['integrations/jira.json.auth.clientSecret'], []]);
    expect(JSON.stringify(findSecrets(CASES[1]!))).not.toContain('abc123');
  });

  test.skipIf(!existsSync(serverSecrets))('finds what Brydio’s secret-scan.ts finds, in its words', async () => {
    const server = await import(serverSecrets);
    const codes = await import(serverCodes);
    const buffers = (one: Map<string, Uint8Array>) => new Map([...one].map(([path, raw]) => [path, Buffer.from(raw)]));

    for (const one of CASES) {
      expect(findSecrets(one).map(found => found.path)).toEqual(server.findSecrets(buffers(one)).map((found: { path: string }) => found.path));
    }

    expect(SECRET_MESSAGE).toBe(codes.problem('brydio_secret_in_package', 'x').message);
  });
});
