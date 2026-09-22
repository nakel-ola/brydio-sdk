import { build, publish } from '@brydio/cli';
import { beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { describeScreenshotProblem, renderScreenshots } from '../src/index.ts';

const app = join(import.meta.dir, 'fixtures', 'pictured');

beforeAll(async () => {
  expect((await build(app, { minify: false, checkSource: false })).problems).toEqual([]);
});

describe('pictures of every screen (A5-F04-S04)', () => {
  test('renders a screen at a narrow and a wide width, in light and dark, with the sample records', async () => {
    const { screenshots, problems } = await renderScreenshots(app, { screens: ['home'] });

    expect(problems).toEqual([]);
    expect(screenshots.map(one => [one.screen, one.width, one.theme])).toEqual([
      ['home', 'narrow', 'light'],
      ['home', 'narrow', 'dark'],
      ['home', 'wide', 'light'],
      ['home', 'wide', 'dark'],
    ]);

    const wideDark = screenshots.find(one => one.width === 'wide' && one.theme === 'dark')!;
    const texts = wideDark.tree.nodes.filter(node => node.type === 'bry-text').map(node => node.props?.text);

    expect(wideDark.tree.root).toBe('root');
    expect(wideDark.tree.nodes[0]).toMatchObject({ id: 'root', type: 'bry-stack' });
    expect(texts).toEqual(['1200 dark project-tab', 'Buy milk', 'Call Ada']);
    expect(screenshots.find(one => one.width === 'narrow' && one.theme === 'light')!.tree.nodes.filter(node => node.type === 'bry-text')[0]!.props?.text).toBe(
      '400 light project-tab',
    );
  });

  // A screen that draws nothing is given two seconds to start before it is
  // reported, once per width and theme — so this case waits on purpose.
  test('names a screen that draws nothing or has a node refused, at each width and theme', { timeout: 30_000 }, async () => {
    const { screenshots, problems } = await renderScreenshots(app, { screens: ['blank', 'wrong'] });

    expect(screenshots).toEqual([]);
    expect(problems.map(describeScreenshotProblem)).toEqual([
      'blank, narrow, light: It drew nothing.',
      'blank, narrow, dark: It drew nothing.',
      'blank, wide, light: It drew nothing.',
      'blank, wide, dark: It drew nothing.',
      'wrong, narrow, light: Brydio refused part of it: Brydio has no element called "bry-chart".',
      'wrong, narrow, dark: Brydio refused part of it: Brydio has no element called "bry-chart".',
      'wrong, wide, light: Brydio refused part of it: Brydio has no element called "bry-chart".',
      'wrong, wide, dark: Brydio refused part of it: Brydio has no element called "bry-chart".',
    ]);
  });

  test('waits for a screen that is slow to start, rather than picturing it before it draws', async () => {
    const { screenshots, problems } = await renderScreenshots(app, { screens: ['slow'] });

    expect(problems).toEqual([]);
    expect(screenshots).toHaveLength(4);

    for (const one of screenshots) {
      expect(one.tree.nodes.filter(node => node.type === 'bry-text').map(node => node.props?.text)).toEqual(['Buy milk', 'Call Ada']);
    }
  });

  test('refuses sample records the store would refuse', async () => {
    const { problems } = await renderScreenshots(app, { screens: ['home'], samples: { notes: [{ title: 7 }] } });

    expect(problems).toHaveLength(4);
    expect(problems[0]!.message).toContain('title');
  });

  test('brydio publish finds this renderer from the app’s folder, and stops before uploading when a screen can’t be pictured', async () => {
    const lines: string[] = [];
    const sent: string[] = [];
    const code = await publish(app, {
      apiUrl: 'http://brydio.test',
      token: 't',
      out: one => lines.push(one),
      fetch: async url => {
        sent.push(url);

        return new Response(JSON.stringify({ oldest: '0.0.0', before: '9.0.0' }), { status: 200 });
      },
    });

    expect(code).toBe(1);
    expect(lines).toContain('error   blank, narrow, light: It drew nothing. [screenshot_failed]');
    expect(sent.filter(url => url.endsWith('/publish'))).toEqual([]);
  }, 30_000);
});
