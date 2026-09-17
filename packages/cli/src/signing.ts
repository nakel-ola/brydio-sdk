import { createHash, createPrivateKey, sign } from 'node:crypto';

/**
 * What `brydio publish` signs for a version (A7-F05-S03): the same bytes
 * Brydio checks, built the same way (`apps/api/src/apps/versions/signing.ts`
 * in brydio; `test/signing.test.ts` compares them).
 *
 * The app, the version, the bundle's fingerprint and a hash of `app.json` in
 * a canonical form, one per line, so one signature vouches for the code and
 * the manifest. The private key stays with the publisher; only the signature
 * is sent.
 */

export const SIGNING_VERSION = 'brydio-version-v1';

export interface SignedVersion {
  appKey: string;
  version: string;
  bundleHash: string;
  manifest: unknown;
}

/** JSON with keys in code-unit order and no spacing: the same manifest hashes the same everywhere. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonicalJson(inner)}`).join(',')}}`;
  }

  return JSON.stringify(value ?? null);
}

/** The exact bytes a publisher signs for a version. */
export function signingMessage(version: SignedVersion): Buffer {
  const manifestHash = createHash('sha256').update(canonicalJson(version.manifest), 'utf8').digest('hex');

  return Buffer.from([SIGNING_VERSION, version.appKey, version.version, version.bundleHash, manifestHash].join('\n'), 'utf8');
}

/** A version's signature, base64, with an Ed25519 private key in PEM. */
export function signVersion(version: SignedVersion, privateKeyPem: string): string {
  return sign(null, signingMessage(version), createPrivateKey(privateKeyPem)).toString('base64');
}
