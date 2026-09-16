// Reads through §9's data/get and data/list itself, and draws each answer as a line.
const answers: string[] = [];
const asks = [
  { method: 'data/list', params: { collection: 'notes', limit: 1 } },
  { method: 'data/get', params: { collection: 'notes', id: 'note_a' } },
  { method: 'data/get', params: { collection: 'notes', id: 'note_gone' } },
  { method: 'data/list', params: { collection: 'elsewhere' } },
  { method: 'data/get', params: { collection: 'notes' } },
];

self.addEventListener('message', event => {
  const data = (event as MessageEvent).data as { method?: string; params?: { id?: string; result?: unknown; error?: { code: number; message: string } } };

  if (data?.method === 'host/context') {
    asks.forEach((ask, at) => self.postMessage({ jsonrpc: '2.0', id: `r${at}`, ...ask }));

    return;
  }

  if (data?.method !== 'data/result' && data?.method !== 'data/error') return;

  const at = Number(data.params?.id?.slice(1));

  answers[at] = data.method === 'data/result' ? JSON.stringify(data.params?.result) : `${data.params?.error?.code} ${data.params?.error?.message}`;

  if (answers.filter(one => one !== undefined).length < asks.length) return;

  const nodes = answers.map((text, index) => ({ id: `t${index}`, type: 'bry-text', props: { text: text.slice(0, 4_000) } }));

  self.postMessage({ jsonrpc: '2.0', method: 'tree/mount', params: { root: 'root', nodes: [{ id: 'root', type: 'bry-stack', children: nodes.map(node => node.id) }, ...nodes] } });
});
self.postMessage({ jsonrpc: '2.0', method: 'worker/ready', params: { protocol: 'brydio-tree/1', app: { name: 'plain', version: '1.0.0' } } });
