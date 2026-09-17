# Releasing the SDK

The packages are published to npm under the `@brydio` scope, MIT licensed,
by GitHub Actions with **npm trusted publishing**: no token is stored
anywhere, and each version is published with provenance. The workflow is
[`.github/workflows/release.yml`](../.github/workflows/release.yml).

## What a release does

1. A tag `v<version>` is pushed.
2. The workflow installs, type-checks and runs every test.
3. `bun run release:build` compiles each package into `release/<name>/`
   with its `exports` and `bin` pointing at the compiled files, the MIT
   licence and the commit it was built from.
4. The tag is checked against the version in the built packages.
5. `packages/cli/test/release.test.ts` packs the tarballs, installs them
   into a fresh app with no workspace links, and builds, validates, tests
   and type-checks that app.
6. Each package is published in dependency order: `manifest`, `ui`, `app`,
   `fake-host`, `cli`.

A pull request that touches the packages, the release script or the
workflow runs steps 2 to 5 and publishes nothing.

## Before the first release: a one-off for the owner

**npm cannot configure a trusted publisher for a package that does not exist
yet.** Trusted publishing is set on a package's own settings page, so each
of the five packages has to exist on npm before OIDC can publish it. This is
a known limitation ([npm/cli#8544](https://github.com/npm/cli/issues/8544));
PyPI allows configuring publishing before a package exists, npm does not.

So, once, in this order:

1. **Create the `@brydio` scope** on npm, owned by the owner's account.
2. **Publish version `0.0.0` of each package by hand**, from a machine, with
   the owner's own npm login and 2FA:

   ```sh
   bun run release:build
   cd release/manifest && npm publish --access public   # then ui, app, fake-host, cli
   ```

   A placeholder version is enough; it only has to make the package exist.
   Do not use a CI token for this, and do not put a token in the repository.
3. **Add the trusted publisher** on npmjs.com for each package, under
   *Settings → Trusted publisher*:
   - Publisher: GitHub Actions
   - Repository: `nakel-ola/brydio-sdk`
   - Workflow: `release.yml`
   - Environment: leave empty (the workflow uses none)
4. **Check that no npm token exists** in the repository's secrets. The
   workflow uses none, and adding one would turn trusted publishing off.

After that, every release is a tag, and nothing else.

## The licence

MIT, `Copyright (c) 2026 Brydio Inc.` (the owner, 17 Sep). `LICENSE` is at
the root, every package says `"license": "MIT"` with `author` and
`repository`, and `release:build` copies the licence into each published
package. The tarball test fails if one goes out without it.

## Versions

Every package shares one version, in its own `package.json`. Bump them
together, tag `v<version>`, and push the tag. The workflow refuses a tag
that doesn't match what was built.
