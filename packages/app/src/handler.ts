/**
 * `@brydio/app/handler`: the types a custom tool's handler is written against
 * (`tasks/apps` A3-F08, ADR-A24).
 *
 * A handler is the app's own code that Brydio runs on its side, in a box with
 * no network, no file system and no page. It default-exports one function,
 * which is given the tool's input and this client, and returns JSON:
 *
 * ```ts
 * import type { Handler } from '@brydio/app/handler';
 *
 * const listInvoices: Handler<{ status?: string }> = async ({ status }, { secrets, connection }) => {
 *   const key = await secrets.get('api_key');
 *   if (!key) return { items: [], message: 'Set the API key in the app’s settings.' };
 *   const answer = await connection('billing').request({ path: '/invoices', query: { status: status ?? 'open', key } });
 *   return { items: answer.body };
 * };
 *
 * export default listInvoices;
 * ```
 *
 * Types only: import them with `import type`, so nothing is bundled into the
 * handler. Everything the client does is answered by Brydio, checked against
 * what the workspace granted the app.
 *
 * Nothing here is a Brydio credential, and no part of a handler is ever given
 * one. `caller` names the person and where the call came from; it cannot
 * sign anything.
 */

/** Where a call came from: the assistant, the app's screen, or a sidebar folder listing its rows. */
export type HandlerOrigin = 'assistant' | 'screen' | 'folder';

/** Who is calling. An id to compare and record, never something that authenticates. */
export interface HandlerCaller {
  readonly userId: string;
  readonly origin: HandlerOrigin;
}

/** A record as a handler reads it: its fields, flat, beside Brydio's own. */
export type HandlerRecord = Record<string, unknown> & { id: string; version: number };

/** The app's own collections, for this instance (A3-F08-S02). A read tool's handler cannot write. */
export interface HandlerData {
  get(collection: string, id: string): Promise<HandlerRecord>;
  list(
    collection: string,
    query?: {
      filter?: Record<string, unknown>;
      sort?: { field: string; dir?: 'asc' | 'desc' };
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ items: HandlerRecord[]; nextCursor: string | null }>;
  create(collection: string, fields: Record<string, unknown>): Promise<HandlerRecord>;
  update(collection: string, id: string, version: number, fields: Record<string, unknown>): Promise<HandlerRecord>;
  remove(collection: string, id: string): Promise<{ removed: string }>;
  batch(collection: string, changes: unknown[]): Promise<unknown[]>;
}

/** One of the app's other tools, at most three deep, never itself. */
export interface HandlerTools {
  call<T = unknown>(tool: string, input?: Record<string, unknown>): Promise<T>;
}

/**
 * A request on a connection the person has made, with a `connection:<name>`
 * grant. A path on the connection's own address, never a URL; the
 * connection's token is added by Brydio, and a handler cannot set headers.
 */
export interface HandlerConnectionRequest {
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  query?: Record<string, string>;
  body?: unknown;
}

export interface HandlerConnection {
  request(request: HandlerConnectionRequest): Promise<{ status: number; body: unknown }>;
}

/** Structured design through Brydio's configured model, with the `model` grant (A8-F03). */
export interface HandlerModel {
  generate<T = unknown>(request: { prompt: string; schema: Record<string, unknown> }): Promise<T>;
  generateMany<T = unknown>(requests: { prompt: string; schema: Record<string, unknown> }[]): Promise<T[]>;
}

/**
 * The app's own secrets (ADR-A24), with the `secrets` grant: only names the
 * manifest declares under `secrets`, and only this app's.
 *
 * - `get` answers the value, or null while none is set. An instance-scoped
 *   secret is this instance's.
 * - `set` stores one the handler obtained itself (a refreshed OAuth token),
 *   or clears it with null.
 *
 * A value a handler holds never leaves by a door Brydio owns: Brydio replaces
 * it with `[secret]` in what the handler returns and in its errors, and
 * refuses a record, a nested tool call or a model prompt that would carry it.
 */
export interface HandlerSecrets {
  get(name: string): Promise<string | null>;
  set(name: string, value: string | null): Promise<void>;
}

/** Everything a handler is given beside its input. */
export interface HandlerClient {
  readonly data: HandlerData;
  readonly tools: HandlerTools;
  connection(name: string): HandlerConnection;
  readonly model: HandlerModel;
  readonly secrets: HandlerSecrets;
  readonly caller: HandlerCaller;
}

/** A handler: the default export of a custom tool's `handler` file. */
export type Handler<I = Record<string, unknown>, O = unknown> = (input: I, client: HandlerClient) => O | Promise<O>;
