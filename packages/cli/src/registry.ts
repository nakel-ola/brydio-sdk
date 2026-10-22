import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * The app registry, and how this computer is signed in to it (PB03).
 *
 * Every command that sends anything over the network talks to the registry
 * and to nothing else: it holds app versions, tags, access and publishers,
 * and it cannot reach a workspace. Brydio's own backend pulls from it on its
 * private network; no developer ever has its address.
 *
 * The address is, in order: `--registry`, `BRYDIO_REGISTRY_URL`, the registry
 * this computer last logged in to, and `https://registry.brydio.com`. The
 * contract is `tasks/app-publishing/registry-contract.md` in Brydio.
 *
 * `brydio login` keeps one token per registry in `~/.brydio/registry.json`,
 * readable by its owner alone. A token can publish, tag, deprecate, change
 * access and manage keys for the publishers its account belongs to. It can
 * do nothing in any workspace.
 */

export const DEFAULT_REGISTRY = 'https://registry.brydio.com';
export const REGISTRY_URL_ENV = 'BRYDIO_REGISTRY_URL';
/** Where `~/.brydio` is, for a test or a second account. */
export const BRYDIO_HOME_ENV = 'BRYDIO_HOME';
export const LOGIN_FILE = 'registry.json';

export interface RegistryUser {
  id: string;
  name: string;
}

interface Login {
  token: string;
  user: RegistryUser;
  savedAt: string;
}

/** What `~/.brydio/registry.json` holds. */
export interface LoginFile {
  /** The registry the last `brydio login` was to; commands use it unless told another. */
  current?: string;
  logins: Record<string, Login>;
}

export interface RegistryOptions {
  /** The registry's address, over `BRYDIO_REGISTRY_URL` and the last login. */
  registry?: string;
  /** A token to use instead of the one kept for the registry. */
  token?: string;
  /** Where `registry.json` lives, instead of `BRYDIO_HOME` or `~/.brydio`. */
  home?: string;
  out?: (line: string) => void;
  /** For tests: the requests, made some other way. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
}

/** A reason a registry command can't go on, in words for the person running it. `code` is the exit code. */
export class RegistryRefused extends Error {
  constructor(
    message: string,
    readonly code: 1 | 2 = 1,
  ) {
    super(message);
    this.name = 'RegistryRefused';
  }
}

export function brydioHome(options: { home?: string } = {}, env: NodeJS.ProcessEnv = process.env): string {
  return resolve(options.home ?? env[BRYDIO_HOME_ENV] ?? join(homedir(), '.brydio'));
}

const loginPath = (options: { home?: string }) => join(brydioHome(options), LOGIN_FILE);

/** The logins kept here. A missing file is no logins; a file other accounts can read is refused. */
export function readLogins(options: { home?: string } = {}): LoginFile {
  const path = loginPath(options);

  if (!existsSync(path)) return { logins: {} };

  if (process.platform !== 'win32' && (statSync(path).mode & 0o077) !== 0) {
    throw new RegistryRefused(`${path} can be read by other accounts on this computer. Run chmod 600 ${path}, then brydio logout and brydio login again, since the token in it may have been read.`, 2);
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<LoginFile>;

    return { ...(typeof parsed.current === 'string' ? { current: parsed.current } : {}), logins: parsed.logins && typeof parsed.logins === 'object' ? parsed.logins : {} };
  } catch {
    throw new RegistryRefused(`${path} is not a login file this can read. Delete it and run brydio login again.`, 2);
  }
}

/** Writes the logins, readable by their owner alone, in a folder only they can open. */
export function writeLogins(file: LoginFile, options: { home?: string } = {}): void {
  const path = loginPath(options);

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });

  // Under a temporary name and moved, so a half-written file is never read.
  const temporary = `${path}.part`;

  writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

/** An address as it is kept and compared: no trailing slash, no `/v1`. */
export function normalRegistry(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}

/** Which registry a command talks to. */
export function registryOf(options: RegistryOptions = {}, env: NodeJS.ProcessEnv = process.env): string {
  const named = options.registry ?? env[REGISTRY_URL_ENV] ?? readLogins(options).current ?? DEFAULT_REGISTRY;
  const registry = normalRegistry(named);

  if (!/^https?:\/\/[^/]/.test(registry)) {
    throw new RegistryRefused(`"${named}" is not a registry address. Give one like ${DEFAULT_REGISTRY} or http://localhost:4300.`, 2);
  }

  return registry;
}

/** One answer from the registry: its status, and its JSON body when it had one. */
export interface Answer<T = unknown> {
  status: number;
  body: T;
}

/** Requests to one registry, with or without the token kept for it. */
export interface Registry {
  url: string;
  /** The token sent, when there is one. */
  token: string | null;
  user: RegistryUser | null;
  send<T = Record<string, unknown> | null>(method: string, path: string, body?: unknown): Promise<Answer<T>>;
}

/**
 * The registry a command talks to, with the token kept for it. `signedIn`
 * refuses here, before anything is built or sent, when there is no login.
 */
export function registry(options: RegistryOptions = {}, need: 'signedIn' | 'either' = 'either'): Registry {
  const url = registryOf(options);
  const login = readLogins(options).logins[url];
  const token = options.token ?? login?.token ?? null;

  if (need === 'signedIn' && !token) {
    throw new RegistryRefused(`This computer is not logged in to ${url}. Run brydio login${url === DEFAULT_REGISTRY ? '' : ` --registry ${url}`} first.`, 2);
  }

  const request = options.fetch ?? fetch;

  return {
    url,
    token,
    user: login?.user ?? null,
    async send<T>(method: string, path: string, body?: unknown): Promise<Answer<T>> {
      let answer: Response;

      try {
        answer = await request(`${url}${path}`, {
          method,
          headers: {
            accept: 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (error) {
        throw new RegistryRefused(`Could not reach the registry at ${url}: ${error instanceof Error ? error.message : String(error)}`);
      }

      const text = await answer.text().catch(() => '');
      let parsed: unknown = null;

      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }

      return { status: answer.status, body: parsed as T };
    },
  };
}

/** A refusal's code and sentence, as the registry writes them: `{ code, message, at? }`. */
export function refusalOf(body: unknown): { code: string | null; message: string | null; at: string | null } {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  return {
    code: typeof record.code === 'string' ? record.code : null,
    message: typeof record.message === 'string' ? record.message : Array.isArray(record.message) ? record.message.join(' ') : null,
    at: typeof record.at === 'string' ? record.at : null,
  };
}

/**
 * What to say when the registry turns a request away, for the statuses every
 * route shares. A route's own refusals (`version_exists`, `retired`) are
 * worded by the command that sent it, before it falls back to this.
 */
export function turnedAway(answer: Answer, reg: Registry): string {
  const { code, message, at } = refusalOf(answer.body);
  const tail = `${code ? ` [${code}]` : ''}`;

  switch (answer.status) {
    case 401:
      return reg.token
        ? `${reg.url} did not accept this computer's login: it was revoked or has run out. Run brydio login${reg.url === DEFAULT_REGISTRY ? '' : ` --registry ${reg.url}`} again.`
        : `${reg.url} needs you logged in for that. Run brydio login${reg.url === DEFAULT_REGISTRY ? '' : ` --registry ${reg.url}`} first.`;
    case 403:
      return `The registry refused this: ${message ?? 'this account may not do that.'}${tail}`;
    case 404:
      return message ? `The registry has no such thing: ${message}${tail}` : `${reg.url} answered 404. Is that a Brydio app registry, and is it up to date?`;
    case 423:
      return `${message ?? 'That app is retired, so nothing about it can change.'}${tail}`;
    default:
      return `The registry answered ${answer.status}${at ? ` at ${at}` : ''}: ${message ?? 'something went wrong.'}${tail}`;
  }
}

/** The answer's body, when the status is one of `ok`; otherwise a refusal in words. */
export function bodyOf<T>(answer: Answer, reg: Registry, ok: number[] = [200, 201, 204]): T {
  if (ok.includes(answer.status)) return answer.body as T;

  throw new RegistryRefused(turnedAway(answer, reg));
}

/** `tasks@1.4.0` into its app and its version, both required. */
export function appAndVersion(word: string | undefined, usage: string): { app: string; version: string } {
  const at = (word ?? '').lastIndexOf('@');

  if (!word || at <= 0 || at === word.length - 1) throw new RegistryRefused(`Say which version: ${usage}`, 2);

  return { app: word.slice(0, at), version: word.slice(at + 1) };
}

export const path = {
  loginStart: '/v1/login/start',
  loginPoll: '/v1/login/poll',
  logout: '/v1/logout',
  me: '/v1/me',
  publishers: '/v1/publishers',
  sdk: '/v1/sdk',
  app: (key: string) => `/v1/apps/${encodeURIComponent(key)}`,
  versions: (key: string) => `/v1/apps/${encodeURIComponent(key)}/versions`,
  version: (key: string, version: string) => `/v1/apps/${encodeURIComponent(key)}/versions/${encodeURIComponent(version)}`,
  tag: (key: string, tag: string) => `/v1/apps/${encodeURIComponent(key)}/tags/${encodeURIComponent(tag)}`,
  keys: (publisher: string) => `/v1/publishers/${encodeURIComponent(publisher)}/keys`,
};

/** What `GET /v1/me` answers. */
export interface Me {
  user: RegistryUser;
  publishers: { id: string; name: string; role: string }[];
}

/** What `GET /v1/apps/:key` answers. */
export interface RegistryApp {
  key: string;
  publisher: string;
  access: 'workspace' | 'public';
  retired: boolean;
  tags: Record<string, string>;
  versions: { version: string; state: string; publishedAt: string; deprecated?: string | null }[];
}

/** Which of the account's publishers is meant: the one named by id or name, or the only one. */
export function choosePublisher(me: Me, named: string | undefined, why: string): Me['publishers'][number] {
  const list = me.publishers.map(one => `${one.name} (${one.id})`).join(', ');

  if (!me.publishers.length) {
    throw new RegistryRefused(`${me.user.name} is not in any publisher. Make one with brydio publishers create "<name>", or ask a publisher's owner to add you.`);
  }

  if (named) {
    const found = me.publishers.find(one => one.id === named || one.name.toLowerCase() === named.toLowerCase());

    if (!found) throw new RegistryRefused(`${me.user.name} is not in a publisher called "${named}". They are in ${list}.`);

    return found;
  }

  if (me.publishers.length > 1) throw new RegistryRefused(`${me.user.name} is in more than one publisher. Say which ${why} with --publisher: ${list}.`, 2);

  return me.publishers[0]!;
}
