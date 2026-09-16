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
