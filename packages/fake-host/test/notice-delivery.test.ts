import { expect, test } from 'bun:test';

import type { Handler } from '@brydio/app/handler';
import { runHandler } from '../src/index.ts';

const manifest = { name: 'goals', grants: { host: ['notify'] } };
const notice = { to: 'user_owner', kind: 'reminder' as const, collection: 'goals', record: 'g1', title: 'Check in', delivery: 'co-partner' as const };
const send: Handler = (_, {notify}) => notify.send(notice);

test('queues co-partner delivery with the preference preserved', async () => {
  const run = await runHandler(send, {}, {manifest});
  expect(run.result).toEqual({notified: true, held: true});
  expect(run.notices.sent).toEqual([]);
  expect([...run.notices.pending.values()]).toEqual([expect.objectContaining(notice)]);
});

test('scheduled self-reminders keep their key and reject unsupported delivery', async () => {
  const schedule: Handler = (_, {notify}) => notify.at({...notice, at: '2026-10-16T12:00:00Z', key: 'check:g1'});
  const run = await runHandler(schedule, {}, {manifest, caller:{userId:'user_owner'}});
  expect(run.result).toEqual({scheduled:true});
  expect(run.notices.pending.get('user_owner:check:g1')).toMatchObject(notice);
  const invalid: Handler = (_, {notify}) => notify.send({...notice, delivery:'email'} as never);
  expect((await runHandler(invalid, {}, {manifest})).error).toContain('delivery');
});
