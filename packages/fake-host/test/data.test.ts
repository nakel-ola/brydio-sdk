import { build } from '@brydio/cli';
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FakeHost, type FakeHostOptions } from '../src/index.ts';

const app = join(import.meta.dir, 'fixtures', 'plain');
const manifest = JSON.parse(readFileSync(join(app, '.brydio/app.json'), 'utf8'));
const NOTES = Array.from({ length: 120 }, (_, at) => ({ id: `note_${at}`, title: `Note ${at}` }));
let host: FakeHost | null = null;

beforeAll(async () => {
  expect((await build(app, { minify: false, checkSource: false })).problems).toEqual([]);
});

afterEach(() => {
  host?.stop();
  host = null;
});

async function open(options: Partial<FakeHostOptions> = {}) {
  host = FakeHost.start({ entry: join(app, 'dist', 'screens', 'ledger.js'), manifest, fixtures: { notes: NOTES }, ...options });
  await host.mounted();
  await host.waitFor(() => host!.byText('read 120 in pages of 50, 50, 20'), { what: 'every page' });

  return host;
}

const line = (index: number) => String(host!.findAll(node => node.type === 'bry-text')[index]!.props.text);

describe('fake data and tools', () => {
  test('a seeded collection of 120 is read in three pages of 50, as the store pages', async () => {
    await open();

    expect(host!.calls.filter(call => call.tool === 'list_notes').map(call => call.input)).toEqual([
      { limit: 50, sort: { field: 'createdAt', dir: 'asc' } },
      { limit: 50, sort: { field: 'createdAt', dir: 'asc' }, cursor: '50' },
      { limit: 50, sort: { field: 'createdAt', dir: 'asc' }, cursor: '100' },
    ]);
  });

  test('a put from the screen changes the seeded record, and the screen’s watch hears the difference', async () => {
    await open();

    host!.press(host!.byText('Add')!);
    await host!.waitFor(() => /^create note_\d+ v1$/.test(line(1)), { what: 'the watch to hear the create' });

    const made = line(1).split(' ')[1]!;

    expect(host!.store!.records('notes').find(note => note.id === made)).toMatchObject({ title: 'Added here', version: 1 });
    expect(line(2)).toBe('Written.');

    host!.press(host!.byText('Rename from version 1')!);
    await host!.waitFor(() => line(1) === 'update note_0 v2', { what: 'the watch to hear the update' });
    expect(host!.store!.records('notes').find(note => note.id === 'note_0')).toMatchObject({ title: 'Renamed', version: 2 });
  });

  test('a put from a stale version is refused as the store refuses it, and nothing changes', async () => {
    await open();

    host!.store!.put('notes', { id: 'note_0', title: 'Somebody else' });
    host!.press(host!.byText('Rename from version 1')!);
    await host!.waitFor(() => line(2).startsWith('Refused'), { what: 'the refusal' });

    expect(line(2)).toBe('Refused (stale): This note changed since you read it. Here it is as it is now; make the change again on version 2.');
    expect(host!.store!.records('notes').find(note => note.id === 'note_0')).toMatchObject({ title: 'Somebody else', version: 2 });
  });

  test('a call can be held for the person, then decided; blocked; or turned away for calling too often', async () => {
    await open({
      asks: call => (call.tool === 'create_note' ? 'hold' : 'allow'),
      refuse: call => (call.tool === 'delete_note' ? 'blocked' : call.tool === 'update_note' ? 'rate_limited' : undefined),
    });

    host!.press(host!.byText('Add')!);
    await host!.waitFor(() => host!.calls.some(call => call.tool === 'create_note'), { what: 'the held call' });
    await Bun.sleep(30);
    expect(line(2)).toBe('Nothing written yet.');
    await host!.answer('deny');
    await host!.waitFor(() => line(2).startsWith('Refused'), { what: 'the denial' });
    expect(line(2)).toBe('Refused (-32000): The person didn’t allow it.');

    host!.press(host!.byText('Delete')!);
    await host!.waitFor(() => line(2).includes('switched off'), { what: 'the blocked call' });
    expect(line(2)).toBe('Refused (-32000): delete_note is switched off for this workspace.');

    host!.press(host!.byText('Rename from version 1')!);
    await host!.waitFor(() => line(2).includes('too often'), { what: 'the rate limit' });
    expect(line(2)).toBe('Refused (-32000): This app is calling too often. Try again in a minute.');

    expect(host!.calls.filter(call => call.refused).map(call => [call.tool, call.refused])).toEqual([
      ['delete_note', 'blocked'],
      ['update_note', 'rate_limited'],
    ]);
    expect(host!.store!.records('notes')).toHaveLength(120);
  });
});
