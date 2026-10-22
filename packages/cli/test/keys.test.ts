import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createPrivateKey, createPublicKey, verify } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';
import { main } from '../src/main.ts';
import { KEYS_PATH, PUBLISHERS_PATH, approveKey, keyApprovalMessage, keys, readKeyFile, signingKeyPath, writeKeyFile, type KeyFile } from '../src/keys.ts';
import { ADA, brydioHome, fakeRegistry, type FakeKey, type FakeRegistry } from './fake-registry.ts';

/**
 * `brydio keys` (A7-F05-S03), against the registry's key routes (PB03). The
 * private key is made here and stays here: every test below says so in one
 * way or another, and the one that matters most is that nothing prints it.
 */

/** A fixed key for the tests alone, so the approval signature is the same every run. */
const APPROVER_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIPUnuBSae5o4IbpSyfELyEjLNOEjcUx1XUvVBvtPEYMc
-----END PRIVATE KEY-----
`;
const APPROVER_PUBLIC = '4TU3j4Mc5WTheU2eNHwLUTNVUntItxKFxaXzHsAvq4U=';

const made: string[] = [];
const registries: FakeRegistry[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const one of registries.splice(0)) one.stop();
});

function folder(name = 'brydio-keys-'): string {
  const root = mkdtempSync(join(tmpdir(), name));

  made.push(root);

  return root;
}

const keyRow = (over: Partial<FakeKey> = {}): FakeKey => ({
  id: 'key_one',
  label: 'Acme on this computer',
  publicKey: APPROVER_PUBLIC,
  state: 'active',
  allowedBy: 'first',
  createdAt: '2026-09-17T00:00:00.000Z',
  ...over,
});

/** The fake registry, with these keys already registered for Acme. */
function server(options: Parameters<typeof fakeRegistry>[0] & { keys?: FakeKey[] } = {}): FakeRegistry {
  const { keys: existing, ...rest } = options;
  const one = fakeRegistry(rest);

  registries.push(one);

  if (existing) one.keys.set('pub_acme', existing.map(key => ({ ...key })));

  return one;
}

const posts = (reg: FakeRegistry) => reg.received.filter(one => one.method === 'POST');

const run = async (words: string[], reg: FakeRegistry, options: Parameters<typeof keys>[1] & { loggedIn?: boolean } = {}) => {
  const lines: string[] = [];
  const { loggedIn = true, ...rest } = options;
  const loginHome = brydioHome(loggedIn ? reg.url : null);

  made.push(loginHome);

  const code = await keys(words, { registry: reg.url, loginHome, out: line => lines.push(line), ...rest });

  return { code, text: lines.join('\n') };
};

/** The 32 bytes the registry stores for a private key, as a key file holds it. */
const publicOf = (privateKeyPem: string) => createPublicKey(createPrivateKey(privateKeyPem)).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');

const approverFile = (home: string, over: Partial<KeyFile> = {}): string => {
  const path = join(home, 'key_one.json');

  writeKeyFile(path, { keyId: 'key_one', publisherId: 'pub_acme', publisher: 'Acme Ltd', publicKey: APPROVER_PUBLIC, privateKey: APPROVER_KEY, label: 'Acme on this computer', createdAt: 'then', ...over });

  return path;
};

describe('brydio keys create', () => {
  test('uses the registry’s routes: the account’s publishers from /v1/me, keys under the publisher', () => {
    expect(PUBLISHERS_PATH).toBe('/v1/me');
    expect(KEYS_PATH('pub_acme')).toBe('/v1/publishers/pub_acme/keys');
  });

  test('asks for a login to the registry, and sends nothing', async () => {
    const reg = server();
    const missing = await run(['create'], reg, { home: folder(), loggedIn: false });

    expect(missing.code).toBe(2);
    expect(missing.text).toContain(`This computer is not logged in to ${reg.url}. Run brydio login --registry ${reg.url} first.`);
    expect(reg.received).toEqual([]);
  });

  test('makes the pair here, registers the public half alone, and keeps the private one in a file only this account can read', async () => {
    const home = folder();
    const reg = server();
    const { code, text } = await run(['create'], reg, { home, label: 'Laptop' });
    const path = join(home, 'key_1.json');
    const file = readKeyFile(path);

    expect(code).toBe(0);
    // Only the public key went up, under the label asked for.
    expect(posts(reg).at(-1)).toMatchObject({ path: KEYS_PATH('pub_acme'), body: { publicKey: file.publicKey, label: 'Laptop' } });
    expect(Object.keys(posts(reg).at(-1)!.body!)).toEqual(['publicKey', 'label']);
    expect(publicOf(file.privateKey)).toBe(file.publicKey);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(text).toContain(`Registry ${reg.url}`);
    expect(text).toContain('Made a signing key for Acme Ltd.');
    expect(text).toContain(`Kept in    ${path}`);
  });

  test('never prints the private key, and never sends it', async () => {
    const home = folder();
    const reg = server();
    const { text } = await run(['create'], reg, { home });
    const file = readKeyFile(join(home, 'key_1.json'));
    const everythingSent = JSON.stringify(reg.received);

    for (const secret of [file.privateKey, file.privateKey.split('\n')[1]!, 'PRIVATE KEY']) {
      expect(text).not.toContain(secret);
      expect(everythingSent).not.toContain(secret);
    }
  });

  test('refuses to write a key file inside a checkout, and says how to undo the key it just made', async () => {
    const repo = folder('brydio-keys-repo-');

    mkdirSync(join(repo, '.git'));
    mkdirSync(join(repo, 'app'), { recursive: true });

    const path = join(repo, 'app', 'signing.json');
    const { code, text } = await run(['create'], server(), { home: folder(), outFile: path });

    expect(code).toBe(1);
    expect(existsSync(path)).toBe(false);
    expect(text).toContain(`inside the checkout at ${repo}, where a private key must never go`);
    expect(text).toContain('brydio keys retire key_1');
  });

  test('a second key is signed in by one the publisher already has, sent as approvedBy', async () => {
    const home = folder();
    const reg = server({ keys: [keyRow()] });

    approverFile(home);

    const { code } = await run(['create'], reg, { home, approveWith: join(home, 'key_one.json'), label: 'Second' });
    const approval = posts(reg).at(-1)!.body!.approvedBy as { keyId: string; signature: string };
    const added = posts(reg).at(-1)!.body!.publicKey as string;

    expect(code).toBe(0);
    expect(approval.keyId).toBe('key_one');
    // The approval is over the publisher and the new key, signed by the old one.
    expect(verify(null, keyApprovalMessage('pub_acme', added), createPublicKey(createPrivateKey(APPROVER_KEY)), Buffer.from(approval.signature, 'base64'))).toBe(true);
    expect(reg.keys.get('pub_acme')!.at(-1)!.allowedBy).toBe('approved:key_one');
  });

  test('refuses an approving key belonging to another publisher', async () => {
    const home = folder();

    approverFile(home, { publisherId: 'pub_other', publisher: 'Other Ltd' });

    const { code, text } = await run(['create'], server({ keys: [keyRow()] }), { home, approveWith: join(home, 'key_one.json') });

    expect(code).toBe(1);
    expect(text).toContain("is Other Ltd's key, not Acme Ltd's");
  });

  test('says which publisher to name when the account is in more than one, and makes nothing', async () => {
    const home = folder();
    const reg = server({
      publishers: [
        { id: 'pub_acme', name: 'Acme Ltd', members: [ADA.id] },
        { id: 'pub_bee', name: 'Bee Co', members: [ADA.id] },
      ],
    });
    const { code, text } = await run(['create'], reg, { home });

    expect(code).toBe(2);
    expect(text).toContain('--publisher: Acme Ltd (pub_acme), Bee Co (pub_bee)');
    expect(posts(reg)).toEqual([]);

    expect((await run(['create'], reg, { home, publisher: 'Bee Co' })).code).toBe(0);
    expect(posts(reg).at(-1)!.path).toContain('pub_bee');
  });

  test('says what the registry said when it wants an approval this computer cannot give', async () => {
    const { code, text } = await run(['create'], server({ keys: [keyRow()] }), { home: folder() });

    expect(code).toBe(1);
    expect(text).toContain('The registry refused this: A second key needs an existing key’s approval. [key_approval_required]');
  });

  test('says a revoked login is no good, and to log in again', async () => {
    const reg = server();

    reg.refuseNext('GET', /^\/v1\/me$/, 401, { code: 'unauthorized', message: 'Revoked.' });

    expect(await run(['list'], reg, { home: folder() })).toMatchObject({ code: 1, text: expect.stringContaining("did not accept this computer's login") });
  });
});

describe('brydio keys list, retire and revoke', () => {
  test('lists the publisher’s keys and says which private halves are on this computer', async () => {
    const home = folder();

    approverFile(home);

    const { code, text } = await run(['list'], server({ keys: [keyRow(), keyRow({ id: 'key_two', publicKey: 'b'.repeat(43) + '=', state: 'retired' })] }), { home });

    expect(code).toBe(0);
    expect(text).toContain('key_one  active   "Acme on this computer"');
    expect(text).toContain(`the private key is on this computer, in ${join(home, 'key_one.json')}`);
    expect(text).toContain('key_two  retired');
    expect(text).toContain('This computer can sign with 1 of them.');
    expect(text).not.toContain('PRIVATE KEY');
  });

  test('retires a key, and says the file left behind is no good to anyone', async () => {
    const home = folder();
    const reg = server({ keys: [keyRow()] });

    approverFile(home);

    const { code, text } = await run(['retire', 'key_one'], reg, { home });

    expect(code).toBe(0);
    expect(text).toContain('It signs nothing new; the versions it signed stay verified.');
    expect(text).toContain(`rm ${join(home, 'key_one.json')}`);
    expect(reg.keys.get('pub_acme')![0]!.state).toBe('retired');
  });

  test('will not revoke without being told twice, and asks nothing of the registry until then', async () => {
    const reg = server({ keys: [keyRow()] });
    const { code, text } = await run(['revoke', 'key_one'], reg, { home: folder() });

    expect(code).toBe(2);
    expect(reg.received).toEqual([]);
    expect(text).toContain('never undone');
    expect(text).toContain('brydio keys revoke key_one --yes');

    const said = await run(['revoke', 'key_one'], reg, { home: folder(), yes: true });

    expect(said.code).toBe(0);
    expect(posts(reg).at(-1)!.path).toBe(`${KEYS_PATH('pub_acme')}/key_one/revoke`);
    expect(said.text).toContain('now read "Signature revoked"');
  });

  test('says which key when told none', async () => {
    const reg = server();

    expect(await run(['retire'], reg, { home: folder() })).toMatchObject({ code: 2, text: expect.stringContaining('brydio keys retire <key id>') });
    expect(reg.received).toEqual([]);
  });
});

describe('the command line', () => {
  test('runs keys through brydio itself, reading the flags without eating the words after them', async () => {
    const was = process.env.BRYDIO_HOME;

    // Never this computer's own ~/.brydio.
    process.env.BRYDIO_HOME = folder();

    try {
      const said = async (words: string[]) => {
        const lines: string[] = [];
        // A dead address: every case below answers before it would ask anything.
        const code = await main([...words, '--registry', 'http://127.0.0.1:1'], line => lines.push(line));

        return { code, text: lines.join('\n') };
      };

      expect(await said(['keys', 'revoke', 'key_x'])).toMatchObject({ code: 2, text: expect.stringContaining('brydio keys revoke key_x --yes') });
      // `--yes` is a switch: it takes no word, so `key_x` stays the key.
      expect(await said(['keys', 'revoke', '--yes', 'key_x'])).toMatchObject({ code: 2, text: expect.stringContaining('This computer is not logged in to http://127.0.0.1:1.') });
      // `--publisher Acme Ltd` takes its value and leaves `retire` as the command.
      expect(await said(['keys', 'retire', '--publisher', 'Acme Ltd'])).toMatchObject({ code: 2, text: expect.stringContaining('brydio keys retire <key id>') });
      expect(await said(['keys', 'fiddle'])).toMatchObject({ code: 2, text: expect.stringContaining('There is no "keys fiddle" command.') });
      expect((await said(['help'])).text).toContain('brydio keys <what>');
    } finally {
      if (was === undefined) delete process.env.BRYDIO_HOME;
      else process.env.BRYDIO_HOME = was;
    }
  });
});

describe('a key file is a secret', () => {
  test('refuses one other accounts on this computer can read', () => {
    const home = folder();
    const path = approverFile(home);

    chmodSync(path, 0o644);

    expect(() => readKeyFile(path)).toThrow(/can be read by other accounts/);
    chmodSync(path, 0o600);
    expect(readKeyFile(path).keyId).toBe('key_one');
  });

  test('refuses a private key handed over in the environment instead of a path', () => {
    expect(() => signingKeyPath(APPROVER_KEY)).toThrow(/not the key itself/);
    expect(() => signingKeyPath(undefined, { BRYDIO_SIGNING_KEY: APPROVER_KEY } as NodeJS.ProcessEnv)).toThrow(/readable by everything this runs/);
    expect(signingKeyPath(undefined, {} as NodeJS.ProcessEnv)).toBe(null);
  });

  test('is written by its owner alone even where the folder was loose', () => {
    const home = folder();
    const path = join(home, 'deep', 'key_x.json');

    writeKeyFile(path, readKeyFile(approverFile(home)));

    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(existsSync(`${path}.part`)).toBe(false);
    expect(JSON.parse(readFileSync(path, 'utf8')).privateKey).toBe(APPROVER_KEY);
  });
});

describe('what Brydio makes of an approval (A7-F05-S03)', () => {
  const SERVER_SIGNING = 'apps/api/src/apps/versions/signing.ts';
  const NEW_KEY = 'jZ1DBRUuepnQHkLDAiFy1TNpCdEsAvxDPyTOMDxjpH0=';

  test('builds the same approval bytes as Brydio, and Brydio accepts the signature', async () => {
    const signature = approveKey({ keyId: 'key_one', publisherId: 'pub_acme', publisher: 'Acme Ltd', publicKey: APPROVER_PUBLIC, privateKey: APPROVER_KEY, label: 'l', createdAt: 't' }, NEW_KEY);
    const server = await brydioAnswers('key-approval', [SERVER_SIGNING], async () => {
      const theirs = (await import(inBrydio(SERVER_SIGNING))) as {
        keyApprovalMessage: (publisherId: string, publicKey: string) => Buffer;
        approvalChecks: (publisherId: string, publicKey: string, signature: string, approverKey: string) => boolean;
      };

      return {
        message: theirs.keyApprovalMessage('pub_acme', NEW_KEY).toString('hex'),
        signature,
        checks: theirs.approvalChecks('pub_acme', NEW_KEY, signature, APPROVER_PUBLIC),
        otherKeyChecks: theirs.approvalChecks('pub_acme', 'a'.repeat(43) + '=', signature, APPROVER_PUBLIC),
      };
    });

    expect(keyApprovalMessage('pub_acme', NEW_KEY).toString('hex')).toBe(server.message);
    expect(signature).toBe(server.signature);
    expect(server.checks).toBe(true);
    // The same signature does not let a different key in.
    expect(server.otherKeyChecks).toBe(false);
  });
});
