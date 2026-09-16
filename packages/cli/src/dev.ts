import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { build, describeBuild, type BuildResult } from './build.ts';
import { formatProblem, readProject } from './project.ts';
import { API_URL_ENV, TOKEN_ENV } from './publish.ts';

/**
 * `brydio dev`: build, serve the bundle on this machine, show it as a tab in
 * a project in your own Brydio, and build again on every change (A5-F02).
 *
 * The folder is served with the headers Brydio's own bundle route sends
 * (`Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy:
 * cross-origin`), because a sandboxed frame's origin is opaque and a module
 * import from it is a cross-origin request.
 *
 * Signed in (`BRYDIO_API_URL` and `BRYDIO_TOKEN`, as `publish` is), it puts
 * the app on a project you own as a development tab that loads from here.
 * The first run asks which project and remembers it in `.brydio/dev.json`.
 * Every good build tells Brydio, and the open tab starts the app again with
 * the new code. A heartbeat keeps the tab while the command runs; stopping
 * the command removes it, and Brydio removes one it hasn't heard from in an
 * hour. Not signed in, it only serves and builds.
 */

export const DEV_PATH = '/api/v1/apps/development';
/** How often the command tells Brydio it is still running. */
export const HEARTBEAT_MS = 20_000;
/** Where the chosen project is remembered, inside the app's folder. */
export const DEV_CONFIG = '.brydio/dev.json';

export interface DevOptions {
  port?: number;
  /** Where Brydio's checkout is, for the printed command when not signed in. */
  brydio?: string;
  /** Brydio's API. `BRYDIO_API_URL` unless given. */
  apiUrl?: string;
  /** The session token. `BRYDIO_TOKEN` unless given. */
  token?: string;
  /** The project to show the tab on, over what `.brydio/dev.json` remembers. */
  projectId?: string;
  out?: (line: string) => void;
  /** Asks the person a question and gives back their answer. */
  ask?: (question: string) => Promise<string>;
  /** For tests: the requests, made some other way. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** For tests: no file watching and no timer. */
  watch?: boolean;
  heartbeatMs?: number;
}

export interface DevSession {
  url: string;
  /** The development app in Brydio, when signed in. */
  readonly development: { id: string; projectId: string; placementId: string } | null;
  /** Builds now, as a saved change would. */
  rebuild(): Promise<BuildResult>;
  /** Stops watching and serving, and removes the tab from Brydio. */
  stop(): Promise<void>;
}

/** A reason `brydio dev` can't go on, in words for the person running it. */
export class DevRefused extends Error {}

interface Answer {
  status: number;
  json: unknown;
}

export async function dev(dir: string, options: DevOptions = {}): Promise<DevSession> {
  const out = options.out ?? console.log;
  const project = readProject(dir);
  const root = project.root;
  const apiUrl = (options.apiUrl ?? process.env[API_URL_ENV] ?? '').replace(/\/+$/, '');
  const token = options.token ?? process.env[TOKEN_ENV] ?? '';
  const signedIn = Boolean(apiUrl && token);
  const request = options.fetch ?? fetch;
  let buildNumber = 0;
  let development: DevSession['development'] = null;
  let running: Promise<unknown> = Promise.resolve();
  let again = false;

  if (signedIn && !/^https?:\/\//.test(apiUrl)) {
    throw new DevRefused(`Set ${API_URL_ENV} to your Brydio's API address, like http://localhost:4000.`);
  }

  const call = async (method: string, path: string, body?: unknown): Promise<Answer> => {
    const answer = await request(`${apiUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    return { status: answer.status, json: await answer.json().catch(() => null) };
  };

  const manifestOf = (result: BuildResult): Record<string, unknown> | null => {
    const file = join(result.outDir, 'app.json');

    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : null;
  };

  const rebuild = async (): Promise<BuildResult> => {
    const result = await build(root, { minify: false });

    if (!result.ok) {
      for (const problem of result.problems) out(formatProblem(problem));
      if (development) out('Not built: the tab keeps the last good build.');

      return result;
    }

    out(`${new Date().toLocaleTimeString('en-GB')}  ${describeBuild(result, root)}`);

    if (development) {
      buildNumber += 1;

      const answer = await call('POST', `${DEV_PATH}/${development.id}/heartbeat`, {
        build: buildNumber,
        manifest: manifestOf(result),
      }).catch((error: unknown): Answer => ({ status: 0, json: { message: String(error) } }));

      if (answer.status !== 200) out(`Brydio didn't take this build: ${messageOf(answer)}`);
    }

    return result;
  };

  const first = await rebuild();
  const outDir = first.outDir;
  const server = Bun.serve({
    port: options.port ?? 5174,
    hostname: 'localhost',
    fetch(incoming) {
      const path = decodeURIComponent(new URL(incoming.url).pathname).replace(/^\/+/, '');
      const file = normalize(join(outDir, path));
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      };

      // Nothing outside the built folder, and nothing but what a bundle holds.
      if (!file.startsWith(outDir + sep) || !['.js', '.mjs', '.json'].includes(extname(file))) {
        return new Response('Not found', { status: 404, headers });
      }

      const body = Bun.file(file);

      return body.exists().then(exists =>
        exists
          ? new Response(body, {
              headers: {
                ...headers,
                'Content-Type': extname(file) === '.json' ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8',
              },
            })
          : new Response('Not found', { status: 404, headers }),
      );
    },
  });
  const url = `http://localhost:${server.port}`;
  const watchers: { close(): void }[] = [];
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stop = async () => {
    if (heartbeat) clearInterval(heartbeat);
    for (const watcher of watchers) watcher.close();
    server.stop(true);

    if (development) {
      const gone = development;

      development = null;
      await call('DELETE', `${DEV_PATH}/${gone.id}`).catch(() => null);
      out('Removed the development tab from Brydio.');
    }
  };

  /** The project the tab goes on: given, remembered for this Brydio, or chosen now. */
  const chooseProject = async (): Promise<string> => {
    const file = join(root, DEV_CONFIG);
    const remembered = existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as { apiUrl?: string; projectId?: string })
      : {};

    if (options.projectId) return options.projectId;
    if (remembered.projectId && remembered.apiUrl === apiUrl) return remembered.projectId;

    const listed = await call('GET', '/api/v1/projects');

    if (listed.status !== 200) throw new DevRefused(turnedAway(listed, apiUrl));

    const body = listed.json as { id: string; name: string }[] | { projects?: { id: string; name: string }[] } | null;
    const projects = Array.isArray(body) ? body : (body?.projects ?? []);

    if (projects.length === 0) throw new DevRefused('You have no projects in this workspace. Make one in Brydio first.');

    out('Which project should show the app?');
    projects.forEach((one, index) => out(`  ${index + 1}. ${one.name}`));

    const answer = Number((await (options.ask ?? askInTerminal)(`Project (1-${projects.length}): `)).trim());
    const chosen = projects[answer - 1];

    if (!Number.isInteger(answer) || !chosen) throw new DevRefused('That is not one of the projects.');

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ apiUrl, projectId: chosen.id }, null, 2)}\n`);
    out(`Remembered "${chosen.name}" in ${DEV_CONFIG}. Commit it or ignore it; delete it to choose again.`);

    return chosen.id;
  };

  /** Chooses the project, puts the app on the shelf, and starts the development app. */
  const connect = async (result: BuildResult): Promise<NonNullable<DevSession['development']>> => {
    const manifest = manifestOf(result);
    const name = typeof manifest?.name === 'string' ? manifest.name : null;

    if (!manifest || !name) throw new DevRefused('The build has no app.json with a name.');

    const projectId = await chooseProject();
    const shelf = await call('GET', '/api/v1/extensions?kind=app');

    if (shelf.status !== 200) throw new DevRefused(turnedAway(shelf, apiUrl));

    let appId = (shelf.json as { id: string; slug: string }[]).find(one => one.slug === name)?.id;

    if (!appId) {
      const made = await call('POST', '/api/v1/extensions/apps', { name, components: [] });

      if (made.status !== 201 && made.status !== 200) throw new DevRefused(turnedAway(made, apiUrl));

      appId = (made.json as { id: string }).id;
    }

    const started = await call('POST', DEV_PATH, { appId, projectId, origin: url, manifest });

    if (started.status !== 201 && started.status !== 200) throw new DevRefused(turnedAway(started, apiUrl));

    return started.json as NonNullable<DevSession['development']>;
  };

  try {
    if (signedIn) {
      if (!first.ok) throw new DevRefused('Fix the build first: Brydio is shown the app once it builds.');

      development = await connect(first);
    }
  } catch (error) {
    await stop();
    throw error;
  }

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

    if (development) {
      const id = development.id;

      heartbeat = setInterval(
        () => void call('POST', `${DEV_PATH}/${id}/heartbeat`, { build: buildNumber }).catch(() => null),
        options.heartbeatMs ?? HEARTBEAT_MS,
      );
    }
  }

  if (development) {
    out(
      [
        '',
        `Serving ${relative(root, outDir) || '.'}/ at ${url}.`,
        `Open the project in Brydio: the "${titleOf(project.raw)}" tab is marked development, and only you can see it.`,
        `  /projects/${development.projectId}?tab=app-${development.placementId}`,
        'Every saved change builds again and starts the tab over with the new code. Stop with Ctrl-C to remove the tab.',
        '',
      ].join('\n'),
    );
  } else {
    const brydio = options.brydio ?? join(root, '..', 'brydio');

    out(
      [
        '',
        `Serving ${relative(root, outDir) || '.'}/ at ${url} (for example ${url}/${Object.values(project.manifest?.screens ?? {})[0]?.entry ?? 'screens/…'}).`,
        'Watching src/ and the manifest; every change builds again.',
        '',
        `To see it as a tab in your Brydio, set ${API_URL_ENV} and ${TOKEN_ENV} and run brydio dev again.`,
        'Or load the built folder into a local Brydio as a version (each load needs a new version number):',
        `  cd ${join(brydio, 'apps/api')}`,
        `  NODE_ENV=development ./node_modules/.bin/ts-node scripts/put-app-bundle.ts ${outDir} --by "$USER"`,
        '',
      ].join('\n'),
    );
  }

  return {
    url,
    get development() {
      return development;
    },
    rebuild: () => {
      const next = running.then(rebuild);

      running = next;

      return next;
    },
    stop,
  };
}

function titleOf(raw: Record<string, unknown>): string {
  return typeof raw.displayName === 'string' && raw.displayName ? raw.displayName : String(raw.name ?? 'app');
}

function messageOf(answer: Answer): string {
  const message = (answer.json as { message?: unknown } | null)?.message;

  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join(' ');

  return `status ${answer.status}`;
}

/** What to tell the person when Brydio said no, in its words where it gave some. */
function turnedAway(answer: Answer, apiUrl: string): string {
  if (answer.status === 401) return `${apiUrl} did not accept ${TOKEN_ENV}. Sign in again and use a fresh token.`;
  if (answer.status === 423) return "Apps aren't switched on for this workspace. An administrator can turn them on.";

  return messageOf(answer);
}

async function askInTerminal(question: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });

  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
}
