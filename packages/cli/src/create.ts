import { APP_NAME_FORMAT, MANIFEST_LIMITS } from '@brydio/manifest';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

/**
 * `brydio create <name>`: a new app from a template, ready to run
 * (A5-F06-S01).
 *
 * It asks Preact or plain unless told, copies that template into a new
 * folder named for the app, renames what carries the template's name, and
 * installs the dependencies. The result builds, validates, tests and runs in
 * `brydio dev` with no edits.
 *
 * Until the SDK is published, its packages come from this checkout: each
 * `@brydio/*` dependency points at `file:<sdk>/packages/<name>`, with
 * `overrides` so the packages' own dependencies on one another resolve there
 * too.
 */

export const TEMPLATES = ['preact', 'plain'] as const;

export type Template = (typeof TEMPLATES)[number];

/** The SDK checkout this command runs from, where the templates and packages are. */
export const SDK_ROOT = resolve(import.meta.dir, '..', '..', '..');

const SDK_PACKAGES = ['app', 'ui', 'manifest', 'cli', 'fake-host'] as const;

/** What a template holds that a new app must not start with. */
const LEFT_BEHIND = new Set(['node_modules', 'dist', '.DS_Store']);

export interface CreateOptions {
  template?: Template;
  /** The folder the app's folder goes in. The current one unless given. */
  into?: string;
  out?: (line: string) => void;
  /** Asks the person a question and gives back their answer. */
  ask?: (question: string) => Promise<string>;
  /** Installs the dependencies in a folder; `bun install` unless given. False skips it. */
  install?: ((dir: string) => boolean) | false;
  /** Where the SDK's templates and packages are. This checkout unless given. */
  sdk?: string;
}

export class CreateRefused extends Error {}

export async function create(name: string, options: CreateOptions = {}): Promise<string> {
  const out = options.out ?? console.log;
  const sdk = options.sdk ?? SDK_ROOT;

  if (!name || name.length > MANIFEST_LIMITS.nameChars || !APP_NAME_FORMAT.test(name)) {
    throw new CreateRefused(
      `"${name}" can't be an app's name. Use lowercase letters and digits, with single hyphens between words, like "team-issues".`,
    );
  }

  const dir = join(resolve(options.into ?? process.cwd()), name);

  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new CreateRefused(`${dir} already has files in it. Choose another name, or empty it first.`);
  }

  const template = options.template ?? (await chooseTemplate(options.ask ?? askInTerminal, out));
  const source = join(sdk, 'templates', template);

  if (!existsSync(source)) throw new CreateRefused(`There is no ${template} template at ${source}.`);

  cpSync(source, dir, { recursive: true, filter: from => !LEFT_BEHIND.has(basename(from)) });

  const title = titleOf(name);

  rewriteJson(join(dir, '.brydio/app.json'), manifest => {
    const placements = manifest.placements as { label?: string }[] | undefined;

    return {
      ...manifest,
      name,
      version: '0.1.0',
      displayName: title,
      ...(placements ? { placements: placements.map(one => (one.label ? { ...one, label: title } : one)) } : {}),
    };
  });

  rewriteJson(join(dir, 'package.json'), pkg => {
    const linked = (section: unknown) =>
      Object.fromEntries(
        Object.entries((section ?? {}) as Record<string, string>).map(([dependency, version]) => [
          dependency,
          dependency.startsWith('@brydio/') ? `file:${join(sdk, 'packages', dependency.slice('@brydio/'.length))}` : version,
        ]),
      );

    return {
      ...pkg,
      name,
      dependencies: linked(pkg.dependencies),
      devDependencies: linked(pkg.devDependencies),
      overrides: Object.fromEntries(SDK_PACKAGES.map(one => [`@brydio/${one}`, `file:${join(sdk, 'packages', one)}`])),
    };
  });

  // The template extends the SDK's shared settings; a new app carries its own.
  rewriteJson(join(dir, 'tsconfig.json'), tsconfig => {
    const base = JSON.parse(readFileSync(join(sdk, 'tsconfig.base.json'), 'utf8')) as { compilerOptions: Record<string, unknown> };
    const { extends: _, ...rest } = tsconfig;

    return { ...rest, compilerOptions: { ...base.compilerOptions, ...(tsconfig.compilerOptions as object) } };
  });

  const readme = join(dir, 'README.md');

  if (existsSync(readme)) writeFileSync(readme, readFileSync(readme, 'utf8').replace(/^# Checklist$/m, `# ${title}`));

  const install = options.install ?? bunInstall;

  if (install === false) {
    out(`Made ${name} from the ${template} template, without installing its dependencies.`);
  } else {
    out(`Made ${name} from the ${template} template. Installing its dependencies…`);
    if (!install(dir)) throw new CreateRefused(`The dependencies didn't install. Run bun install in ${dir} to see why.`);
  }

  out(
    [
      '',
      `cd ${name}`,
      'bun run test      the tests, against the fake host',
      'bun run dev       a tab in your own project (set BRYDIO_API_URL and BRYDIO_TOKEN first)',
      '',
    ].join('\n'),
  );

  return dir;
}

async function chooseTemplate(ask: (question: string) => Promise<string>, out: (line: string) => void): Promise<Template> {
  out('Which template?');
  out('  1. preact   components and hooks, the way React is written');
  out('  2. plain    element functions and no framework; a smaller bundle');

  const answer = (await ask('Template (1-2): ')).trim().toLowerCase();
  const chosen = answer === '1' || answer === 'preact' ? 'preact' : answer === '2' || answer === 'plain' ? 'plain' : null;

  if (!chosen) throw new CreateRefused('That is not one of the templates.');

  return chosen;
}

/** `team-issues` becomes `Team issues`. */
function titleOf(name: string): string {
  const words = name.split('-').join(' ');

  return words.charAt(0).toUpperCase() + words.slice(1);
}

function rewriteJson(file: string, change: (value: Record<string, unknown>) => Record<string, unknown>): void {
  if (!existsSync(file)) return;

  writeFileSync(file, `${JSON.stringify(change(JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>), null, 2)}\n`);
}

function bunInstall(dir: string): boolean {
  return spawnSync('bun', ['install'], { cwd: dir, stdio: 'inherit' }).status === 0;
}

async function askInTerminal(question: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });

  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
}
