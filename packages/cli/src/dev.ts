import { watch } from 'node:fs';
import { extname, join, normalize, relative, sep } from 'node:path';

import { build, describeBuild } from './build.ts';
import { formatProblem, readProject } from './project.ts';

/**
 * `brydio dev`: build, serve the bundle on this machine, and build again on
 * every change (A5-F02-S02).
 *
 * The folder is served with the headers Brydio's own bundle route sends
 * (`Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy:
 * cross-origin`), because a sandboxed frame's origin is opaque and a module
 * import from it is a cross-origin request. Phase 0 has no development
 * placement that points a tab at localhost (contracts §7's `POST
 * /apps/dev/placements` is not built), so what reaches a local Brydio is the
 * built folder, through `put-app-bundle.ts`; the printout says how.
 */

export interface DevOptions {
  port?: number;
  /** Where Brydio's checkout is, for the printed command. */
  brydio?: string;
}

export async function dev(dir: string, options: DevOptions = {}): Promise<{ stop(): void; url: string }> {
  const project = readProject(dir);
  const root = project.root;
  let running: Promise<unknown> = Promise.resolve();
  let again = false;

  const rebuild = async () => {
    const result = await build(root, { minify: false });

    if (result.ok) console.log(`${new Date().toLocaleTimeString('en-GB')}  ${describeBuild(result, root)}`);
    else for (const problem of result.problems) console.log(formatProblem(problem));

    return result;
  };

  const first = await rebuild();
  const outDir = first.outDir;
  const server = Bun.serve({
    port: options.port ?? 5174,
    hostname: 'localhost',
    fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
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
              headers: { ...headers, 'Content-Type': extname(file) === '.json' ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8' },
            })
          : new Response('Not found', { status: 404, headers }),
      );
    },
  });

  const onChange = () => {
    if (again) return;

    again = true;
    running = running.then(async () => {
      again = false;
      await rebuild();
    });
  };
  const watchers = [watch(join(root, 'src'), { recursive: true }, onChange), watch(project.manifestFile, onChange)];
  const url = `http://localhost:${server.port}`;
  const brydio = options.brydio ?? join(root, '..', 'brydio');

  console.log(
    [
      '',
      `Serving ${relative(root, outDir) || '.'}/ at ${url} (for example ${url}/${Object.values(project.manifest?.screens ?? {})[0]?.entry ?? 'screens/…'}).`,
      'Watching src/ and the manifest; every change builds again.',
      '',
      'To open it in a local Brydio, load the built folder as a version (each load needs a new version number):',
      `  cd ${join(brydio, 'apps/api')}`,
      `  NODE_ENV=development ./node_modules/.bin/ts-node scripts/put-app-bundle.ts ${outDir} --by "$USER"`,
      '',
    ].join('\n'),
  );

  return {
    url,
    stop() {
      for (const watcher of watchers) watcher.close();
      server.stop(true);
    },
  };
}
