import { KNOWN_HOST_GRANTS, collectionsOf, generatedToolsOf, toolNames, type AppManifestWithData } from '@brydio/manifest';

import type { Problem } from './project.ts';
import type { ScreenCall } from './calls.ts';

/**
 * The manifest's grants against what the screens call (A8-F04-S03): every
 * tool a screen calls is one of the app's and is asked for, every collection
 * it reads is one it keeps, every host grant it uses is asked for; and a
 * grant that names nothing, or that no screen uses, is said out loud.
 *
 * Asking for too little is an error, because the call would fail in front of
 * a person. Asking for too much is a warning: a tool grant may be for the
 * assistant rather than a screen, and `*` is a choice, not a mistake.
 *
 * A grant is read the way Brydio reads one (`apps/api/src/apps/manifest/
 * grants.ts`): a tool is granted by its name, by `*`, or by its collection's
 * name, and only while its collection is granted too.
 */

export function grantProblems(manifest: AppManifestWithData, calls: readonly (ScreenCall & { file: string })[], manifestFile: string): Problem[] {
  const problems: Problem[] = [];
  const grants = { tools: manifest.grants?.tools ?? [], collections: manifest.grants?.collections ?? [], host: manifest.grants?.host ?? [] };
  // Every tool the app has: the ones its collections generate, and the ones it
  // wrote itself (A3-F08). A custom tool may name a collection, and is then
  // granted by that collection too; one that names none is granted by its own
  // name or by `*`, exactly as `allowsTool` in `apps/api/src/apps/manifest/
  // grants.ts` reads it. Leaving the custom ones out made an app's own tool
  // "unknown" in its own manifest — a false error on every app that has one.
  const generated = new Map(generatedToolsOf(manifest).map(tool => [tool.name, tool.collection as string | undefined]));
  const custom = new Map((manifest.tools?.custom ?? []).map(tool => [tool.name, tool.collection as string | undefined]));
  const tools = new Map([...generated, ...custom]);
  const collections = new Map(collectionsOf(manifest).map(spec => [spec.name, spec]));
  const at = (call: ScreenCall & { file: string }) => ({ file: call.file, line: call.line, column: call.column });
  const collectionGranted = (collection: string) => grants.collections.includes('*') || grants.collections.includes(collection);
  const toolGranted = (tool: string, collection: string | undefined) => {
    const named = grants.tools.includes('*') || grants.tools.includes(tool);
    // A generated tool is granted by its collection's name too; a custom one is
    // not, and needs its own name or `*`. That is the host's rule in both
    // halves — `allowsTool` and `customToolProblems` in
    // `apps/api/src/apps/manifest/` — and the SDK says the same or it is lying.
    const byCollection = !custom.has(tool) && collection !== undefined && grants.tools.includes(collection);

    if (!named && !byCollection) return false;

    // A tool on no collection needs no collection grant: there is nothing to grant.
    return collection === undefined || collectionGranted(collection);
  };

  const checkTool = (call: ScreenCall & { file: string }, tool: string) => {
    if (!tools.has(tool)) {
      problems.push({
        code: 'tool_unknown',
        severity: 'error',
        ...at(call),
        message: tools.size
          ? `"${tool}" is not one of this app's tools. Its tools are ${[...tools.keys()].join(', ')}.`
          : `"${tool}" is not one of this app's tools. It has none: its collections generate them, and it declares none of its own.`,
      });

      return;
    }

    const collection = tools.get(tool);

    if (!toolGranted(tool, collection)) {
      problems.push({
        code: 'grant_tool_missing',
        severity: 'error',
        ...at(call),
        // One sentence, with the collection named only where granting it would
        // actually work: a custom tool is granted by its own name alone.
        message: `"${tool}" is called here but not asked for: ${collection && !custom.has(tool) ? `add it, or its collection ${collection},` : 'add it'} to grants.tools.`,
      });
    }
  };

  for (const call of calls) {
    if (call.kind === 'tool') {
      checkTool(call, call.name);
    } else if (call.kind === 'collection') {
      const spec = collections.get(call.name);

      if (!spec) {
        problems.push({
          code: 'collection_unknown',
          severity: 'error',
          ...at(call),
          message: collections.size
            ? `"${call.name}" is not one of this app's collections. It keeps ${[...collections.keys()].join(', ')}.`
            : `"${call.name}" is not one of this app's collections. It keeps none.`,
        });
      } else {
        // `data.get` and `data.list` go through the generated tools, so those are what must be granted.
        const names = toolNames(spec);
        const tool = call.verb === 'get' ? names.get : names.list;

        if (tools.has(tool)) checkTool(call, tool);
      }
    } else if (call.sure && !grants.host.includes(call.name)) {
      problems.push({
        code: 'grant_host_missing',
        severity: 'error',
        ...at(call),
        message: `${call.name} is called here but not asked for: add "${call.name}" to grants.host.`,
      });
    }
  }

  for (const [index, grant] of grants.tools.entries()) {
    if (grant !== '*' && !tools.has(grant) && !collections.has(grant)) {
      problems.push({
        code: 'grant_tool_unknown',
        severity: 'warning',
        file: manifestFile,
        path: `grants.tools.${index}`,
        message: `grants.tools asks for "${grant}", which is neither one of this app's tools nor one of its collections.`,
      });
    }
  }

  for (const [index, grant] of grants.collections.entries()) {
    if (grant !== '*' && !collections.has(grant)) {
      problems.push({
        code: 'grant_collection_unknown',
        severity: 'warning',
        file: manifestFile,
        path: `grants.collections.${index}`,
        message: `grants.collections asks for "${grant}", which this app does not keep.`,
      });
    }
  }

  const used = new Set(calls.filter(call => call.kind === 'host').map(call => call.name));

  for (const [index, grant] of grants.host.entries()) {
    // One Brydio does not know is `grant_unknown`, an error, already.
    if (KNOWN_HOST_GRANTS.includes(grant) && !used.has(grant)) {
      problems.push({
        code: 'grant_host_unused',
        severity: 'warning',
        file: manifestFile,
        path: `grants.host.${index}`,
        message: `grants.host asks for "${grant}", which no screen uses. Ask only for what the app does.`,
      });
    }
  }

  return problems;
}
