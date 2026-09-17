import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, verify } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';
import { main } from '../src/main.ts';
import { KEYS_PATH, PUBLISHERS_PATH, approveKey, keyApprovalMessage, keys, readKeyFile, signingKeyPath, writeKeyFile, type KeyFile, type RemoteKey } from '../src/keys.ts';

/**
 * `brydio keys` (A7-F05-S03). The private key is made here and stays here:
 * every test below says so in one way or another, and the one that matters
 * most is that nothing prints it.
 */

/** A fixed key for the tests alone, so the approval signature is the same every run. */
const APPROVER_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIPUnuBSae5o4IbpSyfELyEjLNOEjcUx1XUvVBvtPEYMc
-----END PRIVATE KEY-----
`;
const APPROVER_PUBLIC = '4TU3j4Mc5WTheU2eNHwLUTNVUntItxKFxaXzHsAvq4U=';

const made: string[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

function folder(name = 'brydio-keys-'): string {
  const root = mkdtempSync(join(tmpdir(), name));

  made.push(root);

  return root;
}

const publisherRow = (id: string, name: string, role: 'owner' | 'member' = 'owner') => ({ id, name, role, contact: 'a@b.c', members: 1, createdAt: 'then' });

const keyRow = (over: Partial<RemoteKey> = {}): RemoteKey => ({
  id: 'key_one',
  label: 'Acme on this computer',
  publicKey: APPROVER_PUBLIC,
  state: 'active',
  allowedBy: 'first',
  createdAt: '2026-09-17T00:00:00.000Z',
  ...over,
});

interface Sent {
  url: string;
  method: string;
  body: Record<string, unknown>;
}

/** A pretend Brydio with the publisher and keys routes, remembering what it was sent. */
function server(options: { publishers?: ReturnType<typeof publisherRow>[]; keys?: RemoteKey[]; refuse?: { status: number; body: unknown } } = {}) {
  const sent: Sent[] = [];
  const publishers = options.publishers ?? [publisherRow('pub_acme', 'Acme Ltd')];
  const existing = options.keys ?? [];
  const fetch = async (url: string, init: RequestInit) => {
    const method = init.method ?? 'GET';

    sent.push({ url, method, ...(init.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : { body: {} }) });

    if (url.endsWith(PUBLISHERS_PATH)) return Response.json(publishers);

    if (options.refuse && method === 'POST') return Response.json(options.refuse.body, { status: options.refuse.status });

    if (method === 'GET') return Response.json(existing);

    if (/\/(retire|revoke)$/.test(url)) {
      const [, what] = /\/(retire|revoke)$/.exec(url)!;

      return Response.json(keyRow({ state: what === 'retire' ? 'retired' : 'revoked' }));
    }

    const body = JSON.parse(String(init.body)) as { publicKey: string; label: string };

    return Response.json(keyRow({ id: `key_${existing.length + 1}`, publicKey: body.publicKey, label: body.label, allowedBy: existing.length ? 'approved:key_one' : 'first' }));
  };

  return { sent, fetch };
}

const run = async (words: string[], route: ReturnType<typeof server>, options: Parameters<typeof keys>[1] = {}) => {
  const lines: string[] = [];
  const code = await keys(words, { apiUrl: 'http://brydio.test', token: 'session-token', fetch: route.fetch, out: line => lines.push(line), ...options });

  return { code, text: lines.join('\n') };
};

/** The 32 bytes Brydio stores for a private key, as a key file holds it. */
const publicOf = (privateKeyPem: string) => createPublicKey(createPrivateKey(privateKeyPem)).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');

const approverFile = (home: string, over: Partial<KeyFile> = {}): string => {
  const path = join(home, 'key_one.json');

  writeKeyFile(path, { keyId: 'key_one', publisherId: 'pub_acme', publisher: 'Acme Ltd', publicKey: APPROVER_PUBLIC, privateKey: APPROVER_KEY, label: 'Acme on this computer', createdAt: 'then', ...over });

  return path;
};

describe('brydio keys create', () => {
  test('makes the pair here, registers the public half alone, and keeps the private one in a file only this account can read', async () => {
    const home = folder();
    const route = server();
    const { code, text } = await run(['create'], route, { home, label: 'Laptop' });
    const path = join(home, 'key_1.json');
    const file = readKeyFile(path);

    expect(code).toBe(0);
    // Only the public key went up, under the label asked for.
    expect(route.sent.at(-1)).toMatchObject({ url: `http://brydio.test${KEYS_PATH('pub_acme')}`, method: 'POST', body: { publicKey: file.publicKey, label: 'Laptop' } });
    expect(Object.keys(route.sent.at(-1)!.body)).toEqual(['publicKey', 'label']);
    expect(publicOf(file.privateKey)).toBe(file.publicKey);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(text).toContain('Made a signing key for Acme Ltd.');
    expect(text).toContain(`Kept in    ${path}`);
  });

  test('never prints the private key, and never sends it', async () => {
    const home = folder();
    const route = server();
    const { text } = await run(['create'], route, { home });
    const file = readKeyFile(join(home, 'key_1.json'));
    const everythingSent = JSON.stringify(route.sent);

    for (const secret of [file.privateKey, file.privateKey.split('\n')[1]!, 'PRIVATE KEY']) {
      expect(text).not.toContain(secret);
      expect(everythingSent).not.toContain(secret);
    }
  });

  test('refuses to write a key file inside a checkout, and says how to undo the key it just made', async () => {
    const repo = folder('brydio-keys-repo-');

    mkdirSync(join(repo, '.git'));
    mkdirSync(join(repo, 'app'), { recursive: true });

    const route = server();
    const path = join(repo, 'app', 'signing.json');
    const { code, text } = await run(['create'], route, { home: folder(), outFile: path });

    expect(code).toBe(1);
    expect(existsSync(path)).toBe(false);
    expect(text).toContain(`inside the checkout at ${repo}, where a private key must never go`);
    expect(text).toContain('brydio keys retire key_1');
  });

  test('a second key is signed in by one the publisher already has, and Brydio takes that approval', async () => {
    const home = folder();
    const route = server({ keys: [keyRow()] });

    approverFile(home);

    const { code } = await run(['create'], route, { home, approveWith: join(home, 'key_one.json'), label: 'Second' });
    const approval = route.sent.at(-1)!.body.approval as { keyId: string; signature: string };
    const added = route.sent.at(-1)!.body.publicKey as string;

    expect(code).toBe(0);
    expect(approval.keyId).toBe('key_one');
    // The approval is over the publisher and the new key, signed by the old one.
    expect(verify(null, keyApprovalMessage('pub_acme', added), createPublicKey(createPrivateKey(APPROVER_KEY)), Buffer.from(approval.signature, 'base64'))).toBe(true);
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
    const route = server({ publishers: [publisherRow('pub_acme', 'Acme Ltd'), publisherRow('pub_bee', 'Bee Co')] });
    const { code, text } = await run(['create'], route, { home });

    expect(code).toBe(1);
    expect(text).toContain('--publisher: Acme Ltd (pub_acme), Bee Co (pub_bee)');
    expect(route.sent.filter(one => one.method === 'POST')).toEqual([]);

    expect((await run(['create'], route, { home, publisher: 'Bee Co' })).code).toBe(0);
    expect(route.sent.at(-1)!.url).toContain('pub_bee');
  });

  test('says what Brydio said when it wants an approval this computer cannot give', async () => {
    const { code, text } = await run(['create'], server({ keys: [keyRow()], refuse: { status: 422, body: { reason: 'approval_needed', message: 'This publisher already has a key. A new one needs that key’s approval.' } } }), { home: folder() });

    expect(code).toBe(1);
    expect(text).toContain('Brydio refused this: This publisher already has a key. A new one needs that key’s approval. [approval_needed]');
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

    approverFile(home);

    const { code, text } = await run(['retire', 'key_one'], server({ keys: [keyRow()] }), { home });

    expect(code).toBe(0);
    expect(text).toContain('It signs nothing new; the versions it signed stay verified.');
    expect(text).toContain(`rm ${join(home, 'key_one.json')}`);
  });

  test('will not revoke without being told twice, and asks nothing of Brydio until then', async () => {
    const route = server({ keys: [keyRow()] });
    const { code, text } = await run(['revoke', 'key_one'], route, { home: folder() });

    expect(code).toBe(2);
    expect(route.sent).toEqual([]);
    expect(text).toContain('never undone');
    expect(text).toContain('brydio keys revoke key_one --yes');

    const said = await run(['revoke', 'key_one', ], route, { home: folder(), yes: true });

    expect(said.code).toBe(0);
    expect(route.sent.at(-1)!.url).toBe(`http://brydio.test${KEYS_PATH('pub_acme')}/key_one/revoke`);
    expect(said.text).toContain('now read "Signature revoked"');
  });

  test('says which key when told none', async () => {
    const route = server();

    expect(await run(['retire'], route, { home: folder() })).toMatchObject({ code: 2, text: expect.stringContaining('brydio keys retire <key id>') });
    expect(route.sent).toEqual([]);
  });
});

describe('the command line', () => {
  test('runs keys through brydio itself, reading the flags without eating the words after them', async () => {
    const was = { url: process.env.BRYDIO_API_URL, token: process.env.BRYDIO_TOKEN };

    // A dead address: every case below answers before it would ask Brydio anything.
    process.env.BRYDIO_API_URL = 'http://127.0.0.1:1';
    process.env.BRYDIO_TOKEN = 'session-token';

    try {
      const said = async (words: string[]) => {
        const lines: string[] = [];
        const code = await main(words, line => lines.push(line));

        return { code, text: lines.join('\n') };
      };

      expect(await said(['keys', 'revoke', 'key_x'])).toMatchObject({ code: 2, text: expect.stringContaining('brydio keys revoke key_x --yes') });
      // `--publisher Acme Ltd` takes its value and leaves `retire` as the command.
      expect(await said(['keys', 'retire', '--publisher', 'Acme Ltd'])).toMatchObject({ code: 2, text: expect.stringContaining('brydio keys retire <key id>') });
      expect(await said(['keys', 'fiddle'])).toMatchObject({ code: 2, text: expect.stringContaining('There is no "keys fiddle" command.') });
      expect((await said(['help'])).text).toContain('brydio keys <what>');
    } finally {
      for (const [name, value] of [['BRYDIO_API_URL', was.url], ['BRYDIO_TOKEN', was.token]] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
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
