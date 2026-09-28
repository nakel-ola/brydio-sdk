# Changelog

Every package here shares one version, so this is one changelog. Each entry
says what changed and, where something you wrote has to change with it, what
to do about it.

## What the version number means

**While the SDK is `0.x`, a minor may break you.** That is what `0.x` is for,
and it is the honest state: the catalogue's declarations are still moving
between packages, and nothing outside Brydio is published against them yet.
A break will always appear here with what to change, but it will not
necessarily come with a new major.

**It goes to `1.0.0` when the SDK is genuinely open to people outside the
Brydio team** (E1, 18 Sep). From that version on, the usual promise holds: a
breaking change is a new major, a new element or setting is a minor, and a
fix is a patch. The number starts meaning something on the day somebody could
rely on it, which is the day it changes.

**An element or a setting is never removed in a minor.** It is marked
deprecated first, `brydio validate` says so with what to use instead, and it
goes no sooner than the next major.

## 0.1.0-alpha.19

- `bry-markdown` `quote` (a label, "Add to comment"): selecting text offers that button; pressing it raises `quote` with `{ text }` (up to 4,000 characters), as Multica's annotations do. Mermaid blocks draw as diagrams, in Brydio's sealed frame.
- `bry-comment` actions gain `quote` ("Quote reply").
- `bry-rich-text` writes and reads GFM tables, code blocks coloured by language, and `$$…$$` maths; markdown pasted as plain text becomes what it describes.

## 0.1.0-alpha.18

- `useMembers` / `useProjects` ask again (after 2, 4, 8 and 16 seconds) when Brydio refuses a name lookup, for instance at its read limit. Before, a name refused once stayed blank until the screen reopened.

## 0.1.0-alpha.17

- `copy(text | { route })`: put text, or a full link to one of the app's own pages, on the clipboard (bridge `ui/copy`). Resolves with whether it was copied.
- `download(name, text, type?)`: hand the person a text file to save — CSV, plain text, Markdown or JSON, up to 5 MB (bridge `ui/download`).
- `navigate({ kind: 'route', path, newTab: true })` opens one of the app's pages in a Brydio tab of its own.
- `bry-list-row` and `bry-work-card` `press` now carry `{ shift, mod }` when Shift or ⌘/Ctrl was held (nothing otherwise), for "Shift-click does the other".
- `bry-split` fills the stack it sits in.
- FakeHost records `copied` and `downloads`, and keeps its route when a page opens in a new tab.

## 0.1.0-alpha.16

- `bry-property` members: a single assignee is named beside their face (except `display="icon"` and `"dot"`), as in Multica's property rows.

## 0.1.0-alpha.15

- The editor plugin is rebuilt from this catalogue (0.1.0-alpha.14's was not,
  and was never published).

## 0.1.0-alpha.14

- `bry-stack variant="inset"`: a full-width work area with the page's gutter.
- The compose dialog, the peek, filter chips and removable rows close with a
  plain ✕.

## 0.1.0-alpha.13

- **`brydio dev` runs an app's custom tools.** It sends the built handlers
  with every good build, and Brydio runs a development app's tools from them,
  so an app no longer has to be published before its tools can be tried.
- **`bry-spreadsheet` raises `all`**, not `selectAll`: an app's `onSelectAll`
  handler never heard the camel-cased name. Every event name is now lower case.
- `bry-input` raises `blur` and `cancel` (Escape) and can `autofocus`.
- `bry-list-row` work rows take a `lead` child before the identifier and can
  be `muted`; `bry-glyph kind="progress"` draws a completion ring.
- A `compose` dialog shows its `description` as a hint beside its actions.

## 0.1.0-alpha.11

- **Planning and issue-tracker elements.** New `bry-glyph`, `bry-property`,
  `bry-quick-add`, `bry-work-card`, `bry-page-header`, `bry-entity-row`,
  `bry-filter-menu`, `bry-filter-chip`, `bry-peek`, `bry-spreadsheet` (with
  `-row` and `-group`), `bry-rich-text`, `bry-board-lane`, `bry-gantt`,
  `bry-timeline` (with `-item`), `bry-comment`, `bry-reactions`,
  `bry-property-list` (with `-row`) and `bry-keys`.
- **Richer existing elements.** A `compose` dialog; bare inputs and
  textareas; menus with a heading, ticked items and submenus (`parent`);
  list, lanes and plan boards; stacked and work list rows with their own
  menus; `page-body` and `action-bar` stacks; count badges; about forty new
  icon names.
- **Toasts can open a page.** `toast(text, tone, { label, route })` adds a
  button that opens one of the app's own pages.
- **`brydio dev` shows an app where its manifest places it**: the project's
  and the workspace's sidebars, not only a project tab.

## 0.1.0-alpha.10

- **FakeHost now models nested pages completely.** Tests receive
  `context.route`, route navigation is validated like Brydio, and successful
  navigation updates the test host context without restarting the screen.

## 0.1.0-alpha.9

- **App screens can own nested pages.** Read `context.route.path` and call
  `navigate({ kind: 'route', path: '/issues/123/details' })` to move within the
  current placement with normal browser and desktop history.
- **Full-page work surfaces have first-class catalogue variants.** Page,
  toolbar, scrolling section, work-row, and plain empty-state presentations
  let apps reproduce dense native project tools without a centered wrapper.

## 0.1.0-alpha.8

- **App placements have stable keys.** A manifest placement may declare a
  `key`, letting one screen provide several distinct project or workspace
  surfaces such as Plan's List, Sprint, and Sprint folder. Brydio returns the
  resolved key with every offer and stores it on the placement.
- **Older manifests keep working.** When a placement omits `key`, Brydio and
  the SDK derive the existing `kind:screen` identity.

## 0.1.0-alpha.7

- **`@brydio/api/ai` calls Brydio's AI from your own server** with a
  developer API key (`BRYDIO_API_KEY`, made in Brydio's Settings ›
  Developer): `ai.generate`, `ai.summarize` and `ai.agent`. It is for code you
  run, never an app. Inside an app a handler keeps using the `model` grant.
  See `docs/ai.md`.
- **`brydio validate` refuses a developer API key in an app**, as
  `developer_key_in_bundle`, wherever it is: the manifest, a source, or any
  built file. It also refuses importing `@brydio/api/ai` from a screen or
  handler. If validate finds your key, revoke it in Settings › Developer.

Two rules for every app, from the owner's decisions of 22 September 2026.
**Both break an app that doesn't meet them**: `brydio validate` and Brydio's
publish route now refuse it.

- **A logo and an icon, each in colour and in one colour (ADR-A20).** Add
  `"logo": { "color": "./…", "mono": "./…" }` and the same for `"icon"`, and
  the four images beside the manifest. `brydio build` copies them into the
  bundle. The one-colour images are a PNG with transparency, or an SVG in
  one colour or `currentColor`; the sidebar tints them with the theme. The
  templates ship Brydio's plain mark in `brand/` to start from. A one-path
  `icon` still reads, but no longer publishes. Codes: `brand_*`, in
  [the publish checklist](docs/publish-checklist.md).
- **Something the assistant can call (ADR-A19).** A collection with generated
  tools, a custom tool, a server in `servers.json` or an integration in
  `integrations/`. An app with none is `app_has_no_tools`.

## 0.1.0-alpha.6

The packaged create experience.

- **`npm create @brydio/app <name>` starts outside an SDK checkout.** The new
  `@brydio/create-app` package carries the Preact and plain templates plus the
  shared TypeScript configuration.
- **Generated apps use exact registry dependencies.** The standalone command
  writes `@brydio/*@0.1.0-alpha.6` and no checkout `file:` paths or overrides;
  `brydio create` inside this repository keeps its local-link behavior.
- **The release proof starts from the initializer tarball.** A clean temporary
  consumer installs the compiled package, creates the Preact app, then installs,
  builds, validates, type-checks, and tests it without source-workspace links.

Existing apps need no source changes. New apps need Bun 1.3 or newer and can
start with `npm create @brydio/app my-app`.

## 0.1.0-alpha.5

The placement-context and public documentation release.

- **Placement settings reach app screens.** `HostContext.placement` now carries
  the optional settings declared for that installed placement.
- **Apps may declare the `model` host grant.** The manifest, validation words,
  fake host and recorded Brydio contract now agree on the grant used by
  assistant-backed screens.
- **The public documentation site is generated from the SDK.** It covers every
  catalogue element with real light and dark renderer captures, plus the
  package, manifest, bridge and publish-checklist references.
- **Published packages include npm provenance.** The source repository is now
  public, so the trusted-publishing workflow can attach verifiable build
  provenance without an npm token.

Apps that need per-placement configuration should read
`context.placement.settings`. Apps that call the host model must add `model` to
their manifest's host grants.

## 0.1.0-alpha.4

The complete app API release, with the installed CLI restored.

- **The `brydio` executable remains attached to `@brydio/cli`.** npm 11 no
  longer accepts a leading `./` in a published `bin` path; the release build
  now writes the canonical `bin/brydio.js` path npm expects.

`0.1.0-alpha.3` published all six packages successfully, but npm removed that
CLI mapping while normalizing its package manifest. Use this release instead.

## 0.1.0-alpha.3

The app API release.

- **`@brydio/api`** adds typed project, file, chat and named-connection calls
  through Brydio's authenticated app bridge. Apps receive no token, cookie or
  server address, and writes wait for the person's approval in Brydio.
- **The fake host** can answer app API calls, so a compiled screen can test the
  same bridge it uses in Brydio.
- **All six packages publish together** in dependency order.

Nothing to change unless an app adopts `@brydio/api`; declare the matching
`projects`, `files`, `chats` or exact `connection:<name>` host grant first.

`0.1.0-alpha.1` was tagged, but the release stopped before publishing because
the support and private security addresses had not yet been chosen.
`0.1.0-alpha.2` was tagged after that fix, but npm rejected provenance from
the private source repository before publishing any package.

## 0.1.0-alpha.0

The first packages: `@brydio/manifest`, `@brydio/ui`, `@brydio/app`,
`@brydio/fake-host` and `@brydio/cli`.

- **`brydio create`, `dev`, `build`, `validate`, `test` and `publish`.** Every
  check `validate` runs, with the sentence it refuses with, is
  [the publish checklist](docs/publish-checklist.md).
- **The catalogue**: every element a screen may draw, with its settings —
  [elements.md](docs/elements.md), generated from the catalogue itself.
- **The manifest**: its fields, types and migrations —
  [manifest.md](docs/manifest.md).
- **The fake host**, so an app's own tests run without Brydio.
- **What is supported and what is not**: [support.md](docs/support.md), and
  [security.md](docs/security.md) for a security report.

Nothing to change: there is nothing before this.
