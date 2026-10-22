import type { HandlerFinance, InvoicePaymentInput } from '@brydio/app/handler';
import type { HandlerSign, SignRequest } from '@brydio/app/handler';
import { createHmac } from 'node:crypto';

import type {
  AppApprovalInput,
  ApprovalState,
  ChatPost,
  ChatRoom,
  DirectoryGroup,
  DirectoryProfile,
  Handler,
  HandlerCaller,
  HandlerClient,
  HandlerConnectionRequest,
  HandlerCalendar,
  HandlerTimer,
  MetricRead,
  Notice,
  NoticeAt,
  NoticeKind,
} from '@brydio/app/handler';
import { bookingStateOf, fakeCalendar, type FakeBookingState, type FakeCalendarEvent, type FakeCalendarOptions } from './calendar.ts';
import { MAX_SECRET_CHARS, SECRET_NAME, appToolPrefix, crossAppTool, effectivePlacementKey, type ManifestExtensions } from '@brydio/manifest';

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
  /**
   * Who is calling. A user id and an origin; never a credential, as in Brydio.
   * `{ role: 'anonymous' }` (or `{ origin: 'public' }`) runs the handler for a
   * visitor on a public page (P3): `data` is held to the manifest's
   * `publicRead` and `publicSubmit`, `tools.call` to its `public` tools, and
   * the rest of the client refuses with `not_for_visitors`.
   */
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
  /** Who can open which project, for `members.canSeeProject`. Without it, everyone can. */
  canSeeProject?: (projectId: string, userId: string) => boolean | Promise<boolean>;
  /**
   * Whom `notify` may reach, as Brydio's member and visibility check would
   * answer. Without it, anyone but the caller. Answer false to have the fake
   * say `cannot_see`.
   */
  canNotify?: (to: string, notice: Notice) => boolean | Promise<boolean>;
  /**
   * Whether the caller may post in a room, for `chat.post` (FO03): `true`,
   * `false` (refused `chat_cannot_post`), or `'not_poster'` for an
   * announcement channel that doesn't name the app (`chat_app_not_poster`).
   * A post `to` a member asks about `dm:<their user id>`. Without it, every
   * room takes the post.
   */
  canPost?: (room: string) => boolean | 'not_poster' | Promise<boolean | 'not_poster'>;
  /**
   * The caller's rooms, for `chat.rooms`, and for `chat.post` when `canPost`
   * is not given: a post into a room listed with `canPost: false` is refused
   * `chat_cannot_post`.
   */
  chat?: { rooms?: ChatRoom[] };
  /**
   * The workspace directory, for `directory.*` (FO02), already as the caller
   * may see it: profiles by user id, and groups with their members' user ids.
   */
  directory?: { profiles?: DirectoryProfile[]; groups?: (DirectoryGroup & { members?: string[] })[] };
  /**
   * The receiver's status for each `webhooks.send` (FO07). Without it, 200.
   * The fake signs with `webhookSecret` (default `whsec_test`), as Brydio
   * signs with the instance's secret.
   */
  webhook?: (request: { url: string; body: unknown }) => number | Promise<number>;
  webhookSecret?: string;
  /** The event layer as the caller sees it (CA02): events by id, sharing per member. */
  calendar?: FakeCalendarOptions;
  /** Already caller-visible dashboard observations. Omit while dashboards is unavailable. */
  metrics?: MetricRead[];
  /** Explicit native-signing stand-in. No fake certificate or implied PDF seal. */
  sign?: HandlerSign;
  /** Explicit Finance stand-in; no fabricated settlements. */
  finance?: Partial<HandlerFinance>;
  /** Explicit People answers already authorized as this caller. Omit to fail closed. */
  people?: {
    call?: (operation: string, input?: Record<string, unknown>) => Promise<unknown>;
    results?: Record<string, unknown>;
  };
  /** Timers the instance already holds (PJ01), by key, as `timers.list` would show them. */
  timers?: FakeTimer[];
  /** "Now", for a timer's `next`; without it, the real clock. */
  now?: Date;
}

/** A timer as the fake host keeps it (PJ01): what `timers.list` shows, with the input the tool will get. */
export interface FakeTimer extends HandlerTimer {
  input: Record<string, unknown>;
}

/** A post a handler made with `chat.post`, as the fake host kept it. */
export interface FakeChatPost extends ChatPost {
  messageId: string;
}

/** A webhook a handler sent, as the receiver would have had it. */
export interface FakeWebhook {
  url: string;
  /** The exact JSON sent. */
  body: string;
  headers: { 'content-type': 'application/json'; 'x-brydio-instance': string; 'x-brydio-signature': string };
  status: number;
}

/** What a handler asked Brydio to tell people, as the fake host kept it. */
export interface FakeNotices {
  /** Sent now, in order. */
  sent: Notice[];
  /** Set for later, by `<to>:<key>`, as they stand after the run (moved and cancelled ones applied). */
  pending: Map<string, NoticeAt>;
}

/**
 * The approvals a handler raised, as the fake host keeps them, and a way for
 * a test to answer as an approver would. Each step waits on the people its
 * specs name (a person by id; `admin`, `manager` and `group` as the one
 * pretend admin, `admin_test`), never the requester.
 */
export interface FakeApprovals {
  /** By id, as they stand after the run. */
  requests: Map<string, ApprovalState & { record: AppApprovalInput['record']; statusField: string | null }>;
  /** Answers as `by` would, in the engine's words; a decline ends the request. */
  decide(id: string, by: string, decision: 'approve' | 'decline', comment?: string): ApprovalState;
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
  /** Who the handler notified, and what it set for later. */
  notices: FakeNotices;
  /** What the handler asked people to approve. */
  approvals: FakeApprovals;
  /** What it posted in chats. */
  posts: FakeChatPost[];
  /** The webhooks it sent. */
  webhooks: FakeWebhook[];
  /** The instance's timers as they stand after the run, by key (set, moved and cancelled ones applied). */
  timers: Map<string, FakeTimer>;
  /** The calendar's events after the run, by id (created, changed and cancelled ones applied). */
  calendar: Map<string, FakeCalendarEvent>;
  /** Booking links' offers and bookings after the run (CA05), secrets included. */
  booking: FakeBookingState;
}

const NOTICE_KINDS: readonly NoticeKind[] = ['assigned', 'mentioned', 'commented', 'status_changed', 'due_soon', 'overdue', 'reminder', 'updated'];
/** Kinds a caller may set for themselves with `notify.at`, as Brydio allows. */
const OWN_REMINDERS: readonly NoticeKind[] = ['reminder', 'due_soon', 'overdue'];
/** The calendar calls a visitor on a public page may make (CA05). */
const CALENDAR_VISITOR_CALLS = new Set(['free', 'book', 'booking', 'rebook', 'unbook']);

const NOTICE_KEY = /^[A-Za-z0-9:_.-]{1,120}$/;

/** What a visitor's client refuses with (P3): a plain sentence, and `code: 'not_for_visitors'`. */
export class NotForVisitors extends Error {
  readonly code = 'not_for_visitors';
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
  notices: FakeNotices;
  approvals: FakeApprovals;
  posts: FakeChatPost[];
  webhooks: FakeWebhook[];
  timers: Map<string, FakeTimer>;
  calendar: Map<string, FakeCalendarEvent>;
  booking: FakeBookingState;
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

  const notices: FakeNotices = { sent: [], pending: new Map() };
  const callerId = options.caller?.userId ?? 'user_test';
  // Brydio's checks on a notice, in its words: the grant, a write tool, the shape.
  const notifies = (method: string, args: unknown[]) => {
    notForVisitors(method);

    const allowed = manifest ? (manifest.grants?.host ?? []).some(grant => grant === 'notify' || grant === '*') : true;

    if (!allowed) throw new Error(`${appName} did not ask to notify people about its records.`);
    if (options.write === false) throw new Error(`${tool} is a read tool, so its handler can't notify anyone.`);
    keeps(method, args);
  };
  const checkNotice = (notice: Notice) => {
    if (notice?.delivery !== undefined && notice.delivery !== 'co-partner') throw new Error('notify delivery is co-partner, or omitted for the bell.');
    if (!notice || typeof notice.to !== 'string' || !notice.to) throw new Error('notify needs `to`: the member to tell.');
    if (!NOTICE_KINDS.includes(notice.kind)) throw new Error(`notify's kind is one of ${NOTICE_KINDS.join(', ')}.`);
    if (typeof notice.collection !== 'string' || !notice.collection) throw new Error('notify needs `collection`: the collection the record is in.');
    if (typeof notice.record !== 'string' || !notice.record) throw new Error('notify needs `record`: the id of the record it is about.');
    if (typeof notice.title !== 'string' || !notice.title.trim()) throw new Error('notify needs a `title`.');
  };
  const reaches = async (notice: Notice) => (options.canNotify ? await options.canNotify(notice.to, notice) : true);

  // Brydio's checks on an approval, in its words: the grant, a write tool to raise or cancel, the shape.
  const asksApproval = (method: string, args: unknown[]) => {
    notForVisitors(method);

    const allowed = manifest ? (manifest.grants?.host ?? []).some(grant => grant === 'approvals' || grant === '*') : true;

    if (!allowed) throw new Error(`${appName} did not ask to ask people to approve its records.`);
    if (method !== 'approvals.get' && options.write === false) throw new Error(`${tool} is a read tool, so its handler can't ask for or cancel an approval.`);
    keeps(method, args);
  };
  const approvals = fakeApprovals(callerId);

  // The three Forms seams (FO02, FO03, FO07), refused in Brydio's words, each ending with its code.
  const hostGranted = (capability: string) => (manifest ? (manifest.grants?.host ?? []).some(grant => grant === capability || grant === '*') : true);
  const seam = (capability: 'chat' | 'directory' | 'webhooks' | 'timers' | 'calendar' | 'metrics' | 'sign' | 'finance' | 'people' | 'model', words: string, writing: boolean) => (method: string, args: unknown[]) => {
    notForVisitors(method);
    if (!hostGranted(capability)) throw new Error(`${appName} did not ask to ${words}. (not_granted)`);
    if (writing && options.write === false) {
      const what = method === 'chat.post' ? 'post in a chat' : method.startsWith('timers.') ? 'set or cancel a timer' : method.startsWith('calendar.') ? 'change the calendar' : method === 'people.call' ? 'change People records' : 'send a webhook';

      throw new Error(`${tool} is a read tool, so its handler can't ${what} (read_tool)`);
    }
    keeps(method, args);
  };
  const calendarEvents = new Map((options.calendar?.events ?? []).map(one => [one.id, { ...one }]));
  const bookingState = bookingStateOf(options.calendar ?? {});
  const calendar = fakeCalendar(options.calendar ?? {}, options.caller?.userId ?? 'user_test', calendarEvents, bookingState, options.caller?.role === 'anonymous' || options.caller?.origin === 'public');
  const timers = new Map((options.timers ?? []).map(one => [one.key, { ...one }]));
  const appTools = manifest ? new Set((manifest.tools?.custom ?? []).map(one => one.name)) : null;
  const posts: FakeChatPost[] = [];
  const sentHooks: FakeWebhook[] = [];
  const profiles = new Map((options.directory?.profiles ?? []).map(one => [one.id, one]));
  const groups = options.directory?.groups ?? [];

  // A visitor on a public page (P3): only what the app marks public.
  const visitor = options.caller?.role === 'anonymous' || options.caller?.origin === 'public';
  const caller: HandlerCaller = visitor
    ? { userId: null, origin: 'public', role: 'anonymous', ...(options.caller?.tool ? {tool:options.caller.tool} : {}) }
    : {
        userId: options.caller?.userId ?? 'user_test',
        ...(options.caller?.tool ? {tool:options.caller.tool} : {}),
        origin: (options.caller?.origin as Exclude<HandlerCaller['origin'], 'public'> | undefined) ?? 'assistant',
        role: (options.caller?.role as Exclude<HandlerCaller['role'], 'anonymous'> | undefined) ?? 'owner',
        ...((options.caller as { timer?: { key: string; due: string } } | undefined)?.timer
          ? { timer: (options.caller as { timer: { key: string; due: string } }).timer }
          : {}),
      };
  const notForVisitors = (method: string) => {
    if (visitor) throw new NotForVisitors(`${tool} runs for a visitor on a public page, who can't use ${method.split('.')[0]}.`);
  };
  // Without a manifest there are no flags to hold a visitor to, so only the
  // changes no visitor may ever make are refused.
  const visitorData = (method: string, args: unknown[]) => {
    if (!visitor) return;

    const collection = String(args[0]);
    const declared = manifest?.data?.[collection];
    const read = method === 'data.get' || method === 'data.list';

    if (method === 'data.update' || method === 'data.remove' || method === 'data.removeGroup' || method === 'data.batch') {
      throw new NotForVisitors(`A visitor on a public page can only add records, never change or remove them.`);
    }
    if (manifest && !(read ? declared?.publicRead : declared?.publicSubmit)) {
      throw new NotForVisitors(`${collection} is not open to visitors on a public page.`);
    }
  };
  const visitorTool = (_method: string, args: unknown[]) => {
    if (!visitor || !manifest) return;

    const name = String(args[0]);

    if (!(manifest.tools?.custom ?? []).some(one => one.name === name && one.public === true)) {
      throw new NotForVisitors(`${name} is not open to visitors on a public page.`);
    }
  };
  // Another app's tool by its assistant name (FO07): asked for by exactly that name, never the app itself.
  const crossApp = (_method: string, args: unknown[]) => {
    const name = String(args[0]);

    if ((manifest?.tools?.custom ?? []).some(one => one.name === name)) return;

    const qualified = crossAppTool(name);

    if (!qualified) return;
    if (visitor) throw new NotForVisitors(`${name} is another app's tool, which a visitor on a public page can't use. (not_for_visitors)`);
    if (manifest?.name && qualified.app === appToolPrefix(manifest.name)) throw new Error(`${name} is ${appName}'s own tool: call ${qualified.tool} (cross_app_self)`);
    if (manifest && !(manifest.grants?.tools ?? []).includes(name)) throw new Error(`${appName} did not ask to use ${name} (cross_app_not_granted)`);
  };
  const both =
    (...checks: ((method: string, args: unknown[]) => void)[]) =>
    (method: string, args: unknown[]) => {
      for (const check of checks) check(method, args);
    };
  const hidden = <R>(method: string, run: (...args: never[]) => Promise<R>) =>
    (async (...args: never[]) => {
      const answer = await run(...args);

      return visitor && method !== 'data.batch' ? withoutMembers(answer) : answer;
    }) as unknown as (...args: never[]) => Promise<R>;

  const data = options.data ?? {};
  const peopleCall = recorded('people.call', async (operation: string, input?: Record<string, unknown>) => {
    if (options.people?.call) return options.people.call(operation, input);
    if (options.people?.results && Object.hasOwn(options.people.results, operation)) return options.people.results[operation];
    throw new Error('People is unavailable. (people_unavailable)');
  }, (method, args) => seam('people', 'use People host operations', args[0] !== 'context' && args[0] !== 'listPeople' && args[0] !== 'whoOut')(method, args));

  const client: HandlerClient = Object.freeze({
    people: Object.freeze({ call: <T = unknown>(operation: string, input?: Record<string, unknown>) => peopleCall(operation, input) as Promise<T> }),
    data: Object.freeze({
      get: recorded('data.get', hidden('data.get', data.get ?? unavailable('data.get')) as HandlerClient['data']['get'], visitorData),
      list: recorded('data.list', hidden('data.list', data.list ?? unavailable('data.list')) as HandlerClient['data']['list'], visitorData),
      create: recorded('data.create', hidden('data.create', data.create ?? unavailable('data.create')) as HandlerClient['data']['create'], both(visitorData, writes)),
      update: recorded('data.update', data.update ?? unavailable('data.update'), both(visitorData, writes)),
      remove: recorded('data.remove', data.remove ?? unavailable('data.remove'), both(visitorData, writes)),
      removeGroup: recorded('data.removeGroup', data.removeGroup ?? unavailable('data.removeGroup'), both(visitorData, writes)),
      batch: recorded('data.batch', data.batch ?? unavailable('data.batch'), both(visitorData, writes)),
    }),
    tools: Object.freeze({
      call: recorded('tools.call', (options.tools?.call ?? unavailable('tools.call')) as HandlerClient['tools']['call'], both(crossApp, visitorTool, keeps)),
    }) as HandlerClient['tools'],
    connection: (name: string) =>
      Object.freeze({
        request: recorded(
          'connection.request',
          (request: HandlerConnectionRequest) => (options.connection ? options.connection(name, request) : unavailable(`connection("${name}")`)()),
          notForVisitors,
        ),
      }),
    model: Object.freeze({
      generate: recorded('model.generate', (options.model?.generate ?? unavailable('model.generate')) as HandlerClient['model']['generate'], seam('model','use its managed model',false)),
      generateMany: recorded(
        'model.generateMany',
        (options.model?.generateMany ?? unavailable('model.generateMany')) as HandlerClient['model']['generateMany'],
        seam('model','use its managed model',false),
      ),
      summarize: recorded('model.summarize', (options.model?.summarize ?? unavailable('model.summarize')) as HandlerClient['model']['summarize'], seam('model','use its managed model',false)),
      chat: recorded('model.chat', (options.model?.chat ?? unavailable('model.chat')) as HandlerClient['model']['chat'], seam('model','use its managed model',false)),
      stream: recorded('model.stream', (options.model?.stream ?? unavailable('model.stream')) as HandlerClient['model']['stream'], seam('model','use its managed model',false)),
    }) as HandlerClient['model'],
    secrets: Object.freeze({
      get: recorded('secrets.get', async (name: string) => {
        notForVisitors('secrets.get');

        const value = secrets.get(secretOf(name)) ?? null;

        if (value !== null) held.add(value);

        return value;
      }),
      set: recorded('secrets.set', async (name: string, value: string | null) => {
        notForVisitors('secrets.set');

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
    members: Object.freeze({
      canSeeProject: recorded('members.canSeeProject', async (projectId: string, userId: string) => {
        notForVisitors('members.canSeeProject');

        const allowed = manifest ? (manifest.grants?.host ?? []).some(grant => grant === 'members' || grant === '*') : true;

        if (!allowed) throw new Error(`${appName} did not ask to see the names of people.`);
        if (typeof projectId !== 'string' || !projectId || typeof userId !== 'string' || !userId) throw new Error('canSeeProject takes a project id and a member id.');

        return (await options.canSeeProject?.(projectId, userId)) ?? true;
      }),
    }),
    notify: Object.freeze({
      send: recorded(
        'notify.send',
        async (notice: Notice) => {
          checkNotice(notice);
          if (notice.to === callerId) return { notified: false as const, reason: 'self' as const };
          if (!(await reaches(notice))) return { notified: false as const, reason: 'cannot_see' as const };
          if (notice.delivery === 'co-partner') {
            const key = `delivery:${calls.length}`;
            notices.pending.set(`${notice.to}:${key}`, { ...notice, key, at: new Date().toISOString() });
            return { notified: true as const, held: true as const };
          }
          notices.sent.push(notice);

          return { notified: true as const };
        },
        notifies,
      ),
      at: recorded(
        'notify.at',
        async (notice: NoticeAt) => {
          checkNotice(notice);
          if (Number.isNaN(new Date(notice.at).getTime())) throw new Error('notify.at needs `at`: an ISO date and time.');
          if (typeof notice.key !== 'string' || !NOTICE_KEY.test(notice.key)) throw new Error('notify.at needs a `key` (letters, digits, : _ . -, up to 120) to move or cancel it by.');
          if (notice.to === callerId && !OWN_REMINDERS.includes(notice.kind)) return { scheduled: false as const, reason: 'self' as const };
          if (!(await reaches(notice))) return { scheduled: false as const, reason: 'cannot_see' as const };
          notices.pending.set(`${notice.to}:${notice.key}`, notice);

          return { scheduled: true as const };
        },
        notifies,
      ),
      cancel: recorded(
        'notify.cancel',
        async (key: string, to?: string) => {
          if (typeof key !== 'string' || !NOTICE_KEY.test(key)) throw new Error('notify.cancel takes the key the notice was set with.');
          let cancelled = 0;

          for (const [id, one] of notices.pending) {
            if (one.key === key && (!to || one.to === to)) {
              notices.pending.delete(id);
              cancelled += 1;
            }
          }

          return { cancelled };
        },
        notifies,
      ),
    }),
    approvals: Object.freeze({
      request: recorded('approvals.request', async (input: AppApprovalInput) => approvals.raise(input), asksApproval),
      get: recorded(
        'approvals.get',
        async (id: string) => {
          const one = approvals.requests.get(id);

          if (!one) throw new Error(`${appName} has no approval request ${String(id)}.`);

          return approvals.view(one);
        },
        asksApproval,
      ),
      cancel: recorded('approvals.cancel', async (id: string) => approvals.cancel(id), asksApproval),
    }),
    chat: Object.freeze({
      post: recorded(
        'chat.post',
        async (message: ChatPost) => {
          const refuse = (code: string, words: string): never => {
            throw new Error(`${words} (${code})`);
          };

          const byRoom = typeof message?.room === 'string' && message.room !== '';
          const byPerson = typeof message?.to === 'string' && message.to !== '';

          if (!message || byRoom === byPerson) refuse('chat_invalid', 'chat.post takes the room to post in, by its id, or `to`: a member to message.');

          const text = typeof message.text === 'string' ? message.text.trim() : '';

          if (!text) refuse('chat_invalid', 'chat.post needs some text.');
          if (text.length > 2000) refuse('chat_text_too_long', 'A post is at most 2000 characters.');
          if (message.card) {
            const known = (manifest?.placements ?? []).some(one => one.kind === 'chat-card' && effectivePlacementKey(one) === message.card!.placement);

            if (manifest && !known) refuse('chat_card_unknown', `${appName} has no chat card "${String(message.card.placement)}".`);
            if (message.card.route !== undefined && (typeof message.card.route !== 'string' || !message.card.route.startsWith('/'))) {
              refuse('chat_invalid', 'A card’s route is one of the app’s own pages, starting with /.');
            }
          }

          // A post `to` somebody goes in the caller's DM with them, `dm:<user id>` here.
          const where = byRoom ? message.room! : `dm:${message.to}`;
          const listed = options.chat?.rooms?.find(one => one.id === where);
          const allowed = options.canPost ? await options.canPost(where) : listed ? listed.canPost : true;

          if (allowed === false) refuse('chat_cannot_post', 'You can’t post in that room.');
          if (allowed === 'not_poster') refuse('chat_app_not_poster', `${appName} isn’t one of the posters this channel names, so it can’t post here.`);

          const messageId = `message_test_${posts.length + 1}`;

          posts.push({ ...message, text, ...(message.card ? { card: { placement: message.card.placement, route: message.card.route ?? '/' } } : {}), messageId });

          return { messageId };
        },
        seam('chat', 'post its cards in chats', true),
      ),
      rooms: recorded(
        'chat.rooms',
        async (query?: string) => {
          if (query !== undefined && query !== null && (typeof query !== 'string' || query.length > 100)) {
            throw new Error('chat.rooms takes words to look for in a room’s name, up to 100 characters. (chat_invalid)');
          }

          const words = (query ?? '').trim().toLowerCase();

          return (options.chat?.rooms ?? [])
            .filter(one => !words || one.name.toLowerCase().includes(words))
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, 50)
            .map(one => ({ ...one }));
        },
        seam('chat', 'post its cards in chats', false),
      ),
    }),
    directory: Object.freeze({
      profile: recorded(
        'directory.profile',
        async (userId: string) => {
          if (typeof userId !== 'string' || !userId) throw new Error('directory.profile takes a member’s id. (directory_invalid)');

          return profiles.get(userId) ?? null;
        },
        seam('directory', 'read the directory: work profiles and groups', false),
      ),
      groups: recorded(
        'directory.groups',
        async () => groups.map(({ id, name, kind }) => ({ id, name, kind })),
        seam('directory', 'read the directory: work profiles and groups', false),
      ),
      membersOf: recorded(
        'directory.membersOf',
        async (groupId: string) => {
          if (typeof groupId !== 'string' || !groupId) throw new Error('directory.membersOf takes a group’s id. (directory_invalid)');

          return [...(groups.find(one => one.id === groupId)?.members ?? [])].sort();
        },
        seam('directory', 'read the directory: work profiles and groups', false),
      ),
    }),
    webhooks: Object.freeze({
      send: recorded(
        'webhooks.send',
        async (request: { url: string; body: unknown }) => {
          let url: URL;

          try {
            url = new URL(String(request?.url));
          } catch {
            throw new Error('That is not a web address. (webhook_invalid)');
          }
          if (url.protocol !== 'https:') throw new Error('A webhook goes only to an https address. (webhook_not_https)');
          if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(url.hostname)) {
            throw new Error('That address is on a private network, so Brydio will not call it. (webhook_private_address)');
          }

          const body = JSON.stringify(request.body ?? null);

          if (new TextEncoder().encode(body).length > 64 * 1024) throw new Error('A webhook’s body is at most 64 KB. (webhook_too_large)');

          const status = options.webhook ? await options.webhook({ url: url.toString(), body: request.body ?? null }) : 200;
          const signature = `sha256=${createHmac('sha256', options.webhookSecret ?? 'whsec_test').update(body, 'utf8').digest('hex')}`;

          sentHooks.push({
            url: url.toString(),
            body,
            headers: { 'content-type': 'application/json', 'x-brydio-instance': 'inst_test', 'x-brydio-signature': signature },
            status,
          });

          return { status };
        },
        seam('webhooks', 'send signed webhooks to other services', true),
      ),
    }),
    // PJ01. The fake checks what Brydio checks on set, but does not expand a rule: a repeat's `next` is its start.
    timers: Object.freeze({
      set: recorded(
        'timers.set',
        async (raw: Record<string, unknown>) => {
          const now = options.now ?? new Date();
          const key = raw?.key;
          const tool = raw?.tool;

          if (typeof key !== 'string' || !NOTICE_KEY.test(key)) {
            throw new Error('timers.set needs a `key` (letters, digits, : _ . -, up to 120) to move or cancel it by. (timer_invalid)');
          }
          if (typeof tool !== 'string' || (appTools && !appTools.has(tool))) {
            throw new Error(`${appName} has no tool named ${String(tool)} for a timer to run. (timer_unknown_tool)`);
          }
          if ((raw.at === undefined) === (raw.rrule === undefined)) {
            throw new Error('timers.set takes either `at` (one run) or `rrule` (a repeat), not both or neither. (timer_invalid)');
          }
          const input = (raw.input ?? {}) as Record<string, unknown>;

          if (JSON.stringify(input).length > 8_192) throw new Error('A timer’s input may be at most 8192 characters as JSON. (timer_too_large)');
          if (!timers.has(key) && timers.size >= 100) throw new Error(`This ${appName} already has 100 timers, the most one may hold. Cancel one to make room. (timer_limit)`);

          const when = new Date(String(raw.at ?? raw.start ?? now.toISOString()));

          if (Number.isNaN(when.getTime())) throw new Error('A timer’s `at` is an ISO date and time. (timer_invalid)');

          const timer: FakeTimer = {
            key,
            tool,
            input,
            at: raw.at === undefined ? null : when.toISOString(),
            rrule: raw.rrule === undefined ? null : String(raw.rrule),
            zone: typeof raw.zone === 'string' ? raw.zone : 'UTC',
            next: when.toISOString(),
            status: 'active',
            reason: null,
            setBy: caller.userId ?? 'user_test',
            runs: timers.get(key)?.runs ?? 0,
            lastRunAt: timers.get(key)?.lastRunAt ?? null,
            lastOutcome: timers.get(key)?.lastOutcome ?? null,
          };

          timers.set(key, timer);

          const { input: _input, ...shown } = timer;

          return shown;
        },
        seam('timers', 'run its own tools on a schedule, as the person who set them', true),
      ),
      cancel: recorded(
        'timers.cancel',
        async (key: string) => {
          if (typeof key !== 'string' || !NOTICE_KEY.test(key)) throw new Error('timers.cancel takes the key the timer was set with. (timer_invalid)');

          return { cancelled: timers.delete(key) };
        },
        seam('timers', 'run its own tools on a schedule, as the person who set them', true),
      ),
      list: recorded(
        'timers.list',
        async () => ({ items: [...timers.values()].map(({ input: _input, ...shown }) => shown) }),
        seam('timers', 'run its own tools on a schedule, as the person who set them', false),
      ),
    }),
    // DA02. Fixtures have already been limited to the caller's visible metrics.
    finance: Object.freeze({
      signatureLink:recorded('finance.signatureLink',async(input:Parameters<HandlerFinance['signatureLink']>[0])=>{if(!options.finance?.signatureLink)throw new Error('Finance is unavailable. (finance_unavailable)');return options.finance.signatureLink(input);},both(seam('finance','read a native signature link',false),()=>{if(!hostGranted('sign'))throw new Error('Signatures were not granted. (not_granted)');})),
      previewTransactions:recorded('finance.previewTransactions',async(input:Parameters<HandlerFinance['previewTransactions']>[0])=>{if(!options.finance?.previewTransactions)throw new Error('Finance is unavailable. (finance_unavailable)');return options.finance.previewTransactions(input);},seam('finance','preview transaction imports',false)),
      exportTransactions:recorded('finance.exportTransactions',async(input:Parameters<HandlerFinance['exportTransactions']>[0])=>{if(!options.finance?.exportTransactions)throw new Error('Finance is unavailable. (finance_unavailable)');return options.finance.exportTransactions(input);}, both(seam('finance','export Finance transactions',true),()=>{if(caller.origin!=='screen')throw new Error('Only a person in Finance may reconcile an invoice or send an accountant export. (screen_only)');})),
      exportStatus:recorded('finance.exportStatus',async(input:Parameters<HandlerFinance['exportStatus']>[0])=>{if(!options.finance?.exportStatus)throw new Error('Finance is unavailable. (finance_unavailable)');return options.finance.exportStatus(input);}, seam('finance','export Finance transactions',false)),
      documentSource:recorded('finance.documentSource',async(input:Parameters<HandlerFinance['documentSource']>[0])=>{if(!options.finance?.documentSource)throw new Error('Finance is unavailable. (finance_unavailable)');return options.finance.documentSource(input);}, seam('finance', 'use Finance host operations', false)),
      purchaseTemplate:recorded('finance.purchaseTemplate',async(input:Parameters<HandlerFinance['purchaseTemplate']>[0])=>{if(!options.finance?.purchaseTemplate)throw new Error('Finance is unavailable. (finance_unavailable)');return options.finance.purchaseTemplate(input);}, seam('finance', 'use Finance host operations', false)),
      budgetDashboards:recorded('finance.budgetDashboards',async(input:Parameters<HandlerFinance['budgetDashboards']>[0])=>{if(!options.finance?.budgetDashboards)throw new Error('Finance is unavailable. (finance_unavailable)');return options.finance.budgetDashboards(input);}, both(seam('finance', 'use Finance host operations', false), (method,args)=>{if(!hostGranted('metrics'))throw new Error('Metrics was not granted. (not_granted)');})),
      saveBudgetMetric:recorded('finance.saveBudgetMetric',async(input:Parameters<HandlerFinance['saveBudgetMetric']>[0])=>{if(!options.finance?.saveBudgetMetric)throw new Error('Finance is unavailable. (finance_unavailable)');return options.finance.saveBudgetMetric(input);}, both(seam('finance', 'use Finance host operations', true), (method,args)=>{if(!hostGranted('metrics'))throw new Error('Metrics was not granted. (not_granted)');})),
      createPaymentLink: recorded('finance.createPaymentLink', async (input: Parameters<HandlerFinance['createPaymentLink']>[0]) => {
        if (!options.finance?.createPaymentLink) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.createPaymentLink(input);
      }, seam('finance', 'collect invoice payments and read receipts', true)),
      getPayment: recorded('finance.getPayment', async (input: Parameters<HandlerFinance['getPayment']>[0]) => {
        if (!options.finance?.getPayment) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.getPayment(input);
      }, seam('finance', 'collect invoice payments and read receipts', false)),
      receiptSource: recorded('finance.receiptSource', async (input: Parameters<HandlerFinance['receiptSource']>[0]) => {
        if (!options.finance?.receiptSource) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.receiptSource(input);
      }, seam('finance', 'collect invoice payments and read receipts', false)),
      registerReceipt: recorded('finance.registerReceipt', async (input: Parameters<HandlerFinance['registerReceipt']>[0]) => {
        if (!options.finance?.registerReceipt) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.registerReceipt(input);
      }, seam('finance', 'collect invoice payments and read receipts', true)),
      transactionSource: recorded('finance.transactionSource', async (input: Parameters<HandlerFinance['transactionSource']>[0]) => {
        if (!options.finance?.transactionSource) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.transactionSource(input);
      }, seam('finance', 'collect invoice payments and read receipts', false)),
      importTransactions: recorded('finance.importTransactions', async (input: Parameters<HandlerFinance['importTransactions']>[0]) => {
        if (!options.finance?.importTransactions) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.importTransactions(input);
      }, seam('finance', 'collect invoice payments and read receipts', true)),
      sendInvoice: recorded('finance.sendInvoice', async (input: Parameters<HandlerFinance['sendInvoice']>[0]) => {
        if (!options.finance?.sendInvoice) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.sendInvoice(input);
      }, seam('finance', 'collect invoice payments and read receipts', true)),
      invoicePdf: recorded('finance.invoicePdf', async (input: Parameters<HandlerFinance['invoicePdf']>[0]) => {
        if (!options.finance?.invoicePdf) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.invoicePdf(input);
      }, seam('finance', 'collect invoice payments and read receipts', true)),
      shareDocument: recorded('finance.shareDocument', async (input: Parameters<HandlerFinance['shareDocument']>[0]) => {
        if (!options.finance?.shareDocument) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.shareDocument(input);
      }, both(seam('finance', 'share Finance documents', true), () => { if (caller.origin !== 'screen') throw new Error('Only a person in Finance may share or revoke a document. (screen_only)'); })),
      revokeDocumentShare: recorded('finance.revokeDocumentShare', async (input: Parameters<HandlerFinance['revokeDocumentShare']>[0]) => {
        if (!options.finance?.revokeDocumentShare) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.revokeDocumentShare(input);
      }, both(seam('finance', 'share Finance documents', true), () => { if (caller.origin !== 'screen') throw new Error('Only a person in Finance may share or revoke a document. (screen_only)'); })),
      publicDocument: recorded('finance.publicDocument', async (input: Parameters<HandlerFinance['publicDocument']>[0]) => {
        if (!options.finance?.publicDocument) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.publicDocument(input);
      }, (method, args) => { if (!hostGranted('finance')) throw new Error('Finance was not granted. (not_granted)'); keeps(method, args); }),
      publicInvoice: recorded('finance.publicInvoice', async (input: Parameters<HandlerFinance['publicInvoice']>[0]) => {
        if (!options.finance?.publicInvoice) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.publicInvoice(input);
      }, (method, args) => { if (!hostGranted('finance')) throw new Error('Finance was not granted. (not_granted)'); keeps(method, args); }),
      cancelInvoice: recorded('finance.cancelInvoice', async (input: Parameters<HandlerFinance['cancelInvoice']>[0]) => {
        if (!options.finance?.cancelInvoice) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.cancelInvoice(input);
      }, both(seam('finance', 'collect invoice payments and read receipts', true),()=>{if(caller.origin!=='screen')throw new Error('Only a person in Finance may reconcile an invoice or send an accountant export. (screen_only)');})),
      recordManualPayment: recorded('finance.recordManualPayment', async (input: Parameters<HandlerFinance['recordManualPayment']>[0]) => {
        if (!options.finance?.recordManualPayment) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.recordManualPayment(input);
      }, both(seam('finance', 'collect invoice payments and read receipts', true),()=>{if(caller.origin!=='screen')throw new Error('Only a person in Finance may reconcile an invoice or send an accountant export. (screen_only)');})),
      clearManualPayment: recorded('finance.clearManualPayment', async (input: Parameters<HandlerFinance['clearManualPayment']>[0]) => {
        if (!options.finance?.clearManualPayment) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.clearManualPayment(input);
      }, both(seam('finance', 'collect invoice payments and read receipts', true),()=>{if(caller.origin!=='screen')throw new Error('Only a person in Finance may reconcile an invoice or send an accountant export. (screen_only)');})),
      dateInZone: recorded('finance.dateInZone', async (input: Parameters<HandlerFinance['dateInZone']>[0]) => {
        if (!options.finance?.dateInZone) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.dateInZone(input);
      }, seam('finance', 'collect invoice payments and read receipts', false)),
      accountingCompanies: recorded('finance.accountingCompanies', async (input: Parameters<HandlerFinance['accountingCompanies']>[0]) => {
        if (!options.finance?.accountingCompanies) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.accountingCompanies(input);
      }, both(seam('finance', 'collect invoice payments and read receipts', false),(_method,args)=>{const provider=(args[0] as {provider?:unknown})?.provider;if((provider!=='xero'&&provider!=='quickbooks')||!hostGranted(`connection:${provider}`))throw new Error('This accounting connection was not granted. (not_granted)');})),
      accountingAccounts: recorded('finance.accountingAccounts', async (input: Parameters<HandlerFinance['accountingAccounts']>[0]) => {
        if (!options.finance?.accountingAccounts) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.accountingAccounts(input);
      }, both(seam('finance', 'collect invoice payments and read receipts', false),(_method,args)=>{const provider=(args[0] as {provider?:unknown})?.provider;if((provider!=='xero'&&provider!=='quickbooks')||!hostGranted(`connection:${provider}`))throw new Error('This accounting connection was not granted. (not_granted)');})),
      accountingCatalog: recorded('finance.accountingCatalog', async (input: Parameters<HandlerFinance['accountingCatalog']>[0]) => {
        if (!options.finance?.accountingCatalog) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.accountingCatalog(input);
      }, both(seam('finance', 'read accounting catalog choices', false), (_method, args) => {
        const provider = (args[0] as { provider?: unknown })?.provider;
        if ((provider !== 'xero' && provider !== 'quickbooks') || !hostGranted(`connection:${provider}`))
          throw new Error('This accounting connection was not granted. (not_granted)');
      })),
      accountingStatus: recorded('finance.accountingStatus', async (input: Parameters<HandlerFinance['accountingStatus']>[0]) => {
        if (!options.finance?.accountingStatus) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.accountingStatus(input);
      }, both(seam('finance', 'read accounting export status', false), (_method, args) => {
        const provider = (args[0] as { provider?: unknown })?.provider;
        if ((provider !== 'xero' && provider !== 'quickbooks') || !hostGranted(`connection:${provider}`))
          throw new Error('This accounting connection was not granted. (not_granted)');
      })),
      exportAccounting: recorded('finance.exportAccounting', async (input: Parameters<HandlerFinance['exportAccounting']>[0]) => {
        if (!options.finance?.exportAccounting) throw new Error('Finance is unavailable. (finance_unavailable)');
        return options.finance.exportAccounting(input);
      }, both(seam('finance', 'collect invoice payments and read receipts', true),(_method,args)=>{const provider=(args[0] as {provider?:unknown})?.provider;if((provider!=='xero'&&provider!=='quickbooks')||!hostGranted(`connection:${provider}`))throw new Error('This accounting connection was not granted. (not_granted)');})),
    }),
    sign: Object.freeze({
      request: recorded('sign.request', async (input: SignRequest) => {
        if (!options.sign) throw new Error('Signatures are unavailable. (sign_unavailable)');
        return options.sign.request(input);
      }, seam('sign', 'request document signatures and read their status', true)),
      get: recorded('sign.get', async (id: string) => {
        if (!options.sign) throw new Error('Signatures are unavailable. (sign_unavailable)');
        return options.sign.get(id);
      }, seam('sign', 'request document signatures and read their status', false)),
    }),
    metrics: Object.freeze({
      list: recorded('metrics.list', async () => {
        if (!options.metrics) throw new Error('Metrics are not available right now. (metrics_unavailable)');
        return { metrics: options.metrics.map(({ id, name, unit, target, ownerId, dashboardId, revision }) => ({ id, name, unit, target, ownerId, dashboardId, revision })) };
      }, seam('metrics', 'read dashboard metrics as you', false)),
      get: recorded('metrics.get', async (id: string) => {
        if (typeof id !== 'string' || !id.trim() || id.length > 128) throw new Error('metrics.get takes a metric id. (metrics_invalid)');
        if (!options.metrics) throw new Error('Metrics are not available right now. (metrics_unavailable)');
        const metric = options.metrics.find(one => one.id === id);
        if (!metric) throw new Error('There is no such metric. (metrics_not_found)');
        return JSON.parse(JSON.stringify(metric)) as MetricRead;
      }, seam('metrics', 'read dashboard metrics as you', false)),
    }),
    // CA02. An in-memory event layer with Brydio's rules for sharing, owners and invitations.
    calendar: Object.freeze(
      Object.fromEntries(
        (['range', 'busy', 'event', 'calendars', 'create', 'update', 'cancel', 'respond', 'rooms', 'resources', 'notes', 'offer', 'offers', 'free', 'book', 'booking', 'rebook', 'unbook', 'call', 'pass', 'confirm'] as const).map(name => [
          name,
          recorded(
            `calendar.${name}`,
            (...args: unknown[]) => (calendar[name] as (...a: unknown[]) => Promise<unknown>)(...args),
            CALENDAR_VISITOR_CALLS.has(name)
              ? (method: string, args: unknown[]) => {
                  // A visitor may book through a link (CA05); the rest of the calendar is closed to them.
                  if (!hostGranted('calendar')) throw new Error(`${appName} did not ask to read and change your calendar. (not_granted)`);
                  if (name !== 'free' && name !== 'booking' && options.write === false) throw new Error(`${tool} is a read tool, so its handler can't change the calendar (read_tool)`);
                  keeps(method, args);
                }
              : seam('calendar', 'read and change your calendar', ['create', 'update', 'cancel', 'respond', 'offer', 'call', 'pass', 'confirm'].includes(name)),
          ),
        ]),
      ) as unknown as HandlerCalendar,
    ),
    caller: Object.freeze(caller),
  });

  return { client, secrets, calls, held, notices, approvals: { requests: approvals.requests, decide: approvals.decide }, posts, webhooks: sentHooks, timers, calendar: calendarEvents, booking: bookingState };
}

/** Runs a handler against the fake client, and answers as Brydio would pass its answer on. */
export async function runHandler<I, O>(handler: Handler<I, O>, input: I, options: FakeHandlerOptions = {}): Promise<HandlerRun<O>> {
  const { client, secrets, calls, held, notices, approvals, posts, webhooks, timers, calendar, booking } = fakeHandlerClient(options);

  try {
    const result = await handler(input, client);

    return { result: scrub(JSON.parse(JSON.stringify(result ?? null)) as O, held), secrets, calls, notices, approvals, posts, webhooks, timers, calendar, booking };
  } catch (error) {
    return { error: scrub(error instanceof Error ? error.message : String(error), held), secrets, calls, notices, approvals, posts, webhooks, timers, calendar, booking };
  }
}

/** A record or a page of them, as a visitor's handler is given it: without who made or changed it. */
function withoutMembers<T>(answer: T): T {
  const hide = (one: unknown) => {
    if (!one || typeof one !== 'object' || Array.isArray(one)) return one;

    const { createdBy: _made, updatedBy: _changed, ...rest } = one as Record<string, unknown>;

    return rest;
  };

  if (answer && typeof answer === 'object' && Array.isArray((answer as { items?: unknown }).items)) {
    return { ...answer, items: (answer as unknown as { items: unknown[] }).items.map(hide) } as T;
  }

  return hide(answer) as T;
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

const APPROVER_TYPES = ['person', 'role', 'manager', 'group','department_head','field'];
const STEP_RULES = ['any', 'all', 'count'];
const FAKE_ADMIN = 'admin_test';

/** Brydio's check of `approvals.request`'s input, in its words. */
export function checkApprovalInput(input: AppApprovalInput): void {
  if (!input || typeof input !== 'object') throw new Error('approvals.request takes { title, steps, record }.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) throw new Error('approvals.request needs a `title` of up to 200 characters.');
  if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 2000)) throw new Error('An approval `note` is text of up to 2000 characters.');
  if (!input.record || typeof input.record.collection !== 'string' || !input.record.collection || typeof input.record.id !== 'string' || !input.record.id) {
    throw new Error('approvals.request needs `record`: the collection and id of the record it is about.');
  }
  if (input.statusField !== undefined && (typeof input.statusField !== 'string' || !input.statusField)) throw new Error('`statusField` names a text field on the record.');
  if (input.fields !== undefined && (!Array.isArray(input.fields) || input.fields.some(field => !field || typeof field.key !== 'string' || typeof field.label !== 'string' || typeof field.type !== 'string'))) {
    throw new Error('Each approval field has a `key`, a `label` and a `type`.');
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0 || input.steps.length > 10) throw new Error('approvals.request needs between 1 and 10 `steps`.');
  input.steps.forEach((step, index) => {
    const at = `Step ${index + 1}`;

    if (!step || !STEP_RULES.includes(step.rule)) throw new Error(`${at}'s rule is one of any, all or count.`);
    if (!Array.isArray(step.approvers) || step.approvers.length === 0) throw new Error(`${at} needs at least one approver.`);
    for (const approver of step.approvers) {
      if (!approver || !APPROVER_TYPES.includes(approver.type)) throw new Error(`${at}: an approver is a person, a role, a manager or a group.`);
      if (approver.type === 'person' && (typeof approver.principalId !== 'string' || !approver.principalId)) throw new Error(`${at}: a person approver needs \`principalId\`.`);
      if(approver.type==='field'&&(typeof approver.key!=='string'||!approver.key))throw new Error(`${at}: a field approver needs a key.`);
      if (approver.type === 'role' && approver.role !== 'admin') throw new Error(`${at}: the only role is admin.`);
      if (approver.type === 'group' && !((typeof approver.groupId==='string'&&approver.groupId)||(typeof approver.name==='string'&&approver.name))) throw new Error(`${at}: a group approver needs \`groupId\` or \`name\`.`);
    }
    if (step.rule === 'count' && (!Number.isInteger(step.count) || (step.count ?? 0) < 1)) throw new Error(`${at}: a count rule needs \`count\` of at least 1.`);
  });
}

type Kept = FakeApprovals['requests'] extends Map<string, infer V> ? V : never;

function fakeApprovals(requester: string) {
  const requests: FakeApprovals['requests'] = new Map();
  let next = 0;
  const now = () => new Date().toISOString();
  const person = (principalId: string) => ({ principalId, name: principalId, avatarUrl: null, kind: 'human' as const });

  const view = (one: Kept): ApprovalState => {
    const { record: _record, statusField: _field, ...state } = one;

    return JSON.parse(JSON.stringify(state)) as ApprovalState;
  };

  const raise = (input: AppApprovalInput) => {
    checkApprovalInput(input);
    next += 1;
    const id = `apr_test_${next}`;
    const steps = input.steps.map((step, index) => {
      const named = [...new Set(step.approvers.map(one => (one.type === 'person' ? one.principalId : FAKE_ADMIN)))];
      // Never self-approval: the requester is left out, and a step with nobody left goes to the admins.
      const kept = named.filter(one => one !== requester);
      const who = kept.length ? kept : [FAKE_ADMIN];

      return {
        index,
        name: step.name ?? null,
        rule: step.rule,
        count: step.rule === 'count' ? (step.count ?? 1) : null,
        status: (index === 0 ? 'active' : 'waiting') as ApprovalState['steps'][number]['status'],
        assignees: who.map(one => ({ person: person(one), status: 'waiting' as const, reason: kept.length ? 'named' : 'nobody_left', comment: null, decidedAt: null })),
        note: kept.length ? null : 'Everyone named was the requester, so the workspace admins approve.',
      };
    });

    requests.set(id, {
      id,
      title: input.title,
      note: input.note ?? null,
      fields: input.fields ?? [],
      requester: person(requester),
      status: 'pending',
      currentStep: 0,
      steps,
      createdAt: now(),
      decidedAt: null,
      record: { ...input.record },
      statusField: input.statusField ?? null,
    });

    return { id, status: 'pending' as const };
  };

  const decide = (id: string, by: string, decision: 'approve' | 'decline', comment?: string): ApprovalState => {
    const one = requests.get(id);

    if (!one) throw new Error(`There is no approval request ${id}.`);
    if (one.status !== 'pending' || one.currentStep === null) throw new Error('That request is not pending.');
    if (by === one.requester.principalId) throw new Error('Nobody approves their own request.');
    const step = one.steps[one.currentStep]!;
    const mine = step.assignees.find(assignee => assignee.person.principalId === by && assignee.status === 'waiting');

    if (!mine) throw new Error(`${by} can't decide this step.`);
    mine.status = decision === 'approve' ? 'approved' : 'declined';
    mine.comment = comment ?? null;
    mine.decidedAt = now();

    if (decision === 'decline') {
      step.status = 'declined';
      one.status = 'declined';
      one.currentStep = null;
      one.decidedAt = now();

      return view(one);
    }

    const yes = step.assignees.filter(assignee => assignee.status === 'approved').length;
    const needed = step.rule === 'any' ? 1 : step.rule === 'all' ? step.assignees.length : Math.min(step.count ?? 1, step.assignees.length);

    if (yes >= needed) {
      step.status = 'approved';
      const following = one.steps[one.currentStep + 1];

      if (following) {
        following.status = 'active';
        one.currentStep += 1;
      } else {
        one.status = 'approved';
        one.currentStep = null;
        one.decidedAt = now();
      }
    }

    return view(one);
  };

  const cancel = (id: string) => {
    const one = typeof id === 'string' ? requests.get(id) : undefined;

    if (!one || one.status !== 'pending') return { cancelled: false };
    one.status = 'cancelled';
    one.currentStep = null;
    one.decidedAt = now();

    return { cancelled: true };
  };

  return { requests, raise, view, decide, cancel };
}
