import { create, CreateRefused, TEMPLATES, type CreateOptions, type Template } from '@brydio/cli';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const PACKAGE_ROOT = resolve(import.meta.dir, '..');
export const ASSETS_ROOT = existsSync(join(PACKAGE_ROOT, 'templates')) ? PACKAGE_ROOT : resolve(PACKAGE_ROOT, '..', '..');

export interface MainOptions {
  out?: (line: string) => void;
  into?: string;
  assets?: string;
  version?: string;
  install?: CreateOptions['install'];
}

/** Runs the initializer and returns an exit code so tests do not exit their process. */
export async function main(argv: string[], options: MainOptions = {}): Promise<number> {
  const out = options.out ?? console.log;
  const positional: string[] = [];
  let template: Template = 'preact';

  for (let at = 0; at < argv.length; at++) {
    const word = argv[at]!;

    if (word === '--template') {
      const asked = argv[++at];

      if (!TEMPLATES.includes(asked as Template)) {
        out(`There is no "${asked ?? ''}" template. Choose ${TEMPLATES.join(' or ')}.`);

        return 2;
      }

      template = asked as Template;
    } else {
      positional.push(word);
    }
  }

  if (positional.length > 1) {
    out('Give one app name, followed only by --template preact or --template plain.');

    return 2;
  }

  try {
    await create(positional[0] ?? '', {
      template,
      sdk: options.assets ?? ASSETS_ROOT,
      version: options.version ?? packageVersion(),
      ...(options.into ? { into: options.into } : {}),
      ...(options.install !== undefined ? { install: options.install } : {}),
      out,
    });

    return 0;
  } catch (error) {
    if (!(error instanceof CreateRefused)) throw error;

    out(error.message);

    return 2;
  }
}

function packageVersion(): string {
  return (JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
}
