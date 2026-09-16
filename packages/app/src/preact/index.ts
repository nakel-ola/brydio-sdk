import type { ElementAttributes } from '@brydio/ui';
import { createContext, h, render as preactRender, type ComponentChild, type ComponentChildren, type ComponentType } from 'preact';
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { defaultBridge, type Bridge } from '../bridge.ts';
import type { AppDocument, HostContext, ListQuery } from '../protocol.ts';
import { createRoot, type RemoteRoot, type RootOptions } from '../tree.ts';
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
  const bridge = options.bridge ?? defaultBridge();
  const root = createRoot({ ...options, bridge });

  await bridge.connect();
  render(typeof screen === 'function' ? h(screen as ComponentType, null) : screen, root);
  bridge.onTeardown(() => render(null, root));

  return root;
}

/** Where the screen is running, re-rendering when the host says it changed. */
export function useHost(): HostContext {
  const bridge = useBridge();
  const [context, setContext] = useState(bridge.context);

  useEffect(() => bridge.subscribe(setContext), [bridge]);

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

/**
 * One page of a collection, read through its generated `list_*` tool. Phase 0
 * has no live updates, so a screen calls `refetch()` after a write it made; an
 * answer that arrives after a newer request is dropped.
 */
export function useList<D = AppDocument>(collection: string, query: ListQuery = {}): ListState<D> {
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

  return { ...state, refetch };
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
