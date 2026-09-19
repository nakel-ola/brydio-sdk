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
development apps. `brydio publish` validates, pictures, signs when a key is
configured, and uploads one immutable app version.

Read the [publish checklist](https://github.com/nakel-ola/brydio-sdk/blob/main/docs/publish-checklist.md)
for every check and refusal code. Start a new Preact app from anywhere with
`npm create @brydio/app my-app`; `@brydio/create-app` carries the templates and
writes exact registry versions instead of checkout links.

This package needs Bun 1.3 or newer and is MIT licensed. While the SDK is
`0.x`, a minor version may contain a breaking change. Read the repository
changelog before upgrading.
