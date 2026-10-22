import { BUNDLE_MANIFEST, compareVersions, publishedMigrationProblems, sizeOf } from '@brydio/manifest';

import { build } from './build.ts';
import { KeysRefused, readKeyFile, signingKeyPath, type KeyFile } from './keys.ts';
import { formatProblem, readProject } from './project.ts';
import {
  RegistryRefused,
  bodyOf,
  choosePublisher,
  path,
  refusalOf,
  registry,
  turnedAway,
  publisherName,
  type Me,
  type Registry,
  type RegistryApp,
  type RegistryOptions,
} from './registry.ts';
import { ciToken, githubActions, provenanceOf, type Provenance } from './oidc.ts';
import { signVersion } from './signing.ts';
import { validate } from './validate.ts';
import { zipFiles } from './zip.ts';

/**
 * `brydio publish`: build, validate, picture every screen, sign, and upload
 * the bundle to the app registry as a new version (PB03).
 *
 * The route is the registry's `POST /v1/apps/:key/versions`, with the built
 * folder as a zip, base64, in `{ archiveBase64 }`, and the token `brydio
 * login` kept. The registry runs every check again whatever this command
 * did, and takes the account from the token, never from the upload. What it
 * answers (`tasks/app-publishing/registry-contract.md` in Brydio):
 *
 * - 201 `{ key, version, fingerprint, sdk, tag, access, state }`, a new
 *   version: `live` for `workspace` access, `pending` (Brydio's review) for
 *   `public`.
 * - 200, the same, when exactly this bundle is already that version.
 * - 409 `version_exists` (the number is taken by a different bundle) or
 *   `version_lower` (below the highest published).
 * - 403 `not_publisher`, 422 with a check's code, 423 `retired`.
 *
 * Before building it asks the registry for the SDK minimum (`GET /v1/sdk`)
 * and for the app (`GET /v1/apps/:key`), so a build the registry would refuse
 * for its SDK, its number or a missing migration is refused here, before the
 * pictures are taken.
 *
 * With `--key` (or `BRYDIO_SIGNING_KEY`, a path to the same file), the
 * version is signed here before it goes up: the app, the number, the
 * fingerprint and the manifest's hash, with a key made by `brydio keys
 * create`, sent as `signature: { keyId, value }`. The private key is read
 * from the file and never leaves this process.
 */

export const ACCESS = ['workspace', 'public'] as const;
export type Access = (typeof ACCESS)[number];
/** A tag, as the registry reads one: `latest`, `beta`, `next`, `canary-2`, `rc.1`. */
export const TAG_FORMAT = /^[a-z][a-z0-9._-]{0,39}$/;

export interface PublishOptions extends RegistryOptions {
  /** The tag the version goes under. `latest` unless given. */
  tag?: string;
  /** Who may install it. A new app is `workspace` unless given; a published app keeps its own. */
  access?: string;
  /**
   * Pictures of every screen (A5-F04-S04). By default `@brydio/fake-host`,
   * found from the app's own folder, renders them; `false` publishes without.
   */
  screenshots?: false | Renderer;
  /** A key file from `brydio keys create`. `BRYDIO_SIGNING_KEY` unless given; without either, unsigned. */
  key?: string;
  /** Which of your publishers a brand new app belongs to, by id or name, when you are in several. */
  publisher?: string;
  /** For tests: the environment GitHub Actions sets, instead of this process's. */
  env?: NodeJS.ProcessEnv;
}

/** A screen's picture: the tree Brydio draws, at a width and in a theme. */
export interface PublishedScreenshot {
  screen: string;
  width: 'narrow' | 'wide';
  theme: 'light' | 'dark';
  tree: { root: string; nodes: unknown[] };
}

export type Renderer = (root: string) => Promise<{
  screenshots: PublishedScreenshot[];
  problems: { screen: string; width?: string; theme?: string; message: string }[];
}>;

/** What the registry answers for a version, published now or before. */
export interface Published {
  key: string;
  version: string;
  fingerprint: string;
  sdk: string;
  tag: string;
  access: Access;
  state: string;
}

/** What `GET /v1/sdk` answers. */
export interface SdkMinimum {
  minimum: string;
  upcoming?: { minimum: string; from: string };
}

/**
 * The fake host's renderer, loaded from the app's folder. The CLI can't
 * depend on `@brydio/fake-host`, which depends on it, and an app that tests
 * its screens has it already.
 */
async function fakeHostRenderer(root: string): Promise<Renderer | null> {
  try {
    const found = (await import(Bun.resolveSync('@brydio/fake-host', root))) as { renderScreenshots?: Renderer };

    return typeof found.renderScreenshots === 'function' ? found.renderScreenshots : null;
  } catch {
    return null;
  }
}

/** The registry's SDK minimum, or null when it has none to say. */
export async function sdkMinimum(reg: Registry): Promise<SdkMinimum | null> {
  const answer = await reg.send<Partial<SdkMinimum>>('GET', path.sdk);

  if (answer.status === 404) return null;

  const body = bodyOf<Partial<SdkMinimum> | null>(answer, reg, [200]);

  if (typeof body?.minimum !== 'string') throw new RegistryRefused(`${reg.url} answered ${path.sdk} with something other than { minimum }.`);

  return {
    minimum: body.minimum,
    ...(body.upcoming && typeof body.upcoming.minimum === 'string' && typeof body.upcoming.from === 'string' ? { upcoming: body.upcoming } : {}),
  };
}

/** The app as the registry has it, or null before its first version. */
export async function registryApp(reg: Registry, key: string): Promise<RegistryApp | null> {
  const answer = await reg.send<RegistryApp>('GET', path.app(key));

  if (answer.status === 404) return null;

  return bodyOf<RegistryApp>(answer, reg, [200]);
}

/** The highest version below `version` the registry holds, with its manifest, or null. */
export async function versionBefore(reg: Registry, found: RegistryApp, version: string): Promise<{ version: string; manifest: unknown } | null> {
  const previous = found.versions
    .map(one => one.version)
    .filter(one => compareVersions(one, version) < 0)
    .sort(compareVersions)
    .at(-1);

  if (!previous) return null;

  const detail = bodyOf<{ manifest?: unknown }>(await reg.send('GET', path.version(found.key, previous)), reg, [200]);

  return { version: previous, manifest: detail.manifest ?? null };
}

export async function publish(dir: string, options: PublishOptions = {}): Promise<number> {
  const out = options.out ?? console.log;

  try {
    return await publishing(dir, options, out);
  } catch (error) {
    if (error instanceof RegistryRefused) {
      out(error.message);
      if (error.code === 1) out('Not published.');

      return error.code;
    }

    if (error instanceof KeysRefused) {
      out(error.message);

      return 2;
    }

    throw error;
  }
}

async function publishing(dir: string, options: PublishOptions, out: (line: string) => void): Promise<number> {
  const tag = options.tag ?? 'latest';

  // Everything that can be wrong with the words, the login or the key is said
  // before building: found in a second, not after the pictures.
  if (!TAG_FORMAT.test(tag)) throw new RegistryRefused(`"${tag}" is not a tag. A tag starts with a lower-case letter and has up to 40 lower-case letters, digits, dots, dashes and underscores, like latest or beta.`, 2);

  if (options.access !== undefined && !ACCESS.includes(options.access as Access)) {
    throw new RegistryRefused(`--access is workspace (your publisher's own workspaces) or public (the store, after Brydio's review), not "${options.access}".`, 2);
  }

  const env = options.env ?? process.env;
  const keyPath = signingKeyPath(options.key, env);
  const signingKey: KeyFile | null = keyPath ? readKeyFile(keyPath) : null;
  const project = readProject(dir);
  const key = typeof project.raw.name === 'string' ? project.raw.name : '';
  const version = typeof project.raw.version === 'string' ? project.raw.version : '';
  // In GitHub Actions with no login on the runner, the job signs in with
  // GitHub's OIDC token (PB05): nothing stored, one app, fifteen minutes.
  const ci = githubActions(env) && !registry(options).token ? provenanceOf(env) ?? { repo: '', workflow: '', commit: '' } : null;
  let reg = ci ? registry({ ...options, token: '' }) : registry(options, 'signedIn');

  out(`Registry ${reg.url}`);

  if (ci) {
    // A version tag publishes; it has to be this version's number.
    if (env.GITHUB_REF_TYPE === 'tag' && env.GITHUB_REF_NAME && env.GITHUB_REF_NAME !== version && env.GITHUB_REF_NAME !== `v${version}`) {
      throw new RegistryRefused(
        `This run is for the tag ${env.GITHUB_REF_NAME}, but the manifest says version ${version}. Tag the commit v${version}, or raise the version with brydio version and tag that. [tag_version_mismatch]`,
        2,
      );
    }

    if (!key) throw new RegistryRefused('The manifest has no name, so there is no app to ask GitHub for a token for.', 2);

    const granted = await ciToken(reg, key, { env, ...(options.fetch ? { fetch: options.fetch } : {}) });

    reg = registry({ ...options, token: granted.token });
    out(`Signed in as GitHub Actions: ${ci.repo || 'this repository'}, ${ci.workflow || 'this workflow'}, ${ci.commit.slice(0, 12) || 'this commit'}. A ${Math.round(granted.expiresIn / 60)}-minute token for ${key}; no secret is stored.`);
  }

  const minimum = await sdkMinimum(reg);
  // A CI token publishes and does nothing else, so the registry makes these checks itself.
  const found = key && !ci ? await registryApp(reg, key) : null;

  if (found?.retired) throw new RegistryRefused(`${key} is retired on ${reg.url}, so no new version of it can be published. [retired]`);

  // Which of the account's publishers a new app goes to, by id: the registry
  // takes an id, and a name the account is not in is said here, by name.
  let publisherId: string | undefined;

  if (key && !found && !ci) {
    const me = bodyOf<Me>(await reg.send('GET', path.me), reg, [200]);

    publisherId = choosePublisher(me, options.publisher, `${key} belongs to`).id;
  } else if (found && options.publisher) {
    out(`${key} is already published by ${publisherName(found.publisher)}, so --publisher is not used: an app stays with its publisher.`);
  }

  if (found && version) {
    const highest = found.versions
      .map(one => one.version)
      .sort(compareVersions)
      .at(-1);

    if (highest && compareVersions(version, highest) < 0) {
      throw new RegistryRefused(
        `${key} ${version} is lower than ${highest}, the highest version on ${reg.url}. Give this build a higher number with brydio version patch, and publish again. [version_lower]`,
      );
    }
  }

  const built = await build(dir);

  for (const problem of built.problems) out(formatProblem(problem));

  if (!built.ok) {
    out('Not built, so not published.');

    return 1;
  }

  const checked = validate(dir);

  for (const problem of checked.problems) out(formatProblem(problem));

  if (!checked.ok) {
    out('Not valid, so not published.');

    return 1;
  }

  const shipping = JSON.parse(new TextDecoder().decode(built.files.get(BUNDLE_MANIFEST)!)) as { name?: string; version?: string; sdk?: string };

  if (minimum && typeof shipping.sdk === 'string') {
    if (compareVersions(shipping.sdk, minimum.minimum) < 0) {
      throw new RegistryRefused(
        `This app was built with SDK ${shipping.sdk}, below ${minimum.minimum}, the oldest SDK the registry takes a new version from. Run brydio upgrade-sdk, then publish again. [sdk_below_minimum]`,
      );
    }

    if (minimum.upcoming && compareVersions(shipping.sdk, minimum.upcoming.minimum) < 0) {
      out(
        `From ${minimum.upcoming.from} the registry takes new versions built with SDK ${minimum.upcoming.minimum} or newer, and this one is ${shipping.sdk}. It still publishes today; run brydio upgrade-sdk before then.`,
      );
    }
  }

  // The version published before this one, as the registry has it: a
  // collection whose schema changed needs a migration step, said here before
  // uploading (A5-F03-S02).
  if (found && version) {
    const previous = await versionBefore(reg, found, version);

    if (previous) {
      const missing = publishedMigrationProblems(previous.manifest, shipping);

      for (const problem of missing) {
        out(`error   .brydio/app.json (migrations)  ${problem.message} (${version} against ${previous.version}, the version before it.) [migration_missing]`);
      }

      if (missing.length) {
        out('Not published.');

        return 1;
      }
    }
  }

  let screenshots: PublishedScreenshot[] = [];

  if (options.screenshots !== false) {
    const render = options.screenshots ?? (await fakeHostRenderer(project.root));

    if (!render) {
      out("Pictures of each screen are taken with @brydio/fake-host. Add it to this app's devDependencies (bun add -d @brydio/fake-host), then publish again.");
      out('Not published.');

      return 1;
    }

    const rendered = await render(project.root);

    for (const problem of rendered.problems) {
      out(`error   ${[problem.screen, problem.width, problem.theme].filter(Boolean).join(', ')}: ${problem.message} [screenshot_failed]`);
    }

    if (rendered.problems.length) {
      out('A screen could not be pictured, so nothing was published.');

      return 1;
    }

    screenshots = rendered.screenshots;
    out(`Pictured ${new Set(screenshots.map(one => one.screen)).size} screen(s), ${screenshots.length} pictures.`);
  }

  // Signed over what was built: the fingerprint and the manifest are what the registry rebuilds and checks.
  const signature = signingKey
    ? {
        keyId: signingKey.keyId,
        value: signVersion({ appKey: String(shipping.name), version: String(shipping.version), bundleHash: built.hash!, manifest: shipping }, signingKey.privateKey),
      }
    : null;

  if (signingKey) out(`Signing as ${signingKey.publisher} with "${signingKey.label}" (${signingKey.keyId}).`);

  // A CI run can't read the app, so it says the app's own access rather than guess one.
  const access = (options.access as Access | undefined) ?? found?.access ?? (ci ? "the app's own" : 'workspace');

  out(`Publishing ${key} ${version}, ${sizeOf(built.bytes)}, fingerprint ${built.hash}, under the ${tag} tag with ${access} access.`);

  const answer = await reg.send<Published>('POST', path.versions(key), {
    archiveBase64: Buffer.from(zipFiles(built.files)).toString('base64'),
    tag,
    ...(options.access ? { access: options.access } : {}),
    ...(publisherId ? { publisher: publisherId } : {}),
    ...(signature ? { signature } : {}),
    ...(screenshots.length ? { screenshots } : {}),
    ...(ci?.repo ? { provenance: ci satisfies Provenance } : {}),
  });
  const { code, message, at } = refusalOf(answer.body);
  const said = (fallback: string) => `${message ?? fallback}${code ? ` [${code}]` : ''}`;

  switch (answer.status) {
    case 200:
    case 201: {
      const published = answer.body;

      out(
        answer.status === 201
          ? `Published ${published.key} ${published.version} to ${reg.url}.`
          : `${published.key} ${published.version} was already published, exactly as it is now. Nothing changed.`,
      );
      out(`  Tag          ${published.tag}`);
      out(`  Access       ${published.access}`);
      out(
        `  State        ${
          published.state === 'live'
            ? "live: your publisher's workspaces can install it now"
            : published.state === 'pending'
              ? "pending: it shows in the store once Brydio's review approves it"
              : published.state
        }`,
      );
      out(`  Fingerprint  ${published.fingerprint}`);
      out(`  SDK          ${published.sdk}`);

      // The registry refuses a signature it cannot check, so a 201 with one means it checked.
      if (signingKey && answer.status === 201) out(`  Signature    checked against "${signingKey.label}" (${signingKey.keyId}); this version reads Verified`);

      if (published.fingerprint && published.fingerprint !== built.hash) {
        // The recipe is shared; a difference means one side changed it.
        out(`The registry's fingerprint is not the one worked out here (${built.hash}). Tell the SDK's maintainers.`);
      }

      return 0;
    }
    case 409:
      out(said(code === 'version_lower' ? `${key} ${version} is lower than the highest version published.` : `${key} ${version} is already published with a different bundle.`));
      out('A version is never replaced. Give this build a new number with brydio version patch, and publish again.');

      return 1;
    case 422: {
      out(`The registry refused this version${at ? ` at ${at}` : ''}: ${said('the bundle was refused.')}`);

      // Every problem, when the registry lists more than the first.
      const problems = (answer.body as unknown as { problems?: unknown }).problems;

      if (Array.isArray(problems) && problems.length > 1) {
        for (const problem of problems.slice(1).map(refusalOf)) {
          out(`  and${problem.at ? ` at ${problem.at}` : ''}: ${problem.message ?? 'refused.'}${problem.code ? ` [${problem.code}]` : ''}`);
        }
      }

      return 1;
    }
    case 413:
      out(`The registry refused the upload as too large: ${said('it is over the size the registry takes.')}`);

      return 1;
    case 400:
      out(`The registry could not read the upload: ${said('bad request.')}`);

      return 1;
    case 423:
      out(`${key} is retired on ${reg.url}, so no new version of it can be published.${code ? ` [${code}]` : ''}`);

      return 1;
    default:
      out(turnedAway(answer, reg));
      out('Not published.');

      return 1;
  }
}
