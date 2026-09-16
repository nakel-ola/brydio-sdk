import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { callsOf, main, validate, type Problem } from '../src/index.ts';

/**
 * The publish checklist's checks that `brydio validate` gained for A8-F04-S03:
 * a schema change's migration, what the screens call against the grants, the
 * host grants Brydio knows, and the secret scan.
 */

const made: string[] = [];

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-checklist-'));

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

const issues = (version: string, schema: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: 'issues',
    version,
    data: { issues: { schema, label: 'issue' }, labels: { schema: { name: 'string' }, label: 'label' } },
    screens: { board: { entry: 'screens/board.js' } },
    grants: { tools: ['*'], collections: ['*'] },
    ...extra,
  });

const V020 = issues('0.2.0', { title: 'string', status: ['todo', 'done'] });
const V030 = issues('0.3.0', { title: 'string', status: ['todo', 'done'], due: 'date?' });
const STEP = { migrations: [{ version: '0.3.0', steps: [{ op: 'add', collection: 'issues', field: 'due' }] }] };

/** Just the manifest and a built screen, so only the checks under test speak. */
const built = (manifest: string, extra: Record<string, string> = {}) =>
  app({ '.brydio/app.json': manifest, 'dist/app.json': manifest, 'dist/screens/board.js': 'export {};', ...extra });

const found = (problems: Problem[]) => problems.map(problem => [problem.code, problem.message]);
const codes = (problems: Problem[]) => problems.map(problem => problem.code);

describe('a version that changes a collection declares its migration', () => {
  const DUE = 'issues.due is new; add it with a step. (0.3.0 against 0.2.0, the version before it.)';

  test('against --previous, in the publish route’s words, and passes once the step is there', () => {
    const root = built(V030, { 'published/app.json': V020 });

    expect(found(validate(root, { previous: 'published/app.json' }).problems)).toEqual([['migration_missing', DUE]]);
    expect(validate(root, { previous: 'published/app.json' }).problems[0]).toMatchObject({ severity: 'error', path: 'migrations' });
    // A folder holding the published bundle works as well as its app.json.
    expect(codes(validate(root, { previous: 'published' }).problems)).toEqual(['migration_missing']);

    const fixed = built(issues('0.3.0', { title: 'string', status: ['todo', 'done'], due: 'date?' }, STEP), { 'published/app.json': V020 });

    expect(validate(fixed, { previous: 'published/app.json' }).problems).toEqual([]);
  });

  test('one item for each change, naming each field', () => {
    const root = built(issues('0.3.0', { title: 'number', status: ['todo'], due: 'date' }), { 'before.json': V020 });

    expect(found(validate(root, { previous: 'before.json' }).problems)).toEqual([
      ['migration_missing', 'issues.due is new; add it with a step and a default. (0.3.0 against 0.2.0, the version before it.)'],
      ['migration_missing', 'issues.status no longer allows "done"; say which value replaces each. (0.3.0 against 0.2.0, the version before it.)'],
      ['migration_missing', 'issues.title changed type; drop `title` and add it again under a new name. (0.3.0 against 0.2.0, the version before it.)'],
    ]);
  });

  test('against a dist/ built from an earlier version, when no --previous is given', () => {
    const root = app({ '.brydio/app.json': V030, 'dist/app.json': V020, 'dist/screens/board.js': 'export {};' });

    expect(codes(validate(root).problems)).toEqual(['migration_missing', 'bundle_stale']);
    // A dist/ built from this version has nothing to say about the one before.
    expect(validate(built(V030)).problems).toEqual([]);
  });

  test('refuses a --previous that is missing, unreadable or not older', () => {
    const root = built(V030, { 'broken.json': '{', 'same.json': V030 });

    expect(codes(validate(root, { previous: 'nowhere.json' }).problems)).toEqual(['previous_unreadable']);
    expect(codes(validate(root, { previous: 'broken.json' }).problems)).toEqual(['previous_unreadable']);
    expect(found(validate(root, { previous: 'same.json' }).problems)).toEqual([
      ['previous_not_older', "same.json is version 0.3.0, not one before 0.3.0, so it can't say what this version changes."],
    ]);
  });

  test('from the command line, with --previous', async () => {
    const root = built(V030, { 'published/app.json': V020 });
    const lines: string[] = [];

    expect(await main(['validate', root, '--previous', join(root, 'published/app.json')], line => lines.push(line))).toBe(1);
    expect(lines.join('\n')).toContain(`${DUE} [migration_missing]`);
  });
});

describe('what the screens call, against the grants', () => {
  const screen = (source: string, grants: Record<string, unknown> = { tools: ['*'], collections: ['*'] }) =>
    validate(
      built(issues('0.2.0', { title: 'string', status: ['todo', 'done'] }, { grants }), { 'src/screens/board.tsx': source }),
    ).problems;

  test('finds tools, collections and navigate, written out, through @brydio/app and the bridge', () => {
    const source = [
      "import { data, navigate, tools as t } from '@brydio/app';",
      "import { useBridge, useList } from '@brydio/app/preact';",
      "t.call('list_issues');",
      "t.result(done ? 'update_issue' : 'create_issue', {});",
      "t.call(name);",
      "data.get('issues', id);",
      "useList('labels');",
      "useBridge().callTool('delete_issue');",
      "navigate({ chat: 'x' });",
      "router.navigate('/');",
      "const tools = { call: (x: string) => x }; tools.call('mine');",
    ].join('\n');

    expect(callsOf('a.tsx', source).map(call => [call.kind, call.name, call.line, call.sure, call.verb])).toEqual([
      ['tool', 'list_issues', 3, true, undefined],
      ['tool', 'update_issue', 4, true, undefined],
      ['tool', 'create_issue', 4, true, undefined],
      ['collection', 'issues', 6, true, 'get'],
      ['collection', 'labels', 7, true, 'list'],
      ['tool', 'delete_issue', 8, true, undefined],
      ['host', 'navigate', 9, true, undefined],
      ['host', 'navigate', 10, false, undefined],
    ]);
  });

  test('refuses a tool the app does not have, and one it does not ask for', () => {
    const source = "import { tools } from '@brydio/app';\ntools.call('list_issues');\ntools.call('list_tickets');\ntools.call('create_label');";

    expect(found(screen(source, { tools: ['issues'], collections: ['*'] }))).toEqual([
      ['tool_unknown', `"list_tickets" is not one of this app's tools. Its tools are create_issue, update_issue, get_issue, list_issues, search_issues, delete_issue, create_label, update_label, get_label, list_labels, search_labels, delete_label.`],
      ['grant_tool_missing', '"create_label" is called here but not asked for: add it, or its collection labels, to grants.tools.'],
    ]);
    expect(screen(source, { tools: ['list_issues', 'labels'], collections: ['*'] }).filter(one => one.code !== 'tool_unknown')).toEqual([]);
    expect(screen(source, { tools: ['*'], collections: ['*'] })[0]).toMatchObject({ code: 'tool_unknown', file: 'src/screens/board.tsx', line: 3, column: 12 });
  });

  test('refuses a collection the app does not keep, and a read whose tool is not asked for', () => {
    const source = "import { data } from '@brydio/app';\ndata.list('tickets');\ndata.get('labels', id);";

    expect(found(screen(source, { tools: ['list_labels'], collections: ['*'] }))).toEqual([
      ['collection_unknown', `"tickets" is not one of this app's collections. It keeps issues, labels.`],
      ['grant_tool_missing', '"get_label" is called here but not asked for: add it, or its collection labels, to grants.tools.'],
    ]);
  });

  test('refuses navigate without its grant, but not a method that only shares the name', () => {
    expect(found(screen("import { navigate } from '@brydio/app';\nnavigate({ chat: 'c' });"))).toEqual([
      ['grant_host_missing', 'navigate is called here but not asked for: add "navigate" to grants.host.'],
    ]);
    expect(screen('router.navigate("/");')).toEqual([]);
  });

  test('warns about a grant that names nothing, or that no screen uses, and still passes', () => {
    const root = built(issues('0.2.0', { title: 'string' }, { grants: { tools: ['issues', 'list_tickets'], collections: ['issues', 'labels', 'tickets'], host: ['navigate', 'message'] } }), {
      'src/screens/board.tsx': "const go = () => router.navigate('/');",
    });
    const result = validate(root);

    expect(result.ok).toBe(true);
    expect(result.problems.map(problem => [problem.code, problem.severity, problem.path, problem.message])).toEqual([
      ['grant_tool_unknown', 'warning', 'grants.tools.1', 'grants.tools asks for "list_tickets", which is neither one of this app\'s tools nor one of its collections.'],
      ['grant_collection_unknown', 'warning', 'grants.collections.2', 'grants.collections asks for "tickets", which this app does not keep.'],
      ['grant_host_unused', 'warning', 'grants.host.1', 'grants.host asks for "message", which no screen uses. Ask only for what the app does.'],
    ]);
  });
});

describe('what the publish route refuses, found first', () => {
  test('a host grant Brydio does not know, in its words', () => {
    const root = built(issues('0.2.0', { title: 'string' }, { grants: { tools: ['*'], collections: ['*'], host: ['camera'] } }));

    expect(found(validate(root).problems)).toEqual([
      ['grant_unknown', 'app.json asks for "camera", which Brydio does not grant. An app may ask for navigate and message.'],
    ]);
  });

  test('a secret declared in the bundle, without quoting it', () => {
    const root = built(V020, { 'dist/servers.json': JSON.stringify({ github: { headers: [{ name: 'Authorization', value: 'Bearer abc123' }] } }) });
    const { problems } = validate(root);

    expect(codes(problems)).toEqual(['bundle_file_not_code', 'secret_in_bundle']);
    expect(problems[1]).toMatchObject({ file: 'dist/servers.json', path: 'servers.json.github.headers[0].value' });
    expect(JSON.stringify(problems)).not.toContain('abc123');
  });

  test('a screen whose entry is not in the bundle, in the version record’s words', () => {
    const manifest = issues('0.2.0', { title: 'string' }, { screens: { board: { entry: 'screens/board.js' }, issue: { entry: 'screens/issue.js' } } });

    expect(found(validate(built(manifest)).problems)).toEqual([
      ['screen_not_built', 'The "issue" screen names "screens/issue.js", which is not a script in this bundle. Run brydio build.'],
    ]);
  });
});

const brydioIssues = join(import.meta.dir, '..', '..', '..', '..', 'brydio-issues');

describe('Brydio’s own apps', () => {
  test.skipIf(!existsSync(join(brydioIssues, 'dist', 'app.json')))('Issues passes the checklist with no errors', () => {
    const result = validate(brydioIssues);

    expect(result.problems.filter(problem => problem.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
