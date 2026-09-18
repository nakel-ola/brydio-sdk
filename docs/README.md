# SDK documentation

These pages are the public contract for Brydio app builders. A static docs
site can publish this directory once the owner chooses its domain and host.
Until then, the repository renders every page directly.

For a browsable static build, renderer captures, and the local authoring
commands, see the [SDK documentation site](../docs-site/README.md).

- [Manifest](manifest.md) lists every field, collection schema type, grant,
  placement, migration operation, and limit. It includes the full Issues
  manifest as a worked example.
- [Catalogue](elements.md) lists every element and setting a screen may draw.
- [Bridge](bridge.md) covers every public SDK call, protocol method, limit,
  and error.
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
