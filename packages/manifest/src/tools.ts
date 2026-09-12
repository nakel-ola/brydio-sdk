/**
 * The names of the tools Brydio generates for a collection (contracts §6).
 *
 * §6's table, for `label: "issue"`, names `create_issue`, `update_issue`,
 * `get_issue`, `delete_issue`, and `list_issues`, `search_issues`. The plural
 * is taken from the collection's own name (`issues`) rather than by adding an
 * `s` to the label, which gives `list_people` for a `people` collection whose
 * label is `person`. A collection without a label uses its name for both.
 * Written down in CONTRACT-NOTES.md so the host's generator agrees.
 */

export type ToolVerb = 'create' | 'update' | 'get' | 'list' | 'search' | 'delete';

export interface GeneratedTool {
  name: string;
  verb: ToolVerb;
  collection: string;
  /** Asks first through the approval card (§6). */
  write: boolean;
}

export function generatedTools(collection: string, label?: string): GeneratedTool[] {
  const one = label ?? collection;

  return [
    { verb: 'create', name: `create_${one}`, write: true },
    { verb: 'update', name: `update_${one}`, write: true },
    { verb: 'get', name: `get_${one}`, write: false },
    { verb: 'list', name: `list_${collection}`, write: false },
    { verb: 'search', name: `search_${collection}`, write: false },
    { verb: 'delete', name: `delete_${one}`, write: true },
  ].map(tool => ({ ...tool, verb: tool.verb as ToolVerb, collection }));
}

/** Every generated tool of a manifest's collections, when generation is on. */
export function generatedToolsOf(manifest: {
  data?: Record<string, { label?: string }>;
  tools?: { generated?: boolean };
}): GeneratedTool[] {
  if (manifest.tools?.generated === false) return [];

  return Object.entries(manifest.data ?? {}).flatMap(([name, collection]) =>
    generatedTools(name, collection.label),
  );
}
