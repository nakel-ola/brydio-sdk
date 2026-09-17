import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';
import { TOOL_WRITES, generatedToolsOf, type ToolVerb } from '../src/index.ts';
import { ISSUES_MANIFEST } from './issues-manifest.fixture.ts';

/**
 * A generated tool's write flag (A5-F01-S03): the tools that change a record
 * ask the person first from a screen. The SDK's `TOOL_WRITES` is a copy of
 * the server's `WRITES` in `apps/tools/generated-tools.ts`: read from
 * Brydio's checkout when it's there, from `contracts/brydio.json` when not.
 */

const GENERATED = 'apps/api/src/apps/tools/generated-tools.ts';

describe('which generated tools write', () => {
  test("are the server's", async () => {
    const server = await brydioAnswers('tool-writes', [GENERATED], () => {
      const found = /const WRITES: ReadonlySet<Verb> = new Set<Verb>\(\[([^\]]*)\]\)/.exec(readFileSync(inBrydio(GENERATED), 'utf8'));

      if (!found) throw new Error(`WRITES not found in ${GENERATED}`);

      return [...found[1]!.matchAll(/'([a-z]+)'/g)].map(match => match[1]!).sort();
    });
    const sdk: string[] = (Object.keys(TOOL_WRITES) as ToolVerb[]).filter(verb => TOOL_WRITES[verb]).sort();

    expect(sdk).toEqual(server);
  });

  test("are carried on each of a manifest's tools", () => {
    const writes = generatedToolsOf(ISSUES_MANIFEST).filter(tool => tool.write).map(tool => tool.name);

    expect(writes).toEqual(['create_issue', 'update_issue', 'delete_issue', 'create_label', 'update_label', 'delete_label']);
  });
});
