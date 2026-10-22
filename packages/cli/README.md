# @brydio/cli

The `brydio` command builds, validates, tests, develops, and publishes a
Brydio app.

```sh
bun add -d @brydio/cli
bunx brydio build
bunx brydio validate
bunx brydio test
```

`brydio dev` serves a local build for a Brydio workspace that permits
development apps. `brydio login` signs in to the app registry
(`https://registry.brydio.com`), and `brydio publish` validates, pictures,
signs when a key is configured, and uploads one immutable app version there,
under a tag (`latest` unless `--tag`) and an access (`workspace` or
`--access public`). `brydio pack` lists what would ship, `brydio version`
raises the manifest's version, `brydio tag`, `deprecate`, `access` and
`retire` change an app on the registry, and `brydio upgrade-sdk` moves every
`@brydio/*` pin to one SDK version.

Read the [publish checklist](https://github.com/nakel-ola/brydio-sdk/blob/main/docs/publish-checklist.md)
for every check and refusal code. Start a new Preact app from anywhere with
`npm create @brydio/app my-app`; `@brydio/create-app` carries the templates and
writes exact registry versions instead of checkout links.

This package needs Bun 1.3 or newer and is MIT licensed. While the SDK is
`0.x`, a minor version may contain a breaking change. Read the repository
changelog before upgrading.
