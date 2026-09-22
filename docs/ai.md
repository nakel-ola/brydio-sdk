# Brydio's AI

Your code can call Brydio's model without setting up a model provider. Brydio
runs the model and counts every call. There are two ways in, and which one to
use depends on where your code runs.

| Your code runs… | Use | Credential | Usage is counted against |
|---|---|---|---|
| inside an app, in a custom tool's handler | `model.generate` / `model.generateMany` | none: the `model` host grant | the app's publisher |
| on your own server, script, CLI or CI | `@brydio/api/ai` | a developer API key, `BRYDIO_API_KEY` | the key, and its publisher if it has one |

A developer API key never goes in an app. No part of an app (screen, worker or
handler) is given a Brydio credential. `brydio validate` and Brydio's publish
route both refuse a package that holds a key (`developer_key_in_bundle`), and
`validate` refuses a screen or handler that imports `@brydio/api/ai`
(`import_not_allowed`).

Usage is metered and shown in **Settings › Developer**, per key and per day,
with the in-app usage of each publisher you belong to. Nothing is charged yet.
Pricing and billing haven't been decided.

## Inside an app: the `model` grant

Ask for the grant in the manifest:

```json
{ "grants": { "tools": ["*"], "collections": ["*"], "host": ["model"] } }
```

A custom tool's handler then receives `model` in its context. A handler
supplies a prompt and a JSON Schema whose top level is an object. It can't
choose a provider, a model, tools or a system prompt:

```ts
export default async function ({ brief }, { model }) {
  return model.generate({
    prompt: `Plan a home page for: ${brief}`,
    schema: {
      type: 'object',
      required: ['title'],
      properties: { title: { type: 'string' } },
    },
  });
}
```

`model.generateMany([...])` runs up to 30 requests, six at a time, and returns
the answers in order. A prompt holds at most 12,000 characters, a schema at
most 16,000, and an answer at most 64,000.

Each call is recorded against the publisher of the app version that ran,
together with the person it ran for and their workspace.

## From your own code: `@brydio/api/ai`

1. In Brydio, open **Settings › Developer** and select **New key**. Choose what
   the key may call (Generate, Summarise, Agent) and, optionally, a publisher
   you own.
2. Copy the key. Brydio shows the whole key once, and after that only its
   prefix (`bry_live_…`).
3. Put it in your server's environment, never in a repository:

```sh
export BRYDIO_API_KEY=bry_live_…
export BRYDIO_API_URL=https://api.brydio.app   # your Brydio's API address
```

```ts
import { ai } from '@brydio/api/ai';

const { summary } = await ai.summarize({ text: report, length: 'short', format: 'bullets' });

const { object } = await ai.generate<{ title: string }>({
  prompt: 'A title for this changelog: …',
  schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
});

const { text } = await ai.agent({
  messages: [{ role: 'user', content: 'Draft a friendly reply to this ticket: …' }],
  instructions: 'Keep it under 80 words.',
});
```

`createAiClient({ apiKey, apiUrl, fetch })` makes a client with its settings
fixed rather than read from the environment. The client refuses to run in a
browser page or a worker, where a key would reach whoever loads it.

### The routes

Every route takes `Authorization: Bearer bry_live_…`. A person's Brydio
session isn't accepted here, and a key isn't accepted anywhere else.

| Route | Scope | Body | Answer |
|---|---|---|---|
| `POST /api/v1/ai/generate` | `ai:generate` | `prompt` or `messages` (one of the two), optional `system`, optional `schema` | `{ text, object?, model, usage }` |
| `POST /api/v1/ai/summarize` | `ai:summarize` | `text`, optional `length` (`short`, `medium`, `long`), optional `format` (`paragraph`, `bullets`) | `{ summary, model, usage }` |
| `POST /api/v1/ai/agent` | `ai:agent` | `messages`, optional `instructions` | `{ text, model, usage }` |

`messages` is a list of up to 50 `{ role: "user" | "assistant", content }`,
with the user's message last and 100,000 characters in all. A `prompt` holds
at most 32,000 characters, `text` at most 100,000, and `system` or
`instructions` at most 4,000. `usage` is `{ inputTokens, outputTokens }`.

The agent is Brydio's assistant with **no workspace tools**. It can't read
anyone's files, chats, projects or people, and says so if asked.

### Errors

A failed call throws `BrydioAiError` with Brydio's own message, the HTTP
`status`, and a `reason` code where Brydio gives one.

| Status | Reason | Meaning |
|---|---|---|
| 400 | `request_invalid` | The body isn't one the route takes; the message says which field. |
| 401 | | The key is missing, malformed, unknown or revoked. |
| 403 | | The key doesn't have the route's scope. |
| 429 | `rate_limited` | The key made more than its calls a minute (60 by default). |
| 502 | `model_failed` | Brydio's model couldn't answer. Try again. |

A call that reaches a route appears in the key's usage, including one
answered 400, 429 or 502. A 401 or 403 doesn't: the call stopped before the
route.

## Keys

- A key belongs to the person who made it. Only they can list or revoke it.
- Brydio stores a hash of the key, never the key itself.
- Revoking is immediate and permanent.
- A person can hold at most 20 keys that haven't been revoked.
- A key tied to a publisher records that publisher on each call it makes.
  You can only tie a key to a publisher you own.
