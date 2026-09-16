import { build, formatProblem, readProject } from '@brydio/cli';
import type { AppManifestWithData } from '@brydio/manifest';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FakeHost, type FakeHostOptions } from './host.ts';

/**
 * An app's tests, as `brydio test` runs them (A5-F05).
 *
 * A test names the screen it wants, as the manifest names it, and gets a fake
 * host running that screen's built module. The app is built once per test
 * run: `brydio test` builds it before starting `bun test` and says so in
 * `BRYDIO_TEST_BUILT`, and a plain `bun test` (an editor's test button, a
 * workspace-wide run) builds it on first use instead, so a test never runs
 * against a `dist/` older than its source.
 */

/** Set by `brydio test` to the folder it has just built. */
export const BUILT_ENV = 'BRYDIO_TEST_BUILT';

export interface TestApp {
  /** The app's folder: where its manifest is. */
  root: string;
  manifest: AppManifestWithData;
  /** Starts a screen by its name in the manifest. Stop it with `stopAll()` or its own `stop()`. */
  start(screen: string, options?: Omit<FakeHostOptions, 'entry' | 'manifest'>): FakeHost;
  /** Stops every screen this app started; what an `afterEach` calls. */
  stopAll(): void;
}

const built = new Map<string, Promise<void>>();

/**
 * The app a test belongs to, built. `from` is anywhere inside the app, such
 * as a test's `import.meta.dir` or `import.meta.url`; the app is the nearest
 * folder above it with a manifest. Without it, the folder `brydio test` ran
 * in, or the current one.
 */
export async function testApp(from?: string): Promise<TestApp> {
  const root = appRoot(from ?? process.env[BUILT_ENV] ?? process.cwd());
  const project = readProject(root);

  if (!project.manifest) {
    throw new Error(`The app at ${root} has a manifest Brydio would refuse:\n${project.problems.map(formatProblem).join('\n')}`);
  }

  if (!built.has(root)) built.set(root, process.env[BUILT_ENV] === root ? Promise.resolve() : buildFor(root));

  await built.get(root);

  const manifest = project.manifest;
  const hosts = new Set<FakeHost>();

  return {
    root,
    manifest,
    start(screen, options = {}) {
      const declared = manifest.screens?.[screen];

      if (!declared) {
        throw new Error(`The manifest has no "${screen}" screen. It has ${Object.keys(manifest.screens ?? {}).join(', ') || 'none'}.`);
      }

      const host = FakeHost.start({ ...options, entry: join(project.root, 'dist', declared.entry), manifest });

      hosts.add(host);

      return host;
    },
    stopAll() {
      for (const host of hosts) host.stop();

      hosts.clear();
    },
  };
}

async function buildFor(root: string): Promise<void> {
  const result = await build(root);

  if (!result.ok) throw new Error(`The app did not build, so its screens can't be tested:\n${result.problems.map(formatProblem).join('\n')}`);
}

/** The nearest folder at or above `from` holding a Brydio manifest. */
function appRoot(from: string): string {
  const start = resolve(from.startsWith('file:') ? fileURLToPath(from) : from);
  let at = existsSync(start) && statSync(start).isDirectory() ? start : dirname(start);

  for (;;) {
    if (existsSync(join(at, '.brydio', 'app.json')) || existsSync(join(at, 'app.json')) && existsSync(join(at, 'package.json'))) return at;

    const up = dirname(at);

    if (up === at) throw new Error(`There is no Brydio app at or above ${start}: no .brydio/app.json was found.`);

    at = up;
  }
}
