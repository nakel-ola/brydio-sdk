import { existsSync, readFileSync, watch } from 'node:fs';
import { extname, join, normalize, relative, sep } from 'node:path';

import { build, describeBuild, type BuildResult } from './build.ts';
import { formatProblem, readProject, type Problem } from './project.ts';

/**
 * `brydio dev`: build, serve the bundle on this machine, and build again on
 * every change (A5-F02, PB09). It makes no network call to Brydio or to the
 * registry, and needs no key.
 *
 * Brydio does the rest, in the builder's own signed-in browser: with
 * Developer mode on, Settings > Developer > "Load from localhost" takes the
 * port, reads `/__brydio/build` from here (which build, the manifest, the
 * custom-tool handlers, and why the newest build failed), and starts the
 * development app with the person's own session. It reads the build again
 * every second, so each saved change reaches the open app.
 *
 * Everything is served with the headers Brydio's own bundle route sends
 * (`Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy:
 * cross-origin`), because a sandboxed frame's origin is opaque and a module
 * import from it is a cross-origin request, and Brydio's page is on another
 * origin too.
 */

/** Where the browser reads what is being served. */
export const BUILD_PATH = '/__brydio/build';
/** Where an older `brydio dev` remembered the project; nothing reads it now. */
export const DEV_CONFIG = '.brydio/dev.json';

export interface DevOptions {
  port?: number;
  out?: (line: string) => void;
  /** For tests: no file watching. */
  watch?: boolean;
}

/** What `/__brydio/build` answers. */
export interface ServedBuild {
  /** Counts every build, good or failed, so the browser can tell a new one. */
  build: number;
  /** The last good build's manifest; null before the first. */
  manifest: Record<string, unknown> | null;
  /** The last good build's custom-tool handlers, by path. */
  handlers?: Record<string, string>;
  /** Why the newest build failed, or null. */
  problem: { message: string; file?: string; line?: number } | null;
}

export interface DevSession {
  url: string;
  /** What the browser is told now. */
  readonly served: ServedBuild;
  /** Builds now, as a saved change would. */
  rebuild(): Promise<BuildResult>;
  /** Stops watching and serving. */
  stop(): Promise<void>;
}

/** A reason `brydio dev` can't go on, in words for the person running it. */
export class DevRefused extends Error {}

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  // Chrome asks before a public page reads a private address (localhost).
  'Access-Control-Allow-Private-Network': 'true',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

export async function dev(dir: string, options: DevOptions = {}): Promise<DevSession> {
  const out = options.out ?? console.log;
  const project = readProject(dir);
  const root = project.root;
  // A Preact app's saves are taken in place, keeping what's on screen; a
  // plain app has no components to keep, and starts over.
  const hot = usesPreact(root);
  let served: ServedBuild = { build: 0, manifest: null, problem: null };
  let running: Promise<unknown> = Promise.resolve();
  let again = false;

  const rebuild = async (): Promise<BuildResult> => {
    const result = await build(root, { minify: false, hot });

    if (!result.ok) {
      for (const problem of result.problems) out(formatProblem(problem));

      served = { ...served, build: served.build + 1, problem: problemOf(result.problems.find(one => one.severity === 'error') ?? result.problems[0]) };

      if (served.manifest) out('Not built: the app in Brydio keeps the last good build, and says why.');

      return result;
    }

    out(`${new Date().toLocaleTimeString('en-GB')}  ${describeBuild(result, root)}`);

    const handlers = handlersOf(result);

    served = { build: served.build + 1, manifest: manifestOf(result), ...(handlers ? { handlers } : {}), problem: null };

    return result;
  };

  const first = await rebuild();
  const outDir = first.outDir;
  let server: ReturnType<typeof Bun.serve>;

  try {
    server = Bun.serve({
      port: options.port ?? 5174,
      hostname: 'localhost',
      fetch(incoming) {
        const path = decodeURIComponent(new URL(incoming.url).pathname);

        if (incoming.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: { ...HEADERS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' } });
        }

        if (path === BUILD_PATH) return Response.json(served, { headers: HEADERS });

        const file = normalize(join(outDir, path.replace(/^\/+/, '')));

        // Nothing outside the built folder, and nothing but what a bundle holds.
        if (!file.startsWith(outDir + sep) || !['.js', '.mjs', '.json'].includes(extname(file))) {
          return new Response('Not found', { status: 404, headers: HEADERS });
        }

        const body = Bun.file(file);

        return body.exists().then(exists =>
          exists
            ? new Response(body, {
                headers: { ...HEADERS, 'Content-Type': extname(file) === '.json' ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8' },
              })
            : new Response('Not found', { status: 404, headers: HEADERS }),
        );
      },
    });
  } catch (error) {
    throw new DevRefused(`Port ${options.port ?? 5174} is taken: ${error instanceof Error ? error.message : String(error)}. Run brydio dev --port <another>.`);
  }

  const url = `http://localhost:${server.port}`;
  const watchers: { close(): void }[] = [];

  if (options.watch !== false) {
    const onChange = () => {
      if (again) return;

      again = true;
      running = running.then(async () => {
        again = false;
        await rebuild();
      });
    };

    watchers.push(watch(join(root, 'src'), { recursive: true }, onChange), watch(project.manifestFile, onChange));
  }

  out(
    [
      '',
      `Serving ${relative(root, outDir) || '.'}/ at ${url}. Watching src/ and the manifest; every change builds again.`,
      '',
      `To see "${titleOf(project.raw)}" in Brydio: turn on Developer mode, then in Settings > Developer choose Load from localhost, port ${server.port}, and a project you own.`,
      'Only you see it, marked development, and it never touches an installed copy of the app or its secrets.',
      hot
        ? 'Every saved change builds again and is swapped into what is open, keeping what is on it (or starts it over when it cannot be).'
        : 'Every saved change builds again and starts what is open over with the new code.',
      'Nothing here talks to Brydio or needs a key: your signed-in browser reads the build from this port.',
      '',
    ].join('\n'),
  );

  return {
    url,
    get served() {
      return served;
    },
    rebuild: () => {
      const next = running.then(rebuild);

      running = next;

      return next;
    },
    async stop() {
      for (const watcher of watchers) watcher.close();
      server.stop(true);
    },
  };
}

/** Whether the app's JSX is Preact's through `@brydio/app/preact`, as the preact template's tsconfig says. */
export function usesPreact(root: string): boolean {
  const tsconfig = join(root, 'tsconfig.json');

  return existsSync(tsconfig) && /"jsxImportSource"\s*:\s*"@brydio\/app\/preact"/.test(readFileSync(tsconfig, 'utf8'));
}

function manifestOf(result: BuildResult): Record<string, unknown> | null {
  const file = join(result.outDir, 'app.json');

  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : null;
}

/** The built custom-tool handlers, by path: a development app has no published bundle to run its tools from. */
function handlersOf(result: BuildResult): Record<string, string> | undefined {
  const handlers: Record<string, string> = {};

  for (const [path, bytes] of result.files) {
    if (path.startsWith('handlers/') && path.endsWith('.js')) handlers[path] = new TextDecoder().decode(bytes);
  }

  return Object.keys(handlers).length ? handlers : undefined;
}

/** A build problem as the app in Brydio shows it: the words, and the file and line when there are some. */
function problemOf(problem: Problem | undefined): { message: string; file?: string; line?: number } {
  if (!problem) return { message: 'The build failed.' };

  return {
    message: problem.message,
    ...(typeof problem.file === 'string' ? { file: problem.file } : {}),
    ...(typeof problem.line === 'number' ? { line: problem.line } : {}),
  };
}

function titleOf(raw: Record<string, unknown>): string {
  return typeof raw.displayName === 'string' && raw.displayName ? raw.displayName : String(raw.name ?? 'app');
}
