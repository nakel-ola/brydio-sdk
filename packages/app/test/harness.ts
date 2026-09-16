import { Bridge, createRoot, type BuiltApp, type HostContext, type Port, type RootOptions, type RpcMessage } from '../src/index.ts';

/** A context like the one Brydio sends for a project tab. */
export const CONTEXT: HostContext = {
  theme: 'light',
  locale: 'en-GB',
  placement: { id: 'pl_1', kind: 'project-tab', projectId: 'pr_1' },
  instance: { id: 'in_1', name: 'Issues', scope: 'workspace' },
  size: { width: 960, height: 640 },
};

/** Lets every queued microtask and timer of this turn run. */
export const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * A bridge and a root with a pretend host on the other end of the port: what
 * the worker sent is in `sent`, and `hostSays` sends it something back.
 */
export function harness(options: Omit<RootOptions, 'bridge'> & { app?: Partial<BuiltApp> } = {}) {
  const sent: RpcMessage[] = [];
  let listener: (message: unknown) => void = () => {};
  const port: Port = {
    post: message => sent.push(JSON.parse(JSON.stringify(message))),
    listen: next => {
      listener = next;

      return () => {
        listener = () => {};
      };
    },
  };
  const bridge = new Bridge(port, { app: { name: 'test-app', version: '1.0.0', ...options.app } });
  const root = createRoot({ ...options, bridge });
  const hostSays = (method: string, params?: unknown) => listener({ jsonrpc: '2.0', method, params });

  return {
    sent,
    bridge,
    root,
    hostSays,
    /** Says ready, answers with the context, and lets the first tree go up. */
    async connect() {
      const connected = bridge.connect();

      hostSays('host/context', CONTEXT);
      await connected;
      await settle();
    },
    /** The messages sent since the last call, and forgets them. */
    take(): RpcMessage[] {
      return sent.splice(0, sent.length);
    },
  };
}
