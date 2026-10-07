import { describe, expect, test } from 'bun:test';

import { HOST_CAPABILITIES, appManifestSchema, appToolPrefix, crossAppTool, dataProblems, isHostCapability, manifestExtensionsSchema, unknownHostGrant } from '../src/index.ts';

/** Forms' host seams in a manifest (`tasks/forms` FO02, FO03, FO07), as Brydio's own schema reads them. */

const FORMS = {
  name: 'forms',
  version: '1.0.0',
  placements: [
    { kind: 'workspace-sidebar', key: 'forms', screen: 'home' },
    { kind: 'chat-card', key: 'answer-card', screen: 'card', label: 'Answer', icon: 'form' },
  ],
  data: { forms: { schema: { title: 'string' } } },
  tools: { custom: [{ name: 'share_form', description: 'Share a form in a chat.', handler: 'handlers/share.js', write: true }] },
  screens: { home: { entry: 'screens/home.js' }, card: { entry: 'screens/card.js' } },
  grants: { tools: ['*', 'tasks__create_numbered_issue'], collections: ['*'], host: ['chat', 'directory', 'webhooks'] },
};

const codes = (manifest: unknown) => dataProblems(manifest as never).map(one => one.code);

describe('a chat-card placement (FO03)', () => {
  test('is read with a key, a screen, a label and an icon', () => {
    expect(manifestExtensionsSchema.safeParse(FORMS).success).toBe(true);
    expect(codes(FORMS)).toEqual([]);
  });

  test('has no sizes, children or settings', () => {
    const card = (over: Record<string, unknown>) => ({ ...FORMS, placements: [{ ...FORMS.placements[1], ...over }] });

    expect(codes(card({ sizes: ['small'] }))).toContain('placement_chat_card_shape');
    expect(codes(card({ children: { tool: 'share_form' } }))).toContain('placement_chat_card_shape');
    expect(codes(card({ settings: { colour: { label: 'Colour', type: 'string' } } }))).toContain('placement_chat_card_shape');
  });
});

describe("another app's tool in grants.tools (FO07)", () => {
  test('parses, and is never an unknown custom tool', () => {
    expect(appManifestSchema.safeParse(FORMS).success).toBe(true);
    expect(codes(FORMS)).not.toContain('grant_tool_missing');
  });

  test('refuses one naming the app itself, on grants.tools', () => {
    const parsed = appManifestSchema.safeParse({ ...FORMS, grants: { ...FORMS.grants, tools: ['*', 'forms__share_form'] } });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({ path: ['grants', 'tools'], params: { code: 'grant_tool_cross_app_self' } });
  });

  test('splits the assistant name at its first double underscore', () => {
    expect(crossAppTool('tasks__create_numbered_issue')).toEqual({ app: 'tasks', tool: 'create_numbered_issue' });
    expect(crossAppTool('create_issue')).toBeNull();
    expect(appToolPrefix('issue-tracker')).toBe('issue_tracker');
  });
});

describe('the chat, directory and webhooks host grants', () => {
  test('are grants Brydio knows, so publishing does not refuse them', () => {
    expect(['chat', 'directory', 'webhooks'].every(isHostCapability)).toBe(true);
    expect(HOST_CAPABILITIES).toContain('chats');
    expect(unknownHostGrant(FORMS)).toBeNull();
  });
});
