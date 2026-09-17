import { describe, expect, test } from 'bun:test';

import { ROOT_ID, type ElementAttributes, type RemoteElement, type TreeMountParams, type TreePatchParams } from '../src/index.ts';
import { Button, render, useBoard, useHost, useList, useState } from '../src/preact/index.ts';
import { CONTEXT, harness, settle } from './harness.ts';

describe('the Preact adapter', () => {
  test('renders the five elements into the tree the host receives', async () => {
    const { root, connect, sent } = harness();

    render(
      <bry-stack gap="3" direction="column">
        <bry-heading level={1} text="Issues" />
        <bry-card title="Fix the login page" padding="3" pressable>
          <bry-text text="Nobody can sign in with a passkey." tone="muted" size="sm" />
          <bry-button label="Move to Doing" variant="secondary" size="sm" />
        </bry-card>
      </bry-stack>,
      root,
    );
    await connect();

    const mount = sent.find(one => one.method === 'tree/mount')!.params as TreeMountParams;
    const types = mount.nodes.map(node => [node.type, node.props ?? {}]);

    expect(mount.root).toBe(ROOT_ID);
    expect(types).toEqual([
      ['bry-stack', {}],
      ['bry-stack', { gap: '3', direction: 'column' }],
      ['bry-heading', { level: 1, text: 'Issues' }],
      ['bry-card', { title: 'Fix the login page', padding: '3', pressable: true }],
      ['bry-text', { text: 'Nobody can sign in with a passkey.', tone: 'muted', size: 'sm' }],
      ['bry-button', { label: 'Move to Doing', variant: 'secondary', size: 'sm' }],
    ]);
  });

  test('hands a press to onPress, and sends the re-render as one patch', async () => {
    const { root, connect, sent, hostSays, take } = harness();

    function Counter() {
      const [count, setCount] = useState(0);

      return (
        <bry-stack>
          <bry-text text={`Pressed ${count} times`} />
          <Button label="Press" onPress={() => setCount(count + 1)} />
        </bry-stack>
      );
    }

    render(<Counter />, root);
    await connect();

    const mount = sent.find(one => one.method === 'tree/mount')!.params as TreeMountParams;
    const press = mount.nodes.find(node => node.type === 'bry-button')!;
    const words = mount.nodes.find(node => node.type === 'bry-text')!;

    take();
    hostSays('tree/event', { node: press.id, name: 'press' });
    await settle();

    const patches = take().filter(one => one.method === 'tree/patch');

    expect(patches).toHaveLength(1);
    expect((patches[0]!.params as TreePatchParams).ops).toEqual([{ op: 'props', id: words.id, props: { text: 'Pressed 1 times' } }]);
  });

  test('hands a field’s change and submit to onChange and onSubmit, with what was typed', async () => {
    const { root, connect, sent, hostSays, take } = harness();
    const submitted: string[] = [];

    function Form() {
      const [title, setTitle] = useState('');

      return (
        <bry-label text="Title">
          <bry-input value={title} onChange={event => setTitle(event.detail.value)} onSubmit={event => submitted.push(event.detail.value)} />
          <bry-badge text={title || 'empty'} tone="neutral" />
        </bry-label>
      );
    }

    render(<Form />, root);
    await connect();

    const mount = sent.find(one => one.method === 'tree/mount')!.params as TreeMountParams;
    const field = mount.nodes.find(node => node.type === 'bry-input')!;
    const badge = mount.nodes.find(node => node.type === 'bry-badge')!;

    take();
    hostSays('tree/event', { node: field.id, name: 'change', detail: { value: 'Fix the door' } });
    await settle();

    expect(take().filter(one => one.method === 'tree/patch').flatMap(one => (one.params as TreePatchParams).ops)).toEqual([
      { op: 'props', id: field.id, props: { value: 'Fix the door' } },
      { op: 'props', id: badge.id, props: { text: 'Fix the door' } },
    ]);

    hostSays('tree/event', { node: field.id, name: 'submit', detail: { value: 'Fix the door' } });
    await settle();

    expect(submitted).toEqual(['Fix the door']);
  });

  test('hands a table’s sort, a menu’s choice and a checkbox’s tick to their handlers, typed per element', async () => {
    const { root, connect, sent, hostSays } = harness();
    const seen: unknown[] = [];
    // Kept outside the render: a list written inline is a new value each time, and is sent again.
    const columns = [{ key: 'title', heading: 'Title', sortable: true }];
    const rows = [{ id: 'a', cells: ['Fix the door'] }];
    const items: ElementAttributes<'bry-menu'>['items'] = [{ id: 'bin', label: 'Delete', icon: 'trash', tone: 'danger' }];

    function Board() {
      const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

      return (
        <bry-split ratio={40}>
          <bry-table
            columns={columns}
            rows={rows}
            sort={{ key: 'title', direction }}
            onSort={event => setDirection(event.detail.direction)}
          />
          <bry-menu items={items} onSelect={event => seen.push(event.detail.id)}>
            <bry-button label="More" />
          </bry-menu>
          <bry-checkbox label="Done" onChange={event => seen.push(event.detail.checked)} />
          <bry-date value="2026-09-16" onChange={event => seen.push(event.detail.value)} />
        </bry-split>
      );
    }

    render(<Board />, root);
    await connect();

    const mount = sent.find(one => one.method === 'tree/mount')!.params as TreeMountParams;
    const of = (type: string) => mount.nodes.find(node => node.type === type)!;

    hostSays('tree/event', { node: of('bry-table').id, name: 'sort', detail: { key: 'title', direction: 'desc' } });
    hostSays('tree/event', { node: of('bry-menu').id, name: 'select', detail: { id: 'bin' } });
    hostSays('tree/event', { node: of('bry-checkbox').id, name: 'change', detail: { checked: true } });
    hostSays('tree/event', { node: of('bry-date').id, name: 'change', detail: { value: '2026-10-01' } });
    await settle();

    expect(seen).toEqual(['bin', true, '2026-10-01']);
    expect(sent.filter(one => one.method === 'tree/patch').flatMap(one => (one.params as TreePatchParams).ops)).toEqual([
      { op: 'props', id: of('bry-table').id, props: { sort: { key: 'title', direction: 'desc' } } },
    ]);
  });

  test('confirms a board’s move by rendering the card in its new column, and refuses one by settling it, every time', async () => {
    const { root, connect, sent, hostSays, take } = harness();
    type Status = 'todo' | 'doing';
    const moves: unknown[] = [];
    let refuse = false;

    function Issues() {
      const [issues, setIssues] = useState([
        { id: 'a', title: 'Crash on save', status: 'todo' as Status },
        { id: 'b', title: 'Add dark mode', status: 'todo' as Status },
        { id: 'c', title: 'Broken link', status: 'doing' as Status },
      ]);
      const keys = useBoard<string, Status>();

      return (
        <bry-board
          label="Issues"
          onMove={event => {
            const move = keys.read(event);

            moves.push(move);
            if (!move) return;
            if (refuse) return keys.refuse(event);

            const moved = issues.find(one => one.id === move.card)!;
            const rest = issues.filter(one => one !== moved);
            const inTo = rest.filter(one => one.status === move.to);
            const before = inTo[move.position];

            rest.splice(before ? rest.indexOf(before) : rest.length, 0, { ...moved, status: move.to });
            setIssues(rest);
          }}
        >
          {(['todo', 'doing'] as const).map(status => (
            <bry-board-column key={status} ref={keys.column(status)} title={status === 'todo' ? 'To do' : 'Doing'}>
              {issues
                .filter(one => one.status === status)
                .map(issue => (
                  <bry-card key={issue.id} ref={keys.card(issue.id)} title={issue.title} />
                ))}
            </bry-board-column>
          ))}
        </bry-board>
      );
    }

    render(<Issues />, root);
    await connect();

    const mount = sent.find(one => one.method === 'tree/mount')!.params as TreeMountParams;
    const node = (type: string, words: string) => mount.nodes.find(one => one.type === type && Object.values(one.props ?? {}).includes(words))!;
    const [board, todo, doing, a] = [mount.nodes.find(one => one.type === 'bry-board')!, node('bry-board-column', 'To do'), node('bry-board-column', 'Doing'), node('bry-card', 'Crash on save')];

    take();
    hostSays('tree/event', { node: board.id, name: 'move', detail: { card: a.id, from: todo.id, to: doing.id, position: 1 } });
    await settle();

    expect(moves).toEqual([{ card: 'a', from: 'todo', to: 'doing', position: 1 }]);

    // Preact draws a keyed card that changed parent afresh: the old node goes, and a new one arrives where the move put it.
    const ops = take().filter(one => one.method === 'tree/patch').flatMap(one => (one.params as TreePatchParams).ops);
    const inserted = ops.find(op => op.op === 'insert')!;

    expect(ops).toEqual([
      { op: 'remove', id: a.id },
      { op: 'insert', parent: doing.id, index: 1, node: { id: inserted.op === 'insert' ? inserted.node.id : '', type: 'bry-card', props: { title: 'Crash on save' } } },
    ]);
    expect((root.nodeById(doing.id) as RemoteElement).childNodes.map(one => (one as RemoteElement).getAttribute('title'))).toEqual(['Broken link', 'Crash on save']);

    // The new node answers to the same key, so the next move reads right.
    const moved = inserted.op === 'insert' ? inserted.node.id : '';

    refuse = true;
    hostSays('tree/event', { node: board.id, name: 'move', detail: { card: moved, from: doing.id, to: todo.id, position: 0 } });
    await settle();
    hostSays('tree/event', { node: board.id, name: 'move', detail: { card: moved, from: doing.id, to: todo.id, position: 0 } });
    await settle();

    expect(moves.slice(1)).toEqual([
      { card: 'a', from: 'doing', to: 'todo', position: 0 },
      { card: 'a', from: 'doing', to: 'todo', position: 0 },
    ]);
    expect(take().filter(one => one.method === 'tree/patch').flatMap(one => (one.params as TreePatchParams).ops)).toEqual([
      { op: 'props', id: board.id, props: { settled: moved } },
      { op: 'props', id: board.id, props: { settled: moved } },
    ]);

    // A move naming a card that has gone reads as nothing.
    hostSays('tree/event', { node: board.id, name: 'move', detail: { card: a.id, from: todo.id, to: doing.id, position: 0 } });
    await settle();

    expect(moves.at(-1)).toBeNull();
  });

  test('reads a watched list again when the collection changes, and stops watching when it leaves', async () => {
    const { root, connect, sent, hostSays, take } = harness();
    let pages = 0;

    function Count({ live }: { live: boolean }) {
      const { items } = useList('issues', {}, { watch: live });

      return <bry-text text={`${items.length} issues`} />;
    }

    render(<Count live />, root);
    await connect();

    const answer = (count: number) => {
      const call = [...sent].reverse().find(one => one.method === 'data/list')!;

      pages += 1;
      hostSays('data/result', { id: call.id, result: { items: Array.from({ length: count }, (_, at) => ({ id: `i${at}`, version: 1 })), nextCursor: null } });
    };

    answer(1);
    await settle();
    expect(take().filter(one => one.method === 'data/subscribe')).toEqual([
      { jsonrpc: '2.0', id: '2', method: 'data/subscribe', params: { collection: 'issues' } },
    ]);

    hostSays('data/changed', { collection: 'issues', changes: [{ id: 'i1', op: 'create', version: 1 }] });
    await settle();
    answer(2);
    await settle();

    expect(pages).toBe(2);
    // The first read was call 1, the watch 2, and the read the change set off 3.
    expect(sent.filter(one => one.method === 'data/list').map(one => one.id)).toEqual(['3']);
    expect(root.firstChild).toMatchObject({ props: { text: '2 issues' } });

    render(null, root);
    await settle();

    expect(take().filter(one => one.method === 'data/unsubscribe')).toEqual([
      { jsonrpc: '2.0', id: '4', method: 'data/unsubscribe', params: { collection: 'issues' } },
    ]);
  });

  test('refuses a name that is not an element, and a setting no element takes, where it was written', () => {
    const { root } = harness();

    // @ts-expect-error there is no div
    expect(() => render(<div />, root)).toThrow('div is not one of Brydio’s elements, which are all named bry-something.');
    // @ts-expect-error there is no style
    expect(() => render(<bry-stack style="color: red" />, harness().root)).toThrow('there is no style setting');
    // What the catalogue would refuse goes to the host, which refuses it in its own words: a
    // screen carries no catalogue (A5-F03-S01), and the editor catches this as it is written.
    // @ts-expect-error a text takes its words as a setting
    expect(() => render(<bry-text text="a">b</bry-text>, harness().root)).not.toThrow();
  });

  test('useList reads through data/list and reads again on refetch', async () => {
    const { root, connect, sent, hostSays } = harness();
    let refetch: () => Promise<void> = async () => {};

    function Issues() {
      const list = useList<{ id: string; version: number; title: string }>('issues', { limit: 200 });

      refetch = list.refetch;

      return (
        <bry-stack>
          {list.loading ? <bry-text text="Loading" /> : list.items.map(item => <bry-text key={item.id} text={item.title} />)}
        </bry-stack>
      );
    }

    render(<Issues />, root);
    await connect();

    const call = sent.find(one => one.method === 'data/list')!;

    expect(call).toEqual({ jsonrpc: '2.0', id: '1', method: 'data/list', params: { collection: 'issues', limit: 200 } });
    hostSays('data/result', { id: '1', result: { items: [{ id: 'a', version: 1, title: 'First' }], nextCursor: null } });
    await settle();
    await settle();

    const texts = () =>
      root
        .snapshot()
        .filter(node => node.type === 'bry-text')
        .map(node => node.props?.text);

    expect(texts()).toEqual(['First']);

    void refetch();
    expect(sent.filter(one => one.method === 'data/list')).toHaveLength(2);
  });

  test('useHost re-renders on a context the host sends straight after the first tree, before a frame has passed', async () => {
    const { root, connect, hostSays } = harness();

    function Selected() {
      const selection = useHost().selection as { id?: string } | undefined;

      return <bry-text text={selection?.id ?? 'nothing'} />;
    }

    await connect();
    render(<Selected />, root);
    await settle();
    expect(root.snapshot().find(node => node.type === 'bry-text')!.props?.text).toBe('nothing');
    hostSays('host/context', { ...CONTEXT, selection: { kind: 'item', id: 'issue_1' } });
    await settle();
    await settle();

    expect(root.snapshot().find(node => node.type === 'bry-text')!.props?.text).toBe('issue_1');
  });
});
