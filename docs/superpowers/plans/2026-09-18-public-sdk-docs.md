# Public SDK documentation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every independent A9-F03 documentation and public-package readiness item reproducible, navigable, and checked against the SDK contracts without publishing or making owner decisions.

**Architecture:** Two deterministic generators own the bridge and manifest reference pages. Each generator reads the exported SDK contracts, keeps human explanations in an exhaustive typed map, and writes one Markdown file that tests compare character for character. Package READMEs ship beside compiled code, while release guidance records the verified external state and keeps owner-only actions explicit.

**Tech stack:** Bun 1.3.11, TypeScript 5.9, Zod 4, Markdown, Bun test.

**Spec:** `../brydio/tasks/apps/02-features/A9-third-party-and-assistant/F03-the-sdk-and-templates-go-public.md`

## Global constraints

- Do not edit `packages/api/**` or the Brydio host/API implementation.
- Do not publish packages, change repository visibility, choose a docs vendor/domain, or invent support/security addresses.
- Keep `npm create @brydio/app` excluded from this release.
- Treat `codex/a5-api` as the consumed SDK contract and preserve the six-package release order.
- Write tests before generator or release-artifact changes and observe the expected failure.

---

### Task 1: Generate the manifest reference from the schema

**Files:**
- Create: `scripts/docs-manifest.ts`
- Create: `packages/manifest/test/manifest-doc.test.ts`
- Modify: `docs/manifest.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: `baseManifestSchema`, `manifestExtensionsSchema`, `FIELD_LIMITS`, `DOCUMENT_LIMITS`, `HOST_CAPABILITIES`, `migrationStepSchema`, and `packages/manifest/examples/issues.json`.
- Produces: `manifestDoc(): string` and `bun run docs:manifest`.

- [ ] **Step 1: Write the failing contract test**

```ts
test('is generated from every manifest field', () => {
  expect(onDisk().trim()).toBe(manifestDoc().trim());
  expect(documentedFields()).toEqual([...schemaFields()].sort());
});

test('documents every field type and migration operation', () => {
  expect(missingFieldKinds()).toEqual([]);
  expect(missingMigrationOps()).toEqual([]);
});
```

- [ ] **Step 2: Run the test and observe the missing generator**

Run: `bun test packages/manifest/test/manifest-doc.test.ts`

Expected: FAIL because `scripts/docs-manifest.ts` does not exist.

- [ ] **Step 3: Implement the generator**

```ts
export function manifestDoc(): string {
  const fields = [...Object.keys(baseManifestSchema.shape), ...Object.keys(manifestExtensionsSchema.shape)];

  return renderManifestReference({ fields, issues: ISSUES_EXAMPLE, fieldKinds: FIELD_KINDS, migrationOps: MIGRATION_OPS });
}
```

The generated page must include the Issues example, every top-level field, collection schema syntax, every field kind, placements, grants, custom tools, migrations, and all exported limits.

- [ ] **Step 4: Generate the page and pass the focused tests**

Run: `bun run docs:manifest && bun test packages/manifest/test/manifest-doc.test.ts packages/manifest/test/limits-doc.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit the manifest reference**

```sh
git add package.json scripts/docs-manifest.ts docs/manifest.md packages/manifest/test/manifest-doc.test.ts
git commit -m "docs: generate the manifest reference"
```

### Task 2: Generate the bridge reference from the protocol

**Files:**
- Create: `scripts/docs-bridge.ts`
- Modify: `packages/cli/test/bridge-doc.test.ts`
- Modify: `docs/bridge.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WORKER_METHODS`, `HOST_METHODS`, protocol limit constants, and the public calls exported from `@brydio/app`.
- Produces: `bridgeDoc(): string` and `bun run docs:bridge`.

- [ ] **Step 1: Extend the bridge test before the generator exists**

```ts
test('is generated from every protocol method', () => {
  expect(onDisk().trim()).toBe(bridgeDoc().trim());
  expect(documentedMethods()).toEqual([...WORKER_METHODS, ...HOST_METHODS].sort());
});
```

- [ ] **Step 2: Run the test and observe the missing generator**

Run: `bun test packages/cli/test/bridge-doc.test.ts`

Expected: FAIL because `scripts/docs-bridge.ts` does not exist.

- [ ] **Step 3: Implement the typed exhaustive generator**

```ts
type ProtocolMethod = WorkerMethod | HostMethod;

interface MethodDoc {
  direction: 'app to Brydio' | 'Brydio to app';
  summary: string;
}

const METHOD_DOCS: Record<ProtocolMethod, MethodDoc> = methodDocs();

export function bridgeDoc(): string {
  return renderBridgeReference({ workerMethods: WORKER_METHODS, hostMethods: HOST_METHODS, methodDocs: METHOD_DOCS });
}
```

Keep the public call examples and refusal guidance, then add the raw worker/host protocol table derived from the arrays.

- [ ] **Step 4: Generate the page and pass the focused test**

Run: `bun run docs:bridge && bun test packages/cli/test/bridge-doc.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit the bridge reference**

```sh
git add package.json scripts/docs-bridge.ts docs/bridge.md packages/cli/test/bridge-doc.test.ts
git commit -m "docs: generate the bridge reference"
```

### Task 3: Ship useful package READMEs and accurate release guidance

**Files:**
- Create: `docs/README.md`
- Create: `packages/api/README.md`
- Create: `packages/app/README.md`
- Create: `packages/cli/README.md`
- Create: `packages/fake-host/README.md`
- Create: `packages/manifest/README.md`
- Create: `packages/cli/test/package-docs.test.ts`
- Modify: `packages/ui/README.md`
- Modify: `README.md`
- Modify: `docs/releasing.md`
- Modify: `docs/support.md`

**Interfaces:**
- Consumes: the verified npm inventory, GitHub visibility, release build output, and the six package contracts.
- Produces: one README in every tarball, a local docs index ready for a future static host, and release instructions that distinguish the five published packages from the unpublished API package.

- [ ] **Step 1: Make a focused release-artifact test require a README per package**

```ts
test('every release artifact explains its package', async () => {
  const built = await releaseBuild({ dry: true, out: () => {} });

  for (const [name, folder] of Object.entries(built)) {
    expect(readFileSync(join(folder, 'README.md'), 'utf8'), name).toContain(`# ${name}`);
  }
});
```

- [ ] **Step 2: Run the test and observe missing package READMEs**

Run: `bun test packages/cli/test/package-docs.test.ts`

Expected: FAIL for packages without `README.md`.

- [ ] **Step 3: Add package READMEs and the docs index**

Each package README must state the package's job, its supported entry points, a minimal example or command, runtime requirements, and links to the relevant reference page. `docs/README.md` links the manifest, elements, bridge, publish checklist, support, security, and release pages.

- [ ] **Step 4: Correct public-state prose**

Record that `manifest`, `ui`, `app`, `fake-host`, and `cli` are published at `0.1.0-alpha.0`; `api` returns npm 404 and needs its owner-run first publish plus trusted-publisher setup. Record that the GitHub repository is private and has no Pages site. Keep support/security addresses and docs hosting as owner blockers. State that `npm create @brydio/app` is excluded because templates and version selection are not yet packaged for it.

- [ ] **Step 5: Pass release and documentation tests**

Run: `bun test packages/cli/test/package-docs.test.ts packages/cli/test/bridge-doc.test.ts packages/manifest/test/manifest-doc.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit public-package documentation**

```sh
git add README.md docs/README.md docs/releasing.md docs/support.md packages/api/README.md packages/app/README.md packages/cli/README.md packages/fake-host/README.md packages/manifest/README.md packages/ui/README.md packages/cli/test/package-docs.test.ts
git commit -m "docs: prepare the public SDK packages"
```

### Task 4: Verify starter templates and update programme records

**Files:**
- Modify: `packages/cli/test/create.test.ts` only if the current tests do not directly prove the runtime-dependency and publish requirements.
- Modify outside the SDK checkout after verification: `tasks/apps/02-features/A9-third-party-and-assistant/F03-the-sdk-and-templates-go-public.md`, `HANDOVER.md`, `tasks/AGENTS-CHATS.md`.

**Interfaces:**
- Consumes: both templates, the CLI publish test seam, the npm inventory, and the final SDK test results.
- Produces: direct evidence for every checked feature box and a precise blocker list for every open one.

- [ ] **Step 1: Verify both templates without edits**

Run: `bun test packages/cli/test/create.test.ts packages/cli/test/publish.test.ts`

Expected: both templates install, build, validate, test, and type-check; the publish command builds, validates, and uploads through its server seam.

- [ ] **Step 2: Verify the complete SDK**

Run: `bun run check-types && bun test && bun run release:build --dry`

Expected: zero type errors, zero test failures, and all six release artifacts build.

- [ ] **Step 3: Re-read the feature line by line**

Check only directly proved items. Keep open: docs deployment and screenshots, `npm create`, production development access, 1.0 semver/deprecation/two-receiver promises, external-app parity, support/security addresses, repository visibility, first API publish, and any package release not evidenced on npm.

- [ ] **Step 4: Update counts and handoff notes**

Recompute programme counts from all feature files. Add the exact commands, commits, npm versions, GitHub visibility, and next owner actions to `HANDOVER.md` and the A9-F03 file.

- [ ] **Step 5: Append the completion note**

Post the SDK commits, verification totals, changed contracts, and remaining blockers to `tasks/AGENTS-CHATS.md`. Do not edit earlier messages.
