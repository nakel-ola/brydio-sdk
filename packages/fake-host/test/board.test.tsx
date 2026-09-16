import { Bridge, createRoot, type Port, type RemoteElement, type RpcMessage, type TreeMountParams, type TreePatchParams } from '@brydio/app';
import { render, useBoard, useState } from '@brydio/app/preact';
import { describe, expect, test } from 'bun:test';

import { TreeStore } from '../src/index.ts';

/**
 * A Preact board answering a move, received by the host's own tree store.
 *
 * What Brydio's board takes as an answer is in its kit
 * (`packages/ui/src/components/board.tsx`): a pending move is confirmed when
 * the cards of the column it left or the column it went to change, and
 * refused when the board's `settled` arrives. `answers` below asks exactly
 * those two questions of what the tree store now holds.
 */

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function screen() {
  const store = new TreeStore();
  const refused: unknown[] = [];
  let listener: (message: unknown) => void = () => {};
  const port: Port = {
    post: raw => {
      const message = JSON.parse(JSON.stringify(raw)) as RpcMessage;

      if (message.method === 'tree/mount') {
        const { root, nodes } = message.params as TreeMountParams;

        refused.push(...store.mount(root, nodes).refused);
      }

      if (message.method === 'tree/patch') refused.push(...store.patch((message.params as TreePatchParams).ops).refused);
    },
    listen: next => {
      listener = next;

      return () => {};
    },
  };
  const bridge = new Bridge(port, { app: { name: 'issues', version: '1.0.0' } });
  const root = createRoot({ bridge });

  return {
    store,
    refused,
    root,
    hostSays: (method: string, params?: unknown) => listener({ jsonrpc: '2.0', method, params }),
    async connect() {
      const connected = bridge.connect();

      listener({
        jsonrpc: '2.0',
        method: 'host/context',
        params: { theme: 'light', locale: 'en-GB', placement: { id: 'p', kind: 'project-tab' }, instance: { id: 'i', name: 'Issues', scope: 'workspace' }, size: { width: 960, height: 640 } },
      });
      await connected;
      await settle();
    },
  };
}

type Status = 'todo' | 'doing';

describe('a Preact board, as Brydio receives it', () => {
  test('a move the app makes is taken as confirmed, and one it refuses is settled, each time it is refused', async () => {
    const { store, refused, root, hostSays, connect } = screen();
    let refuse = false;
    let saw: unknown = null;

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
            const move = (saw = keys.read(event));

            if (!move) return;
            if (refuse) return keys.refuse(event);

            const moved = issues.find(one => one.id === move.card)!;
            const rest = issues.filter(one => one !== moved);
            const before = rest.filter(one => one.status === move.to)[move.position];

            rest.splice(before ? rest.indexOf(before) : rest.length, 0, { ...moved, status: move.to });
            setIssues(rest);
          }}
        >
          {(['todo', 'doing'] as const).map(status => (
            <bry-board-column key={status} ref={keys.column(status)} title={status === 'todo' ? 'To do' : 'Doing'}>
              {issues
                .filter(one => one.status === status)
                .map(issue => (
                  <bry-card key={issue.id} ref={keys.card(issue.id)} title={issue.title}>
                    <bry-text text={issue.id} tone="muted" size="sm" />
                  </bry-card>
                ))}
            </bry-board-column>
          ))}
        </bry-board>
      );
    }

    render(<Issues />, root);
    await connect();

    const board = store.get(store.get(store.root!)!.children[0]!)!;
    const [todo, doing] = board.children;
    const titles = (column: string) => store.get(column)!.children.map(id => store.get(id)!.props.title);
    const cardTitled = (title: string) => store.get(todo!)!.children.concat(store.get(doing!)!.children).find(id => store.get(id)!.props.title === title)!;

    expect([titles(todo!), titles(doing!)]).toEqual([['Crash on save', 'Add dark mode'], ['Broken link']]);

    // Brydio draws the card moved and raises `move`; the app writes, and renders it there.
    const before = { from: store.get(todo!)!.children.join(), to: store.get(doing!)!.children.join() };

    hostSays('tree/event', { node: board.id, name: 'move', detail: { card: cardTitled('Crash on save'), from: todo, to: doing, position: 1 } });
    await settle();

    expect(saw).toEqual({ card: 'a', from: 'todo', to: 'doing', position: 1 });
    expect(refused).toEqual([]);
    // Answered: both columns' cards changed, and the card is where the move put it, with what it held.
    expect(store.get(todo!)!.children.join()).not.toBe(before.from);
    expect(store.get(doing!)!.children.join()).not.toBe(before.to);
    expect([titles(todo!), titles(doing!)]).toEqual([['Add dark mode'], ['Broken link', 'Crash on save']]);
    expect(store.get(store.get(cardTitled('Crash on save'))!.children[0]!)!.props.text).toBe('a');
    expect(store.get(board.id)!.props.settled).toBeUndefined();

    // Refused, twice for the same card: each refusal reaches the board as a new node, which is the kit's answer.
    refuse = true;

    for (const _ of [1, 2]) {
      const revision = store.get(board.id);

      hostSays('tree/event', { node: board.id, name: 'move', detail: { card: cardTitled('Crash on save'), from: doing, to: todo, position: 0 } });
      await settle();

      expect(store.get(board.id)).not.toBe(revision);
      expect(store.get(board.id)!.props.settled).toBe(cardTitled('Crash on save'));
    }

    expect(saw).toEqual({ card: 'a', from: 'doing', to: 'todo', position: 0 });
    expect([titles(todo!), titles(doing!)]).toEqual([['Add dark mode'], ['Broken link', 'Crash on save']]);
    expect(refused).toEqual([]);
    expect((root.nodeById(board.id) as RemoteElement).getAttribute('settled')).toBe(cardTitled('Crash on save'));
  });
});
