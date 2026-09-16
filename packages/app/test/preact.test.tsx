import { describe, expect, test } from 'bun:test';

import { ROOT_ID, type TreeMountParams, type TreePatchParams } from '../src/index.ts';
import { Button, render, useList, useState } from '../src/preact/index.ts';
import { harness, settle } from './harness.ts';

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

  test('refuses what the host would refuse, where it was written', () => {
    const { root } = harness();

    // @ts-expect-error there is no div
    expect(() => render(<div />, root)).toThrow('Brydio has no element called "div".');
    // @ts-expect-error a text takes its words as a setting
    expect(() => render(<bry-text text="a">b</bry-text>, harness().root)).toThrow('bry-text can’t hold other nodes.');
    // @ts-expect-error there is no style
    expect(() => render(<bry-stack style="color: red" />, harness().root)).toThrow('there is no style setting');
  });

  test('useList reads through the list tool and reads again on refetch', async () => {
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

    const call = sent.find(one => one.method === 'tools/call')!;

    expect(call.params).toEqual({ id: '1', tool: 'list_issues', input: { limit: 200 } });
    hostSays('tools/result', { id: '1', result: { structuredContent: { items: [{ id: 'a', version: 1, title: 'First' }], nextCursor: null } } });
    await settle();
    await settle();

    const texts = () =>
      root
        .snapshot()
        .filter(node => node.type === 'bry-text')
        .map(node => node.props?.text);

    expect(texts()).toEqual(['First']);

    void refetch();
    expect(sent.filter(one => one.method === 'tools/call')).toHaveLength(2);
  });
});
