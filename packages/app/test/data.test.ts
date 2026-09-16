import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { collection } from '../src/data.ts';
import { setDefaultBridge } from '../src/index.ts';
import { harness, settle } from './harness.ts';

const ISSUE = { title: 'string', status: ['todo', 'doing', 'done'], assignee: 'member?' } as const;
const result = (structuredContent: unknown) => ({ content: [{ type: 'text', text: 'ok' }], structuredContent });

afterEach(() => setDefaultBridge(null as never));

describe('a collection, typed from its schema', () => {
  test('puts a new record through its create tool, and an existing one through its update tool', async () => {
    // A5-F01-S02: data.put reaches the app's collections through the host.
    const { bridge, take, hostSays, connect } = harness();

    setDefaultBridge(bridge);
    await connect();
    take();

    const issues = collection('issues', ISSUE);
    const created = issues.put({ title: 'Fix the login', status: 'todo' });

    expect(take()).toMatchObject([{ method: 'tools/call', params: { tool: 'create_issue', input: { title: 'Fix the login', status: 'todo' } } }]);
    hostSays('tools/result', { id: '1', result: result({ id: 'issue_1', version: 1, title: 'Fix the login', status: 'todo' }) });
    expect(await created).toMatchObject({ id: 'issue_1', version: 1 });

    const moved = issues.put({ id: 'issue_1', version: 1, status: 'doing' });

    expect(take()).toMatchObject([{ method: 'tools/call', params: { tool: 'update_issue', input: { id: 'issue_1', version: 1, status: 'doing' } } }]);
    hostSays('tools/result', { id: '2', result: result({ id: 'issue_1', version: 2, status: 'doing' }) });
    expect((await moved).version).toBe(2);
  });

  test('queries and subscribes through the host, with the collection named once', async () => {
    const { bridge, take, connect } = harness();

    setDefaultBridge(bridge);
    await connect();
    take();

    const issues = collection('issues', ISSUE);

    void issues.query({ limit: 20 });
    // Reads go through §9's data/list, which runs the collection's own list tool on the host.
    expect(take()).toEqual([{ jsonrpc: '2.0', id: '1', method: 'data/list', params: { collection: 'issues', limit: 20 } }]);

    const stop = issues.subscribe(() => {});

    await settle();
    expect(JSON.stringify(take())).toContain('"collection":"issues"');
    stop();
  });

  test('refuses, at type level, a status the schema does not list and a field it does not have', () => {
    // A5-F01-S03: data.put on an issue rejects a status the schema does not list.
    const issues = collection('issues', ISSUE);
    const unused = () => {
      // @ts-expect-error "blocked" is not a status
      void issues.put({ title: 'x', status: 'blocked' });
      // @ts-expect-error there is no "priority" field
      void issues.put({ title: 'x', status: 'todo', priority: 1 });
      // @ts-expect-error an update names the version it read
      void issues.put({ id: 'issue_1', status: 'done' });
    };

    expect(typeof unused).toBe('function');
  });

  test('adds nothing of the manifest package to a screen\'s bundle', async () => {
    // A screen that uses \`collection\` must not carry \`@brydio/manifest\`'s schemas (zod) with it.
    const built = await Bun.build({ entrypoints: [join(import.meta.dir, '..', 'src', 'data.ts')], target: 'browser', minify: true });
    const size = (await built.outputs[0]!.text()).length;

    expect(built.success).toBe(true);
    expect(size).toBeLessThan(60_000);
  });
});
