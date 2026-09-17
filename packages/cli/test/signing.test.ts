import { describe, expect, test } from 'bun:test';
import { createPrivateKey, createPublicKey } from 'node:crypto';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';
import { canonicalJson, signVersion, signingMessage, type SignedVersion } from '../src/signing.ts';

/**
 * A fixed key for the test only, never used for anything else. Ed25519
 * signatures are deterministic, so the same version signed with it gives
 * the same signature, which lets Brydio's answer about it be recorded.
 */
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEINOef8Hj2RRyElC+iVcqyurRbx/VnN0tRLQT3OlrYv41
-----END PRIVATE KEY-----
`;

const VERSION: SignedVersion = {
  appKey: 'issues',
  version: '1.2.0',
  bundleHash: 'a'.repeat(64),
  manifest: { screens: { board: { entry: 'screens/board.js' } }, name: 'issues', version: '1.2.0', labels: ['Ünïcode', 'b', 'B'] },
};

describe('what brydio publish signs (A7-F05-S03)', () => {
  const SERVER_SIGNING = 'apps/api/src/apps/versions/signing.ts';

  test('signs the scheme, app, version, fingerprint and the manifest’s hash, a line each', () => {
    const lines = signingMessage(VERSION).toString('utf8').split('\n');

    expect(lines.slice(0, 4)).toEqual(['brydio-version-v1', 'issues', '1.2.0', 'a'.repeat(64)]);
    expect(lines[4]).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJson({ b: 1, a: [2, { d: null, c: 'x' }], e: undefined })).toBe('{"a":[2,{"c":"x","d":null}],"b":1}');
  });

  test('builds the same bytes as Brydio, and Brydio checks the signature', async () => {
    const raw = createPublicKey(createPrivateKey(TEST_KEY)).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
    const signature = signVersion(VERSION, TEST_KEY);
    const server = await brydioAnswers('signing', [SERVER_SIGNING], async () => {
      const theirs = (await import(inBrydio(SERVER_SIGNING))) as {
        signingMessage: (version: SignedVersion) => Buffer;
        signatureChecks: (version: SignedVersion, signature: string, publicKey: string) => boolean;
      };

      return {
        message: theirs.signingMessage(VERSION).toString('hex'),
        signature,
        checks: theirs.signatureChecks(VERSION, signature, raw),
        tamperedChecks: theirs.signatureChecks({ ...VERSION, bundleHash: 'b'.repeat(64) }, signature, raw),
      };
    });

    expect(signingMessage(VERSION).toString('hex')).toBe(server.message);
    // The signature Brydio was shown is the one this SDK makes, and Brydio accepted it.
    expect(signature).toBe(server.signature);
    expect(server.checks).toBe(true);
    expect(server.tamperedChecks).toBe(false);
  });
});
