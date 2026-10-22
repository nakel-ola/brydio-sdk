import { existsSync, statSync } from 'node:fs';

import { build, describeBuild } from './build.ts';
import { create, CreateRefused, TEMPLATES, type Template } from './create.ts';
import { dev, DevRefused } from './dev.ts';
import { keys } from './keys.ts';
import { formatProblem, type Problem } from './project.ts';
import { login, logout, publishers, whoami } from './login.ts';
import { pack } from './pack.ts';
import { publish } from './publish.ts';
import { access, deprecate, retire, tag, tags } from './registry-commands.ts';
import { DEFAULT_REGISTRY, REGISTRY_URL_ENV } from './registry.ts';
import { test } from './test.ts';
import { upgradeSdk } from './upgrade-sdk.ts';
import { validate } from './validate.ts';
import { version } from './version.ts';

/** Flags that are switches: they never take the word after them. */
const SWITCHES = new Set(['yes', 'undo', 'override', 'help']);

const HELP = `brydio — build, check and publish a Brydio app

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
  brydio pack [folder]       Build, and list every file publish would send, with sizes and
                             the total against the 1 MB cap. Nothing is sent
  brydio version <patch|minor|major|x.y.z> [folder]
                             Raise the version in the manifest, the one place it lives, and
                             add a migrations entry when a collection's fields changed since
                             the last published version

  The app registry (${DEFAULT_REGISTRY} unless --registry <url>, ${REGISTRY_URL_ENV},
  or the registry you last logged in to says otherwise). Each command prints which one.

  brydio login               Sign in with your Brydio account in the browser, and keep a
                             registry-only token in ~/.brydio/registry.json
  brydio logout              Revoke that token and forget it
  brydio whoami              Who this computer is logged in as, and their publishers
  brydio publishers [list|show [publisher]|create "<name>"]
                             The publishers your account is in, or a new one
  brydio publish [folder]    Build, validate, picture every screen, and upload the bundle
                             to the registry as a new version
                             --tag <tag>    the tag it goes under (latest)
                             --access <workspace|public>  workspace: your publisher's own
                                            workspaces, live at once; public: the store,
                                            after Brydio's review. A new app is workspace;
                                            a published one keeps its own unless given
                             --publisher <id|name>  which of your publishers a new app
                                            belongs to, when you are in several
                             --key <file>   sign this version with a key from brydio keys
                                            create, instead of BRYDIO_SIGNING_KEY
  brydio tag <app>@<version> <tag>
                             Point a tag at a version: promote a beta, or move latest back
  brydio tags <app> [tag]    The app's tags and versions, or every move of one tag
  brydio deprecate <app>@<version> "<message>"
                             Warn admins of workspaces on that version. --undo takes it off
  brydio access <app> <workspace|public>
                             Who may install the app from now on
  brydio retire <app> --yes  No new version of the app, ever. Installs keep their last one
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
  brydio upgrade-sdk [version|tag] [folder]
                             Move every @brydio/* pin to one SDK (the newest on npm's latest
                             or next tag), install, build and validate. Says when it is below
                             the registry's SDK minimum

  brydio dev [folder]        Build, serve dist/ on localhost, show it in a project where its
                             manifest places it, and build again on change
                             --project <id> the project (asked once, then kept in .brydio/dev.json)
                             --api <url>    your Brydio's API (BRYDIO_API_URL); uses BRYDIO_TOKEN,
                                            a Settings > Developer key, until dev needs none
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
    if (word.startsWith('--')) {
      const name = word.slice(2);

      flags.set(name, SWITCHES.has(name) || rest[at + 1]?.startsWith('--') ? '' : (rest[++at] ?? ''));
    } else positional.push(word);
  }

  const dir = positional[0] ?? process.cwd();
  const report = (problems: Problem[]) => problems.forEach(problem => out(formatProblem(problem)));
  const reg = {
    out,
    ...(flags.has('registry') ? { registry: flags.get('registry')! } : {}),
  };

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
    case 'pack':
      return pack(dir, { out });
    case 'version':
      return version(positional.slice(0, 1), positional[1] ?? process.cwd(), reg);
    case 'login':
      return login(reg);
    case 'logout':
      return logout(reg);
    case 'whoami':
      return whoami(reg);
    case 'publishers':
      return publishers(positional, { ...reg, ...(flags.has('publisher') ? { publisher: flags.get('publisher')! } : {}) });
    case 'publish':
      if (flags.has('api')) {
        out('brydio publish sends to the app registry, never to a Brydio API. Use --registry <url>, or leave it out for the default.');

        return 2;
      }

      return publish(dir, {
        ...reg,
        ...(flags.has('tag') ? { tag: flags.get('tag')! } : {}),
        ...(flags.has('access') ? { access: flags.get('access')! } : {}),
        ...(flags.has('key') ? { key: flags.get('key')! } : {}),
        ...(flags.has('publisher') ? { publisher: flags.get('publisher')! } : {}),
      });
    case 'tag':
      return tag(positional, reg);
    case 'tags':
      return tags(positional, reg);
    case 'deprecate':
      return deprecate(positional, { ...reg, ...(flags.has('undo') ? { undo: true } : {}) });
    case 'access':
      return access(positional, reg);
    case 'retire':
      return retire(positional, { ...reg, ...(flags.has('yes') ? { yes: true } : {}) });
    case 'upgrade-sdk': {
      // `brydio upgrade-sdk ../my-app` works too: a folder is not a version.
      const first = positional[0];
      const isFolder = first !== undefined && !/^\d/.test(first) && existsSync(first) && statSync(first).isDirectory();

      return upgradeSdk(isFolder ? undefined : first, (isFolder ? first : positional[1]) ?? process.cwd(), reg);
    }
    case 'keys':
      // `keys create` and the rest take no folder: the words are the command.
      return keys(positional, {
        ...reg,
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
