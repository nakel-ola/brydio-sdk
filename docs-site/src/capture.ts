import { createHash } from 'node:crypto';
import { access, constants, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

import { CATALOGUE, ELEMENT_NAMES, type ElementName } from '../../packages/ui/src/catalogue.ts';
import { buildDocsSite, captureExample } from './site.ts';

const ROOT = resolve(import.meta.dir, '../..');
const IMAGE_DIRECTORY = join(ROOT, 'docs-site', 'public', 'images', 'catalogue');
const IMAGE_PARENT = dirname(IMAGE_DIRECTORY);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

type Theme = 'light' | 'dark';

interface ImageEntry {
  light: string;
  dark: string;
  lightHash: string;
  darkHash: string;
  sourceHash: string;
}

export type ImageManifest = Record<ElementName, ImageEntry>;

export interface PublishFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<void>;
  mkdtemp(prefix: string): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { force: true; recursive: true }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  writeFile(path: string, data: string): Promise<void>;
}

export interface PublishOptions {
  imageDirectory?: string;
  imageParent?: string;
  fileSystem?: PublishFileSystem;
}

const PUBLISH_FILE_SYSTEM: PublishFileSystem = {
  async mkdir(path, options) { await mkdir(path, options); },
  mkdtemp,
  rename,
  async rm(path, options) { await rm(path, options); },
  readdir,
  async writeFile(path, data) { await writeFile(path, data); },
};

async function firstExecutable(paths: readonly string[]): Promise<string | undefined> {
  for (const path of paths) {
    try {
      await access(path, constants.X_OK);
      return path;
    } catch {
      // Try the next documented Chrome location.
    }
  }
}

async function chromePath(): Promise<string> {
  if (process.env.BROWSER_BIN) {
    try {
      await access(process.env.BROWSER_BIN, constants.X_OK);
      return process.env.BROWSER_BIN;
    } catch {
      throw new Error(`BROWSER_BIN is not executable: ${process.env.BROWSER_BIN}`);
    }
  }
  const chrome = await firstExecutable(CHROME_PATHS);
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
    join(ROOT, 'docs-site', 'src', 'site.ts'),
    join(ROOT, 'docs-site', 'src', 'runtime.ts'),
  ];

  hash.update(JSON.stringify(captureExample(name)));
  hash.update(JSON.stringify(CATALOGUE[name]));
  for (const file of files) {
    hash.update(relative(ROOT, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

function pngHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function validatePng(buffer: Buffer, source: string): void {
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error(`Capture is not a PNG: ${source}`);
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let channels = 0;
  let complete = false;
  const data: Buffer[] = [];

  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw new Error(`Capture PNG is truncated: ${source}`);
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd + 4 > buffer.length) throw new Error(`Capture PNG has an incomplete ${type} chunk: ${source}`);
    if (type === 'IHDR') {
      if (size !== 13 || buffer[dataStart + 8] !== 8) throw new Error(`Capture PNG has an unsupported header: ${source}`);
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      channels = buffer[dataStart + 9] === 2 ? 3 : buffer[dataStart + 9] === 6 ? 4 : 0;
    } else if (type === 'IDAT') {
      data.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      if (size !== 0 || dataEnd + 4 !== buffer.length) throw new Error(`Capture PNG is not complete: ${source}`);
      complete = true;
      break;
    }
    offset = dataEnd + 4;
  }

  if (!complete || width !== 720 || height !== 480 || channels === 0 || data.length === 0) throw new Error(`Capture PNG has unexpected dimensions or colour data: ${source}`);
  const decoded = inflateSync(Buffer.concat(data));
  if (decoded.length !== height * (width * channels + 1)) throw new Error(`Capture PNG pixel data is incomplete: ${source}`);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.png': return 'image/png';
    default: return 'application/octet-stream';
  }
}

function serveSite(outDir: string) {
  const root = resolve(outDir);
  return Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const target = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
      if (!target.startsWith(`${root}/`)) return new Response('Not found', { status: 404 });
      try {
        await access(target);
        return new Response(Bun.file(target), { headers: { 'content-type': contentType(target) } });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    },
  });
}

async function capture(chrome: string, route: string, output: string): Promise<void> {
  const process = Bun.spawn([
    chrome,
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--window-size=720,480',
    '--force-device-scale-factor=1',
    '--virtual-time-budget=1000',
    '--dump-dom',
    `--screenshot=${output}`,
    route,
  ], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  if (exitCode !== 0) {
    const details = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    throw new Error(`Chrome capture failed for ${route} with exit code ${exitCode}${details ? `:\n${details}` : ''}`);
  }
  if (!stdout.includes('data-capture-ready="true"') || stdout.includes('data-capture-error=')) throw new Error(`Capture runtime was not ready for ${route}`);
  validatePng(await readFile(output), route);
}

export async function publish(captures: string, manifest: ImageManifest, options: PublishOptions = {}): Promise<void> {
  const imageDirectory = options.imageDirectory ?? IMAGE_DIRECTORY;
  const imageParent = options.imageParent ?? dirname(imageDirectory);
  const fileSystem = options.fileSystem ?? PUBLISH_FILE_SYSTEM;
  await fileSystem.mkdir(imageParent, { recursive: true });
  const next = await fileSystem.mkdtemp(join(imageParent, '.catalogue-next-'));
  const backup = join(imageParent, `.catalogue-backup-${process.pid}`);
  let previousMoved = false;
  let published = false;

  try {
    for (const entry of Object.values(manifest)) {
      await fileSystem.rename(join(captures, entry.light), join(next, entry.light));
      await fileSystem.rename(join(captures, entry.dark), join(next, entry.dark));
    }
    await fileSystem.writeFile(join(next, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const expected = new Set(['manifest.json', ...Object.values(manifest).flatMap(entry => [entry.light, entry.dark])]);
    const staged = await fileSystem.readdir(next);
    if (staged.length !== expected.size || staged.some(file => !expected.has(file))) throw new Error('Capture staging directory is incomplete.');

    try {
      await fileSystem.rename(imageDirectory, backup);
      previousMoved = true;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
    await fileSystem.rename(next, imageDirectory);
    published = true;
  } catch (error) {
    if (previousMoved && !published) {
      await fileSystem.rm(imageDirectory, { force: true, recursive: true });
      await fileSystem.rename(backup, imageDirectory);
    }
    throw error;
  } finally {
    await fileSystem.rm(next, { force: true, recursive: true });
  }
  if (previousMoved) await fileSystem.rm(backup, { force: true, recursive: true });
}

async function main(): Promise<void> {
  const chrome = await chromePath();
  const temporary = await mkdtemp(join(tmpdir(), 'brydio-docs-capture-'));
  const outDir = join(temporary, 'site');
  const captures = join(temporary, 'captures');
  let server: ReturnType<typeof Bun.serve> | undefined;

  try {
    await buildDocsSite({ outDir, basePath: '/' });
    await mkdir(captures, { recursive: true });
    server = serveSite(outDir);

    const manifest = {} as ImageManifest;
    for (const name of ELEMENT_NAMES) {
      const entry: ImageEntry = {
        light: `${name}-light.png`,
        dark: `${name}-dark.png`,
        lightHash: '',
        darkHash: '',
        sourceHash: await sourceHash(name),
      };

      for (const theme of ['light', 'dark'] as const satisfies readonly Theme[]) {
        const asset = entry[theme];
        const screenshot = join(captures, asset);
        const route = `http://127.0.0.1:${server.port}/capture/${name}/${theme}/`;
        await capture(chrome, route, screenshot);
        entry[`${theme}Hash`] = pngHash(await readFile(screenshot));
      }
      manifest[name] = entry;
    }

    await publish(captures, manifest);
  } finally {
    server?.stop(true);
    await rm(temporary, { force: true, recursive: true });
  }
}

if (import.meta.main) await main();
