import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { BRAND, OWNED } from '../../../test-support/owner-rules.ts';
import { publish, trust, WORKFLOW, WORKFLOW_PATH } from '../src/index.ts';
import { brydioHome, fakeRegistry, type FakeRegistry } from './fake-registry.ts';

/**
 * Publishing from GitHub Actions with no stored secret (PB05), and the
 * workflow `brydio create` writes (PB20).
 */

const made: string[] = [];
const servers: { stop: (force?: boolean) => void }[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const one of servers.splice(0)) one.stop(true);
});

function app(version = '1.0.0'): string {
  const root = mkdtempSync(join(tmpdir(), 'brydio-oidc-'));

  made.push(root);

  for (const [path, content] of Object.entries({
    ...OWNED,
    '.brydio/app.json': JSON.stringify({ name: 'tiny', version, ...BRAND, screens: { home: { entry: 'screens/home.js' } } }),
    'src/screens/home.ts': 'export const home = 1;\n',
  })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  return root;
}

/** GitHub's token endpoint for one job: it answers `value` to a request with the job's request token. */
function github(value: string) {
  const asked: { audience: string | null; authorization: string | null }[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const url = new URL(request.url);

      asked.push({ audience: url.searchParams.get('audience'), authorization: request.headers.get('authorization') });

      return request.headers.get('authorization') === 'Bearer job-request-token' ? Response.json({ value }) : new Response('no', { status: 401 });
    },
  });

  servers.push(server);

  return { url: `http://127.0.0.1:${server.port}/token?api-version=2.0`, asked };
}

/** A registry where Ada published `tiny` 1.0.0 and trusted acme/tiny's publish.yml. */
async function trusted(): Promise<FakeRegistry> {
  const reg = fakeRegistry();

  servers.push(reg);

  const home = brydioHome(reg.url);

  made.push(home);
  expect(await publish(app('1.0.0'), { registry: reg.url, home, screenshots: false, out: () => {} })).toBe(0);
  expect(await trust(['tiny'], { registry: reg.url, home, repo: 'acme/tiny', workflow: 'publish.yml', out: () => {} })).toBe(0);
  reg.idTokens.set('github-id-token', { repo: 'acme/tiny', workflow: 'acme/tiny/.github/workflows/publish.yml@refs/tags/v1.1.0', commit: 'abc123def4567890' });

  return reg;
}

const actions = (tokenUrl: string | null, over: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'acme/tiny',
  GITHUB_WORKFLOW_REF: 'acme/tiny/.github/workflows/publish.yml@refs/tags/v1.1.0',
  GITHUB_SHA: 'abc123def4567890',
  GITHUB_REF_TYPE: 'tag',
  GITHUB_REF_NAME: 'v1.1.0',
  ...(tokenUrl ? { ACTIONS_ID_TOKEN_REQUEST_URL: tokenUrl, ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'job-request-token' } : {}),
  ...over,
});

async function ciPublish(reg: FakeRegistry, env: NodeJS.ProcessEnv, version = '1.1.0') {
  const lines: string[] = [];
  // A runner: no ~/.brydio login at all.
  const home = brydioHome(null);

  made.push(home);

  const code = await publish(app(version), { registry: reg.url, home, env, screenshots: false, out: line => lines.push(line) });

  return { code, text: lines.join('\n') };
}

describe('brydio publish in GitHub Actions (PB05)', () => {
  test('trades GitHub’s OIDC token for a short publish token, publishes, and records where it was built', async () => {
    const reg = await trusted();
    const gh = github('github-id-token');
    const { code, text } = await ciPublish(reg, actions(gh.url));

    expect(code).toBe(0);
    expect(gh.asked).toEqual([{ audience: 'brydio-registry', authorization: 'Bearer job-request-token' }]);
    expect(reg.received.filter(one => one.path === '/v1/oidc/exchange').map(one => one.body)).toEqual([{ idToken: 'github-id-token', app: 'tiny' }]);

    const upload = reg.received.filter(one => one.method === 'POST' && one.path === '/v1/apps/tiny/versions').at(-1)!;

    expect(upload.authorization).toBe('Bearer bry_ci_1');
    expect(upload.body!.provenance).toEqual({ repo: 'acme/tiny', workflow: 'acme/tiny/.github/workflows/publish.yml@refs/tags/v1.1.0', commit: 'abc123def4567890' });
    expect(reg.apps.get('tiny')!.versions.at(-1)!.body.provenance).toMatchObject({ repo: 'acme/tiny', verified: true });
    expect(text).toContain('Signed in as GitHub Actions: acme/tiny, acme/tiny/.github/workflows/publish.yml@refs/tags/v1.1.0, abc123def456. A 15-minute token for tiny; no secret is stored.');
    expect(text).toContain(`Published tiny 1.1.0 to ${reg.url}.`);
    // The CI token only publishes: nothing else was asked with it.
    expect(reg.received.filter(one => one.authorization === 'Bearer bry_ci_1').map(one => `${one.method} ${one.path}`)).toEqual(['GET /v1/sdk', 'POST /v1/apps/tiny/versions']);
  });

  test('says to add id-token: write when the job can’t ask GitHub for a token', async () => {
    const reg = await trusted();
    const { code, text } = await ciPublish(reg, actions(null));

    expect(code).toBe(2);
    expect(text).toContain('Give the publish job permissions: id-token: write');
    expect(text).toContain('[oidc_unavailable]');
  });

  test('says how to link the workflow when the registry doesn’t trust it', async () => {
    const reg = await trusted();

    reg.idTokens.set('other-id-token', { repo: 'someone/fork', workflow: 'someone/fork/.github/workflows/publish.yml@refs/tags/v1.1.0', commit: 'f' });

    const { code, text } = await ciPublish(reg, actions(github('other-id-token').url, { GITHUB_REPOSITORY: 'someone/fork' }));

    expect(code).toBe(1);
    expect(text).toContain('does not trust this workflow to publish tiny');
    expect(text).toContain('[trust_mismatch]');
    expect(text).toContain('brydio trust tiny --repo someone/fork --workflow .github/workflows/publish.yml');
  });

  test('refuses a tag that is not the manifest’s version, before asking GitHub anything', async () => {
    const reg = await trusted();
    const gh = github('github-id-token');
    const { code, text } = await ciPublish(reg, actions(gh.url, { GITHUB_REF_NAME: 'v2.0.0' }));

    expect(code).toBe(2);
    expect(text).toContain('This run is for the tag v2.0.0, but the manifest says version 1.1.0.');
    expect(text).toContain('[tag_version_mismatch]');
    expect(gh.asked).toEqual([]);
  });

  test('says an app with no first version has to be published from a computer first', async () => {
    const reg = fakeRegistry();

    servers.push(reg);
    reg.idTokens.set('github-id-token', { repo: 'acme/tiny', workflow: 'acme/tiny/.github/workflows/publish.yml@refs/tags/v1.1.0', commit: 'c' });

    const { code, text } = await ciPublish(reg, actions(github('github-id-token').url));

    expect(code).toBe(1);
    expect(text).toContain('has no app called tiny. Publish its first version from your own computer');
  });

  test('says when GitHub gives no token, and when the registry can’t check it', async () => {
    const reg = await trusted();
    const refused = await ciPublish(reg, actions(github('x').url, { ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'wrong' }));

    expect(refused.text).toContain('GitHub did not give this job an OIDC token: GitHub answered 401.');

    const unchecked = await ciPublish(reg, actions(github('not-a-real-token').url));

    expect(unchecked.text).toContain("did not accept GitHub's OIDC token: That OIDC token could not be checked. [oidc_invalid]");
  });

  test('a logged-in runner still publishes as its login, not with OIDC', async () => {
    const reg = await trusted();
    const home = brydioHome(reg.url);

    made.push(home);

    const gh = github('github-id-token');
    const code = await publish(app('1.2.0'), { registry: reg.url, home, env: actions(gh.url, { GITHUB_REF_NAME: 'v1.2.0' }), screenshots: false, out: () => {} });

    expect(code).toBe(0);
    expect(gh.asked).toEqual([]);
  });
});

describe('brydio trust', () => {
  test('links a repository and workflow file to the app, as its publisher', async () => {
    const reg = await trusted();
    const sent = reg.received.find(one => one.method === 'PUT' && one.path === '/v1/apps/tiny/trust')!;

    expect(sent.body).toEqual({ provider: 'github', repo: 'acme/tiny', workflow: 'publish.yml' });
    expect(reg.apps.get('tiny')!.trust).toMatchObject({ repo: 'acme/tiny', workflow: 'publish.yml' });
  });

  test('refuses words that are not a repository and a workflow file, before asking anything', async () => {
    const reg = fakeRegistry();

    servers.push(reg);

    const home = brydioHome(reg.url);

    made.push(home);

    const say = async (words: string[], repo?: string, workflow?: string) => {
      const lines: string[] = [];
      const code = await trust(words, { registry: reg.url, home, ...(repo ? { repo } : {}), ...(workflow ? { workflow } : {}), out: line => lines.push(line) });

      return { code, text: lines.join('\n') };
    };

    expect(await say(['tiny'])).toMatchObject({ code: 2, text: expect.stringContaining('brydio trust <app> --repo <owner>/<name> --workflow publish.yml') });
    expect(await say(['tiny'], 'just-a-name', 'publish.yml')).toMatchObject({ code: 2, text: expect.stringContaining('Write it as owner/name.') });
    expect(await say(['tiny'], 'acme/tiny', 'publish.sh')).toMatchObject({ code: 2, text: expect.stringContaining('is not a workflow file') });
    expect(reg.received).toEqual([]);
    expect((await say(['nope'], 'acme/tiny', 'publish.yml')).text).toContain('There is no app called nope.');
  });
});

describe('the workflow brydio create writes (PB20)', () => {
  const parsed = (Bun as unknown as { YAML: { parse(text: string): any } }).YAML.parse(WORKFLOW);

  test('checks every push: build, validate, test', () => {
    expect(WORKFLOW_PATH).toBe('.github/workflows/brydio.yml');
    expect(parsed.on.push.branches).toEqual(['**']);
    expect(parsed.on.push.tags).toEqual(['v*']);
    expect(parsed.jobs.check.steps.map((step: { run?: string }) => step.run).filter(Boolean)).toEqual([
      'bun install --frozen-lockfile',
      'bunx brydio build',
      'bunx brydio validate',
      'bunx brydio test',
    ]);
  });

  test('publishes a version tag with OIDC and no secret', () => {
    expect(parsed.jobs.publish.if).toBe("startsWith(github.ref, 'refs/tags/v')");
    expect(parsed.jobs.publish.needs).toBe('check');
    expect(parsed.jobs.publish.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    expect(parsed.jobs.publish.steps.at(-1).run).toBe('bunx brydio publish');
    expect(WORKFLOW).not.toMatch(/secrets\.|BRYDIO_TOKEN|NPM_TOKEN|env:/);
    expect(parsed.permissions).toEqual({ contents: 'read' });
  });

  test('the brydio trust line it tells you to run is the command that exists', () => {
    expect(WORKFLOW).toContain('brydio trust <app> --repo <owner>/<name> --workflow brydio.yml');
  });

  test('is written into a new app', async () => {
    const { create } = await import('../src/index.ts');
    const into = mkdtempSync(join(tmpdir(), 'brydio-oidc-create-'));

    made.push(into);

    const dir = await create('ci-app', { into, template: 'plain', install: false, out: () => {} });

    expect(existsSync(join(dir, WORKFLOW_PATH))).toBe(true);
    expect(readFileSync(join(dir, WORKFLOW_PATH), 'utf8')).toBe(WORKFLOW);
  });
});
