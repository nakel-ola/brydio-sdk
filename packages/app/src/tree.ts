import { FORBIDDEN_PROPS, TEXT_NODE, checkText, eventOfHandler, type BryEvent, type ElementAttributes, type ElementName } from '@brydio/ui';

import { defaultBridge, type Bridge } from './bridge.ts';
import { MAX_ID_CHARS, MAX_NODES, ROOT_ID, type Node, type NodeId, type Op, type PropValue, type TreeEventParams } from './protocol.ts';

/**
 * The screen's tree, as it lives in the worker (ADR-A02, contracts §9).
 *
 * An app never touches a page. It builds a tree of catalogue elements here,
 * and the root turns every change into the protocol: the whole tree once as
 * `tree/mount`, then each microtask's changes as one `tree/patch`. Brydio
 * draws the tree with its own kit on the other side
 * (`packages/app/src/apps/tree/tree-store.ts`).
 *
 * The nodes are shaped like DOM nodes on purpose — `appendChild`,
 * `insertBefore`, `setAttribute`, `addEventListener`, `data` — because that is
 * the surface Preact renders into, and it is also a small, familiar API for an
 * app that uses no framework. They are not DOM nodes: they come only in the
 * five catalogue types and text, and they refuse what the host would refuse,
 * in the host's words, at the line that tried it. A mistake fails on the
 * builder's machine rather than as a `tree/refused`, and three of those stop
 * the app in front of a person.
 *
 * Every property an app or Preact can see is a getter or a method. That
 * matters because Preact sets a prop by assigning `dom[name] = value` when
 * the node already has a property of that name. An assignment to a getter
 * throws, Preact falls back to `setAttribute`, and `setAttribute` checks the
 * catalogue — so `<bry-text parentNode="x">` is refused, not obeyed.
 */

export type TreeErrorCode = 'element' | 'prop' | 'event' | 'child' | 'text' | 'cap' | 'structure';

export class TreeError extends Error {
  constructor(
    readonly code: TreeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TreeError';
  }
}

/** Every element Brydio draws is named `bry-something`. */
const ELEMENT_NAME = /^bry-[a-z][a-z-]*$/;

const XHTML = 'http://www.w3.org/1999/xhtml';

// Internal state lives under symbols, which no prop name can reach.
const $parent = Symbol('parent');
const $root = Symbol('root');
const $children = Symbol('children');
const $dispatch = Symbol('dispatch');
const $adopt = Symbol('adopt');
const $forget = Symbol('forget');
const $structure = Symbol('structure');
const $dirty = Symbol('dirty');

/**
 * Settings that are an answer rather than a state, so saying the same again
 * is sent again: a board's `settled` puts a card back each time it arrives,
 * even when it names the card it named last time.
 */
const ANSWERS: Partial<Record<ElementName, readonly string[]>> = { 'bry-board': ['settled'] };

let lastId = 0;

/** Ids are unique across the worker, which runs one screen. Short, well inside the host's 128. */
const nextId = (): NodeId => `n${++lastId}`;

type Listener = ((this: RemoteElement, event: BryEvent<unknown>) => void) | { handleEvent(event: BryEvent<unknown>): void };

export abstract class RemoteNode {
  readonly #id: NodeId;
  [$parent]: RemoteElement | null = null;
  [$root]: RemoteRoot | null = null;

  constructor(id: NodeId) {
    if (!id || id.length > MAX_ID_CHARS) {
      throw new TreeError('structure', `A node id must be text of at most ${MAX_ID_CHARS} characters.`);
    }

    this.#id = id;
  }

  get id(): NodeId {
    return this.#id;
  }

  abstract get nodeType(): 1 | 3;

  /** The element's name, or `#text`. */
  abstract get nodeName(): string;

  get parentNode(): RemoteElement | null {
    return this[$parent];
  }

  get nextSibling(): RemoteNode | null {
    const siblings = this[$parent]?.[$children];

    return siblings ? (siblings[siblings.indexOf(this) + 1] ?? null) : null;
  }

  get previousSibling(): RemoteNode | null {
    const siblings = this[$parent]?.[$children];

    return siblings ? (siblings[siblings.indexOf(this) - 1] ?? null) : null;
  }

  /** Whether the node is in a root's tree, and so on the host's screen. */
  get isConnected(): boolean {
    return this[$root] !== null;
  }

  remove(): void {
    this[$parent]?.removeChild(this);
  }

  /** This node as the protocol carries it, with or without its children's ids. */
  abstract toNode(withChildren?: boolean): Node;
}

export class RemoteText extends RemoteNode {
  #text: string;

  constructor(text: string) {
    const refused = checkText(String(text));

    if (refused) throw new TreeError('text', refused);

    super(nextId());
    this.#text = String(text);
  }

  get nodeType(): 3 {
    return 3;
  }

  get nodeName(): string {
    return TEXT_NODE;
  }

  /** The text. Preact writes this when a text child changes. */
  get data(): string {
    return this.#text;
  }

  set data(text: string) {
    this.setText(text);
  }

  get nodeValue(): string {
    return this.#text;
  }

  set nodeValue(text: string) {
    this.setText(text);
  }

  get textContent(): string {
    return this.#text;
  }

  set textContent(text: string) {
    this.setText(text);
  }

  setText(text: string): void {
    const next = String(text);
    const refused = checkText(next);

    if (refused) throw new TreeError('text', refused);
    if (next === this.#text) return;

    this.#text = next;
    this[$root]?.[$dirty](this, null);
  }

  toNode(): Node {
    return { id: this.id, type: TEXT_NODE, text: this.#text };
  }
}

export class RemoteElement<E extends ElementName = ElementName> extends RemoteNode {
  readonly #type: E;
  #props: Record<string, PropValue> = {};
  readonly #handlers = new Map<string, (event: BryEvent<unknown>) => void>();
  readonly #listeners = new Map<string, Set<Listener>>();
  [$children]: RemoteNode[] = [];

  constructor(type: E, id: NodeId = nextId()) {
    // The name only: what each element takes is the catalogue's business, and
    // the catalogue is not carried here (A5-F03-S01). `brydio validate` and the
    // editor read it as the app is written, and the host refuses every node it
    // is sent, so a screen carries neither the table nor a second opinion.
    const refused =
      type === (TEXT_NODE as string)
        ? 'Text goes in a text node, not an element.'
        : ELEMENT_NAME.test(type)
          ? null
          : `${String(type)} is not one of Brydio’s elements, which are all named bry-something.`;

    if (refused) throw new TreeError('element', refused);

    super(id);
    this.#type = type;
  }

  get nodeType(): 1 {
    return 1;
  }

  get nodeName(): E {
    return this.#type;
  }

  get localName(): E {
    return this.#type;
  }

  get tagName(): E {
    return this.#type;
  }

  get namespaceURI(): string {
    return XHTML;
  }

  get childNodes(): readonly RemoteNode[] {
    return [...this[$children]];
  }

  get firstChild(): RemoteNode | null {
    return this[$children][0] ?? null;
  }

  get lastChild(): RemoteNode | null {
    return this[$children][this[$children].length - 1] ?? null;
  }

  /** The element's settings as they travel: handlers are not among them. */
  get props(): Readonly<Record<string, PropValue>> {
    return { ...this.#props };
  }

  /** There is no style in a Brydio app; asking for one is the mistake, so it is refused here. */
  get style(): never {
    throw new TreeError('prop', `${this.#type} has no style. ${FORBIDDEN_PROPS.style}`);
  }

  get innerHTML(): string {
    return '';
  }

  set innerHTML(_html: string) {
    throw new TreeError('prop', `${this.#type} has no HTML. ${FORBIDDEN_PROPS.innerHTML}`);
  }

  getAttribute(name: string): PropValue | null {
    return Object.prototype.hasOwnProperty.call(this.#props, name) ? (this.#props[name] as PropValue) : null;
  }

  hasAttribute(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.#props, name);
  }

  /**
   * Sets one of the element's settings, checked against the catalogue.
   *
   * Values are kept as they are given, not turned into strings the way a
   * DOM attribute would be: `level={2}` is the number 2 on the wire, which is
   * what the host's whole-number check wants.
   */
  setAttribute(name: string, value: unknown): void {
    if (value === undefined || value === null) {
      this.removeAttribute(name);

      return;
    }

    // A setting no element will ever take is worth saying at once; the rest is
    // the host's to refuse, in its own words.
    const forbidden = FORBIDDEN_PROPS[name];

    if (forbidden) throw new TreeError('prop', `${this.#type} has no ${name}. ${forbidden}`);

    if (this.#props[name] === value && !ANSWERS[this.#type]?.includes(name)) return;

    this.#props[name] = value as PropValue;
    this[$root]?.[$dirty](this, name);
  }

  /**
   * Takes a setting away. Refused while the node is on screen if the host
   * can't draw the element without it: the host would refuse the patch, and
   * the node would stay as it was with nobody the wiser.
   */
  removeAttribute(name: string): void {
    if (!Object.prototype.hasOwnProperty.call(this.#props, name)) return;

    delete this.#props[name];
    this[$root]?.[$dirty](this, name);
  }

  /**
   * The plain API's setter: a setting, or a handler when the name is one
   * (`onPress`). `undefined` takes either away.
   */
  setProp(name: string, value: unknown): void {
    const event = eventOfHandler(name);

    if (event !== null && (typeof value === 'function' || value === undefined || value === null)) {
      if (typeof value === 'function') this.#handlers.set(event, value as (event: BryEvent<unknown>) => void);
      else this.#handlers.delete(event);

      return;
    }

    this.setAttribute(name, value);
  }

  setProps(attributes: Partial<ElementAttributes<E>> | Record<string, unknown>): void {
    for (const [name, value] of Object.entries(attributes)) this.setProp(name, value);
  }

  /** How Preact attaches `onPress`: as a listener for `Press` (or `press`). */
  addEventListener(type: string, listener: Listener | null): void {
    if (!listener) return;

    let set = this.#listeners.get(type);

    if (!set) this.#listeners.set(type, (set = new Set()));

    set.add(listener);
  }

  removeEventListener(type: string, listener: Listener | null): void {
    if (listener) this.#listeners.get(type)?.delete(listener);
  }

  appendChild<T extends RemoteNode>(child: T): T {
    place(this, child, null);

    return child;
  }

  insertBefore<T extends RemoteNode>(child: T, before: RemoteNode | null): T {
    place(this, child, before ?? null);

    return child;
  }

  removeChild<T extends RemoteNode>(child: T): T {
    if (child[$parent] !== this) throw new TreeError('structure', 'That node is not a child of this element.');

    const siblings = this[$children];

    siblings.splice(siblings.indexOf(child), 1);
    child[$parent] = null;

    const root = this[$root];

    if (root) {
      root[$forget](child);
      root[$structure]({ op: 'remove', id: child.id });
    }

    return child;
  }

  replaceChild<T extends RemoteNode>(child: T, old: RemoteNode): T {
    if (old[$parent] !== this) throw new TreeError('structure', 'That node is not a child of this element.');

    if (child !== old) {
      place(this, child, old);
      this.removeChild(old);
    }

    return old as unknown as T;
  }

  /** Appends nodes and text. */
  append(...children: Child[]): void {
    for (const child of flatten(children)) this.appendChild(child);
  }

  /** Replaces every child at once: the plain API's way of redrawing a list. */
  replaceChildren(...children: Child[]): void {
    const next = flatten(children);
    const keep = new Set(next);

    for (const child of [...this[$children]]) if (!keep.has(child)) this.removeChild(child);

    next.forEach((child, index) => {
      if (this[$children][index] !== child) place(this, child, this[$children][index] ?? null);
    });
  }

  toNode(withChildren = true): Node {
    const node: Node = { id: this.id, type: this.#type };

    if (Object.keys(this.#props).length) node.props = { ...this.#props };
    if (withChildren) node.children = this[$children].map(child => child.id);

    return node;
  }

  /** Hands an event from the host to this element's handlers. True when anyone was listening. */
  [$dispatch](name: string, detail: unknown): boolean {
    let heard = false;
    const handler = this.#handlers.get(name);

    if (handler) {
      heard = true;
      run(() => handler({ type: name, detail, target: this }));
    }

    for (const [registered, listeners] of this.#listeners) {
      if (registered.toLowerCase() !== name) continue;

      for (const listener of listeners) {
        heard = true;

        // A fresh plain object each time, because Preact stamps its own
        // bookkeeping onto the event; the type is the name the listener was
        // registered under, because that is how Preact finds its handler.
        const event = { type: registered, detail, target: this };

        run(() => (typeof listener === 'function' ? listener.call(this, event) : listener.handleEvent(event)));
      }
    }

    return heard;
  }
}

export interface RootOptions {
  /** The bridge to the host. The worker's own, unless a test gives another. */
  bridge?: Bridge;
  /** The node cap. Can be lowered (a test does), never raised above the host's. */
  max?: number;
  /**
   * When the first tree goes up. `connected` (the default) waits for the host's
   * first `host/context`, per §9's order; `manual` waits for `start()`.
   */
  start?: 'connected' | 'manual';
}

/** A structural op waiting to be sent. An insert is described when it is sent, not when it was made. */
type Structural =
  | { op: 'insert'; parent: NodeId; index: number; node: RemoteNode }
  | { op: 'remove'; id: NodeId }
  | { op: 'move'; id: NodeId; parent: NodeId; index: number };

/**
 * The root every screen's tree hangs from, and the thing that talks to the
 * host about it.
 *
 * The root is itself a `bry-stack` with the id `root`, because §9's tree needs
 * a root node and a column is what a screen is.
 *
 * Changes are gathered for one microtask and sent as one patch, so Preact
 * re-rendering a list is one message rather than one per card. Inserts,
 * removes and moves keep their order. Settings and text are sent as they
 * stand at the end of the microtask: an inserted node carries its settings in
 * its insert (the host refuses an insert without its required settings), and
 * a node already on screen gets one `props` op naming each setting that
 * changed, with `null` for one taken away, which is how the host's merge
 * reads it.
 */
export class RemoteRoot extends RemoteElement<'bry-stack'> {
  readonly #bridge: Bridge;
  readonly #max: number;
  readonly #nodes = new Map<NodeId, RemoteNode>();
  #queue: Structural[] = [];
  #inserted = new Set<RemoteNode>();
  #dirty = new Map<RemoteNode, Set<string>>();
  #started = false;
  #mounted = false;
  #scheduled = false;
  #stopped = false;

  constructor(options: RootOptions = {}) {
    super('bry-stack', ROOT_ID);
    this[$root] = this;
    this.#nodes.set(ROOT_ID, this);
    this.#bridge = options.bridge ?? defaultBridge();
    this.#max = Math.min(options.max ?? MAX_NODES, MAX_NODES);
    this.#bridge.onEvent(event => this.deliver(event));
    this.#bridge.onTeardown(() => {
      this.#stopped = true;
    });

    if (options.start !== 'manual') void this.#bridge.connected.then(() => this.start());
  }

  /** The bridge this root sends through. */
  get bridge(): Bridge {
    return this.#bridge;
  }

  /** Nodes in the tree now, the root included. */
  get nodeCount(): number {
    return this.#nodes.size;
  }

  get maxNodes(): number {
    return this.#max;
  }

  /** The node with that id, while it is in the tree. */
  nodeById(id: NodeId): RemoteNode | null {
    return this.#nodes.get(id) ?? null;
  }

  /**
   * Lets the tree go up: the next microtask sends `tree/mount`. The host
   * stops an app that has not mounted within two seconds of saying it was
   * ready, so the mount goes whether or not the screen has drawn anything.
   */
  start(): void {
    if (this.#started || this.#stopped) return;

    this.#started = true;
    this.#schedule();
  }

  /** Sends what is waiting now rather than at the end of the microtask. */
  flush(): void {
    this.#scheduled = false;

    if (!this.#started || this.#stopped) return;

    if (!this.#mounted) {
      this.#mounted = true;
      this.#clear();
      this.#bridge.notify('tree/mount', { root: ROOT_ID, nodes: this.snapshot() });

      return;
    }

    const ops: Op[] = this.#queue.map(op =>
      op.op === 'insert' ? { op: 'insert', parent: op.parent, index: op.index, node: op.node.toNode(false) } : op,
    );

    for (const [node, names] of this.#dirty) {
      // Gone, or described whole by its insert.
      if (node[$root] !== this || this.#inserted.has(node)) continue;

      if (node instanceof RemoteText) {
        ops.push({ op: 'text', id: node.id, text: node.data });
      } else if (node instanceof RemoteElement) {
        const now = node.props;
        const props: Record<string, PropValue | null> = {};

        for (const name of names) props[name] = Object.prototype.hasOwnProperty.call(now, name) ? now[name]! : null;

        ops.push({ op: 'props', id: node.id, props });
      }
    }

    this.#clear();

    if (ops.length) this.#bridge.notify('tree/patch', { ops });
  }

  /** Every node, parent before child, as `tree/mount` carries them. */
  snapshot(): Node[] {
    const nodes: Node[] = [];
    const walk = (node: RemoteNode) => {
      nodes.push(node.toNode(true));

      if (node instanceof RemoteElement) for (const child of node[$children]) walk(child);
    };

    walk(this);

    return nodes;
  }

  /**
   * An event from the host (`tree/event`). One about a node that is no longer
   * in the tree is dropped: the person pressed something that has since gone,
   * which is not the app's mistake or the host's.
   */
  deliver(event: TreeEventParams): boolean {
    const node = this.#nodes.get(event.node);

    return node instanceof RemoteElement ? node[$dispatch](event.name, event.detail) : false;
  }

  /** A subtree joining this tree: registered, and sent as inserts, parent before child. */
  [$adopt](node: RemoteNode, parent: RemoteElement, index: number): void {
    node[$root] = this;
    this.#nodes.set(node.id, node);
    this[$structure]({ op: 'insert', parent: parent.id, index, node });

    if (node instanceof RemoteElement) node[$children].forEach((child, at) => this[$adopt](child, node, at));
  }

  /** A subtree leaving this tree. */
  [$forget](node: RemoteNode): void {
    node[$root] = null;
    this.#nodes.delete(node.id);

    if (node instanceof RemoteElement) for (const child of node[$children]) this[$forget](child);
  }

  [$structure](op: Structural): void {
    if (this.#stopped) return;

    // Before the first mount there is nothing to patch: the mount carries the
    // tree as it is by then.
    if (this.#mounted) {
      this.#queue.push(op);

      if (op.op === 'insert') this.#inserted.add(op.node);
    }

    this.#schedule();
  }

  /** A setting (by name) or a text (`null`) changed on a node in this tree. */
  [$dirty](node: RemoteNode, name: string | null): void {
    if (this.#stopped) return;

    if (this.#mounted) {
      let names = this.#dirty.get(node);

      if (!names) this.#dirty.set(node, (names = new Set()));
      if (name !== null) names.add(name);
    }

    this.#schedule();
  }

  #clear(): void {
    this.#queue = [];
    this.#inserted = new Set();
    this.#dirty = new Map();
  }

  #schedule(): void {
    if (!this.#started || this.#scheduled || this.#stopped) return;

    this.#scheduled = true;
    queueMicrotask(() => this.flush());
  }
}

/**
 * Puts a node into a parent, before another child or at the end.
 *
 * Every check happens before anything moves, so a refused insert leaves the
 * tree as it was. What is sent depends on where the node was: nowhere (an
 * insert of its whole subtree), elsewhere in the same tree (a move), or in
 * another tree (a remove there, an insert here).
 */
function place(parent: RemoteElement, child: RemoteNode, before: RemoteNode | null): void {
  if (!(child instanceof RemoteNode)) {
    throw new TreeError('structure', 'Only nodes made by @brydio/app can go into a Brydio tree.');
  }

  if (child instanceof RemoteRoot) throw new TreeError('structure', 'The root can’t go inside anything.');
  if (before === child) return;
  if (before && before[$parent] !== parent) {
    throw new TreeError('structure', 'The node to insert before is not a child of this element.');
  }

  for (let at: RemoteNode | null = parent; at; at = at[$parent]) {
    if (at === child) throw new TreeError('structure', 'A node can’t be moved inside itself.');
  }

  const root = parent[$root];
  const oldParent = child[$parent];
  const oldRoot = child[$root];

  if (root && oldRoot !== root) {
    const after = root.nodeCount + sizeOf(child);

    if (after > root.maxNodes) {
      throw new TreeError('cap', `This screen would hold ${after} nodes, and a screen holds at most ${root.maxNodes}.`);
    }

    // What the host would refuse on arrival, refused here instead.
    const incomplete = firstIncomplete(child);

    if (incomplete) throw new TreeError('prop', incomplete);
  }

  let oldIndex = -1;

  if (oldParent) {
    oldIndex = oldParent[$children].indexOf(child);
    oldParent[$children].splice(oldIndex, 1);
  }

  const siblings = parent[$children];
  const index = before ? siblings.indexOf(before) : siblings.length;

  siblings.splice(index, 0, child);
  child[$parent] = parent;

  if (oldRoot && oldRoot !== root) {
    oldRoot[$forget](child);
    oldRoot[$structure]({ op: 'remove', id: child.id });
  }

  if (!root) return;

  if (oldRoot === root) {
    if (oldParent !== parent || oldIndex !== index) root[$structure]({ op: 'move', id: child.id, parent: parent.id, index });
  } else {
    root[$adopt](child, parent, index);
  }
}

function sizeOf(node: RemoteNode): number {
  return node instanceof RemoteElement ? node[$children].reduce((sum, child) => sum + sizeOf(child), 1) : 1;
}

function firstIncomplete(node: RemoteNode): string | null {
  if (!(node instanceof RemoteElement)) return null;

  for (const child of node[$children]) {
    const inner = firstIncomplete(child);

    if (inner) return inner;
  }

  return null;
}

function run(listener: () => void): void {
  try {
    listener();
  } catch (error) {
    console.error(error);
  }
}

// --- Making nodes -------------------------------------------------------------

/** What a factory takes as children: nodes, text, and nothing (skipped). */
export type Child = RemoteNode | string | number | null | undefined | false | readonly Child[];

function flatten(children: readonly Child[]): RemoteNode[] {
  const out: RemoteNode[] = [];

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) out.push(...flatten(child));
    else if (child instanceof RemoteNode) out.push(child);
    else out.push(new RemoteText(String(child)));
  }

  return out;
}

/** A text node. It may sit in a stack or a card. */
export function createText(text: string | number): RemoteText {
  return new RemoteText(String(text));
}

/**
 * An element, with its settings and children: `h('bry-stack', { gap: '3' },
 * h('bry-text', { text: 'Hello' }))`. An element outside the catalogue, a
 * setting it does not take, or a child it does not hold throws here.
 */
export function createElement<E extends ElementName>(
  type: E,
  attributes?: ElementAttributes<E> | Record<string, unknown> | null,
  ...children: Child[]
): RemoteElement<E> {
  const element = new RemoteElement(type);

  if (attributes) element.setProps(attributes as Record<string, unknown>);
  if (children.length) element.append(...children);

  return element;
}

export const h = createElement;

/** A new root. See `RootOptions`. */
export function createRoot(options: RootOptions = {}): RemoteRoot {
  return new RemoteRoot(options);
}

// One factory per element, with the same settings as the JSX element. Those
// that hold children (a stack, a card, a label, a grid, a list row, a virtual
// list, a dialog, a menu, a split, a board and its columns) take them after
// the settings; the rest
// take their words as a setting. `switch` is a reserved word, so a switch's
// factory is `switchElement`, as Brydio names it.

export const stack = (attributes?: ElementAttributes<'bry-stack'> | null, ...children: Child[]) =>
  createElement('bry-stack', attributes, ...children);

export const heading = (attributes: ElementAttributes<'bry-heading'>) => createElement('bry-heading', attributes);

export const text = (attributes: ElementAttributes<'bry-text'>) => createElement('bry-text', attributes);

export const button = (attributes: ElementAttributes<'bry-button'>) => createElement('bry-button', attributes);

export const card = (attributes?: ElementAttributes<'bry-card'> | null, ...children: Child[]) =>
  createElement('bry-card', attributes, ...children);

export const input = (attributes?: ElementAttributes<'bry-input'> | null) => createElement('bry-input', attributes);

export const textarea = (attributes?: ElementAttributes<'bry-textarea'> | null) => createElement('bry-textarea', attributes);

export const select = (attributes: ElementAttributes<'bry-select'>) => createElement('bry-select', attributes);

export const label = (attributes: ElementAttributes<'bry-label'>, ...children: Child[]) => createElement('bry-label', attributes, ...children);

export const grid = (attributes?: ElementAttributes<'bry-grid'> | null, ...children: Child[]) => createElement('bry-grid', attributes, ...children);

export const badge = (attributes: ElementAttributes<'bry-badge'>) => createElement('bry-badge', attributes);

export const avatar = (attributes: ElementAttributes<'bry-avatar'>) => createElement('bry-avatar', attributes);

export const listRow = (attributes?: ElementAttributes<'bry-list-row'> | null, ...children: Child[]) =>
  createElement('bry-list-row', attributes, ...children);

export const emptyState = (attributes: ElementAttributes<'bry-empty-state'>) => createElement('bry-empty-state', attributes);

export const skeleton = (attributes?: ElementAttributes<'bry-skeleton'> | null) => createElement('bry-skeleton', attributes);

export const table = (attributes: ElementAttributes<'bry-table'>) => createElement('bry-table', attributes);

export const virtualList = (attributes: ElementAttributes<'bry-virtual-list'>, ...children: Child[]) =>
  createElement('bry-virtual-list', attributes, ...children);

export const dialog = (attributes: ElementAttributes<'bry-dialog'>, ...children: Child[]) => createElement('bry-dialog', attributes, ...children);

export const menu = (attributes: ElementAttributes<'bry-menu'>, ...children: Child[]) => createElement('bry-menu', attributes, ...children);

export const date = (attributes?: ElementAttributes<'bry-date'> | null) => createElement('bry-date', attributes);

export const split = (attributes?: ElementAttributes<'bry-split'> | null, ...children: Child[]) => createElement('bry-split', attributes, ...children);

export const checkbox = (attributes: ElementAttributes<'bry-checkbox'>) => createElement('bry-checkbox', attributes);

export const switchElement = (attributes: ElementAttributes<'bry-switch'>) => createElement('bry-switch', attributes);

/**
 * A board, whose children are its columns. A `move` is confirmed by moving
 * the card's node (`column.insertBefore(card, …)`), which is sent as a
 * `move`, and refused with `board.setAttribute('settled', card)`, which is
 * sent every time, even for the card named last time.
 */
export const board = (attributes?: ElementAttributes<'bry-board'> | null, ...columns: Child[]) => createElement('bry-board', attributes, ...columns);

export const boardColumn = (attributes: ElementAttributes<'bry-board-column'>, ...cards: Child[]) =>
  createElement('bry-board-column', attributes, ...cards);

export const markdown = (attributes: ElementAttributes<'bry-markdown'>) => createElement('bry-markdown', attributes);

export const diff = (attributes: ElementAttributes<'bry-diff'>) => createElement('bry-diff', attributes);

// ADR-A23 (catalogue-a). A popover's, a hover card's and a tooltip's first
// child is the anchor; an accordion's and tabs' children are their panels, in
// the order their sections or tabs are named.

export const accordion = (attributes: ElementAttributes<'bry-accordion'>, ...panels: Child[]) =>
  createElement('bry-accordion', attributes, ...panels);

export const alert = (attributes: ElementAttributes<'bry-alert'>, ...children: Child[]) => createElement('bry-alert', attributes, ...children);

export const alertDialog = (attributes: ElementAttributes<'bry-alert-dialog'>) => createElement('bry-alert-dialog', attributes);

export const aspectRatio = (attributes?: ElementAttributes<'bry-aspect-ratio'> | null, ...children: Child[]) =>
  createElement('bry-aspect-ratio', attributes, ...children);

export const attachment = (attributes: ElementAttributes<'bry-attachment'>) => createElement('bry-attachment', attributes);

export const breadcrumb = (attributes: ElementAttributes<'bry-breadcrumb'>) => createElement('bry-breadcrumb', attributes);

export const bubble = (attributes?: ElementAttributes<'bry-bubble'> | null, ...children: Child[]) => createElement('bry-bubble', attributes, ...children);

export const carousel = (attributes: ElementAttributes<'bry-carousel'>, ...slides: Child[]) => createElement('bry-carousel', attributes, ...slides);

export const chart = (attributes: ElementAttributes<'bry-chart'>) => createElement('bry-chart', attributes);

export const collapsible = (attributes: ElementAttributes<'bry-collapsible'>, ...children: Child[]) =>
  createElement('bry-collapsible', attributes, ...children);

export const direction = (attributes: ElementAttributes<'bry-direction'>, ...children: Child[]) =>
  createElement('bry-direction', attributes, ...children);

export const drawer = (attributes: ElementAttributes<'bry-drawer'>, ...children: Child[]) => createElement('bry-drawer', attributes, ...children);

export const hoverCard = (attributes?: ElementAttributes<'bry-hover-card'> | null, ...children: Child[]) =>
  createElement('bry-hover-card', attributes, ...children);

export const item = (attributes?: ElementAttributes<'bry-item'> | null, ...actions: Child[]) => createElement('bry-item', attributes, ...actions);

export const kbd = (attributes: ElementAttributes<'bry-kbd'>) => createElement('bry-kbd', attributes);

export const marker = (attributes: ElementAttributes<'bry-marker'>) => createElement('bry-marker', attributes);

export const message = (attributes: ElementAttributes<'bry-message'>, ...children: Child[]) => createElement('bry-message', attributes, ...children);

export const messageScroller = (attributes: ElementAttributes<'bry-message-scroller'>, ...messages: Child[]) =>
  createElement('bry-message-scroller', attributes, ...messages);

export const popover = (attributes?: ElementAttributes<'bry-popover'> | null, ...children: Child[]) =>
  createElement('bry-popover', attributes, ...children);

export const progress = (attributes: ElementAttributes<'bry-progress'>) => createElement('bry-progress', attributes);

export const scrollArea = (attributes: ElementAttributes<'bry-scroll-area'>, ...children: Child[]) =>
  createElement('bry-scroll-area', attributes, ...children);

export const separator = (attributes?: ElementAttributes<'bry-separator'> | null) => createElement('bry-separator', attributes);

export const sheet = (attributes: ElementAttributes<'bry-sheet'>, ...children: Child[]) => createElement('bry-sheet', attributes, ...children);

export const spinner = (attributes?: ElementAttributes<'bry-spinner'> | null) => createElement('bry-spinner', attributes);

export const tabs = (attributes: ElementAttributes<'bry-tabs'>, ...panels: Child[]) => createElement('bry-tabs', attributes, ...panels);

export const tooltip = (attributes: ElementAttributes<'bry-tooltip'>, anchor: Child) => createElement('bry-tooltip', attributes, anchor);
