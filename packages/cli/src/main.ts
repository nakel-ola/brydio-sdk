import { build, describeBuild } from './build.ts';
import { dev } from './dev.ts';
import { formatProblem, type Problem } from './project.ts';
import { publish } from './publish.ts';
import { test } from './test.ts';
import { validate } from './validate.ts';

const HELP = `brydio — build and check a Brydio app

  brydio build [folder]      Build every screen into dist/, and print the fingerprint
  brydio validate [folder]   Check the manifest, the built bundle and the source
                             --previous <app.json>  the version published before, whose
                                            schema this one must migrate from
  brydio test [folder] [-- <bun test words>]
                             Build, then run the app's *.test.ts against the build
                             with @brydio/fake-host
  brydio publish [folder]    Build, validate, and upload the bundle to Brydio as a new version
                             signed in with BRYDIO_TOKEN, to BRYDIO_API_URL
                             --api <url>    the API's address, instead of BRYDIO_API_URL
  brydio dev [folder]        Build, serve dist/ on localhost, and build again on change
                             --port <n>     the port (5174)
                             --brydio <dir> Brydio's checkout, for the printed load command

The folder is the app's, the current one unless given.`;

/** Runs one command. Answers the exit code rather than exiting, so a test can call it. */
export async function main(argv: string[], out: (line: string) => void = console.log): Promise<number> {
  const [command, ...words] = argv;
  // Everything after `--` belongs to the command a command runs (`bun test`'s filters).
  const split = words.indexOf('--');
  const rest = split < 0 ? words : words.slice(0, split);
  const passed = split < 0 ? [] : words.slice(split + 1);
  const flags = new Map<string, string>();
  const positional: string[] = [];

  for (let at = 0; at < rest.length; at++) {
    const word = rest[at]!;

    if (word.startsWith('--')) flags.set(word.slice(2), rest[++at] ?? '');
    else positional.push(word);
  }

  const dir = positional[0] ?? process.cwd();
  const report = (problems: Problem[]) => problems.forEach(problem => out(formatProblem(problem)));

  switch (command) {
    case 'build': {
      const result = await build(dir);

      report(result.problems);

      if (!result.ok) {
        out('Not built.');

        return 1;
      }

      out(describeBuild(result, dir));

      return 0;
    }
    case 'validate': {
      const result = validate(dir, flags.has('previous') ? { previous: flags.get('previous')! } : {});

      report(result.problems);
      out(result.ok ? `Valid${result.problems.length ? `, with ${result.problems.length} warning${result.problems.length === 1 ? '' : 's'}` : ''}.` : 'Not valid.');

      return result.ok ? 0 : 1;
    }
    case 'test':
      return test(dir, { args: passed, ...(out === console.log ? {} : { out }) });
    case 'publish':
      return publish(dir, { out, ...(flags.has('api') ? { apiUrl: flags.get('api')! } : {}) });
    case 'dev': {
      await dev(dir, {
        ...(flags.has('port') ? { port: Number(flags.get('port')) } : {}),
        ...(flags.has('brydio') ? { brydio: flags.get('brydio')! } : {}),
      });

      // Runs until stopped.
      return new Promise<number>(() => {});
    }
    case undefined:
    case 'help':
    case '--help':
      out(HELP);

      return 0;
    default:
      out(`There is no "${command}" command.\n\n${HELP}`);

      return 2;
  }
}
