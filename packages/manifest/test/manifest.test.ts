import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  checkDocument,
  generatedTools,
  generatedToolsOf,
  parseFieldType,
  validateManifest,
  validateManifestText,
  type DocumentOf,
  type ProblemCode,
} from '../src/index.ts';

const examples = join(import.meta.dir, '..', 'examples');
const issues = (): Record<string, any> => JSON.parse(readFileSync(join(examples, 'issues.json'), 'utf8'));

/** The codes a manifest fails with, in order. */
const codesOf = (manifest: unknown): ProblemCode[] => validateManifest(manifest).errors.map(one => one.code);

describe('the example manifests', () => {
  // The shared corpus A5-F01-TC004 asks for: Brydio's reader should parse the
  // same files the same way.
  for (const file of readdirSync(examples).filter(name => name.endsWith('.json'))) {
    test(`${file} validates`, () => {
      const result = validateManifestText(readFileSync(join(examples, file), 'utf8'));

      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    });
  }
});

describe('field types (contracts §5)', () => {
  test('accept every listed form, and mark what is structured', () => {
    expect(parseFieldType('string')).toEqual({ kind: 'string', optional: false, structured: false });
    expect(parseFieldType('text?')).toEqual({ kind: 'text', optional: true, structured: false });
    expect(parseFieldType('member?')).toEqual({ kind: 'member', optional: true, structured: true });
    expect(parseFieldType('string[]')).toEqual({ kind: 'string[]', optional: false, structured: true });
    expect(parseFieldType('token')?.structured).toBe(true);
    expect(parseFieldType(['todo', 'doing', 'done'])).toEqual({
      kind: 'enum',
      optional: false,
      values: ['todo', 'doing', 'done'],
      structured: true,
    });
  });

  test('refuse forms the table does not list', () => {
    for (const bad of ['boolean?', 'string[]?', 'token?', 'ref', 'String', '', [], ['a', 'a'], ['a', 2], 3, null]) {
      expect(parseFieldType(bad)).toBeNull();
    }
  });

  test('describe a document type that refuses an unlisted status', () => {
    const schema = { title: 'string', status: ['todo', 'doing', 'done'], assignee: 'member?' } as const;
    type Issue = DocumentOf<typeof schema>;

    const fine: Issue = { id: '1', version: 1, title: 'Fix the login page', status: 'todo' };
    // @ts-expect-error: "blocked" is not one of the statuses.
    const wrong: Issue = { id: '1', version: 1, title: 'x', status: 'blocked' };
    // @ts-expect-error: title is not optional.
    const missing: Issue = { id: '1', version: 1, status: 'todo' };

    expect([fine, wrong, missing]).toHaveLength(3);
  });
});

describe('validateManifest', () => {
  test('takes an Issues manifest and returns it typed', () => {
    const result = validateManifest(issues());

    expect(result.ok).toBe(true);
    expect(result.manifest?.placements?.[0]?.kind).toBe('project-tab');
  });

  test('reports a placement naming an undeclared screen, with both names', () => {
    const manifest = issues();
    manifest.placements[0].screen = 'list';
    const [error] = validateManifest(manifest).errors;

    expect(error?.code).toBe('brydio_placement_screen_undeclared');
    expect(error?.path).toBe('placements[0].screen');
    expect(error?.detail).toContain('"list"');
    expect(error?.detail).toContain('"board"');
  });

  test('reports each placement problem with its own code', () => {
    const manifest = issues();
    manifest.placements = [
      { kind: 'project-page', screen: 'board' },
      { kind: 'project-tab' },
      { kind: 'project-tab', screen: 'board', label: 3 },
    ];

    expect(codesOf(manifest)).toEqual([
      'brydio_placement_kind_invalid',
      'brydio_placement_screen_missing',
      'brydio_placement_kind_duplicate',
      'brydio_placement_label_wrong_type',
    ]);
  });

  test('reports screens with a bad name or entry', () => {
    const manifest = issues();
    manifest.screens = {
      Board: { entry: 'screens/board.js' },
      issue: {},
      list: { entry: '../list.js' },
      other: { entry: 'screens/board.css' },
      again: { entry: 'screens/board.js' },
    };
    manifest.placements = [];

    expect(codesOf(manifest)).toEqual([
      'brydio_screen_name_format',
      'brydio_screen_entry_missing',
      'brydio_screen_entry_invalid',
      'brydio_screen_entry_invalid',
      'brydio_screen_entry_duplicate',
    ]);
  });

  test('reports schema problems field by field', () => {
    const manifest = issues();
    manifest.data = {
      Issues: { schema: { title: 'string' } },
      bugs: { schema: {} },
      tasks: {
        schema: { id: 'string', 'Due Date': 'date', status: 'enum', done: 'boolean?' },
        label: 'Task',
        search: ['nope'],
        index: ['status'],
      },
    };
    manifest.grants = {};

    expect(codesOf(manifest)).toEqual([
      'brydio_schema_collection_name_format',
      'brydio_schema_missing',
      'brydio_schema_field_reserved',
      'brydio_schema_field_name_format',
      'brydio_schema_field_type_invalid',
      'brydio_schema_field_type_invalid',
      'brydio_schema_label_format',
      'brydio_schema_search_field_unknown',
      // `status` did not parse, so as far as `index` is concerned it is not there.
      'brydio_schema_index_field_unknown',
    ]);
  });

  test('keeps search to text fields and index to strings', () => {
    const manifest = issues();
    manifest.data.issues.search = ['status'];
    manifest.data.issues.index = ['body'];

    expect(codesOf(manifest)).toEqual(['brydio_schema_search_field_not_text', 'brydio_schema_index_field_not_string']);
  });

  test('refuses two collections that would make the same tool', () => {
    const manifest = issues();
    manifest.data.labels.label = 'issue';
    manifest.grants.tools = ['*'];

    expect(codesOf(manifest)).toContain('brydio_schema_tool_name_clash');
  });

  test('refuses custom tools until Phase 3', () => {
    const manifest = issues();
    manifest.tools.custom = [{ name: 'close_issue' }];

    expect(codesOf(manifest)).toEqual(['brydio_tools_custom_unsupported']);
  });

  test('checks grants against what the manifest declares', () => {
    const manifest = issues();
    manifest.grants = {
      tools: ['create_issue', 'close_issue'],
      collections: ['issues', 'comments'],
      host: ['navigate', 'clipboard'],
    };

    expect(codesOf(manifest)).toEqual([
      'brydio_grant_tool_undeclared',
      'brydio_grant_collection_undeclared',
      'brydio_grant_host_unknown',
    ]);
  });

  test('uses Brydio’s codes for the fields Brydio’s reader checks', () => {
    expect(codesOf({ version: '1.0.0' })).toEqual(['plugin_name_missing']);
    expect(codesOf({ name: 'Issues', version: '1' })).toEqual(['plugin_name_format', 'plugin_version_format']);
    expect(codesOf({ name: 'x', version: '1.0.0', defaultPrompts: ['a', 'b', 'c', 'd'] })).toEqual([
      'plugin_default_prompt_too_many',
    ]);
    expect(codesOf({ name: 'x', version: '1.0.0', brandColor: 'red' })).toEqual(['plugin_brand_color_format']);
    expect(codesOf([])).toEqual(['plugin_manifest_not_object']);
    expect(validateManifestText('{').errors[0]?.code).toBe('plugin_manifest_malformed');
  });
});

describe('generated tools (contracts §6)', () => {
  test('name the six tools as §6 does', () => {
    expect(generatedTools('issues', 'issue').map(tool => tool.name)).toEqual([
      'create_issue',
      'update_issue',
      'get_issue',
      'list_issues',
      'search_issues',
      'delete_issue',
    ]);
    expect(generatedTools('people', 'person').map(tool => tool.name)).toContain('list_people');
  });

  test('are none when generation is switched off', () => {
    expect(generatedToolsOf({ ...issues(), tools: { generated: false } })).toEqual([]);
    expect(generatedToolsOf(issues())).toHaveLength(12);
  });
});

describe('checkDocument', () => {
  const schema = issues().data.issues.schema;

  test('accepts a document that fits and names every field that does not', () => {
    expect(checkDocument(schema, { title: 'Fix it', status: 'todo', labels: [] })).toEqual([]);
    expect(checkDocument(schema, { status: 'blocked', colour: 'red' })).toEqual([
      '"colour" is not a field of this collection.',
      '"title" is required.',
      '"status" is one of "todo", "doing", "done", not "blocked".',
    ]);
  });

  test('leaves absent fields alone in an update', () => {
    expect(checkDocument(schema, { status: 'done' }, { partial: true })).toEqual([]);
  });
});
