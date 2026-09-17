import type { BryEvent, ElementAttributes, ElementEventDetails } from '@brydio/ui';
import { createContext, h, render as preactRender, type ComponentChild, type ComponentChildren, type ComponentType } from 'preact';
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { defaultBridge, type Bridge } from '../bridge.ts';
import type { AppDocument, DataChange, HostContext, ListQuery, MemberName, ProjectName } from '../protocol.ts';
import { createRoot, RemoteElement, type RemoteRoot, type RootOptions } from '../tree.ts';
import { useMemberNames, useProjectNames } from './names.ts';
import { installDocument } from './document.ts';

/**
 * `@brydio/app/preact`: write a screen the way a React developer already
 * does, and have it drawn by Brydio.
 *
 * There is no custom reconciler to keep in step with Preact's internals.
 * Preact renders into the remote tree exactly as it would into a page,
 * because the remote tree's nodes have the handful of DOM methods Preact
 * uses and the adapter gives it a `document` that makes those nodes. Every
 * check the tree makes — element, setting, child, cap — therefore holds for a
 * Preact screen with no second implementation.
 *
 * An app imports Preact's hooks from here rather than from `preact`, so the
 * screen and the adapter always share one copy of Preact: two copies is the
 * classic way hooks stop working.
 */

const BridgeContext = createContext<Bridge | null>(null);

/** The bridge the screen was mounted with. */
export function useBridge(): Bridge {
  return useContext(BridgeContext) ?? defaultBridge();
}

/** Renders into a root. `mount` does this for a screen; tests call it directly. */
export function render(vnode: ComponentChild, root: RemoteRoot): void {
  installDocument();
  preactRender(h(BridgeContext.Provider, { value: root.bridge }, vnode), root as never);
}

/**
 * Connects to the host and renders the screen. The first tree goes up as soon
 * as the host has said where the screen is running, whatever the screen is
 * still waiting on; when the host stops the screen, the tree is unmounted so
 * effects clean up.
 */
export async function mount(screen: ComponentType | ComponentChild, options: RootOptions = {}): Promise<RemoteRoot> {
  // A development build's next version, imported by `@brydio/app/hot`: its
  // components are swapped into the screen already drawn, so nothing mounts twice.
  const hot = (globalThis as { __BRYDIO_HOT__?: { root?: RemoteRoot } }).__BRYDIO_HOT__;

  if (hot?.root && !options.bridge) return hot.root;

  const bridge = options.bridge ?? defaultBridge();
  const root = createRoot({ ...options, bridge });

  await bridge.connect();
  render(typeof screen === 'function' ? h(screen as ComponentType, null) : screen, root);
  bridge.onTeardown(() => render(null, root));

  if (hot && !options.bridge) hot.root = root;

  return root;
}

/** Where the screen is running, re-rendering when the host says it changed. */
export function useHost(): HostContext {
  const bridge = useBridge();
  const [context, setContext] = useState(bridge.context);

  // A layout effect listens as soon as the tree is committed. A worker has no
  // frames, so an effect runs late, and a change the host sent before then
  // (Back closing an item, say) was never drawn.
  useLayoutEffect(() => bridge.subscribe(setContext), [bridge]);

  if (!context) throw new Error('useHost() ran before the host said where the screen is. Render with mount().');

  return context;
}

export interface ListState<D> {
  items: D[];
  nextCursor: string | null;
  loading: boolean;
  error: Error | null;
  /** Reads the list again; resolves once the new list is in. */
  refetch(): Promise<void>;
}

export interface ListOptions {
  /**
   * Reads the list again whenever a record in the collection changes, by
   * this screen, another person or an agent. Off unless asked, because each
   * open app may watch only five collections.
   */
  watch?: boolean;
}

/**
 * One page of a collection, read through its generated `list_*` tool. With
 * `{ watch: true }` it reads again when the collection changes; without, a
 * screen calls `refetch()` after a write it made. An answer that arrives
 * after a newer request is dropped.
 */
export function useList<D = AppDocument>(collection: string, query: ListQuery = {}, options: ListOptions = {}): ListState<D> {
  const bridge = useBridge();
  const key = JSON.stringify(query);
  const ticket = useRef(0);
  const [state, setState] = useState<Omit<ListState<D>, 'refetch'>>({ items: [], nextCursor: null, loading: true, error: null });

  const refetch = useCallback(async () => {
    const mine = ++ticket.current;

    setState(previous => ({ ...previous, loading: true }));

    try {
      const page = await bridge.listDocuments<D>(collection, JSON.parse(key) as ListQuery);

      if (mine === ticket.current) setState({ items: page.items, nextCursor: page.nextCursor, loading: false, error: null });
    } catch (error) {
      if (mine === ticket.current) {
        setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error : new Error(String(error)) }));
      }
    }
  }, [bridge, collection, key]);

  // A layout effect starts the read as soon as the first tree is committed,
  // rather than a frame later: a worker has no frames to wait for.
  useLayoutEffect(() => {
    void refetch();
  }, [refetch]);

  useWatch(options.watch ? collection : null, () => void refetch());

  return { ...state, refetch };
}

/**
 * Calls `onChange` with each burst of changes to a collection while the
 * component is on screen, and stops when it leaves or `collection` changes.
 * `null` watches nothing. A change names a record (`{ id, op, version }`),
 * never what it holds: read it again. `onEnd` hears why the host refused or
 * stopped the watch.
 *
 * ```tsx
 * useWatch('issues', changes => changes.some(one => one.id === issue.id) && void reload());
 * ```
 */
export function useWatch(
  collection: string | null,
  onChange: (changes: DataChange[]) => void,
  onEnd?: (error: Error) => void,
): void {
  const bridge = useBridge();
  const latest = useRef({ onChange, onEnd });

  latest.current = { onChange, onEnd };

  useLayoutEffect(() => {
    if (collection === null) return;

    return bridge.watch(
      collection,
      changes => latest.current.onChange(changes),
      error => latest.current.onEnd?.(error),
    );
  }, [bridge, collection]);
}

/** A board's `move`, in the app's own keys rather than node ids. */
export interface BoardMove<Card, Column> {
  card: Card;
  from: Column;
  to: Column;
  /** The card's index in `to` after the move. */
  position: number;
}

type MoveEvent = BryEvent<ElementEventDetails['bry-board']['move']>;

export interface BoardKeys<Card, Column> {
  /** The ref for a card: `<bry-card ref={keys.card(issue.id)} …>`. The same function for the same key, each render. */
  card(key: Card): (node: RemoteElement | null) => void;
  /** The ref for a column: `<bry-board-column ref={keys.column('doing')} …>`. */
  column(key: Column): (node: RemoteElement | null) => void;
  /** What a `move` says, in your keys; null when it names a card or column that has since gone. */
  read(event: MoveEvent): BoardMove<Card, Column> | null;
  /**
   * Puts the card back: sends `settled` with its id on the board that raised
   * the move, even if it named the same card last time. Leave `settled` out
   * of the board's JSX when you use this.
   */
  refuse(event: MoveEvent): void;
}

/**
 * Turns a `bry-board`'s `move` into the app's own keys, and answers it.
 *
 * A move is confirmed the way anything else changes on a screen: change the
 * state so the card renders in its new column. Preact takes a keyed card out
 * of one parent and draws it afresh in the other, which reaches the host as a
 * `remove` and an `insert`; the host's board takes any change to a column's
 * cards as the answer, and draws what was sent. The card's node id changes
 * with it, which is why the move is read through these keys rather than kept
 * as an id.
 *
 * ```tsx
 * const keys = useBoard<string, Status>();
 *
 * <bry-board label="Issues" onMove={async event => {
 *   const move = keys.read(event);
 *   if (!move) return;
 *   try {
 *     await tools.call('update_issue', { id: move.card, status: move.to, version });
 *     setIssues(…);           // the card renders under move.to: confirmed
 *   } catch {
 *     keys.refuse(event);     // the card goes back
 *   }
 * }}>
 *   {COLUMNS.map(status => (
 *     <bry-board-column key={status} ref={keys.column(status)} title={…}>
 *       {issues.filter(one => one.status === status).map(issue => (
 *         <bry-card key={issue.id} ref={keys.card(issue.id)} title={issue.title} />
 *       ))}
 *     </bry-board-column>
 *   ))}
 * </bry-board>
 * ```
 */
export function useBoard<Card = string, Column = string>(): BoardKeys<Card, Column> {
  const keys = useRef<BoardKeys<Card, Column> | null>(null);

  keys.current ??= boardKeys<Card, Column>();

  return keys.current;
}

function boardKeys<Card, Column>(): BoardKeys<Card, Column> {
  const cards = nodeKeys<Card>();
  const columns = nodeKeys<Column>();

  return {
    card: cards.ref,
    column: columns.ref,
    read(event) {
      const { card, from, to, position } = event.detail;
      const [key, left, went] = [cards.of(card), columns.of(from), columns.of(to)];

      return key === undefined || left === undefined || went === undefined ? null : { card: key, from: left, to: went, position };
    },
    refuse(event) {
      if (event.target instanceof RemoteElement) event.target.setAttribute('settled', event.detail.card);
    },
  };
}

/** Node ids to keys, kept up to date by one stable ref per key. */
function nodeKeys<K>() {
  const refs = new Map<K, (node: RemoteElement | null) => void>();
  const nodes = new Map<K, RemoteElement>();
  const keys = new Map<string, K>();

  return {
    ref(key: K) {
      let ref = refs.get(key);

      if (!ref) {
        ref = node => {
          const held = nodes.get(key);

          if (node) {
            if (held) keys.delete(held.id);

            nodes.set(key, node);
            keys.set(node.id, key);

            return;
          }

          // A card moving column is unmounted in one and mounted in the
          // other, in either order, so only a node still gone once the
          // render has finished is forgotten.
          queueMicrotask(() => {
            const now = nodes.get(key);

            if (now && !now.isConnected) {
              nodes.delete(key);
              keys.delete(now.id);
              refs.delete(key);
            }
          });
        };
        refs.set(key, ref);
      }

      return ref;
    },
    of: (id: string): K | undefined => keys.get(id),
  };
}

// The five elements as components, for those who prefer `<Stack>` to
// `<bry-stack>`. The same settings, from the same table.

export const Stack = (props: ElementAttributes<'bry-stack'> & { children?: ComponentChildren }) => h('bry-stack', props as never);
export const Heading = (props: ElementAttributes<'bry-heading'>) => h('bry-heading', props as never);
export const Text = (props: ElementAttributes<'bry-text'>) => h('bry-text', props as never);
export const Button = (props: ElementAttributes<'bry-button'>) => h('bry-button', props as never);
export const Card = (props: ElementAttributes<'bry-card'> & { children?: ComponentChildren }) => h('bry-card', props as never);

export { Fragment, createContext, h } from 'preact';
export type { ComponentChildren, ComponentType, FunctionComponent, VNode } from 'preact';
export {
  useCallback,
  useContext,
  useEffect,
  useErrorBoundary,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'preact/hooks';
export { installDocument } from './document.ts';

/**
 * The names of members whose ids the screen holds, with initials for
 * `bry-avatar`, by id; absent until Brydio answers, or when it won't name
 * one. Needs the `members` host grant.
 *
 * ```tsx
 * const people = useMembers(issues.map(issue => issue.assignee));
 * <bry-avatar name={people.get(issue.assignee)?.name ?? 'Unassigned'} />
 * ```
 */
export function useMembers(ids: readonly (string | null | undefined)[]): Map<string, MemberName> {
  return useMemberNames(useBridge(), ids);
}

/**
 * The people this instance may name, for a picker, sorted by name: asked when
 * the screen draws and again whenever `query` changes. Empty until Brydio
 * answers. Needs the `members` host grant.
 */
export function useMemberList(query = '', limit = 50): { members: MemberName[]; loading: boolean; error: Error | null } {
  const bridge = useBridge();
  const [state, setState] = useState<{ members: MemberName[]; loading: boolean; error: Error | null }>({ members: [], loading: true, error: null });

  useLayoutEffect(() => {
    let current = true;

    bridge.listMembers({ query, limit }).then(
      members => current && setState({ members, loading: false, error: null }),
      error => current && setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error : new Error(String(error)) })),
    );

    return () => {
      current = false;
    };
  }, [bridge, query, limit]);

  return state;
}

/** The names of projects whose ids the screen holds, by id. Needs the `projects` host grant. */
export function useProjects(ids: readonly (string | null | undefined)[]): Map<string, ProjectName> {
  return useProjectNames(useBridge(), ids);
}
