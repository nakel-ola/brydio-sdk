import { describe, expect, test } from 'bun:test';

import { appManifestSchema, collectionsOf, readersOf } from '../src/index.ts';

/** A collection whose records name who alone may read them (P16), as a manifest declares it. */
const pages = (readers: unknown, schema: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({
  name: 'docs',
  version: '1.0.0',
  data: {
    pages: {
      schema: { title: 'string', readers: 'string[]', owner: 'member?', ...schema },
      readers,
      ...more,
    },
  },
  grants: { tools: ['*'], collections: ['*'] },
});

const refused = (manifest: unknown) => {
  const parsed = appManifestSchema.safeParse(manifest);

  return parsed.success ? [] : parsed.error.issues.map(issue => (issue as { params?: { code?: string } }).params?.code);
};

describe('readers on a collection (P16)', () => {
  test('names one of its own string[] fields, kept on the collection', () => {
    expect(refused(pages('readers'))).toEqual([]);
    expect(collectionsOf(appManifestSchema.parse(pages('readers'))).find(one => one.name === 'pages')?.readers).toBe('readers');
  });

  test('refuses a field that is not a list of ids, and anonymous answers', () => {
    expect(refused(pages('owner'))).toEqual(['data_readers_field']);
    expect(refused(pages('nobody'))).toEqual(['data_readers_field']);
    expect(refused(pages('readers', { round: 'number', owner: 'string?' }, { anonymous: { group: 'round' } }))).toEqual(['data_readers_anonymous']);
  });

  test('keeps a record’s list as plain ids, sorted and once each, and null for everyone', () => {
    expect(readersOf('readers', { readers: ['user_b', 'user_a', 'user_b', ''] })).toEqual(['user_a', 'user_b']);
    expect(readersOf('readers', { readers: [] })).toBeNull();
    expect(readersOf(undefined, { readers: ['user_a'] })).toBeNull();
  });
});

describe('editors and generated reads (DW06)', () => {
  const wiki = (tools: Record<string, unknown>) => ({ ...pages('readers', { editors: 'string[]' }, { editors: 'editors' }), tools });

  test('names a string[] field, and lets a readers or editors list hold a thousand', () => {
    const spec = collectionsOf(appManifestSchema.parse(wiki({}))).find(one => one.name === 'pages')!;

    expect(spec.editors).toBe('editors');
    expect(spec.fields.readers!.maxEntries).toBe(1000);
    expect(refused({ ...pages('readers', {}, { editors: 'owner' }) })).toEqual(['data_editors_field']);
  });

  test('with `generated: "read"`, leaves the write names to the app’s own tools', () => {
    const custom = [{ name: 'create_page', description: 'Make a page.', handler: 'handlers/create-page.js', input: { title: 'string' }, write: true }];

    expect(refused(wiki({ generated: 'read', custom }))).toEqual([]);
    expect(refused(wiki({ custom }))).toContain('custom_name_taken');
  });
});
