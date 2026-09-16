/**
 * The tree protocol, `brydio-tree/1` (contracts §9, as built): every message
 * between an app's worker and Brydio, as types.
 *
 * JSON-RPC 2.0 notifications over `postMessage`. The host's end is
 * `packages/app/src/apps/frame/screen-session.ts` and the tree it keeps is
 * `tree/tree-store.ts`; where the contract's text and that code differ, this
 * file follows the code, and CONTRACT-NOTES.md says where.
 *
 * Every message is a notification with a `method`. A worker's `tools/call`
 * carries its own id in the envelope and the params; the host answers with
 * `tools/result` or `tools/error`, whose params carry that id back.
 */

export const PROTOCOL = 'brydio-tree/1' as const;

/** Nodes per screen, the root included. The host refuses the insert that would pass it and stops the app. */
export const MAX_NODES = 5_000;

/** The third refusal stops the app. */
export const MAX_REFUSALS = 3;

/** A node id is text of 1 to 128 characters. */
export const MAX_ID_CHARS = 128;

/** The largest single message a worker may send before the host stops it. */
export const MAX_MESSAGE_BYTES = 512 * 1024;

/** From `worker/ready` to the first `tree/mount`, or the host stops the app. */
export const START_BUDGET_MS = 2_000;

/** From the frame appearing to `worker/ready`: loading the app's code. */
export const READY_BUDGET_MS = 10_000;

/** A toast is a sentence; the host cuts it here. */
export const MAX_TOAST_CHARS = 200;

/** The id the runtime gives the root node every screen's tree hangs from. */
export const ROOT_ID = 'root';

/** The paging of the generated list tools (§6). */
export const LIST_LIMIT_DEFAULT = 50;
export const LIST_LIMIT_MAX = 200;

/** A JSON-RPC message. */
export interface RpcMessage {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: unknown;
}

// --- The tree ---------------------------------------------------------------

export type NodeId = string;

/**
 * A setting's value on the wire: a word, a number or a flag, or a list or a
 * record of them (a select's options, a table's columns). Handlers never
 * travel; they stay in the worker.
 */
export type PropValue = string | number | boolean | readonly PropValue[] | { readonly [field: string]: PropValue };

/**
 * One node. An element's `children` are ids, in order; only a mount sends
 * them. A text node (`#text`) has `text` and no children.
 */
export interface Node {
  id: NodeId;
  type: string;
  props?: Record<string, PropValue>;
  text?: string;
  children?: NodeId[];
}

/**
 * One change to a mounted tree, applied in order.
 *
 * - `insert` carries **one** node with no `children`; its children follow as
 *   their own inserts. `index` is clamped to the ends.
 * - `remove` removes the node and everything under it. Not the root.
 * - `move`'s `index` is the position in the new parent once the node has been
 *   taken out of its old one. Not the root, and not inside itself.
 * - `props` merges: each named setting is replaced, and `null` unsets one.
 * - `text` sets a text node's text. An element's words are a setting.
 */
export type Op =
  | { op: 'insert'; parent: NodeId; index: number; node: Node }
  | { op: 'remove'; id: NodeId }
  | { op: 'move'; id: NodeId; parent: NodeId; index: number }
  | { op: 'props'; id: NodeId; props: Record<string, PropValue | null> }
  | { op: 'text'; id: NodeId; text: string };

// --- Where the screen is ----------------------------------------------------

export type PlacementKind = 'project-tab' | 'project-sidebar' | 'workspace-sidebar';
export type InstanceScope = 'workspace' | 'project' | 'personal';

/** Everything the host tells a screen about where it is running. Nothing about the person. */
export interface HostContext {
  theme: 'light' | 'dark';
  locale: string;
  placement: { id: string; kind: PlacementKind; projectId?: string };
  instance: { id: string; name: string; scope: InstanceScope };
  selection?: unknown;
  size: { width: number; height: number };
}

export interface AppInfo {
  name: string;
  version: string;
}

// --- Tools and data -----------------------------------------------------------

/**
 * What a tool answers, as Brydio's executor shapes it and the host passes it
 * on unchanged in `tools/result`. A refusal the tool made itself (a stale
 * version, a field it would not take) is a result with `isError`, not a
 * `tools/error`.
 */
export interface ToolResult {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
  summary?: string;
}

/**
 * A record as the generated tools hand it out: its id and version beside its
 * fields, flat, so what `get_issue` returns is what `update_issue` takes.
 */
export interface AppDocument {
  id: string;
  version: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  [field: string]: unknown;
}

export interface ListQuery {
  /** Equality on structured fields: `{ status: 'todo' }`. */
  filter?: Record<string, unknown>;
  sort?: { field: string; dir?: 'asc' | 'desc' };
  /** At most 200; 50 when absent. */
  limit?: number;
  cursor?: string;
}

/** A page of records, as `list_*` answers. */
export interface ListResult<D = AppDocument> {
  items: D[];
  /** Pass back as `cursor` for the next page; null on the last. */
  nextCursor: string | null;
  /** Said when the limit was capped. */
  note?: string;
}

export type NavigateTarget = { kind: 'chat' | 'file' | 'item'; id: string };

export type ToastTone = 'info' | 'success' | 'danger';

// --- Worker → host ------------------------------------------------------------

export interface WorkerReadyParams {
  protocol: typeof PROTOCOL;
  app: AppInfo;
  /** The runtime's own version. Additive: the host reads only `protocol` and `app`. */
  sdk?: string;
}

export interface TreeMountParams {
  root: NodeId;
  /** Every node of the tree, parent before child, with their children's ids. */
  nodes: Node[];
}

export interface TreePatchParams {
  ops: Op[];
}

export interface ToolsCallParams {
  id: string;
  tool: string;
  input: Record<string, unknown>;
}

export interface UiNavigateParams {
  to: NavigateTarget;
}

export interface UiToastParams {
  text: string;
  tone?: ToastTone;
}

/** The methods a worker sends. `data/get` and `data/list` exist in §9 but the host refuses them in Phase 0. */
export const WORKER_METHODS = ['worker/ready', 'tree/mount', 'tree/patch', 'tools/call', 'data/get', 'data/list', 'ui/navigate', 'ui/toast'] as const;

export type WorkerMethod = (typeof WORKER_METHODS)[number];

// --- Host → worker ------------------------------------------------------------

export interface TreeEventParams {
  node: NodeId;
  name: string;
  detail?: unknown;
}

export interface ToolsResultParams {
  id: string | number;
  result: ToolResult;
}

/** `code` is -32000 for a refusal or failure, -32602 for a malformed call; `message` is for a person. */
export interface RpcError {
  code: number;
  message: string;
}

export interface ToolsErrorParams {
  id: string | number;
  error: RpcError;
}

/** What the host refused, and why, in a sentence for the app's builder. */
export interface TreeRefusedParams {
  op: string;
  node?: NodeId;
  reason: string;
}

export const HOST_METHODS = [
  'host/context',
  'tree/event',
  'tree/refused',
  'tools/result',
  'tools/error',
  'data/result',
  'data/error',
  'worker/teardown',
] as const;

export type HostMethod = (typeof HOST_METHODS)[number];
