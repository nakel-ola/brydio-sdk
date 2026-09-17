import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { build } from '../src/index.ts';

/**
 * A custom tool's handler is built like a screen (`tasks/apps` A3-F08, A8-F02).
 *
 * A manifest may name `handlers/list_prs.js`, and Brydio runs that file on its
 * own side to answer the tool. Until it was built, an app with a custom tool
 * could be written and not built: the handler never reached `dist/`, and
 * publish refused the manifest for naming a file the bundle lacked.
 */

const made: string[] = [];

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-handlers-'));

  made.push(root);

  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return root;
}

const SCREEN = 'export default function () {}\n';

const manifest = (custom: unknown[]) =>
  JSON.stringify({
    name: 'prs',
    version: '1.0.0',
    screens: { home: { entry: 'screens/home.js' } },
    grants: { tools: ['*'], collections: [], host: [] },
    tools: { generated: false, custom },
  });

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

const LIST_PRS = { name: 'list_prs', description: 'Open pull requests.', handler: 'handlers/list_prs.js' };

describe('a custom tool’s handler in the bundle', () => {
  test('is built from src/ into dist/, and counts in the fingerprint like any other file', async () => {
    const root = app({
      '.brydio/app.json': manifest([LIST_PRS]),
      'src/screens/home.tsx': SCREEN,
      'src/handlers/list_prs.ts': 'export default async function (input: { repository: string }) {\n  return { rows: [input.repository] };\n}\n',
    });
    const result = await build(root);

    expect(result.problems).toEqual([]);
    expect([...result.files.keys()].sort()).toEqual(['app.json', 'handlers/list_prs.js', 'screens/home.js']);

    const code = new TextDecoder().decode(result.files.get('handlers/list_prs.js')!);

    // One whole module: nothing left to import where it runs.
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).toContain('rows');
  });

  test('says which tool has no source, by the name a builder would look for', async () => {
    const result = await build(app({ '.brydio/app.json': manifest([LIST_PRS]), 'src/screens/home.tsx': SCREEN }));

    expect(result.problems.map((problem) => problem.code)).toContain('handler_source_missing');
    expect(result.problems.find((problem) => problem.code === 'handler_source_missing')?.message).toContain('src/handlers/list_prs.ts');
  });

  test('is read by the source checks like any other file, and builds nothing when it does not parse', async () => {
    const result = await build(
      app({
        '.brydio/app.json': manifest([LIST_PRS]),
        'src/screens/home.tsx': SCREEN,
        'src/handlers/list_prs.ts': 'export default function ( {\n',
      }),
    );

    // `source_syntax`, not `handler_build_failed`: the checks read the file
    // before the build reaches it, and say where the syntax goes wrong rather
    // than what the bundler made of it. Either way nothing is built.
    expect(result.problems.map((problem) => problem.code)).toContain('source_syntax');
    expect(result.files.has('handlers/list_prs.js')).toBe(false);
  });

  test('refuses a handler that brings in anything that is not code', async () => {
    const result = await build(
      app({
        '.brydio/app.json': manifest([LIST_PRS]),
        'src/screens/home.tsx': SCREEN,
        'src/handlers/list_prs.ts': 'import "./rules.css";\nexport default function () {}\n',
        'src/handlers/rules.css': '.a { color: red }\n',
      }),
    );

    expect(result.problems.map((problem) => problem.code)).toContain('bundle_file_not_code');
  });
});
