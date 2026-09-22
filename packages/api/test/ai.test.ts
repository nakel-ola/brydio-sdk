import { afterEach, describe, expect, test } from 'bun:test';

import { API_KEY_ENV, API_URL_ENV, BrydioAiError, createAiClient, isServerRuntime } from '../src/ai.ts';

/** `@brydio/api/ai` against a stand-in for Brydio's `/api/v1/ai/*` (ADR-A22). No real key or model. */

const KEY = `bry_live_0123456789ab_${'K'.repeat(43)}`;

function brydio(answer: (path: string, body: unknown) => Response) {
  const sent: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));

    sent.push({ url, headers: init.headers as Record<string, string>, body });

    return answer(new URL(url).pathname, body);
  }) as unknown as typeof fetch;

  return { sent, fetch: fake };
}

const saved = { key: process.env[API_KEY_ENV], url: process.env[API_URL_ENV] };

afterEach(() => {
  process.env[API_KEY_ENV] = saved.key;
  process.env[API_URL_ENV] = saved.url;
  if (saved.key === undefined) delete process.env[API_KEY_ENV];
  if (saved.url === undefined) delete process.env[API_URL_ENV];
});

describe('@brydio/api/ai', () => {
  test('reads the key and address from the environment and sends the key as a bearer', async () => {
    process.env[API_KEY_ENV] = KEY;
    process.env[API_URL_ENV] = 'https://brydio.test/';

    const host = brydio(() => Response.json({ summary: 'Short.', model: 'm', usage: { inputTokens: 9, outputTokens: 2 } }));
    const client = createAiClient({ fetch: host.fetch });

    await expect(client.summarize({ text: 'A long report.', length: 'short' })).resolves.toEqual({
      summary: 'Short.',
      model: 'm',
      usage: { inputTokens: 9, outputTokens: 2 },
    });
    expect(host.sent).toEqual([
      {
        url: 'https://brydio.test/api/v1/ai/summarize',
        headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: { text: 'A long report.', length: 'short' },
      },
    ]);
  });

  test('calls generate and agent at their own routes', async () => {
    const host = brydio(path => Response.json({ text: path, model: 'm', usage: { inputTokens: 1, outputTokens: 1 } }));
    const client = createAiClient({ apiKey: KEY, apiUrl: 'https://brydio.test', fetch: host.fetch });

    await client.generate({ prompt: 'Name this', schema: { type: 'object' } });
    await client.agent({ messages: [{ role: 'user', content: 'Hi' }] });

    expect(host.sent.map(one => new URL(one.url).pathname)).toEqual(['/api/v1/ai/generate', '/api/v1/ai/agent']);
  });

  test("says Brydio's refusal in Brydio's words, with its status and reason", async () => {
    const host = brydio(() =>
      Response.json({ reason: 'rate_limited', message: 'This key is calling too often. Try again in a minute.' }, { status: 429 }),
    );
    const failed = await createAiClient({ apiKey: KEY, apiUrl: 'https://brydio.test', fetch: host.fetch })
      .generate({ prompt: 'x' })
      .catch(error => error);

    expect(failed).toBeInstanceOf(BrydioAiError);
    expect(failed).toMatchObject({ status: 429, reason: 'rate_limited', message: 'This key is calling too often. Try again in a minute.' });
  });

  test('refuses before sending anything without a key, with a malformed one, or without an address', async () => {
    delete process.env[API_KEY_ENV];
    delete process.env[API_URL_ENV];

    const host = brydio(() => Response.json({}));

    await expect(createAiClient({ fetch: host.fetch }).generate({ prompt: 'x' })).rejects.toThrow(API_KEY_ENV);
    await expect(createAiClient({ apiKey: 'eyJ.clerk.session', apiUrl: 'https://brydio.test', fetch: host.fetch }).generate({ prompt: 'x' })).rejects.toThrow(
      'bry_live_',
    );
    await expect(createAiClient({ apiKey: KEY, fetch: host.fetch }).generate({ prompt: 'x' })).rejects.toThrow(API_URL_ENV);
    expect(host.sent).toEqual([]);
  });

  test('runs only on a server runtime, never in a page or a screen worker', () => {
    expect(isServerRuntime()).toBe(true);
    expect(isServerRuntime({ process: { versions: { node: '22.0.0' } } })).toBe(true);
    expect(isServerRuntime({ Deno: {} })).toBe(true);
    // A browser tab, and a screen's worker: no process, whatever else is there.
    expect(isServerRuntime({ document: {}, window: {} })).toBe(false);
    expect(isServerRuntime({ WorkerGlobalScope: {}, process: { env: {} } })).toBe(false);
  });
});
