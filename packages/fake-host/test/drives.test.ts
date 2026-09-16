import { build } from '@brydio/cli';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FakeHost } from '../src/index.ts';

const app = join(import.meta.dir, 'fixtures', 'plain');
const manifest = JSON.parse(readFileSync(join(app, '.brydio/app.json'), 'utf8'));
let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(app, { minify: false, checkSource: false })).problems).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

async function open() {
  host = FakeHost.start({ entry: join(app, 'dist', 'screens', 'drives.js'), manifest });
  await host.mounted();

  return host;
}

const heard = () => host!.findAll(node => node.type === 'bry-text')[0]!.props.text;
const one = (type: string) => host!.findAll(node => node.type === type)[0]!;
const patches = () => host!.received.filter(message => message.method === 'tree/patch').flatMap(message => (message.params as { ops: unknown[] }).ops);

describe('driving a screen', () => {
  test('sends any event an element declares, with what a real one carries, and receives the patches it causes', async () => {
    await open();

    host!.raise('bry-input', one('bry-input'), 'change', { value: 'Fix' });
    await host!.waitFor(() => heard() === 'typed Fix');
    host!.raise('bry-menu', one('bry-menu'), 'select', { id: 'archive' });
    await host!.waitFor(() => heard() === 'chose archive');
    host!.raise('bry-checkbox', one('bry-checkbox'), 'change', { checked: true });
    await host!.waitFor(() => heard() === 'done true');

    const [todo, doing] = host!.findAll(node => node.type === 'bry-board-column');
    const first = one('bry-card');

    host!.raise('bry-board', one('bry-board'), 'move', { card: first.id, from: todo!.id, to: doing!.id, position: 0 });
    await host!.waitFor(() => heard() === 'moved to Doing at 0');

    expect(host!.tree.get(doing!.id)!.children).toEqual([first.id]);
    expect(patches()).toContainEqual({ op: 'move', id: first.id, parent: doing!.id, index: 0 });
    expect(patches()).toContainEqual({ op: 'props', id: host!.findAll(node => node.type === 'bry-text')[0]!.id, props: { text: 'moved to Doing at 0' } });
    expect(host!.refusals).toEqual([]);
  });

  test('refuses to send an event the element does not raise, as Brydio never would', async () => {
    await open();

    expect(() => host!.event(one('bry-checkbox'), 'press')).toThrow('Brydio would never send that: bry-checkbox raises change, not "press".');
    expect(() => host!.event(host!.findAll(node => node.type === 'bry-text')[0]!, 'press')).toThrow('bry-text raises no events');
    // @ts-expect-error a checkbox's change carries whether it is ticked
    expect(() => host!.raise('bry-checkbox', one('bry-checkbox'), 'change', { value: 'x' })).not.toThrow();
  });

  test('an event for an unknown node is dropped, one for a node the screen has just removed does nothing, and events land in order', async () => {
    await open();

    expect(host!.event('nowhere', 'press')).toBe(false);

    // Two presses sent before the screen's patch arrives: the host still draws
    // the button, so both go, and the runtime drops the second for a node that has gone.
    const once = host!.byText('Once')!;

    expect(host!.press(once)).toBe(true);
    expect(host!.press(once)).toBe(true);
    await host!.waitFor(() => !host!.byText('Once'), { what: 'the button to go' });
    await host!.idle();

    expect(heard()).toBe('pressed 1');
    // Now that the host has it removed too, a press is dropped here.
    expect(host!.press(once.id)).toBe(false);

    // Keystrokes arrive, and are heard, in the order they were made.
    const field = one('bry-input');

    for (const value of ['F', 'Fi', 'Fix']) host!.raise('bry-input', field, 'change', { value });
    await host!.waitFor(() => heard() === 'typed F > Fi > Fix', { what: 'all three, in order' });
    expect(host!.errors).toEqual([]);
    expect(host!.refusals).toEqual([]);
  });
});
