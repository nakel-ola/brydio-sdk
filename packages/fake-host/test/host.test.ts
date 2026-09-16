import { build } from '@brydio/cli';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FakeHost, testApp } from '../src/index.ts';

const app = join(import.meta.dir, 'fixtures', 'plain');
const manifest = JSON.parse(readFileSync(join(app, '.brydio/app.json'), 'utf8'));
const screen = (name: string) => join(app, 'dist', 'screens', `${name}.js`);
let host: FakeHost | null = null;

beforeAll(async () => {
  // The fixture reaches for fetch and sockets on purpose, to prove the prelude refuses them.
  expect((await build(app, { minify: false, checkSource: false })).problems).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

describe('a screen, end to end in a worker', () => {
  test('says ready with the built app’s name, mounts, and reads through the list tool', async () => {
    host = FakeHost.start({ entry: screen('counter'), manifest, fixtures: { notes: [{ title: 'First' }, { title: 'Second' }] } });

    await host.mounted();
    await host.waitFor(() => host!.byText('2 notes'), { what: 'the count' });

    expect(host.app).toEqual({ name: 'plain', version: '1.0.0' });
    expect(host.received[0]).toMatchObject({ method: 'worker/ready', params: { protocol: 'brydio-tree/1' } });
    expect(host.received.filter(message => message.method === 'tree/mount')).toHaveLength(1);
    expect(host.calls).toMatchObject([{ tool: 'list_notes', input: {} }]);
    expect(host.outline()).toBe(
      ['bry-stack', '  bry-stack gap="2"', '    bry-text text="2 notes"', '    bry-button label="Add a note"'].join('\n'),
    );
  });

  test('a press reaches onPress, and tools.call goes to the host and back', async () => {
    host = FakeHost.start({ entry: screen('counter'), manifest });

    await host.mounted();
    await host.waitFor(() => host!.byText('0 notes'));

    host.press(host.byText('Add a note')!);
    await host.waitFor(() => host!.byText('1 notes'), { what: 'the new count' });

    expect(host.calls.map(call => [call.tool, call.asked])).toEqual([
      ['list_notes', undefined],
      ['create_note', 'allow'],
      ['list_notes', undefined],
    ]);
    expect(host.calls[1]?.result).toMatchObject({ structuredContent: { id: 'note_1', version: 1, title: 'Hello' } });
    expect(host.store!.records('notes')).toMatchObject([{ title: 'Hello' }]);
    expect(host.toasts).toEqual([{ text: 'Added a note.', tone: 'success' }]);
    expect(host.refusals).toEqual([]);
  });

  test('a write the person does not allow comes back to the screen as the host words it', async () => {
    host = FakeHost.start({ entry: screen('counter'), manifest, asks: 'deny' });

    await host.mounted();
    await host.waitFor(() => host!.byText('0 notes'));
    host.press(host.byText('Add a note')!);

    await host.waitFor(() => host!.byText('Refused: The person didn’t allow it.'), { what: 'the refusal' });
    expect(host.store!.records('notes')).toEqual([]);
  });

  test('a held write waits until the person answers', async () => {
    host = FakeHost.start({ entry: screen('counter'), manifest, asks: 'hold' });

    await host.mounted();
    await host.waitFor(() => host!.byText('0 notes'));
    host.press(host.byText('Add a note')!);
    await host.waitFor(() => host!.calls.length === 2);
    await Bun.sleep(30);

    expect(host.byText('0 notes')).toBeDefined();

    await host.answer('allow');
    await host.waitFor(() => host!.byText('1 notes'));
  });
});

describe('what the host stops an app for', () => {
  test('three refusals, each sent back with the host’s reason', async () => {
    host = FakeHost.start({ entry: screen('broken'), manifest });

    await host.waitFor(() => host!.stopped, { what: 'the stop' });

    expect(host.stopped).toBe('refusals');
    expect(host.refusals).toEqual([
      { op: 'mount', node: 'a', reason: 'Brydio has no element called "bry-slider".' },
      { op: 'insert', node: 'b', reason: 'bry-button needs a label.' },
      { op: 'props', node: 'root', reason: 'bry-stack gap must be one of 1, 2, 3, 4, 5, 6, 7, 8.' },
    ]);
  });

  test('no tree within the start budget after worker/ready', async () => {
    host = FakeHost.start({ entry: screen('silent'), manifest, budgets: { start: 50 } });

    await host.waitFor(() => host!.stopped, { what: 'the stop' });

    expect(host.stopped).toBe('start');
  });

  test('a tree over 5,000 nodes, for the host’s reason', async () => {
    host = FakeHost.start({ entry: screen('flood'), manifest });

    await host.waitFor(() => host!.stopped, { what: 'the stop' });

    expect(host.stopped).toBe('cap');
  });

  test('budgets a test can shorten but never lengthen past the host’s', async () => {
    host = FakeHost.start({ entry: screen('silent'), manifest, budgets: { start: 60_000 } });

    expect(host.budgets).toEqual({ ready: 10_000, start: 2_000 });

    host.stop();
    host = FakeHost.start({ entry: screen('silent'), manifest, budgets: { ready: 5, start: 50 } });

    expect(host.budgets).toEqual({ ready: 5, start: 50 });
  });

  test('a module that cannot be loaded', async () => {
    host = FakeHost.start({ entry: join(app, 'dist', 'screens', 'missing.js'), manifest });

    await host.waitFor(() => host!.stopped, { what: 'the stop' });

    expect(host.stopped).toBe('load');
  });
});

test('Brydio’s prelude has taken the network and storage away before the screen runs', async () => {
  host = FakeHost.start({ entry: screen('walls'), manifest });

  await host.mounted();

  expect(host.findAll(node => node.type === 'bry-text').map(node => node.props.text)).toEqual([
    'fetch is not available to a Brydio app.',
    'Worker is not available to a Brydio app.',
    'WebSocket is not available to a Brydio app.',
  ]);
});

describe('testApp, for an app’s own tests', () => {
  const template = join(import.meta.dir, '..', '..', '..', 'templates', 'preact');

  test('finds the app above a test, builds it, and starts a screen by its name', async () => {
    const found = await testApp(join(template, 'test', 'home.test.ts'));

    expect(found.root).toBe(template);
    expect(found.manifest.name).toBe('checklist');

    const started = found.start('home');

    await started.mounted();
    expect(started.app).toEqual({ name: 'checklist', version: '0.1.0' });
    expect(() => found.start('nowhere')).toThrow('The manifest has no "nowhere" screen. It has home.');

    found.stopAll();
  });

  test('refuses to test an app that does not build, saying why', async () => {
    // This fixture reaches for fetch on purpose, which a real build refuses.
    await expect(testApp(app)).rejects.toThrow(/did not build[\s\S]*network_global/);
  });
});
