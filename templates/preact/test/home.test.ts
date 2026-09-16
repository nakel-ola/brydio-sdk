import { testApp } from '@brydio/fake-host';
import { afterEach, expect, test } from 'bun:test';

/**
 * The checklist, run the way Brydio runs it, with no Brydio and no browser.
 * `brydio test` builds the app and runs this; `testApp` finds the build.
 */

const app = await testApp(import.meta.dir);

afterEach(() => app.stopAll());

test('draws the checklist and ticks an item off', async () => {
  const host = app.start('home', { fixtures: { items: [{ id: 'item_a', title: 'Water the plants', done: false }] } });

  await host.mounted();
  await host.waitFor(() => host.byText('Water the plants'), { what: 'the item' });

  host.press(host.byText('Done')!);
  await host.waitFor(() => host.byText('Undo'), { what: 'the item to be ticked' });

  expect(host.calls.map(call => call.tool)).toEqual(['list_items', 'update_item', 'list_items']);
  expect(host.store!.records('items')[0]).toMatchObject({ done: true, version: 2 });
  expect(host.refusals).toEqual([]);
});

test('adds an item, once the person allows it', async () => {
  const host = app.start('home', { asks: 'hold' });

  await host.mounted();
  await host.waitFor(() => host.byText('Add an item'), { what: 'the add button' });

  host.press(host.byText('Add an item')!);
  await host.waitFor(() => host.calls.some(call => call.tool === 'create_item'), { what: 'the create call' });

  expect(host.byText('Something to do')).toBeUndefined();

  await host.answer('allow');
  await host.waitFor(() => host.toasts.length > 0, { what: 'the toast' });

  expect(host.byText('Something to do')).toBeDefined();
  expect(host.toasts).toEqual([{ text: 'Added.', tone: 'success' }]);
});
