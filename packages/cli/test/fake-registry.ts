import { bundleHash, compareVersions } from '@brydio/manifest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

import { writeLogins } from '../src/registry.ts';

/**
 * A pretend app registry, over real HTTP on a free local port, that answers
 * the way `tasks/app-publishing/registry-contract.md` (v1) says the real one
 * does. The CLI's tests run against it: every request goes through `fetch`,
 * the URL, the method, the headers and the JSON, as it will in production.
 *
 * It keeps what it is sent, so a test can say what reached it and what never
 * did, and `refuseNext` makes one route answer a refusal of the test's choosing.
 */

export interface FakeUser {
  id: string;
  name: string;
}

export interface FakeVersion {
  version: string;
  fingerprint: string;
  sdk: string;
  manifest: Record<string, unknown>;
  state: 'live' | 'pending';
  deprecated?: string;
  publishedAt: string;
  tag: string;
  body: Record<string, unknown>;
}

export interface FakeApp {
  key: string;
  publisher: string;
  access: 'workspace' | 'public';
  retired: boolean;
  tags: Record<string, string>;
  history: Record<string, { version: string; movedBy: string; movedAt: string }[]>;
  versions: FakeVersion[];
  trust?: { repo: string; workflow: string; setBy: string };
}

export interface FakeKey {
  id: string;
  label: string;
  publicKey: string;
  state: 'active' | 'retired' | 'revoked';
  allowedBy: string;
  createdAt: string;
}

export interface Received {
  method: string;
  path: string;
  authorization: string | null;
  body: Record<string, unknown> | null;
}

export const ADA: FakeUser = { id: 'user_ada', name: 'Ada' };
export const ADA_TOKEN = 'bry_reg_ada';

/** The files of a zip, read the simple way `zipFiles` writes them: local headers, deflate, no descriptors. */
export function unzip(archive: Uint8Array): Map<string, Uint8Array> {
  const view = Buffer.from(archive);
  const files = new Map<string, Uint8Array>();
  let at = 0;

  while (view.readUInt32LE(at) === 0x04034b50) {
    const method = view.readUInt16LE(at + 8);
    const size = view.readUInt32LE(at + 18);
    const nameLength = view.readUInt16LE(at + 26);
    const extra = view.readUInt16LE(at + 28);
    const name = view.subarray(at + 30, at + 30 + nameLength).toString('utf8');
    const start = at + 30 + nameLength + extra;
    const data = view.subarray(start, start + size);

    files.set(name, new Uint8Array(method === 8 ? inflateRawSync(data) : data));
    at = start + size;
  }

  return files;
}

export function fakeRegistry(
  options: {
    users?: Record<string, FakeUser>;
    publishers?: { id: string; name: string; members: string[] }[];
    sdk?: { minimum: string; upcoming?: { minimum: string; from: string } } | null;
    /** What each `login/poll` answers in turn; the last is repeated. */
    login?: ('pending' | 'approved' | 'expired' | 'denied')[];
  } = {},
) {
  const users: Record<string, FakeUser> = { ...(options.users ?? { [ADA_TOKEN]: ADA }) };
  const publishers = options.publishers ?? [{ id: 'pub_acme', name: 'Acme Ltd', members: [ADA.id] }];
  const apps = new Map<string, FakeApp>();
  const keys = new Map<string, FakeKey[]>();
  const received: Received[] = [];
  const refusals: { method: string; path: RegExp; status: number; body: unknown }[] = [];
  const ciTokens = new Map<string, { app: string; userId: string; provenance: Record<string, unknown> }>();
  /** GitHub OIDC tokens this registry would verify, and the claims they carry. */
  const idTokens = new Map<string, { repo: string; workflow: string; commit: string }>();
  const logins = [...(options.login ?? ['pending', 'approved'])];
  let sdk = options.sdk === undefined ? { minimum: '0.0.0' } : options.sdk;
  let polls = 0;
  let clock = 0;
  const now = () => new Date(Date.UTC(2026, 9, 22, 12, 0, clock++)).toISOString();
  const json = (body: unknown, status = 200) => (status === 204 ? new Response(null, { status }) : Response.json(body, { status }));
  const refuse = (status: number, code: string, message: string, at?: string) => json({ code, message, ...(at ? { at } : {}) }, status);

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const text = await request.text();
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    const authorization = request.headers.get('authorization');

    received.push({ method, path, authorization, body });

    const planned = refusals.findIndex(one => one.method === method && one.path.test(path));

    if (planned >= 0) {
      const [one] = refusals.splice(planned, 1);

      return json(one!.body, one!.status);
    }

    const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const ci = ciTokens.get(bearer);

    if (method === 'POST' && path === '/v1/oidc/exchange') {
      const app = apps.get(String(body?.app ?? ''));
      const claims = idTokens.get(String(body?.idToken ?? ''));

      if (!claims) return refuse(401, 'oidc_invalid', 'That OIDC token could not be checked.');
      if (!app) return refuse(404, 'not_found', 'That isn’t in the registry.');
      if (!app.trust) return refuse(403, 'not_trusted', `${app.key} trusts no workflow.`);
      if (app.trust.repo !== claims.repo || !claims.workflow.startsWith(`${app.trust.repo}/.github/workflows/${app.trust.workflow}@`)) {
        return refuse(403, 'trust_mismatch', 'This repository or workflow is not the one the app trusts.');
      }

      const token = `bry_ci_${ciTokens.size + 1}`;

      ciTokens.set(token, { app: app.key, userId: app.trust.setBy, provenance: { ...claims, verified: true } });

      return json({ token, expiresIn: 900 });
    }

    // A CI token publishes its own app and does nothing else (registry-contract.md, as built).
    if (ci && !(method === 'POST' && path === `/v1/apps/${encodeURIComponent(ci.app)}/versions`)) {
      if (method === 'GET' && path === '/v1/sdk') {
        // Anyone may read the minimum.
      } else return refuse(403, 'ci_token_not_allowed', 'A CI token can only publish its own app.');
    }

    const user = ci ? Object.values(users).find(one => one.id === ci.userId) ?? { id: ci.userId, name: ci.userId } : bearer ? users[bearer] : undefined;
    const signedIn = () => (user ? null : refuse(401, 'unauthorized', 'Log in first.'));
    const mine = () => publishers.filter(one => one.members.includes(user!.id));
    let match: RegExpExecArray | null;

    if (method === 'POST' && path === '/v1/login/start') {
      return json({ code: 'WXYZ-1234', verifyUrl: `${url.origin}/login?code=WXYZ-1234`, pollToken: 'poll_1', expiresIn: 600 });
    }

    if (method === 'POST' && path === '/v1/login/poll') {
      if (body?.pollToken !== 'poll_1') return refuse(400, 'poll_token_unknown', 'That is not a sign-in this registry started.');

      const answer = logins[Math.min(polls++, logins.length - 1)];

      if (answer === 'pending') return refuse(428, 'pending', 'Not signed in yet.');
      if (answer === 'expired') return refuse(410, 'expired', 'The code ran out.');
      if (answer === 'denied') return refuse(403, 'denied', 'The sign-in was turned down.');

      return json({ token: ADA_TOKEN, user: ADA });
    }

    if (method === 'GET' && path === '/v1/sdk') return sdk ? json(sdk) : refuse(404, 'not_found', '');

    if (method === 'POST' && path === '/v1/logout') return signedIn() ?? (delete users[authorization!.slice(7)], json(null, 204));

    if (method === 'GET' && path === '/v1/me') {
      return signedIn() ?? json({ user, publishers: mine().map(one => ({ id: one.id, name: one.name, role: 'owner' })) });
    }

    if (method === 'POST' && path === '/v1/publishers') {
      const name = String(body?.name ?? '');

      if (name.toLowerCase() === 'brydio') return refuse(422, 'publisher_name_reserved', 'Brydio is reserved.');
      if (publishers.some(one => one.name.toLowerCase() === name.toLowerCase())) return refuse(409, 'publisher_name_taken', `${name} is taken.`);

      return (
        signedIn() ??
        (() => {
          const made = { id: `pub_${publishers.length + 1}`, name, members: [user!.id] };

          publishers.push(made);

          return json({ id: made.id, name }, 201);
        })()
      );
    }

    if ((match = /^\/v1\/publishers\/([^/]+)$/.exec(path)) && method === 'GET') {
      const found = publishers.find(one => one.id === decodeURIComponent(match![1]!));

      return found ? json({ id: found.id, name: found.name, members: found.members.map(userId => ({ userId, role: 'owner' })), workspaces: [] }) : refuse(404, 'not_found', 'No such publisher.');
    }

    if ((match = /^\/v1\/publishers\/([^/]+)\/keys(?:\/([^/]+)\/(retire|revoke))?$/.exec(path))) {
      const refused = signedIn();

      if (refused) return refused;

      const id = decodeURIComponent(match[1]!);

      if (!mine().some(one => one.id === id)) return refuse(403, 'not_publisher', 'You are not in that publisher.');

      const list = keys.get(id) ?? [];

      keys.set(id, list);

      if (method === 'GET') return json(list);

      if (match[2]) {
        const key = list.find(one => one.id === decodeURIComponent(match![2]!));

        if (!key) return refuse(404, 'key_not_found', 'There is no such key.');

        key.state = match[3] === 'retire' ? 'retired' : 'revoked';

        return json(key);
      }

      if (list.some(one => one.state === 'active') && !body?.approvedBy && !body?.override) {
        return refuse(422, 'key_approval_required', 'A second key needs an existing key’s approval.');
      }

      const key: FakeKey = {
        id: `key_${list.length + 1}`,
        label: String(body?.label ?? ''),
        publicKey: String(body?.publicKey ?? ''),
        state: 'active',
        allowedBy: body?.approvedBy ? `approved:${(body.approvedBy as { keyId: string }).keyId}` : 'first',
        createdAt: now(),
      };

      list.push(key);

      return json(key, 201);
    }

    if ((match = /^\/v1\/apps\/([^/]+)(\/.*)?$/.exec(path))) {
      const key = decodeURIComponent(match[1]!);
      const rest = match[2] ?? '';
      const app = apps.get(key);
      const owns = () => Boolean(app && mine().some(one => one.id === app.publisher));

      if (method === 'GET' && rest === '') {
        if (!app) return refuse(404, 'app_not_found', `There is no app called ${key}.`);

        return json({
          key,
          // As built: `{ id, name }` (registry-contract.md change log, 22 Oct).
          publisher: { id: app.publisher, name: publishers.find(one => one.id === app.publisher)?.name ?? app.publisher },
          access: app.access,
          retired: app.retired,
          tags: app.tags,
          versions: app.versions.map(one => ({ version: one.version, state: one.state, publishedAt: one.publishedAt, ...(one.deprecated ? { deprecated: one.deprecated } : {}) })),
        });
      }

      if ((match = /^\/versions\/([^/]+)$/.exec(rest)) && method === 'GET') {
        const found = app?.versions.find(one => one.version === decodeURIComponent(match![1]!));

        return found ? json({ version: found.version, fingerprint: found.fingerprint, sdk: found.sdk, manifest: found.manifest, state: found.state, publishedAt: found.publishedAt }) : refuse(404, 'version_not_found', `${key} has no such version.`);
      }

      if ((match = /^\/tags\/([^/]+)\/history$/.exec(rest)) && method === 'GET') {
        return app ? json(app.history[decodeURIComponent(match[1]!)] ?? []) : refuse(404, 'app_not_found', `There is no app called ${key}.`);
      }

      const refused = signedIn();

      if (refused) return refused;

      if (rest === '/versions' && method === 'POST') {
        const files = unzip(new Uint8Array(Buffer.from(String(body?.archiveBase64 ?? ''), 'base64')));
        const manifest = JSON.parse(new TextDecoder().decode(files.get('app.json')!)) as Record<string, unknown>;
        const version = String(manifest.version);
        const fingerprint = bundleHash(files);
        const tag = typeof body?.tag === 'string' ? body.tag : 'latest';

        if (manifest.name !== key) return refuse(422, 'manifest_name_mismatch', `The bundle is ${String(manifest.name)}, not ${key}.`, 'name');

        if (app && !owns()) return refuse(403, 'not_publisher', `${key} is published by another publisher.`);

        if (app?.retired) return refuse(423, 'retired', `${key} is retired.`);

        if (sdk && compareVersions(String(manifest.sdk), sdk.minimum) < 0) return refuse(422, 'sdk_below_minimum', `Built with SDK ${String(manifest.sdk)}, below ${sdk.minimum}.`, 'sdk');

        const same = app?.versions.find(one => one.version === version);

        if (same) {
          if (same.fingerprint !== fingerprint) return refuse(409, 'version_exists', `${key} ${version} is already published with fingerprint ${same.fingerprint}.`);

          return json({ key, version, fingerprint, sdk: same.sdk, tag: same.tag, access: app!.access, state: same.state }, 200);
        }

        if (app && app.versions.some(one => compareVersions(one.version, version) > 0)) return refuse(409, 'version_lower', `${version} is below the highest published.`);

        let target = app;

        if (!target) {
          const publisher = typeof body?.publisher === 'string' ? body.publisher : mine().length === 1 ? mine()[0]!.id : null;

          if (!publisher || !mine().some(one => one.id === publisher)) return refuse(403, 'not_publisher', 'Say which of your publishers this app belongs to.');

          target = { key, publisher, access: 'workspace', retired: false, tags: {}, history: {}, versions: [] };
          apps.set(key, target);
        }

        if (body?.access === 'workspace' || body?.access === 'public') target.access = body.access;

        const published: FakeVersion = {
          version,
          fingerprint,
          sdk: String(manifest.sdk),
          manifest,
          state: target.access === 'public' ? 'pending' : 'live',
          publishedAt: now(),
          tag,
          body: { ...body!, ...(ci ? { provenance: ci.provenance } : {}) },
        };

        target.versions.push(published);
        target.tags[tag] = version;
        (target.history[tag] ??= []).push({ version, movedBy: user!.id, movedAt: published.publishedAt });

        return json({ key, version, fingerprint, sdk: published.sdk, tag, access: target.access, state: published.state }, 201);
      }

      if (!app) return refuse(404, 'app_not_found', `There is no app called ${key}.`);

      if (!owns()) return refuse(403, 'not_publisher', `${key} is published by another publisher.`);

      if ((match = /^\/tags\/([^/]+)$/.exec(rest)) && method === 'PUT') {
        const tag = decodeURIComponent(match[1]!);
        const version = String(body?.version ?? '');

        if (app.retired) return refuse(423, 'retired', `${key} is retired.`);
        if (!app.versions.some(one => one.version === version)) return refuse(404, 'version_not_found', `${key} has no version ${version}.`);

        app.tags[tag] = version;
        (app.history[tag] ??= []).push({ version, movedBy: user!.id, movedAt: now() });

        return json({ tag, version });
      }

      if ((match = /^\/versions\/([^/]+)\/deprecation$/.exec(rest)) && method === 'PUT') {
        const found = app.versions.find(one => one.version === decodeURIComponent(match![1]!));

        if (!found) return refuse(404, 'version_not_found', `${key} has no version ${decodeURIComponent(match[1]!)}.`);

        if (body?.message === null) delete found.deprecated;
        else found.deprecated = String(body?.message);

        return json({ version: found.version, deprecated: found.deprecated ?? null });
      }

      if (rest === '/access' && method === 'PUT') {
        app.access = body?.access as FakeApp['access'];

        return json({ key, access: app.access });
      }

      if (rest === '/trust' && method === 'PUT') {
        app.trust = { repo: String(body?.repo), workflow: String(body?.workflow).replace(/^\.github\/workflows\//, ''), setBy: user!.id };

        return json({ key, trust: { provider: 'github', repo: app.trust.repo, workflow: app.trust.workflow } });
      }

      if (rest === '/retire' && method === 'POST') {
        app.retired = true;

        return json({ key, retired: true });
      }
    }

    return refuse(404, 'not_found', '');
  };

  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: handle });

  return {
    url: `http://127.0.0.1:${server.port}`,
    apps,
    keys,
    publishers,
    users,
    received,
    idTokens,
    /** The requests that were not reads: what changed something, or tried to. */
    writes: () => received.filter(one => one.method !== 'GET'),
    setSdk(next: typeof sdk) {
      sdk = next;
    },
    /** The next request matching answers this instead. */
    refuseNext(method: string, path: RegExp, status: number, body: unknown) {
      refusals.push({ method, path, status, body });
    },
    stop: () => server.stop(true),
  };
}

export type FakeRegistry = ReturnType<typeof fakeRegistry>;

/** A fresh `~/.brydio` for a test, logged in to `url` as Ada unless `token` is null. */
export function brydioHome(url: string | null, token: string | null = ADA_TOKEN): string {
  const home = mkdtempSync(join(tmpdir(), 'brydio-home-'));

  if (url && token) writeLogins({ current: url, logins: { [url]: { token, user: ADA, savedAt: 'then' } } }, { home });

  return home;
}
