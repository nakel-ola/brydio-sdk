import { describe, expect, test } from 'bun:test';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';

import { ANONYMOUS_LIMITS, appManifestSchema, collectionsOf, dataProblems, publishedMigrationProblems } from '../src/index.ts';

/** An anonymous collection, as a manifest declares it (P13). */

const SERVER_SCHEMA = 'apps/api/src/apps/manifest/manifest-ext.schema.ts';
const SERVER_ANONYMOUS = 'apps/api/src/apps/manifest/anonymous.ts';
const SERVER_MIGRATIONS = 'apps/api/src/apps/manifest/migrations.ts';

const survey = (anonymous: unknown, schema: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({
  name: 'survey',
  version: '1.0.0',
  data: {
    answers: {
      schema: { round: 'number', title: 'string?', mood: ['good', 'bad'], comment: 'text?', ...schema },
      anonymous,
      ...more,
    },
  },
  grants: { tools: ['*'], collections: ['*'] },
});

/** Each declares its schema well; their problems are claims across fields. */
const CASES = [
  survey({ group: 'round' }),
  survey({ group: 'mood', minimum: 12 }),
  survey({ group: 'nope' }),
  survey({ group: 'title' }),
  survey({ group: 'comment' }),
  survey({ group: 'who' }, { who: 'member' }),
  survey({ group: 'round' }, { owner: 'member?' }),
  survey({ group: 'round' }, { notes: { type: 'text?', coedit: true } }),
  survey({ group: 'round' }, { board: 'canvas' }),
  survey({ group: 'round', minimum: 4 }),
];

const PAIRS = [
  [survey(undefined), survey({ group: 'round' })],
  [survey({ group: 'round' }), survey(undefined)],
  [survey({ group: 'round' }), survey({ group: 'mood' })],
  [survey({ group: 'round' }), survey({ group: 'round', minimum: 10 })],
  [{ name: 'survey', version: '0.9.0', data: {} }, survey({ group: 'round' })],
].map(([from, to]) => [from, { ...(to as object), version: '1.1.0' }] as const);

const anonymousOnly = (problems: { code: string }[]) => problems.filter(one => one.code.startsWith('data_anonymous_'));

describe('anonymous on a collection (P13)', () => {
  test('groups by a structured field, five answers at least unless it says more', () => {
    expect(appManifestSchema.safeParse(CASES[0]).success).toBe(true);
    expect(dataProblems(CASES[0] as never)).toEqual([]);
    expect(collectionsOf(CASES[0] as never)[0]!.anonymous).toEqual({ group: 'round', minimum: 5 });
    expect(collectionsOf(CASES[1] as never)[0]!.anonymous).toEqual({ group: 'mood', minimum: 12 });
    expect(collectionsOf(survey(undefined) as never)[0]).not.toHaveProperty('anonymous');
    expect(ANONYMOUS_LIMITS).toEqual({ minimum: 5, maximum: 1000 });
  });

  test('refuses words or a member as the group, a member field, writing together, and under five', () => {
    const codes = CASES.map(one => anonymousOnly(dataProblems(one as never)).map(problem => problem.code));

    expect(codes).toEqual([
      [],
      [],
      ['data_anonymous_group'],
      ['data_anonymous_group'],
      ['data_anonymous_group'],
      ['data_anonymous_group', 'data_anonymous_member'],
      ['data_anonymous_member'],
      ['data_anonymous_coedit'],
      ['data_anonymous_coedit'],
      ['data_anonymous_minimum'],
    ]);
    expect(appManifestSchema.safeParse(survey({ group: 'round', minimum: 1001 })).success).toBe(false);
    expect(appManifestSchema.safeParse(survey({ group: 'round', who: 'x' })).success).toBe(false);
  });

  test('is never added to, taken from or regrouped on a kept collection', () => {
    expect(PAIRS.map(([from, to]) => publishedMigrationProblems(from, to).map(one => one.code))).toEqual([
      ['migration_anonymous_changed'],
      ['migration_anonymous_changed'],
      ['migration_anonymous_changed'],
      [],
      [],
    ]);
  });

  test('finds exactly the problems the server does, in its words', async () => {
    const server = await brydioAnswers('anonymous-problems', [SERVER_SCHEMA, SERVER_ANONYMOUS, SERVER_MIGRATIONS], async () => {
      const schema = await import(inBrydio(SERVER_SCHEMA));
      const migrations = await import(inBrydio(SERVER_MIGRATIONS));

      return {
        problems: CASES.map(one => anonymousOnly(schema.dataProblems(one))),
        specs: CASES.slice(0, 2).map(one => schema.collectionsOf(one)[0].anonymous),
        migrations: PAIRS.map(([from, to]) => migrations.publishedMigrationProblems(from, to)),
      };
    });

    expect(
      JSON.parse(
        JSON.stringify({
          problems: CASES.map(one => anonymousOnly(dataProblems(one as never))),
          specs: CASES.slice(0, 2).map(one => collectionsOf(one as never)[0]!.anonymous),
          migrations: PAIRS.map(([from, to]) => publishedMigrationProblems(from, to)),
        }),
      ),
    ).toEqual(server);
  });
});
