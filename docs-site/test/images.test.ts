import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { expect, test } from 'bun:test';

import { CATALOGUE, ELEMENT_NAMES, type ElementName } from '../../packages/ui/src/catalogue.ts';
import { EXAMPLES } from '../src/examples.ts';

const ROOT = resolve(import.meta.dir, '../..');
const IMAGE_DIRECTORY = join(ROOT, 'docs-site', 'public', 'images', 'catalogue');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface ImageEntry {
  light: string;
  dark: string;
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
  ];

  hash.update(JSON.stringify(EXAMPLES[name]));
  hash.update(JSON.stringify(CATALOGUE[name]));
  for (const file of files) {
    hash.update(relative(ROOT, file));
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

function expectPng(buffer: Buffer): void {
  expect(buffer.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
  expect(buffer.toString('ascii', 12, 16)).toBe('IHDR');
  expect(buffer.readUInt32BE(16)).toBe(720);
  expect(buffer.readUInt32BE(20)).toBe(480);
}

test('keeps checked renderer captures complete and current', async () => {
  const manifest = JSON.parse(await readFile(join(IMAGE_DIRECTORY, 'manifest.json'), 'utf8')) as ImageManifest;

  expect(Object.keys(manifest).sort()).toEqual([...ELEMENT_NAMES].sort());
  for (const name of ELEMENT_NAMES) {
    const entry = manifest[name];
    expect(entry.light).toBe(`${name}-light.png`);
    expect(entry.dark).toBe(`${name}-dark.png`);
    expect(entry.sourceHash).toBe(await sourceHash(name));
    expectPng(await readFile(join(IMAGE_DIRECTORY, entry.light)));
    expectPng(await readFile(join(IMAGE_DIRECTORY, entry.dark)));
  }
});
