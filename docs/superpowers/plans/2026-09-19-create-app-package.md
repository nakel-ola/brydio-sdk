# Create App Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a synchronized SDK release whose `@brydio/create-app` package makes a clean Preact app through `npm create @brydio/app <name>` without a source checkout.

**Architecture:** Keep app creation in `@brydio/cli`; add an explicit registry-version mode and a thin packaged initializer that supplies its own assets and version. Extend the deterministic release builder and tarball consumer proof to include the initializer, then publish all seven packages through the existing tag workflow.

**Tech Stack:** Bun 1.3.11, TypeScript 5.9.3, npm 11 trusted publishing, GitHub Actions OIDC.

**Spec:** `docs/superpowers/specs/2026-09-19-create-app-package-design.md`

## Global Constraints

- Base all work on SDK commit `8d8eb50` in `/private/tmp/brydio-sdk-create-app`; do not touch the primary checkout's modified `packages/cli/src/source-checks.ts`.
- Keep all seven package versions synchronized at `0.1.0-alpha.6` and all generated `@brydio/*` dependencies exact.
- Publish all seven packages under `next`; assign `latest` only to `@brydio/create-app`.
- Preserve clean-tree refusal, changelog requirement, OIDC trusted publishing, npm provenance, MIT metadata, deterministic artifacts, and single-line conventional commits.
- Write and observe each failing behavior test before implementation.

---

### Task 1: Registry dependency mode

**Files:**
- Modify: `packages/cli/test/create.test.ts`
- Modify: `packages/cli/src/create.ts`

**Interfaces:**
- Consumes: existing `create(name, options)` and packaged template JSON.
- Produces: `CreateOptions.version?: string`; when present, generated `@brydio/*` dependencies equal that version and `overrides` is absent.

- [ ] **Step 1: Write the failing registry-mode test**

Add a test that calls `create('registry-app', { sdk: SDK_ROOT, version: '0.1.0-alpha.6', template: 'preact', install: false })`, then asserts literal `0.1.0-alpha.6` values for every Brydio dependency, no `file:` value anywhere, no `overrides`, and preserved `preact`, TypeScript, and Bun type versions.

- [ ] **Step 2: Verify the test fails for checkout links**

Run: `bun test packages/cli/test/create.test.ts --filter 'uses exact registry versions'`

Expected: FAIL because the generated package still contains `file:/private/tmp/brydio-sdk-create-app/packages/...` and an `overrides` object.

- [ ] **Step 3: Implement the minimal mode switch**

Add `version?: string` to `CreateOptions`. Rewrite only dependency names beginning with `@brydio/` to `options.version` when present; otherwise retain current file links. Include `overrides` only in checkout mode.

- [ ] **Step 4: Verify focused and existing create behavior**

Run: `bun test packages/cli/test/create.test.ts`

Expected: all create tests pass, including existing checkout-link cases.

### Task 2: Standalone initializer

**Files:**
- Create: `packages/create-app/package.json`
- Create: `packages/create-app/README.md`
- Create: `packages/create-app/bin/create-app.ts`
- Create: `packages/create-app/src/main.ts`
- Create: `packages/create-app/test/main.test.ts`

**Interfaces:**
- Consumes: `create`, `CreateRefused`, `TEMPLATES`, and `Template` from `@brydio/cli`.
- Produces: `main(argv, out): Promise<number>` and executable `create-app`.

- [ ] **Step 1: Write the failing launcher tests**

Cover a Preact default, `--template plain`, missing/invalid names, invalid templates, and propagation of the package's exact version into generated dependencies. Use a disposable asset root and `install: false` through an injectable launch seam so tests exercise real file creation without registry access.

- [ ] **Step 2: Verify the launcher module is missing**

Run: `bun test packages/create-app/test/main.test.ts`

Expected: FAIL because `packages/create-app/src/main.ts` does not exist.

- [ ] **Step 3: Implement the launcher**

Parse one name and optional `--template`; default to `preact`. Resolve packaged assets, read the initializer's package version, call `create()` with `sdk`, `version`, and the selected template, and translate refusals to exit code 2. Keep the bin to a shebang, import, and `process.exit(await main(...))`.

- [ ] **Step 4: Verify launcher behavior**

Run: `bun test packages/create-app/test/main.test.ts packages/cli/test/create.test.ts`

Expected: all tests pass.

### Task 3: Release assets and clean tarball consumer

**Files:**
- Modify: `scripts/release-build.ts`
- Modify: `packages/cli/test/release.test.ts`
- Modify: `packages/cli/test/package-docs.test.ts`

**Interfaces:**
- Consumes: `RELEASED`, deterministic release compilation, root templates, root `tsconfig.base.json`.
- Produces: `release/create-app` with compiled bin/source, README, LICENSE, both templates, and base config; a clean consumer created only from tarballs.

- [ ] **Step 1: Extend release tests before production changes**

Require `@brydio/create-app` in the tarball map, assert the packed asset files exist, install the tarballs into an empty temporary launcher folder, invoke its real `create-app` bin, and assert the generated manifest has one screen and collection plus the Preact screen and test. Assert the generated package has no `file:` values.

- [ ] **Step 2: Verify release tests fail**

Run: `bun test packages/cli/test/release.test.ts`

Expected: FAIL because `create-app` is absent from `RELEASED` and no packaged assets exist.

- [ ] **Step 3: Extend the release builder minimally**

Add `create-app` to `RELEASED`. Copy `templates/` and `tsconfig.base.json` from the repository root into its target after compilation, add them to published `files`, and preserve deterministic traversal and metadata.

- [ ] **Step 4: Prove the clean generated consumer**

Run: `bun test packages/cli/test/release.test.ts packages/cli/test/package-docs.test.ts`

Expected: tarball install, create, generated-app install, build, validate, test, type-check, declarations, licensing, and reproducibility all pass.

### Task 4: Synchronized release metadata

**Files:**
- Modify: `packages/{manifest,ui,app,api,fake-host,cli,create-app}/package.json`
- Modify: `templates/{preact,plain}/package.json`
- Modify: `bun.lock`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `packages/cli/README.md`
- Modify: `docs/releasing.md`
- Modify: `.github/workflows/release.yml`
- Modify: `packages/cli/test/release.test.ts`

**Interfaces:**
- Consumes: shared SDK version and current tag workflow.
- Produces: one `0.1.0-alpha.6` release, `create-app` published first under `next`, documented bootstrap/trust and `latest` owner action.

- [ ] **Step 1: Add failing synchronization and workflow tests**

Assert every `RELEASED` manifest has one literal version, every template's Brydio dependency uses it, the publish loop matches `RELEASED`, `create-app` is first, and the workflow still uses `--access public`, `--tag next`, and `--provenance`.

- [ ] **Step 2: Verify the new release contract fails**

Run: `bun test packages/cli/test/release.test.ts`

Expected: FAIL until the workflow order and synchronized version metadata include `create-app`.

- [ ] **Step 3: Apply the alpha.6 release metadata**

Bump all seven packages and both templates to `0.1.0-alpha.6`, refresh `bun.lock`, add the changelog entry and public usage docs, update the release inventory/order/bootstrap note, and publish `create-app` first in the OIDC loop.

- [ ] **Step 4: Verify metadata and types**

Run: `bun test packages/cli/test/release.test.ts && bun run check-types && git diff --check`

Expected: all commands exit 0.

### Task 5: Commit, publish, and record evidence

**Files:**
- Modify after publication: `docs/releasing.md` if registry evidence changes the recorded state.
- Modify in Brydio coordination repository: `tasks/apps/02-features/A9-third-party-and-assistant/F03-the-sdk-and-templates-go-public.md`.

**Interfaces:**
- Consumes: clean committed release tree, GitHub remote, npm registry.
- Produces: pushed release commit/tag, successful workflow, seven registry artifacts under `next`, `create-app` under `latest`, provenance and clean external command proof.

- [ ] **Step 1: Run the full pre-commit gate**

Run: `bun install --frozen-lockfile`, `bun run check-types`, `bun test`, `bun run release:build`, `bun test packages/cli/test/release.test.ts`, and `git diff --check`.

Expected: 0 failures and a clean publishable build after committing.

- [ ] **Step 2: Commit with explicit paths**

Stage only named files and commit a single-line conventional message such as `feat: package the create app experience`.

- [ ] **Step 3: Build from the clean commit and verify artifacts**

Run `bun run release:build`, pack each release folder, inspect the create tarball file list, and repeat the clean temporary consumer proof against those exact committed tarballs.

- [ ] **Step 4: Push the branch/release commit and tag**

Push the reviewed commit, create and push `v0.1.0-alpha.6` only after the commit is the intended release source, then watch the release workflow to completion. If first-package npm trust blocks before any package publish, stop publication and report the exact owner bootstrap action; do not add a token or publish a provenance-free replacement.

- [ ] **Step 5: Verify registry state and exact public command**

Read every `@brydio/*@0.1.0-alpha.6` version, dist-tag, `gitHead`, and provenance. Run `npm create @brydio/app <disposable-name>` from a clean temporary directory, then install, build, validate, type-check, and test the resulting app.

- [ ] **Step 6: Record completion evidence**

Update the A9-F03-S01 checklist only for claims proved by the exact published command. Append branch, commit, tag, workflow, package, dist-tag, provenance, and consumer evidence to `tasks/AGENTS-CHATS.md`; leave unproved boxes open and name any owner action precisely.
