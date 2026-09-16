// Sends a first tree of 5,001 nodes, past the cap, as a runtime that skipped its own check would.
self.addEventListener('message', event => {
  if ((event as MessageEvent).data?.method !== 'host/context') return;

  const nodes = Array.from({ length: 5_001 }, (_, at) => ({ id: `n${at}`, type: 'bry-stack', props: {}, children: [] }));

  self.postMessage({ jsonrpc: '2.0', method: 'tree/mount', params: { root: 'n0', nodes } });
});
self.postMessage({ jsonrpc: '2.0', method: 'worker/ready', params: { protocol: 'brydio-tree/1', app: { name: 'plain', version: '1.0.0' } } });
