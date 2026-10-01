import { describe, expect, test } from 'bun:test';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';

import { CONFIRM_LIMITS, appManifestSchema, dataProblems } from '../src/index.ts';

/** A public form's confirmation email, as a manifest declares it (FO04). */

const SERVER_SCHEMA = 'apps/api/src/apps/manifest/manifest-ext.schema.ts';
const SERVER_CONFIRM = 'apps/api/src/apps/manifest/confirm-email.ts';

const form = (confirmEmail: unknown, more: Record<string, unknown> = {}) => ({
  name: 'forms',
  version: '1.0.0',
  placements: [{ kind: 'public-page', key: 'answer', screen: 'answer' }],
  data: {
    responses: {
      schema: { answer: 'string', email: 'string?', reviewer: 'member?', count: 'number?' },
      publicSubmit: true,
      confirmEmail,
      ...more,
    },
  },
  screens: { answer: { entry: 'screens/answer.js' } },
  grants: { tools: ['*'], collections: ['*'] },
});

/** Each declares its schema well; their problems are claims across fields. */
const CASES = [
  form({ field: 'email', subject: 'We got it', message: 'Thanks.\n\nBye.', link: true }),
  form({ field: 'email' }, { publicSubmit: false }),
  form({ field: 'nope' }),
  form({ field: 'reviewer' }),
  form({ field: 'count' }),
  form({ field: 'answer' }),
  form({ field: 'email', message: 'See https://evil.test' }),
  form({ field: 'email', subject: 'Go to www.evil.test' }),
  form({ field: 'email', message: '<b>hi</b>' }),
  form({ field: 'email', message: 'mailto:a@b.test' }),
];

/** This feature's problems only: other codes' words are held to the server by their own tests. */
const confirmOnly = (problems: { code: string }[]) => problems.filter(one => one.code.startsWith('data_confirm_'));

const codesOf = (problems: (additions: never) => { code: string }[]) =>
  CASES.map(one => problems(one as never).map(problem => problem.code));

describe('confirmEmail on a collection (FO04)', () => {
  test('a publicSubmit collection names a string field and short plain text', () => {
    expect(appManifestSchema.safeParse(CASES[0]).success).toBe(true);
    expect(dataProblems(CASES[0] as never)).toEqual([]);
  });

  test('needs publicSubmit, a string field, and plain text', () => {
    const codes = codesOf(dataProblems as never);

    expect(codes[1]).toContain('data_confirm_submit');
    for (const one of [codes[2], codes[3], codes[4]]) expect(one).toContain('data_confirm_field');
    expect(codes[5]).toEqual([]);
    for (const one of [codes[6], codes[7], codes[8], codes[9]]) expect(one).toContain('data_confirm_text');
  });

  test('refuses unknown keys and over-long text', () => {
    expect(appManifestSchema.safeParse(form({ field: 'email', html: '<p>x</p>' })).success).toBe(false);
    expect(appManifestSchema.safeParse(form({ field: 'email', subject: 'x'.repeat(121) })).success).toBe(false);
    expect(appManifestSchema.safeParse(form({ field: 'email', message: 'x'.repeat(601) })).success).toBe(false);
    expect(CONFIRM_LIMITS).toEqual({ subjectChars: 120, messageChars: 600 });
  });

  test('finds exactly the problems the server does, in its words', async () => {
    const server = await brydioAnswers('confirm-email-problems', [SERVER_SCHEMA, SERVER_CONFIRM], async () => {
      const theirs = await import(inBrydio(SERVER_SCHEMA));

      return CASES.map(one => confirmOnly(theirs.dataProblems(one)));
    });

    expect(JSON.parse(JSON.stringify(CASES.map(one => confirmOnly(dataProblems(one as never)))))).toEqual(server);
  });
});
