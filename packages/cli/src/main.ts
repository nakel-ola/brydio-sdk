import { build, describeBuild } from './build.ts';
import { create, CreateRefused, TEMPLATES, type Template } from './create.ts';
import { dev, DevRefused } from './dev.ts';
import { keys } from './keys.ts';
import { formatProblem, type Problem } from './project.ts';
import { publish } from './publish.ts';
import { test } from './test.ts';
import { validate } from './validate.ts';

const HELP = `brydio — build and check a Brydio app

  brydio create <name>       Make a new app in ./<name> from a template, and install it
                             --template <preact|plain>  asked when not given
  brydio build [folder]      Build every screen into dist/, and print the fingerprint
  brydio validate [folder]   Check the manifest, the built bundle and the source
                             --previous <app.json>  the version published before, whose
                                            schema this one must migrate from
                             Every check it runs, with its code: docs/publish-checklist.md
  brydio test [folder] [-- <bun test words>]
                             Build, then run the app's *.test.ts against the build
                             with @brydio/fake-host
  brydio publish [folder]    Build, validate, and upload the bundle to Brydio as a new version
                             signed in with BRYDIO_TOKEN, to BRYDIO_API_URL
                             --api <url>    the API's address, instead of BRYDIO_API_URL
                             --key <file>   sign this version with a key from brydio keys
                                            create, instead of BRYDIO_SIGNING_KEY
                             --publisher <id|name>  which of your publishers a new app
                                            belongs to, when you are in several
  brydio keys <what>         Your publisher's signing keys. The private half is made here,
                             kept in one file only you can read, and never sent anywhere
                             create         make a key and register its public half
                                            --label <text>  what to call it
                                            --out <file>    where to keep it, instead of
                                                            ~/.brydio/keys/<key>.json
                                            --approve-with <file>  an existing key of the same
                                                            publisher, which lets this one in
                             list           the publisher's keys, and which are held here
                             retire <key>   rotate it out; what it signed stays verified
                             revoke <key> --yes   a lost key; never undone
                             --publisher <id|name>  which publisher, when you are in several
                             --api <url>    the API's address, instead of BRYDIO_API_URL
  brydio dev [folder]        Build, serve dist/ on localhost, show it as a tab in a project, and build again on change
                             --project <id> the project (asked once, then kept in .brydio/dev.json)
                             --api <url>    Brydio's API (BRYDIO_API_URL); signs in with BRYDIO_TOKEN
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

    // A flag takes the next word unless that is a flag itself, so a plain
    // switch (`--yes`) does not swallow the one after it.
    if (word.startsWith('--')) flags.set(word.slice(2), rest[at + 1]?.startsWith('--') ? '' : (rest[++at] ?? ''));
    else positional.push(word);
  }

  const dir = positional[0] ?? process.cwd();
  const report = (problems: Problem[]) => problems.forEach(problem => out(formatProblem(problem)));

  switch (command) {
    case 'create': {
      const template = flags.get('template');

      if (template !== undefined && !TEMPLATES.includes(template as Template)) {
        out(`There is no "${template}" template. Choose ${TEMPLATES.join(' or ')}.`);

        return 2;
      }

      try {
        await create(positional[0] ?? '', { out, ...(template ? { template: template as Template } : {}) });
      } catch (error) {
        if (!(error instanceof CreateRefused)) throw error;
        out(error.message);

        return 1;
      }

      return 0;
    }
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
      return publish(dir, {
        out,
        ...(flags.has('api') ? { apiUrl: flags.get('api')! } : {}),
        ...(flags.has('key') ? { key: flags.get('key')! } : {}),
        ...(flags.has('publisher') ? { publisher: flags.get('publisher')! } : {}),
      });
    case 'keys':
      // `keys create` and the rest take no folder: the words are the command.
      return keys(positional, {
        out,
        ...(flags.has('api') ? { apiUrl: flags.get('api')! } : {}),
        ...(flags.has('publisher') ? { publisher: flags.get('publisher')! } : {}),
        ...(flags.has('label') ? { label: flags.get('label')! } : {}),
        ...(flags.has('out') ? { outFile: flags.get('out')! } : {}),
        ...(flags.has('approve-with') ? { approveWith: flags.get('approve-with')! } : {}),
        ...(flags.has('override') ? { override: true } : {}),
        ...(flags.has('yes') ? { yes: true } : {}),
      });
    case 'dev': {
      let session: Awaited<ReturnType<typeof dev>>;

      try {
        session = await dev(dir, {
          out,
          ...(flags.has('port') ? { port: Number(flags.get('port')) } : {}),
          ...(flags.has('brydio') ? { brydio: flags.get('brydio')! } : {}),
          ...(flags.has('api') ? { apiUrl: flags.get('api')! } : {}),
          ...(flags.has('project') ? { projectId: flags.get('project')! } : {}),
        });
      } catch (error) {
        if (!(error instanceof DevRefused)) throw error;
        out(error.message);

        return 1;
      }

      // Runs until stopped, and takes its tab out of Brydio on the way.
      return new Promise<number>(done => {
        const end = () => void session.stop().then(() => done(0));

        process.once('SIGINT', end);
        process.once('SIGTERM', end);
      });
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
