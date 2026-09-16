// Says it is ready and then draws nothing, to be stopped for it.
self.postMessage({ jsonrpc: '2.0', method: 'worker/ready', params: { protocol: 'brydio-tree/1', app: { name: 'plain', version: '1.0.0' } } });
