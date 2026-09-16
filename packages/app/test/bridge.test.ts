import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GrantError, HostError, SDK_VERSION, TeardownError, ToolError, card } from '../src/index.ts';
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

describe('notifications', () => {
  test('navigate and toast go out as ui/navigate and ui/toast', async () => {
    const { bridge, take, connect } = harness();

    await connect();
    take();
    bridge.navigate({ kind: 'chat', id: 'ch_1' });
    bridge.toast('Saved', 'success');

    expect(take()).toEqual([
      { jsonrpc: '2.0', method: 'ui/navigate', params: { to: { kind: 'chat', id: 'ch_1' } } },
      { jsonrpc: '2.0', method: 'ui/toast', params: { text: 'Saved', tone: 'success' } },
    ]);
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

test('the runtime reports the package’s own version', () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'));

  expect(SDK_VERSION).toBe(pkg.version);
});
