import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';

import type { Handler } from '@brydio/app/handler';

import { runHandler } from '../src/index.ts';

/** Forms' host seams in the fake handler host (`tasks/forms` FO02, FO03, FO07), with Brydio's refusals and codes. */

const manifest = {
  name: 'forms',
  placements: [{ kind: 'chat-card' as const, key: 'answer-card', screen: 'card' }],
  grants: { tools: ['*', 'tasks__create_numbered_issue'], collections: ['*'], host: ['chat', 'directory', 'webhooks'] },
};

describe('chat.post (FO03)', () => {
  const share: Handler<{ room: string }> = ({ room }, { chat }) => chat.post({ room, text: 'Answer the survey', card: { placement: 'answer-card', route: '/f/1' } });

  test('records the post and answers its message id', async () => {
    const run = await runHandler(share, { room: 'room_1' }, { manifest });

    expect(run.result).toEqual({ messageId: 'message_test_1' });
    expect(run.posts).toEqual([{ room: 'room_1', text: 'Answer the survey', card: { placement: 'answer-card', route: '/f/1' }, messageId: 'message_test_1' }]);
  });

  test('refuses as Brydio would, each refusal ending with its code', async () => {
    expect((await runHandler(share, { room: 'r' }, { manifest, canPost: () => false })).error).toEndWith('(chat_cannot_post)');
    expect((await runHandler(share, { room: 'r' }, { manifest, canPost: () => 'not_poster' })).error).toEndWith('(chat_app_not_poster)');
    expect((await runHandler(share, { room: 'r' }, { manifest, write: false })).error).toEndWith('(read_tool)');
    expect((await runHandler(share, { room: 'r' }, { manifest: { ...manifest, grants: { ...manifest.grants, host: ['chats'] } } })).error).toEndWith('(not_granted)');
    expect((await runHandler(share, { room: 'r' }, { manifest: { ...manifest, placements: [] } })).error).toEndWith('(chat_card_unknown)');
    expect((await runHandler(share, { room: 'r' }, { manifest, caller: { role: 'anonymous' } })).error).toContain("can't use chat");
  });
});

describe('directory (FO02)', () => {
  const look: Handler<{ user: string }> = async ({ user }, { directory }) => ({
    me: await directory.profile(user),
    nobody: await directory.profile('user_nobody'),
    groups: await directory.groups(),
    web: await directory.membersOf('team_web'),
  });

  test('answers from the fixtures', async () => {
    const ada = { id: 'user_ada', name: 'Ada', email: 'ada@example.test', title: null, team: 'Web', manager: null };
    const run = await runHandler(look, { user: 'user_ada' }, {
      manifest,
      directory: { profiles: [ada], groups: [{ id: 'team_web', name: 'Web', kind: 'team', members: ['user_bea', 'user_ada'] }] },
    });

    expect(run.result).toEqual({ me: ada, nobody: null, groups: [{ id: 'team_web', name: 'Web', kind: 'team' }], web: ['user_ada', 'user_bea'] });
  });

  test('needs the directory grant', async () => {
    expect((await runHandler(look, { user: 'u' }, { manifest: { ...manifest, grants: { ...manifest.grants, host: [] } } })).error).toEndWith('(not_granted)');
  });
});

describe('webhooks.send (FO07)', () => {
  const hook: Handler<{ url: string }> = ({ url }, { webhooks }) => webhooks.send({ url, body: { answer: 'yes' } });

  test('records the signed request and answers only the status', async () => {
    const run = await runHandler(hook, { url: 'https://hooks.example.com/forms' }, { manifest, webhook: () => 202, webhookSecret: 'whsec_x' });

    expect(run.result).toEqual({ status: 202 });
    expect(run.webhooks[0]).toMatchObject({ url: 'https://hooks.example.com/forms', body: '{"answer":"yes"}' });
    expect(run.webhooks[0]!.headers['x-brydio-signature']).toBe(`sha256=${createHmac('sha256', 'whsec_x').update('{"answer":"yes"}').digest('hex')}`);
  });

  test('goes to https only, never to a private address', async () => {
    expect((await runHandler(hook, { url: 'http://hooks.example.com' }, { manifest })).error).toEndWith('(webhook_not_https)');
    expect((await runHandler(hook, { url: 'https://169.254.169.254/latest' }, { manifest })).error).toEndWith('(webhook_private_address)');
    expect((await runHandler(hook, { url: 'https://hooks.example.com' }, { manifest, write: false })).error).toEndWith('(read_tool)');
  });
});

describe("another app's tool through tools.call (FO07)", () => {
  const file: Handler<{ name: string }> = ({ name }, { tools }) => tools.call(name, { title: 'x' });
  const tools = { call: async (name: string) => ({ called: name }) } as never;

  test('reaches the tools option when granted by exactly that name', async () => {
    expect((await runHandler(file, { name: 'tasks__create_numbered_issue' }, { manifest, tools })).result).toEqual({ called: 'tasks__create_numbered_issue' });
  });

  test('is refused without the exact grant, into the app itself, and to a visitor', async () => {
    expect((await runHandler(file, { name: 'notes__create_note' }, { manifest, tools })).error).toEndWith('(cross_app_not_granted)');
    expect((await runHandler(file, { name: 'forms__share_form' }, { manifest, tools })).error).toEndWith('(cross_app_self)');
    expect((await runHandler(file, { name: 'tasks__create_numbered_issue' }, { manifest, tools, caller: { role: 'anonymous' } })).error).toEndWith('(not_for_visitors)');
  });
});

describe('chat.rooms (FO03)', () => {
  const rooms = [
    { id: 'room_web', name: 'web', kind: 'channel' as const, canPost: true },
    { id: 'room_news', name: 'announcements', kind: 'channel' as const, canPost: false },
  ];
  const pick: Handler<{ query?: string }> = ({ query }, { chat }) => chat.rooms(query);
  const post: Handler<{ room: string }> = ({ room }, { chat }) => chat.post({ room, text: 'Hello' });

  test('lists the fixture rooms by name, from a read tool too, and filters by query', async () => {
    expect((await runHandler(pick, {}, { manifest, write: false, chat: { rooms } })).result).toEqual([rooms[1], rooms[0]]);
    expect((await runHandler(pick, { query: 'WE' }, { manifest, chat: { rooms } })).result).toEqual([rooms[0]]);
  });

  test("a listed room's canPost decides a post, and the grant is needed", async () => {
    expect((await runHandler(post, { room: 'room_news' }, { manifest, chat: { rooms } })).error).toEndWith('(chat_cannot_post)');
    expect((await runHandler(post, { room: 'room_web' }, { manifest, chat: { rooms } })).posts).toHaveLength(1);
    expect((await runHandler(pick, {}, { manifest: { ...manifest, grants: { ...manifest.grants, host: [] } }, chat: { rooms } })).error).toEndWith('(not_granted)');
  });
});
