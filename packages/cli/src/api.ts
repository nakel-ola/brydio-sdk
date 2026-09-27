/**
 * How every command that talks to a Brydio is authorized: one scoped key and
 * one address, read from the same two settings whatever the command.
 *
 * They live here rather than in `publish.ts` so `keys.ts` can read them
 * without the two importing each other.
 */

/** A scoped key made in Brydio Settings > Developer. */
export const TOKEN_ENV = 'BRYDIO_TOKEN';
/** Brydio's API, like `https://api.brydio.app`. */
export const API_URL_ENV = 'BRYDIO_API_URL';
