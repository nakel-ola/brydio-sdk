import { build, describeBuild } from './build.ts';
import { dev } from './dev.ts';
import { formatProblem, type Problem } from './project.ts';
import { validate } from './validate.ts';

const HELP = `brydio — build and check a Brydio app

  brydio build [folder]      Build every screen into dist/, and print the fingerprint
  brydio validate [folder]   Check the manifest, the built bundle and the source
  brydio dev [folder]        Build, serve dist/ on localhost, and build again on change
                             --port <n>     the port (5174)
                             --brydio <dir> Brydio's checkout, for the printed load command

The folder is the app's, the current one unless given.`;

/** Runs one command. Answers the exit code rather than exiting, so a test can call it. */
export async function main(argv: string[], out: (line: string) => void = console.log): Promise<number> {
  const [command, ...rest] = argv;
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
      const result = validate(dir);

      report(result.problems);
      out(result.ok ? `Valid${result.problems.length ? `, with ${result.problems.length} warning${result.problems.length === 1 ? '' : 's'}` : ''}.` : 'Not valid.');

      return result.ok ? 0 : 1;
    }
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
