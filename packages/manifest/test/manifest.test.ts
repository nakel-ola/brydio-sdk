import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';

import {
  appManifestSchema,
  bundleHash,
  bundleProblem,
  collectionsOf,
  generatedToolsOf,
  parseFieldType,
  compareVersions,
  sdkRefusal,
  validateManifest,
  validateManifestText,
  type DocumentOf,
} from '../src/index.ts';
import { ISSUES_MANIFEST } from './issues-manifest.fixture.ts';

const examples = join(import.meta.dir, '..', 'examples');
const SERVER_SCHEMA = 'apps/api/src/apps/manifest/manifest-ext.schema.ts';
const SERVER_FIXTURE = 'apps/api/src/apps/manifest/issues-manifest.fixture.ts';
const SERVER_BUNDLE = 'apps/api/src/apps/bundles/bundle-files.ts';
const SERVER_SUPPORT = 'apps/api/src/apps/publishing/sdk-support.ts';
const SERVER_COMPARE = 'apps/api/src/apps/versions/compare-versions.ts';

/** A schema's answer, as plain data: accepted with what it read, or refused with its sentences. */
const reading = (result: { success: boolean; data?: unknown; error?: { issues: { message: string }[] } }) =>
  result.success ? { ok: true, data: result.data } : { ok: false, messages: result.error!.issues.map(issue => issue.message) };

const codesOf = (manifest: unknown) => validateManifest(manifest).problems.map(problem => problem.code);
const withData = (data: Record<string, unknown>) => ({ ...ISSUES_MANIFEST, data });
const bytes = (text: string) => new TextEncoder().encode(text);

/** Manifests on both sides of every rule, for comparing with the server's reading. */
const CORPUS: unknown[] = [
  ISSUES_MANIFEST,
  { name: 'acme-projects', version: '1.2.0' },
  { name: 'Acme', version: '1.2.0' },
  { name: 'acme', version: '1.2' },
  { ...ISSUES_MANIFEST, placements: [{ kind: 'project-tab', screen: 'nowhere' }] },
  { ...ISSUES_MANIFEST, placements: [{ kind: 'dock', screen: 'board' }] },
  { ...ISSUES_MANIFEST, screens: { board: { entry: '../board.js' } } },
  { ...ISSUES_MANIFEST, screens: { board: { entry: 'screens/board.mjs' } } },
  { ...ISSUES_MANIFEST, tools: { custom: [{ name: 'x' }] } },
  withData({ issues: { schema: { id: 'string' } } }),
  withData({ issues: { schema: { title: 'colour' } } }),
  withData({ issues: { schema: { status: [] } } }),
  withData({ issues: { schema: { a: 'project', b: 'project?' } } }),
  withData({ issues: { schema: { title: 'string', due: 'date' }, search: ['due', 'nope'] } }),
  withData({ issues: { schema: { a: 'string' }, label: 'thing' }, things: { schema: { b: 'string' } } }),
  withData({ Issues: { schema: { a: 'string' } } }),
  withData({ issues: { schema: { a: 'boolean?', b: 'token?', c: 'string[]?' }, index: ['a'] } }),
  { ...ISSUES_MANIFEST, sdk: '0.1.0-alpha.0' },
  { ...ISSUES_MANIFEST, sdk: 'latest' },
];

describe('the example manifests', () => {
  for (const file of readdirSync(examples).filter(name => name.endsWith('.json'))) {
    test(`${file} validates`, () => {
      const result = validateManifestText(readFileSync(join(examples, file), 'utf8'));

      expect(result.problems).toEqual([]);
      expect(result.ok).toBe(true);
    });
  }
});

describe('the Issues manifest', () => {
  test('parses whole, as the server’s fixture does', () => {
    const parsed = appManifestSchema.parse(ISSUES_MANIFEST);

    expect(parsed.name).toBe('issues');
    expect(parsed.data?.issues?.label).toBe('issue');
    expect(parsed.screens?.board?.entry).toBe('screens/board.js');
    expect(parsed.placements?.[0]).toEqual({ kind: 'project-tab', screen: 'board', label: 'Issues', icon: 'kanban' });
  });

  test('parses settings collected when an app is placed', () => {
    const parsed = appManifestSchema.parse({
      ...ISSUES_MANIFEST,
      placements: [{
        kind: 'workspace-sidebar',
        screen: 'board',
        settings: {
          siteUrl: { type: 'url', label: 'SharePoint site', required: true },
        },
      }],
    });

    expect(parsed.placements?.[0]?.settings?.siteUrl).toEqual({
      type: 'url',
      label: 'SharePoint site',
      required: true,
    });
  });

  test('reads its collections the way the store and the tools do', () => {
    const [issues, labels] = collectionsOf(ISSUES_MANIFEST);

    expect(issues).toMatchObject({
      name: 'issues',
      label: 'issue',
      plural: 'issues',
      structured: ['status', 'assignee', 'project'],
      sortable: ['status', 'assignee', 'project'],
      projectField: 'project',
    });
    expect(labels).toMatchObject({ name: 'labels', label: 'label', plural: 'labels', structured: ['colour'] });
  });

  test('generates the tools §6 names', () => {
    expect(generatedToolsOf(ISSUES_MANIFEST).map(tool => tool.name)).toEqual([
      'create_issue',
      'update_issue',
      'get_issue',
      'list_issues',
      'search_issues',
      'delete_issue',
      'create_label',
      'update_label',
      'get_label',
      'list_labels',
      'search_labels',
      'delete_label',
    ]);
    expect(generatedToolsOf({ ...ISSUES_MANIFEST, tools: { generated: false } })).toEqual([]);
  });

  test('is the server’s fixture, field for field', async () => {
    const server = await brydioAnswers('issues-manifest-fixture', [SERVER_FIXTURE], async () => (await import(inBrydio(SERVER_FIXTURE))).ISSUES_MANIFEST);

    expect(ISSUES_MANIFEST).toEqual(server);
  });
});

describe('validateManifest', () => {
  test('names each problem with the server’s code', () => {
    expect(codesOf(CORPUS[4])).toEqual(['placement_screen_unknown']);
    expect(codesOf(withData({ issues: { schema: { id: 'string' } } }))).toEqual(['data_field_reserved']);
    expect(codesOf(withData({ issues: { schema: { title: 'colour' } } }))).toEqual(['data_field_type_unknown']);
    expect(codesOf(withData({ issues: { schema: { status: [] } } }))).toEqual(['data_enum_empty']);
    expect(codesOf(withData({ issues: { schema: { a: 'project', b: 'project?' } } }))).toEqual(['data_project_field_twice']);
    expect(codesOf(CORPUS[13])).toEqual(['data_search_not_text', 'data_search_unknown_field']);
    expect(codesOf(CORPUS[14])).toEqual(['data_label_taken']);
    expect(codesOf(CORPUS[15])).toEqual(['data_collection_name_format', 'data_label_format']);
  });

  test('calls a field of the wrong shape manifest_invalid, with its path', () => {
    const result = validateManifest(CORPUS[6]);

    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatchObject({ code: 'manifest_invalid', path: 'screens.board.entry' });
    // A custom tool with no description and no handler: both refused (A3-F08-S01).
    expect(codesOf(CORPUS[8])).toEqual(['manifest_invalid', 'manifest_invalid']);
  });

  test('takes an .mjs entry as it takes a .js one, and nothing else', () => {
    expect(validateManifest(CORPUS[7]).ok).toBe(true);
    expect(codesOf({ ...ISSUES_MANIFEST, screens: { board: { entry: 'screens/board.ts' } } })).toEqual(['manifest_invalid']);
  });

  test('keeps the sdk brydio build wrote, and refuses one that is not a version', () => {
    expect(validateManifest({ ...ISSUES_MANIFEST, sdk: '0.1.0-alpha.0' }).manifest?.sdk).toBe('0.1.0-alpha.0');
    expect(validateManifest(ISSUES_MANIFEST).ok).toBe(true);
    expect(validateManifest({ ...ISSUES_MANIFEST, sdk: 'latest' }).problems.map(problem => [problem.code, problem.path])).toEqual([['manifest_invalid', 'sdk']]);
  });

  test('says when the text is not JSON', () => {
    expect(validateManifestText('{').problems[0]?.code).toBe('manifest_not_json');
  });

  test('accepts and refuses exactly what the server’s schema does', async () => {
    const server = await brydioAnswers('manifest-schema', [SERVER_SCHEMA], async () => {
      const { appManifestSchema: theirs } = await import(inBrydio(SERVER_SCHEMA));

      return CORPUS.map(manifest => reading(theirs.safeParse(manifest)));
    });

    CORPUS.forEach((manifest, index) => {
      expect({ manifest, reading: JSON.parse(JSON.stringify(reading(appManifestSchema.safeParse(manifest)))) }).toEqual({ manifest, reading: server[index] });
    });
  });
});

describe('field types (contracts §5)', () => {
  test('read every form the server reads', () => {
    expect(parseFieldType('string')).toEqual({ kind: 'string', optional: false });
    expect(parseFieldType('member?')).toEqual({ kind: 'member', optional: true });
    expect(parseFieldType('boolean?')).toEqual({ kind: 'boolean', optional: true });
    expect(parseFieldType(['todo', 'doing', 'done'])).toEqual({ kind: 'enum', optional: false, values: ['todo', 'doing', 'done'] });
    expect(parseFieldType('token')).toMatchObject({ kind: 'token', values: ['neutral', 'brand', 'success', 'warn', 'danger'] });
  });

  test('refuse with a code', () => {
    expect(() => parseFieldType('ref')).toThrow(expect.objectContaining({ code: 'data_field_type_unknown' }));
    expect(() => parseFieldType(['a', 'a'])).toThrow(expect.objectContaining({ code: 'data_enum_duplicate' }));
  });

  test('describe a document type that refuses an unlisted status', () => {
    const schema = { title: 'string', status: ['todo', 'doing', 'done'], assignee: 'member?' } as const;
    type Issue = DocumentOf<typeof schema>;

    const fine: Issue = { id: '1', version: 1, title: 'Fix the login page', status: 'todo' };
    // @ts-expect-error "blocked" is not a status
    const wrong: Issue = { id: '1', version: 1, title: 'x', status: 'blocked' };

    expect([fine, wrong]).toHaveLength(2);
  });
});

describe('the bundle fingerprint (contracts §11)', () => {
  const twoFiles = () =>
    new Map([
      ['app.json', bytes('{"name":"issues","version":"0.1.0"}')],
      ['screens/issue.js', bytes('export default 2;\n')],
      ['screens/board.js', bytes('export default 1;\n')],
    ]);

  test('matches a value worked out by hand with shasum', () => {
    // printf 'screens/board.js\0<sha of file 1>\nscreens/issue.js\0<sha of file 2>\n' | shasum -a 256
    expect(bundleHash(twoFiles())).toBe('c768e89b620eebcd47e353e1d79567883428fcb562017f7ca2b51484523659c7');
  });

  test('ignores the manifest, so the same code under two versions is one bundle', () => {
    const other = twoFiles();

    other.set('app.json', bytes('{"name":"issues","version":"0.2.0"}'));
    expect(bundleHash(other)).toBe(bundleHash(twoFiles()));
  });

  test('equals what the server’s bundle-files.ts computes for the same bytes', async () => {
    const three = () => new Map([...twoFiles(), ['lib/a.mjs', bytes('a')]]);
    const big = () => new Map([['app.json', bytes('{}')], ['screens/board.js', new Uint8Array(1024 * 1024)]]);
    const server = await brydioAnswers('bundle-files', [SERVER_BUNDLE], async () => {
      const { bundleHash: hash, checkBundle } = await import(inBrydio(SERVER_BUNDLE));
      const asBuffers = (files: Map<string, Uint8Array>) => new Map([...files].map(([path, data]) => [path, Buffer.from(data)]));
      const refused = (() => {
        try {
          checkBundle(asBuffers(big()));
        } catch (error) {
          const { code, message } = error as { code: string; message: string };

          return { code, message };
        }

        return null;
      })();

      return { hashes: [hash(asBuffers(twoFiles())), hash(asBuffers(three()))], refused };
    });

    expect([bundleHash(twoFiles()), bundleHash(three())]).toEqual(server.hashes);
    expect(server.refused).not.toBeNull();
    expect(bundleProblem(big())).toMatchObject(server.refused!);
  });

  test('refuses what the store refuses', () => {
    expect(bundleProblem(new Map([['app.json', bytes('{}')], ['screens/board.css', bytes('')]]))?.code).toBe('bundle_file_not_code');
    expect(bundleProblem(new Map([['app.json', bytes('{}')], ['.hidden.js', bytes('')]]))?.code).toBe('bundle_path_invalid');
    expect(bundleProblem(new Map([['app.json', bytes('{}')]]))?.code).toBe('bundle_empty');
    expect(bundleProblem(new Map([['screens/board.js', bytes('')]]))?.code).toBe('bundle_manifest_missing');
    expect(bundleProblem(twoFiles())).toBeNull();
  });
});

describe('which SDK a Brydio runs (A5-F04-S03)', () => {
  const support = { oldest: '0.1.0-alpha.0', before: '0.2.0' };
  const versions = ['0.0.9', '0.1.0-0', '0.1.0-alpha.0', '0.1.0-alpha.3', '0.1.0', '0.1.9', '0.2.0-beta.1', '0.2.0', '1.0.0', '1.0.0-beta', '1.0.0-beta.1', '1.0.0-1', '1.0.0+abc'];

  test('runs from the oldest up to, not including, before and its prereleases', () => {
    for (const sdk of ['0.1.0-alpha.0', '0.1.0-alpha.3', '0.1.0', '0.1.9']) expect(sdkRefusal(sdk, support)).toBeNull();
    for (const sdk of ['0.0.9', '0.1.0-0', '0.2.0-beta.1', '0.2.0', '1.0.0']) {
      expect(sdkRefusal(sdk, support)).toBe(`This app was built with SDK ${sdk}. Brydio runs apps built with SDK 0.1.0-alpha.0 or newer, before 0.2.0.`);
    }
    expect(sdkRefusal(undefined, support)).toBe(
      'app.json does not say which SDK built it. Build it with brydio build. Brydio runs apps built with SDK 0.1.0-alpha.0 or newer, before 0.2.0.',
    );
  });

  test('refuses with the server’s sentence for the server’s own range', async () => {
    const asked = [...versions, undefined, '', 42];
    const server = await brydioAnswers('sdk-support', [SERVER_SUPPORT], async () => {
      const { SDK_SUPPORT, sdkRefusal: refusal } = await import(inBrydio(SERVER_SUPPORT));

      return { support: SDK_SUPPORT, refusals: asked.map(sdk => refusal(sdk)) };
    });

    expect(asked.map(sdk => sdkRefusal(sdk, server.support))).toEqual(server.refusals);
  });

  test('orders versions as the server does', async () => {
    const server = await brydioAnswers('compare-versions', [SERVER_COMPARE], async () => {
      const { compareVersions: compare } = await import(inBrydio(SERVER_COMPARE));

      return versions.map(a => versions.map(b => compare(a, b)));
    });

    expect(versions.map(a => versions.map(b => compareVersions(a, b)))).toEqual(server);
  });
});
