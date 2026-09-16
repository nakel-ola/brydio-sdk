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
  const tools = new Map(generatedToolsOf(manifest).map(tool => [tool.name, tool.collection]));
  const collections = new Map(collectionsOf(manifest).map(spec => [spec.name, spec]));
  const at = (call: ScreenCall & { file: string }) => ({ file: call.file, line: call.line, column: call.column });
  const collectionGranted = (collection: string) => grants.collections.includes('*') || grants.collections.includes(collection);
  const toolGranted = (tool: string, collection: string) =>
    (grants.tools.includes('*') || grants.tools.includes(tool) || grants.tools.includes(collection)) && collectionGranted(collection);

  const checkTool = (call: ScreenCall & { file: string }, tool: string) => {
    const collection = tools.get(tool);

    if (collection === undefined) {
      problems.push({
        code: 'tool_unknown',
        severity: 'error',
        ...at(call),
        message: tools.size
          ? `"${tool}" is not one of this app's tools. Its tools are ${[...tools.keys()].join(', ')}.`
          : `"${tool}" is not one of this app's tools. It has none: its collections generate them.`,
      });
    } else if (!toolGranted(tool, collection)) {
      problems.push({
        code: 'grant_tool_missing',
        severity: 'error',
        ...at(call),
        message: `"${tool}" is called here but not asked for: add it, or its collection ${collection}, to grants.tools.`,
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
