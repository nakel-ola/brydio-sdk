import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

import { expect, test } from 'bun:test';

import { CATALOGUE, ELEMENT_NAMES, type ElementName } from '../../packages/ui/src/catalogue.ts';
import { captureExample } from '../src/site.ts';

const ROOT = resolve(import.meta.dir, '../..');
const IMAGE_DIRECTORY = join(ROOT, 'docs-site', 'public', 'images', 'catalogue');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface ImageEntry {
  light: string;
  dark: string;
  lightHash: string;
  darkHash: string;
  sourceHash: string;
}

type ImageManifest = Record<ElementName, ImageEntry>;

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

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

function expectPng(buffer: Buffer): void {
  expect(buffer.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let channels = 0;
  let complete = false;
  const data: Buffer[] = [];

  while (offset < buffer.length) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    expect(dataEnd + 4).toBeLessThanOrEqual(buffer.length);

    if (type === 'IHDR') {
      expect(size).toBe(13);
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      expect(buffer[dataStart + 8]).toBe(8);
      channels = buffer[dataStart + 9] === 2 ? 3 : buffer[dataStart + 9] === 6 ? 4 : 0;
      expect(channels).toBeGreaterThan(0);
    } else if (type === 'IDAT') {
      data.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      expect(size).toBe(0);
      expect(dataEnd + 4).toBe(buffer.length);
      complete = true;
      break;
    }
    offset = dataEnd + 4;
  }

  expect(width).toBe(720);
  expect(height).toBe(480);
  expect(complete).toBe(true);
  expect(data.length).toBeGreaterThan(0);

  const decoded = inflateSync(Buffer.concat(data));
  const rowSize = width * channels;
  expect(decoded.length).toBe(height * (rowSize + 1));
  const previous = Buffer.alloc(rowSize);
  let cursor = 0;
  let changedPixels = 0;
  let background: Buffer | undefined;

  for (let row = 0; row < height; row++) {
    const filter = decoded[cursor++];
    const reconstructed = Buffer.alloc(rowSize);
    for (let column = 0; column < rowSize; column++) {
      const source = decoded[cursor++]!;
      const left = column >= channels ? reconstructed[column - channels]! : 0;
      const up = previous[column]!;
      const upLeft = column >= channels ? previous[column - channels]! : 0;
      reconstructed[column] = filter === 0 ? source
        : filter === 1 ? (source + left) & 0xff
          : filter === 2 ? (source + up) & 0xff
            : filter === 3 ? (source + Math.floor((left + up) / 2)) & 0xff
              : filter === 4 ? (source + paeth(left, up, upLeft)) & 0xff
                : (() => { throw new Error(`Unsupported PNG filter ${filter}`); })();
    }
    for (let column = 0; column < rowSize; column += channels) {
      const pixel = reconstructed.subarray(column, column + 3);
      background ??= Buffer.from(pixel);
      if (!pixel.equals(background)) changedPixels++;
    }
    reconstructed.copy(previous);
  }

  expect(changedPixels).toBeGreaterThan(64);
}

test('keeps checked renderer captures complete and current', async () => {
  const manifest = JSON.parse(await readFile(join(IMAGE_DIRECTORY, 'manifest.json'), 'utf8')) as ImageManifest;
  const expectedFiles = new Set(['manifest.json']);

  expect(Object.keys(manifest).sort()).toEqual([...ELEMENT_NAMES].sort());
  for (const name of ELEMENT_NAMES) {
    const entry = manifest[name];
    expect(entry.light).toBe(`${name}-light.png`);
    expect(entry.dark).toBe(`${name}-dark.png`);
    expect(entry.sourceHash).toBe(await sourceHash(name));
    expectedFiles.add(entry.light);
    expectedFiles.add(entry.dark);
    const light = await readFile(join(IMAGE_DIRECTORY, entry.light));
    const dark = await readFile(join(IMAGE_DIRECTORY, entry.dark));
    expect(entry.lightHash).toBe(pngHash(light));
    expect(entry.darkHash).toBe(pngHash(dark));
    expectPng(light);
    expectPng(dark);
  }
  expect((await readdir(IMAGE_DIRECTORY)).sort()).toEqual([...expectedFiles].sort());
});

test('rejects a PNG that omits its IEND chunk', async () => {
  const png = await readFile(join(IMAGE_DIRECTORY, 'bry-button-light.png'));

  expect(() => expectPng(png.subarray(0, -12))).toThrow();
});
