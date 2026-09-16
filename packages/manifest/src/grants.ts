/**
 * The host grants Brydio has a meaning for, and its refusal of any other
 * (A5-F04-S03, A8-F04-S03).
 *
 * Copies of `KNOWN_HOST_GRANTS` in Brydio's
 * `apps/api/src/apps/versions/diff-manifests.ts` and the `grant_unknown`
 * sentence in `apps/api/src/apps/publishing/app-publish.service.ts`.
 */

import { BUNDLE_MANIFEST } from './bundle.ts';

export const KNOWN_HOST_GRANTS: readonly string[] = ['navigate', 'message'];

/** The server's refusal of the first host grant it does not know, or null. */
export function unknownHostGrant(manifest: unknown): { code: 'grant_unknown'; message: string; path: 'grants.host' } | null {
  const grants = (manifest as { grants?: { host?: unknown } } | null)?.grants;
  const host = grants?.host;
  const unknown = (Array.isArray(host) ? host : []).find(grant => typeof grant !== 'string' || !KNOWN_HOST_GRANTS.includes(grant));

  if (unknown === undefined) return null;

  return {
    code: 'grant_unknown',
    message:
      `${BUNDLE_MANIFEST} asks for "${String(unknown)}", which Brydio does not grant. ` + `An app may ask for ${KNOWN_HOST_GRANTS.join(' and ')}.`,
    path: 'grants.host',
  };
}
