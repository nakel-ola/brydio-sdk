import { describe, expect, test } from 'bun:test';

import type { Handler, MetricRead } from '@brydio/app/handler';
import { runHandler } from '../src/index.ts';

const manifest = { name: 'goals', grants: { host: ['metrics'] } };
const get: Handler<{id: string}> = ({id}, {metrics}) => metrics.get(id);
const list: Handler = (_, {metrics}) => metrics.list();
const metric: MetricRead = {
  id: 'metric_1', name: 'Revenue', unit: 'USD', target: 100, ownerId: 'user_1', dashboardId: 'dashboard_1', revision: 1,
  value: null, previous: 80, change: null, range: {from: '2026-10-01', to: '2026-10-16'}, source: {kind: 'app'},
  history: [], observedAt: null, status: 'error', error: 'Source unavailable',
};

describe('metrics handler reads', () => {
  test('reads caller-visible fixtures from read tools and preserves failures as null', async () => {
    const options = { manifest, metrics: [metric], write: false };
    expect((await runHandler(get, {id: metric.id}, options)).result).toEqual(metric);
    expect((await runHandler(list, {}, options)).result).toEqual({metrics: [{
      id: metric.id, name: metric.name, unit: metric.unit, target: metric.target, ownerId: metric.ownerId,
      dashboardId: metric.dashboardId, revision: metric.revision,
    }]});
  });
  test('requires the metrics grant, refuses visitors and distinguishes unavailable from missing', async () => {
    expect((await runHandler(list, {}, {manifest: {name: 'goals', grants: {host: []}}, metrics: [metric]})).error).toEndWith('(not_granted)');
    expect((await runHandler(list, {}, {manifest, metrics: [metric], caller: {role: 'anonymous'}})).error).toContain("can't use metrics");
    expect((await runHandler(list, {}, {manifest})).error).toEndWith('(metrics_unavailable)');
    expect((await runHandler(get, {id: 'missing'}, {manifest, metrics: []})).error).toEndWith('(metrics_not_found)');
    expect((await runHandler(get, {id: ''}, {manifest, metrics: []})).error).toEndWith('(metrics_invalid)');
  });
});
