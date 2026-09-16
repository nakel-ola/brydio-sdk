import { TOOL_WRITES, collectionsOf, toolNames, type ManifestExtensions } from '@brydio/manifest';
import { TEXT_NODE } from '@brydio/ui';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { workerPrelude } from './prelude.ts';
import { FixtureStore, type Fixtures, type ToolHandler, type ToolResultShape } from './tools.ts';
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

export type StopReason = 'cap' | 'refusals' | 'ready' | 'start' | 'load' | 'error' | 'protocol';

export interface HostContext {
  theme: 'light' | 'dark';
  locale: string;
  placement: { id: string; kind: string; projectId?: string };
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
  manifest?: Pick<ManifestExtensions, 'data' | 'tools'>;
  /** Records each collection starts with. */
  fixtures?: Fixtures;
  /** Tools of the test's own, or replacements for generated ones, by name. */
  tools?: Record<string, ToolHandler>;
  context?: Partial<HostContext>;
  /** How writes are answered. `allow` unless said. */
  asks?: AskAnswer | ((call: ToolCall) => AskAnswer);
  /** Run Brydio's prelude before the screen. On unless a test needs it off. */
  prelude?: boolean;
  /** The host's budgets, in milliseconds. A test can shorten them. */
  budgets?: { ready?: number; start?: number };
}

/** A call the screen made, and what became of it. */
export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  /** Whether it waited on the person, and what they said. */
  asked?: 'allow' | 'deny';
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
const MAX_TOAST = 200;

export class FakeHost {
  readonly tree = new TreeStore();
  readonly store: FixtureStore | null;
  /** Every message the worker sent, in order. */
  readonly received: Rpc[] = [];
  readonly calls: ToolCall[] = [];
  readonly refusals: Refusal[] = [];
  readonly toasts: { text: string; tone: 'info' | 'success' | 'danger' }[] = [];
  /** What the worker threw, or failed to load with. */
  readonly errors: string[] = [];
  app: { name: string; version: string } | null = null;
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

  private constructor(options: FakeHostOptions) {
    this.#options = options;
    this.#context = { ...DEFAULT_CONTEXT, ...options.context };
    this.store = options.manifest ? new FixtureStore(options.manifest, options.fixtures) : null;
    this.#tools = { ...this.store?.tools(), ...options.tools };
    this.#writes = new Set(
      options.manifest && options.manifest.tools?.generated !== false
        ? collectionsOf(options.manifest).flatMap(spec =>
            Object.entries(toolNames(spec))
              .filter(([verb]) => TOOL_WRITES[verb as keyof typeof TOOL_WRITES])
              .map(([, name]) => name),
          )
        : [],
    );

    const entry = options.entry.startsWith('file:') ? options.entry : pathToFileURL(isAbsolute(options.entry) ? options.entry : resolve(options.entry)).href;
    const prelude = options.prelude === false ? '' : `(${workerPrelude.toString()})(self);\n`;
    // As the frame page starts it: the prelude, then the app's module. A
    // failed import is thrown on a fresh task so it reaches `error`.
    const source =
      prelude +
      `import(${JSON.stringify(entry)}).catch(function (error) { setTimeout(function () { throw new Error("brydio:load " + (error && error.message)); }); });\n`;

    this.#worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })), { type: 'module' });
    this.#worker.addEventListener('message', event => this.#receive(event.data));
    this.#worker.addEventListener('error', event => {
      event.preventDefault?.();

      const message = String((event as ErrorEvent).message ?? '');

      this.errors.push(message);
      this.stop(message.includes('brydio:load') ? 'load' : 'error');
    });

    this.#after(options.budgets?.ready ?? 10_000, () => {
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
  press(node: string | TreeNode): void {
    this.event(typeof node === 'string' ? node : node.id, 'press');
  }

  event(node: string, name: string, detail?: unknown): void {
    if (this.stopped || !this.tree.has(node)) return;

    this.#send({ jsonrpc: '2.0', method: 'tree/event', params: detail === undefined ? { node, name } : { node, name, detail } });
  }

  /** The screen moved, resized or changed theme. */
  setContext(change: Partial<HostContext>): void {
    this.#context = { ...this.#context, ...change };

    if (this.app) this.#send({ jsonrpc: '2.0', method: 'host/context', params: this.#context as never });
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
    setTimeout(() => this.#worker.terminate(), 0);
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
        this.#send({ jsonrpc: '2.0', method: 'host/context', params: this.#context as never });
        this.#after(this.#options.budgets?.start ?? 2_000, () => {
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
      case 'data/get':
      case 'data/list':
        if (!this.app || message.id === undefined) break;

        this.#send({
          jsonrpc: '2.0',
          method: 'data/error',
          params: { id: message.id, error: { code: -32601, message: 'Reading data from a screen isn’t available yet.' } },
        });
        break;
      case 'ui/toast': {
        const text = typeof params.text === 'string' ? params.text.slice(0, MAX_TOAST) : '';
        const tone = params.tone === 'success' || params.tone === 'danger' ? params.tone : 'info';

        if (this.app && text) this.toasts.push({ text, tone });
        break;
      }
      // `ui/navigate` is dropped until Phase 1, as the host drops it.
    }

    this.#changed();
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

/** A node's words: its text, or the label, text or title setting. */
export function wordsOf(node: TreeNode): string | undefined {
  if (node.type === TEXT_NODE) return node.text;

  for (const name of ['label', 'text', 'title']) {
    const value = node.props[name];

    if (typeof value === 'string') return value;
  }

  return undefined;
}
