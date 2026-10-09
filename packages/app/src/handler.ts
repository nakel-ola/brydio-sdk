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

/**
 * Where a call came from: the assistant, the app's screen, a sidebar folder
 * listing its rows, a visitor on one of the app's public pages (P3), or one
 * of the app's timers (PJ01).
 */
export type HandlerOrigin = 'assistant' | 'screen' | 'folder' | 'public' | 'timer';

/** The caller's place in the workspace: its creator, an admin, or anyone else. */
export type WorkspaceRole = 'owner' | 'admin' | 'member';

/** A workspace member calling: from the assistant, the app's screen or a folder. */
export interface MemberCaller {
  /** An id to compare and record, never something that authenticates. */
  readonly userId: string;
  readonly origin: Exclude<HandlerOrigin, 'public'>;
  /** Their role in the workspace, so a handler can let an admin do more (delete others' comments). */
  readonly role: WorkspaceRole;
  /** On a timer's run (`origin: 'timer'`): its key and the time it was due (ISO). The caller is who set it. */
  readonly timer?: { readonly key: string; readonly due: string };
}

/**
 * Someone with no Brydio account, on one of the app's public pages (P3).
 * Only a custom tool marked `public` is ever run for one. Brydio knows
 * nothing about them, so there is no id.
 *
 * A visitor's client is smaller than a member's:
 *
 * - `data` is held to the collection flags: `get` and `list` only where the
 *   collection is `publicRead`, `create` only where it is `publicSubmit`,
 *   and never `update`, `remove` or `batch`. Records come back without who
 *   made or changed them.
 * - `tools.call` reaches only the app's other `public` tools.
 * - `connection`, `model`, `secrets`, `notify`, `members`, `approvals`,
 *   `files`, `chat`, `directory`, `webhooks` and another app's tool refuse
 *   with the code `not_for_visitors`.
 */
export interface VisitorCaller {
  readonly userId: null;
  readonly origin: 'public';
  readonly role: 'anonymous';
}

/**
 * Who is calling: a member, or a visitor on a public page. Tell them apart
 * with `caller.role === 'anonymous'` (or `caller.userId === null`), which
 * narrows to `VisitorCaller`.
 */
export type HandlerCaller = MemberCaller | VisitorCaller;

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
  /**
   * Every answer of one group of an anonymous collection, removed for good
   * without being read (P13): how a form, or one of its rounds, takes its
   * anonymous answers with it, even a group under the minimum that can't be
   * listed. The answer is the same however many there were, none included.
   * From a write tool only. Refused `not_anonymous` for any other
   * collection, and `anonymous_needs_group` without one group value.
   */
  removeGroup(collection: string, group: string | number | boolean): Promise<{ removedGroup: string | number | boolean }>;
  batch(collection: string, changes: unknown[]): Promise<unknown[]>;
}

/**
 * One of the app's other tools, at most three deep, never itself.
 *
 * Another installed app's tool is called by the name the assistant knows it
 * by, `<slug>__<tool>` (`tasks__create_numbered_issue`), when the manifest's
 * `grants.tools` names it exactly so (`*` covers only the app's own tools)
 * (FO07). Brydio finds that app's instance as the assistant would: the
 * project in `input.project` when that project has its own (or shows one),
 * else the workspace's one. It runs as the caller, with every check that app
 * makes of a person, under that app's grants and admin switches; a write only
 * from a write tool. Refusals end with their code: `cross_app_not_granted`,
 * `cross_app_self`, `cross_app_unknown`, `cross_app_no_instance`,
 * `cross_app_no_tool`, `cross_app_blocked`, `read_tool`.
 */
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

/** What `chat.post` takes: a room the caller can post in, plain text, and maybe one of the app's chat cards. */
export interface ChatPost {
  /** The room's id. */
  room: string;
  /** Plain text, up to 2000 characters. `@channel` and `@here` are never tags. */
  text: string;
  /** One of the manifest's `chat-card` placements, by key, opened at `route` (default `/`). */
  card?: { placement: string; route?: string };
}

/**
 * Posting in a workspace chat (`tasks/forms` FO03), with the `chat` host
 * grant (not `chats`, which is the typed API's reach into a person's
 * assistant conversations), from a write tool's handler, never a visitor's.
 *
 * The caller must be able to post in the room themselves (in an announcement
 * channel, its managers and the people it names). The message is written by
 * the app's own member, made the first time the instance posts and added to
 * the room; in an announcement channel a manager must name it a poster. A
 * direct message is refused. With `card`, people who can open this instance
 * see the card's screen in the message, with `placement.kind === 'chat-card'`
 * and the card's route; anybody else reads a plain line. 30 posts a minute
 * per instance.
 *
 * `rooms` lists the caller's own rooms, at most 50, archived ones left out,
 * matching `query` in their names when given, so a screen can let somebody
 * pick where to post. `canPost` is whether `post` would take this app's post
 * there. It needs only the `chat` grant, so a read tool may call it.
 *
 * Refusals end with their code: `chat_cannot_post`,
 * `chat_app_not_poster`, `chat_card_unknown`, `chat_text_too_long`,
 * `chat_invalid`, `chat_rate_limited`, `not_granted`, `read_tool`.
 */
export interface HandlerChat {
  post(message: ChatPost): Promise<{ messageId: string }>;
  rooms(query?: string): Promise<ChatRoom[]>;
}

/** One of the caller's rooms, as `chat.rooms` lists it. */
export interface ChatRoom {
  id: string;
  /** A channel's name; a DM or group's is its other members' names. */
  name: string;
  kind: 'channel' | 'dm' | 'group';
  /** Whether `chat.post` would take this app's post there. */
  canPost: boolean;
}

/** A person as the directory shows them to the caller (FO02). Ids are user ids, as member fields hold them. */
export interface DirectoryProfile {
  id: string;
  name: string;
  email: string | null;
  /** Job title. Null when unset, or kept to themselves (unless it is the caller's own). */
  title: string | null;
  /** Department, likewise. */
  team: string | null;
  /** Their manager, likewise. */
  manager: { id: string; name: string } | null;
}

/** One of the workspace's directory groups. */
export interface DirectoryGroup {
  id: string;
  name: string;
  kind: 'team' | 'department' | 'location' | 'custom';
}

/**
 * The workspace directory, read as the caller may see it (`tasks/forms`
 * FO02), with the `directory` host grant, never a visitor's.
 *
 * - `profile` answers one member, or null for anybody who isn't one (a bot,
 *   a guest, someone who left, an unknown id). A field a person keeps to
 *   themselves is null to everyone but them.
 * - `groups` lists the active groups.
 * - `membersOf` answers a group's members' user ids; an unknown group has none.
 */
export interface HandlerDirectory {
  profile(userId: string): Promise<DirectoryProfile | null>;
  groups(): Promise<DirectoryGroup[]>;
  membersOf(groupId: string): Promise<string[]>;
}

/**
 * A signed webhook to another service (`tasks/forms` FO07), with the
 * `webhooks` host grant, from a write tool's handler, never a visitor's.
 *
 * `body` is sent as JSON (at most 64 KB) in a POST to an https address only;
 * a private, local or metadata address, or a redirect to one, is refused
 * before anything is sent. The request carries `X-Brydio-Instance` and
 * `X-Brydio-Signature: sha256=<hex HMAC-SHA256 of the exact body>`, keyed
 * with the instance's signing secret, which a workspace admin reads from
 * `GET /apps/instances/:id/webhook-secret`. Only the receiver's status comes
 * back. 10 seconds to answer; 60 a minute per instance. Refusals end with
 * their code: `webhook_not_https`, `webhook_private_address`,
 * `webhook_url_refused`, `webhook_too_large`, `webhook_invalid`,
 * `webhook_timeout`, `webhook_failed`, `webhook_rate_limited`,
 * `not_granted`, `read_tool`.
 */
export interface HandlerWebhooks {
  send(request: { url: string; body: unknown }): Promise<{ status: number }>;
}

/** A timer as Brydio keeps it (PJ01). */
export interface HandlerTimer {
  readonly key: string;
  readonly tool: string;
  /** A one-off's time (ISO), or null for a repeat. */
  readonly at: string | null;
  /** A repeat's rule, or null for a one-off. */
  readonly rrule: string | null;
  readonly zone: string;
  /** When it runs next (ISO); null while paused. */
  readonly next: string | null;
  readonly status: 'active' | 'paused';
  /** Why it is paused, in words. */
  readonly reason: string | null;
  /** Who set it: it runs as them. */
  readonly setBy: string;
  readonly runs: number;
  readonly lastRunAt: string | null;
  /** `ok`, `error: …` or `paused`. */
  readonly lastOutcome: string | null;
}

/**
 * One of the app's own tools run later (`tasks/database` PJ01), with the
 * `timers` host grant; `set` and `cancel` from a write tool's handler,
 * never a visitor's.
 *
 * - `set({ key, tool, input?, at })` runs `tool` once at `at`;
 *   `set({ key, tool, input?, rrule, start?, zone? })` runs it on an RFC 5545
 *   rule (no DTSTART) read on the wall clock of `zone` (IANA, default UTC),
 *   counted from `start` (default now, whole minutes). Setting a key again
 *   moves that timer, and makes it the new caller's.
 * - It runs as the person whose call set it, as they are then: a member
 *   still, with their access today, through the same checks as a click on
 *   the app's screen. Their handler sees `caller.origin === 'timer'` and
 *   `caller.timer`. Someone who left, an app switched off or a tool blocked
 *   pauses it (set it again to resume); a tool the app no longer has ends it.
 * - A repeat missed while Brydio was down runs once, then keeps its times.
 *   Three failed runs in a row pause it. A one-off goes once it has run.
 * - Limits: 100 timers an instance, a repeat at most every 15 minutes, at
 *   most 400 days ahead, input at most 8 KB as JSON, 20 runs a minute an
 *   instance (the rest wait a minute). Removing the instance or the app
 *   removes its timers.
 * - Refusals end with their code: `timer_invalid`, `timer_too_often`,
 *   `timer_too_far`, `timer_too_large`, `timer_unknown_tool`, `timer_limit`,
 *   `timer_unavailable`, `not_granted`, `read_tool`.
 */
export interface HandlerTimers {
  set(
    timer:
      | { key: string; tool: string; input?: Record<string, unknown>; at: string }
      | { key: string; tool: string; input?: Record<string, unknown>; rrule: string; start?: string; zone?: string }
  ): Promise<HandlerTimer>;
  cancel(key: string): Promise<{ cancelled: boolean }>;
  list(): Promise<{ items: HandlerTimer[] }>;
}

/** An attendee as a handler reads and writes them (CA02): members by user id, bots by id, outsiders by address. */
export interface CalendarAttendee {
  kind: 'person' | 'bot' | 'email';
  member?: string;
  bot?: string;
  email?: string;
  name?: string;
  response: CalendarResponse;
  optional?: boolean;
  organizer?: boolean;
}

export type CalendarResponse = 'needs_action' | 'accepted' | 'tentative' | 'declined';

/** One occurrence on the event layer. Times are ISO strings; a busy-only one has no words. */
export interface CalendarOccurrence {
  /** `event` for a single event; `event@<original start ISO>` for an occurrence of a series. */
  id: string;
  event: string;
  series: string | null;
  originalStart: string | null;
  /** Whose calendar it sits on (user id), and who organised it. */
  on: string | null;
  owner: string | null;
  source: 'brydio' | 'google' | 'outlook' | 'caldav';
  /** The connected calendar it came from, if any. */
  calendar: string | null;
  calendarName: string | null;
  start: string;
  end: string;
  allDay: boolean;
  timeZone: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  showAs: 'busy' | 'free' | 'tentative' | 'away';
  /** The viewer may see only that the time is taken. */
  busyOnly: boolean;
  private: boolean;
  title?: string;
  description?: string | null;
  location?: string | null;
  attendees?: CalendarAttendee[];
  conferenceUrl?: string | null;
  webLink?: string | null;
  room: string | null;
  call: string | null;
  project: string | null;
  recurring: boolean;
  rrule: string | null;
  /** On the viewer's own calendar, so they may change it. */
  editable: boolean;
}

/** One person's calendar as the viewer may see it. */
export interface CalendarPerson {
  member: string;
  timeZone: string;
  /** Their zone is kept from the viewer: use `working` from `busy`. */
  timeZoneHidden?: true;
  workingHours: { days: number[]; start: string; end: string };
  sharing: 'busy' | 'details';
  freshness: { state: 'ok'; syncedAt: string | null } | { state: 'none' } | { state: 'failed'; calendars: string[] };
}

/** What `calendar.create` and `calendar.update` take. */
export interface CalendarEventInput {
  title: string;
  start: string;
  end: string;
  /** IANA. All-day events are dates in this zone. */
  timeZone: string;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  /** RFC 5545 RRULE value without `RRULE:` or DTSTART, e.g. `FREQ=WEEKLY;BYDAY=MO`. */
  rrule?: string | null;
  exdates?: string[];
  attendees?: (({ member: string } | { bot: string } | { email: string; name?: string }) & { optional?: boolean })[];
  showAs?: 'busy' | 'free' | 'tentative' | 'away';
  visibility?: 'default' | 'private';
  project?: string | null;
  room?: string | null;
}

/**
 * The caller's calendar on Brydio's event layer (CA02), for an app with the
 * `calendar` host grant. Everything is done as the caller: reads show what
 * their colleagues' sharing allows (busy-only by default), and writes change
 * only the caller's own events. A write goes on to the caller's Google
 * calendar when they have one; the app never talks to Google or Microsoft.
 *
 * Reads work from any tool; `create`, `update`, `cancel` and `respond` need a
 * write tool. Never for a visitor. Refusals end with a code:
 * `(not_granted)`, `(read_tool)`, `(calendar_invalid)`, `(calendar_not_found)`,
 * `(calendar_forbidden)`, `(calendar_unavailable)`.
 */
export interface HandlerCalendar {
  /** Events overlapping [from, to) (62 days at most): the caller's, or each named member's. */
  range(query: { from: string; to: string; people?: string[]; project?: string; cancelled?: boolean }): Promise<{ people: CalendarPerson[]; events: CalendarOccurrence[] }>;
  /** Busy spans and working windows of the people named (the caller by default). */
  busy(query: { from: string; to: string; people?: string[] }): Promise<{
    people: (CalendarPerson & { busy: { start: string; end: string }[]; working: { start: string; end: string }[] })[];
  }>;
  /** One event or occurrence (by its id), or null. */
  event(id: string): Promise<(CalendarOccurrence & { exdates: string[]; seriesEndsAt: string | null }) | null>;
  /** The caller's connected calendars. */
  calendars(): Promise<{
    items: { id: string; provider: 'google' | 'outlook' | 'caldav'; name: string; color: string | null; primary: boolean; enabled: boolean; canWrite: boolean; writeDefault: boolean; status: string }[];
  }>;
  create(event: CalendarEventInput): Promise<CalendarOccurrence | null>;
  /** `scope` `this` changes one occurrence (an occurrence id names it); `all` the event or series. */
  update(id: string, event: CalendarEventInput, options?: { scope?: 'this' | 'all'; originalStart?: string }): Promise<CalendarOccurrence | null>;
  cancel(id: string, options?: { scope?: 'this' | 'all'; originalStart?: string }): Promise<{ cancelled: string }>;
  /** The caller answers an invitation they are on (a series answers as a whole). */
  respond(id: string, response: CalendarResponse): Promise<CalendarOccurrence | null>;
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
  readonly chat: HandlerChat;
  readonly directory: HandlerDirectory;
  readonly webhooks: HandlerWebhooks;
  readonly timers: HandlerTimers;
  readonly calendar: HandlerCalendar;
  readonly caller: HandlerCaller;
}

/** A handler: the default export of a custom tool's `handler` file. */
export type Handler<I = Record<string, unknown>, O = unknown> = (input: I, client: HandlerClient) => O | Promise<O>;
