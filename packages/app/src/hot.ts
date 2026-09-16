import '@prefresh/core';
import { options } from 'preact';

import { defaultBridge } from './bridge.ts';
import type { DevUpdateParams } from './protocol.ts';

/**
 * `@brydio/app/hot`: a saved change reaches an open screen without losing
 * what's on it (A5-F02-S02, A5-F06-S02). `brydio dev` builds it into a
 * development build only. `brydio build` never does, and a test holds that.
 *
 * The build is split in two. The screen's own code is the entry, and one
 * shared chunk holds Preact, this runtime and prefresh, named for what it
 * contains, so a save leaves its name alone. When the host says `dev/update`,
 * the worker imports the new entry, which reuses the chunk the worker
 * already has. Bun's `--react-fast-refresh` has each component register
 * itself (`$RefreshReg$`), and prefresh swaps the new functions into the
 * rendered tree, keeping each component's hooks unless their order changed.
 *
 * Every way that can go wrong ends in `dev/restart`, and the host starts the
 * screen over. That covers an entry that fails to load or throws, a new
 * chunk (a second Preact would render nothing the old one drew), a swap that
 * throws, and a render after the swap that throws. A half-swapped screen is
 * never left standing.
 */

interface Prefresh {
  register(type: unknown, id: string): void;
  sign(type: unknown, key: string, forceReset: boolean, getCustomHooks: (() => unknown[]) | undefined, status: string): string;
  getSignature(type: unknown): { key?: string; forceReset?: boolean } | undefined;
  computeKey(signature: object): string;
  getPendingUpdates(): [unknown, unknown][];
  flush(): void;
  replaceComponent(previous: unknown, next: unknown, resetHooks: boolean): void;
}

/** What every copy of this runtime in the worker shares. A second copy means a second Preact. */
export interface HotState {
  copies: number;
  /** The screen's root once mounted; a later `mount()` is the new build's, and returns it. */
  root?: unknown;
}

type HotScope = typeof globalThis & {
  __PREFRESH__: Prefresh;
  __BRYDIO_HOT__?: HotState;
  $RefreshReg$?: (type: unknown, id: string) => void;
  $RefreshSig$?: () => (type: unknown, key: string, forceReset?: boolean, getCustomHooks?: () => unknown[]) => unknown;
};

/** How long a swapped screen has to render before the update counts as done. */
const SETTLE_MS = 50;

const scope = globalThis as HotScope;

if (scope.__BRYDIO_HOT__) scope.__BRYDIO_HOT__.copies += 1;
else scope.__BRYDIO_HOT__ = { copies: 1 };

scope.$RefreshReg$ = (type, id) => scope.__PREFRESH__.register(type, id);
scope.$RefreshSig$ = () => {
  let status = 'begin';
  let saved: unknown;

  return (type, key, forceReset, getCustomHooks) => {
    saved ??= type;
    status = scope.__PREFRESH__.sign(type ?? saved, key, forceReset === true, getCustomHooks, status);

    return type;
  };
};

/** Errors Preact caught while an update is settling; null when none is. */
let caught: unknown[] | null = null;
const internal = options as typeof options & { __e?: (error: unknown, ...rest: unknown[]) => void };
const passOn = internal.__e;

internal.__e = (error, ...rest) => {
  if (caught) {
    caught.push(error);

    return;
  }

  passOn?.(error, ...rest);
};

/** Swaps the components the last import registered, as `@prefresh/utils`' `flush` does. */
function swap(prefresh: Prefresh): void {
  const pending = [...prefresh.getPendingUpdates()];

  prefresh.flush();

  for (const [previous, next] of pending) {
    const before = prefresh.getSignature(previous) ?? {};
    const after = prefresh.getSignature(next) ?? {};
    const reset =
      before.key !== after.key || prefresh.computeKey(before) !== prefresh.computeKey(after) || after.forceReset === true;

    prefresh.replaceComponent(previous, next, reset);
  }
}

/** Takes one update: `dev/updated` when the new build is on screen, `dev/restart` otherwise. */
export async function applyUpdate(
  { entry, build }: DevUpdateParams,
  load: (entry: string) => Promise<unknown> = url => import(url),
): Promise<'updated' | 'restart'> {
  const bridge = defaultBridge();
  const state = scope.__BRYDIO_HOT__!;
  const copies = state.copies;
  const restart = (reason: string): 'restart' => {
    caught = null;
    bridge.notify('dev/restart', { build, reason });

    return 'restart';
  };

  if (!state.root) return restart('The screen had not mounted yet.');

  try {
    await load(entry);
  } catch (error) {
    return restart(`The new build did not load: ${messageOf(error)}`);
  }

  if (scope.__BRYDIO_HOT__!.copies !== copies) return restart('The new build brought its own copy of Preact.');

  caught = [];

  try {
    swap(scope.__PREFRESH__);
  } catch (error) {
    return restart(`The new build could not be swapped in: ${messageOf(error)}`);
  }

  await new Promise(resolve => setTimeout(resolve, SETTLE_MS));

  if (caught.length) return restart(`The new build threw while drawing: ${messageOf(caught[0])}`);

  caught = null;
  bridge.notify('dev/updated', { build });

  return 'updated';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

defaultBridge().onDevUpdate(update => void applyUpdate(update));
