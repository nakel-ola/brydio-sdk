import { createRoot, Bridge, button, card, createText, stack, text, type Port, type RpcMessage, type RemoteElement, type RemoteNode } from '@brydio/app';
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';
import { TreeStore } from '../src/index.ts';

const HOST_STORE = 'packages/app/src/apps/tree/tree-store.ts';

interface Store {
  mount(root: unknown, nodes: unknown): { refused: unknown[] };
  patch(ops: unknown): { refused: unknown[] };
  root: string | null;
  get(id: string): never;
}

/** What the runtime sends, one message after another. */
type Log = { method: string; params: { root?: string; nodes?: unknown; ops?: unknown } }[];

/**
 * A log with its node ids renumbered in the order they first appear. The
 * runtime's ids come from one counter for the whole process, so the same
 * run gives other ids after other tests have made nodes. Renumbered, it
 * gives the same log wherever it runs, which is what can be recorded.
 */
function numbered(log: Log): Log {
  const ids = new Map<string, string>();

  return JSON.parse(JSON.stringify(log).replace(/"n(\d+)"/g, (_, id: string) => {
    if (!ids.has(id)) ids.set(id, `n${ids.size + 1}`);

    return `"${ids.get(id)}"`;
  })) as Log;
}

/** A store given every message in a log: what it refused, and the tree it ends with. */
function replay(store: Store, log: Log) {
  const refused: unknown[] = [];

  for (const { method, params } of log) {
    if (method === 'tree/mount') refused.push(...store.mount(params.root, params.nodes).refused);
    if (method === 'tree/patch') refused.push(...store.patch(params.ops).refused);
  }

  return { refused, shape: shape(store) };
}

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
  test('is Brydio’s tree-store.ts, line for line apart from the catalogue import and the clock', async () => {
    const body = (source: string) => source.slice(source.indexOf('export class TreeStore'));
    const digest = (text: string) => createHash('sha256').update(text).digest('hex');
    const ours = readFileSync(join(import.meta.dir, '..', 'src', 'tree-store.ts'), 'utf8');
    const theirs = await brydioAnswers('tree-store-source', [HOST_STORE], () => digest(body(readFileSync(inBrydio(HOST_STORE), 'utf8'))));

    expect(digest(body(ours).replace(/ = now\b/, ' = nextFrame').replace('(ELEMENTS[node.type] as { children: boolean }).children', 'ELEMENTS[node.type].children'))).toBe(theirs);
  });

  test('applies what the runtime sends and ends with the runtime’s tree, over a thousand random changes', async () => {
    const { log, runtime } = await randomChanges(1_000);
    const fake = replay(new TreeStore() as never, log);

    expect(fake.refused).toEqual([]);
    expect(fake.shape).toEqual(runtime);
  });

  test('refuses and ends exactly as Brydio’s receiver does, for the same messages', async () => {
    const brydios = await brydioAnswers('tree-store-replay', [HOST_STORE], async () => {
      const { TreeStore: HostTreeStore } = await import(inBrydio(HOST_STORE));
      const log = numbered((await randomChanges(300)).log);

      return { log, ...replay(new HostTreeStore(() => {}), log) };
    });
    const fake = replay(new TreeStore() as never, brydios.log);

    expect(JSON.parse(JSON.stringify(fake))).toEqual({ refused: brydios.refused, shape: brydios.shape });
  });
});

/** A seeded run of random changes through the runtime: every tree message it sent, and its own tree at the end. */
async function randomChanges(rounds: number): Promise<{ log: Log; runtime: unknown }> {
    const log: Log = [];
    const port: Port = {
      post(message: RpcMessage) {
        if (message.method === 'tree/mount' || message.method === 'tree/patch') {
          log.push(JSON.parse(JSON.stringify({ method: message.method, params: message.params })));
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

    for (let round = 0; round < rounds; round++) {
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

    return { log, runtime: runtimeShape(root) };
}
