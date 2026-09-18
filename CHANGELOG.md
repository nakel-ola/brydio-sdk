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

## 0.1.0-alpha.2

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
