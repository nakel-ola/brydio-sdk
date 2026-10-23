import type { RpcMessage } from './protocol.ts';

/**
 * The one way in and out of a worker, as the bridge sees it.
 *
 * In an app it is the worker's own `self.postMessage` and `message` event,
 * which Brydio's frame relays to the host unread (contracts §11). The runtime
 * takes nothing away from the worker's global scope: Brydio's prelude has
 * already done that before the app's code was imported, and an app can't
 * skip a boot it doesn't ship. A test gives the bridge a port of its own.
 */
export interface Port {
  post(message: RpcMessage): void;
  /** Starts listening; the returned function stops. */
  listen(listener: (message: unknown) => void): () => void;
}

interface WorkerScope {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

/** The port of the worker this code is running in. */
export function workerPort(scope: WorkerScope = globalThis as unknown as WorkerScope): Port {
  return {
    // A JSON copy: nothing a structured clone would carry that the host's
    // JSON reading would not, so a mistake shows up here rather than there.
    post: message => scope.postMessage(JSON.parse(JSON.stringify(message))),
    listen(listener) {
      const onMessage = (event: { data: unknown }) => listener(event.data);

      scope.addEventListener('message', onMessage);

      return () => scope.removeEventListener('message', onMessage);
    },
  };
}

interface FrameScope {
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: 'message', listener: (event: { data: unknown; source: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown; source: unknown }) => void): void;
  document?: unknown;
}

/**
 * The port of a frame screen (`tasks/app-publishing` PB27): the app's own
 * page, in Brydio's sandboxed frame, talks to the window above it, and hears
 * only that window. The same messages as a worker's, so a frame screen gets
 * the same SDK — `data`, `tools`, `navigate`, `toast`, `ask` — over the same
 * bridge, with the same checks on Brydio's side.
 */
export function framePort(scope: FrameScope = globalThis as unknown as FrameScope): Port {
  return {
    post: message => scope.parent.postMessage(JSON.parse(JSON.stringify(message)), '*'),
    listen(listener) {
      const onMessage = (event: { data: unknown; source: unknown }) => {
        if (event.source === scope.parent) listener(event.data);
      };

      scope.addEventListener('message', onMessage);

      return () => scope.removeEventListener('message', onMessage);
    },
  };
}

/** Whether this code runs in a page inside a frame (a frame screen) rather than a worker. */
export function inFrameScreen(scope: Partial<FrameScope> & { self?: unknown } = globalThis as never): boolean {
  return typeof scope.document !== 'undefined' && scope.parent !== undefined && (scope.parent as unknown) !== (scope as unknown);
}
