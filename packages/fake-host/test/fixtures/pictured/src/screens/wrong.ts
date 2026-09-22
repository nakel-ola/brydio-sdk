// Sends a node Brydio has no element for.
self.addEventListener('message', event => {
  if ((event as MessageEvent).data?.method !== 'host/context') return;

  self.postMessage({ jsonrpc: '2.0', method: 'tree/mount', params: { root: 'root', nodes: [{ id: 'root', type: 'bry-stack', children: ['a'] }, { id: 'a', type: 'bry-hologram' }] } });
});
self.postMessage({ jsonrpc: '2.0', method: 'worker/ready', params: { protocol: 'brydio-tree/1', app: { name: 'pictured', version: '1.0.0' } } });
