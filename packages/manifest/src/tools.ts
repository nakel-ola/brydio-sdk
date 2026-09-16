import { collectionsOf, type CollectionSpec, type ManifestExtensions } from './schema.ts';

/**
 * The names of the tools Brydio generates for a collection (contracts §6).
 *
 * As `apps/api/src/apps/tools/generated-tools.ts` names them: the singular
 * label for one record, and the label with an "s" for many, so a collection
 * labelled `issue` gets `create_issue` and `list_issues`. The plural is the
 * label's, not the collection's name, which is what the server does.
 */

export type ToolVerb = 'create' | 'update' | 'get' | 'list' | 'search' | 'delete';

/** Whether the tool writes, and so asks the person first from a screen (§6, §7). */
export const TOOL_WRITES: Readonly<Record<ToolVerb, boolean>> = {
  create: true,
  update: true,
  get: false,
  list: false,
  search: false,
  delete: true,
};

export function toolNames(spec: Pick<CollectionSpec, 'label' | 'plural'>): Record<ToolVerb, string> {
  return {
    create: `create_${spec.label}`,
    update: `update_${spec.label}`,
    get: `get_${spec.label}`,
    list: `list_${spec.plural}`,
    search: `search_${spec.plural}`,
    delete: `delete_${spec.label}`,
  };
}

export interface GeneratedTool {
  name: string;
  verb: ToolVerb;
  collection: string;
  write: boolean;
}

/** Every generated tool of a manifest's collections, or none when generation is off. */
export function generatedToolsOf(manifest: Pick<ManifestExtensions, 'data' | 'tools'>): GeneratedTool[] {
  if (manifest.tools?.generated === false) return [];

  return collectionsOf(manifest).flatMap(spec =>
    (Object.entries(toolNames(spec)) as [ToolVerb, string][]).map(([verb, name]) => ({
      name,
      verb,
      collection: spec.name,
      write: TOOL_WRITES[verb],
    })),
  );
}
