/**
 * How every command that talks to a Brydio signs in: one session token and
 * one address, read from the same two settings whatever the command.
 *
 * They live here rather than in `publish.ts` so `keys.ts` can read them
 * without the two importing each other.
 */

/** A Brydio session token, the same one the web app sends. */
export const TOKEN_ENV = 'BRYDIO_TOKEN';
/** Brydio's API, like `https://api.brydio.app`. */
export const API_URL_ENV = 'BRYDIO_API_URL';
