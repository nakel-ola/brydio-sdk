import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { wordsOf } from '../../fake-host/src/host.ts';
import { TreeStore, type TreeNode } from '../../fake-host/src/tree-store.ts';
import { build } from '../src/index.ts';

/**
 * Hot reload that keeps state (A5-F02-S02, A5-F06-S02): a development build
 * run in a real worker, a press that changes state, a saved change, and
 * `dev/update`. The new build is on screen and the state is still there, or
 * the worker says `dev/restart` and nothing half-swapped is left.
 */

const TEMPLATE_MODULES = resolve(import.meta.dir, '..', '..', '..', 'templates', 'preact', 'node_modules');
const made: string[] = [];
const workers: Worker[] = [];

afterEach(() => {
  for (const worker of workers.splice(0)) worker.terminate();
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

const screen = (heading: string, extra = '') => `import { mount, useState } from '@brydio/app/preact';

function Home() {
  const [count, setCount] = useState(0);
${extra}
  return (
    <bry-stack gap="2">
      <bry-heading level={1} text="${heading}" />
      <bry-button label={\`Pressed \${count}\`} onPress={() => setCount(count + 1)} />
    </bry-stack>
  );
}

void mount(Home);
`;

function app(grants: object = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-hot-'));

  made.push(root);

  const files: Record<string, string> = {
    '.brydio/app.json': JSON.stringify({
      name: 'counter',
      version: '1.0.0',
      displayName: 'Counter',
      placements: [{ kind: 'project-tab', screen: 'home' }],
      screens: { home: { entry: 'screens/home.js' } },
      grants,
    }),
    'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@brydio/app/preact' } }),
    'src/screens/home.tsx': screen('Version one'),
  };

  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  symlinkSync(TEMPLATE_MODULES, join(root, 'node_modules'));

  return root;
}

/** A host with just enough of Brydio's side: context, the tree, events and `dev/*` answers. */
function run(entry: string) {
  const tree = new TreeStore();
  const said: { jsonrpc?: string; method: string; params: any }[] = [];
  const worker = new Worker(URL.createObjectURL(new Blob([`import(${JSON.stringify(entry)});`], { type: 'text/javascript' })), {
    type: 'module',
  });

  workers.push(worker);
  worker.addEventListener('message', ({ data }) => {
    said.push(data);

    if (data.method === 'worker/ready') {
      worker.postMessage({
        jsonrpc: '2.0',
        method: 'host/context',
        params: {
          theme: 'light',
          locale: 'en-GB',
          placement: { id: 'pl_1', kind: 'project-tab', projectId: 'pr_1' },
          instance: { id: 'in_1', name: 'Counter', scope: 'project' },
          size: { width: 960, height: 640 },
        },
      });
    }
    if (data.method === 'tree/mount') tree.mount(data.params.root, data.params.nodes);
    if (data.method === 'tree/patch') tree.patch(data.params.ops);
  });

  const nodes = () => {
    const all: TreeNode[] = [];
    const walk = (id: string | null) => {
      const node = id ? tree.get(id) : undefined;

      if (!node) return;
      all.push(node);
      for (const child of node.children) walk(child);
    };

    walk(tree.root);

    return all;
  };
  const words = () => nodes().map(wordsOf).filter(Boolean);
  const until = async <T>(check: () => T | undefined | false, what: string): Promise<T> => {
    for (let tries = 0; tries < 200; tries += 1) {
      const found = check();

      if (found) return found;
      await Bun.sleep(10);
    }

    throw new Error(`Waited for ${what}. Words on screen: ${words().join(', ')}. Said: ${said.map(one => one.method).join(', ')}`);
  };

  return {
    said,
    words,
    until,
    press: (label: string) => {
      const node = nodes().find(one => wordsOf(one) === label)!;

      worker.postMessage({ jsonrpc: '2.0', method: 'tree/event', params: { node: node.id, name: 'press' } });
    },
    update: (url: string, build: number) => worker.postMessage({ jsonrpc: '2.0', method: 'dev/update', params: { entry: url, build } }),
    answer: (build: number) => until(() => said.find(one => one.method.startsWith('dev/') && one.params.build === build), `an answer to build ${build}`),
  };
}

const chunksOf = (root: string) => readdirSync(join(root, 'dist', 'screens')).filter(name => name.startsWith('chunk-'));

/** Built, running, pressed twice: "Pressed 2" under "Version one". */
async function started() {
  const root = app();
  const first = await build(root, { hot: true, minify: false });

  expect(first.problems).toEqual([]);

  const entry = pathToFileURL(join(root, 'dist', 'screens', 'home.js')).href;
  const host = run(entry);

  await host.until(() => host.words().includes('Pressed 0'), 'the first tree');
  host.press('Pressed 0');
  await host.until(() => host.words().includes('Pressed 1'), 'the first press');
  host.press('Pressed 1');
  await host.until(() => host.words().includes('Pressed 2'), 'the second press');

  const save = async (source: string, build_: number) => {
    writeFileSync(join(root, 'src/screens/home.tsx'), source);

    const again = await build(root, { hot: true, minify: false });

    expect(again.problems).toEqual([]);

    // Brydio sends `…/home.js?build=N`, which a browser imports afresh. Bun
    // reuses a file's module whatever its query, so here each build's entry
    // gets its own name, beside the same chunk.
    const named = join(root, 'dist', 'screens', `home.${build_}.js`);

    writeFileSync(named, readFileSync(join(root, 'dist', 'screens', 'home.js')));
    host.update(pathToFileURL(named).href, build_);

    return host.answer(build_);
  };

  return { root, host, save };
}

describe('a development build takes a saved change in place', () => {
  test('says it can, keeps the count, and draws the new words', async () => {
    const { root, host, save } = await started();
    const chunks = chunksOf(root);

    expect(host.said.find(one => one.method === 'worker/ready')!.params.capabilities).toEqual(['hot']);

    const answer = await save(screen('Version two'), 2);

    expect(answer.method).toBe('dev/updated');
    // The shared chunk kept its name, so the worker kept its one Preact.
    expect(chunksOf(root)).toEqual(chunks);
    await host.until(() => host.words().includes('Version two'), 'the new heading');
    expect(host.words()).toContain('Pressed 2');
    expect(host.words()).not.toContain('Version one');

    // And the swapped screen still works.
    host.press('Pressed 2');
    await host.until(() => host.words().includes('Pressed 3'), 'a press after the update');
  }, 30_000);

  test('restarts, rather than half-swaps, when the new build throws while drawing', async () => {
    const { host, save } = await started();
    const answer = await save(screen('Version two', "  if (count > 0) throw new Error('drawn wrong');"), 2);

    expect(answer).toEqual({ jsonrpc: '2.0', method: 'dev/restart', params: { build: 2, reason: 'The new build threw while drawing: drawn wrong' } });
  }, 30_000);

  test('restarts when the new build throws as it loads', async () => {
    const { host, save } = await started();
    const answer = await save(`${screen('Version two')}\nthrow new Error('broken at the top');\n`, 2);

    expect(answer.method).toBe('dev/restart');
    expect(answer.params.reason).toBe('The new build did not load: broken at the top');
    expect(host.words()).toContain('Version one');
  }, 30_000);

  test('restarts when the shared chunk changed, since that is a second Preact', async () => {
    const { root, host, save } = await started();
    const before = chunksOf(root);
    const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));

    // The grants are baked into the runtime, so the chunk is new.
    writeFileSync(join(root, '.brydio/app.json'), JSON.stringify({ ...manifest, grants: { tools: ['*'] } }));

    const answer = await save(screen('Version two'), 2);

    expect(chunksOf(root)).not.toEqual(before);
    expect(answer.params.reason).toBe('The new build brought its own copy of Preact.');
    expect(host.words()).toContain('Version one');
  }, 30_000);
});

describe('a build that is published', () => {
  test('carries no hot runtime: one file per screen, and no prefresh in it', async () => {
    const root = app();
    const result = await build(root);

    expect(result.ok).toBe(true);
    expect([...result.files.keys()].sort()).toEqual(['app.json', 'screens/home.js']);

    const code = readFileSync(join(root, 'dist', 'screens', 'home.js'), 'utf8');

    for (const mark of ['__PREFRESH__', '$RefreshReg$', '$RefreshSig$', 'dev/updated']) expect(code).not.toContain(mark);
    expect(existsSync(join(root, 'dist', 'screens', 'chunk'))).toBe(false);
  }, 30_000);

  test("doesn't say it can be updated in place", async () => {
    const root = app();

    await build(root, { minify: false });

    const host = run(pathToFileURL(join(root, 'dist', 'screens', 'home.js')).href);

    await host.until(() => host.words().includes('Pressed 0'), 'the first tree');
    expect(host.said.find(one => one.method === 'worker/ready')!.params.capabilities).toBeUndefined();

    host.update('file:///nowhere.js', 2);
    expect((await host.answer(2)).params.reason).toBe('This build cannot be updated in place.');
  }, 30_000);
});
