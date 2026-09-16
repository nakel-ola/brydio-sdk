import { defaultBridge, type Bridge } from './bridge.ts';
import type { AppDocument, DataChange, HostContext, ListQuery, ListResult, NavigateTarget, ToastTone, ToolResult } from './protocol.ts';
import { createRoot, type RemoteRoot, type RootOptions } from './tree.ts';

/**
 * `@brydio/app`: what a screen imports.
 *
 * The functions here talk to the worker's own bridge, made on first use.
 * Nothing leaves the worker until `connect()` (or `mount()`) says
 * `worker/ready`, so importing this module has no effect of its own.
 */

/** Says hello to the host and resolves with where the screen is running. */
export function connect(): Promise<HostContext> {
  return defaultBridge().connect();
}

/** Where the screen is running: theme, locale, placement, instance, selection, size. */
export const host = {
  /** The latest context, or null before the host has sent one. */
  get context(): HostContext | null {
    return defaultBridge().context;
  },
  /** Called each time the host sends the context again. Returns a function that stops. */
  subscribe(listener: (context: HostContext) => void): () => void {
    return defaultBridge().subscribe(listener);
  },
};

/** The app's own tools: the generated ones for its collections (contracts §6). */
export const tools = {
  /**
   * Calls a tool and resolves with what it returned. A write waits for the
   * person to agree first. Rejects with a `ToolError` when the tool said no
   * (`code` is `stale` for an update from an old version) and a `HostError`
   * when the host or the person did.
   */
  call<T = unknown>(tool: string, input: Record<string, unknown> = {}): Promise<T> {
    return defaultBridge().callTool<T>(tool, input);
  },
  /** The same call, answering with the tool's whole result rather than rejecting on `isError`. */
  result(tool: string, input: Record<string, unknown> = {}): Promise<ToolResult> {
    return defaultBridge().callToolResult(tool, input);
  },
};

/**
 * Reads of the app's collections, through the generated `get_*` and `list_*`
 * tools, and watches on them. Writes go through `tools.call`.
 */
export const data = {
  get<D = AppDocument>(collection: string, id: string): Promise<D> {
    return defaultBridge().getDocument<D>(collection, id);
  },
  list<D = AppDocument>(collection: string, query: ListQuery = {}): Promise<ListResult<D>> {
    return defaultBridge().listDocuments<D>(collection, query);
  },
  /**
   * Calls `onChange` with each burst of changes to a collection, whoever made
   * them, until the returned function is called. A change names a record
   * (`{ id, op, version }`) and never says what it holds, so read it again.
   * `onEnd` hears why the host refused or stopped the watch. At most five
   * collections per open app.
   *
   * ```ts
   * const stop = data.watch('issues', () => void redraw());
   * ```
   */
  watch(collection: string, onChange: (changes: DataChange[]) => void, onEnd?: (error: Error) => void): () => void {
    return defaultBridge().watch(collection, onChange, onEnd);
  },
};

/**
 * Asks Brydio to open a chat, a file or one of the app's items, and resolves
 * with `{ opened }` once it is open; rejects with a `HostError` saying why
 * not. Needs the `navigate` host grant.
 */
export function navigate(to: NavigateTarget): Promise<{ opened: boolean }> {
  return defaultBridge().navigate(to);
}

/** A short message in Brydio's own toast. */
export function toast(text: string, tone?: ToastTone): void {
  defaultBridge().toast(text, tone);
}

/** Called when the host stops the screen, before the worker ends. */
export function onTeardown(listener: () => void): () => void {
  return defaultBridge().onTeardown(listener);
}

/**
 * Connects and builds a screen with the plain API: `build` gets the root and
 * the host's context, and whatever it appends goes up as the first tree.
 */
export async function mount(
  build: (root: RemoteRoot, context: HostContext) => void | Promise<void>,
  options: RootOptions = {},
): Promise<RemoteRoot> {
  const bridge: Bridge = options.bridge ?? defaultBridge();
  const root = createRoot({ ...options, bridge });
  const context = await bridge.connect();

  await build(root, context);

  return root;
}

export {
  Bridge,
  GrantError,
  HostError,
  TeardownError,
  ToolError,
  builtApp,
  defaultBridge,
  setDefaultBridge,
  type BridgeOptions,
  type BuiltApp,
  type BuiltCollection,
  type WatchListener,
} from './bridge.ts';
export { workerPort, type Port } from './port.ts';
export {
  RemoteElement,
  RemoteNode,
  RemoteRoot,
  RemoteText,
  TreeError,
  avatar,
  badge,
  board,
  boardColumn,
  button,
  card,
  checkbox,
  createElement,
  createRoot,
  createText,
  date,
  dialog,
  diff,
  emptyState,
  grid,
  h,
  heading,
  input,
  label,
  listRow,
  markdown,
  menu,
  select,
  skeleton,
  split,
  stack,
  switchElement,
  table,
  text,
  textarea,
  virtualList,
  type Child,
  type RootOptions,
  type TreeErrorCode,
} from './tree.ts';
export * from './protocol.ts';
export { SDK_VERSION } from './version.ts';
export type { BryEvent, ElementAttributes, ElementName, ElementProps } from '@brydio/ui';
