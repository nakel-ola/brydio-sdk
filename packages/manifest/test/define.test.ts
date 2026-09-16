import { describe, expect, test } from 'bun:test';

import { defineManifest, validateManifest, type ScreenNameOf } from '../src/index.ts';

describe('a manifest written in TypeScript', () => {
  test('keeps its literal types, and passes validate as written', () => {
    const manifest = defineManifest({
      name: 'issues',
      version: '0.1.0',
      screens: { board: { entry: 'screens/board.js' }, issue: { entry: 'screens/issue.js' } },
      placements: [{ kind: 'project-tab', screen: 'board', label: 'Issues' }],
    });
    const screen: ScreenNameOf<typeof manifest> = 'issue';

    expect(screen).toBe('issue');
    expect(validateManifest(manifest).problems).toEqual([]);
  });

  test('does not compile a placement naming a screen it does not declare, and validate refuses it too', () => {
    // A5-F01-S03: the type check and validate agree.
    const wrong = defineManifest({
      name: 'issues',
      version: '0.1.0',
      screens: { board: { entry: 'screens/board.js' } },
      // @ts-expect-error "bord" is not one of this manifest's screens
      placements: [{ kind: 'project-tab', screen: 'bord' }],
    });

    expect(validateManifest(wrong).problems.map(problem => problem.code)).toContain('placement_screen_unknown');
  });
});
