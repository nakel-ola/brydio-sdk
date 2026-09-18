import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { baseManifestSchema } from '../src/base.ts';
import { HOST_CAPABILITIES } from '../src/grants.ts';
import { migrationStepSchema } from '../src/migrations.ts';
import { manifestExtensionsSchema } from '../src/schema.ts';
import { manifestDoc } from '../../../scripts/docs-manifest.ts';

const root = join(import.meta.dir, '../../..');
const onDisk = () => readFileSync(join(root, 'docs', 'manifest.md'), 'utf8');
const issues = readFileSync(join(root, 'packages', 'manifest', 'examples', 'issues.json'), 'utf8').trim();

const fields = [...Object.keys(baseManifestSchema.shape), ...Object.keys(manifestExtensionsSchema.shape)].sort();
const migrationOps = migrationStepSchema.options.map(option => option.shape.op.value).sort();

describe('the manifest reference', () => {
  test('is the generated page, to the character', () => {
    expect(onDisk().trim()).toBe(manifestDoc().trim());
  });

  test('has a reference row for every top-level field in the schema', () => {
    const page = onDisk();
    const missing = fields.filter(field => !page.includes(`| \`${field}\` |`));

    expect(fields.length).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });

  test('uses the checked-in Issues manifest as its worked example', () => {
    expect(onDisk()).toContain(issues);
  });

  test('documents every migration operation and host grant', () => {
    const page = onDisk();

    expect(migrationOps).toEqual(['add', 'drop', 'dropCollection', 'rename', 'replace']);
    expect(migrationOps.filter(operation => !page.includes(`| \`${operation}\` |`))).toEqual([]);
    expect(HOST_CAPABILITIES.filter(grant => !page.includes(`\`${grant}\``))).toEqual([]);
  });
});
