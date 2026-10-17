import { describe, expect, test } from 'bun:test';

import { dataProblems, effectivePlacementKey, manifestExtensionsSchema } from '../src/index.ts';

/** A panel on a person's Directory profile, as People declares its HR card. */
const PEOPLE = {
  name: 'people',
  version: '1.0.0',
  placements: [
    { kind: 'workspace-sidebar', key: 'people', screen: 'home' },
    { kind: 'person-profile', key: 'hr-card', screen: 'profile', label: 'HR' },
  ],
  data: { employees: { schema: { person: 'string' } } },
  screens: { home: { entry: 'screens/home.js' }, profile: { entry: 'screens/profile.js' } },
  grants: { tools: ['*'], collections: ['*'] },
};

const codes = (manifest: unknown) => dataProblems(manifest as never).map(one => one.code);

describe('a person-profile placement', () => {
  test('is read with a key, a screen and a label', () => {
    expect(manifestExtensionsSchema.safeParse(PEOPLE).success).toBe(true);
    expect(codes(PEOPLE)).toEqual([]);
    expect(effectivePlacementKey(PEOPLE.placements[1]!)).toBe('hr-card');
  });

  test('has no sizes, children or settings', () => {
    const panel = (over: Record<string, unknown>) => ({ ...PEOPLE, placements: [{ ...PEOPLE.placements[1], ...over }] });

    expect(codes(panel({ sizes: ['small'] }))).toContain('placement_person_profile_shape');
    expect(codes(panel({ children: { tool: 'list_employees' } }))).toContain('placement_person_profile_shape');
    expect(codes(panel({ settings: { colour: { label: 'Colour', type: 'string' } } }))).toContain('placement_person_profile_shape');
  });
});
