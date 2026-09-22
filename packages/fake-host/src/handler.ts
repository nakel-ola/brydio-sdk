import type { Handler, HandlerCaller, HandlerClient, HandlerConnectionRequest } from '@brydio/app/handler';
import { MAX_SECRET_CHARS, SECRET_NAME, type ManifestExtensions } from '@brydio/manifest';

/**
 * A pretend Brydio for a custom tool's handler (`tasks/apps` A3-F08,
 * ADR-A24): the client a handler is given, answered from memory, with the
 * same refusals Brydio's `CustomToolRunner` gives.
 *
 * ```ts
 * import { runHandler } from '@brydio/fake-host';
 * import manifest from '../.brydio/app.json';
 * import listInvoices from '../src/handlers/list_invoices';
 *
 * const run = await runHandler(listInvoices, {}, { manifest, secrets: { api_key: 'sk_test_x' } });
 * expect(run.result).toEqual({ items: [] });
 * ```
 *
 * Secrets behave as Brydio's do: only names the manifest declares, only
 * with the `secrets` host grant, and a value the handler read or stored is
 * replaced with `[secret]` in what it returns and in its error, and refused
 * on its way into a record, another tool's input or a model prompt. So a
 * test that passes here does not depend on a value Brydio would never show.
 */

/** What Brydio shows in place of a secret the handler held. */
export const SECRET_PLACEHOLDER = '[secret]';

/** The shortest value Brydio looks for; shorter ones are left alone. */
const MIN_SCRUBBED = 4;

export interface FakeHandlerOptions {
  /** The app's `.brydio/app.json`, for its declared secrets and its grants. Without it, every secret is declared and granted. */
  manifest?: Partial<ManifestExtensions> & { displayName?: string; name?: string };
  /** Secret values already set, by name, as an administrator would have. */
  secrets?: Record<string, string>;
  /** Who is calling. A user id and an origin; never a credential, as in Brydio. */
  caller?: Partial<HandlerCaller>;
  /** The custom tool's name, for Brydio's sentences. */
  tool?: string;
  /** False for a read tool's handler, which Brydio refuses writes from. */
  write?: boolean;
  /** Answers for the rest of the client, when a test needs them. */
  data?: Partial<HandlerClient['data']>;
  tools?: HandlerClient['tools'];
  connection?: (name: string, request: HandlerConnectionRequest) => Promise<{ status: number; body: unknown }>;
  model?: Partial<HandlerClient['model']>;
}

/** One call the handler made through its client. */
export interface HandlerCall {
  method: string;
  /** For `secrets.*`, the name only: a value is never recorded. */
  args: unknown[];
}

export interface HandlerRun<O> {
  /** What the handler returned, as Brydio would pass it on: any secret it held replaced. */
  result?: O;
  /** Its error's message, likewise. */
  error?: string;
  /** Secrets as they stand after the run, as the app's settings would say: set or not. */
  secrets: Map<string, string>;
  calls: HandlerCall[];
}

const unavailable = (what: string) => async () => {
  throw new Error(`${what} is not answered in this test: pass it in the fake handler's options.`);
};

/** The client a handler is given, and what it did with it. */
export function fakeHandlerClient(options: FakeHandlerOptions = {}): {
  client: HandlerClient;
  secrets: Map<string, string>;
  calls: HandlerCall[];
  /** Every secret value the handler was handed or stored. */
  held: Set<string>;
} {
  const secrets = new Map(Object.entries(options.secrets ?? {}));
  const calls: HandlerCall[] = [];
  const held = new Set<string>();
  const manifest = options.manifest;
  const appName = manifest?.displayName ?? manifest?.name ?? 'This app';
  const declared = manifest ? new Set((manifest.secrets ?? []).map(one => one.name)) : null;
  const granted = manifest ? (manifest.grants?.host ?? []).some(grant => grant === 'secrets' || grant === '*') : true;

  const secretOf = (name: unknown): string => {
    if (!granted) throw new Error(`${appName} did not ask to keep its own secrets.`);
    if (typeof name !== 'string' || !SECRET_NAME.test(name) || (declared && !declared.has(name))) {
      throw new Error(`${appName} has no secret called ${String(name).replace(/[^a-z0-9_]/gi, '').slice(0, 60) || 'that'}.`);
    }

    return name;
  };
  const tool = options.tool ?? 'This tool';
  const keeps = (_method: string, args: unknown[]) => {
    if (carries(args, held)) throw new Error(`${tool} can't pass one of ${appName}'s secrets on.`);
  };
  const writes = (method: string, args: unknown[]) => {
    if (options.write === false) throw new Error(`${tool} is a read tool, so its handler can't change records.`);
    keeps(method, args);
  };
  const recorded =
    <A extends unknown[], R>(method: string, run: (...args: A) => Promise<R>, check?: (method: string, args: unknown[]) => void) =>
    async (...args: A): Promise<R> => {
      calls.push({ method, args: method.startsWith('secrets.') ? args.slice(0, 1) : args });
      check?.(method, args);

      return run(...args);
    };

  const data = options.data ?? {};
  const client: HandlerClient = Object.freeze({
    data: Object.freeze({
      get: recorded('data.get', data.get ?? unavailable('data.get')),
      list: recorded('data.list', data.list ?? unavailable('data.list')),
      create: recorded('data.create', data.create ?? unavailable('data.create'), writes),
      update: recorded('data.update', data.update ?? unavailable('data.update'), writes),
      remove: recorded('data.remove', data.remove ?? unavailable('data.remove'), writes),
      batch: recorded('data.batch', data.batch ?? unavailable('data.batch'), writes),
    }),
    tools: Object.freeze({
      call: recorded('tools.call', (options.tools?.call ?? unavailable('tools.call')) as HandlerClient['tools']['call'], keeps),
    }) as HandlerClient['tools'],
    connection: (name: string) =>
      Object.freeze({
        request: recorded('connection.request', (request: HandlerConnectionRequest) =>
          options.connection ? options.connection(name, request) : unavailable(`connection("${name}")`)(),
        ),
      }),
    model: Object.freeze({
      generate: recorded('model.generate', (options.model?.generate ?? unavailable('model.generate')) as HandlerClient['model']['generate'], keeps),
      generateMany: recorded(
        'model.generateMany',
        (options.model?.generateMany ?? unavailable('model.generateMany')) as HandlerClient['model']['generateMany'],
        keeps,
      ),
    }) as HandlerClient['model'],
    secrets: Object.freeze({
      get: recorded('secrets.get', async (name: string) => {
        const value = secrets.get(secretOf(name)) ?? null;

        if (value !== null) held.add(value);

        return value;
      }),
      set: recorded('secrets.set', async (name: string, value: string | null) => {
        const key = secretOf(name);

        if (value === null) {
          secrets.delete(key);

          return;
        }
        if (typeof value !== 'string') throw new Error(`${key} must be text.`);

        held.add(value);
        if (!value.length) throw new Error(`${key} can't be empty: clear it instead.`);
        if (value.length > MAX_SECRET_CHARS) throw new Error(`${key} may be at most ${MAX_SECRET_CHARS} characters.`);

        secrets.set(key, value);
      }),
    }),
    caller: Object.freeze({ userId: options.caller?.userId ?? 'user_test', origin: options.caller?.origin ?? 'assistant' }),
  });

  return { client, secrets, calls, held };
}

/** Runs a handler against the fake client, and answers as Brydio would pass its answer on. */
export async function runHandler<I, O>(handler: Handler<I, O>, input: I, options: FakeHandlerOptions = {}): Promise<HandlerRun<O>> {
  const { client, secrets, calls, held } = fakeHandlerClient(options);

  try {
    const result = await handler(input, client);

    return { result: scrub(JSON.parse(JSON.stringify(result ?? null)) as O, held), secrets, calls };
  } catch (error) {
    return { error: scrub(error instanceof Error ? error.message : String(error), held), secrets, calls };
  }
}

const worth = (held: ReadonlySet<string>) =>
  [...held].filter(one => one.length >= MIN_SCRUBBED).sort((a, b) => b.length - a.length);

function scrub<T>(value: T, held: ReadonlySet<string>): T {
  const values = worth(held);
  const text = (one: string) => values.reduce((out, secret) => out.split(secret).join(SECRET_PLACEHOLDER), one);
  const walk = (node: unknown): unknown =>
    typeof node === 'string'
      ? text(node)
      : Array.isArray(node)
        ? node.map(walk)
        : node && typeof node === 'object'
          ? Object.fromEntries(Object.entries(node).map(([key, one]) => [text(key), walk(one)]))
          : node;

  return values.length ? (walk(value) as T) : value;
}

function carries(value: unknown, held: ReadonlySet<string>): boolean {
  const text = JSON.stringify(value) ?? '';

  return worth(held).some(secret => text.includes(secret) || text.includes(JSON.stringify(secret).slice(1, -1)));
}
