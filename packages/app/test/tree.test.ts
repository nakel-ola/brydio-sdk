import { describe, expect, test } from 'bun:test';

import {
  PROTOCOL,
  ROOT_ID,
  SDK_VERSION,
  TreeError,
  badge,
  board,
  boardColumn,
  button,
  card,
  checkbox,
  dialog,
  diff,
  emptyState,
  listRow,
  markdown,
  select,
  switchElement,
  table,
  virtualList,
  createElement,
  createText,
  heading,
  stack,
  text,
  type TreePatchParams,
} from '../src/index.ts';
import { harness, settle } from './harness.ts';

const opsOf = (message: { params?: unknown } | undefined) => (message?.params as TreePatchParams).ops;

describe('the first messages (contracts §9)', () => {
  test('say worker/ready first, and send the tree only after host/context', async () => {
    const { bridge, root, sent, hostSays } = harness();

    root.appendChild(heading({ level: 1, text: 'Issues' }));
    await settle();
    expect(sent).toEqual([]);

    const connected = bridge.connect();

    expect(sent).toEqual([
      { jsonrpc: '2.0', method: 'worker/ready', params: { protocol: PROTOCOL, app: { name: 'test-app', version: '1.0.0' }, sdk: SDK_VERSION } },
    ]);

    hostSays('host/context', { theme: 'dark' });
    await connected;
    await settle();

    const title = root.firstChild!;

    expect(sent[1]).toEqual({
      jsonrpc: '2.0',
      method: 'tree/mount',
      params: {
        root: ROOT_ID,
        nodes: [
          { id: ROOT_ID, type: 'bry-stack', children: [title.id] },
          { id: title.id, type: 'bry-heading', props: { level: 1, text: 'Issues' }, children: [] },
        ],
      },
    });
  });

  test('mount an empty tree at once rather than wait for the screen, inside the host’s two seconds', async () => {
    const { sent, connect } = harness();

    await connect();

    expect(sent[1]).toMatchObject({ method: 'tree/mount', params: { nodes: [{ id: ROOT_ID, type: 'bry-stack', children: [] }] } });
  });

  test('say worker/ready once, however often connect is called', async () => {
    const { bridge, sent } = harness();

    void bridge.connect();
    void bridge.connect();

    expect(sent.filter(one => one.method === 'worker/ready')).toHaveLength(1);
  });
});

describe('patches (contracts §9, as the host applies them)', () => {
  test('insert a subtree as one insert per node, each arriving empty, parent before child', async () => {
    const { root, connect, take } = harness();

    await connect();
    take();

    const title = text({ text: 'Fix the login page' });
    const move = button({ label: 'Move to Doing' });
    const inner = stack({ gap: '2' }, title, move);
    const issue = card({ padding: '3' }, inner);

    root.appendChild(issue);
    await settle();

    const [patch] = take();

    expect(patch?.method).toBe('tree/patch');
    expect(opsOf(patch)).toEqual([
      { op: 'insert', parent: ROOT_ID, index: 0, node: { id: issue.id, type: 'bry-card', props: { padding: '3' } } },
      { op: 'insert', parent: issue.id, index: 0, node: { id: inner.id, type: 'bry-stack', props: { gap: '2' } } },
      { op: 'insert', parent: inner.id, index: 0, node: { id: title.id, type: 'bry-text', props: { text: 'Fix the login page' } } },
      { op: 'insert', parent: inner.id, index: 1, node: { id: move.id, type: 'bry-button', props: { label: 'Move to Doing' } } },
    ]);
  });

  test('remove, move, props and text each send their own op; props name only what changed, null for what went', async () => {
    const { root, connect, take } = harness();
    const a = card({ title: 'A', padding: '2' });
    const b = card({ title: 'B' });
    const c = card({ title: 'C' });
    const words = createText('3 issues');
    const count = stack(null, words);

    root.append(a, b, c, count);
    await connect();
    take();

    root.removeChild(b);
    await settle();
    expect(opsOf(take()[0])).toEqual([{ op: 'remove', id: b.id }]);

    root.insertBefore(c, a);
    await settle();
    expect(opsOf(take()[0])).toEqual([{ op: 'move', id: c.id, parent: ROOT_ID, index: 0 }]);

    a.setAttribute('padding', '4');
    a.setAttribute('title', 'A, renamed');
    a.removeAttribute('padding');
    await settle();
    expect(opsOf(take()[0])).toEqual([{ op: 'props', id: a.id, props: { padding: null, title: 'A, renamed' } }]);

    words.data = '2 issues';
    await settle();
    expect(opsOf(take()[0])).toEqual([{ op: 'text', id: words.id, text: '2 issues' }]);
  });

  test('gather one microtask’s changes into one patch; a node inserted in it carries its settings as they ended', async () => {
    const { root, connect, take } = harness();

    await connect();
    take();

    const one = card({ title: 'One' });
    const two = card({ title: 'Two' });

    root.appendChild(one);
    root.appendChild(two);
    one.setAttribute('title', 'First');
    root.insertBefore(two, one);
    await settle();

    const messages = take();

    expect(messages).toHaveLength(1);
    expect(opsOf(messages[0])).toEqual([
      { op: 'insert', parent: ROOT_ID, index: 0, node: { id: one.id, type: 'bry-card', props: { title: 'First' } } },
      { op: 'insert', parent: ROOT_ID, index: 1, node: { id: two.id, type: 'bry-card', props: { title: 'Two' } } },
      { op: 'move', id: two.id, parent: ROOT_ID, index: 0 },
    ]);
  });

  test('send nothing for a node that is not in the tree, and all of it when it joins', async () => {
    const { root, connect, take } = harness();

    await connect();
    take();

    const loose = card({ title: 'Draft' });

    loose.setAttribute('title', 'Final');
    loose.appendChild(text({ text: 'Body' }));
    await settle();
    expect(take()).toEqual([]);

    root.appendChild(loose);
    await settle();

    const ops = opsOf(take()[0]);

    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ op: 'insert', node: { props: { title: 'Final' } } });
  });

  test('send a remove when a node leaves for a parent outside the tree', async () => {
    const { root, connect, take } = harness();
    const moving = card({ title: 'Moving' });

    root.appendChild(moving);
    await connect();
    take();

    stack().appendChild(moving);
    await settle();

    expect(opsOf(take()[0])).toEqual([{ op: 'remove', id: moving.id }]);
    expect(root.nodeById(moving.id)).toBeNull();
  });

  test('do not send a move that leaves a node where it was', async () => {
    const { root, connect, take } = harness();
    const a = card();
    const b = card();

    root.append(a, b);
    await connect();
    take();

    root.insertBefore(a, b);
    root.appendChild(b);
    await settle();

    expect(take()).toEqual([]);
  });

  test('replaceChildren redraws a list with the fewest ops', async () => {
    const { root, connect, take } = harness();
    const [a, b, c] = [card({ title: 'a' }), card({ title: 'b' }), card({ title: 'c' })];

    root.append(a, b, c);
    await connect();
    take();

    const d = card({ title: 'd' });

    root.replaceChildren(c, a, d);
    await settle();

    expect(opsOf(take()[0])).toEqual([
      { op: 'remove', id: b.id },
      { op: 'move', id: c.id, parent: ROOT_ID, index: 0 },
      { op: 'insert', parent: ROOT_ID, index: 2, node: { id: d.id, type: 'bry-card', props: { title: 'd' } } },
    ]);
    expect(root.childNodes).toEqual([c, a, d]);
  });
});

describe('the cap (5,000 nodes, the root included)', () => {
  test('refuses the insert that would take the tree over the cap, and leaves the tree as it was', async () => {
    const { root, connect, take } = harness({ max: 10 });

    await connect();
    take();

    root.append(...Array.from({ length: 6 }, (_, at) => card({ title: String(at) })));
    await settle();
    take();

    const big = stack(null, card(), card(), card(), card());

    expect(() => root.appendChild(big)).toThrow(TreeError);
    expect(() => root.appendChild(big)).toThrow('would hold 12 nodes');
    expect(root.nodeCount).toBe(7);
    expect(big.parentNode).toBeNull();

    root.appendChild(card());
    expect(root.nodeCount).toBe(8);
  });

  test('is 5,000 by default and cannot be raised above it', () => {
    expect(harness().root.maxNodes).toBe(5_000);
    expect(harness({ max: 9_999 }).root.maxNodes).toBe(5_000);
  });

  test('lets exactly 5,000 in, and refuses the next', () => {
    const { root } = harness();

    root.append(...Array.from({ length: 4_999 }, () => createText('x')));
    expect(root.nodeCount).toBe(5_000);
    expect(() => root.appendChild(createText('one too many'))).toThrow('at most 5000');
  });
});

describe('refusals, in the host’s words, at the line that made the mistake', () => {
  test('an element outside the catalogue', () => {
    expect(() => createElement('div' as never)).toThrow('Brydio has no element called "div".');
    expect(() => createElement('bry-kanban' as never)).toThrow(TreeError);
  });

  test('a setting the element does not take, or a value it does not allow', () => {
    const node = stack();

    expect(() => node.setAttribute('style', 'color: red')).toThrow('bry-stack has no setting called "style". Brydio draws every element in its own style');
    expect(() => node.setAttribute('className', 'box')).toThrow('no classes');
    expect(() => node.setAttribute('gap', '9')).toThrow('bry-stack gap must be one of 1, 2, 3, 4, 5, 6, 7, 8.');
    expect(() => heading({ text: 'x', level: '2' as never })).toThrow('bry-heading level must be a whole number from 1 to 4.');
    expect(() => button({ label: 'x'.repeat(201) })).toThrow('bry-button label must be text of at most 200 characters.');
    expect(() => node.style).toThrow('has no style');
    expect(() => {
      node.innerHTML = '<b>hi</b>';
    }).toThrow('has no HTML');
    expect(node.props).toEqual({});
  });

  test('an element without the setting it cannot be drawn without, on the way in or taken away after', async () => {
    const { root, connect } = harness();

    expect(() => root.appendChild(createElement('bry-button'))).toThrow('bry-button needs a label.');
    expect(() => root.appendChild(stack(null, createElement('bry-text')))).toThrow('bry-text needs a text.');

    const save = button({ label: 'Save' });

    root.appendChild(save);
    await connect();
    expect(() => save.removeAttribute('label')).toThrow('bry-button needs a label.');
  });

  test('a handler for an event the element does not raise', () => {
    expect(() => stack({ onPress: () => {} } as never)).toThrow('raises no events');
    expect(() => button({ label: 'x' }).addEventListener('change', () => {})).toThrow('not "change"');
  });

  test('a child the parent does not hold: only stacks and cards hold anything', () => {
    expect(() => stack(null, 'bare words')).not.toThrow();
    expect(() => card(null, 'bare words')).not.toThrow();
    expect(() => text({ text: 'x' }).appendChild(card())).toThrow('bry-text can’t hold other nodes.');
    expect(() => createElement('bry-button', { label: 'Save' }, 'Save')).toThrow('bry-button can’t hold other nodes.');
  });

  test('text over a paragraph', () => {
    expect(() => createText('x'.repeat(4_001))).toThrow('Text must be at most 4000 characters.');
  });

  test('a node inside itself', () => {
    const outer = stack();
    const inner = stack();

    outer.appendChild(inner);

    expect(() => inner.appendChild(outer)).toThrow('inside itself');
  });
});

describe('events (tree/event)', () => {
  test('reach the handler set through the plain API', async () => {
    const { root, connect, hostSays } = harness();
    const seen: unknown[] = [];
    const save = button({ label: 'Save', onPress: event => seen.push(event.type, event.detail, event.target) });

    root.appendChild(save);
    await connect();

    hostSays('tree/event', { node: save.id, name: 'press' });

    expect(seen).toEqual(['press', undefined, save]);
  });

  test('reach the plain factories of the elements added after Phase 0, with what they carry', async () => {
    const { root, connect, hostSays, sent } = harness();
    const seen: unknown[] = [];
    const status = select({ options: [{ value: 'todo', label: 'To do' }], onChange: event => seen.push(event.detail.value) });
    const empty = emptyState({ title: 'No issues yet', action: 'New issue', onAction: event => seen.push(event.type) });

    root.append(listRow({ title: 'Fix the door' }, badge({ text: 'bug', tone: 'danger' }), status), empty);
    await connect();

    hostSays('tree/event', { node: status.id, name: 'change', detail: { value: 'todo' } });
    hostSays('tree/event', { node: empty.id, name: 'action' });

    expect(seen).toEqual(['todo', 'action']);
    expect(JSON.stringify(sent)).toContain('"type":"bry-list-row"');
    expect(() => badge({ text: 'x', onPress: () => {} } as never)).toThrow('bry-badge raises no events, so it takes no onPress.');
  });

  test('reach the plain factories of Wren’s eight, with what each one carries', async () => {
    const { root, connect, hostSays, sent } = harness();
    const seen: unknown[] = [];
    const issues = table({
      columns: [{ key: 'title', heading: 'Title', sortable: true }],
      rows: [{ id: 'a', cells: ['Fix the door'] }],
      onSort: event => seen.push(event.detail.direction),
      onSelect: event => seen.push(event.detail.row),
    });
    const long = virtualList({ count: 10_000, onRange: event => seen.push(event.detail.end - event.detail.start) }, text({ text: 'Row 0' }));
    const asking = dialog(
      { open: true, title: 'Delete?', actions: [{ id: 'delete', label: 'Delete', tone: 'danger' }], onAction: event => seen.push(event.detail.id), onClose: event => seen.push(event.detail) },
      checkbox({ label: 'Also its comments', onChange: event => seen.push(event.detail.checked) }),
    );
    const notify = switchElement({ label: 'Notify me', onChange: event => seen.push(event.detail.checked) });

    root.append(issues, long, asking, notify);
    await connect();

    hostSays('tree/event', { node: issues.id, name: 'sort', detail: { key: 'title', direction: 'desc' } });
    hostSays('tree/event', { node: issues.id, name: 'select', detail: { row: 'a' } });
    hostSays('tree/event', { node: long.id, name: 'range', detail: { start: 10, end: 40 } });
    hostSays('tree/event', { node: asking.id, name: 'action', detail: { id: 'delete' } });
    hostSays('tree/event', { node: asking.id, name: 'close' });
    hostSays('tree/event', { node: notify.id, name: 'change', detail: { checked: true } });

    expect(seen).toEqual(['desc', 'a', 30, 'delete', undefined, true]);
    expect(JSON.stringify(sent)).toContain('"type":"bry-virtual-list"');
    expect(() => table({ columns: [{ key: 'title', heading: 'Title', align: 'middle' }] } as never)).toThrow(
      'bry-table columns[0].align must be one of start, end.',
    );
    expect(() => switchElement({ label: 'x' }).append(text({ text: 'on' }))).toThrow('bry-switch can’t hold other nodes.');
  });

  test('reach a board, its columns and a diff, and a move is confirmed by moving the card and refused by settling it', async () => {
    const { root, connect, hostSays, take } = harness();
    const seen: unknown[] = [];
    const crash = card({ title: 'Crash on save' });
    const todo = boardColumn({ title: 'To do', onRange: event => seen.push([event.detail.start, event.detail.end]) }, crash);
    const doing = boardColumn({ title: 'Doing', limit: 2 }, card({ title: 'Broken link' }));
    const issues = board({ label: 'Issues', cardSize: 'md', onMove: event => seen.push(event.detail) }, todo, doing);
    const changes = diff({
      files: [{ path: 'src/a.ts', status: 'modified', patch: '@@ -1 +1 @@\n-a\n+b' }, { path: 'src/big.ts' }],
      onExpand: event => seen.push(event.detail.file),
      onSelect: event => seen.push(event.detail),
    });

    root.append(issues, changes, markdown({ text: '**Done** at last' }));
    await connect();
    take();

    hostSays('tree/event', { node: issues.id, name: 'move', detail: { card: crash.id, from: todo.id, to: doing.id, position: 1 } });
    hostSays('tree/event', { node: todo.id, name: 'range', detail: { start: 0, end: 30 } });
    hostSays('tree/event', { node: changes.id, name: 'expand', detail: { file: 'src/big.ts' } });
    hostSays('tree/event', { node: changes.id, name: 'select', detail: { file: 'src/a.ts', side: 'new', start: 1, end: 1 } });

    expect(seen).toEqual([
      { card: crash.id, from: todo.id, to: doing.id, position: 1 },
      [0, 30],
      'src/big.ts',
      { file: 'src/a.ts', side: 'new', start: 1, end: 1 },
    ]);

    // Confirm one move, then refuse the next twice over: the same card, sent both times.
    doing.appendChild(crash);
    await settle();
    issues.setAttribute('settled', crash.id);
    await settle();
    issues.setAttribute('settled', crash.id);
    await settle();

    expect(take().flatMap(one => opsOf(one))).toEqual([
      { op: 'move', id: crash.id, parent: doing.id, index: 1 },
      { op: 'props', id: issues.id, props: { settled: crash.id } },
      { op: 'props', id: issues.id, props: { settled: crash.id } },
    ]);
    expect(() => boardColumn({ title: 'x', limit: 0 })).toThrow('bry-board-column limit must be a whole number from 1 to 100000.');
    expect(() => diff({ files: [{ path: 'a', status: 'moved' }] } as never)).toThrow('bry-diff files[0].status must be one of added, modified, removed, renamed.');
    // Only a board's answer is sent again unchanged; a setting that is state is not.
    doing.setAttribute('title', 'Doing');
    await settle();
    expect(take()).toEqual([]);
  });

  test('reach a listener registered the way Preact registers one', async () => {
    const { root, connect, hostSays } = harness();
    const seen: string[] = [];
    const save = button({ label: 'Save' });

    save.addEventListener('Press', function (event) {
      seen.push(`${event.type}:${this === save}`);
    });
    root.appendChild(save);
    await connect();

    hostSays('tree/event', { node: save.id, name: 'press' });

    expect(seen).toEqual(['Press:true']);
  });

  test('about a node that has gone are dropped', async () => {
    const { root, connect, hostSays } = harness();
    let pressed = 0;
    const gone = button({ label: 'Gone', onPress: () => pressed++ });

    root.appendChild(gone);
    await connect();
    root.removeChild(gone);

    hostSays('tree/event', { node: gone.id, name: 'press' });
    hostSays('tree/event', { node: 'n-nobody', name: 'press' });

    expect(pressed).toBe(0);
  });

  test('a handler that throws does not stop the next event', async () => {
    const { root, connect, hostSays } = harness();
    const original = console.error;
    let pressed = 0;
    const flaky = button({
      label: 'Flaky',
      onPress: () => {
        pressed++;
        throw new Error('oops');
      },
    });

    console.error = () => {};
    root.appendChild(flaky);
    await connect();
    hostSays('tree/event', { node: flaky.id, name: 'press' });
    hostSays('tree/event', { node: flaky.id, name: 'press' });
    console.error = original;

    expect(pressed).toBe(2);
  });
});
