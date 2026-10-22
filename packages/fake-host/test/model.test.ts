import { describe, expect, test } from 'bun:test';

import type { HandlerModelMessage } from '@brydio/app/handler';

import { fakeHandlerClient } from '../src/index.ts';

/**
 * A handler's model as the removed `@brydio/api/ai` client had it (PB10):
 * free text, a summary, a conversation's next turn and a streamed answer,
 * each asked by level, never by model (PB11).
 */
describe('a handler’s model, in the fake host', () => {
  test('answers text, a summary, a turn and a stream, and records each call as Brydio would see it', async () => {
    const { client, calls } = fakeHandlerClient({
      model: {
        generate: (async () => 'Three ideas.') as never,
        summarize: async ({ text }) => ({ summary: `${text.length} characters, briefly.`, source: 'brydio' }),
        chat: async (messages: HandlerModelMessage[]) => ({ role: 'assistant', content: `You said ${messages.length} things.`, source: 'personal-key' }),
        stream: async () => ({ text: 'Hello.', source: 'workspace-key', notice: 'Your Mac only answers in the desktop app. Your workspace’s key answered instead.' }),
      },
    });

    const text: string = await client.model.generate({ prompt: 'Ideas', level: 'smart' });
    const summary = await client.model.summarize({ text: 'A long report.', length: 'short', format: 'bullets' });
    const turn = await client.model.chat([{ role: 'user', content: 'When?' }], { level: 'fast' });
    const streamed = await client.model.stream({ prompt: 'Say hello' });

    expect(text).toBe('Three ideas.');
    expect(summary).toEqual({ summary: '14 characters, briefly.', source: 'brydio' });
    expect(turn).toEqual({ role: 'assistant', content: 'You said 1 things.', source: 'personal-key' });
    expect(streamed.notice).toContain('answered instead');
    expect(calls.map(call => call.method)).toEqual(['model.generate', 'model.summarize', 'model.chat', 'model.stream']);
    expect(calls[0]!.args).toEqual([{ prompt: 'Ideas', level: 'smart' }]);
  });

  test('says plainly that a model call the test didn’t answer isn’t set up', async () => {
    const { client } = fakeHandlerClient({});

    await expect(client.model.chat([{ role: 'user', content: 'Hi' }])).rejects.toThrow(/model\.chat/);
  });
});
