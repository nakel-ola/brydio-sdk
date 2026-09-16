import { CATALOGUE, MAX_TEXT, TEXT_NODE, isElementName as isElement, refusalForProps, type ElementName } from '@brydio/ui';

// A copy of Brydio's `packages/app/src/apps/tree/tree-store.ts`, the host's
// receiver, with two changes only: the catalogue comes from `@brydio/ui`
// (itself a copy of the host's), and a change is announced at once rather
// than on the next animation frame, because the fake host draws nothing.
// `test/tree-store.test.ts` holds the two side by side.

const ELEMENTS = CATALOGUE;

/**
 * The tree an app's worker describes, as the host holds it (`tasks/apps`
 * A4-F02, contracts §9).
 *
 * The worker sends a whole tree once (`tree/mount`) and then only the
 * differences (`tree/patch`). Everything is checked here before anything
 * is drawn: the element must be in the catalogue, every setting must be one
 * it declares, and a value must be one it accepts. A node that fails is
 * refused on its own. Its siblings are still drawn, and the app is told
 * which node was refused and why.
 *
 * Nodes are never changed in place. A node that changes becomes a new
 * object, so a drawn node can tell by identity alone whether it needs to
 * draw again, and a burst of patches costs one redraw per changed node.
 */

/** A node as it arrives on the wire. */
export interface WireNode {
  id?: unknown;
  type?: unknown;
  props?: unknown;
  text?: unknown;
  children?: unknown;
}

export type Op =
  | { op: "insert"; parent: string; index: number; node: WireNode }
  | { op: "remove"; id: string }
  | { op: "move"; id: string; parent: string; index: number }
  | { op: "props"; id: string; props: Record<string, unknown> }
  | { op: "text"; id: string; text: string };

/** A node as the host holds it: checked, and never changed in place. */
export interface TreeNode {
  readonly id: string;
  readonly type: ElementName | typeof TEXT_NODE;
  readonly props: Readonly<Record<string, unknown>>;
  readonly text: string;
  readonly children: readonly string[];
}

/** What the app is told when part of what it sent can't be drawn. */
export interface Refusal {
  op: string;
  node?: string;
  reason: string;
}

/** Why a tree stopped the app, when it did. */
export type TreeStop = "cap" | "refusals";

export interface Outcome {
  refused: Refusal[];
  stop?: TreeStop;
}

/** Contracts §9: a screen holds at most this many nodes. */
export const MAX_NODES = 5_000;
/** Contracts §9: the third refusal stops the app. */
export const MAX_REFUSALS = 3;
const MAX_ID = 128;

/** Runs `notify` once, on the host's next frame. Injected so a test can run it now. */
export type Schedule = (notify: () => void) => void;

const now: Schedule = (notify) => notify();

export class TreeStore {
  private readonly nodes = new Map<string, TreeNode>();
  private readonly parents = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private rootId: string | null = null;
  private refusals = 0;
  private pending = false;
  /** While held, changes are applied but nobody is told; see `hold`. */
  private held = false;
  private heldChanges = false;
  private stopped: TreeStop | null = null;
  private version = 0;

  constructor(private readonly schedule: Schedule = now) {}

  get root(): string | null {
    return this.rootId;
  }

  get size(): number {
    return this.nodes.size;
  }

  /** Changes with every applied mount or patch. For a subscriber's snapshot. */
  get revision(): number {
    return this.version;
  }

  get(id: string): TreeNode | undefined {
    return this.nodes.get(id);
  }

  /** Whether an event for this node can still be delivered. */
  has(id: string): boolean {
    return this.nodes.has(id);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => void this.listeners.delete(listener);
  };

  /**
   * The whole tree, replacing whatever was there.
   *
   * Walked from the root, so a node nothing points at is never drawn, and a
   * node reached twice (a cycle, or two parents) is refused the second time.
   */
  mount(root: unknown, wire: unknown): Outcome {
    const refused: Refusal[] = [];

    if (this.stopped) return { refused, stop: this.stopped };

    if (typeof root !== "string" || !Array.isArray(wire)) {
      return this.refuse(refused, { op: "mount", reason: "A mount needs a root id and a list of nodes." });
    }

    if (wire.length > MAX_NODES) return this.stop(refused, "cap");

    const byId = new Map<string, WireNode>();

    for (const node of wire as WireNode[]) {
      if (node && typeof node === "object" && typeof node.id === "string" && !byId.has(node.id)) {
        byId.set(node.id, node);
      }
    }

    this.nodes.clear();
    this.parents.clear();
    this.rootId = null;

    const seen = new Set<string>();
    const place = (id: string, parent: string | null): boolean => {
      const node = byId.get(id);

      if (!node || seen.has(id)) {
        this.refuse(refused, {
          op: "mount",
          node: id,
          reason: node ? "A node can appear only once in a tree." : "No node has that id.",
        });

        return false;
      }

      seen.add(id);

      const checked = checkedNode(node);

      if (typeof checked === "string") {
        this.refuse(refused, { op: "mount", node: id, reason: checked });

        return false;
      }

      const wanted = Array.isArray(node.children) ? node.children : [];

      if (wanted.length && !acceptsChildren(checked)) {
        this.refuse(refused, { op: "mount", node: id, reason: `${checked.type} can’t hold other nodes.` });

        return false;
      }

      // Placed before its children, so a child that names an ancestor is
      // caught as a repeat rather than recursing for ever.
      this.nodes.set(id, checked);
      if (parent) this.parents.set(id, parent);

      const children: string[] = [];

      for (const child of wanted) {
        if (this.stopped) break;
        if (typeof child === "string" && place(child, id)) children.push(child);
      }

      this.nodes.set(id, { ...checked, children });

      return true;
    };

    if (place(root, null)) this.rootId = root;

    this.changed();

    return this.stopped ? { refused, stop: this.stopped } : { refused };
  }

  /** The differences since the last mount or patch, in order. */
  patch(ops: unknown): Outcome {
    const refused: Refusal[] = [];

    if (this.stopped) return { refused, stop: this.stopped };

    if (!Array.isArray(ops)) {
      return this.refuse(refused, { op: "patch", reason: "A patch needs a list of ops." });
    }

    for (const op of ops as Op[]) {
      if (this.stopped) break;

      const reason = this.apply(op);

      if (reason === "cap") {
        this.stop(refused, "cap");
        break;
      }

      if (reason) {
        this.refuse(refused, {
          op: typeof op?.op === "string" ? op.op : "unknown",
          node: nodeOf(op),
          reason,
        });
      }
    }

    this.changed();

    return this.stopped ? { refused, stop: this.stopped } : { refused };
  }

  /** One op. Returns why it was refused, `"cap"` to stop, or null when applied. */
  private apply(op: Op): string | null {
    if (!op || typeof op !== "object") return "An op must be an object.";

    switch (op.op) {
      case "insert": {
        const parent = this.nodes.get(op.parent);

        if (!parent) return "No node has that parent id.";
        if (!acceptsChildren(parent)) return `${parent.type} can’t hold other nodes.`;
        if (typeof op.node?.id !== "string") return "The node needs an id.";
        if (this.nodes.has(op.node.id)) return "A node with that id is already in the tree.";
        if (Array.isArray(op.node.children) && op.node.children.length) {
          return "An inserted node arrives empty; insert its children after it.";
        }
        if (this.nodes.size >= MAX_NODES) return "cap";

        const checked = checkedNode(op.node);

        if (typeof checked === "string") return checked;

        this.nodes.set(checked.id, checked);
        this.parents.set(checked.id, parent.id);
        this.nodes.set(parent.id, withChild(parent, checked.id, op.index));

        return null;
      }
      case "remove": {
        const node = this.nodes.get(op.id);

        if (!node) return "No node has that id.";
        if (op.id === this.rootId) return "The root can’t be removed; mount a new tree instead.";

        this.detach(op.id);
        this.drop(op.id);

        return null;
      }
      case "move": {
        const node = this.nodes.get(op.id);
        const parent = this.nodes.get(op.parent);

        if (!node) return "No node has that id.";
        if (!parent) return "No node has that parent id.";
        if (op.id === this.rootId) return "The root can’t be moved.";
        if (!acceptsChildren(parent)) return `${parent.type} can’t hold other nodes.`;

        for (let at: string | undefined = parent.id; at; at = this.parents.get(at)) {
          if (at === op.id) return "A node can’t be moved inside itself.";
        }

        this.detach(op.id);
        this.parents.set(op.id, parent.id);
        this.nodes.set(parent.id, withChild(this.nodes.get(parent.id)!, op.id, op.index));

        return null;
      }
      case "props": {
        const node = this.nodes.get(op.id);

        if (!node) return "No node has that id.";
        if (node.type === TEXT_NODE) return "A text node has no settings; send its text instead.";
        if (!op.props || typeof op.props !== "object" || Array.isArray(op.props)) {
          return "Settings must be an object.";
        }

        // `null` unsets a setting. Everything else replaces it.
        const props: Record<string, unknown> = { ...node.props };

        for (const [name, value] of Object.entries(op.props)) {
          if (value === null) delete props[name];
          else props[name] = value;
        }

        const refused = refusalForProps(node.type, props);

        if (refused) return refused;

        this.nodes.set(node.id, { ...node, props });

        return null;
      }
      case "text": {
        const node = this.nodes.get(op.id);

        if (!node) return "No node has that id.";
        if (node.type !== TEXT_NODE) return `${node.type} takes its text as a setting.`;
        if (typeof op.text !== "string" || op.text.length > MAX_TEXT) {
          return `Text must be at most ${MAX_TEXT} characters.`;
        }

        this.nodes.set(node.id, { ...node, text: op.text });

        return null;
      }
      default:
        return "There is no op by that name.";
    }
  }

  /** Takes a node out of its parent's children. */
  private detach(id: string): void {
    const parentId = this.parents.get(id);
    const parent = parentId ? this.nodes.get(parentId) : undefined;

    if (parent) {
      this.nodes.set(parent.id, { ...parent, children: parent.children.filter((child) => child !== id) });
    }

    this.parents.delete(id);
  }

  /** Forgets a node and everything under it. */
  private drop(id: string): void {
    const node = this.nodes.get(id);

    if (!node) return;

    for (const child of node.children) this.drop(child);

    this.nodes.delete(id);
    this.parents.delete(id);
  }

  private refuse(refused: Refusal[], refusal: Refusal): Outcome {
    refused.push(refusal);
    this.refusals += 1;

    if (this.refusals >= MAX_REFUSALS) this.stopped = "refusals";

    return this.stopped ? { refused, stop: this.stopped } : { refused };
  }

  private stop(refused: Refusal[], reason: TreeStop): Outcome {
    this.stopped = reason;

    return { refused, stop: reason };
  }

  /**
   * Holds the drawing while the screen's panel is hidden (A4-F06): patches
   * still arrive, are checked and applied, so a cap or a refusal still stops
   * the app, but nothing draws. Letting go draws once, whatever changed.
   */
  hold(held: boolean): void {
    if (this.held === held) return;

    this.held = held;

    if (!held && this.heldChanges) {
      this.heldChanges = false;
      this.version -= 1;
      this.changed();
    }
  }

  /** One notification per frame, however many patches arrived in it. */
  private changed(): void {
    this.version += 1;

    if (this.held) {
      this.heldChanges = true;

      return;
    }

    if (this.pending) return;

    this.pending = true;
    this.schedule(() => {
      this.pending = false;
      for (const listener of [...this.listeners]) listener();
    });
  }
}

/** A wire node checked against the catalogue, or why it can't be drawn. */
function checkedNode(node: WireNode): TreeNode | string {
  const id = node.id;

  if (typeof id !== "string" || !id || id.length > MAX_ID) return `A node id must be text of at most ${MAX_ID} characters.`;

  if (node.type === TEXT_NODE) {
    if (typeof node.text !== "string" || node.text.length > MAX_TEXT) {
      return `Text must be at most ${MAX_TEXT} characters.`;
    }

    return { id, type: TEXT_NODE, props: {}, text: node.text, children: [] };
  }

  if (typeof node.type !== "string" || !isElement(node.type)) {
    return `Brydio has no element called "${String(node.type)}".`;
  }

  const props = node.props ?? {};

  if (typeof props !== "object" || Array.isArray(props)) return "Settings must be an object.";

  const refused = refusalForProps(node.type, props as Record<string, unknown>);

  if (refused) return refused;

  return { id, type: node.type, props: { ...(props as Record<string, unknown>) }, text: "", children: [] };
}

const acceptsChildren = (node: TreeNode): boolean =>
  node.type !== TEXT_NODE && (ELEMENTS[node.type] as { children: boolean }).children;

/** A parent with a child placed at `index`, clamped to the ends. */
function withChild(parent: TreeNode, child: string, index: unknown): TreeNode {
  const children = [...parent.children];
  const at = Number.isInteger(index) ? Math.min(Math.max(index as number, 0), children.length) : children.length;

  children.splice(at, 0, child);

  return { ...parent, children };
}

const nodeOf = (op: Op): string | undefined => {
  if (!op || typeof op !== "object") return undefined;
  if (op.op === "insert") return typeof op.node?.id === "string" ? op.node.id : undefined;

  return typeof (op as { id?: unknown }).id === "string" ? (op as { id: string }).id : undefined;
};
