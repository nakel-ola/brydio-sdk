import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Bridge, GrantError, HostError, SDK_VERSION, TeardownError, ToolError, card } from '../src/index.ts';
import { CONTEXT, harness, settle } from './harness.ts';

const result = (structuredContent: unknown, text = 'ok') => ({ content: [{ type: 'text', text }], structuredContent });

describe('tools (contracts §9, as built)', () => {
  test('tools/call carries its id in the envelope and the params, and resolves with what the tool returned', async () => {
    const { bridge, take, hostSays, connect } = harness();

    await connect();
    take();

    const call = bridge.callTool('create_issue', { title: 'New issue', status: 'todo' });

    expect(take()).toEqual([
      { jsonrpc: '2.0', id: '1', method: 'tools/call', params: { id: '1', tool: 'create_issue', input: { title: 'New issue', status: 'todo' } } },
    ]);

    hostSays('tools/result', { id: '1', result: result({ id: 'issue_1', version: 1 }, 'Created issue issue_1.') });

    expect(await call).toEqual({ id: 'issue_1', version: 1 });
  });

  test('a result the tool marked isError rejects with its code, its sentence and the record as it is now', async () => {
    const { bridge, hostSays, connect } = harness();

    await connect();

    const call = bridge.callTool('update_issue', { id: 'issue_1', version: 1, status: 'done' });

    hostSays('tools/result', {
      id: '1',
      result: {
        isError: true,
        content: [{ type: 'text', text: 'This issue changed since you read it. Here it is as it is now; make the change again on version 2.\n{"id":"issue_1"}' }],
        structuredContent: { error: 'stale', current: { id: 'issue_1', version: 2 } },
      },
    });

    const error = (await call.catch(failure => failure)) as ToolError & { data: { current: unknown } };

    expect(error).toBeInstanceOf(ToolError);
    expect(error.code).toBe('stale');
    expect(error.message).toBe('This issue changed since you read it. Here it is as it is now; make the change again on version 2.');
    expect(error.data.current).toEqual({ id: 'issue_1', version: 2 });
  });

  test('a tools/error rejects with the host’s code and message: a refusal, or the person saying no', async () => {
    const { bridge, hostSays, connect } = harness();

    await connect();

    const call = bridge.callTool('delete_issue', { id: 'issue_1' });

    hostSays('tools/error', { id: '1', error: { code: -32000, message: 'The person didn’t allow it.' } });

    const error = (await call.catch(failure => failure)) as HostError;

    expect(error).toBeInstanceOf(HostError);
    expect(error.code).toBe(-32000);
    expect(error.message).toBe('The person didn’t allow it.');
  });

  test('callToolResult hands back the whole answer, isError and all', async () => {
    const { bridge, hostSays, connect } = harness();

    await connect();

    const call = bridge.callToolResult('get_issue', { id: 'nope' });

    hostSays('tools/result', { id: '1', result: { isError: true, content: [{ type: 'text', text: 'There is no such issue.' }] } });

    expect(await call).toEqual({ isError: true, content: [{ type: 'text', text: 'There is no such issue.' }] });
  });

  test('ignores an answer to nothing and a second answer to one call', async () => {
    const { bridge, hostSays, connect } = harness();

    await connect();

    const call = bridge.callTool('get_issue', { id: 'x' });

    hostSays('tools/result', { id: '99', result: result('stray') });
    hostSays('tools/result', { id: '1', result: result('first') });
    hostSays('tools/error', { id: '1', error: { code: -32000, message: 'second' } });

    expect(await call).toBe('first');
  });
});

describe('data, through the generated tools', () => {
  test('list reads a page through list_<plural> and answers { items, nextCursor }', async () => {
    const { bridge, take, hostSays, connect } = harness({ app: { collections: { people: { label: 'person', plural: 'persons' } } } });

    await connect();
    take();

    const page = bridge.listDocuments('issues', { limit: 200, filter: { status: 'todo' } });

    expect(take()[0]?.params).toEqual({ id: '1', tool: 'list_issues', input: { limit: 200, filter: { status: 'todo' } } });
    hostSays('tools/result', { id: '1', result: result({ items: [{ id: 'a', version: 1 }], nextCursor: 'c2' }) });
    expect(await page).toEqual({ items: [{ id: 'a', version: 1 }], nextCursor: 'c2' });

    void bridge.listDocuments('people');
    expect(take()[0]?.params).toMatchObject({ tool: 'list_persons' });
  });

  test('get reads one record through get_<label>', async () => {
    const { bridge, take, hostSays, connect } = harness();

    await connect();
    take();

    const read = bridge.getDocument('labels', 'label_1');

    expect(take()[0]?.params).toEqual({ id: '1', tool: 'get_label', input: { id: 'label_1' } });
    hostSays('tools/result', { id: '1', result: result({ id: 'label_1', version: 1, name: 'Bug' }) });
    expect(await read).toEqual({ id: 'label_1', version: 1, name: 'Bug' });
  });
});

describe('asking the host to open something, and toasts', () => {
  test('navigate is a request, answered ui/result once it is open or ui/error saying why not; a toast is a notice', async () => {
    const { bridge, take, connect, hostSays } = harness();

    await connect();
    take();

    const chat = bridge.navigate({ kind: 'chat', id: 'ch_1' });
    const missing = bridge.navigate({ kind: 'item', id: 'issue_9' });

    bridge.toast('Saved', 'success');

    expect(take()).toEqual([
      { jsonrpc: '2.0', id: '1', method: 'ui/navigate', params: { to: { kind: 'chat', id: 'ch_1' } } },
      { jsonrpc: '2.0', id: '2', method: 'ui/navigate', params: { to: { kind: 'item', id: 'issue_9' } } },
      { jsonrpc: '2.0', method: 'ui/toast', params: { text: 'Saved', tone: 'success' } },
    ]);

    hostSays('ui/error', { id: '2', error: { code: -32000, message: 'There is no such issue.' } });
    hostSays('ui/result', { id: '1', result: { opened: true } });
    // A second answer to the same call changes nothing.
    hostSays('ui/error', { id: '1', error: { code: -32000, message: 'late' } });

    expect(await chat).toEqual({ opened: true });

    const refused = (await missing.catch(error => error)) as HostError;

    expect(refused).toBeInstanceOf(HostError);
    expect([refused.message, refused.code]).toEqual(['There is no such issue.', -32000]);

    const waiting = bridge.navigate({ kind: 'file', id: 'file_1' });

    hostSays('worker/teardown');
    expect(await waiting.catch(error => error)).toBeInstanceOf(TeardownError);
  });

  test('the host context reaches subscribers each time it is sent', async () => {
    const { bridge, hostSays, connect } = harness();
    const themes: string[] = [];

    bridge.subscribe(context => themes.push(context.theme));
    await connect();
    hostSays('host/context', { ...CONTEXT, theme: 'dark' });

    expect(themes).toEqual(['light', 'dark']);
    expect(bridge.context?.theme).toBe('dark');
  });

  test('a tree/refused nobody listens for is logged with its node and reason', async () => {
    const { hostSays, connect } = harness();
    const logged: string[] = [];
    const original = console.error;

    await connect();
    console.error = (line: string) => logged.push(line);
    hostSays('tree/refused', { op: 'insert', node: 'n9', reason: 'bry-button needs a label.' });
    console.error = original;

    expect(logged).toEqual(['Brydio refused part of this screen (insert n9): bry-button needs a label.']);
  });
});

const bridge = (made: { bridge: Bridge }) => made.bridge;

describe('grants', () => {
  test('refuse a call the manifest does not ask for, naming the grant, before it leaves', async () => {
    const { bridge, take, connect } = harness({ app: { grants: { tools: ['create_issue'], collections: ['issues'], host: [] } } });

    await connect();
    take();

    const refused = (await bridge.callTool('delete_issue', { id: 'x' }).catch(error => error)) as GrantError;

    expect(refused).toBeInstanceOf(GrantError);
    expect(refused.message).toContain('Add "delete_issue" (or "*") to grants.tools');
    expect(await bridge.listDocuments('labels').catch(error => error.grant)).toBe('collections');
    expect(() => bridge.navigate({ kind: 'chat', id: 'x' })).toThrow('grants.host');
    expect(take()).toEqual([]);
  });

  test('grant a collection’s generated tools by the collection’s name, as the server’s grants.ts does, but only with the collection', async () => {
    const byCollection = harness({ app: { grants: { tools: ['issues'], collections: ['issues'], host: ['*'] }, collections: { issues: { label: 'issue', plural: 'issues' } } } });

    await byCollection.connect();
    byCollection.take();
    void bridge(byCollection).callTool('delete_issue', { id: 'x' });
    void bridge(byCollection).listDocuments('issues');
    await settle();

    expect(byCollection.take().map(one => (one.params as { tool: string }).tool)).toEqual(['delete_issue', 'list_issues']);
    expect((await bridge(byCollection).callTool('create_label').catch((error: GrantError) => error) as GrantError).message).toContain('grants.tools');
    // `*` covers navigate and message, never a connection.
    void bridge(byCollection).navigate({ kind: 'chat', id: 'c' });
    expect(byCollection.take().map(one => one.method)).toEqual(['ui/navigate']);

    // Granted by collection name without the collection itself: refused on the collection.
    const orphan = harness({ app: { grants: { tools: ['labels', 'create_issue'], collections: ['issues'] } } });

    await orphan.connect();
    orphan.take();

    expect((await bridge(orphan).callTool('create_label').catch((error: GrantError) => error) as GrantError).grant).toBe('collections');
    // A tool named outright over a collection that isn't granted is refused too.
    const named = harness({ app: { grants: { tools: ['get_note'], collections: ['issues'] }, collections: { notes: { label: 'note', plural: 'notes' } } } });

    expect((await bridge(named).callTool('get_note').catch((error: GrantError) => error) as GrantError).grant).toBe('collections');
    expect(orphan.take()).toEqual([]);
  });

  test('let "*" through for tools and collections', async () => {
    const { bridge, take, connect } = harness({ app: { grants: { tools: ['*'], collections: ['*'] } } });

    await connect();
    take();
    void bridge.callTool('anything');

    expect(take()).toHaveLength(1);
  });
});

describe('teardown', () => {
  test('rejects what is waiting, runs the listeners and sends nothing more', async () => {
    const { bridge, root, take, hostSays, connect } = harness();
    let heard = false;

    await connect();
    bridge.onTeardown(() => {
      heard = true;
    });

    const call = bridge.callTool('create_issue');

    take();
    hostSays('worker/teardown');

    expect(await call.catch(error => error)).toBeInstanceOf(TeardownError);
    expect(heard).toBe(true);

    root.appendChild(card());
    bridge.toast('too late');
    await settle();

    expect(take()).toEqual([]);
  });
});

describe('watching data (contracts §9, data/subscribe)', () => {
  const data = (method: string) => (message: { method?: string }) => message.method === method;

  test('asks once per collection after the host has answered ready, and lets go when the last listener stops', async () => {
    const { bridge, take, hostSays, connect } = harness();
    const heard: unknown[] = [];

    // Before the context: nothing goes, because the host drops what comes before ready.
    const first = bridge.watch('issues', changes => heard.push(['first', changes]));

    expect(take().filter(data('data/subscribe'))).toEqual([]);

    await connect();

    const second = bridge.watch('issues', changes => heard.push(['second', changes]));

    await settle();

    expect(take().filter(one => one.method?.startsWith('data/'))).toEqual([
      { jsonrpc: '2.0', id: '1', method: 'data/subscribe', params: { collection: 'issues' } },
    ]);

    hostSays('data/result', { id: '1', result: { watching: true } });
    hostSays('data/changed', { collection: 'issues', changes: [{ id: 'issue_1', op: 'update', version: 2 }] });
    hostSays('data/changed', { collection: 'labels', changes: [{ id: 'label_1', op: 'create', version: 1 }] });

    expect(heard).toEqual([
      ['first', [{ id: 'issue_1', op: 'update', version: 2 }]],
      ['second', [{ id: 'issue_1', op: 'update', version: 2 }]],
    ]);

    first();
    expect(take()).toEqual([]);

    second();
    second();
    expect(take()).toEqual([{ jsonrpc: '2.0', id: '2', method: 'data/unsubscribe', params: { collection: 'issues' } }]);

    hostSays('data/changed', { collection: 'issues', changes: [{ id: 'issue_1', op: 'delete', version: 2 }] });
    expect(heard).toHaveLength(2);
  });

  test('tells each listener why the host refused or ended a watch, and asks again next time', async () => {
    const { bridge, take, hostSays, connect } = harness();
    const ended: [string, number][] = [];

    await connect();
    take();
    bridge.watch('a', () => {}, error => ended.push([error.message, error.code]));
    await settle();
    hostSays('data/error', { id: '1', error: { code: -32000, message: 'An app can watch at most 5 collections at once.' } });

    bridge.watch('b', () => {}, error => ended.push([error.message, error.code]));
    await settle();
    hostSays('data/result', { id: '2', result: { watching: true } });
    hostSays('data/ended', { collection: 'b', message: 'The app stopped hearing about changes.' });

    expect(ended).toEqual([
      ['An app can watch at most 5 collections at once.', -32000],
      ['The app stopped hearing about changes.', -32000],
    ]);

    bridge.watch('b', () => {});
    await settle();

    expect(take().filter(data('data/subscribe')).map(one => one.params)).toEqual([{ collection: 'a' }, { collection: 'b' }, { collection: 'b' }]);
  });

  test('refuses a collection the manifest doesn’t grant, and sends nothing after teardown', async () => {
    const { bridge, take, hostSays, connect } = harness({ app: { grants: { collections: ['issues'] } } });

    expect(() => bridge.watch('secrets', () => {})).toThrow(GrantError);

    await connect();

    const stop = bridge.watch('issues', () => {});

    await settle();
    take();
    hostSays('worker/teardown');
    stop();

    expect(take()).toEqual([]);
  });
});

test('the runtime reports the package’s own version', () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'));

  expect(SDK_VERSION).toBe(pkg.version);
});
