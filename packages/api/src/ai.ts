/**
 * `@brydio/api/ai`: Brydio's AI from your own server, script or tool, with a
 * developer API key (ADR-A22). No model provider to set up: Brydio runs the
 * model, and every call is metered against the key.
 *
 * **This is for code you run, never for an app.** A key is a credential that
 * reaches Brydio's backend, and no part of an app is ever given one
 * (ADR-A24). Inside an app, a handler asks Brydio's model through its own
 * `model` host grant (`model.generate`), which needs no key and is counted
 * against the app's publisher. `brydio validate` refuses an app that imports
 * this module or ships a key.
 *
 * ```ts
 * import { ai } from '@brydio/api/ai';
 *
 * // BRYDIO_API_KEY and BRYDIO_API_URL are read from the environment.
 * const { summary } = await ai.summarize({ text: longReport, length: 'short' });
 * ```
 */

/** The environment variable holding the key, `bry_live_…`. */
export const API_KEY_ENV = 'BRYDIO_API_KEY';
/** Brydio's API, like `https://api.brydio.app`; the same setting the CLI reads. */
export const API_URL_ENV = 'BRYDIO_API_URL';

const API_PATH = '/api/v1/ai';
const KEY_SHAPE = /^bry_live_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/;

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateInput {
  /** What to ask; or send `messages` instead, never both. */
  prompt?: string;
  messages?: AiMessage[];
  /** Your own instructions, added after Brydio's. */
  system?: string;
  /** A JSON Schema whose top level is an object; the answer's `object` follows it. */
  schema?: Record<string, unknown>;
}

export interface GenerateResult<T = unknown> {
  text: string;
  /** Present when a `schema` was sent. */
  object?: T;
  model: string | null;
  usage: AiUsage;
}

export interface SummarizeInput {
  text: string;
  length?: 'short' | 'medium' | 'long';
  format?: 'paragraph' | 'bullets';
}

export interface SummarizeResult {
  summary: string;
  model: string | null;
  usage: AiUsage;
}

export interface AgentInput {
  /** The conversation so far; the last message is the user's. */
  messages: AiMessage[];
  /** Your own instructions, added after Brydio's. */
  instructions?: string;
}

export interface AiClientOptions {
  /** Defaults to `BRYDIO_API_KEY`. */
  apiKey?: string;
  /** Defaults to `BRYDIO_API_URL`. */
  apiUrl?: string;
  /** For tests, or a runtime whose global `fetch` you want to wrap. */
  fetch?: typeof fetch;
}

/** A call Brydio refused or could not answer, in Brydio's words. */
export class BrydioAiError extends Error {
  constructor(
    message: string,
    /** The HTTP status, or 0 when the call never reached Brydio. */
    readonly status: number,
    /** Brydio's reason code, like `rate_limited` or `request_invalid`. */
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'BrydioAiError';
  }
}

export interface AiClient {
  generate<T = unknown>(input: GenerateInput): Promise<GenerateResult<T>>;
  summarize(input: SummarizeInput): Promise<SummarizeResult>;
  /** Brydio's agent, with no workspace tools: it can't see anyone's files, chats or people. */
  agent(input: AgentInput): Promise<GenerateResult<never>>;
}

const environment = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

/**
 * Whether this is a server runtime (Node, Bun or Deno) rather than a page or
 * a screen's worker, where a key would be handed to whoever loads it. Asked
 * of the runtime itself, not of `document`, which a server's test setup may
 * well define.
 */
export function isServerRuntime(scope: unknown = globalThis): boolean {
  const runtime = scope as { process?: { versions?: Record<string, unknown> }; Deno?: unknown };

  return typeof runtime.process?.versions?.node === 'string' || typeof runtime.process?.versions?.bun === 'string' || runtime.Deno !== undefined;
}

/** A client with its key and address fixed now. Settings are read on the first call when left out. */
export function createAiClient(options: AiClientOptions = {}): AiClient {
  const call = async <T>(route: string, body: object): Promise<T> => {
    if (!isServerRuntime()) {
      throw new BrydioAiError(
        'A developer API key never runs in a browser or an app screen. Call Brydio’s AI from your server; inside an app, use a handler’s model grant.',
        0,
      );
    }

    const env = environment();
    const apiKey = (options.apiKey ?? env[API_KEY_ENV] ?? '').trim();
    const apiUrl = (options.apiUrl ?? env[API_URL_ENV] ?? '').trim().replace(/\/+$/, '');

    if (!apiKey) throw new BrydioAiError(`Set ${API_KEY_ENV} to a key from Settings › Developer in Brydio.`, 0);
    if (!KEY_SHAPE.test(apiKey)) {
      throw new BrydioAiError(`${API_KEY_ENV} isn't a Brydio developer API key. They start bry_live_.`, 0);
    }
    if (!apiUrl) throw new BrydioAiError(`Set ${API_URL_ENV} to your Brydio's API address, like https://api.brydio.app.`, 0);

    let answer: Response;

    try {
      answer = await (options.fetch ?? fetch)(`${apiUrl}${API_PATH}/${route}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new BrydioAiError(`Brydio couldn't be reached at ${apiUrl}: ${(error as Error).message}`, 0);
    }

    const payload = (await answer.json().catch(() => null)) as Record<string, unknown> | null;

    if (!answer.ok) {
      const said = payload?.message;
      const message = Array.isArray(said) ? said.join(' ') : typeof said === 'string' ? said : `Brydio answered ${answer.status}.`;

      throw new BrydioAiError(message, answer.status, typeof payload?.reason === 'string' ? payload.reason : undefined);
    }

    return payload as T;
  };

  return {
    generate: input => call('generate', input),
    summarize: input => call('summarize', input),
    agent: input => call('agent', input),
  };
}

/** The client reading `BRYDIO_API_KEY` and `BRYDIO_API_URL` from the environment, on each call. */
export const ai: AiClient = createAiClient();
