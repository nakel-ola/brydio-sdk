import { generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { API_URL_ENV, TOKEN_ENV } from './api.ts';

/**
 * `brydio keys`: a publisher's signing keys, from the machine that holds
 * them (A7-F05-S03).
 *
 * The private half is made here and stays here. What goes to Brydio is the
 * 32-byte public key, and later a signature; the routes are Hodler's
 * `GET/POST /api/v1/apps/publisher-accounts/:id/keys` and
 * `POST …/keys/:keyId/retire|revoke`.
 *
 * The private key is written to one file, readable by its owner alone, kept
 * outside any checkout, and never printed — not by `keys list`, not by a
 * failure, not by `publish`. Losing it costs a rotation (`keys retire`, then
 * `keys create`); leaking it is what signing exists to prevent.
 *
 * A publisher's second key needs its first key's approval, signed here with
 * `--approve-with`, because an owner's account alone is not meant to be
 * enough to add a key nobody expected.
 */

export const SIGNING_KEY_ENV = 'BRYDIO_SIGNING_KEY';
/** Where key files are kept, unless `--out` says otherwise. */
export const KEYS_HOME_ENV = 'BRYDIO_KEYS_HOME';
export const PUBLISHERS_PATH = '/api/v1/apps/publisher-accounts/mine';
export const KEYS_PATH = (publisherId: string) => `/api/v1/apps/publisher-accounts/${encodeURIComponent(publisherId)}/keys`;
export const KEY_APPROVAL_VERSION = 'brydio-key-v1';

/** What one key file holds. The only copy of `privateKey` anywhere. */
export interface KeyFile {
  keyId: string;
  publisherId: string;
  /** The publisher's name when the key was made, to say which is which. */
  publisher: string;
  publicKey: string;
  /** Ed25519, PKCS#8 PEM. Never sent, never printed. */
  privateKey: string;
  label: string;
  createdAt: string;
}

/** A key as Brydio has it. */
export interface RemoteKey {
  id: string;
  label: string;
  publicKey: string;
  state: 'active' | 'retired' | 'revoked';
  allowedBy: string;
  createdAt: string;
}

interface Publisher {
  id: string;
  name: string;
  role: 'owner' | 'member';
}

export interface KeysOptions {
  apiUrl?: string;
  token?: string;
  out?: (line: string) => void;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** Where key files live, instead of `BRYDIO_KEYS_HOME` or `~/.brydio/keys`. */
  home?: string;
  publisher?: string;
  label?: string;
  /** Where to write the new key file, instead of the folder above. */
  outFile?: string;
  /** An existing key file of the same publisher, which signs the new key in. */
  approveWith?: string;
  override?: boolean;
  /** `keys revoke` does not ask twice, so it wants this. */
  yes?: boolean;
}

export class KeysRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeysRefused';
  }
}

/** The folder key files are kept in. Not inside a checkout, so a key is never committed. */
export function keysHome(options: KeysOptions = {}, env: NodeJS.ProcessEnv = process.env): string {
  return resolve(options.home ?? env[KEYS_HOME_ENV] ?? join(homedir(), '.brydio', 'keys'));
}

/**
 * Whether a path sits in a git checkout, walking up for `.git`. A key file
 * there is one `git add .` from being published, so `keys create` refuses it.
 */
export function inCheckout(path: string): string | null {
  let at = dirname(resolve(path));

  for (;;) {
    if (existsSync(join(at, '.git'))) return at;

    const up = dirname(at);

    if (up === at) return null;

    at = up;
  }
}

/** Reads a key file, refusing one anybody but its owner can read. */
export function readKeyFile(path: string): KeyFile {
  const full = resolve(path);
  let stat;

  try {
    stat = statSync(full);
  } catch {
    throw new KeysRefused(`There is no key file at ${full}. Make one with brydio keys create.`);
  }

  // A key another account can read is a key that has to be rotated, not used.
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    throw new KeysRefused(`${full} can be read by other accounts on this computer. Run chmod 600 ${full}, or retire the key and make another.`);
  }

  let parsed: Partial<KeyFile>;

  try {
    parsed = JSON.parse(readFileSync(full, 'utf8')) as Partial<KeyFile>;
  } catch {
    throw new KeysRefused(`${full} is not a key file this can read.`);
  }

  for (const field of ['keyId', 'publisherId', 'publicKey', 'privateKey'] as const) {
    if (typeof parsed[field] !== 'string' || !parsed[field]) {
      throw new KeysRefused(`${full} is missing ${field}, so it is not a key file.`);
    }
  }

  return {
    keyId: parsed.keyId!,
    publisherId: parsed.publisherId!,
    publisher: parsed.publisher ?? parsed.publisherId!,
    publicKey: parsed.publicKey!,
    privateKey: parsed.privateKey!,
    label: parsed.label ?? 'Signing key',
    createdAt: parsed.createdAt ?? '',
  };
}

/** Writes a key file its owner alone can read, in a folder only they can open. */
export function writeKeyFile(path: string, file: KeyFile): void {
  const full = resolve(path);

  mkdirSync(dirname(full), { recursive: true, mode: 0o700 });
  // Written under a temporary name and moved, so a half-written key file is
  // never left where `publish` would pick it up.
  const temporary = `${full}.part`;

  writeFileSync(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, full);
  chmodSync(full, 0o600);
}

/** Every key file in a folder, quietly skipping anything that is not one. */
export function heldKeys(home: string): KeyFile[] {
  let names: string[];

  try {
    names = readdirSync(home);
  } catch {
    return [];
  }

  const held: KeyFile[] = [];

  for (const name of names.filter(one => one.endsWith('.json')).sort()) {
    try {
      held.push(readKeyFile(join(home, name)));
    } catch {
      // A file this cannot read is not a key of ours to list.
    }
  }

  return held;
}

/**
 * The key file `publish` should sign with: the one named, else the one
 * `BRYDIO_SIGNING_KEY` names, else nothing (Phase 0 publishing is unsigned).
 * `BRYDIO_SIGNING_KEY` is a path, never the key itself, so the private half
 * is not sitting in an environment a child process or a log can read.
 */
export function signingKeyPath(named?: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const path = named ?? env[SIGNING_KEY_ENV] ?? '';

  if (!path) return null;

  if (path.includes('BEGIN ') && path.includes('PRIVATE KEY')) {
    throw new KeysRefused(`${SIGNING_KEY_ENV} is a path to a key file made by brydio keys create, not the key itself. A private key in an environment variable is readable by everything this runs.`);
  }

  return resolve(path);
}

/** What an existing key signs to let a new one in, the bytes Brydio checks. */
export function keyApprovalMessage(publisherId: string, publicKey: string): Buffer {
  return Buffer.from([KEY_APPROVAL_VERSION, publisherId, publicKey].join('\n'), 'utf8');
}

/** This publisher's approval of a new public key, base64, signed with a key held here. */
export function approveKey(approver: KeyFile, publicKey: string): string {
  return sign(null, keyApprovalMessage(approver.publisherId, publicKey), approver.privateKey).toString('base64');
}

/** A new Ed25519 pair: the public half base64 as Brydio stores it, the private half PEM. */
export function newKeyPair(): { publicKey: string; privateKey: string } {
  const pair = generateKeyPairSync('ed25519');

  return {
    // The last 32 bytes of the SPKI encoding are the key itself.
    publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64'),
    privateKey: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
  };
}

/** Runs one `brydio keys …` command. Answers an exit code, like the others. */
export async function keys(words: string[], options: KeysOptions = {}): Promise<number> {
  const out = options.out ?? console.log;
  const [command, ...rest] = words;

  try {
    const call = await caller(options);

    switch (command) {
      case 'create':
        return await create(call, options, out);
      case 'list':
        return await list(call, options, out);
      case 'retire':
        return await change(call, options, out, 'retire', rest[0]);
      case 'revoke':
        return await change(call, options, out, 'revoke', rest[0]);
      default:
        out(command ? `There is no "keys ${command}" command. There is create, list, retire and revoke.` : 'Say what to do: brydio keys create, list, retire or revoke.');

        return 2;
    }
  } catch (error) {
    if (!(error instanceof KeysRefused)) throw error;

    out(error.message);

    return error.message.startsWith('Set ') ? 2 : 1;
  }
}

/** Requests to Brydio, signed in, with its refusals turned into sentences. */
interface Caller {
  apiUrl: string;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

async function caller(options: KeysOptions): Promise<Caller> {
  const apiUrl = (options.apiUrl ?? process.env[API_URL_ENV] ?? '').replace(/\/+$/, '');
  const token = options.token ?? process.env[TOKEN_ENV] ?? '';

  if (!apiUrl || !/^https?:\/\//.test(apiUrl)) throw new KeysRefused(`Set ${API_URL_ENV} to your Brydio's API address, like http://localhost:4000.`);

  if (!token) throw new KeysRefused(`Set ${TOKEN_ENV} to a Brydio session token. Keys are added as the account it belongs to.`);

  const request = options.fetch ?? fetch;
  const send = async <T>(path: string, init: RequestInit): Promise<T> => {
    let answer: Response;

    try {
      answer = await request(`${apiUrl}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
      });
    } catch (error) {
      throw new KeysRefused(`Could not reach ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const body = (await answer.json().catch(() => null)) as Record<string, unknown> | null;

    if (answer.ok) return body as T;

    const said = typeof body?.message === 'string' ? body.message : Array.isArray(body?.message) ? body.message.join(' ') : '';

    if (answer.status === 401) throw new KeysRefused(`Brydio did not accept the token in ${TOKEN_ENV}. Sign in again and use a fresh one.`);

    if (answer.status === 404 && !said) throw new KeysRefused(`${apiUrl} has no signing keys route. That Brydio is older than signing.`);

    throw new KeysRefused(`Brydio refused this: ${said || `it answered ${answer.status}.`}${typeof body?.reason === 'string' ? ` [${body.reason}]` : ''}`);
  };

  return {
    apiUrl,
    get: path => send(path, { method: 'GET' }),
    post: (path, body) => send(path, { method: 'POST', body: JSON.stringify(body) }),
  };
}

/** Which publisher the command is about: the one named, or the only one. */
async function publisherOf(call: Caller, options: KeysOptions): Promise<Publisher> {
  const mine = await call.get<Publisher[]>(PUBLISHERS_PATH);

  if (!mine.length) throw new KeysRefused('This account is not in any publisher. Make one, or ask an owner to add you, before making a key.');

  const named = options.publisher ?? '';

  if (named) {
    const found = mine.find(one => one.id === named || one.name.toLowerCase() === named.toLowerCase());

    if (!found) throw new KeysRefused(`This account is not in a publisher called "${named}". It is in ${mine.map(one => `${one.name} (${one.id})`).join(', ')}.`);

    return found;
  }

  if (mine.length > 1) {
    throw new KeysRefused(`This account is in more than one publisher. Say which with --publisher: ${mine.map(one => `${one.name} (${one.id})`).join(', ')}.`);
  }

  return mine[0]!;
}

async function create(call: Caller, options: KeysOptions, out: (line: string) => void): Promise<number> {
  const publisher = await publisherOf(call, options);
  const pair = newKeyPair();
  const label = (options.label ?? '').trim() || `${publisher.name} on this computer`;
  const approval = options.approveWith ? approvalFrom(options.approveWith, publisher, pair.publicKey) : undefined;
  const registered = await call.post<RemoteKey>(KEYS_PATH(publisher.id), {
    publicKey: pair.publicKey,
    label,
    ...(approval ? { approval } : {}),
    ...(options.override ? { override: true } : {}),
  });
  const path = options.outFile ? resolve(options.outFile) : join(keysHome(options), `${registered.id}.json`);
  const checkout = inCheckout(path);

  if (checkout) {
    // Registered already: say what it is, so the key can be retired, and
    // still refuse to write the private half where a commit would take it.
    out(`${registered.id} is registered, but ${path} is inside the checkout at ${checkout}, where a private key must never go.`);
    out(`Retire it with brydio keys retire ${registered.id}, and make another with --out somewhere outside a repository.`);

    return 1;
  }

  writeKeyFile(path, {
    keyId: registered.id,
    publisherId: publisher.id,
    publisher: publisher.name,
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    label: registered.label,
    createdAt: registered.createdAt,
  });

  out(`Made a signing key for ${publisher.name}.`);
  out(`  Key        ${registered.id}, "${registered.label}"`);
  out(`  Public key ${registered.publicKey}`);
  out(`  Kept in    ${path}, readable by this account alone`);
  out(`Publish with it: brydio publish --key ${path}, or set ${SIGNING_KEY_ENV} to that path.`);
  out('The private key is in that file and nowhere else. Back it up somewhere only you can read; Brydio never has it and cannot give it back.');

  return 0;
}

/** A first key's signature letting a second one in, from a key file held here. */
function approvalFrom(path: string, publisher: Publisher, publicKey: string): { keyId: string; signature: string } {
  const approver = readKeyFile(path);

  if (approver.publisherId !== publisher.id) {
    throw new KeysRefused(`${resolve(path)} is ${approver.publisher}'s key, not ${publisher.name}'s. A key is approved by one of the same publisher's.`);
  }

  return { keyId: approver.keyId, signature: approveKey(approver, publicKey) };
}

async function list(call: Caller, options: KeysOptions, out: (line: string) => void): Promise<number> {
  const publisher = await publisherOf(call, options);
  const remote = await call.get<RemoteKey[]>(KEYS_PATH(publisher.id));
  const here = new Map(heldKeys(keysHome(options)).map(one => [one.keyId, one] as const));

  if (!remote.length) {
    out(`${publisher.name} has no signing keys. Make one with brydio keys create.`);

    return 0;
  }

  out(`${publisher.name} (${publisher.id}):`);

  for (const key of remote) {
    const held = here.get(key.id);

    out(`  ${key.id}  ${key.state.padEnd(7)}  "${key.label}"`);
    out(`    public key ${key.publicKey}, added ${key.createdAt} (${key.allowedBy})`);
    out(held ? `    the private key is on this computer, in ${join(keysHome(options), `${key.id}.json`)}` : '    the private key is not on this computer');
  }

  const signing = remote.filter(key => key.state === 'active' && here.has(key.id));

  out(signing.length ? `This computer can sign with ${signing.length} of them.` : 'This computer cannot sign for this publisher: no active key’s private half is here.');

  return 0;
}

async function change(call: Caller, options: KeysOptions, out: (line: string) => void, what: 'retire' | 'revoke', keyId?: string): Promise<number> {
  if (!keyId) {
    out(`Say which key: brydio keys ${what} <key id>. brydio keys list prints them.`);

    return 2;
  }

  if (what === 'revoke' && !options.yes) {
    out('Revoking a key is never undone: every version it signed reads "Signature revoked" from then on, and installs of them keep running but are marked.');
    out(`If that is what you mean, run brydio keys revoke ${keyId} --yes. To rotate a key out instead, leaving what it signed verified, use brydio keys retire ${keyId}.`);

    return 2;
  }

  const publisher = await publisherOf(call, options);
  const key = await call.post<RemoteKey>(`${KEYS_PATH(publisher.id)}/${encodeURIComponent(keyId)}/${what}`, {});
  const held = join(keysHome(options), `${key.id}.json`);

  out(what === 'retire' ? `Retired ${key.id}, "${key.label}". It signs nothing new; the versions it signed stay verified.` : `Revoked ${key.id}, "${key.label}". The versions it signed now read "Signature revoked".`);

  if (existsSync(held)) out(`Its private key is still in ${held} and is no good to anyone now. Delete it: rm ${held}`);

  return 0;
}

/** Deletes a key file, for a test or a caller that means it. Never called by a command. */
export function forgetKeyFile(path: string): void {
  rmSync(resolve(path), { force: true });
}
