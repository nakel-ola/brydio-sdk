import { basename, dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

import { publish, type ImageManifest, type PublishFileSystem } from '../src/capture.ts';

const IMAGE_PARENT = '/images';
const IMAGE_DIRECTORY = join(IMAGE_PARENT, 'catalogue');
const CAPTURES = '/captures';

function fakeFileSystem(): { fileSystem: PublishFileSystem; files(path: string): string[] } {
  const directories = new Map<string, Set<string>>([
    [CAPTURES, new Set(['button-light.png', 'button-dark.png'])],
    [IMAGE_DIRECTORY, new Set(['old.png'])],
  ]);

  const directory = (path: string): Set<string> => {
    const files = directories.get(path);
    if (!files) throw new Error(`Missing directory ${path}`);
    return files;
  };

  return {
    fileSystem: {
      async mkdir(path) {
        directories.set(path, directories.get(path) ?? new Set());
      },
      async mkdtemp(prefix) {
        const path = `${prefix}next`;
        directories.set(path, new Set());
        return path;
      },
      async rename(from, to) {
        const movedDirectory = directories.get(from);
        if (movedDirectory) {
          directories.set(to, movedDirectory);
          directories.delete(from);
          return;
        }
        const name = basename(from);
        directory(dirname(from)).delete(name);
        directory(dirname(to)).add(basename(to));
      },
      async rm(path) {
        if (basename(path).startsWith('.catalogue-backup-')) {
          directory(path).clear();
          throw new Error('backup cleanup failed after partial deletion');
        }
        directories.delete(path);
      },
      async readdir(path) {
        return [...directory(path)];
      },
      async writeFile(path) {
        directory(dirname(path)).add(basename(path));
      },
    },
    files(path) {
      return [...directory(path)].sort();
    },
  };
}

test('keeps the new publication when backup cleanup partially fails', async () => {
  const { fileSystem, files } = fakeFileSystem();
  const manifest = {
    'bry-button': {
      light: 'button-light.png',
      dark: 'button-dark.png',
      lightHash: 'light',
      darkHash: 'dark',
      sourceHash: 'source',
    },
  } as unknown as ImageManifest;

  await expect(publish(CAPTURES, manifest, { imageDirectory: IMAGE_DIRECTORY, imageParent: IMAGE_PARENT, fileSystem })).rejects.toThrow('backup cleanup failed');

  expect(files(IMAGE_DIRECTORY)).toEqual(['button-dark.png', 'button-light.png', 'manifest.json']);
});
