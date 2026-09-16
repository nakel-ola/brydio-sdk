import { testApp } from '@brydio/fake-host';
import { afterEach, expect, test } from 'bun:test';

/**
 * The checklist, run the way Brydio runs it, with no Brydio and no browser.
 * `brydio test` builds the app and runs this; `testApp` finds the build.
 */

const app = await testApp(import.meta.dir);

afterEach(() => app.stopAll());

test('names itself after the instance it is shown as', async () => {
  const host = app.start('home', { context: { instance: { id: 'ins_1', name: 'Launch prep', scope: 'project' } } });

  await host.mounted();

  expect(host.byText('Launch prep')).toBeDefined();
});

test('draws the checklist and ticks an item off', async () => {
  const host = app.start('home', { fixtures: { items: [{ id: 'item_a', title: 'Water the plants', done: false }] } });

  await host.mounted();
  await host.waitFor(() => host.byText('Water the plants'), { what: 'the item' });

  host.press(host.byText('Done')!);
  await host.waitFor(() => host.byText('Undo'), { what: 'the item to be ticked' });

  expect(host.store!.records('items')[0]).toMatchObject({ done: true, version: 2 });
  expect(host.refusals).toEqual([]);
});

test('saving the form adds a row once the person allows it, from the watch rather than by hand', async () => {
  const host = app.start('home', { asks: 'hold' });

  await host.mounted();
  await host.waitFor(() => host.findAll(node => node.type === 'bry-input')[0], { what: 'the field' });
  await host.waitFor(() => host.watching.includes('items'), { what: 'the watch on items' });

  const field = host.findAll(node => node.type === 'bry-input')[0]!;

  host.event(field.id, 'change', { value: 'Book the venue' });
  host.press(host.byText('Save')!);
  await host.waitFor(() => host.calls.some(call => call.tool === 'create_item'), { what: 'the create call' });

  // Not shown until it is saved.
  expect(host.byText('Book the venue')).toBeUndefined();

  await host.answer('allow');
  await host.waitFor(() => host.byText('Book the venue'), { what: 'the new row' });

  expect(host.toasts).toEqual([{ text: 'Added.', tone: 'success' }]);
  expect(host.store!.records('items').map(record => record.title)).toEqual(['Book the venue']);
});
