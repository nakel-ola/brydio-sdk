# The bridge

Everything a screen can ask Brydio to do, and what comes back when it will
not. A screen runs in a worker with no page, no network and no storage of its
own, so this is the whole of its reach — there is nothing else to call.

Each call below is a method on `@brydio/app`. Its limits are the host's, not
suggestions: `packages/cli/test/bridge-doc.test.ts` reads the numbers out of
the code and fails if this page says anything else.

## What a refusal looks like

Four errors, and which one you get says who refused.

| Error | Means | What to do |
|---|---|---|
| `GrantError` | The app asked for something **its own manifest never asked to be granted**. Thrown in the worker, before anything reaches Brydio. | Add the tool, collection or capability to `grants` in `.brydio/app.json`. The message names it. |
| `HostError` | **Brydio** refused or failed the call. `code` is JSON-RPC's; `-32000` is a refusal. | Read `message`: it is written for a person. A refusal is usually a grant the workspace did not give, or a person saying no. |
| `ToolError` | The tool **ran and said no**. `code` is the tool's own word — `stale`, `refused`, `invalid` — and `data` carries what it sent; for `stale`, the record as it is now under `current`. | For `stale`, read the record again and offer the person the newer one. |
| `TeardownError` | The host **stopped the screen** before the answer arrived. | Nothing. The worker is going; do not retry. |

A tool that answers with `isError` rejects as a `ToolError` through
`tools.call`. Use `tools.result` where you would rather have the whole result
than a rejection.

## `connect()`

Says hello and resolves with the `HostContext`: the theme, the locale, the
placement, the instance, what the person has selected and the size the screen
is drawn at. Nothing an app sends reaches Brydio before this has resolved.

`mount()` does it for you, so a screen that draws needs only one of the two.

## `host.context` and `host.subscribe(listener)`

`host.context` is the latest context, or `null` before the first has arrived.
`subscribe` calls the listener each time Brydio sends it again — the person
changed theme, resized the tab, selected something else — and returns a
function that stops listening.

## `tools.call(tool, input)` and `tools.result(tool, input)`

Calls one of the app's tools: the generated ones for its collections, and any
the manifest declares. **A write waits for the person to agree first** — that
is Brydio's, not the app's, and an app cannot skip it.

- `call` resolves with what the tool returned and rejects on refusal.
- `result` answers with the whole `ToolResult`, `isError` and all.

A tool the manifest does not ask for is a `GrantError` before the call leaves
the worker.

## `api.projects`, `api.files`, `api.chats` and `api.connections`

Import these from `@brydio/api`. They are typed reads and writes over Brydio's
own projects, files and chats, plus a named connection the person has already
made. The app receives no session token, cookie, API address or OAuth token.

Each family needs its host grant: `projects`, `files`, `chats`, or the exact
`connection:<name>`. `*` covers the first three and never a connection. Reads
run after Brydio checks the installed grant and the current person's access.
Writes wait for Brydio's approval card and run the server-held request only
after **Allow once**.

```ts
import { api } from '@brydio/api';

const projects = await api.projects.list();
const issues = await api.connections.use('github').request({
  path: '/repos/brydio/brydio/issues',
  query: { state: 'open' },
});
```

A connection request takes a relative path, never an origin. `GET` and `HEAD`
are reads. `POST`, `PUT`, `PATCH` and `DELETE` are approval-gated writes.

## `data.get(collection, id)`

One record by id, through the generated `get_*` tool.

## `data.list(collection, query)`

A page of records, through the generated `list_*` tool.

- **Page size: 50 by default, 200 at most.** Asking for more is refused
  rather than quietly trimmed.
- The answer carries the records and a cursor when there are more.

## `data.watch(collection, onChange, onEnd)`

Calls `onChange` with each burst of changes to a collection — whoever made
them, the person, the assistant or another screen — until the function it
returns is called.

- **A change names a record (`{ id, op, version }`) and never says what it
  holds.** Read it again: that way a watch can never leak a record the person
  may not see.
- **At most five collections watched per open app.**
- `onEnd` hears why Brydio stopped or refused the watch.

## `navigate(to)`

Asks Brydio to open a chat, a file, a project or one of the app's own items,
and resolves with `{ opened }`. Needs the `navigate` host capability, so
without it in `grants.host` it is a `GrantError`.

## `toast(text, tone)`

One sentence in Brydio's own toast, with `tone` of `info`, `success` or
`danger`. **Cut at 200 characters.** It is not a way to draw: it is for
saying what just happened.

## `mount(build, options)`

Connects and draws a screen with the plain API: `build` is handed the root and
the host's context, and whatever it appends goes up as the first tree. It
resolves with the root, so a later change is `root.append(…)` and the host
sees it.

The Preact binding in `@brydio/app/preact` has its own `mount`, which does the
same thing with components; a screen uses one or the other, not both.

**The first tree has to go up within 2 seconds of connecting**, so do the
drawing first and the reading after: append what you have, then fill it in
when `data.list` answers.

## `onTeardown(listener)`

Called when Brydio stops the screen, before the worker ends. For letting go
of what you are holding, not for a last call — nothing will answer.

## The limits every call lives under

| Limit | Value | What happens |
|---|---|---|
| One message | **512 KB** | Brydio stops the app rather than reading it. |
| Refusals | **3** | The third refusal stops the app: an app that keeps asking for what it was told it cannot have is not going to stop by itself. |
| Loading the code | **10 s** | From the frame appearing to the worker saying hello. |
| First tree | **2 s** | From hello to the first `tree/mount`. |
| A node's id | **128 characters** | |
| A toast | **200 characters** | Cut to fit. |

Calls per minute are the host's, and a workspace's administrator sees them in
the app's activity; a call refused for going too fast is a `HostError` that
says so.
