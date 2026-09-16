import { createRoot, Bridge, button, card, createText, stack, text, type Port, type RpcMessage, type RemoteElement, type RemoteNode } from '@brydio/app';
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TreeStore } from '../src/index.ts';

const brydio = process.env.BRYDIO_DIR ?? join(import.meta.dir, '..', '..', '..', '..', 'brydio');
const hostStore = join(brydio, 'packages/app/src/apps/tree/tree-store.ts');
const hasHost = existsSync(hostStore);

/** A tiny seeded random, so a failing run can be run again. */
function random(seed: number) {
  return () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;

    return seed / 2 ** 31;
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** The tree as the store holds it, from the root down, for comparing. */
function shape(store: { root: string | null; get(id: string): { type: string; props: object; text: string; children: readonly string[] } | undefined }) {
  const walk = (id: string): unknown => {
    const node = store.get(id)!;

    return { id, type: node.type, props: node.props, text: node.text, children: node.children.map(walk) };
  };

  return store.root ? walk(store.root) : null;
}

/** The runtime's own view of the same tree. */
function runtimeShape(node: RemoteNode): unknown {
  const wire = node.toNode(true);

  return {
    id: wire.id,
    type: wire.type,
    props: wire.props ?? {},
    text: wire.text ?? '',
    children: ((node as RemoteElement).childNodes ?? []).map(runtimeShape),
  };
}

describe('the fake host’s receiver', () => {
  test.skipIf(!hasHost)('is Brydio’s tree-store.ts, line for line apart from the catalogue import and the clock', () => {
    const theirs = readFileSync(hostStore, 'utf8');
    const ours = readFileSync(join(import.meta.dir, '..', 'src', 'tree-store.ts'), 'utf8');
    const body = (source: string) => source.slice(source.indexOf('export class TreeStore'));

    expect(body(ours).replace(/ = now\b/, ' = nextFrame').replace('(ELEMENTS[node.type] as { children: boolean }).children', 'ELEMENTS[node.type].children')).toBe(
      body(theirs),
    );
  });

  test('applies what the runtime sends and ends with the runtime’s tree, over a thousand random changes', async () => {
    const hosts: { name: string; store: { mount(root: unknown, nodes: unknown): { refused: unknown[] }; patch(ops: unknown): { refused: unknown[] }; root: string | null; get(id: string): never } }[] = [
      { name: 'fake', store: new TreeStore() as never },
    ];

    if (hasHost) {
      const { TreeStore: HostTreeStore } = await import(hostStore);

      hosts.push({ name: 'brydio', store: new HostTreeStore(() => {}) });
    }

    const refused: unknown[] = [];
    const port: Port = {
      post(message: RpcMessage) {
        const params = message.params as { root: string; nodes: unknown; ops: unknown };

        for (const { store } of hosts) {
          if (message.method === 'tree/mount') refused.push(...store.mount(params.root, params.nodes).refused);
          if (message.method === 'tree/patch') refused.push(...store.patch(params.ops).refused);
        }
      },
      listen: () => () => {},
    };
    const bridge = new Bridge(port, { app: { name: 'fuzz', version: '1.0.0' } });
    const root = createRoot({ bridge, start: 'manual' });
    const next = random(20260916);
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
    const holders = (): RemoteElement[] => {
      const found: RemoteElement[] = [];
      const walk = (node: RemoteNode) => {
        if (node.nodeName === 'bry-stack' || node.nodeName === 'bry-card') found.push(node as RemoteElement);
        for (const child of (node as RemoteElement).childNodes ?? []) walk(child);
      };

      walk(root);

      return found;
    };
    const everyone = (): RemoteNode[] => {
      const found: RemoteNode[] = [];
      const walk = (node: RemoteNode) => {
        found.push(node);
        for (const child of (node as RemoteElement).childNodes ?? []) walk(child);
      };

      walk(root);

      return found.slice(1);
    };
    const fresh = () =>
      pick([
        () => stack({ gap: pick(['1', '2', '3']) }),
        () => card({ title: `Card ${Math.floor(next() * 100)}` }, text({ text: 'inside' })),
        () => text({ text: `Text ${Math.floor(next() * 100)}` }),
        () => button({ label: 'Press' }),
        () => createText(`words ${Math.floor(next() * 100)}`),
      ])();

    root.start();

    for (let round = 0; round < 1_000; round++) {
      const nodes = everyone();
      const action = next();

      if (action < 0.35 || nodes.length === 0) {
        const parent = pick(holders());
        const children = parent.childNodes;

        parent.insertBefore(fresh(), children.length ? pick([...children, null]) : null);
      } else if (action < 0.5) {
        pick(nodes).remove();
      } else if (action < 0.65) {
        const node = pick(nodes);
        const parent = pick(holders());

        try {
          parent.insertBefore(node, parent.childNodes.length ? pick([...parent.childNodes, null]) : null);
        } catch {
          // A node into itself: refused by the runtime, as the host would.
        }
      } else if (action < 0.9) {
        const node = pick(nodes);

        if (node.nodeName === 'bry-stack') (node as RemoteElement).setAttribute('gap', next() < 0.3 ? null : pick(['4', '5']));
        else if (node.nodeName === 'bry-card') (node as RemoteElement).setAttribute('title', next() < 0.3 ? null : `Renamed ${round}`);
        else if (node.nodeName === 'bry-text') (node as RemoteElement).setAttribute('tone', pick(['muted', 'danger']));
        else if (node.nodeName === 'bry-button') (node as RemoteElement).setAttribute('disabled', next() < 0.5);
        else if (node.nodeName === '#text') (node as unknown as { data: string }).data = `changed ${round}`;
      }

      if (next() < 0.3) await settle();
    }

    await settle();

    expect(refused).toEqual([]);

    for (const { store } of hosts) expect(shape(store)).toEqual(runtimeShape(root));
    expect(hosts.length).toBe(hasHost ? 2 : 1);
  });
});
