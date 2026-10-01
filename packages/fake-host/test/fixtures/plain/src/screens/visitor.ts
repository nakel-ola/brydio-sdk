// Asks Brydio for everything a screen might, as a public page's screen could,
// and draws each answer as a line: the context first, then one per ask.
const answers: string[] = [];
const asks: { method: string; params: Record<string, unknown> }[] = [
  { method: 'data/list', params: { collection: 'notes' } },
  { method: 'data/get', params: { collection: 'notes', id: 'note_a' } },
  { method: 'data/list', params: { collection: 'signups' } },
  { method: 'data/get', params: { collection: 'staff', id: 'staff_a' } },
  { method: 'tools/call', params: { tool: 'create_signup', input: { name: 'Ada' } } },
  { method: 'tools/call', params: { tool: 'update_signup', input: { id: 'signup_a', version: 1, name: 'Bea' } } },
  { method: 'tools/call', params: { tool: 'list_signups', input: {} } },
  { method: 'tools/call', params: { tool: 'delete_signup', input: { id: 'signup_a' } } },
  { method: 'tools/call', params: { tool: 'batch_signups', input: { changes: [] } } },
  { method: 'tools/call', params: { tool: 'create_note', input: { title: 'Mine' } } },
  { method: 'tools/call', params: { tool: 'get_note', input: { id: 'note_a' } } },
  { method: 'tools/call', params: { tool: 'book', input: {} } },
  { method: 'tools/call', params: { tool: 'internal', input: {} } },
  { method: 'data/subscribe', params: { collection: 'notes' } },
  { method: 'host/members', params: { ids: ['user_ada'] } },
  { method: 'host/projects', params: { ids: ['project_web'] } },
  { method: 'host/approval', params: { approval: 'approval_1' } },
  { method: 'api/call', params: { action: 'projects.list', input: {} } },
  { method: 'ui/message', params: { text: 'Look at this' } },
  { method: 'ui/download', params: { name: 'notes.txt', text: 'x' } },
  { method: 'ui/copy', params: { route: '/thanks' } },
  { method: 'ui/copy', params: { text: 'hello' } },
  { method: 'ui/navigate', params: { to: { kind: 'chat', id: 'chat_1' } } },
  { method: 'ui/navigate', params: { to: { kind: 'route', path: '/thanks' } } },
];
let context = '';

self.addEventListener('message', event => {
  const data = (event as MessageEvent).data as {
    method?: string;
    params?: {
      id?: string;
      result?: unknown;
      error?: { code: number; message: string };
      role?: string;
      placement?: { kind?: string };
      instance?: { scope?: string };
    };
  };

  if (data?.method === 'host/context') {
    if (context) return;

    context = `${data.params?.role} ${data.params?.placement?.kind} ${data.params?.instance?.scope}`;
    asks.forEach((ask, at) => self.postMessage({ jsonrpc: '2.0', id: `r${at}`, ...ask }));

    return;
  }

  const kind = data?.method?.split('/')[1];

  if ((kind !== 'result' && kind !== 'error') || typeof data.params?.id !== 'string') return;

  const at = Number(data.params.id.slice(1));
  const result = data.params.result as { structuredContent?: unknown } | undefined;

  answers[at] =
    kind === 'result'
      ? `${asks[at]!.method} ok ${JSON.stringify(data.method === 'tools/result' ? result?.structuredContent : result)}`
      : `${asks[at]!.method} ${data.params.error?.code} ${data.params.error?.message}`;

  if (answers.filter(one => one !== undefined).length < asks.length) return;

  const nodes = [context, ...answers].map((text, index) => ({ id: `t${index}`, type: 'bry-text', props: { text: text.slice(0, 4_000) } }));

  self.postMessage({
    jsonrpc: '2.0',
    method: 'tree/mount',
    params: { root: 'root', nodes: [{ id: 'root', type: 'bry-stack', children: nodes.map(node => node.id) }, ...nodes] },
  });
});
self.postMessage({ jsonrpc: '2.0', method: 'worker/ready', params: { protocol: 'brydio-tree/1', app: { name: 'plain', version: '1.0.0' } } });

// A module of its own, so its names are not shared with the other raw screens.
export {};
