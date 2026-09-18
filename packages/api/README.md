# @brydio/api

Typed project, file, chat, and named-connection calls for a Brydio app screen.
Every request travels through `@brydio/app`; the screen receives no token,
cookie, API address, or connection credential.

```ts
import { api } from '@brydio/api';

const projects = await api.projects.list();
const issues = await api.connections.use('github').request({
  path: '/repos/brydio/brydio/issues',
  query: { state: 'open' },
});
```

The manifest needs the matching `projects`, `files`, `chats`, or exact
`connection:<name>` host grant. Reads run after Brydio checks the current
person. Writes wait for the person's **Allow once** approval.

Read the [`@brydio/api` bridge section](https://github.com/nakel-ola/brydio-sdk/blob/main/docs/bridge.md#brydioapi)
for the security boundary and wire contract.

This package is MIT licensed. While the SDK is `0.x`, a minor version may
contain a breaking change. Read the repository changelog before upgrading.
