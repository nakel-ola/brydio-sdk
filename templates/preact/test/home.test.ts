import { build } from '@brydio/cli';
import { FakeHost } from '@brydio/fake-host';
import { afterEach, beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(root, '.brydio/app.json'), 'utf8'));
let host: FakeHost | null = null;

beforeAll(async () => {
  const built = await build(root);

  expect(built.problems).toEqual([]);
});

afterEach(() => host?.stop());

test('draws the checklist and ticks an item off', async () => {
  host = FakeHost.start({
    entry: join(root, 'dist/screens/home.js'),
    manifest,
    fixtures: { items: [{ id: 'item_a', title: 'Water the plants', done: false }] },
  });

  await host.mounted();
  await host.waitFor(() => host!.byText('Water the plants'), { what: 'the item' });

  host.press(host.byText('Done')!);
  await host.waitFor(() => host!.byText('Undo'), { what: 'the item to be ticked' });

  expect(host.calls.map(call => call.tool)).toEqual(['list_items', 'update_item', 'list_items']);
  expect(host.store!.records('items')[0]).toMatchObject({ done: true, version: 2 });
  expect(host.refusals).toEqual([]);
});
