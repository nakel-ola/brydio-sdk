import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';
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

  test('refuses names asked without their grants, from the Preact hooks and the bridge alike', () => {
    expect(found(screen("import { useMembers, useProjects } from '@brydio/app/preact';\nconst people = useMembers(ids);\nconst places = useProjects(ids);"))).toEqual([
      ['grant_host_missing', 'members is called here but not asked for: add "members" to grants.host.'],
      ['grant_host_missing', 'projects is called here but not asked for: add "projects" to grants.host.'],
    ]);
    expect(screen("import { useMembers } from '@brydio/app/preact';\nuseMembers(ids);", { tools: ['*'], collections: ['*'], host: ['members'] })).toEqual([]);
  });

  test('knows an app’s own custom tools, which it once called unknown in its own manifest', () => {
    // A custom tool (A3-F08) is one of the app's tools. Leaving them out made
    // `validate` refuse the screen that called one and warn that granting it
    // was meaningless — on every app that has one, which is every app with a
    // handler (Wren's finding, 18 Sep).
    const LIST_PRS = { name: 'list_prs', description: 'Open pull requests.', handler: 'handlers/list_prs.js' };
    const CLOSE = { name: 'close_issue', description: 'Close one.', handler: 'handlers/close_issue.js', collection: 'issues', write: true };
    const withCustom = (custom: unknown[], grants: Record<string, unknown>, source: string) =>
      validate(
        built(issues('0.2.0', { title: 'string' }, { grants, tools: { generated: true, custom } }), {
          'src/screens/board.tsx': source,
          // The handlers as a built bundle holds them: the manifest names them,
          // so validate reads the bundle for them.
          'dist/handlers/list_prs.js': 'export {};',
          'dist/handlers/close_issue.js': 'export {};',
        }),
      ).problems;
    const calls = (tool: string) => `import { tools } from '@brydio/app';\ntools.call('${tool}');`;

    // Called and granted by its own name: nothing to say.
    expect(withCustom([LIST_PRS], { tools: ['list_prs'], collections: ['*'] }, calls('list_prs'))).toEqual([]);

    // Called and not granted: refused, and told to add it by its own name. The
    // manifest check speaks first here; the call check says the same thing for
    // an app whose manifest is granted by `*`.
    expect(withCustom([LIST_PRS], { tools: [], collections: ['*'] }, calls('list_prs')).map(one => [one.code, one.message])).toEqual([
      ['grant_tool_missing', 'app.json: "grants.tools": list_prs is a custom tool but not asked for: add it to grants.tools.'],
    ]);

    // A custom tool is granted by its own name or `*`, never by its collection,
    // even when it names one — the host's rule in both halves (`allowsTool`,
    // `customToolProblems`). Granting only the collection is not enough.
    expect(withCustom([CLOSE], { tools: ['issues'], collections: ['*'] }, calls('close_issue')).map(one => one.code)).toContain('grant_tool_missing');
    expect(withCustom([CLOSE], { tools: ['close_issue'], collections: ['*'] }, calls('close_issue'))).toEqual([]);
    // Granted by name, but its collection is not open to the app: still refused.
    expect(withCustom([CLOSE], { tools: ['close_issue'], collections: [] }, calls('close_issue')).map(one => one.code)).toContain('grant_collection_missing');

    // And granting one is not a grant that names nothing.
    expect(withCustom([LIST_PRS], { tools: ['list_prs'], collections: ['*'] }, 'const a = 1;').map(one => one.code)).not.toContain('grant_tool_unknown');

    // A tool the app really doesn't have is still unknown, and says what it has.
    expect(withCustom([LIST_PRS], { tools: ['*'], collections: ['*'] }, calls('list_tickets')).map(one => one.message)).toContainEqual(
      expect.stringContaining('"list_tickets" is not one of this app\'s tools.'),
    );
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
      ['grant_unknown', 'app.json asks for "camera", which Brydio does not grant. An app may ask for navigate, message, members, projects or connection:<name>.'],
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

describe('a manifest refused in the publish route’s words (A8-F04-S03)', () => {

  test('names the check and the field, behind app.json', () => {
    const kept = built(issues('0.2.0', { title: 'string' }, { grants: { tools: ['*'], collections: ['labels'] } }));

    expect(found(validate(kept).problems)).toContainEqual([
      'grant_collection_missing',
      'app.json: "grants.collections": issues is kept but not asked for: add it to grants.collections.',
    ]);

    const nowhere = built(JSON.stringify({ ...JSON.parse(V020), placements: [{ kind: 'project-tab', screen: 'nowhere' }] }));

    expect(found(validate(nowhere).problems)).toContainEqual([
      'placement_screen_unknown',
      'app.json: A project-tab placement opens "nowhere", which is not one of the app\'s screens.',
    ]);
  });

  test('says a manifest that is not JSON the route’s way, with where the parser stopped after', () => {
    const [problem] = validate(app({ '.brydio/app.json': '{ "name": ' })).problems;

    expect(problem).toMatchObject({ code: 'manifest_not_json', message: 'app.json is not valid JSON.' });
    expect(problem!.hint).toBeString();
  });

  test('finds a secret in the manifest itself, as the route does, without quoting it', () => {
    const root = built(issues('0.2.0', { title: 'string' }, { settings: { apiKey: 'sk_live_abc123' } }));
    const secrets = validate(root).problems.filter(problem => problem.code === 'secret_in_bundle');

    expect(secrets).toEqual([expect.objectContaining({ file: '.brydio/app.json', path: 'app.json.settings.apiKey' })]);
    expect(JSON.stringify(secrets)).not.toContain('abc123');
  });

  test('matches the route’s own templates, read from its source', async () => {
    const PUBLISH = 'apps/api/src/apps/publishing/app-publish.service.ts';
    const VERSIONS = 'apps/api/src/apps/versions/app-version.service.ts';
    const templates = {
      // A manifest refusal: the check's own code, then `app.json: "<path>": <sentence>`.
      [PUBLISH]: [
        "typeof named === 'string' ? named : 'manifest_invalid'",
        '`${BUNDLE_MANIFEST}: "${at}": ${issue!.message}`',
        '`${BUNDLE_MANIFEST}: ${issue?.message}`',
        "`${BUNDLE_MANIFEST} is not valid JSON.`",
        'secretsInJson(manifest, BUNDLE_MANIFEST)',
        '(${version} against ${below!.version}, the version before it.)',
      ],
      [VERSIONS]: ["'which is not a script in this bundle. Run brydio build.'"],
    };
    const found = await brydioAnswers('publish-route-templates', [PUBLISH, VERSIONS], () =>
      Object.fromEntries(Object.entries(templates).map(([file, wanted]) => [file, wanted.filter(text => readFileSync(inBrydio(file), 'utf8').includes(text))])),
    );

    expect(found).toEqual(templates);
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
