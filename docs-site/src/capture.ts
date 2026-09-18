import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { CATALOGUE, ELEMENT_NAMES, type ElementName } from '../../packages/ui/src/catalogue.ts';
import { EXAMPLES } from './examples.ts';
import { buildDocsSite } from './site.ts';

const ROOT = resolve(import.meta.dir, '../..');
const IMAGE_DIRECTORY = join(ROOT, 'docs-site', 'public', 'images', 'catalogue');
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

type Theme = 'light' | 'dark';

interface ImageEntry {
  light: string;
  dark: string;
  sourceHash: string;
}

type ImageManifest = Record<ElementName, ImageEntry>;

async function firstExecutable(paths: readonly string[]): Promise<string | undefined> {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next documented Chrome location.
    }
  }
}

async function chromePath(): Promise<string> {
  const paths = process.env.BROWSER_BIN ? [process.env.BROWSER_BIN, ...CHROME_PATHS] : CHROME_PATHS;
  const chrome = await firstExecutable(paths);
  if (chrome) return chrome;
  throw new Error('Chrome was not found. Set BROWSER_BIN to a Chrome executable.');
}

async function rendererFiles(): Promise<string[]> {
  const directory = join(ROOT, 'packages', 'ui', 'src', 'web');
  const files: string[] = [];

  for await (const file of new Bun.Glob('**/*.ts').scan({ cwd: directory, absolute: true })) files.push(file);
  return files.sort((left, right) => left.localeCompare(right));
}

async function sourceHash(name: ElementName): Promise<string> {
  const hash = createHash('sha256');
  const files = [
    join(ROOT, 'packages', 'ui', 'src', 'catalogue.ts'),
    ...(await rendererFiles()),
    join(ROOT, 'packages', 'ui', 'src', 'web', 'tokens.css'),
  ];

  hash.update(JSON.stringify(EXAMPLES[name]));
  hash.update(JSON.stringify(CATALOGUE[name]));
  for (const file of files) {
    hash.update(relative(ROOT, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

async function capture(chrome: string, page: string, output: string): Promise<void> {
  const process = Bun.spawn([
    chrome,
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--window-size=720,480',
    '--force-device-scale-factor=1',
    '--virtual-time-budget=1000',
    `--screenshot=${output}`,
    `file://${page}`,
  ], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  if (exitCode !== 0) {
    const details = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    throw new Error(`Chrome capture failed for ${page} with exit code ${exitCode}${details ? `:\n${details}` : ''}`);
  }
}

async function main(): Promise<void> {
  const chrome = await chromePath();
  const temporary = await mkdtemp(join(tmpdir(), 'brydio-docs-capture-'));
  const outDir = join(temporary, 'site');
  const captures = join(temporary, 'captures');

  try {
    await buildDocsSite({ outDir, basePath: '/' });
    await mkdir(captures, { recursive: true });

    const manifest = {} as ImageManifest;
    for (const name of ELEMENT_NAMES) {
      const entry: ImageEntry = {
        light: `${name}-light.png`,
        dark: `${name}-dark.png`,
        sourceHash: await sourceHash(name),
      };

      for (const theme of ['light', 'dark'] as const satisfies readonly Theme[]) {
        const asset = entry[theme];
        const screenshot = join(captures, asset);
        const page = join(outDir, 'capture', name, theme, 'index.html');
        await capture(chrome, page, screenshot);
      }
      manifest[name] = entry;
    }

    await mkdir(IMAGE_DIRECTORY, { recursive: true });
    for (const entry of Object.values(manifest)) {
      await rename(join(captures, entry.light), join(IMAGE_DIRECTORY, entry.light));
      await rename(join(captures, entry.dark), join(IMAGE_DIRECTORY, entry.dark));
    }
    await writeFile(join(IMAGE_DIRECTORY, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

if (import.meta.main) await main();
