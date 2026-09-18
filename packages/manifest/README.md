# @brydio/manifest

The schema and validation rules for `.brydio/app.json`. It covers app identity,
placements, screens, collections, generated and custom tools, grants, and
migrations.

```ts
import { defineManifest } from '@brydio/manifest';

export const manifest = defineManifest({
  name: 'checklist',
  version: '0.1.0',
  screens: { home: { entry: 'screens/home.js' } },
  placements: [{ kind: 'project-tab', screen: 'home', label: 'Checklist' }],
});
```

Read the [manifest reference](https://github.com/nakel-ola/brydio-sdk/blob/main/docs/manifest.md)
for every field, schema type, grant, migration operation, and limit. The
[publish checklist](https://github.com/nakel-ola/brydio-sdk/blob/main/docs/publish-checklist.md)
lists every validation code and its refusal message.

This package is MIT licensed. While the SDK is `0.x`, a minor version may
contain a breaking change. Read the repository changelog before upgrading.
