import { afterEach, describe, expect, test } from 'bun:test';

import { Bridge, GrantError, setDefaultBridge, type Port, type RpcMessage } from '@brydio/app';
import { api } from '../src/index.ts';

function host(grants: string[]) {
  const sent: RpcMessage[] = [];
  let receive: (message: unknown) => void = () => {};
  const port: Port = {
    post: message => sent.push(JSON.parse(JSON.stringify(message))),
    listen: listener => {
      receive = listener;

      return () => undefined;
    },
  };
  const bridge = new Bridge(port, {
    app: { name: 'api-test', version: '1.0.0', grants: { host: grants } },
  });

  setDefaultBridge(bridge);

  return {
    sent,
    answer(id: string, result: unknown) {
      receive({ jsonrpc: '2.0', method: 'api/result', params: { id, result } });
    },
  };
}

afterEach(() => setDefaultBridge(null));

describe('@brydio/api', () => {
  test('maps every project read and write to the closed action names', async () => {
    const app = host(['projects']);
    const calls = [
      api.projects.list({ query: 'road' }),
      api.projects.get('prj_1'),
      api.projects.create({ name: 'Roadmap', instructions: 'Ship it' }),
      api.projects.update('prj_1', { pinned: true }),
      api.projects.remove('prj_1', { withChats: true }),
      api.projects.archiveChats('prj_1'),
    ];

    expect(app.sent.map(message => [message.method, message.params])).toEqual([
      ['api/call', { action: 'projects.list', input: { query: 'road' } }],
      ['api/call', { action: 'projects.get', input: { id: 'prj_1' } }],
      ['api/call', { action: 'projects.create', input: { name: 'Roadmap', instructions: 'Ship it' } }],
      ['api/call', { action: 'projects.update', input: { id: 'prj_1', changes: { pinned: true } } }],
      ['api/call', { action: 'projects.remove', input: { id: 'prj_1', withChats: true } }],
      ['api/call', { action: 'projects.archiveChats', input: { id: 'prj_1' } }],
    ]);

    calls.forEach((_, index) => app.answer(String(index + 1), { ok: index + 1 }));
    expect((await Promise.all(calls)) as unknown).toEqual([1, 2, 3, 4, 5, 6].map(ok => ({ ok })));
  });

  test('maps every file and chat read and write without an address or credential', () => {
    const app = host(['files', 'chats', 'connection:microsoft']);

    void api.files.list('prj_1');
    void api.files.read('src_1');
    void api.files.upload('prj_1', { name: 'brief.txt', mimeType: 'text/plain', base64: 'aGk=' });
    void api.files.addFromConnection('prj_1', { connection: 'microsoft', itemId: 'item_1', driveId: 'drive_1' });
    void api.files.replace('src_1', { name: 'brief.txt', base64: 'bmV3' });
    void api.files.remove('src_1');
    void api.chats.list({ projectId: 'prj_1' });
    void api.chats.get('chat_1');
    void api.chats.create({ title: 'Plan', assistantId: 'brydio', projectId: 'prj_1' });
    void api.chats.update('chat_1', { title: 'Plan v2' });
    void api.chats.send('chat_1', { message: 'What changed?' });
    void api.chats.remove('chat_1');

    expect(app.sent.map(message => (message.params as { action: string }).action)).toEqual([
      'files.list', 'files.read', 'files.upload', 'files.addFromConnection', 'files.replace', 'files.remove',
      'chats.list', 'chats.get', 'chats.create', 'chats.update', 'chats.send', 'chats.remove',
    ]);
    expect(JSON.stringify(app.sent)).not.toMatch(/token|cookie|baseUrl|https?:/i);
  });

  test('uses the exact named connection grant and sends only a relative request', () => {
    const allowed = host(['connection:github']);

    void api.connections.use('github').request({ method: 'POST', path: '/repos/brydio/issues', body: { title: 'Bug' } });

    expect(allowed.sent).toEqual([
      {
        jsonrpc: '2.0',
        id: '1',
        method: 'api/call',
        params: {
          action: 'connections.request',
          input: { connection: 'github', method: 'POST', path: '/repos/brydio/issues', body: { title: 'Bug' } },
        },
      },
    ]);

    const refused = host(['*']);
    expect(() => api.connections.use('github').request({ path: '/user' })).toThrow(GrantError);
    expect(refused.sent).toEqual([]);
  });

  test('refuses a missing family grant before the call leaves the worker', () => {
    const app = host(['files']);

    expect(() => api.projects.list()).toThrow('Add "projects" to grants.host');
    expect(app.sent).toEqual([]);
  });

  test('requires the exact connection as well as files before importing one', () => {
    const app = host(['files', 'connection:github']);

    expect(() =>
      api.files.addFromConnection('prj_1', { connection: 'microsoft', itemId: 'item_1' }),
    ).toThrow('Add "connection:microsoft" to grants.host');
    expect(app.sent).toEqual([]);
  });
});
