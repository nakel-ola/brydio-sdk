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
/** The caller's place in the workspace: its creator, an admin, or anyone else. */
export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface HandlerCaller {
  readonly userId: string;
  readonly origin: HandlerOrigin;
  /** Their role in the workspace, so a handler can let an admin do more (delete others' comments). */
  readonly role: WorkspaceRole;
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

/**
 * Who may see what, answered by Brydio for an app with the `members` host
 * grant: yes or no, from Brydio's own project rule, never a list of people.
 */
export interface HandlerMembers {
  /** Whether this workspace member can open the project (a member, its maker, or an admin of a shared one). */
  canSeeProject(projectId: string, userId: string): Promise<boolean>;
}

/** What a notification is about, in words every app shares, so a person's settings read the same for each. */
export type NoticeKind = 'assigned' | 'mentioned' | 'commented' | 'status_changed' | 'due_soon' | 'overdue' | 'reminder' | 'updated';

/** One notification: whom to tell, what about, and the record it opens. */
export interface Notice {
  /** The member's id, as a member field holds it. */
  to: string;
  kind: NoticeKind;
  /** The collection and id of the record a click opens. */
  collection: string;
  record: string;
  /** The line people read first: the record's title, say "WEB-12 Crash on save". Up to 200 characters. */
  title: string;
  /** A second line: "Ada assigned it to you". Up to 500 characters. */
  body?: string;
}

/** A notification for later: when, and the app's own key to move or cancel it by (letters, digits, `: _ . -`). */
export interface NoticeAt extends Notice {
  /** An ISO date and time, at most 400 days ahead. A time already past goes out within a minute. */
  at: string;
  key: string;
}

/**
 * Why Brydio did not send a notice. Not an error: a handler carries on.
 *
 * - `self`: the person is the one who caused it.
 * - `not_a_member`: not an active person in this workspace.
 * - `cannot_see`: they can't open this instance or the record's project.
 * - `bot`: a bot hears of its work another way.
 * - `no_record`: the record isn't in this instance (or was deleted).
 * - `muted` / `kind_off`: the person turned this app, or this kind, off.
 * - `rate_limited`: this app told them too much in the last hour.
 */
export type NoticeSkip = 'self' | 'not_a_member' | 'cannot_see' | 'bot' | 'no_record' | 'muted' | 'kind_off' | 'rate_limited';

export type NoticeSent = { notified: true; held?: true } | { notified: false; reason: NoticeSkip };
export type NoticeSet = { scheduled: true } | { scheduled: false; reason: NoticeSkip };

/**
 * Telling a member about one of the app's records (`tasks/tasks-gaps` TK01),
 * with the `notify` host grant, from a write tool's handler. Brydio delivers
 * it as a desktop or in-app notification that opens the record, and holds it
 * through the person's do not disturb and quiet hours.
 *
 * - `send` tells them now (or when their quiet time ends).
 * - `at` tells them at a time; setting the same key again for them moves it.
 *   For a `reminder`, `due_soon` or `overdue`, the caller may set one for
 *   themselves.
 * - `cancel` drops this instance's pending notices with the key, for one
 *   member or everyone.
 */
export interface HandlerNotify {
  send(notice: Notice): Promise<NoticeSent>;
  at(notice: NoticeAt): Promise<NoticeSet>;
  cancel(key: string, to?: string): Promise<{ cancelled: number }>;
}

/** Who a step waits on: a member by id, the workspace admins, or (until Directory) the person's manager or a group. */
export type ApproverSpec =
  | { type: 'person'; principalId: string }
  | { type: 'role'; role: 'admin' }
  | { type: 'manager' }
  | { type: 'group'; groupId: string };

/** How many of a step's approvers must say yes: one, every one, or `count`. */
export type ApprovalStepRule = 'any' | 'all' | 'count';

export interface ApprovalStepInput {
  /** "Manager", "Finance": what the request shows for this step. */
  name?: string;
  approvers: ApproverSpec[];
  rule: ApprovalStepRule;
  /** With `rule: 'count'`: how many yeses. */
  count?: number;
}

/** A value shown on the request: `text`, `long_text`, `number`, `money`, `date`, `date_range`, `choice`, `person` or `file`. */
export interface ApprovalField {
  key: string;
  label: string;
  type: string;
  value: unknown;
}

/** Asking people to approve one of the app's records. */
export interface AppApprovalInput {
  /** What people read first. Up to 200 characters. */
  title: string;
  note?: string;
  fields?: ApprovalField[];
  /** In order; a decline ends the request. At least one. */
  steps: ApprovalStepInput[];
  /** The record it is about: a click opens it, and it hears the outcome. */
  record: { collection: string; id: string };
  /** A text field on the record Brydio sets to `pending`, `approved`, `declined` or `cancelled`. */
  statusField?: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'declined' | 'cancelled';
export type ApprovalStepStatus = 'waiting' | 'active' | 'approved' | 'declined' | 'skipped';
export type ApprovalAssigneeStatus = 'waiting' | 'approved' | 'declined' | 'passed';

export interface ApprovalPerson {
  principalId: string;
  name: string;
  avatarUrl: string | null;
  kind: 'human' | 'bot' | 'system';
}

/** One request as Brydio holds it: its steps, who each waits on, and what they said. */
export interface ApprovalState {
  id: string;
  title: string;
  note: string | null;
  fields: ApprovalField[];
  requester: ApprovalPerson;
  status: ApprovalStatus;
  currentStep: number | null;
  steps: {
    index: number;
    name: string | null;
    rule: ApprovalStepRule;
    count: number | null;
    status: ApprovalStepStatus;
    assignees: { person: ApprovalPerson; status: ApprovalAssigneeStatus; reason: string; comment: string | null; decidedAt: string | null }[];
    /** Plain words when the step went to the admins instead, and why. */
    note: string | null;
  }[];
  createdAt: string;
  decidedAt: string | null;
}

/**
 * Asking people to approve one of the app's records (`tasks/approvals` AP01),
 * with the `approvals` host grant. The requester is the caller and never an
 * approver; a step with nobody left goes to the workspace admins and says why.
 * `request` and `cancel` need a write tool.
 *
 * - `request` raises it and answers its id, to keep on the record.
 * - `get` reads one this instance raised.
 * - `cancel` stops one still pending.
 *
 * Show it on a screen with `bry-approval`; an approver decides there or in
 * Brydio's inbox, and `statusField` on the record follows the outcome.
 */
export interface HandlerApprovals {
  request(input: AppApprovalInput): Promise<{ id: string; status: ApprovalStatus }>;
  get(id: string): Promise<ApprovalState>;
  cancel(id: string): Promise<{ cancelled: boolean }>;
}

/** Everything a handler is given beside its input. */
export interface HandlerClient {
  readonly data: HandlerData;
  readonly tools: HandlerTools;
  connection(name: string): HandlerConnection;
  readonly model: HandlerModel;
  readonly secrets: HandlerSecrets;
  readonly members: HandlerMembers;
  readonly notify: HandlerNotify;
  readonly approvals: HandlerApprovals;
  readonly caller: HandlerCaller;
}

/** A handler: the default export of a custom tool's `handler` file. */
export type Handler<I = Record<string, unknown>, O = unknown> = (input: I, client: HandlerClient) => O | Promise<O>;
