# What is supported, and what is not

This page says what you can build on and expect us to keep working, what we
may change without warning, and how to tell us something is wrong
(`tasks/apps` A9-F03-S04).

## Supported

These are the SDK. If one of them breaks, that is a bug and we want to hear
about it.

- **`@brydio/app`** — the worker runtime, the Preact bindings, and the calls a
  screen makes: `data/*`, `tools.call`, `navigate`, `host`, `onToolResult`.
- **`@brydio/manifest`** — the manifest's shape, its field types and its
  migrations, and the sentences it refuses with.
- **`@brydio/ui`** — the catalogue: the elements a screen may draw, their
  settings, their events and the tokens they are drawn with.
- **`@brydio/cli`** — `brydio create`, `dev`, `build`, `validate`, `test` and
  `publish`, and the problem codes they report. Those codes and sentences are
  listed in [the publish checklist](publish-checklist.md), which is held to
  what the code actually says by a test.
- **`@brydio/fake-host`** — the host your app's own tests run against.

What "supported" means here: the shapes above, the sentences the tools refuse
with, and the behaviour these docs describe. **While the packages are 0.x, a
new minor may break them** — that is what 0.x is for, and it is why the
version stays there until the SDK is genuinely open to people outside Brydio.

## Not supported

- **Brydio's own repository.** The application, its API and its database are
  not a public interface. Nothing in the SDK imports from it (a test holds
  that), and neither should anything you build.
- **Brydio's internal routes.** An app talks to Brydio through the bridge in
  `@brydio/app` and nothing else. A screen has no network of its own, and
  the routes the host uses are free to change.
- **Anything not written down here or in the reference.** If the only way to
  find a behaviour is to read our source, it is not a promise — please ask
  rather than build on it.
- **The web-component build of the catalogue**, until it ships.

## Telling us something is wrong

Email [support@brydio.app](mailto:support@brydio.app) with the package name,
version and a small reproduction. Do not include credentials, workspace data
or security details.

Send security problems privately to
[security@brydio.app](mailto:security@brydio.app), as described in
[security.md](security.md). Do not open a public issue for a vulnerability.
