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
  placement: { id: string; kind: PlacementKind; projectId?: string; settings?: Record<string, string> };
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

/** How many collections one open app may watch. The next is refused. */
export const MAX_WATCHES = 5;

/** How long the host gathers one collection's changes before it tells the app. */
export const COALESCE_MS = 100;

/**
 * That one record changed: its id, what happened and its version after. Never
 * what it says: the app reads it again, and the read is checked then.
 */
export interface DataChange {
  id: string;
  op: 'create' | 'update' | 'delete';
  version: number;
}

/** A workspace member's name for an id a screen holds, and the initials `bry-avatar` draws. */
export interface MemberName {
  id: string;
  name: string;
  initials: string;
}

/** A project's name for an id a screen holds. */
export interface ProjectName {
  id: string;
  name: string;
}

/**
 * What `ui/navigate` opens: a chat, a project's file, a project's page (Brydio `24d7144`, one the person can open)
 * or one of the app's own items. `{ kind: 'item', id: null }` closes the open item and returns to the screen (Brydio's G14).
 */
export type NavigateTarget = { kind: 'chat' | 'file' | 'item' | 'project'; id: string } | { kind: 'item'; id: null };

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

/** One supported Brydio API action. The host owns the closed registry behind it. */
export type ApiAction =
  | 'projects.list'
  | 'projects.get'
  | 'projects.create'
  | 'projects.update'
  | 'projects.remove'
  | 'projects.archiveChats'
  | 'files.list'
  | 'files.read'
  | 'files.upload'
  | 'files.addFromConnection'
  | 'files.replace'
  | 'files.remove'
  | 'chats.list'
  | 'chats.get'
  | 'chats.create'
  | 'chats.update'
  | 'chats.send'
  | 'chats.remove'
  | 'connections.request';

/** The host grant an API action needs. Connections are always granted by name. */
export type ApiGrant = 'projects' | 'files' | 'chats' | `connection:${string}`;

export interface ApiCallParams {
  action: ApiAction;
  input: Record<string, unknown>;
}

export interface UiNavigateParams {
  to: NavigateTarget;
}

export interface UiToastParams {
  text: string;
  tone?: ToastTone;
}

/** `data/subscribe` and `data/unsubscribe`: the envelope's `id` is the call's, answered `data/result` or `data/error`. */
export interface DataWatchParams {
  collection: string;
}

/**
 * What a worker can do beyond the protocol, said in `worker/ready`'s
 * `capabilities`. `hot`: a development build that takes `dev/update`.
 */
export type WorkerCapability = 'ack' | 'hot';

/**
 * `dev/update` (host to worker, `brydio dev` only): a new build of the
 * screen is at `entry`. The worker swaps its components in place and says
 * `dev/updated`, or says `dev/restart` with why, and the host starts it over.
 */
export interface DevUpdateParams {
  entry: string;
  build: number;
}

/** `dev/updated` and `dev/restart`: which build, and for a restart why, in a sentence. */
export interface DevUpdatedParams {
  build: number;
  reason?: string;
}

/** The methods a worker sends. */
export const WORKER_METHODS = [
  'worker/ready',
  'tree/mount',
  'tree/patch',
  'tools/call',
  'api/call',
  'data/get',
  'data/list',
  'data/subscribe',
  'data/unsubscribe',
  'ui/navigate',
  'ui/toast',
  'host/members',
  'host/projects',
  'ui/message',
  'tree/ack',
  'dev/updated',
  'dev/restart',
] as const;

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

/** A watched collection's changes, gathered for `COALESCE_MS`, each record once at its latest. */
export interface DataChangedParams {
  collection: string;
  changes: DataChange[];
}

/** A watch stopped without being asked to, and why, in a sentence. */
export interface DataEndedParams {
  collection: string;
  message: string;
}

/** `data/result` for a subscribe: `{ id, result: { watching } }`. */
export interface DataResultParams {
  id: string | number;
  result: unknown;
}

/** `ui/result` answers a `ui/navigate` that carried an id: it is open. `ui/error` carries `{ id, error }`. */
export interface UiResultParams {
  id: string | number;
  result: { opened: boolean };
}

export const HOST_METHODS = [
  'host/context',
  'tree/event',
  'tree/refused',
  'tools/result',
  'tools/error',
  'api/result',
  'api/error',
  'data/result',
  'data/error',
  'data/changed',
  'data/ended',
  'ui/result',
  'ui/error',
  'host/result',
  'host/error',
  'dev/update',
  'worker/teardown',
] as const;

export type HostMethod = (typeof HOST_METHODS)[number];
