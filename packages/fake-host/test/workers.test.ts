import { build } from '@brydio/cli';
import { beforeAll, expect, test } from 'bun:test';
import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { FakeHost } from '../src/index.ts';

const app = join(import.meta.dir, 'fixtures', 'plain');
const manifest = JSON.parse(readFileSync(join(app, '.brydio/app.json'), 'utf8'));
const screen = (name: string) => join(app, 'dist', 'screens', `${name}.js`);

beforeAll(async () => {
  expect((await build(app, { minify: false, checkSource: false })).problems).toEqual([]);
});

test('a screen that ends its own worker never stops the next one from starting', async () => {
  // `silent` says ready and waits on nothing, so its worker closes by itself
  // before the host lets it go. Asking Bun to terminate a closed worker left
  // the next worker unable to run, and about half these rounds stopped for
  // `ready` instead of `cap`.
  const stops: (string | null)[] = [];

  for (let round = 0; round < 8; round++) {
    for (const [name, budgets] of [['counter', {}], ['silent', { start: 30 }], ['flood', { ready: 1_500 }]] as const) {
      const host = FakeHost.start({ entry: screen(name), manifest, budgets });

      if (name === 'counter') await host.mounted();
      else await host.waitFor(() => host.stopped, { what: `${name} to stop`, timeout: 3_000 });

      if (name === 'flood') stops.push(host.stopped);

      host.stop();
    }
  }

  expect(stops).toEqual(Array(8).fill('cap'));
}, 60_000);

test('a screen built after this process first looked in dist/ still loads', async () => {
  // Bun remembers a folder's files once it has resolved an import from it, so
  // a screen written there later (a build during a test run, publish's
  // pictures just after its build) was "Cannot find module".
  const first = FakeHost.start({ entry: screen('counter'), manifest });

  await first.mounted();
  first.stop();

  const late = join(app, 'dist', 'screens', `late-${Date.now().toString(36)}.js`);

  copyFileSync(screen('counter'), late);

  try {
    const host = FakeHost.start({ entry: late, manifest });

    await host.mounted();
    expect(host.stopped).toBeNull();
    host.stop();
  } finally {
    rmSync(late, { force: true });
  }
});

test('a screen that is not there still stops for load', async () => {
  const host = FakeHost.start({ entry: join(app, 'dist', 'screens', 'nowhere.js'), manifest });

  await host.waitFor(() => host.stopped, { what: 'the stop' });
  expect(host.stopped).toBe('load');
});
