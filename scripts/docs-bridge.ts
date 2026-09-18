#!/usr/bin/env bun
/** Write `docs/bridge.md` from the public bridge API and protocol method lists. */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  HOST_METHODS,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  MAX_ID_CHARS,
  MAX_MESSAGE_BYTES,
  MAX_REFUSALS,
  MAX_TOAST_CHARS,
  MAX_WATCHES,
  PROTOCOL,
  READY_BUDGET_MS,
  START_BUDGET_MS,
  WORKER_METHODS,
  type HostMethod,
  type WorkerMethod,
} from '../packages/app/src/protocol.ts';

const ROOT = resolve(import.meta.dir, '..');

interface ProtocolDoc {
  payload: string;
  result: string;
}

const PROTOCOL_DOCS: Record<WorkerMethod | HostMethod, ProtocolDoc> = {
  'worker/ready': {
    payload: '`WorkerReadyParams`: protocol, app name/version, SDK and capabilities',
    result: 'Starts the session; Brydio answers with `host/context`.',
  },
  'tree/mount': {
    payload: '`TreeMountParams`: root id and the complete first node list',
    result: 'Replaces the empty tree. It must arrive inside the first-tree budget.',
  },
  'tree/patch': {
    payload: '`TreePatchParams`: ordered insert, remove, move, props and text operations',
    result: 'Changes the mounted tree. A refused operation produces `tree/refused`.',
  },
  'tools/call': {
    payload: '`ToolsCallParams`: call id, tool name and input record',
    result: '`tools/result` or `tools/error` with the same id.',
  },
  'api/call': {
    payload: '`ApiCallParams`: one closed `ApiAction` and its input record',
    result: '`api/result` or `api/error`. Writes wait for Brydio approval.',
  },
  'data/get': {
    payload: '`{ collection, id }` plus the envelope id',
    result: '`data/result` with one record, or `data/error`.',
  },
  'data/list': {
    payload: '`{ collection, filter?, sort?, limit?, cursor? }` plus the envelope id',
    result: '`data/result` with one page, or `data/error`.',
  },
  'data/subscribe': {
    payload: '`DataWatchParams`: collection, plus the envelope id',
    result: '`data/result` starts the watch; changes arrive as `data/changed`.',
  },
  'data/unsubscribe': {
    payload: '`DataWatchParams`: collection, plus the envelope id',
    result: '`data/result` after the host stops that watch.',
  },
  'ui/navigate': {
    payload: '`UiNavigateParams`: a chat, file, project, or app item target',
    result: '`ui/result` with `{ opened }`, or `ui/error`.',
  },
  'ui/toast': {
    payload: '`UiToastParams`: text and optional tone',
    result: 'No reply. Brydio shows the sentence in its own toast.',
  },
  'host/members': {
    payload: '`{ ids? }` plus the envelope id',
    result: '`host/result` with visible member names, or `host/error`.',
  },
  'host/projects': {
    payload: '`{ ids }` plus the envelope id',
    result: '`host/result` with visible project names, or `host/error`.',
  },
  'ui/message': {
    payload: '`{ text, target? }` plus the envelope id',
    result: '`ui/result` after Brydio opens or appends to a chat, or `ui/error`.',
  },
  'tree/ack': {
    payload: '`{ node, name }` after the event handler starts',
    result: 'No reply. It lets Brydio clear the event budget.',
  },
  'dev/updated': {
    payload: '`DevUpdatedParams`: build number',
    result: 'No reply. The development host keeps the worker.',
  },
  'dev/restart': {
    payload: '`DevUpdatedParams`: build number and reason',
    result: 'No reply. The development host replaces the worker.',
  },
  'host/context': {
    payload: '`HostContext`: theme, locale, placement, instance, selection and size',
    result: 'Resolves `connect()` the first time and notifies context subscribers later.',
  },
  'tree/event': {
    payload: '`TreeEventParams`: node id, event name and optional detail',
    result: 'Runs the element handler. An ack-capable worker sends `tree/ack`.',
  },
  'tree/refused': {
    payload: '`TreeRefusedParams`: operation, optional node and reason',
    result: 'Notifies refusal listeners. The third refusal stops the app.',
  },
  'tools/result': {
    payload: '`ToolsResultParams`: call id and `ToolResult`',
    result: 'Resolves `tools.result`; `tools.call` rejects if `isError` is true.',
  },
  'tools/error': {
    payload: '`ToolsErrorParams`: call id and JSON-RPC error',
    result: 'Rejects the matching tool call with `HostError`.',
  },
  'api/result': {
    payload: '`{ id, result }`',
    result: 'Resolves the matching `@brydio/api` call.',
  },
  'api/error': {
    payload: '`{ id, error }`',
    result: 'Rejects the matching `@brydio/api` call with `HostError`.',
  },
  'data/result': {
    payload: '`DataResultParams`: request id and result',
    result: 'Resolves a get, list, subscribe or unsubscribe request.',
  },
  'data/error': {
    payload: '`{ id, error }`',
    result: 'Rejects the matching data request with `HostError`.',
  },
  'data/changed': {
    payload: '`DataChangedParams`: collection and id/op/version changes',
    result: 'Calls every listener for that watched collection.',
  },
  'data/ended': {
    payload: '`DataEndedParams`: collection and reason',
    result: 'Ends that watch and calls its `onEnd` listeners.',
  },
  'ui/result': {
    payload: '`UiResultParams`: request id and result',
    result: 'Resolves the matching navigation or message request.',
  },
  'ui/error': {
    payload: '`{ id, error }`',
    result: 'Rejects the matching UI request with `HostError`.',
  },
  'host/result': {
    payload: '`{ id, result }`',
    result: 'Resolves the matching member or project name request.',
  },
  'host/error': {
    payload: '`{ id, error }`',
    result: 'Rejects the matching host request with `HostError`.',
  },
  'dev/update': {
    payload: '`DevUpdateParams`: new entry URL and build number',
    result: 'The worker answers `dev/updated` or `dev/restart`.',
  },
  'worker/teardown': {
    payload: 'No required fields',
    result: 'Rejects pending work with `TeardownError`, runs teardown listeners, and stops.',
  },
};

const table = (headings: string[], rows: string[][]): string =>
  [
    `| ${headings.join(' | ')} |`,
    `|${headings.map(() => '---').join('|')}|`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ].join('\n');

const protocolRows = (methods: readonly (WorkerMethod | HostMethod)[], direction: string): string[][] =>
  methods.map(method => [`\`${method}\``, direction, PROTOCOL_DOCS[method].payload, PROTOCOL_DOCS[method].result]);

/** The complete bridge reference, suitable for writing or checking in a test. */
export function bridgeDoc(): string {
  return [
    '# The bridge',
    '',
    'A screen runs in a worker with no page, network, storage, cookies, or server',
    'address. The SDK bridge is its only route into Brydio.',
    '',
    `The wire protocol is \`${PROTOCOL}\`. **This page is generated** by`,
    '`bun run docs:bridge`. The protocol table reads `WORKER_METHODS` and',
    '`HOST_METHODS` directly, and every limit below reads its exported constant.',
    'Do not edit this page by hand.',
    '',
    '## Errors',
    '',
    table(
      ['Error', 'Who refused', 'What to do'],
      [
        ['`GrantError`', "The app's own manifest did not ask for the tool, collection, or host grant.", 'Add the named grant to `.brydio/app.json`.'],
        ['`HostError`', 'Brydio refused or failed the request.', 'Read its `message`. Code `-32000` is a refusal.'],
        ['`ToolError`', 'The tool ran and returned `isError`.', 'Use its tool code and data. On `stale`, read the record again.'],
        ['`TeardownError`', 'Brydio stopped the screen before a reply arrived.', 'Do not retry from the worker that is stopping.'],
      ],
    ),
    '',
    '`tools.call` rejects a tool result with `isError`. `tools.result` returns the',
    'whole `ToolResult` instead.',
    '',
    '## Public calls',
    '',
    '### `connect()`',
    '',
    'Sends `worker/ready` once and resolves with `HostContext`. `mount()` calls it',
    'for a screen that draws immediately.',
    '',
    '### `host.context` and `host.subscribe(listener)`',
    '',
    '`host.context` is the latest context or `null`. `host.subscribe` receives each',
    'later theme, size, selection, placement, or instance update and returns an',
    'unsubscribe function.',
    '',
    '### `tools.call(tool, input)` and `tools.result(tool, input)`',
    '',
    'Calls one generated or custom tool. A write waits for Brydio to show an',
    'approval card. A missing manifest grant throws `GrantError` before the message',
    'leaves the worker.',
    '',
    '### `data.get(collection, id)` and `data.list(collection, query)`',
    '',
    '`data.get` returns one record. `data.list` accepts `filter`, `sort`, `limit`,',
    `and \`cursor\`; a page is ${LIST_LIMIT_DEFAULT} by default, ${LIST_LIMIT_MAX} at most.`,
    'The result carries `items` and `nextCursor`.',
    '',
    '### `data.watch(collection, onChange, onEnd)`',
    '',
    'Watches one collection and returns a function that stops. Each change has only',
    '`{ id, op, version }`, so the screen reads the record again under current',
    `access. One open app may watch at most ${MAX_WATCHES} collections.`,
    '',
    '### `navigate(to)`',
    '',
    'Opens a chat, file, project, or app item and resolves with `{ opened }`. It',
    'needs `navigate` in `grants.host`.',
    '',
    '### `toast(text, tone)`',
    '',
    `Shows one Brydio toast in the \`info\`, \`success\`, or \`danger\` tone. Text is cut at ${MAX_TOAST_CHARS} characters.`,
    '',
    '### `mount(build, options)`',
    '',
    'Connects, gives the plain builder a remote root and `HostContext`, and sends',
    `the first tree. That tree must arrive within ${START_BUDGET_MS / 1000} seconds. The Preact entry point has`,
    'its own `mount`; a screen uses one or the other.',
    '',
    '### `onTeardown(listener)`',
    '',
    'Runs when Brydio stops the screen. Use it to release local resources. Calls',
    'started during teardown will not receive an answer.',
    '',
    '## `@brydio/api`',
    '',
    '`api.projects`, `api.files`, `api.chats`, and `api.connections` are typed',
    'calls over `api/call`. The app receives no token, cookie, API address, or',
    'connection credential. Each family needs `projects`, `files`, `chats`, or the',
    'exact `connection:<name>` host grant. `*` never grants a connection. Reads run',
    'after Brydio checks the current person. Writes wait for **Allow once**.',
    '',
    '```ts',
    "import { api } from '@brydio/api';",
    '',
    'const projects = await api.projects.list();',
    "const issues = await api.connections.use('github').request({",
    "  path: '/repos/brydio/brydio/issues',",
    "  query: { state: 'open' },",
    '});',
    '```',
    '',
    'A connection path is relative. `GET` and `HEAD` are reads. `POST`, `PUT`,',
    '`PATCH`, and `DELETE` are approval-gated writes.',
    '',
    '## Protocol methods',
    '',
    table(
      ['Method', 'Direction', 'Payload', 'Result or effect'],
      [
        ...protocolRows(WORKER_METHODS, 'app to Brydio'),
        ...protocolRows(HOST_METHODS, 'Brydio to app'),
      ],
    ),
    '',
    '## Limits',
    '',
    table(
      ['Limit', 'Value', 'What happens'],
      [
        ['One message', `**${MAX_MESSAGE_BYTES / 1024} KB**`, 'Brydio stops the app rather than reading it.'],
        ['Refusals', `**${MAX_REFUSALS}**`, 'The third refused tree operation stops the app.'],
        ['Loading the code', `**${READY_BUDGET_MS / 1000} s**`, 'From the frame appearing to `worker/ready`.'],
        ['First tree', `**${START_BUDGET_MS / 1000} s**`, 'From `worker/ready` to `tree/mount`.'],
        ["A node's id", `**${MAX_ID_CHARS} characters**`, 'Longer ids are refused.'],
        ['A toast', `**${MAX_TOAST_CHARS} characters**`, 'Longer text is cut.'],
      ],
    ),
    '',
    "Calls per minute are Brydio's limit, not an SDK constant. An administrator",
    'sees the rate in app activity. A rate refusal is a `HostError` with a message',
    'written for the builder.',
    '',
  ].join('\n');
}

if (import.meta.main) {
  const path = join(ROOT, 'docs', 'bridge.md');

  writeFileSync(path, bridgeDoc());
  console.log(`Wrote ${path}`);
}
