// Speaks the protocol by hand, badly, to be stopped for it.
self.addEventListener('message', event => {
  if (event.data?.method !== 'host/context') return;

  self.postMessage({ jsonrpc: '2.0', method: 'tree/mount', params: { root: 'root', nodes: [{ id: 'root', type: 'bry-stack', children: ['a'] }, { id: 'a', type: 'bry-slider' }] } });
  self.postMessage({
    jsonrpc: '2.0',
    method: 'tree/patch',
    params: {
      ops: [
        { op: 'insert', parent: 'root', index: 0, node: { id: 'b', type: 'bry-button' } },
        { op: 'props', id: 'root', props: { gap: '12' } },
      ],
    },
  });
});

self.postMessage({ jsonrpc: '2.0', method: 'worker/ready', params: { protocol: 'brydio-tree/1', app: { name: 'plain', version: '1.0.0' } } });
