import { BUNDLE_MANIFEST, sdkRefusal, sizeOf, type SdkSupport } from '@brydio/manifest';

import { build } from './build.ts';
import { formatProblem } from './project.ts';
import { validate } from './validate.ts';
import { zipFiles } from './zip.ts';

/**
 * `brydio publish`: build, validate, and upload the bundle to Brydio as a new
 * version (A5-F04, the command line's half).
 *
 * The route is Hodler's `POST /api/v1/apps/publish` (`apps/api/src/apps/
 * publishing/app-publish.controller.ts`): the built folder as a zip, base64,
 * in `{ archiveBase64 }`, signed in as the person publishing. The server runs
 * every check again whatever this command did, and takes the publisher from
 * the sign-in, never from the upload. What it answers:
 *
 * - 201, a new version: `{ created: true, appKey, version, versionId,
 *   bundleHash, publishedBy, publishedAt, files }`, `files` being paths on
 *   the API.
 * - 200, the same shape with `created: false`: exactly this version was
 *   already published, so a retry is not a failure.
 * - 409 `{ reason: 'version_exists', message }`: the number is taken by
 *   different code or a different manifest. The message names both
 *   fingerprints.
 * - 422 `{ reason, message, at }`: the bundle or manifest was refused, at a
 *   file or field.
 * - 423: Apps are not on for the workspace.
 *
 * Before any of that it asks `GET /api/v1/apps/sdk` which SDK versions the
 * Brydio runs (`{ oldest, before }`), and refuses locally, in the server's
 * `sdk_unsupported` words, a build it would refuse (A5-F04-S03). A Brydio
 * with no such route is from before the check: the upload goes ahead, and the
 * command says the version was not checked.
 *
 * Sign-in is a token in `BRYDIO_TOKEN`, sent as a bearer token: the same
 * Clerk session token the web app sends. The address is `BRYDIO_API_URL`.
 */

export const TOKEN_ENV = 'BRYDIO_TOKEN';
export const API_URL_ENV = 'BRYDIO_API_URL';
export const PUBLISH_PATH = '/api/v1/apps/publish';
export const SDK_PATH = '/api/v1/apps/sdk';

export interface PublishOptions {
  /** Brydio's API, like `https://api.brydio.app`. `BRYDIO_API_URL` unless given. */
  apiUrl?: string;
  /** The session token. `BRYDIO_TOKEN` unless given. */
  token?: string;
  out?: (line: string) => void;
  /** For tests: the request, made some other way. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

/** What the server answers for a version, published now or before. */
export interface Published {
  created: boolean;
  appKey: string;
  version: string;
  versionId: string;
  bundleHash: string;
  publishedBy: string;
  publishedAt: string;
  files: string[];
}

export async function publish(dir: string, options: PublishOptions = {}): Promise<number> {
  const out = options.out ?? console.log;
  const apiUrl = (options.apiUrl ?? process.env[API_URL_ENV] ?? '').replace(/\/+$/, '');
  const token = options.token ?? process.env[TOKEN_ENV] ?? '';

  // Before building: a missing sign-in is found in a second, not after a build.
  if (!apiUrl || !/^https?:\/\//.test(apiUrl)) {
    out(`Set ${API_URL_ENV} to your Brydio's API address, like http://localhost:4000.`);

    return 2;
  }

  if (!token) {
    out(`Set ${TOKEN_ENV} to a Brydio session token. The version is published as the account it belongs to.`);

    return 2;
  }

  const request = options.fetch ?? fetch;
  const headers = { authorization: `Bearer ${token}` };
  let support: SdkSupport | null = null;

  try {
    const answer = await request(`${apiUrl}${SDK_PATH}`, { method: 'GET', headers });

    if (answer.status === 404) {
      out(`${apiUrl} does not check SDK versions yet, so this build's SDK was not checked before uploading.`);
    } else if (answer.ok) {
      const body = (await answer.json().catch(() => null)) as Partial<SdkSupport> | null;

      if (typeof body?.oldest !== 'string' || typeof body?.before !== 'string') {
        out(`${apiUrl} answered ${SDK_PATH} with something other than { oldest, before }. Not published.`);

        return 1;
      }

      support = { oldest: body.oldest, before: body.before };
    } else {
      out(turnedAway(answer.status, apiUrl, (await answer.json().catch(() => null)) as Record<string, unknown> | null));

      return 1;
    }
  } catch (error) {
    out(`Could not reach ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`);

    return 1;
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

  if (support) {
    const sdk = (JSON.parse(new TextDecoder().decode(built.files.get(BUNDLE_MANIFEST)!)) as { sdk?: unknown }).sdk;
    const refused = sdkRefusal(sdk, support);

    if (refused) {
      // The server's own sentence for `sdk_unsupported`, said without uploading.
      out(`Brydio would refuse this version at sdk: ${refused} [sdk_unsupported]`);
      out('Not published.');

      return 1;
    }
  }

  const archive = zipFiles(built.files);
  const url = `${apiUrl}${PUBLISH_PATH}`;
  let response: Response;

  out(`Publishing ${sizeOf(built.bytes)}, fingerprint ${built.hash}, to ${apiUrl}.`);

  try {
    response = await request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ archiveBase64: Buffer.from(archive).toString('base64') }),
    });
  } catch (error) {
    out(`Could not reach ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`);

    return 1;
  }

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const said = (fallback: string) => (typeof body?.message === 'string' ? body.message : Array.isArray(body?.message) ? body.message.join(' ') : fallback);

  switch (response.status) {
    case 200:
    case 201: {
      const published = body as unknown as Published;
      const files = (published.files ?? []).map(path => (/^https?:/.test(path) ? path : `${apiUrl}${path}`));

      out(
        published.created
          ? `Published ${published.appKey} ${published.version}.`
          : `${published.appKey} ${published.version} was already published, exactly as it is now. Nothing changed.`,
      );
      out(`  Version    ${published.versionId}`);
      out(`  Fingerprint ${published.bundleHash}`);
      out(`  Publisher  ${published.publishedBy}, ${published.publishedAt}`);
      files.forEach(file => out(`  ${file}`));

      if (published.bundleHash !== built.hash) {
        // The recipe is shared (contracts §11); a difference means one side changed it.
        out(`The server's fingerprint is not the one worked out here (${built.hash}). Tell the SDK's maintainers.`);
      }

      out('No pictures of the screens were attached: publishing does not render them yet.');

      return 0;
    }
    case 409:
      out(said('That version number is already published.'));
      out('Give this build a new version number in the manifest, and publish again.');

      return 1;
    case 422:
      out(`Brydio refused this version${typeof body?.at === 'string' ? ` at ${body.at}` : ''}: ${said('the bundle was refused.')}${typeof body?.reason === 'string' ? ` [${body.reason}]` : ''}`);

      return 1;
    case 400:
      out(`Brydio could not read the upload: ${said('bad request.')}`);

      return 1;
    case 401:
    case 403:
    case 404:
    case 423:
      out(turnedAway(response.status, apiUrl, body));

      return 1;
    default:
      out(`Brydio answered ${response.status}: ${said(response.statusText || 'something went wrong.')}`);

      return 1;
  }
}

/** What to tell the builder when Brydio turns a request away before looking at the app. */
function turnedAway(status: number, apiUrl: string, body: Record<string, unknown> | null): string {
  switch (status) {
    case 423:
      return 'Apps are not on for your workspace, so nothing can be published to it.';
    case 401:
    case 403:
      return `Brydio did not accept the token in ${TOKEN_ENV}. Sign in again and use a fresh one.`;
    case 404:
      // No route at all: a Brydio from before A5-F04, or one with Apps switched off whole.
      return `${apiUrl} has no publish route. That Brydio is older than publishing, or has Apps switched off.`;
    default:
      return `Brydio answered ${status}: ${typeof body?.message === 'string' ? body.message : 'something went wrong.'}`;
  }
}

