# SDK documentation

These pages are the public contract for Brydio app builders. A static docs
site can publish this directory once the owner chooses its domain and host.
Until then, the repository renders every page directly.

For a browsable static build, renderer captures, and the local authoring
commands, see the [SDK documentation site](../docs-site/README.md).

- [Manifest](manifest.md) lists every field, collection schema type, grant,
  placement, migration operation, and limit. It includes the full Issues
  manifest as a worked example.
- [Open-schema collections](open-schema.md) covers collections whose fields
  people define at runtime: the companion's shape, the open types, keys, and
  how a retype moves values.
- [Catalogue](elements.md) lists every element and setting a screen may draw.
- [Bridge](bridge.md) covers every public SDK call, protocol method, limit,
  and error.
- [Chat cards, other apps' tools, the directory and webhooks](host-seams.md)
  covers a handler's `chat`, `directory` and `webhooks` grants and calling
  another installed app's tool.
- [Timers](timers.md) covers a handler's `timers` grant: running one of the
  app's own tools at a time or on a repeat.
- [Brydio's AI](ai.md) covers calling Brydio's model: from a handler with
  the `model` grant, or from your own server with a developer API key.
- [Publish checklist](publish-checklist.md) matches the checks and messages
  printed by `brydio validate` and the publish path.
- [Support](support.md) says which packages and interfaces are supported.
- [Security](security.md) describes what belongs in a private security report.
- [Releasing](releasing.md) records the reproducible six-package release
  process and the owner-only npm steps.

The catalogue, bridge, and manifest pages are generated from code. Run:

```sh
bun run docs:elements
bun run docs:bridge
bun run docs:manifest
```

Tests compare each generated page with its checked-in copy. A contract change
without regenerated documentation fails the suite.
