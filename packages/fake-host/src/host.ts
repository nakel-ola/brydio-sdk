import { TOOL_WRITES, collectionsOf, toolNames, type ManifestExtensions } from '@brydio/manifest';
import { TEXT_NODE, type DetailOf, type ElementEvent, type ElementName } from '@brydio/ui';
import { checkEvent, isElementName } from '@brydio/ui/validate';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { workerPrelude } from './prelude.ts';
import { FixtureStore, type Fixtures, type StoreChange, type ToolHandler, type ToolResultShape } from './tools.ts';
import { TreeStore, type Refusal, type TreeNode } from './tree-store.ts';

/**
 * A pretend Brydio for an app's tests (A5-F05).
 *
 * It does what `packages/app/src/apps/frame/screen-session.ts` does for a
 * real screen, minus the drawing: runs the screen's built module in a worker
 * behind Brydio's prelude, speaks the host's side of `brydio-tree/1` as
 * built, keeps the tree in a copy of the host's own receiver (so it refuses
 * what a workspace refuses, in the same words), and stops the app for the
 * same reasons and budgets. Tool calls are answered from fixtures by the
 * generated tools' rules, or by handlers a test gives it.
 *
 * What a test gets back is what a person would have seen: the tree, the
 * refusals, the toasts, and the calls that were made.
 */

/** The protocol this host speaks. */
export const TREE_PROTOCOL = 'brydio-tree/1';

export type StopReason = 'cap' | 'refusals' | 'ready' | 'start' | 'load' | 'error' | 'protocol' | 'answer';

export interface HostContext {
  theme: 'light' | 'dark';
  locale: string;
  placement: { id: string; kind: string; projectId?: string; settings?: Record<string, string> };
  instance: { id: string; name: string; scope: string };
  selection?: unknown;
  size: { width: number; height: number };
}

/** A project tab of a workspace instance called Issues, in light mode. */
export const DEFAULT_CONTEXT: HostContext = {
  theme: 'light',
  locale: 'en-GB',
  placement: { id: 'placement_1', kind: 'project-tab', projectId: 'project_1' },
  instance: { id: 'instance_1', name: 'Issues', scope: 'workspace' },
  size: { width: 960, height: 640 },
};

/** How the pretend person answers a write's approval card. `hold` leaves it for `answer()`. */
export type AskAnswer = 'allow' | 'deny' | 'hold';

export interface FakeHostOptions {
  /** The built screen: a path or a `file:` URL to its ES module. */
  entry: string;
  /** The app's manifest, for its generated tools and which of them write. */
  manifest?: Pick<ManifestExtensions, 'data' | 'tools'> & { name?: string; grants?: { host?: string[] } };
  /** Records each collection starts with. */
  fixtures?: Fixtures;
  /** Tools of the test's own, or replacements for generated ones, by name. */
  tools?: Record<string, ToolHandler>;
  /** Answers calls made through `@brydio/api`, as Brydio's authenticated host would. */
  api?: (call: ApiCall) => unknown | Promise<unknown>;
  context?: Partial<HostContext>;
  /** How writes are answered. `allow` unless said. */
  asks?: AskAnswer | ((call: ToolCall) => AskAnswer);
  /**
   * A call Brydio turns away before it runs or asks, for any tool or data
   * read: `blocked` (the workspace switched the tool off) or `rate_limited`
   * (the app called or read too often). Answered in the host's words.
   */
  refuse?: (call: ToolCall) => HostRefusal | undefined;
  /**
   * The people and projects Brydio would name to this screen (`host/members`,
   * `host/projects`): only these, as the viewer's own directory would be.
   */
  directory?: { members?: { id: string; name: string }[]; projects?: { id: string; name: string }[] };
  /** Run Brydio's prelude before the screen. On unless a test needs it off. */
  prelude?: boolean;
  /**
   * What happens when the screen asks to open a chat, a file or an item.
   * Opened unless this throws; what it throws is the sentence the screen gets.
   */
  navigate?: (to: NavigateTo) => void | Promise<void>;
  /** The host's budgets, in milliseconds. A test can shorten them; a longer one is held to the host's. */
  budgets?: { ready?: number; start?: number; answer?: number };
}

/** What a screen may ask Brydio to open. */
export interface NavigateTo {
  kind: 'chat' | 'file' | 'item' | 'project';
  id: string;
}

/** One `@brydio/api` call a screen sent to the pretend host. */
export interface ApiCall {
  action: string;
  input: Record<string, unknown>;
}

/** Why Brydio turns a call away before running it. */
export type HostRefusal = 'blocked' | 'rate_limited';

/**
 * The sentences `apps/api/src/apps/screens/instance-call.service.ts` refuses
 * with, which the host passes on as `tools/error` or `data/error`.
 */
export function hostRefusal(refusal: HostRefusal, tool: string, read = false): string {
  if (refusal === 'blocked') return `${tool} is switched off for this workspace.`;

  return read ? 'This app is reading too often. Try again in a minute.' : 'This app is calling too often. Try again in a minute.';
}

/** A call the screen made, and what became of it. */
export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  /** Whether it waited on the person, and what they said. */
  asked?: 'allow' | 'deny';
  /** Turned away by Brydio before it ran or asked. */
  refused?: HostRefusal;
  result?: ToolResultShape;
  error?: { code: number; message: string };
}

interface Rpc {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
}

const MAX_MESSAGE_BYTES = 512 * 1024;
/** The host's budgets: to `worker/ready`, and from it to the first tree. */
const READY_BUDGET = 10_000;
const START_BUDGET = 2_000;
const MAX_TOAST = 200;
/** How long a worker that acks has to acknowledge an event (`screen-session.ts`'s `ANSWER_BUDGET_MS`). */
export const ANSWER_BUDGET_MS = 5_000;
/** How long the host gathers one collection's changes before it tells the app. */
export const COALESCE_MS = 100;
/** How many collections one open app may watch. */
export const MAX_WATCHES = 5;

/** One collection being watched, and the changes gathered since the app was last told. */
interface Watch {
  pending: Map<string, { id: string; op: StoreChange['op']; version: number }>;
  timer: ReturnType<typeof setTimeout> | null;
}

export class FakeHost {
  readonly tree = new TreeStore();
  readonly store: FixtureStore | null;
  /** Every message the worker sent, in order. */
  readonly received: Rpc[] = [];
  readonly calls: ToolCall[] = [];
  /** Every call made through `@brydio/api`, in order. */
  readonly apiCalls: ApiCall[] = [];
  readonly refusals: Refusal[] = [];
  readonly toasts: { text: string; tone: 'info' | 'success' | 'danger' }[] = [];
  /** Each names request the screen made: which kind, and the ids. */
  readonly namesAsked: { kind: 'members' | 'projects'; ids: string[] }[] = [];
  /** Chats the screen asked Brydio to draft about a record, in order (never sent: the person sends them). */
  /** Each draft the app asked for. `target` is null for a draft with no attachment (A8-F02-S03). */
  readonly asks: { text: string; target: { collection: string; id: string; title?: string } | null }[] = [];
  /** What the screen asked to open, and whether it was. */
  readonly navigations: (NavigateTo & { opened: boolean; error?: string })[] = [];
  /** What the worker threw, or failed to load with. */
  readonly errors: string[] = [];
  app: { name: string; version: string } | null = null;
  /**
   * The budgets this host enforces. A test may shorten one to fail fast, but
   * a longer one would pass a screen Brydio stops, so it is held to the host's.
   */
  readonly budgets: { ready: number; start: number; answer: number };
  /** Whether the worker said it acknowledges events, and how many it has, in order. */
  acks = { promised: false, sent: 0, acked: 0 };
  stopped: StopReason | null = null;

  readonly #worker: Worker;
  readonly #tools: Record<string, ToolHandler>;
  readonly #writes: Set<string>;
  readonly #options: FakeHostOptions;
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  readonly #held: { id: string | number; call: ToolCall }[] = [];
  #context: HostContext;
  #mounted = false;
  #busy = 0;
  #ended = false;
  #listeners = new Set<() => void>();
  #closed = false;
  readonly #watches = new Map<string, Watch>();

  private constructor(options: FakeHostOptions) {
    this.#options = options;
    this.budgets = {
      ready: Math.min(options.budgets?.ready ?? READY_BUDGET, READY_BUDGET),
      start: Math.min(options.budgets?.start ?? START_BUDGET, START_BUDGET),
      answer: Math.min(options.budgets?.answer ?? ANSWER_BUDGET_MS, ANSWER_BUDGET_MS),
    };
    this.#context = { ...DEFAULT_CONTEXT, ...options.context };
    this.store = options.manifest ? new FixtureStore(options.manifest, options.fixtures) : null;
    this.#tools = { ...this.store?.tools(), ...options.tools };
    this.store?.onChange(change => this.#gather(change));
    this.#writes = new Set(
      options.manifest && options.manifest.tools?.generated !== false
        ? collectionsOf(options.manifest).flatMap(spec =>
            [
              ...Object.entries(toolNames(spec))
                .filter(([verb]) => TOOL_WRITES[verb as keyof typeof TOOL_WRITES])
                .map(([, name]) => name),
              // One approval for several writes (G13).
              `batch_${spec.plural}`,
            ],
          )
        : [],
    );

    const entry = moduleUrl(options.entry);
    const prelude = options.prelude === false ? '' : `(${workerPrelude.toString()})(self);\n`;
    // As the frame page starts it: the prelude, then the app's module. A
    // failed import is thrown on a fresh task so it reaches `error`.
    const source =
      prelude +
      `import(${JSON.stringify(entry)}).catch(function (error) { setTimeout(function () { throw new Error("brydio:load " + (error && error.message)); }); });\n`;

    this.#worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })), { type: 'module' });
    this.#worker.addEventListener('message', event => this.#receive(event.data));
    // A worker with nothing left to wait on ends by itself, as a browser's
    // never does. Bun then must not be asked to terminate it: terminating a
    // worker that has already closed leaves the next worker started in this
    // process unable to run its script, which stopped an unrelated test
    // for "ready" (a screen that says ready and draws nothing, then any other).
    this.#worker.addEventListener('close', () => {
      this.#closed = true;
    });
    this.#worker.addEventListener('error', event => {
      event.preventDefault?.();

      const message = String((event as ErrorEvent).message ?? '');

      this.errors.push(message);
      this.stop(message.includes('brydio:load') ? 'load' : 'error');
    });

    this.#after(this.budgets.ready, () => {
      if (!this.app && !this.stopped) this.stop('ready');
    });
  }

  /** Starts a screen. Wait on `mounted()` before looking at the tree. */
  static start(options: FakeHostOptions): FakeHost {
    return new FakeHost(options);
  }

  /** Resolves once the first tree has arrived; rejects if the app stopped first. */
  mounted(timeout = 5_000): Promise<void> {
    return this.waitFor(() => this.#mounted, { timeout, what: 'the first tree' }).then(() => undefined);
  }

  /**
   * Resolves once nothing is happening: no call is being answered and the
   * worker has been quiet for a moment. What a test waits on after a press.
   */
  async idle(quiet = 25, timeout = 5_000): Promise<void> {
    const started = Date.now();
    let seen = -1;

    for (;;) {
      if (this.stopped) throw new Error(`The app stopped (${this.stopped}).${this.#why()}`);
      if (this.#busy === 0 && seen === this.received.length) return;
      if (Date.now() - started > timeout) throw new Error('The app did not settle.');

      seen = this.#busy === 0 ? this.received.length : -1;
      await new Promise(resolve => setTimeout(resolve, quiet));
    }
  }

  /** Waits until `check` answers something truthy, and resolves with it. */
  waitFor<T>(check: () => T | false | null | undefined, options: { timeout?: number; what?: string } = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const look = () => {
        const found = check();

        if (found) {
          done();
          resolve(found);
        } else if (this.stopped) {
          done();
          reject(new Error(`The app stopped (${this.stopped}) before ${options.what ?? 'that happened'}.${this.#why()}`));
        }
      };
      const done = () => {
        clearTimeout(timer);
        this.#listeners.delete(look);
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`Waited ${options.timeout ?? 2_000} ms for ${options.what ?? 'that'}.`));
      }, options.timeout ?? 2_000);

      this.#listeners.add(look);
      look();
    });
  }

  /** A person pressing a node, as the host sends it. Dropped if the node has gone. */
  press(node: string | TreeNode): boolean {
    return this.event(node, 'press');
  }

  /**
   * What a person does to a node, as the host raises it: `change` with
   * `{ value }`, a board's `move` with `{ card, from, to, position }`, and so
   * on. Only events the node's element declares can be sent: Brydio never
   * raises another, so asking for one is a mistake in the test, and it throws.
   *
   * An event for a node that is not in the tree is dropped, as the host
   * drops it (a person can't press what isn't drawn), and answers false.
   */
  event(node: string | TreeNode, name: string, detail?: unknown): boolean {
    const id = typeof node === 'string' ? node : node.id;
    const drawn = this.tree.get(id);

    if (this.stopped || !drawn) return false;

    const refused = isElementName(drawn.type) ? checkEvent(drawn.type, name) : `${drawn.type} raises no events.`;

    if (refused) throw new Error(`Brydio would never send that: ${refused}`);

    this.#send({ jsonrpc: '2.0', method: 'tree/event', params: detail === undefined ? { node: id, name } : { node: id, name, detail } });

    // As Brydio's screen does: a worker that said it acks and doesn't, in time, is stopped for `answer`.
    if (this.acks.promised) {
      const sent = ++this.acks.sent;

      this.#after(this.budgets.answer, () => {
        if (!this.stopped && this.acks.acked < sent) this.stop('answer');
      });
    }

    return true;
  }

  /**
   * The same, typed by element: `host.raise('bry-board', board, 'move', { card, from, to, position })`
   * checks the detail's shape against the catalogue's types at compile time.
   */
  raise<E extends ElementName, K extends ElementEvent<E>>(element: E, node: string | TreeNode, name: K, ...detail: DetailOf<E, K> extends undefined ? [] : [DetailOf<E, K>]): boolean {
    const id = typeof node === 'string' ? node : node.id;

    if (this.tree.get(id) && this.tree.get(id)!.type !== element) throw new Error(`That node is a ${this.tree.get(id)!.type}, not a ${element}.`);

    return this.event(id, name, detail[0]);
  }

  /** The screen moved, resized or changed theme. */
  setContext(change: Partial<HostContext>): void {
    this.#context = { ...this.#context, ...change };

    if (this.app) this.#send({ jsonrpc: '2.0', method: 'host/context', params: this.#context as never });
  }

  /** The collections the screen is watching now. */
  get watching(): string[] {
    return [...this.#watches.keys()];
  }

  /**
   * Stops a watch as the host does when it ends on its own (the connection
   * dropped, or the person may no longer read the collection): the app hears
   * `data/ended` with the message.
   */
  endWatch(collection: string, message = 'The app stopped hearing about changes.'): void {
    if (!this.#watches.has(collection)) return;

    this.#drop(collection);
    this.#send({ jsonrpc: '2.0', method: 'data/ended', params: { collection, message } });
  }

  /** Answers the oldest held approval card. */
  answer(decision: 'allow' | 'deny'): Promise<void> {
    const held = this.#held.shift();

    return held ? this.#decide(held.id, held.call, decision) : Promise.resolve();
  }

  /** Every node, depth first, that passes the check. */
  findAll(check: (node: TreeNode) => boolean): TreeNode[] {
    const found: TreeNode[] = [];
    const walk = (id: string) => {
      const node = this.tree.get(id);

      if (!node) return;
      if (check(node)) found.push(node);

      node.children.forEach(walk);
    };

    if (this.tree.root) walk(this.tree.root);

    return found;
  }

  /** The first node whose words (its text, label or title) are exactly these. */
  byText(words: string): TreeNode | undefined {
    return this.findAll(node => wordsOf(node) === words)[0];
  }

  /** The node's parent, if it has one. */
  parentOf(node: TreeNode | string): TreeNode | undefined {
    const id = typeof node === 'string' ? node : node.id;

    return this.findAll(one => one.children.includes(id))[0];
  }

  /** The tree as indented lines, one per node, for a test to read or snapshot. */
  outline(from: string | null = this.tree.root): string {
    const lines: string[] = [];
    const walk = (id: string, depth: number) => {
      const node = this.tree.get(id);

      if (!node) return;

      const settings = Object.entries(node.props)
        .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
        .join(' ');

      lines.push(`${'  '.repeat(depth)}${node.type === TEXT_NODE ? JSON.stringify(node.text) : node.type}${settings ? ` ${settings}` : ''}`);
      node.children.forEach(child => walk(child, depth + 1));
    };

    if (from) walk(from, 0);

    return lines.join('\n');
  }

  /** Stops the app as the host does: tells the worker, then ends it on the next turn. */
  stop(reason?: StopReason): void {
    if (this.#ended) return;

    this.#ended = true;

    if (reason) this.stopped = reason;

    this.#send({ jsonrpc: '2.0', method: 'worker/teardown' }, true);

    for (const timer of this.#timers) clearTimeout(timer);

    this.#timers.clear();

    for (const collection of [...this.#watches.keys()]) this.#drop(collection);

    setTimeout(() => {
      if (!this.#closed) this.#worker.terminate();
    }, 0);
    this.#changed();
  }

  #receive(data: unknown): void {
    if (this.#ended || !data || typeof data !== 'object' || typeof (data as Rpc).method !== 'string') return;

    const message = data as Rpc;

    // The size check the host makes on every message, before reading it.
    if (JSON.stringify(message).length > MAX_MESSAGE_BYTES) {
      this.stop('cap');

      return;
    }

    this.received.push(message);

    const params = message.params ?? {};

    switch (message.method) {
      case 'worker/ready': {
        if (this.app) break;

        if (params.protocol !== TREE_PROTOCOL) {
          this.stop('protocol');
          break;
        }

        const app = (params.app ?? {}) as { name?: unknown; version?: unknown };

        this.app = { name: String(app.name ?? ''), version: String(app.version ?? '') };
        this.acks.promised = Array.isArray(params.capabilities) && params.capabilities.includes('ack');
        this.#send({ jsonrpc: '2.0', method: 'host/context', params: this.#context as never });
        this.#after(this.budgets.start, () => {
          if (!this.#mounted && !this.stopped) this.stop('start');
        });
        break;
      }
      case 'tree/mount':
        if (!this.app) break;

        this.#mounted = true;
        this.#refused(this.tree.mount(params.root, params.nodes));
        break;
      case 'tree/patch':
        if (!this.app || !this.#mounted) break;

        this.#refused(this.tree.patch(params.ops));
        break;
      case 'tools/call':
        if (!this.app || message.id === undefined) break;

        void this.#call(message.id, params);
        break;
      case 'api/call':
        if (!this.app || message.id === undefined) break;

        void this.#api(message.id, params);
        break;
      case 'data/get':
      case 'data/list':
        if (!this.app || message.id === undefined) break;

        void this.#read(message.id, message.method === 'data/get' ? 'get' : 'list', params);
        break;
      case 'data/subscribe':
        if (!this.app || message.id === undefined) break;

        this.#watch(message.id, params.collection);
        break;
      case 'data/unsubscribe':
        if (!this.app || message.id === undefined) break;

        if (typeof params.collection === 'string') this.#drop(params.collection);

        this.#send({ jsonrpc: '2.0', method: 'data/result', params: { id: message.id, result: { watching: false } } });
        break;
      case 'ui/toast': {
        const text = typeof params.text === 'string' ? params.text.slice(0, MAX_TOAST) : '';
        const tone = params.tone === 'success' || params.tone === 'danger' ? params.tone : 'info';

        if (this.app && text) this.toasts.push({ text, tone });
        break;
      }
      case 'tree/ack':
        // Acks arrive in the order events were sent; one more than was sent is ignored.
        if (this.acks.acked < this.acks.sent) this.acks.acked += 1;
        break;
      case 'host/members':
      case 'host/projects':
        if (!this.app || message.id === undefined) break;

        // `host/members` without ids lists the people the app may name, for a picker.
        if (message.method === 'host/members' && params.ids === undefined) this.#listMembers(message.id, params);
        else this.#names(message.id, message.method === 'host/members' ? 'members' : 'projects', params.ids);
        break;
      case 'ui/message':
        if (!this.app) break;

        this.#ask(message.id, params);
        break;
      case 'ui/navigate':
        if (!this.app) break;

        void this.#navigate(message.id, params.to);
        break;
    }

    this.#changed();
  }

  /** Answers the public app API at the same request boundary as the real host. */
  async #api(id: string | number, params: Record<string, unknown>): Promise<void> {
    const action = params.action;
    const input = params.input;

    if (typeof action !== 'string' || !input || typeof input !== 'object' || Array.isArray(input)) {
      this.#send({ jsonrpc: '2.0', method: 'api/error', params: { id, error: { code: -32602, message: 'A Brydio API call needs an action and an input object.' } } });

      return;
    }

    const call: ApiCall = { action, input: input as Record<string, unknown> };

    this.apiCalls.push(call);

    if (!this.#options.api) {
      this.#send({ jsonrpc: '2.0', method: 'api/error', params: { id, error: { code: -32601, message: 'The Brydio app API is not configured for this test.' } } });

      return;
    }

    this.#busy += 1;

    try {
      const result = await this.#options.api(call);

      this.#send({ jsonrpc: '2.0', method: 'api/result', params: { id, result } as never });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'That API call did not work.';

      this.#send({ jsonrpc: '2.0', method: 'api/error', params: { id, error: { code: -32000, message: message.slice(0, 300) } } });
    } finally {
      this.#busy -= 1;
      this.#changed();
    }
  }

  /**
   * `host/members` and `host/projects`, answered as Brydio's host names them
   * (Osprey's `host-names.service.ts`): refused in the host's words without
   * the grant, at most 100 distinct ids, and an id it won't name left out.
   */
  #names(id: string | number, kind: 'members' | 'projects', asked: unknown): void {
    if (!this.#namesGranted(id, kind)) return;

    const ids = [...new Set((Array.isArray(asked) ? asked : []).filter((one): one is string => typeof one === 'string' && one.length > 0 && one.length <= 128))].slice(0, 100);
    const known = this.#options.directory?.[kind] ?? [];
    const found = ids.flatMap(one => known.filter(entry => entry.id === one));
    const result =
      kind === 'members'
        ? { members: found.map(one => ({ id: one.id, name: one.name, initials: initialsOf(one.name) })) }
        : { projects: found.map(one => ({ id: one.id, name: one.name })) };

    this.namesAsked.push({ kind, ids });
    this.#send({ jsonrpc: '2.0', method: 'host/result', params: { id, result } as never });
  }

  /**
   * `ui/message`, as `screen-session.ts` answers it and the API decides it:
   * the text and record checked, the `message` grant asked, and on success a
   * draft recorded in `asks` and `ui/result { drafted: true }`. Nothing is sent.
   *
   * **A message with no `target` is a draft with no attachment** (A8-F02-S03):
   * the words alone, which the person reads in their composer. Everything else
   * is the same — the size cap, the `message` grant, and nothing sent. There
   * is no record to check because there is no record: an app whose subject is
   * something Brydio deliberately keeps nothing of has none to give.
   */
  #ask(id: string | number | undefined, params: Record<string, unknown>): void {
    const fail = (code: number, message: string) => {
      if (id !== undefined) this.#send({ jsonrpc: '2.0', method: 'ui/error', params: { id, error: { code, message } } });
    };
    const text = params.text;
    const target = params.target as { collection?: unknown; id?: unknown; title?: unknown } | null | undefined;

    if (typeof text !== 'string' || !text.trim()) {
      return fail(-32602, 'An app asks about one of its records: say what to ask, and which record.');
    }

    if (
      target !== undefined &&
      target !== null &&
      (typeof target.collection !== 'string' ||
        !target.collection ||
        typeof target.id !== 'string' ||
        !target.id ||
        (target.title !== undefined && typeof target.title !== 'string'))
    ) {
      return fail(-32602, 'An app asks about one of its records: say what to ask, and which record.');
    }

    if (new TextEncoder().encode(text).byteLength > 64 * 1024) return fail(-32602, 'A message from an app can be at most 64 KB.');

    const host = this.#options.manifest?.grants?.host ?? [];

    if (!host.includes('message') && !host.includes('*')) return fail(-32000, `${this.#options.manifest?.name ?? this.app?.name} did not ask to post messages in a chat.`);

    if (!target) {
      // No attachment, so nothing to look up and nothing to leak: the words
      // alone go into the composer.
      this.asks.push({ text, target: null });
    } else {
      const collection = target.collection as string;
      const targetId = target.id as string;

      if (this.store && (!this.store.has(collection) || !this.store.records(collection).some(record => record.id === targetId))) {
        return fail(-32000, 'There is no such record.');
      }

      this.asks.push({ text, target: { collection, id: targetId, ...(typeof target.title === 'string' ? { title: target.title } : {}) } });
    }

    if (id !== undefined) this.#send({ jsonrpc: '2.0', method: 'ui/result', params: { id, result: { drafted: true } } });

    this.#changed();
  }

  /** Whether the install grants names of this kind; refuses the ask in Brydio's words if not. */
  #namesGranted(id: string | number, kind: 'members' | 'projects'): boolean {
    const host = this.#options.manifest?.grants?.host ?? [];

    if (host.includes(kind) || host.includes('*')) return true;

    const words = kind === 'members' ? 'see the names of people' : 'see the names of projects';

    this.#send({ jsonrpc: '2.0', method: 'host/error', params: { id, error: { code: -32000, message: `${this.#options.manifest?.name ?? this.app?.name} did not ask to ${words}.` } } });

    return false;
  }

  /**
   * `host/members` with no ids, as Brydio lists the people an app may name for a
   * picker (G15): the directory's people sorted by name, matching `query`
   * (name, ignoring case), at most `limit` (1–50, 50 unless said).
   */
  #listMembers(id: string | number, params: Record<string, unknown>): void {
    if (!this.#namesGranted(id, 'members')) return;

    const query = typeof params.query === 'string' ? params.query.toLowerCase() : '';
    const limit = Number.isInteger(params.limit) ? Math.max(1, Math.min(50, params.limit as number)) : 50;
    const members = [...(this.#options.directory?.members ?? [])]
      .filter(one => !query || one.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit)
      .map(one => ({ id: one.id, name: one.name, initials: initialsOf(one.name) }));

    this.namesAsked.push({ kind: 'members', ids: [] });
    this.#send({ jsonrpc: '2.0', method: 'host/result', params: { id, result: { members } } as never });
  }

  /**
   * `data/get` and `data/list`, as Brydio answers them since `5d6cd53`: the
   * collection's own `get_*` or `list_*` tool runs, and its record or page
   * comes back as `data/result { id, result }`. A refusal the tool wrote is
   * `data/error` in the tool's words. The run is in `calls`, as any call is.
   */
  async #read(id: string | number, op: 'get' | 'list', params: Record<string, unknown>): Promise<void> {
    const error = (code: number, message: string) =>
      this.#send({ jsonrpc: '2.0', method: 'data/error', params: { id, error: { code, message } } });
    const collection = params.collection;

    if (!this.store || !this.#options.manifest) return error(-32601, 'Reading data from a screen isn’t available here.');
    if (typeof collection !== 'string' || !collection || (op === 'get' && typeof params.id !== 'string')) {
      return error(-32602, op === 'get' ? 'A read needs a collection and a record id.' : 'A read needs a collection.');
    }

    const spec = collectionsOf(this.#options.manifest).find(one => one.name === collection);

    if (!spec) return error(-32000, 'There is no such collection.');

    const tool = op === 'get' ? `get_${spec.label}` : `list_${spec.plural}`;
    const input: Record<string, unknown> = {};

    if (op === 'get') input.id = params.id;
    else for (const key of ['filter', 'sort', 'limit', 'cursor']) if (params[key] !== undefined) input[key] = params[key];

    const call: ToolCall = { tool, input };

    this.calls.push(call);

    const turnedAway = this.#options.refuse?.(call);

    if (turnedAway) {
      call.refused = turnedAway;

      return error(-32000, hostRefusal(turnedAway, tool, true));
    }

    this.#busy += 1;

    try {
      const result = await this.#tools[tool]!(input);

      call.result = result;

      if (result.isError) {
        const text = result.content?.find(part => part.type === 'text')?.text;

        error(-32000, text ? text.slice(0, 300) : 'That couldn’t be read.');
      } else {
        this.#send({ jsonrpc: '2.0', method: 'data/result', params: { id, result: result.structuredContent as never } });
      }
    } catch (failure) {
      error(-32000, failure instanceof Error ? failure.message.slice(0, 300) : 'That didn’t work.');
    } finally {
      this.#busy -= 1;
      this.#changed();
    }
  }

  /**
   * `ui/navigate`, as `screen-session.ts` answers it: a request when it has an
   * id (`ui/result { opened }` or `ui/error`), a notice when it hasn't.
   */
  async #navigate(id: string | number | undefined, to: unknown): Promise<void> {
    const target = to as { kind?: unknown; id?: unknown } | null;
    const fail = (error: { code: number; message: string }) => {
      if (id !== undefined) this.#send({ jsonrpc: '2.0', method: 'ui/error', params: { id, error } });
    };

    // `{ kind: 'item', id: null }` goes back from an item to the screen, without asking (G14).
    const closing = target?.kind === 'item' && target.id === null;

    if (!target || (target.kind !== 'chat' && target.kind !== 'file' && target.kind !== 'item' && target.kind !== 'project') || (!closing && (typeof target.id !== 'string' || !target.id))) {
      fail({ code: -32602, message: 'An app can open a chat, a file, a project or one of its own items, by id.' });

      return;
    }

    if (closing) {
      if (id !== undefined) this.#send({ jsonrpc: '2.0', method: 'ui/result', params: { id, result: { opened: true } } });

      this.setContext({ selection: undefined });

      return;
    }

    const asked: NavigateTo = { kind: target.kind, id: target.id as string };

    this.#busy += 1;

    try {
      await this.#options.navigate?.(asked);
      this.navigations.push({ ...asked, opened: true });

      if (id !== undefined) this.#send({ jsonrpc: '2.0', method: 'ui/result', params: { id, result: { opened: true } } });

      // As Brydio's screen does, after answering: an item the app opened becomes its selection.
      if (asked.kind === 'item') this.setContext({ selection: { kind: 'item', id: asked.id } });
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'That didn’t work.').slice(0, 300);

      this.navigations.push({ ...asked, opened: false, error: message });
      fail({ code: -32000, message });
    } finally {
      this.#busy -= 1;
      this.#changed();
    }
  }

  /**
   * `data/subscribe`, answered as `screen-session.ts` answers it: one watch per
   * collection however often asked, at most `MAX_WATCHES`. A collection the
   * manifest doesn't declare is watched and then ended, since Brydio refuses
   * it when the stream opens, after the answer has gone.
   */
  #watch(id: string | number, collection: unknown): void {
    const error = (code: number, message: string) =>
      this.#send({ jsonrpc: '2.0', method: 'data/error', params: { id, error: { code, message } } });

    if (!this.store) return error(-32601, 'Watching data isn’t available here.');
    if (typeof collection !== 'string' || !collection) return error(-32602, 'A watch needs a collection.');

    if (!this.#watches.has(collection)) {
      if (this.#watches.size >= MAX_WATCHES) return error(-32000, `An app can watch at most ${MAX_WATCHES} collections at once.`);

      this.#watches.set(collection, { pending: new Map(), timer: null });
    }

    this.#send({ jsonrpc: '2.0', method: 'data/result', params: { id, result: { watching: true } } });

    if (!this.store.has(collection)) this.endWatch(collection, 'There is no such collection.');
  }

  /** A change the store made, gathered for `COALESCE_MS`, each record once at its latest. */
  #gather(change: StoreChange): void {
    const watch = this.#watches.get(change.collection);

    if (!watch || this.stopped || this.#ended) return;

    watch.pending.set(change.id, { id: change.id, op: change.op, version: change.version });

    if (watch.timer) return;

    // Counted as work, so `idle()` waits for the app to be told.
    this.#busy += 1;
    watch.timer = setTimeout(() => {
      watch.timer = null;
      this.#busy -= 1;

      if (this.#watches.get(change.collection) !== watch || !watch.pending.size) return;

      const changes = [...watch.pending.values()];

      watch.pending.clear();
      this.#send({ jsonrpc: '2.0', method: 'data/changed', params: { collection: change.collection, changes } as never });
      this.#changed();
    }, COALESCE_MS);
  }

  #drop(collection: string): void {
    const watch = this.#watches.get(collection);

    if (!watch) return;

    this.#watches.delete(collection);

    if (watch.timer) {
      clearTimeout(watch.timer);
      this.#busy -= 1;
    }
  }

  async #call(id: string | number, params: Record<string, unknown>): Promise<void> {
    const tool = params.tool;
    const input = params.input ?? {};

    if (typeof tool !== 'string' || !tool || typeof input !== 'object' || Array.isArray(input)) {
      this.#send({ jsonrpc: '2.0', method: 'tools/error', params: { id, error: { code: -32602, message: 'A tool call needs a tool name and an input object.' } } });

      return;
    }

    const call: ToolCall = { tool, input: input as Record<string, unknown> };

    this.calls.push(call);

    if (!this.#tools[tool]) {
      this.#fail(id, call, `This app has no tool called ${tool}.`);

      return;
    }

    const turnedAway = this.#options.refuse?.(call);

    if (turnedAway) {
      call.refused = turnedAway;
      this.#fail(id, call, hostRefusal(turnedAway, tool));

      return;
    }

    if (this.#writes.has(tool)) {
      const asks = this.#options.asks ?? 'allow';
      const decision = typeof asks === 'function' ? asks(call) : asks;

      if (decision === 'hold') {
        this.#held.push({ id, call });

        return;
      }

      await this.#decide(id, call, decision);

      return;
    }

    await this.#run(id, call);
  }

  async #decide(id: string | number, call: ToolCall, decision: 'allow' | 'deny'): Promise<void> {
    call.asked = decision;

    if (decision === 'deny') {
      this.#fail(id, call, 'The person didn’t allow it.');

      return;
    }

    await this.#run(id, call);
  }

  async #run(id: string | number, call: ToolCall): Promise<void> {
    this.#busy += 1;

    try {
      call.result = await this.#tools[call.tool]!(call.input);
      this.#send({ jsonrpc: '2.0', method: 'tools/result', params: { id, result: call.result as never } });
    } catch (error) {
      this.#fail(id, call, error instanceof Error ? error.message.slice(0, 300) : 'That didn’t work.');
    } finally {
      this.#busy -= 1;
      this.#changed();
    }
  }

  #fail(id: string | number, call: ToolCall, message: string): void {
    call.error = { code: -32000, message };
    this.#send({ jsonrpc: '2.0', method: 'tools/error', params: { id, error: call.error } });
  }

  #refused(outcome: { refused: Refusal[]; stop?: 'cap' | 'refusals' }): void {
    for (const refusal of outcome.refused) {
      this.refusals.push(refusal);
      this.#send({ jsonrpc: '2.0', method: 'tree/refused', params: refusal as never });
    }

    if (outcome.stop) this.stop(outcome.stop);
  }

  #send(message: Rpc, evenIfEnded = false): void {
    if (this.#ended && !evenIfEnded) return;

    try {
      this.#worker.postMessage(message);
    } catch {
      // A worker with nothing left to do has ended by itself, which a
      // browser's never does; there is nobody left to tell.
    }
  }

  #after(ms: number, run: () => void): void {
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      run();
    }, ms);

    this.#timers.add(timer);
  }

  #changed(): void {
    for (const listener of [...this.#listeners]) listener();
  }

  #why(): string {
    const last = this.refusals.at(-1)?.reason ?? this.errors.at(-1);

    return last ? ` Last: ${last}` : '';
  }
}

/**
 * Where the worker imports the screen from.
 *
 * A built screen is one self-contained module, so it is handed to the worker
 * as a `blob:` of the file's bytes, as Brydio's frame fetches it whole. Asking
 * Bun to import the file instead failed for a file written after this process
 * first looked in its folder (a build during the test run, publish's pictures
 * straight after its build): Bun's module resolver remembers the folder as it
 * was and answers "Cannot find module". A file that is missing, or that imports
 * a neighbour by a relative path, is still imported from disk, so a missing
 * build stops the app for `load` as before.
 */
function moduleUrl(given: string): string {
  const path = given.startsWith('file:') ? fileURLToPath(given) : isAbsolute(given) ? given : resolve(given);

  if (existsSync(path)) {
    const code = readFileSync(path, 'utf8');

    if (!/(?:\bfrom\s*|\bimport\s*\(?\s*)["']\.\.?\//.test(code)) return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  }

  return pathToFileURL(path).href;
}

/** "Ada Lovelace" is AL, "cher" is C: Brydio's rule, the one `bry-avatar` draws with. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words;

  return letters.map(word => Array.from(word)[0]!.toUpperCase()).join('');
}

/** A node's words: its text, or the label, text or title setting. */
export function wordsOf(node: TreeNode): string | undefined {
  if (node.type === TEXT_NODE) return node.text;

  for (const name of ['label', 'text', 'title']) {
    const value = node.props[name];

    if (typeof value === 'string') return value;
  }

  return undefined;
}
