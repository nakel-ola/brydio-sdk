# Contract notes

Where Brydio's contracts (`brydio/tasks/apps/01-architecture/02-contracts.md`),
its agents' channel and its committed host code disagree, or leave a choice,
and which way the SDK went. **The committed host code wins** every time; the
file it was read from is named so the next person can check it again.

Read against Brydio at `f28d98b` plus Kestrel's uncommitted
`apps/api/src/apps/screens/**` (the mount and the screen's tool calls), on
16 September 2026.

## The boot and the worker

1. **The SDK does no stripping.** The first SDK draft wrapped `fetch`,
   `XMLHttpRequest`, sockets, storage and `postMessage` itself, from a boot
   module `brydio build` put first in every bundle. Contracts §11 (Kestrel,
   11:05) and `apps/api/src/apps/frame/frame-page.ts` make the boot Brydio's:
   the frame page starts a worker from a `blob:` prelude that takes those names
   away and then `import()`s the app's entry. The SDK's `boot.ts`, its entry
   and its test are gone. The runtime only speaks §9 over `self.postMessage`
   and `self.addEventListener('message')`.
2. **The worker is classic, the entry is still an ES module.** §11 step 3 was
   amended (Kestrel, 16 Sep): Chromium won't start a module worker from a blob
   in an opaque-origin frame, so the prelude runs in a classic worker and
   `import()`s the module. Nothing changes for the SDK: `brydio build` still
   writes one ES module per screen.
3. **The fake host runs Brydio's prelude.** `packages/fake-host/src/prelude.ts`
   is a copy of `workerPrelude` from `frame-page.ts`, so a screen under test
   meets the same walls. Bun has no `XMLHttpRequest`, `indexedDB` or `caches`,
   so those names are simply absent there rather than refused.

## The tree protocol (§9 as built)

4. **Every message is a notification.** §9 says JSON-RPC 2.0 "same envelope as
   views/bridge.ts". `frame/screen-session.ts` answers a `tools/call` with a
   `tools/result { id, result }` or `tools/error { id, error }` notification
   whose params carry the call's id. It never sends a plain JSON-RPC response.
   The runtime sends the id in the envelope and in the params, and reads only
   the notification.
5. **`props` merges; `null` unsets.** The first SDK draft sent a node's whole
   settings in every `props` op. `tree/tree-store.ts` merges them, deleting a
   setting whose value is `null`, so the runtime sends only the settings that
   changed, with `null` for one taken away.
6. **An inserted node arrives empty, and carries its settings.** `insert`
   refuses a node with `children`; its children follow as their own inserts,
   parent first. The store checks settings on insert, including the required
   ones (`bry-button` needs a `label`), so the runtime describes an inserted
   node when the patch is sent, with its settings as they ended up in that
   microtask, rather than as they were when it was inserted. Settings changed
   on a node that was inserted in the same patch are not sent again.
7. **Which elements hold anything, and text too.** §10 is silent. The first
   SDK draft let `bry-text` and `bry-heading` hold text nodes and refused
   bare text in a stack. The host's declarations say `children: true` for a
   stack, a grid, a label, a card and a list row, and `false` for the rest,
   with no rule about what kind of child. The SDK matches: a text or a
   heading takes its words as the `text` setting, the JSX types say
   `children?: never` where the host says `false`, and a `#text` node may sit
   in any element that holds children.
8. **Required settings and lengths.** Not in §10. The host requires `text` on
   `bry-heading` and `bry-text` and `label` on `bry-button`, caps a label, a
   title and a heading at 200 characters, a paragraph and a text node at
   4,000, and ids at 128. `@brydio/ui` copies the host's `ELEMENTS` exactly and
   its refusal sentences word for word; `test/catalogue.test.ts` compares the
   two whenever a Brydio checkout sits beside this repository.
9. **`level` is a whole number.** §10 says `level: 1..3`; the host's spec is
   `{ kind: 'int', min: 1, max: 3 }`, which refuses `"2"`. The SDK does too.
10. **`align` and `justify` values** are the host's: `start | center | end |
    stretch` and `start | center | end | between`.
11. **`tree/refused` params are `{ op, node?, reason }`**, with `op` the op's
    name as a string (`mount`, `insert`, …), not the op object. The runtime
    logs one nobody listens for, naming the op, the node and the reason.
12. **The cap counts the root.** 5,000 nodes including the root; the host
    refuses the insert once the tree holds 5,000. The runtime refuses the same
    insert locally, and a mount of more than 5,000 is never sent.
13. **Budgets.** No `worker/ready` within 10 s, or no `tree/mount` within 2 s of
    it, and the host stops the app; so do three refusals, a message over
    512 KB, a `worker/ready` with another protocol, and a load failure. The
    runtime mounts as soon as the host's context arrives, whether or not the
    screen has drawn anything yet, and the fake host enforces the same
    budgets (a test can shorten them).
14. **`worker/ready` carries `sdk`.** Additive; the host reads `protocol` and
    `app` only.

## Data, tools and host calls

15. **`data/get` and `data/list` are refused until Phase 1.** The host answers
    both with `data/error { id, error: { code: -32601 } }`. `@brydio/app`'s
    `data.get` and `data.list` therefore call the collection's generated
    `get_<label>` and `list_<plural>` tools, which the host checks and audits
    like any other screen call. `data.list` answers `{ items, nextCursor }`,
    the list tool's own shape (the first draft said `cursor`).
16. **A tool's own refusal is a result, not an error.** The executor returns
    `{ isError: true, content, structuredContent: { error: 'stale', current } }`
    for a stale update, a missing record or a field it won't take, and the
    host passes that on as `tools/result`. `tools.call` resolves with
    `structuredContent` and rejects with a `ToolError` (`code` from
    `structuredContent.error`, `message` the first line of the text) when
    `isError` is set. `tools.result` hands back the whole answer. A
    `tools/error` (a refusal by the host, a failure, or the person choosing
    *Don't allow*) rejects with a `HostError` whose `code` is JSON-RPC's
    number (-32000), not a word.
17. **Tool names use the label's plural.** `generated-tools.ts` names the list
    and search tools `list_${label}s`, not after the collection. For
    `issues`/`issue` the two agree; for a `people` collection labelled
    `person` it is `list_persons`. `brydio build` bakes each collection's
    label and plural into the bundle so the runtime never has to guess.
18. **`ui/navigate` is dropped until Phase 1**, and `ui/toast` is cut at 200
    characters. The runtime still sends both; `navigate` needs the `navigate`
    host grant locally.
19. **Grants are checked locally only when the bundle knows them.** The host
    grants everything in Phase 0; the runtime refuses a call its built
    manifest does not ask for, before it leaves, so a missing grant is found
    before Phase 1 enforces it.

## The manifest

20. **`@brydio/manifest` is the server's schema, copied.** The first SDK draft
    was a hand-written validator with its own codes, written before the server
    schema existed, and it disagreed in places: it refused `"boolean?"`,
    `"token?"` and `"string[]?"`, two placements of one kind, a host grant
    other than `navigate` and `message`; it accepted fields called
    `createdAt`, `createdBy`, `updatedAt` and `deletedAt`, which the server
    reserves; it accepted a `data.<collection>.index` list the server
    strips; and it allowed two `project` fields. `src/base.ts`,
    `src/field-types.ts` and `src/schema.ts` are now copies of
    `extensions/apps/manifest.schema.ts`, `apps/manifest/field-types.ts` and
    `apps/manifest/manifest-ext.schema.ts`, and `validateManifest` answers
    exactly what `appManifestSchema.safeParse` answers, with the server's
    `data_*` and `placement_*` codes and `manifest_invalid` for a wrong shape.
    `test/manifest.test.ts` parses a corpus with both schemas and compares.
21. **A screen's entry is `.js` or `.mjs`.** The server's `screenSchema`
    regex required `.js`, while the bundle store (`bundle-files.ts`) and the
    mount (`screen-mount.service.spec.ts` pins `board.mjs`) took `.mjs` too.
    Hodler (16 Sep 14:04) and E1 (14:12) settled it: the schema gives. The SDK
    accepts `.mjs` entries everywhere it checks one (the schema, `build`,
    `validate`, `dev`), with the refusal sentence of the data helper's
    widened regex ("An entry is a .js or .mjs path inside the bundle.", on
    disk in `manifest-ext.schema.ts` on 16 Sep, not yet committed). While a
    Brydio checkout's regex still says `.js` only, `manifest.test.ts` leaves
    the `.mjs` case out of the comparison with the server's schema.
22. **`index` on a collection** (contracts §5, "unless listed in `index`") is
    not in the server's schema. It parses and is dropped. The SDK example no
    longer uses it.

## The bundle

23. **The fingerprint** is sha256 hex over, in sorted path order,
    `path + "\0" + sha256hex(bytes) + "\n"` for every file but the root
    `app.json`: one NUL byte and one newline (Hodler, 11:24 and its
    correction). `bundleHash` in `@brydio/manifest` is checked against a value
    worked out by hand with `shasum`, and against `bundle-files.ts` itself
    when Brydio is beside this repository.
24. **The cap counts the manifest; the hash does not.** 1,048,576 bytes over
    every file including `app.json`. A bundle holds `.js`, `.mjs` and the root
    `app.json` only, with the server's path rules and refusal sentences.
25. **`app_version.record` refuses an entry that isn't a script in the bundle.**
    `brydio validate` checks the same against `dist/`.
26. **No development placement.** §7's `POST /apps/dev/placements` is not
    built, so `brydio dev` serves `dist/` with the bundle route's headers but a
    local Brydio can only load a build through
    `apps/api/scripts/put-app-bundle.ts`, one new version number at a time.

## Publishing

27. **`brydio publish` targets Hodler's route as built** (`ad80184`,
    `apps/api/src/apps/publishing/app-publish.controller.ts`, and his post of
    16 Sep 14:24): `POST /api/v1/apps/publish` with `{ archiveBase64 }`, the
    built folder zipped, signed in with a bearer token (`BRYDIO_TOKEN`, the
    Clerk session token `auth.ts`'s `sessionFrom` verifies). 201 is a new
    version and 200 (`created: false`) the same version again, both with
    `{ appKey, version, versionId, bundleHash, publishedBy, publishedAt,
    files }`, `files` being API paths the CLI prefixes with the address;
    409 `{ reason: 'version_exists', message }`; 422 `{ reason, message, at }`;
    423 Apps off. The contracts file has no section for the route yet.
28. **The zip is the SDK's own writer** (`packages/cli/src/zip.ts`): deflate,
    unix file modes, no timestamps, sorted, so the same build is the same
    upload. `publish.test.ts` unpacks it with the server's `unpack` whenever a
    Brydio checkout sits beside this repository.
29. **Not in the CLI:** screenshots (it says no pictures were attached) and
    the "only the first publisher or one they name" rule, which is the
    server's alone.
30. **Which SDK built a version** (A5-F04-S03; Hodler's proposal at 14:44,
    built as `84712c6`). `brydio build`
    writes `"sdk"`, the version of the `@brydio/app` the app's folder
    resolves (or the CLI's own when it resolves none), into `dist/app.json`,
    overwriting and warning (`manifest_sdk_overwritten`) about one written by
    hand; `validate` leaves `sdk` out when it compares the built manifest.
    `@brydio/manifest`'s schema takes `sdk` as an optional semver, as
    `manifest-ext.schema.ts` does. The host's range is `{ oldest, before }`
    from `GET /api/v1/apps/sdk` (the proposal said `newest`; the code says
    `before`, exclusive, its prereleases excluded too), so `sdkRefusal` and
    `compareVersions` are copies of `publishing/sdk-support.ts` and
    `versions/compare-versions.ts`, taking the range as an argument. `brydio
    publish` asks the route first, with the token, and refuses before
    uploading with the server's `sdk_unsupported` sentence; a 404 there means
    a Brydio from before the check, and the upload goes ahead, saying so.
31. **The catalogue is compared at HEAD, not on disk.** Several agents add
    elements in the same checkout, so `catalogue.test.ts` exports
    `packages/app/src/apps/catalogue` from `git archive HEAD` and compares
    with that. `d92803e` registers eight elements (`bry-table`,
    `bry-virtual-list`, `bry-dialog`, `bry-menu`, `bry-date`, `bry-split`,
    `bry-checkbox`, `bry-switch`) whose own files are not committed, so HEAD's
    `elements.ts` does not import on its own; the test stands in for the
    missing files and leaves those names out until they land. Synced so far:
    the first fifteen (`56ab13e`, `a9fce89`) and the button's `working` and
    the card's `loading` (`d92803e`), with the host's `options` kind for a
    select's choices.

