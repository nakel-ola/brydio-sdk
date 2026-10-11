import { describe, expect, test } from 'bun:test';

import { appManifestSchema, dataProblems } from '../src/index.ts';

/** `instances: "one-per-workspace"`: one calendar for the whole workspace, shown on projects as a view (CA10). */

const app = (more: Record<string, unknown>) => ({
  name: 'calendar',
  version: '1.0.0',
  screens: { calendar: { entry: 'screens/calendar.js' } },
  grants: { tools: ['*'], collections: ['*'] },
  ...more,
});

describe('instances (CA10)', () => {
  test('one-per-workspace is accepted with a workspace sidebar item', () => {
    const manifest = app({ instances: 'one-per-workspace', placements: [{ key: 'calendar', kind: 'workspace-sidebar', screen: 'calendar', label: 'Calendar' }] });

    expect(appManifestSchema.safeParse(manifest).success).toBe(true);
    expect(dataProblems(manifest as never).map(one => one.code)).toEqual([]);
  });

  test('is refused without one, since nothing could add it', () => {
    const manifest = app({ instances: 'one-per-workspace', placements: [{ key: 'w', kind: 'project-widget', screen: 'calendar', label: 'Upcoming', sizes: ['small'] }] });

    expect(dataProblems(manifest as never).map(one => one.code)).toEqual(['instances_needs_sidebar']);
  });

  test('takes no other rule', () => {
    expect(appManifestSchema.safeParse(app({ instances: 'one-per-project' })).success).toBe(false);
  });
});
