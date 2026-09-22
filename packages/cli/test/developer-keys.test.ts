import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { DEVELOPER_KEY_MESSAGE, developerKeyIn } from '@brydio/manifest';
import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';
import { checkSource } from '../src/source-checks.ts';
import { validate, type Problem } from '../src/index.ts';

/**
 * A developer API key never goes in an app (ADR-A22, ADR-A24, G23):
 * `brydio validate` refuses a `bry_live_` key anywhere in the manifest, a
 * source or the built bundle, and a screen or handler that imports the key's
 * client, `@brydio/api/ai`. The publish route refuses the same key in the
 * same words.
 */

/** Made here so no real key is ever in this repository. The shape is all that matters. */
const KEY = `bry_live_${'0123456789ab'}_${'x'.repeat(43)}`;

const made: string[] = [];

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-devkeys-'));

  made.push(root);

  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return root;
}

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

const MANIFEST = JSON.stringify({
  name: 'notes',
  version: '1.0.0',
  data: { notes: { schema: { title: 'string' }, label: 'note' } },
  screens: { board: { entry: 'screens/board.js' } },
  grants: { tools: ['*'], collections: ['*'] },
});

const built = (extra: Record<string, string> = {}, manifest = MANIFEST) =>
  app({ '.brydio/app.json': manifest, 'dist/app.json': manifest, 'dist/screens/board.js': 'export {};', ...extra });

const keyProblems = (problems: Problem[]) =>
  problems.filter(problem => problem.code === 'developer_key_in_bundle').map(problem => problem.file);

describe('a developer API key in an app', () => {
  test('is refused in the built bundle, scripts included, and never quoted', () => {
    const { problems } = validate(built({ 'dist/screens/board.js': `const key = "${KEY}"; export {};` }));

    expect(keyProblems(problems)).toEqual(['dist/screens/board.js']);
    expect(problems.find(problem => problem.code === 'developer_key_in_bundle')?.message).toBe(DEVELOPER_KEY_MESSAGE);
    expect(JSON.stringify(problems)).not.toContain(KEY);
  });

  test('is refused in a source before it is built, and in the manifest', () => {
    const inSource = validate(built({ 'src/handlers/summarise.ts': `export default () => "${KEY}";` }));

    expect(keyProblems(inSource.problems)).toEqual(['src/handlers/summarise.ts']);

    const withKey = JSON.stringify({ ...JSON.parse(MANIFEST), description: `uses ${KEY}` });

    expect(keyProblems(validate(built({}, withKey)).problems)).toEqual(expect.arrayContaining(['.brydio/app.json']));
  });

  test('leaves an app that only names the environment variable alone', () => {
    const { problems } = validate(built({ 'dist/screens/board.js': 'const name = "BRYDIO_API_KEY"; // bry_live_… goes on your server\nexport {};' }));

    expect(keyProblems(problems)).toEqual([]);
  });

  test('finds it by its exact shape only', () => {
    const bytes = (text: string) => new Map([['a.js', new TextEncoder().encode(text)]]);

    expect(developerKeyIn(bytes(KEY))).toBe('a.js');
    expect(developerKeyIn(bytes(KEY.slice(0, -1)))).toBeNull();
    expect(developerKeyIn(bytes('bry_live_0123456789ab'))).toBeNull();
  });
});

describe('the AI client in an app', () => {
  test('is an import a screen or handler may not make', () => {
    const problems = checkSource('src/handlers/summarise.ts', "import { ai } from '@brydio/api/ai';\nexport default ai;");

    expect(problems.map(problem => problem.code)).toEqual(['import_not_allowed']);
    expect(problems[0]!.message).toContain('model grant');
  });

  test('leaves @brydio/api itself alone', () => {
    expect(checkSource('src/screens/board.ts', "import { api } from '@brydio/api';\nexport default api;")).toEqual([]);
  });
});

test('says what Brydio’s publish route says, word for word', async () => {
  const SERVICE = 'apps/api/src/apps/publishing/app-publish.service.ts';
  const server = await brydioAnswers('developer-key-scan', [SERVICE], () => {
    const source = readFileSync(inBrydio(SERVICE), 'utf8');
    const said = /DEVELOPER_KEY_IN_BUNDLE =\s*'([^']*)'/.exec(source);

    return { code: source.includes("'developer_key_in_bundle'") ? 'developer_key_in_bundle' : null, message: said?.[1] ?? null };
  });

  expect(server).toEqual({ code: 'developer_key_in_bundle', message: DEVELOPER_KEY_MESSAGE });
});
