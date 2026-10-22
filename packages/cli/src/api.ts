/**
 * What `brydio dev` alone still reads to reach a Brydio: a scoped key from
 * Brydio Settings > Developer and the address of that Brydio's API.
 *
 * Nothing else in the command line talks to Brydio. Publishing, tags and
 * signing keys go to the app registry (`registry.ts`), with the login
 * `brydio login` keeps. `brydio dev` moves off these two when Brydio can load
 * a build from localhost in the signed-in browser (PB09); until then it keeps
 * them, so the development loop works as it does today.
 */

/** A scoped key made in Brydio Settings > Developer, with Develop apps. */
export const TOKEN_ENV = 'BRYDIO_TOKEN';
/** Your Brydio's API, like `http://localhost:4000` for a local one. */
export const API_URL_ENV = 'BRYDIO_API_URL';
