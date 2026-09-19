# Releasing the SDK

The packages are published to npm under the `@brydio` scope, MIT licensed,
by GitHub Actions with **npm trusted publishing**: no token is stored
anywhere. The source repository is public, so releases use OIDC with npm
provenance attached.
The workflow is [`.github/workflows/release.yml`](../.github/workflows/release.yml).

## Current release inventory

Checked against npm and GitHub on 19 September 2026, before the alpha.6 tag:

| Item | State | What remains |
|---|---|---|
| `@brydio/manifest` | `0.1.0-alpha.5` is public under `next`; `latest` and `alpha` remain `0.1.0-alpha.0` | Promote a tag only by an explicit owner decision. |
| `@brydio/ui` | `0.1.0-alpha.5` is public under `next`; `latest` and `alpha` remain `0.1.0-alpha.0` | Promote a tag only by an explicit owner decision. |
| `@brydio/app` | `0.1.0-alpha.5` is public under `next`; `latest` and `alpha` remain `0.1.0-alpha.0` | Promote a tag only by an explicit owner decision. |
| `@brydio/api` | `0.1.0-alpha.5` is public under `next`; `latest` remains `0.1.0-alpha.0` | Promote a tag only by an explicit owner decision. |
| `@brydio/fake-host` | `0.1.0-alpha.5` is public under `next`; `latest` and `alpha` remain `0.1.0-alpha.0` | Promote a tag only by an explicit owner decision. |
| `@brydio/cli` | `0.1.0-alpha.5` is public under `next`; `latest` and `alpha` remain `0.1.0-alpha.0` | Promote a tag only by an explicit owner decision. |
| `@brydio/create-app` | `0.1.0-alpha.0` was registered locally under `alpha`; `nakel-ola/brydio-sdk` / `release.yml` is its trusted publisher | Publish `0.1.0-alpha.6` through the synchronized OIDC tag, then assign only this package's `latest` tag. |
| SDK repository | `nakel-ola/brydio-sdk` is public | Keep release sources and tags public. |
| Docs site | Cloudflare Workers assets are configured; no production deployment or domain is recorded | The owner chooses the domain and deployment trigger. |
| Support destinations | `support@brydio.app` and private `security@brydio.app` are set | Keep both monitored; a publishable build refuses if either is removed. |

Release run
[`35402393806`](https://github.com/nakel-ola/brydio-sdk/actions/runs/35402393806)
completed on commit `f9e9941`: type-check, tests, the publishable build, tag
match, install-from-tarballs proof and dependency-ordered publish all passed.
Each `0.1.0-alpha.5` package records that commit as `gitHead` and includes npm
provenance from the public source repository.

`0.1.0-alpha.6` adds `@brydio/create-app`, which carries both templates and
`tsconfig.base.json`. Its launcher supplies the exact synchronized version to
the existing create flow, so `npm create @brydio/app <name>` writes registry
dependencies and no checkout paths. Checkout `brydio create` remains locally
linked for SDK development.

## What a release does

1. A tag `v<version>` is pushed.
2. The workflow installs, type-checks and runs every test.
3. `bun run release:build` compiles each package into `release/<name>/`
   with its `exports` and `bin` pointing at the compiled files, the MIT
   licence and the commit it was built from.
4. The tag is checked against the version in the built packages.
5. `packages/cli/test/release.test.ts` packs all seven tarballs, installs the
   compiled initializer into an empty consumer, creates a fresh Preact app,
   and installs, builds, validates, tests and type-checks it with no workspace
   links.
6. `create-app` publishes first under `next`, so missing first-publish trust
   stops before an existing package is changed. The workflow then publishes
   `manifest`, `ui`, `app`, `api`, `fake-host` and `cli` under `next`.
7. An authenticated owner assigns `latest` only to the verified
   `@brydio/create-app` version. OIDC deliberately cannot change dist-tags.

A pull request that touches the packages, the release script or the
workflow runs steps 2 to 5 and publishes nothing.

## Trusted publishing setup

All seven packages trust this repository's `release.yml` workflow. The workflow
stores no npm token. `create-app` was first registered as `0.1.0-alpha.0` from
the owner's local npm login with 2FA, matching the original six packages, then
bound to the same trusted publisher. Its synchronized `0.1.0-alpha.6` release
and every release after it come from OIDC with provenance. Future releases
start with a clean, reviewed commit, bump all seven packages together, add the
matching changelog section, and push one matching `v<version>` tag. The
workflow publishes under `next`; moving `latest` or `alpha` remains a separate
owner action.

The public source repository lets npm attach provenance to these packages.
The workflow uses OIDC with `--provenance`; do not replace OIDC with a token.

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
