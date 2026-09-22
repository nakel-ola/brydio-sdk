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

## Brydio's AI from your own server: `@brydio/api/ai`

For code you run yourself (a backend, a script, CI), not for an app. It takes
a developer API key from **Settings › Developer** in Brydio, read from
`BRYDIO_API_KEY`, and your Brydio's address from `BRYDIO_API_URL`:

```ts
import { ai } from '@brydio/api/ai';

const { summary } = await ai.summarize({ text: report, length: 'short' });
```

Never put a key in an app. Inside an app, a custom tool's handler calls
`model.generate` with the `model` host grant instead, and needs no key.
`brydio validate` refuses an app that holds a key or imports
`@brydio/api/ai`. Read [Brydio's AI](https://github.com/nakel-ola/brydio-sdk/blob/main/docs/ai.md).

This package is MIT licensed. While the SDK is `0.x`, a minor version may
contain a breaking change. Read the repository changelog before upgrading.
