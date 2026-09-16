import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TOOL_WRITES, generatedToolsOf, type ToolVerb } from '../src/index.ts';
import { ISSUES_MANIFEST } from './issues-manifest.fixture.ts';

/**
 * A generated tool's write flag (A5-F01-S03): the tools that change a record
 * ask the person first from a screen. The SDK's `TOOL_WRITES` is a copy of
 * the server's `WRITES` in `apps/tools/generated-tools.ts`, read here from
 * Brydio's checkout so the two can't drift apart.
 */

const brydio = process.env.BRYDIO_DIR ?? join(import.meta.dir, '..', '..', '..', '..', 'brydio');
const generated = join(brydio, 'apps/api/src/apps/tools/generated-tools.ts');

describe.skipIf(!existsSync(generated))('which generated tools write', () => {
  test("are the server's", () => {
    const found = /const WRITES: ReadonlySet<Verb> = new Set<Verb>\(\[([^\]]*)\]\)/.exec(readFileSync(generated, 'utf8'));

    expect(found, 'WRITES in generated-tools.ts').not.toBeNull();

    const server = [...found![1]!.matchAll(/'([a-z]+)'/g)].map(match => match[1]).sort();
    const sdk = (Object.keys(TOOL_WRITES) as ToolVerb[]).filter(verb => TOOL_WRITES[verb]).sort();

    expect(sdk).toEqual(server);
  });

  test("are carried on each of a manifest's tools", () => {
    const writes = generatedToolsOf(ISSUES_MANIFEST).filter(tool => tool.write).map(tool => tool.name);

    expect(writes).toEqual(['create_issue', 'update_issue', 'delete_issue', 'create_label', 'update_label', 'delete_label']);
  });
});
