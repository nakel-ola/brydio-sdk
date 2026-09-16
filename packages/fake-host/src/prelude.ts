/**
 * Brydio's worker prelude, copied from `apps/api/src/apps/frame/frame-page.ts`
 * (contracts §11) so the fake host runs a screen under the same walls a
 * workspace does: no `fetch`, no sockets, no storage, no nested workers. The
 * SDK's runtime does none of this itself; an app meets it here and in
 * Brydio, and nowhere else.
 */

/** What the prelude refuses, and how: as a call, or as a read. */
interface PreludeScope {
  navigator?: object;
  [name: string]: unknown;
}

/**
 * Takes the network, storage and nested workers away from the app's worker.
 *
 * Runs first in the worker, before the app's code is imported. Each name is
 * replaced on the global and on every prototype the global inherits it from,
 * with a stand-in that throws an error naming what was tried. The stand-in
 * can't be reconfigured, so the app can't put the original back. A name
 * that can't be replaced stops the worker rather than being skipped: an app
 * that runs with `fetch` still in reach is the one outcome this exists to
 * prevent.
 *
 * The frame's policy (`connect-src 'none'`) is what actually stops a
 * connection. This is the second lock, and the one that tells an app's
 * builder what went wrong in words rather than as a policy report.
 */
export function workerPrelude(scope: PreludeScope): string[] {
  const calls = [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'WebSocketStream',
    'EventSource',
    'WebTransport',
    'Worker',
    'SharedWorker',
    'BroadcastChannel',
    // A classic worker has it; the app's code arrives by `import()` and has
    // no use for a second way to load scripts.
    'importScripts',
  ];
  const reads = ['indexedDB', 'caches'];
  const replaced: string[] = [];

  const refusal = (name: string) =>
    function refused(): never {
      throw new Error(name + ' is not available to a Brydio app.');
    };

  const replace = (target: object, name: string, asRead: boolean): boolean => {
    const holders: object[] = [];
    let holder: object | null = target;

    // Each prototype that has its own copy, so `Object.getPrototypeOf(self)
    // .fetch` is refused as well as `self.fetch`.
    while (holder) {
      if (Object.prototype.hasOwnProperty.call(holder, name)) holders.push(holder);

      holder = Object.getPrototypeOf(holder) as object | null;
    }

    if (!holders.length) return false;

    // And the object itself, even when it only inherited the name, so the app
    // can't shadow the stand-in with a property of its own.
    if (holders[0] !== target) holders.unshift(target);

    for (const each of holders) {
      Object.defineProperty(
        each,
        name,
        asRead
          ? { get: refusal(name), configurable: false, enumerable: false }
          : { value: refusal(name), writable: false, configurable: false, enumerable: false }
      );
    }

    return true;
  };

  for (const name of calls) if (replace(scope, name, false)) replaced.push(name);
  for (const name of reads) if (replace(scope, name, true)) replaced.push(name);

  if (scope.navigator && replace(scope.navigator, 'storage', true)) {
    replaced.push('navigator.storage');
  }

  return replaced;
}

