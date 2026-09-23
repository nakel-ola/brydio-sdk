import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { main } from '../src/main.ts';

const SDK_ROOT = resolve(import.meta.dir, '..', '..', '..');
const made: string[] = [];
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

function place(): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-create-app-'));

  made.push(root);

  return root;
}

const options = (into: string, out: string[]) => ({
  into,
  out: (line: string) => void out.push(line),
  assets: SDK_ROOT,
  version: '0.1.0-alpha.7',
  install: false as const,
});

describe('@brydio/create-app', () => {
  test('creates a Preact app by default with exact registry dependencies', async () => {
    const into = place();
    const lines: string[] = [];

    expect(await main(['my-app'], options(into, lines))).toBe(0);

    const app = join(into, 'my-app');
    const pkg = json(join(app, 'package.json'));

    expect(existsSync(join(app, 'src/screens/home.tsx'))).toBe(true);
    expect(existsSync(join(app, 'test/home.test.ts'))).toBe(true);
    expect(json(join(app, '.brydio/app.json'))).toMatchObject({
      name: 'my-app',
      screens: { home: { entry: 'screens/home.js' } },
      data: { items: expect.any(Object) },
    });
    expect(pkg.dependencies['@brydio/app']).toBe('0.1.0-alpha.7');
    expect(pkg.overrides).toBeUndefined();
    expect(JSON.stringify(pkg)).not.toContain('file:');
    expect(lines.join('\n')).toContain('Made my-app from the preact template');
  });

  test('accepts the plain template explicitly', async () => {
    const into = place();

    expect(await main(['plain-app', '--template', 'plain'], options(into, []))).toBe(0);
    expect(existsSync(join(into, 'plain-app', 'src/screens/home.ts'))).toBe(true);
    expect(existsSync(join(into, 'plain-app', 'src/screens/home.tsx'))).toBe(false);
  });

  test('returns a refusal for a missing name or unknown template', async () => {
    const into = place();
    const missing: string[] = [];
    const unknown: string[] = [];

    expect(await main([], options(into, missing))).toBe(2);
    expect(missing.join('\n')).toContain("can't be an app's name");
    expect(await main(['my-app', '--template', 'vue'], options(into, unknown))).toBe(2);
    expect(unknown).toEqual(['There is no "vue" template. Choose preact or plain.']);
    expect(existsSync(join(into, 'my-app'))).toBe(false);
  });
});
