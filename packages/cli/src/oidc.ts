import { RegistryRefused, refusalOf, type Registry } from './registry.ts';

/**
 * Publishing from GitHub Actions with no stored secret (PB05).
 *
 * A workflow with `permissions: id-token: write` can ask GitHub for an OIDC
 * token naming its repository, workflow file and commit. `brydio publish`
 * asks for one with the registry as its audience and trades it at
 * `POST /v1/oidc/exchange { idToken, app }` for a fifteen-minute token that
 * publishes that one app, when the publisher linked the app to this
 * repository and workflow with `brydio trust`. No Brydio secret is in the
 * repository, its settings, or the workflow.
 */

export const OIDC_AUDIENCE = 'brydio-registry';
/** For a registry set up with another audience. */
export const OIDC_AUDIENCE_ENV = 'BRYDIO_OIDC_AUDIENCE';

/** What a CI publish records about where it was built. */
export interface Provenance {
  repo: string;
  workflow: string;
  commit: string;
}

/** Whether this runs in GitHub Actions, and whether the workflow may ask for an OIDC token. */
export function githubActions(env: NodeJS.ProcessEnv = process.env): { oidc: boolean } | null {
  if (env.GITHUB_ACTIONS !== 'true') return null;

  return { oidc: Boolean(env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) };
}

/** The repository, workflow and commit GitHub says this run is. */
export function provenanceOf(env: NodeJS.ProcessEnv = process.env): Provenance | null {
  const repo = env.GITHUB_REPOSITORY;
  const workflow = env.GITHUB_WORKFLOW_REF;
  const commit = env.GITHUB_SHA;

  return repo && workflow && commit ? { repo, workflow, commit } : null;
}

/**
 * A short-lived publish token for `app`, from GitHub's OIDC token, or a
 * sentence saying what to change in the workflow or on the registry.
 */
export async function ciToken(
  reg: Registry,
  app: string,
  options: { env?: NodeJS.ProcessEnv; fetch?: (url: string, init: RequestInit) => Promise<Response> } = {},
): Promise<{ token: string; expiresIn: number }> {
  const env = options.env ?? process.env;
  const request = options.fetch ?? fetch;

  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw new RegistryRefused(
      'This GitHub Actions job can’t ask GitHub for an OIDC token. Give the publish job permissions: id-token: write (and contents: read), then run it again. [oidc_unavailable]',
      2,
    );
  }

  const audience = env[OIDC_AUDIENCE_ENV] || OIDC_AUDIENCE;
  const asked = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);

  asked.searchParams.set('audience', audience);

  let idToken: string;

  try {
    const answer = await request(asked.toString(), { method: 'GET', headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`, accept: 'application/json' } });
    const body = (await answer.json().catch(() => null)) as { value?: unknown } | null;

    if (!answer.ok || typeof body?.value !== 'string') throw new Error(`GitHub answered ${answer.status}`);

    idToken = body.value;
  } catch (error) {
    throw new RegistryRefused(`GitHub did not give this job an OIDC token: ${error instanceof Error ? error.message : String(error)}. [oidc_unavailable]`);
  }

  const exchanged = await reg.send<{ token?: unknown; expiresIn?: unknown }>('POST', '/v1/oidc/exchange', { idToken, app });
  const { code, message } = refusalOf(exchanged.body);
  const tail = code ? ` [${code}]` : '';

  if (exchanged.status === 200 && typeof exchanged.body?.token === 'string') {
    return { token: exchanged.body.token, expiresIn: typeof exchanged.body.expiresIn === 'number' ? exchanged.body.expiresIn : 900 };
  }

  const repo = env.GITHUB_REPOSITORY ?? '<owner>/<repo>';
  const workflow = (env.GITHUB_WORKFLOW_REF ?? '').split('@')[0]?.split('/').slice(2).join('/') || '.github/workflows/<file>.yml';

  switch (exchanged.status) {
    case 403:
      throw new RegistryRefused(
        `${reg.url} does not trust this workflow to publish ${app}: ${message ?? 'no trust is set.'}${tail} A publisher's owner links it once, from their own computer: brydio trust ${app} --repo ${repo} --workflow ${workflow}`,
      );
    case 404:
      throw new RegistryRefused(`${reg.url} has no app called ${app}. Publish its first version from your own computer with brydio publish, then link this workflow with brydio trust.${tail}`);
    case 401:
      throw new RegistryRefused(`${reg.url} did not accept GitHub's OIDC token: ${message ?? 'it could not be checked.'}${tail}`);
    default:
      throw new RegistryRefused(`The registry answered ${exchanged.status} to the OIDC exchange: ${message ?? 'something went wrong.'}${tail}`);
  }
}
