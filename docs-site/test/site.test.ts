import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CATALOGUE, ELEMENT_NAMES, type ElementName } from '../../packages/ui/src/catalogue.ts';
import { valuesOf } from '../../scripts/docs-elements.ts';
import { EXAMPLES, jsxFor } from '../src/examples.ts';
import { renderMarkdown } from '../src/markdown.ts';
import { buildDocsSite } from '../src/site.ts';

const builds: string[] = [];

afterEach(async () => {
  await Promise.all(builds.splice(0).map(path => rm(path, { force: true, recursive: true })));
});

async function build(basePath = '/') {
  const outDir = await mkdtemp(join(tmpdir(), 'brydio-docs-site-'));
  builds.push(outDir);
  return { outDir, site: await buildDocsSite({ outDir, basePath }) };
}

function elementRoute(name: ElementName): string {
  return `elements/${name}/index.html`;
}

async function page(outDir: string, route: string): Promise<string> {
  return readFile(join(outDir, route), 'utf8');
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function pageText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

test('builds a route for every catalogue element with its contract and example', async () => {
  const { outDir, site } = await build();

  expect(site.routes).toContain('index.html');
  for (const name of ELEMENT_NAMES) {
    const html = await page(outDir, elementRoute(name));
    expect(site.routes).toContain(elementRoute(name));
    expect(html).toContain(`<code>${name}</code>`);
    expect(html).toContain(escapeHtml(jsxFor(EXAMPLES[name])));
    expect(html).toContain(`/images/catalogue/${name}-light.png`);
    expect(html).toContain(`/images/catalogue/${name}-dark.png`);

    const text = pageText(html);
    for (const [prop, spec] of Object.entries(CATALOGUE[name].props)) {
      expect(html).toContain(`<code>${prop}</code>`);
      expect(text).toContain(valuesOf(spec).replaceAll('`', ''));
    }
  }
});

test('renders the generated references and package guidance as static routes', async () => {
  const { outDir, site } = await build();
  const routes = [
    'index.html',
    'bridge/index.html',
    'manifest/index.html',
    'publish-checklist/index.html',
    'support/index.html',
    'security/index.html',
    'packages/index.html',
  ];

  for (const route of routes) {
    expect(site.routes).toContain(route);
    await expect(page(outDir, route)).resolves.toContain('<main');
  }

  const checklist = await page(outDir, 'publish-checklist/index.html');
  expect(checklist).toContain('<h1');
  expect(checklist).toContain('The publish checklist');
  expect(checklist).toContain('<table>');
  expect(checklist).not.toContain('# The publish checklist');

  const packages = await page(outDir, 'packages/index.html');
  expect(packages).toContain('@brydio/app');
  expect(packages).toContain('0.1.0-alpha.4');
});

test('keeps root-relative internal links valid at root and under a base path', async () => {
  for (const basePath of ['/', '/sdk/']) {
    const { outDir } = await build(basePath);
    const routeFiles = new Set<string>();
    const files = await Promise.all([
      page(outDir, 'index.html').then(() => 'index.html'),
      page(outDir, 'elements/index.html').then(() => 'elements/index.html'),
      ...ELEMENT_NAMES.map(name => page(outDir, elementRoute(name)).then(() => elementRoute(name))),
      ...['bridge', 'manifest', 'publish-checklist', 'support', 'security', 'packages'].map(route =>
        page(outDir, `${route}/index.html`).then(() => `${route}/index.html`),
      ),
    ]);
    files.forEach(file => routeFiles.add(file));

    for (const route of routeFiles) {
      const html = await page(outDir, route);
      const links = [...html.matchAll(/href="(\/[^"]*)"/g)].map(match => match[1]!);
      for (const href of links) {
        if (href.startsWith('/assets/') || href.startsWith('/images/') || href.startsWith('/sdk/assets/') || href.startsWith('/sdk/images/')) continue;
        expect(href.startsWith(basePath)).toBe(true);
        const relative = href.slice(basePath.length).replace(/^\//, '');
        const target = relative === '' ? 'index.html' : `${relative.replace(/\/$/, '')}/index.html`;
        expect(routeFiles).toContain(target);
      }
    }
  }
});

test('keeps wrapped list text in its list item', () => {
  expect(renderMarkdown('- **validate**: checked before\n  uploading\n')).toBe('<ul><li><strong>validate</strong>: checked before uploading</li></ul>');
});

test('emits a self-contained build without unresolved template values', async () => {
  const { outDir } = await build('/sdk/');
  const home = await page(outDir, 'index.html');
  const runtime = await page(outDir, 'assets/catalogue.js');
  const styles = await page(outDir, 'assets/styles.css');

  expect(home).not.toMatch(/\{\{[^}]+\}\}|__[^_]+__/);
  expect(home).not.toMatch(/(?:src|href)="https?:\/\//);
  expect(runtime).not.toMatch(/(?:from\s+|import\s*)['"]https?:\/\//);
  expect(styles).toContain('prefers-reduced-motion');
});
