# Brydio's AI

Your code can call Brydio's model without setting up a model provider. Brydio
runs the model and counts every call. There are two ways in, and which one to
use depends on where your code runs.

| Your code runs… | Use | Credential | Usage is counted against |
|---|---|---|---|
| inside an app, in a custom tool's handler | `model.generate`, `summarize`, `chat`, `stream` | none: the `model` host grant | the app's publisher, on the person's chosen source |
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
supplies words, optionally a JSON Schema whose top level is an object, and a
level. It can't choose a provider, a model, a key or tools:

```ts
export default async function ({ brief }, { model }) {
  return model.generate({
    prompt: `Plan a home page for: ${brief}`,
    level: 'smart',
    schema: {
      type: 'object',
      required: ['title'],
      properties: { title: { type: 'string' } },
    },
  });
}
```

| Call | Answers |
|---|---|
| `model.generate({ prompt, schema, system?, level? })` | the object, following `schema` |
| `model.generate({ prompt, system?, level? })` | the answer as plain text |
| `model.generateMany([...])` | up to 30 answers, six at a time, in order |
| `model.summarize({ text, length?, format?, level? })` | `{ summary, source, notice? }`; `length` is `short`, `medium` (default) or `long`, `format` `paragraph` (default) or `bullets` |
| `model.chat(messages, { instructions?, level? })` | `{ role: 'assistant', content, source, notice? }`, the next turn |
| `model.stream({ prompt } \| { messages }, …)` | `{ text, source, notice? }`, sent to the calling screen as it arrives |

A prompt holds at most 12,000 characters, a schema 16,000, `text` 100,000,
`system` or `instructions` 4,000, and an answer 64,000. `messages` is up to 50
`{ role: 'user' | 'assistant', content }`, the user's last. The model has no
tools and can't see the workspace.

### Levels, and where the answer comes from

`level` is `fast` (the default) or `smart`. Brydio maps it to a model on the
source the person chose for all of Brydio's AI: Brydio's AI, their own API
key, a key their company gave them, the workspace's key, or a model on their
Mac. The handler never sees the key. `source` in an answer says which one
answered, and `notice` says what was passed over when it wasn't the person's
first choice.

Whose work a call is decides which sources it may use:

- A call from a screen, or from the person's assistant, is their own work and
  follows their list. A Mac answers only a screen call made in the desktop
  app, and only once Brydio can send it one-off requests; until then the next
  source answers and `notice` says so.
- A call from a timer, a bot or a visitor's public page is the workspace's,
  and uses the workspace's source. It never uses anyone's own key or Mac.

When no allowed source can answer, the call rejects with words a screen can
show, for example "No AI source you can use here could answer. Your Mac only
answers in the desktop app."

### Streaming to the screen

`model.stream` sends each piece of the answer to the screen that called the
tool, while the handler waits for the whole of it:

```ts
// The handler
export default async function ({ topic }, { model }) {
  const { text } = await model.stream({ prompt: `Draft a reply about ${topic}` });
  return { text };
}

// The screen
let draft = '';
const { text } = await tools.call('draft_reply', { topic }, {
  onText: piece => { draft += piece; render(draft); },
});
```

Without `onText`, or from a timer or the assistant, `stream` answers as
`generate` does. The host sends each piece as `tools/text` before
`tools/result`; a host from before streaming sends only the result.

Each call is recorded against the publisher of the app version that ran,
together with the person it ran for, their workspace, and the source that
answered.

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
