# Releasing the SDK

The packages are published to npm under the `@brydio` scope, MIT licensed,
by GitHub Actions with **npm trusted publishing**: no token is stored
anywhere. npm cannot accept provenance from a private source repository, so
releases use OIDC without `--provenance` while this repository remains private.
The workflow is [`.github/workflows/release.yml`](../.github/workflows/release.yml).

## Current release inventory

Checked against npm and GitHub on 18 September 2026:

| Item | State | What remains |
|---|---|---|
| `@brydio/manifest` | `0.1.0-alpha.0` is public; `latest` and `alpha` point to it | Publish the next shared version through the tag workflow. |
| `@brydio/ui` | `0.1.0-alpha.0` is public; `latest` and `alpha` point to it | Publish the next shared version through the tag workflow. |
| `@brydio/app` | `0.1.0-alpha.0` is public; `latest` and `alpha` point to it | Publish the next shared version through the tag workflow. |
| `@brydio/fake-host` | `0.1.0-alpha.0` is public; `latest` and `alpha` point to it | Publish the next shared version through the tag workflow. |
| `@brydio/cli` | `0.1.0-alpha.0` is public; `latest` and `alpha` point to it | Publish the next shared version through the tag workflow. |
| `@brydio/api` | npm returns 404; the source package is `0.1.0-alpha.1` | The owner creates the package with a `0.0.0` placeholder, configures trusted publishing, then the shared tag can publish `0.1.0-alpha.1`. |
| SDK repository | `nakel-ola/brydio-sdk` is private | The owner decides when to make it public. |
| Docs site | No GitHub Pages site and no configured homepage | The owner chooses the domain and hosting vendor. |
| Support destinations | `release.json` has no support or private security address | The owner supplies both. A publishable build refuses until then. |

`npm create @brydio/app` is deliberately absent from this release. The
current `brydio create` reads templates and `tsconfig.base.json` from a local
checkout and writes `file:` dependencies. Packaging that command now would
give a new builder an app that cannot install away from this repository.

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
   `api`, `fake-host`, `cli`, under the `next` dist-tag.

A pull request that touches the packages, the release script or the
workflow runs steps 2 to 5 and publishes nothing.

## Before the API package can join a release

**npm cannot configure a trusted publisher for a package that does not exist
yet.** Trusted publishing is set on a package's own settings page. The first
five packages already exist and have trusted publishing; `@brydio/api` does
not. This is
a known limitation ([npm/cli#8544](https://github.com/npm/cli/issues/8544));
PyPI allows configuring publishing before a package exists, npm does not.

The owner does this once, in this order:

1. **Publish `@brydio/api@0.0.0` as a placeholder** from a temporary folder,
   using the owner's npm login and 2FA. The placeholder exists only to create
   the package settings page. It must not depend on the SDK or contain the
   unreleased implementation.

   ```sh
   mkdir brydio-api-placeholder && cd brydio-api-placeholder
   npm init --scope=@brydio --yes
   npm pkg set name=@brydio/api version=0.0.0 license=MIT
   npm publish --access public --tag placeholder
   ```

   Do not run this from the SDK checkout. Do not use a CI token, and do not
   put a token in the repository.
2. **Add the trusted publisher** on npmjs.com for `@brydio/api`, under
   *Settings → Trusted publisher*:
   - Publisher: GitHub Actions
   - Repository: `nakel-ola/brydio-sdk`
   - Workflow: `release.yml`
   - Environment: leave empty (the workflow uses none)
3. **Check that no npm token exists** in the repository's secrets. The
   workflow uses none, and adding one would turn trusted publishing off.
4. **Set the real support and private security addresses** in `release.json`.
   The build refuses a publishable artifact while either is missing.
5. **Tag `v0.1.0-alpha.1` only after the repository is clean and green.** The
   workflow publishes all six real packages under `next`. It does not move
   `latest` or `alpha`; promotion is a separate owner action.

After that, every release is a tag, and nothing else.

## The licence

MIT, `Copyright (c) 2026 Brydio Inc.` (the owner, 17 Sep). `LICENSE` is at
the root, every package says `"license": "MIT"` with `author` and
`repository`, and `release:build` copies the licence into each published
package. The tarball test fails if one goes out without it.

## Versions

Every package shares one version, in its own `package.json`. Bump them
together, add the changelog entry, tag `v<version>`, and push the tag. The
workflow refuses a tag that does not match what was built and publishes with
the `next` dist-tag. Moving `latest` or `alpha` is an explicit owner decision.
