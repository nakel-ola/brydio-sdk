import { workerPort, type Port } from './port.ts';
import {
  PROTOCOL,
  type AppDocument,
  type AppInfo,
  type DataChange,
  type HostContext,
  type ListQuery,
  type ListResult,
  type NavigateTarget,
  type RpcError,
  type RpcMessage,
  type ToastTone,
  type ToolResult,
  type TreeEventParams,
  type TreeRefusedParams,
  type WorkerMethod,
} from './protocol.ts';
import { SDK_VERSION } from './version.ts';

/**
 * The app's end of the bridge to Brydio (contracts §9, as built).
 *
 * Everything an app can ask of the host goes through here, and nothing here
 * decides anything: a tool call is answered by the permission model and the
 * generated tools, a toast by the shell. The bridge's own jobs are to say
 * hello first, to hold each call until its answer arrives, and to hand host
 * events to whoever is listening.
 *
 * Order at the start is the host's: `worker/ready` is the first message a
 * worker sends, the host answers with `host/context`, and the tree goes up
 * straight after (the root waits on `connected`). The host stops an app that
 * has not mounted within two seconds of `worker/ready`.
 */

/** A collection's tool names, as `brydio build` works them out from the manifest. */
export interface BuiltCollection {
  label: string;
  plural: string;
}

/** What `brydio build` bakes into a bundle: the manifest's name, version, grants and collections. */
export interface BuiltApp extends AppInfo {
  grants?: { tools?: string[]; collections?: string[]; host?: string[] };
  collections?: Record<string, BuiltCollection>;
}

declare const __BRYDIO_APP__: string | undefined;

/** The app a bundle was built as, or null when this code was not built by `brydio build`. */
export function builtApp(): BuiltApp | null {
  try {
    return typeof __BRYDIO_APP__ === 'string' ? (JSON.parse(__BRYDIO_APP__) as BuiltApp) : null;
  } catch {
    return null;
  }
}

/** The host refused or failed a call: `tools/error`. `code` is JSON-RPC's (-32000 for a refusal). */
export class HostError extends Error {
  readonly code: number;

  constructor(error: unknown) {
    const shape = error && typeof error === 'object' ? (error as Partial<RpcError>) : {};

    super(typeof shape.message === 'string' ? shape.message : 'Brydio refused that call.');
    this.name = 'HostError';
    this.code = typeof shape.code === 'number' ? shape.code : -32000;
  }
}

/**
 * A tool ran and said no: a result with `isError`. `code` is the tool's own
 * word for it when it gave one (`stale`, `refused`, `invalid`), and `data` is
 * what it sent with it: for `stale`, the record as it is now under `current`.
 */
export class ToolError extends Error {
  readonly code: string | undefined;
  readonly data: unknown;
  readonly result: ToolResult;

  constructor(tool: string, result: ToolResult) {
    const text = result.content?.find(part => typeof part.text === 'string')?.text ?? `${tool} did not work.`;
    const data = result.structuredContent;
    const code = data && typeof data === 'object' ? (data as { error?: unknown }).error : undefined;

    // The first line: a stale refusal follows its sentence with the record as JSON.
    super(text.split('\n')[0]!);
    this.name = 'ToolError';
    this.code = typeof code === 'string' ? code : undefined;
    this.data = data;
    this.result = result;
  }
}

/** The app asked for something its manifest does not ask to be granted. */
export class GrantError extends Error {
  constructor(
    readonly grant: 'tools' | 'collections' | 'host',
    readonly want: string,
  ) {
    super(
      `This app's manifest does not ask for ${want}. Add "${want}"${grant === 'host' ? '' : ' (or "*")'} to grants.${grant} in .brydio/app.json.`,
    );
    this.name = 'GrantError';
  }
}

/** The host stopped the worker before an answer arrived. */
export class TeardownError extends Error {
  constructor() {
    super('The host stopped this screen.');
    this.name = 'TeardownError';
  }
}

/** What a watch hears: a burst of changes, and, if it stops on its own, why. */
export interface WatchListener {
  onChange(changes: DataChange[]): void;
  onEnd?(error: HostError): void;
}

/** One collection the host is watching for this worker, and who in the worker is listening. */
interface Watch {
  listeners: Set<WatchListener>;
}

interface Pending {
  tool: string;
  resolve(result: ToolResult): void;
  reject(error: Error): void;
}

export interface BridgeOptions {
  /** The app's name, version, grants and collections. Defaults to what the build baked in. */
  app?: BuiltApp;
  /**
   * Whether to check calls against the grants before they leave the worker.
   * On when the app knows its grants.
   */
  checkGrants?: boolean;
}

export class Bridge {
  readonly #port: Port;
  readonly #app: BuiltApp;
  readonly #checkGrants: boolean;
  readonly #pending = new Map<string, Pending>();
  readonly #contextListeners = new Set<(context: HostContext) => void>();
  readonly #eventListeners = new Set<(event: TreeEventParams) => void>();
  readonly #refusedListeners = new Set<(refusal: TreeRefusedParams) => void>();
  readonly #teardownListeners = new Set<() => void>();
  readonly #watches = new Map<string, Watch>();
  /** Subscribe calls not yet answered, by call id, with the watch each one started. */
  readonly #subscribing = new Map<string, { collection: string; watch: Watch }>();
  /** `ui/navigate` requests waiting on `ui/result` or `ui/error`, by call id. */
  readonly #asking = new Map<string, { resolve(result: { opened: boolean }): void; reject(error: Error): void }>();
  readonly #connected: Promise<HostContext>;
  readonly #unlisten: () => void;
  #resolveConnected: (context: HostContext) => void = () => {};
  #context: HostContext | null = null;
  #said = false;
  #stopped = false;
  #nextId = 0;

  constructor(port: Port, options: BridgeOptions = {}) {
    this.#port = port;
    this.#app = options.app ?? builtApp() ?? { name: 'unbuilt', version: '0.0.0' };
    this.#checkGrants = options.checkGrants ?? this.#app.grants !== undefined;
    this.#connected = new Promise(resolve => {
      this.#resolveConnected = resolve;
    });
    this.#unlisten = port.listen(message => this.#receive(message));
  }

  get app(): AppInfo {
    return { name: this.#app.name, version: this.#app.version };
  }

  /** Where the screen is running, once the host has said; null before. */
  get context(): HostContext | null {
    return this.#context;
  }

  /** Resolves with the first `host/context`. */
  get connected(): Promise<HostContext> {
    return this.#connected;
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  /** Says `worker/ready` (once) and resolves when the host has answered with the context. */
  connect(): Promise<HostContext> {
    if (!this.#said && !this.#stopped) {
      this.#said = true;
      this.notify('worker/ready', { protocol: PROTOCOL, app: this.app, sdk: SDK_VERSION });
    }

    return this.#connected;
  }

  /** Called with the context each time the host sends it. Returns a function that stops. */
  subscribe(listener: (context: HostContext) => void): () => void {
    this.#contextListeners.add(listener);

    return () => this.#contextListeners.delete(listener);
  }

  onEvent(listener: (event: TreeEventParams) => void): () => void {
    this.#eventListeners.add(listener);

    return () => this.#eventListeners.delete(listener);
  }

  /** What the host refused in the tree. With nobody listening, it is logged. */
  onRefused(listener: (refusal: TreeRefusedParams) => void): () => void {
    this.#refusedListeners.add(listener);

    return () => this.#refusedListeners.delete(listener);
  }

  onTeardown(listener: () => void): () => void {
    this.#teardownListeners.add(listener);

    return () => this.#teardownListeners.delete(listener);
  }

  /** A message nobody answers. Dropped once the host has stopped the worker. */
  notify(method: WorkerMethod, params: object): void {
    if (this.#stopped) return;

    this.#port.post({ jsonrpc: '2.0', method, params });
  }

  /**
   * Calls a tool and hands back its whole answer, `isError` and all.
   *
   * A write may wait for the person to agree on an inline card (contracts §7),
   * so there is no timeout: the call ends when the host answers or stops the
   * worker. A person's *Don't allow* arrives as a `HostError`.
   */
  callToolResult(tool: string, input: Record<string, unknown> = {}): Promise<ToolResult> {
    const refused = this.#toolGrant(tool);

    if (refused) return Promise.reject(refused);
    if (this.#stopped) return Promise.reject(new TeardownError());

    const id = String(++this.#nextId);

    return new Promise<ToolResult>((resolve, reject) => {
      this.#pending.set(id, { tool, resolve, reject });
      this.#port.post({ jsonrpc: '2.0', id, method: 'tools/call', params: { id, tool, input } });
    });
  }

  /**
   * Calls a tool and resolves with what it returned (`structuredContent`), or
   * rejects with a `ToolError` when the tool said no and a `HostError` when
   * the host did.
   */
  async callTool<T = unknown>(tool: string, input: Record<string, unknown> = {}): Promise<T> {
    const result = await this.callToolResult(tool, input);

    if (result?.isError) throw new ToolError(tool, result);

    return result?.structuredContent as T;
  }

  /**
   * One record, through the collection's generated `get_*` tool.
   *
   * §9's `data/get` was answered `data/error` in Phase 0, so the SDK reads
   * through the tools, which the host checks and audits the same way.
   */
  getDocument<D = AppDocument>(collection: string, id: string): Promise<D> {
    const refused = this.#grant('collections', collection);

    if (refused) return Promise.reject(refused);

    return this.callTool<D>(`get_${this.#collection(collection).label}`, { id });
  }

  /** A page of records, through the collection's generated `list_*` tool. */
  async listDocuments<D = AppDocument>(collection: string, query: ListQuery = {}): Promise<ListResult<D>> {
    const refused = this.#grant('collections', collection);

    if (refused) throw refused;

    const page = await this.callTool<Partial<ListResult<D>> | undefined>(`list_${this.#collection(collection).plural}`, { ...query });

    return {
      items: Array.isArray(page?.items) ? page.items : [],
      nextCursor: typeof page?.nextCursor === 'string' ? page.nextCursor : null,
      ...(typeof page?.note === 'string' ? { note: page.note } : {}),
    };
  }

  /**
   * Hears about changes to one of the app's collections until the returned
   * function is called (contracts §9, `data/subscribe`).
   *
   * `onChange` gets each burst the host gathered: ids, ops and versions, never
   * the records, so read them again with `listDocuments` or `getDocument`.
   * `onEnd` hears why, when the host refuses the watch or it stops on its
   * own; stopping it yourself says nothing. However many parts of a screen
   * watch one collection, the host is asked once, and let go when the last
   * stops. The host allows five collections per open app.
   */
  watch(collection: string, onChange: WatchListener['onChange'], onEnd?: WatchListener['onEnd']): () => void {
    const refused = this.#grant('collections', collection);

    if (refused) throw refused;

    const listener: WatchListener = { onChange, ...(onEnd ? { onEnd } : {}) };
    let watch = this.#watches.get(collection);

    if (!watch) {
      const started: Watch = { listeners: new Set() };

      watch = started;
      this.#watches.set(collection, started);
      // The host hears nothing from a worker before `worker/ready`, so the
      // subscribe waits for the context that answers it.
      void this.#connected.then(() => {
        if (this.#watches.get(collection) !== started || this.#stopped) return;

        const id = String(++this.#nextId);

        this.#subscribing.set(id, { collection, watch: started });
        this.#port.post({ jsonrpc: '2.0', id, method: 'data/subscribe', params: { collection } });
      });
    }

    watch.listeners.add(listener);

    const current = watch;

    return () => {
      if (!current.listeners.delete(listener) || current.listeners.size || this.#watches.get(collection) !== current) return;

      this.#watches.delete(collection);

      if (this.#stopped || this.#context === null) return;

      this.#port.post({ jsonrpc: '2.0', id: String(++this.#nextId), method: 'data/unsubscribe', params: { collection } });
    };
  }

  /**
   * Asks Brydio to open a chat, a file or one of the app's own items (an item
   * becomes the screen's selection). A request: resolves with `{ opened }`
   * once it is open, and rejects with a `HostError` in words when the install
   * lacks the grant, the person can't open it, or it isn't a chat, a file or
   * an item. Throws at once when the manifest doesn't ask for the `navigate`
   * host grant.
   */
  navigate(to: NavigateTarget): Promise<{ opened: boolean }> {
    const refused = this.#grant('host', 'navigate');

    if (refused) throw refused;
    if (this.#stopped) return Promise.reject(new TeardownError());

    const id = String(++this.#nextId);

    return new Promise((resolve, reject) => {
      this.#asking.set(id, { resolve, reject });
      this.#port.post({ jsonrpc: '2.0', id, method: 'ui/navigate', params: { to } });
    });
  }

  /** A sentence in Brydio's toast. The host cuts it at 200 characters. */
  toast(text: string, tone?: ToastTone): void {
    this.notify('ui/toast', tone ? { text, tone } : { text });
  }

  /**
   * A collection's tool names: the built manifest's, or worked out the way
   * the server works them out when there is no build (a label is the name
   * without a trailing "s"; the plural is the label with one).
   */
  #collection(collection: string): { label: string; plural: string } {
    const built = this.#app.collections?.[collection];

    if (built) return built;

    const label = collection.length > 1 && collection.endsWith('s') ? collection.slice(0, -1) : collection;

    return { label, plural: `${label}s` };
  }

  /**
   * A grant the manifest does not ask for, as the error to fail with; null
   * when it does. The server's `grants.ts` rules: `*` covers every collection
   * and tool, and of the host's only `navigate` and `message`, never a
   * `connection:<name>`, which is agreed to by name or not at all.
   */
  #grant(grant: 'tools' | 'collections' | 'host', want: string): GrantError | null {
    if (!this.#checkGrants) return null;

    const list = this.#app.grants?.[grant] ?? [];
    const all = list.includes('*') && (grant !== 'host' || HOST_CAPABILITIES.includes(want));

    return list.includes(want) || all ? null : new GrantError(grant, want);
  }

  /**
   * A tool call's grant, as the server's `allowsTool` asks it: the tool is
   * granted by its own name, by `*`, or by the name of the collection whose
   * generated tool it is; and that collection must be granted too, since a
   * tool over a collection that isn't would be a way round it.
   */
  #toolGrant(tool: string): GrantError | null {
    if (!this.#checkGrants) return null;

    const tools = this.#app.grants?.tools ?? [];
    const candidates = new Set([...Object.keys(this.#app.collections ?? {}), ...tools, ...(this.#app.grants?.collections ?? [])]);
    const collection = [...candidates].find(name => name !== '*' && generatedTools(this.#collection(name)).includes(tool));
    const named = tools.includes('*') || tools.includes(tool);

    if (!named && !(collection !== undefined && tools.includes(collection))) return new GrantError('tools', tool);

    return collection === undefined ? null : this.#grant('collections', collection);
  }

  #receive(raw: unknown): void {
    if (!raw || typeof raw !== 'object' || this.#stopped) return;

    const message = raw as RpcMessage;

    if (typeof message.method !== 'string') return;

    const params = (message.params && typeof message.params === 'object' ? message.params : {}) as Record<string, unknown>;

    switch (message.method) {
      case 'host/context':
        this.#takeContext(params as unknown as HostContext);

        return;
      case 'tree/event':
        if (typeof params.node === 'string' && typeof params.name === 'string') {
          const event = params as unknown as TreeEventParams;

          for (const listener of this.#eventListeners) run(() => listener(event));
        }

        return;
      case 'tools/result':
        this.#settle(String(params.id), pending => pending.resolve((params.result ?? {}) as ToolResult));

        return;
      case 'tools/error':
        this.#settle(String(params.id), pending => pending.reject(new HostError(params.error)));

        return;
      case 'tree/refused': {
        const refusal: TreeRefusedParams = {
          op: String(params.op ?? ''),
          ...(typeof params.node === 'string' ? { node: params.node } : {}),
          reason: String(params.reason ?? ''),
        };

        if (this.#refusedListeners.size === 0) {
          console.error(`Brydio refused part of this screen (${refusal.op}${refusal.node ? ` ${refusal.node}` : ''}): ${refusal.reason}`);
        }

        for (const listener of this.#refusedListeners) run(() => listener(refusal));

        return;
      }
      case 'ui/result': {
        const asked = this.#asking.get(String(params.id));
        const result = params.result as { opened?: unknown } | undefined;

        this.#asking.delete(String(params.id));
        asked?.resolve({ opened: result?.opened === true });

        return;
      }
      case 'ui/error': {
        const asked = this.#asking.get(String(params.id));

        this.#asking.delete(String(params.id));
        asked?.reject(new HostError(params.error));

        return;
      }
      case 'data/error': {
        const call = this.#subscribing.get(String(params.id));

        if (!call) return;

        this.#subscribing.delete(String(params.id));
        this.#endWatch(call.collection, call.watch, new HostError(params.error));

        return;
      }
      case 'data/result':
        this.#subscribing.delete(String(params.id));

        return;
      case 'data/changed': {
        const watch = typeof params.collection === 'string' ? this.#watches.get(params.collection) : undefined;
        const changes = Array.isArray(params.changes) ? (params.changes as DataChange[]) : [];

        if (!watch || !changes.length) return;

        for (const listener of [...watch.listeners]) run(() => listener.onChange(changes));

        return;
      }
      case 'data/ended': {
        const collection = String(params.collection ?? '');
        const watch = this.#watches.get(collection);

        if (watch) this.#endWatch(collection, watch, new HostError({ code: -32000, message: params.message }));

        return;
      }
      case 'worker/teardown':
        this.#teardown();

        return;
      default:
        // Anything a newer host says. Ignored rather than refused, because
        // the host is the side that decides what a version means.
        return;
    }
  }

  /** A watch the host stopped or refused: forgotten, so watching again asks again, and each listener told. */
  #endWatch(collection: string, watch: Watch, error: HostError): void {
    if (this.#watches.get(collection) !== watch) return;

    this.#watches.delete(collection);

    for (const listener of watch.listeners) if (listener.onEnd) run(() => listener.onEnd!(error));
  }

  #takeContext(context: HostContext): void {
    const first = this.#context === null;

    this.#context = context;

    if (first) this.#resolveConnected(context);

    for (const listener of this.#contextListeners) run(() => listener(context));
  }

  #settle(id: string, settle: (pending: Pending) => void): void {
    const pending = this.#pending.get(id);

    // An answer to nothing, or a second answer to one call: the first stands.
    if (!pending) return;

    this.#pending.delete(id);
    settle(pending);
  }

  #teardown(): void {
    for (const listener of this.#teardownListeners) run(listener);

    this.#stopped = true;

    for (const pending of this.#pending.values()) pending.reject(new TeardownError());

    this.#pending.clear();

    for (const asked of this.#asking.values()) asked.reject(new TeardownError());

    this.#asking.clear();
    this.#watches.clear();
    this.#subscribing.clear();
    this.#unlisten();
  }
}

/** The host capabilities `*` covers. */
const HOST_CAPABILITIES: readonly string[] = ['navigate', 'message'];

/** A collection's generated tool names, as the server names them. */
const generatedTools = ({ label, plural }: { label: string; plural: string }) => [
  `create_${label}`,
  `update_${label}`,
  `get_${label}`,
  `list_${plural}`,
  `search_${plural}`,
  `delete_${label}`,
];

/** A listener's mistake is reported, never allowed to stop the bridge. */
function run(listener: () => void): void {
  try {
    listener();
  } catch (error) {
    console.error(error);
  }
}

let current: Bridge | null = null;

/** The bridge of the worker this code runs in, made on first use. */
export function defaultBridge(): Bridge {
  current ??= new Bridge(workerPort());

  return current;
}

/** Replaces the default bridge. For tests, which have no worker to talk through. */
export function setDefaultBridge(bridge: Bridge | null): void {
  current = bridge;
}
