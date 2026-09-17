import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson, signVersion, signingMessage, type SignedVersion } from '../src/signing.ts';

const VERSION: SignedVersion = {
  appKey: 'issues',
  version: '1.2.0',
  bundleHash: 'a'.repeat(64),
  manifest: { screens: { board: { entry: 'screens/board.js' } }, name: 'issues', version: '1.2.0', labels: ['Ünïcode', 'b', 'B'] },
};

describe('what brydio publish signs (A7-F05-S03)', () => {
  const brydio = process.env.BRYDIO_DIR ?? join(import.meta.dir, '..', '..', '..', '..', 'brydio');
  const server = join(brydio, 'apps/api/src/apps/versions/signing.ts');

  test('signs the scheme, app, version, fingerprint and the manifest’s hash, a line each', () => {
    const lines = signingMessage(VERSION).toString('utf8').split('\n');

    expect(lines.slice(0, 4)).toEqual(['brydio-version-v1', 'issues', '1.2.0', 'a'.repeat(64)]);
    expect(lines[4]).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJson({ b: 1, a: [2, { d: null, c: 'x' }], e: undefined })).toBe('{"a":[2,{"c":"x","d":null}],"b":1}');
  });

  test.if(existsSync(server))('builds the same bytes as Brydio, and Brydio checks the signature', async () => {
    const brydioSigning = (await import(server)) as {
      signingMessage: (version: SignedVersion) => Buffer;
      signatureChecks: (version: SignedVersion, signature: string, publicKey: string) => boolean;
    };
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
    const signature = signVersion(VERSION, privateKey.export({ format: 'pem', type: 'pkcs8' }).toString());

    expect(signingMessage(VERSION).equals(brydioSigning.signingMessage(VERSION))).toBe(true);
    expect(brydioSigning.signatureChecks(VERSION, signature, raw)).toBe(true);
    expect(brydioSigning.signatureChecks({ ...VERSION, bundleHash: 'b'.repeat(64) }, signature, raw)).toBe(false);
  });
});
