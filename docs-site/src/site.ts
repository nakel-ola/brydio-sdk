import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { CATALOGUE, ELEMENT_NAMES, type ElementName } from '../../packages/ui/src/catalogue.ts';
import { valuesOf } from '../../scripts/docs-elements.ts';
import { EXAMPLES, jsxFor } from './examples.ts';
import { escapeHtml, renderMarkdown } from './markdown.ts';

const ROOT = resolve(import.meta.dir, '../..');

export interface SiteBuildOptions {
  outDir: string;
  basePath: string;
}

export interface SiteBuild {
  outDir: string;
  basePath: string;
  routes: string[];
}

function normalizeBasePath(basePath: string): string {
  const leading = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return leading.endsWith('/') ? leading : `${leading}/`;
}

function href(basePath: string, route = ''): string {
  return `${basePath}${route}`;
}

export function routeForMarkdown(basePath: string, target: string): string {
  if (/^(?:https?:|mailto:|#)/.test(target)) return target;
  const fragmentAt = target.indexOf('#');
  const document = (fragmentAt === -1 ? target : target.slice(0, fragmentAt)).replace(/^\.\//, '').replace(/\.md$/, '');
  const fragment = fragmentAt === -1 ? '' : target.slice(fragmentAt);
  return `${href(basePath, document ? `${document.replace(/\/$/, '')}/` : '')}${fragment}`;
}

function shell(title: string, content: string, basePath: string): string {
  const links = [
    ['Home', ''], ['Elements', 'elements/'], ['Bridge', 'bridge/'], ['Manifest', 'manifest/'], ['Checklist', 'publish-checklist/'], ['Packages', 'packages/'],
  ];
  const rail = ELEMENT_NAMES.map(name => `<a href="${href(basePath, `elements/${name}/`)}">${name}</a>`).join('');
  const nav = links.map(([label, route]) => `<a href="${href(basePath, route)}">${label}</a>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Brydio SDK reference">
  <title>${escapeHtml(title)} | Brydio SDK</title>
  <link rel="stylesheet" href="${href(basePath, 'assets/styles.css')}">
</head>
<body>
  <header class="site-header"><div class="site-header__inner"><a class="site-name" href="${href(basePath)}">Brydio SDK</a><nav aria-label="Primary">${nav}</nav></div></header>
  <div class="site-layout"><aside class="reference-rail" aria-label="Catalogue"><p>Catalogue</p>${rail}</aside><main>${content}</main></div>
  <script type="module" src="${href(basePath, 'assets/catalogue.js')}"></script>
</body>
</html>`;
}

function elementPage(name: ElementName, basePath: string): string {
  const spec = CATALOGUE[name];
  const required = new Set(spec.required ?? []);
  const settings = Object.entries(spec.props)
    .map(([prop, definition]) => `<tr><td><code>${prop}</code></td><td>${renderMarkdown(valuesOf(definition), { linkFor: target => routeForMarkdown(basePath, target) }).replace(/^<p>|<\/p>$/g, '')}</td><td>${required.has(prop) ? 'yes' : 'no'}</td></tr>`)
    .join('');
  const example = EXAMPLES[name];
  const serialized = escapeHtml(JSON.stringify(example));
  const source = escapeHtml(jsxFor(example));

  return shell(name, `<p class="eyebrow">Catalogue element</p>
<h1><code>${name}</code></h1>
<p class="lede">${escapeHtml(example.about)}</p>
<section><h2>Settings</h2><table><thead><tr><th>Setting</th><th>Takes</th><th>Needed</th></tr></thead><tbody>${settings}</tbody></table></section>
<section class="example-panel"><h2>Example</h2><div class="live-example" data-example="${serialized}" aria-label="${name} example"></div><h3>JSX</h3><pre><code>${source}</code></pre></section>
<section><h2>Renderer contact sheet</h2><p>These paths will hold the checked light and dark captures.</p><div class="contact-sheet"><figure><figcaption>Light</figcaption><img src="${href(basePath, `images/catalogue/${name}-light.png`)}" alt="${name} light renderer capture"></figure><figure><figcaption>Dark</figcaption><img src="${href(basePath, `images/catalogue/${name}-dark.png`)}" alt="${name} dark renderer capture"></figure></div></section>`, basePath);
}

export function captureExample(name: ElementName) {
  const example = structuredClone(EXAMPLES[name]);
  if (name === 'bry-dialog') {
    const dialog = example.nodes.find(node => node.id === example.root);
    if (dialog) dialog.props.open = true;
  }
  return example;
}

function capturePage(name: ElementName, theme: 'light' | 'dark'): string {
  const serialized = escapeHtml(JSON.stringify(captureExample(name)));
  const themeClass = theme === 'dark' ? 'dark' : 'light';

  return `<!doctype html>
<html lang="en" class="${themeClass}" data-capture="true">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} ${theme} capture</title>
  <link rel="stylesheet" href="../../../assets/tokens.css">
  <style>
    * { box-sizing: border-box; }
    html, body { width: 720px; min-height: 480px; margin: 0; }
    body { display: grid; place-items: center; padding: 48px; background: var(--bg-canvas); color: var(--fg); font: 14px/1.5 Inter, ui-sans-serif, system-ui, sans-serif; }
    .live-example { width: min(100%, 624px); }
  </style>
</head>
<body>
  <div class="live-example" data-example="${serialized}" aria-label="${name} ${theme} renderer capture"></div>
  <script type="module" src="../../../assets/catalogue.js"></script>
</body>
</html>`;
}

async function packagePage(basePath: string): Promise<string> {
  const packages = await readdir(join(ROOT, 'packages'), { withFileTypes: true });
  const sections = await Promise.all(packages.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map(async entry => {
    const directory = join(ROOT, 'packages', entry.name);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as { name: string; version: string; description: string };
    const readme = await readFile(join(directory, 'README.md'), 'utf8');
    return `<section><h2 id="${entry.name}"><code>${escapeHtml(manifest.name)}</code></h2><p class="lede">${escapeHtml(manifest.description)} Version ${escapeHtml(manifest.version)}.</p>${renderMarkdown(readme, { linkFor: target => routeForMarkdown(basePath, target) })}</section>`;
  }));
  return shell('Packages', `<p class="eyebrow">SDK packages</p><h1>Choose the part your app needs.</h1><p class="lede">Each package page is made from its checked-in package metadata and README.</p>${sections.join('')}`, basePath);
}

async function browserBundle(outDir: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'runtime.ts')],
    format: 'esm',
    outdir: join(outDir, 'assets'),
    naming: 'catalogue.js',
    target: 'browser',
  });
  if (!result.success) throw new Error(result.logs.map(log => log.message).join('\n'));
}

export async function buildDocsSite({ outDir, basePath }: SiteBuildOptions): Promise<SiteBuild> {
  const normalizedBasePath = normalizeBasePath(basePath);
  const routes: string[] = [];
  await rm(outDir, { force: true, recursive: true });
  await mkdir(join(outDir, 'assets'), { recursive: true });

  const writeRoute = async (route: string, html: string): Promise<void> => {
    const file = join(outDir, route);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html);
    routes.push(route);
  };

  const docs = async (name: string) => readFile(join(ROOT, 'docs', name), 'utf8');
  const markdownPage = async (title: string, source: string) => shell(title, renderMarkdown(await docs(source), { linkFor: target => routeForMarkdown(normalizedBasePath, target) }), normalizedBasePath);

  await writeRoute('index.html', shell('Documentation', `<p class="eyebrow">Contract bench</p><h1>Build a Brydio app without reading its source.</h1><p class="lede">The reference below is generated from the SDK contracts. It names the bridge, manifest rules, element settings, and release checks your app must meet.</p><div class="page-grid"><a href="${href(normalizedBasePath, 'elements/')}"><strong>Catalogue</strong>Every element and a working example.</a><a href="${href(normalizedBasePath, 'bridge/')}"><strong>Bridge</strong>The worker's route into Brydio.</a><a href="${href(normalizedBasePath, 'manifest/')}"><strong>Manifest</strong>Describe an app before it runs.</a><a href="${href(normalizedBasePath, 'publish-checklist/')}"><strong>Publish checklist</strong>Find the exact refusal before release.</a></div>`, normalizedBasePath));
  const catalogueReference = renderMarkdown(await docs('elements.md'), { linkFor: target => routeForMarkdown(normalizedBasePath, target) });
  await writeRoute('elements/index.html', shell('Catalogue', `<p class="eyebrow">Catalogue examples</p><p class="lede">Start with a working example, then check the generated contract for every setting, event, and child rule.</p><div class="page-grid">${ELEMENT_NAMES.map(name => `<a href="${href(normalizedBasePath, `elements/${name}/`)}"><strong>${name}</strong>${escapeHtml(EXAMPLES[name].about)}</a>`).join('')}</div><section class="generated-reference">${catalogueReference}</section>`, normalizedBasePath));
  for (const name of ELEMENT_NAMES) await writeRoute(`elements/${name}/index.html`, elementPage(name, normalizedBasePath));
  for (const name of ELEMENT_NAMES) {
    await writeRoute(`capture/${name}/light/index.html`, capturePage(name, 'light'));
    await writeRoute(`capture/${name}/dark/index.html`, capturePage(name, 'dark'));
  }
  await writeRoute('bridge/index.html', await markdownPage('The bridge', 'bridge.md'));
  await writeRoute('manifest/index.html', await markdownPage('Manifest', 'manifest.md'));
  await writeRoute('publish-checklist/index.html', await markdownPage('The publish checklist', 'publish-checklist.md'));
  await writeRoute('support/index.html', await markdownPage('Support', 'support.md'));
  await writeRoute('security/index.html', await markdownPage('Security', 'security.md'));
  await writeRoute('packages/index.html', await packagePage(normalizedBasePath));

  await writeFile(join(outDir, 'assets', 'styles.css'), await readFile(join(import.meta.dir, 'styles.css')));
  await writeFile(join(outDir, 'assets', 'tokens.css'), await readFile(join(ROOT, 'packages', 'ui', 'src', 'web', 'tokens.css')));
  await browserBundle(outDir);
  const publicDirectory = join(ROOT, 'docs-site', 'public');
  try {
    await cp(publicDirectory, outDir, { recursive: true });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }

  return { outDir, basePath: normalizedBasePath, routes };
}

if (import.meta.main) {
  const basePath = process.env.DOCS_BASE_PATH ?? '/';
  const outDir = join(ROOT, 'docs-site', 'dist');
  const site = await buildDocsSite({ outDir, basePath });
  console.log(`Built ${site.routes.length} documentation routes in ${outDir}`);
}
