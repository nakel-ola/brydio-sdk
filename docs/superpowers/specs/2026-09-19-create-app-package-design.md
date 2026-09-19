# Packaged Create Experience Design

## Goal

Make `npm create @brydio/app <name>` create and install a fresh Preact Brydio app outside an SDK checkout, then publish the synchronized `0.1.0-alpha.6` SDK release without weakening its clean-tree, changelog, OIDC, provenance, or shared-version guarantees.

## Existing seam

`packages/cli/src/create.ts` already owns the behavior that validates the app name, copies a template, rewrites the manifest and package name, inlines the shared TypeScript configuration, installs dependencies, and prints the next commands. Its checkout behavior is intentionally local: every `@brydio/*` dependency becomes a `file:` path and the source assets come from the repository root.

The new package does not duplicate that behavior. `@brydio/create-app` is a thin launcher that supplies a packaged asset root and the synchronized release version to `create()`. `brydio create` continues to use checkout assets and links, while the published launcher writes exact registry versions and no local overrides.

## Package and command

`packages/create-app` contains:

- `bin/create-app.ts`, a Bun shebang executable;
- `src/main.ts`, argument handling and the call into `@brydio/cli`;
- a package manifest and README;
- at release-build time, copies of `templates/` and `tsconfig.base.json` at the package root.

The command takes the app name as its first positional argument, defaults to the Preact template, and may accept `--template plain` for parity with the checkout command. Invalid arguments and `CreateRefused` errors return exit code 2 with the existing refusal words. The published package reads its own version and passes that exact version to `create()`, so every generated `@brydio/*` dependency is registry-resolvable and synchronized.

## Create dependency modes

`CreateOptions` gains an optional exact `version`. With no version, behavior is unchanged: dependencies and overrides point to `file:<sdk>/packages/<name>`. With a version, every existing `@brydio/*` dependency in the selected template is rewritten to that version and the generated package contains no `overrides`. Non-Brydio dependencies retain the template's exact versions.

The `sdk` option remains the asset root in both modes. The source launcher falls back to the repository root during workspace development; the compiled launcher finds `templates/` and `tsconfig.base.json` beside its published package manifest.

## Release artifacts

The release builder adds `create-app` to `RELEASED`, compiles its source, copies the repository templates and base configuration into `release/create-app`, and records those roots in the published `files` list. All seven package manifests and both template SDK dependency sets move together to `0.1.0-alpha.6`.

The tag workflow publishes `create-app` first under `next`, then the six existing packages. This fail-first order prevents a missing first-publish trust configuration from partially releasing the existing packages. After publication, `latest` must point only at `@brydio/create-app@0.1.0-alpha.6`; npm OIDC authenticates `publish` but not `dist-tag`, so that one tag assignment is an explicit authenticated owner action unless this machine already has a suitable interactive npm session.

A new npm package cannot receive a trusted-publisher relationship until it exists. If `@brydio/create-app` is still absent when the release is ready, the owner must first create it through an authenticated, provenance-producing GitHub publication, then configure `nakel-ola/brydio-sdk` / `release.yml` as its trusted publisher. No token is added to this repository and no provenance-free final release is substituted.

## Verification

Tests prove behavior rather than source text:

1. `create()` in registry mode writes exact versions, removes overrides, and still creates the manifest, screen, collection, and test.
2. The launcher defaults to Preact and reports refusals with the CLI contract.
3. `release:build --dry` packs all seven packages and the initializer tarball contains both templates and the base configuration.
4. A clean temporary consumer installs only the seven tarballs, runs the packed initializer, and the resulting app installs, builds, validates, type-checks, and passes its own tests with no `file:` dependency.
5. The full repository suite, type-check, publishable release build, reproducibility check, clean-tree check, tag/version match, GitHub workflow, npm versions, dist-tags, `gitHead`, and provenance are recorded before completion.

## Out of scope

This change does not alter production developer-mode policy, authentication, screen runtime contracts, package `latest` tags for the six existing SDK packages, or the unrelated dirty primary-checkout edit in `packages/cli/src/source-checks.ts`.
