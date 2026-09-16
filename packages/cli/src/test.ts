import { build } from './build.ts';
import { formatProblem, readProject } from './project.ts';

/**
 * `brydio test`: build the app, then run its tests against the build
 * (A5-F05).
 *
 * The tests are the app's own `*.test.ts` files, run by `bun test` in the
 * app's folder. They start screens with `@brydio/fake-host`'s `testApp`,
 * which finds the built bundle this command has just written; the
 * environment says it is fresh (`BRYDIO_TEST_BUILT`), so nothing is built
 * twice. A build that fails stops here, with its problems, and no test runs
 * against an old `dist/`.
 */

export interface TestOptions {
  /** More words for `bun test`: a file filter, `--test-name-pattern`, `--watch`. */
  args?: string[];
  /** Where the tests' own output goes. The terminal, unless a caller wants it. */
  out?: (line: string) => void;
}

export async function test(dir: string, options: TestOptions = {}): Promise<number> {
  const out = options.out ?? console.log;
  const root = readProject(dir).root;
  const result = await build(root);

  for (const problem of result.problems) out(formatProblem(problem));

  if (!result.ok) {
    out('Not built, so not tested.');

    return 1;
  }

  const child = Bun.spawn([process.execPath, 'test', ...(options.args ?? [])], {
    cwd: root,
    env: { ...process.env, BRYDIO_TEST_BUILT: root },
    stdin: 'inherit',
    stdout: options.out ? 'pipe' : 'inherit',
    stderr: options.out ? 'pipe' : 'inherit',
  });

  if (options.out) {
    const [stdout, stderr] = await Promise.all([new Response(child.stdout as ReadableStream).text(), new Response(child.stderr as ReadableStream).text()]);

    for (const line of `${stdout}${stderr}`.split('\n')) if (line.trim()) out(line);
  }

  return child.exited;
}
