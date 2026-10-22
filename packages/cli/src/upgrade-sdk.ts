import { SEMVER_FORMAT, compareVersions } from '@brydio/manifest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { build } from './build.ts';
import { formatProblem } from './project.ts';
import { sdkMinimum } from './publish.ts';
import { RegistryRefused, registry, type RegistryOptions } from './registry.ts';
import { validate } from './validate.ts';

/**
 * `brydio upgrade-sdk [version]`: every `@brydio/*` pin in an app's
 * `package.json` moved to one version, installed, built and validated
 * (PB19). An app is on one SDK, never a mix.
 *
 * With no version it takes the newest on npm, from the `latest` and `next`
 * dist-tags, whichever is higher: SDK releases go out under `next`, and
 * `latest` moves only when the owner says so. A dist-tag's name works as the
 * version too. Every package pinned has to exist at that version before
 * anything is written.
 *
 * Then it asks the app registry for its SDK minimum (`GET /v1/sdk`), and says
 * when the version chosen is below it, or below one already announced.
 */

export const NPM_REGISTRY = 'https://registry.npmjs.org';
const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;

export interface UpgradeSdkOptions extends RegistryOptions {
  /** npm's registry, for a mirror or a test. */
  npm?: string;
  /** Installs the dependencies; by default `bun install` in the app's folder. */
  install?: (dir: string) => boolean;
  /** Builds and validates with the SDK just installed; by default the app's own `brydio build` and `brydio validate`. */
  check?: (dir: string) => boolean | Promise<boolean>;
}

/** The versions npm has of a package, and its dist-tags. Null when npm has no such package. */
async function npmPackage(name: string, options: UpgradeSdkOptions): Promise<{ versions: string[]; tags: Record<string, string> } | null> {
  const npm = (options.npm ?? NPM_REGISTRY).replace(/\/+$/, '');
  const request = options.fetch ?? fetch;
  let answer: Response;

  try {
    answer = await request(`${npm}/${name.replace('/', '%2f')}`, { method: 'GET', headers: { accept: 'application/vnd.npm.install-v1+json' } });
  } catch (error) {
    throw new RegistryRefused(`Could not reach npm at ${npm}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (answer.status === 404) return null;

  if (!answer.ok) throw new RegistryRefused(`npm answered ${answer.status} for ${name}.`);

  const body = (await answer.json().catch(() => null)) as { versions?: Record<string, unknown>; 'dist-tags'?: Record<string, string> } | null;

  return { versions: Object.keys(body?.versions ?? {}), tags: body?.['dist-tags'] ?? {} };
}

export async function upgradeSdk(wanted: string | undefined, dir: string, options: UpgradeSdkOptions = {}): Promise<number> {
  const out = options.out ?? console.log;

  try {
    return await upgrading(wanted, resolve(dir), options, out);
  } catch (error) {
    if (!(error instanceof RegistryRefused)) throw error;

    out(error.message);

    return error.code;
  }
}

async function upgrading(wanted: string | undefined, root: string, options: UpgradeSdkOptions, out: (line: string) => void): Promise<number> {
  const file = join(root, 'package.json');

  if (!existsSync(file)) throw new RegistryRefused(`There is no package.json in ${root}. Run brydio upgrade-sdk in the app's folder.`, 2);

  const text = readFileSync(file, 'utf8');
  const pkg = JSON.parse(text) as Record<string, unknown>;
  const pins = SECTIONS.flatMap(section =>
    Object.entries((pkg[section] ?? {}) as Record<string, string>)
      .filter(([name]) => name.startsWith('@brydio/'))
      .map(([name, range]) => ({ section, name, range })),
  );

  if (!pins.length) throw new RegistryRefused(`${file} pins no @brydio package, so there is no SDK to move.`, 2);

  const app = await npmPackage('@brydio/app', options);

  if (!app) throw new RegistryRefused('npm has no @brydio/app, so the newest SDK is unknown. Give a version: brydio upgrade-sdk 0.1.0-alpha.60.');

  let target: string;

  if (!wanted) {
    const candidates = [app.tags.latest, app.tags.next].filter((one): one is string => typeof one === 'string');

    if (!candidates.length) throw new RegistryRefused('npm has no latest or next tag for @brydio/app. Give a version: brydio upgrade-sdk <version>.');

    target = candidates.sort(compareVersions).at(-1)!;
    out(`The newest SDK on npm is ${target} (latest ${app.tags.latest ?? 'none'}, next ${app.tags.next ?? 'none'}).`);
  } else if (SEMVER_FORMAT.test(wanted)) {
    target = wanted;
  } else if (app.tags[wanted]) {
    target = app.tags[wanted]!;
    out(`npm's ${wanted} tag is ${target}.`);
  } else {
    throw new RegistryRefused(`"${wanted}" is not a version or one of @brydio/app's tags on npm (${Object.keys(app.tags).join(', ')}).`, 2);
  }

  // Every package there before writing, so an app is never left half moved.
  const missing: string[] = [];

  for (const name of [...new Set(pins.map(pin => pin.name))]) {
    const found = name === '@brydio/app' ? app : await npmPackage(name, options);

    if (!found?.versions.includes(target)) missing.push(name);
  }

  if (missing.length) throw new RegistryRefused(`npm has no ${target} of ${missing.join(', ')}, so nothing was changed. Choose a version every one of them has.`);

  await warnBelowMinimum(target, options, out);

  const moved = pins.filter(pin => pin.range !== target);

  if (!moved.length) {
    out(`Every @brydio package is already on ${target}.`);
  } else {
    for (const pin of pins) {
      const section = pkg[pin.section] as Record<string, string>;

      section[pin.name] = target;
    }

    const indent = /^\{\n([ \t]+)"/.exec(text)?.[1] ?? '  ';

    writeFileSync(file, `${JSON.stringify(pkg, null, indent)}\n`);

    for (const pin of moved) out(`  ${pin.name.padEnd(20)} ${pin.range} → ${target}${/^(file|link|workspace):/.test(pin.range) ? ' (was a local link)' : ''}`);
  }

  out('Installing…');

  if (!(options.install ?? bunInstall)(root)) {
    out(`The dependencies didn't install. package.json now pins ${target}; run bun install in ${root} to see why.`);

    return 1;
  }

  out(`Building and validating with SDK ${target}…`);

  if (!(await (options.check ?? buildAndValidate)(root))) {
    out(`The app does not build or validate on SDK ${target}. Fix what is printed above; the SDK's changelog says what changed.`);

    return 1;
  }

  out(`On SDK ${target}, built and valid.`);

  return 0;
}

/** Says when a version is below the registry's SDK minimum, now or announced. Never stops the upgrade. */
async function warnBelowMinimum(target: string, options: UpgradeSdkOptions, out: (line: string) => void): Promise<void> {
  try {
    const reg = registry(options);

    out(`Registry ${reg.url}`);

    const minimum = await sdkMinimum(reg);

    if (!minimum) {
      out('  says no SDK minimum.');

      return;
    }

    if (compareVersions(target, minimum.minimum) < 0) {
      out(`  ${target} is below ${minimum.minimum}, the oldest SDK the registry takes a new version from, so a version built on it can't be published.`);
    } else if (minimum.upcoming && compareVersions(target, minimum.upcoming.minimum) < 0) {
      out(`  From ${minimum.upcoming.from} the registry takes new versions built with SDK ${minimum.upcoming.minimum} or newer; ${target} is below that.`);
    } else {
      out(`  takes new versions from SDK ${minimum.minimum}; ${target} is fine.`);
    }
  } catch (error) {
    if (!(error instanceof RegistryRefused)) throw error;

    out(`${error.message} The SDK minimum was not checked.`);
  }
}

function bunInstall(dir: string): boolean {
  return spawnSync('bun', ['install'], { cwd: dir, stdio: 'inherit' }).status === 0;
}

/**
 * The app's own `brydio`, the one just installed, rather than the one running
 * this. An app without `@brydio/cli` is built and checked by this one.
 */
async function buildAndValidate(dir: string): Promise<boolean> {
  const own = join(dir, 'node_modules', '.bin', 'brydio');

  if (existsSync(own)) return ['build', 'validate'].every(command => spawnSync('bun', [own, command], { cwd: dir, stdio: 'inherit' }).status === 0);

  const built = await build(dir);

  for (const problem of built.problems) console.log(formatProblem(problem));

  if (!built.ok) return false;

  const checked = validate(dir);

  for (const problem of checked.problems) console.log(formatProblem(problem));

  return checked.ok;
}
