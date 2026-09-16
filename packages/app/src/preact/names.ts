import { useLayoutEffect, useState } from 'preact/hooks';

import type { Bridge } from '../bridge.ts';
import type { MemberName, ProjectName } from '../protocol.ts';

/**
 * Names for the ids a screen already holds: an issue's assignee, a record's
 * project (G12). Asked once per id per screen, answered from memory after,
 * and an id Brydio won't name (someone the viewer can't see) stays absent.
 */

type Kind = 'members' | 'projects';

const known = new WeakMap<Bridge, Record<Kind, Map<string, MemberName | ProjectName | null>>>();

function cacheOf(bridge: Bridge) {
  let cache = known.get(bridge);

  if (!cache) known.set(bridge, (cache = { members: new Map(), projects: new Map() }));

  return cache;
}

function useNames<T extends MemberName | ProjectName>(bridge: Bridge, kind: Kind, ids: readonly (string | null | undefined)[]): Map<string, T> {
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))].sort();
  const key = wanted.join('\n');
  const cache = cacheOf(bridge)[kind];
  const [, redraw] = useState(0);

  // A layout effect, so the names are asked as soon as the tree is committed: a worker's effects wait.
  useLayoutEffect(() => {
    const missing = wanted.filter(id => !cache.has(id));

    if (!missing.length) return;

    // Asked for, so a render meanwhile doesn't ask again.
    for (const id of missing) cache.set(id, null);

    const asked = kind === 'members' ? bridge.members(missing) : bridge.projects(missing);

    asked.then(
      found => {
        for (const one of found) cache.set(one.id, one);
        redraw(count => count + 1);
      },
      () => {
        // Refused or failed: forget the ids, so a later render may ask again.
        for (const id of missing) if (cache.get(id) === null) cache.delete(id);
      },
    );
  }, [bridge, kind, key]);

  const names = new Map<string, T>();

  for (const id of wanted) {
    const name = cache.get(id);

    if (name) names.set(id, name as T);
  }

  return names;
}

export const useMemberNames = (bridge: Bridge, ids: readonly (string | null | undefined)[]) => useNames<MemberName>(bridge, 'members', ids);
export const useProjectNames = (bridge: Bridge, ids: readonly (string | null | undefined)[]) => useNames<ProjectName>(bridge, 'projects', ids);
