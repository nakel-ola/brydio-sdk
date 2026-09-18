# The bridge

A screen runs in a worker with no page, network, storage, cookies, or server
address. The SDK bridge is its only route into Brydio.

The wire protocol is `brydio-tree/1`. **This page is generated** by
`bun run docs:bridge`. The protocol table reads `WORKER_METHODS` and
`HOST_METHODS` directly, and every limit below reads its exported constant.
Do not edit this page by hand.

## Errors

| Error | Who refused | What to do |
|---|---|---|
| `GrantError` | The app's own manifest did not ask for the tool, collection, or host grant. | Add the named grant to `.brydio/app.json`. |
| `HostError` | Brydio refused or failed the request. | Read its `message`. Code `-32000` is a refusal. |
| `ToolError` | The tool ran and returned `isError`. | Use its tool code and data. On `stale`, read the record again. |
| `TeardownError` | Brydio stopped the screen before a reply arrived. | Do not retry from the worker that is stopping. |

`tools.call` rejects a tool result with `isError`. `tools.result` returns the
whole `ToolResult` instead.

## Public calls

### `connect()`

Sends `worker/ready` once and resolves with `HostContext`. `mount()` calls it
for a screen that draws immediately.

### `host.context` and `host.subscribe(listener)`

`host.context` is the latest context or `null`. `host.subscribe` receives each
later theme, size, selection, placement, or instance update and returns an
unsubscribe function.

### `tools.call(tool, input)` and `tools.result(tool, input)`

Calls one generated or custom tool. A write waits for Brydio to show an
approval card. A missing manifest grant throws `GrantError` before the message
leaves the worker.

### `data.get(collection, id)` and `data.list(collection, query)`

`data.get` returns one record. `data.list` accepts `filter`, `sort`, `limit`,
and `cursor`; a page is 50 by default, 200 at most.
The result carries `items` and `nextCursor`.

### `data.watch(collection, onChange, onEnd)`

Watches one collection and returns a function that stops. Each change has only
`{ id, op, version }`, so the screen reads the record again under current
access. One open app may watch at most 5 collections.

### `navigate(to)`

Opens a chat, file, project, or app item and resolves with `{ opened }`. It
needs `navigate` in `grants.host`.

### `toast(text, tone)`

Shows one Brydio toast in the `info`, `success`, or `danger` tone. Text is cut at 200 characters.

### `mount(build, options)`

Connects, gives the plain builder a remote root and `HostContext`, and sends
the first tree. That tree must arrive within 2 seconds. The Preact entry point has
its own `mount`; a screen uses one or the other.

### `onTeardown(listener)`

Runs when Brydio stops the screen. Use it to release local resources. Calls
started during teardown will not receive an answer.

## `@brydio/api`

`api.projects`, `api.files`, `api.chats`, and `api.connections` are typed
calls over `api/call`. The app receives no token, cookie, API address, or
connection credential. Each family needs `projects`, `files`, `chats`, or the
exact `connection:<name>` host grant. `*` never grants a connection. Reads run
after Brydio checks the current person. Writes wait for **Allow once**.

```ts
import { api } from '@brydio/api';

const projects = await api.projects.list();
const issues = await api.connections.use('github').request({
  path: '/repos/brydio/brydio/issues',
  query: { state: 'open' },
});
```

A connection path is relative. `GET` and `HEAD` are reads. `POST`, `PUT`,
`PATCH`, and `DELETE` are approval-gated writes.

## Protocol methods

| Method | Direction | Payload | Result or effect |
|---|---|---|---|
| `worker/ready` | app to Brydio | `WorkerReadyParams`: protocol, app name/version, SDK and capabilities | Starts the session; Brydio answers with `host/context`. |
| `tree/mount` | app to Brydio | `TreeMountParams`: root id and the complete first node list | Replaces the empty tree. It must arrive inside the first-tree budget. |
| `tree/patch` | app to Brydio | `TreePatchParams`: ordered insert, remove, move, props and text operations | Changes the mounted tree. A refused operation produces `tree/refused`. |
| `tools/call` | app to Brydio | `ToolsCallParams`: call id, tool name and input record | `tools/result` or `tools/error` with the same id. |
| `api/call` | app to Brydio | `ApiCallParams`: one closed `ApiAction` and its input record | `api/result` or `api/error`. Writes wait for Brydio approval. |
| `data/get` | app to Brydio | `{ collection, id }` plus the envelope id | `data/result` with one record, or `data/error`. |
| `data/list` | app to Brydio | `{ collection, filter?, sort?, limit?, cursor? }` plus the envelope id | `data/result` with one page, or `data/error`. |
| `data/subscribe` | app to Brydio | `DataWatchParams`: collection, plus the envelope id | `data/result` starts the watch; changes arrive as `data/changed`. |
| `data/unsubscribe` | app to Brydio | `DataWatchParams`: collection, plus the envelope id | `data/result` after the host stops that watch. |
| `ui/navigate` | app to Brydio | `UiNavigateParams`: a chat, file, project, or app item target | `ui/result` with `{ opened }`, or `ui/error`. |
| `ui/toast` | app to Brydio | `UiToastParams`: text and optional tone | No reply. Brydio shows the sentence in its own toast. |
| `host/members` | app to Brydio | `{ ids? }` plus the envelope id | `host/result` with visible member names, or `host/error`. |
| `host/projects` | app to Brydio | `{ ids }` plus the envelope id | `host/result` with visible project names, or `host/error`. |
| `ui/message` | app to Brydio | `{ text, target? }` plus the envelope id | `ui/result` after Brydio opens or appends to a chat, or `ui/error`. |
| `tree/ack` | app to Brydio | `{ node, name }` after the event handler starts | No reply. It lets Brydio clear the event budget. |
| `dev/updated` | app to Brydio | `DevUpdatedParams`: build number | No reply. The development host keeps the worker. |
| `dev/restart` | app to Brydio | `DevUpdatedParams`: build number and reason | No reply. The development host replaces the worker. |
| `host/context` | Brydio to app | `HostContext`: theme, locale, placement, instance, selection and size | Resolves `connect()` the first time and notifies context subscribers later. |
| `tree/event` | Brydio to app | `TreeEventParams`: node id, event name and optional detail | Runs the element handler. An ack-capable worker sends `tree/ack`. |
| `tree/refused` | Brydio to app | `TreeRefusedParams`: operation, optional node and reason | Notifies refusal listeners. The third refusal stops the app. |
| `tools/result` | Brydio to app | `ToolsResultParams`: call id and `ToolResult` | Resolves `tools.result`; `tools.call` rejects if `isError` is true. |
| `tools/error` | Brydio to app | `ToolsErrorParams`: call id and JSON-RPC error | Rejects the matching tool call with `HostError`. |
| `api/result` | Brydio to app | `{ id, result }` | Resolves the matching `@brydio/api` call. |
| `api/error` | Brydio to app | `{ id, error }` | Rejects the matching `@brydio/api` call with `HostError`. |
| `data/result` | Brydio to app | `DataResultParams`: request id and result | Resolves a get, list, subscribe or unsubscribe request. |
| `data/error` | Brydio to app | `{ id, error }` | Rejects the matching data request with `HostError`. |
| `data/changed` | Brydio to app | `DataChangedParams`: collection and id/op/version changes | Calls every listener for that watched collection. |
| `data/ended` | Brydio to app | `DataEndedParams`: collection and reason | Ends that watch and calls its `onEnd` listeners. |
| `ui/result` | Brydio to app | `UiResultParams`: request id and result | Resolves the matching navigation or message request. |
| `ui/error` | Brydio to app | `{ id, error }` | Rejects the matching UI request with `HostError`. |
| `host/result` | Brydio to app | `{ id, result }` | Resolves the matching member or project name request. |
| `host/error` | Brydio to app | `{ id, error }` | Rejects the matching host request with `HostError`. |
| `dev/update` | Brydio to app | `DevUpdateParams`: new entry URL and build number | The worker answers `dev/updated` or `dev/restart`. |
| `worker/teardown` | Brydio to app | No required fields | Rejects pending work with `TeardownError`, runs teardown listeners, and stops. |

## Limits

| Limit | Value | What happens |
|---|---|---|
| One message | **512 KB** | Brydio stops the app rather than reading it. |
| Refusals | **3** | The third refused tree operation stops the app. |
| Loading the code | **10 s** | From the frame appearing to `worker/ready`. |
| First tree | **2 s** | From `worker/ready` to `tree/mount`. |
| A node's id | **128 characters** | Longer ids are refused. |
| A toast | **200 characters** | Longer text is cut. |

Calls per minute are Brydio's limit, not an SDK constant. An administrator
sees the rate in app activity. A rate refusal is a `HostError` with a message
written for the builder.
