import { build } from '@brydio/cli';
import { beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
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
