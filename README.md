# Brydio SDK

The tools for making a **Brydio app**: something that lives inside a Brydio
project as a tab or a sidebar item, keeps its own records, and draws its
screens with Brydio's own building blocks so it always looks like Brydio.

This repository holds the pieces an app is made with. The first app built with
it is Issues, in `../brydio-issues`.

## How an app works, in plain words

- An app has a **manifest** (`.brydio/app.json`). It says the app's name and
  version, what records it keeps (for Issues: issues and labels), where it
  shows up (a project tab, the sidebar), and which screens it has.
- From the records it keeps, Brydio makes **tools** by itself: create, change,
  read, list, search and delete. The app's screens use those tools, and so can
  the assistant in a chat.
- A **screen** is a small program that runs out of sight, in a sealed box with
  no internet and no page to draw on. It describes what it wants on screen
  using **28 building blocks** (stacks and grids, headings and text,
  buttons, fields and choices, cards, rows, badges and the like), and Brydio
  draws them. It can't use colours, styles or anything
  Brydio doesn't offer, which is why every app looks right.
- When a screen **changes something** (a button that moves an issue), Brydio
  asks the person first.
- An app is **built** into a small bundle of files, at most 1 MB. Each bundle
  gets a **fingerprint** (a long code worked out from its files), which is the
  address Brydio serves it from.

## What is in here

| Folder | What it is |
|---|---|
| `packages/ui` | The list of building blocks and what each accepts. A copy of Brydio's own list, as committed. |
| `packages/manifest` | The rules for a manifest, the tools Brydio makes from it, and the bundle rules and fingerprint. Copies of Brydio's server rules. |
| `packages/app` | What runs inside a screen: it keeps the screen's tree of building blocks, talks to Brydio, and lets you write screens with Preact (a small React). |
| `packages/api` | Typed project, file, chat and named-connection reads and writes. Every call goes through the app bridge; no token, cookie or server address reaches the app. |
| `packages/fake-host` | A pretend Brydio for tests: it runs a built screen, remembers what it drew, lets a test press buttons, and answers tools from sample records. |
| `packages/cli` | The `brydio` command: `build`, `validate`, `test`, `dev` and `publish`. |
| `packages/create-app` | The packaged templates and initializer behind `npm create @brydio/app`. |
| `templates/preact` | A starter app (a checklist) to copy. |
| `CONTRACT-NOTES.md` | Every place the plan and Brydio's actual code differed, and which way this went. |

### For HTML views

`@brydio/ui/web` is the same building blocks again, as standard web components,
for the one place HTML still exists: an MCP App view served from somebody
else's server. Link the script and the stylesheet and write `<bry-button>`.
It is not for app screens — Brydio draws those itself with its own kit, and
nothing built on this SDK needs the web components. See `packages/ui/README.md`.

## The `brydio` command

Start a Preact app outside this checkout (with Bun 1.3 or newer installed):

```sh
npm create @brydio/app my-app
cd my-app
bun run test
```

Run these in an app's folder (they need [Bun](https://bun.sh) 1.3):

- `brydio build` turns the screens in `src/screens/` into `dist/`, one file
  per screen plus `app.json` (with `"sdk"`, the SDK version it was built
  against, written by the build and never by hand), and prints each file's
  size and hash and the fingerprint.
- `brydio validate` checks everything Brydio would refuse (the whole list,
  with each check's sentence and whether Brydio's publish route runs it too,
  is [the publish checklist](docs/publish-checklist.md)): the manifest, the
  built bundle (only scripts, under 1 MB, every screen built), and the screens'
  source, read with TypeScript's parser (only the catalogue's elements, only
  their settings and values, the settings each needs, no children where an
  element holds none, no styles, no page, network, storage or other workers).
  Every problem has a code and a `file:line:column`:

  | Code | What it means |
  |---|---|
  | `manifest_missing`, `manifest_not_json`, `manifest_invalid`, `data_*`, `placement_*`, `grant_collection_missing` | The manifest, in the server's own codes |
  | `bundle_not_built`, `screen_not_built`, `bundle_stale` (warning) | `dist/` is missing, lacks a screen, or is older than the manifest |
  | `bundle_too_large`, `bundle_file_not_code`, `bundle_path_invalid`, `bundle_manifest_missing`, `bundle_empty` | What the bundle store refuses |
  | `element_unknown`, `prop_unknown`, `prop_value_invalid`, `prop_required`, `event_unknown`, `children_not_allowed` | A screen asks for something the catalogue does not have |
  | `style_forbidden` | `style`, `className`, `class`, `color`/`colour`, `innerHTML` |
  | `dom_global`, `network_global`, `storage_global`, `worker_global`, `eval_forbidden` | A screen reaches for what its worker does not have |
  | `import_not_allowed` | A screen imports something other than `@brydio/*`, Preact (`preact`, `preact/hooks`, `preact/jsx-runtime`) or the app's own files: a bare package, an absolute path, a `file:` URL, or a relative path out of the app's folder |
  | `source_syntax` | A source file does not parse |
  | `migration_missing`, `previous_unreadable`, `previous_not_older` | A collection's schema changed since the version before (given with `--previous <app.json>`, or a `dist/` built from it) without its migration step |
  | `tool_unknown`, `collection_unknown`, `grant_tool_missing`, `grant_host_missing`, `grant_unknown` | A screen calls a tool or reads a collection the app does not have or does not ask for, or the manifest asks for a host grant Brydio does not know |
  | `grant_tool_unknown`, `grant_collection_unknown`, `grant_host_unused` (warnings) | A grant names nothing, or no screen uses it |
  | `secret_in_bundle` | Brydio's secret scan found a declared credential |

- `brydio test` builds the app, then runs its `*.test.ts` files with
  `bun test` against that build. Words after `--` go to `bun test`
  (`brydio test -- --test-name-pattern adds`). A build that fails runs no
  tests.
- `brydio publish` builds and validates the app, then uploads `dist/` to
  Brydio as a new version, signed in as you. Set `BRYDIO_TOKEN` to a Brydio
  session token and `BRYDIO_API_URL` to the API's address (or pass
  `--api <url>`). It first asks Brydio which SDK versions it runs, and
  refuses a build outside them before uploading anything. It prints the version, the fingerprint and each screen's
  address. Publishing exactly what is already published is not an error; a
  version number already used by different code is refused, in Brydio's
  words, naming both fingerprints.
- `brydio dev` builds, serves `dist/` on `http://localhost:5174`, builds again
  whenever a file changes, and prints the command that loads the build into a
  local Brydio.

## Testing a screen

`@brydio/fake-host` is a pretend Brydio: it runs a built screen in a worker
behind Brydio's own prelude, keeps the tree in a copy of Brydio's receiver
(so it refuses what a workspace refuses, in the same words), stops the app
for the same budgets, and answers the generated tools from sample records.

```ts
import { testApp } from '@brydio/fake-host';
import { afterEach, expect, test } from 'bun:test';

const app = await testApp(import.meta.dir); // the app above this test, built
afterEach(() => app.stopAll());

test('ticks an item off', async () => {
  const host = app.start('home', { fixtures: { items: [{ title: 'Water the plants', done: false }] } });

  await host.mounted();
  host.press(await host.waitFor(() => host.byText('Done')));
  await host.waitFor(() => host.byText('Undo'));

  expect(host.calls.map(call => call.tool)).toEqual(['list_items', 'update_item', 'list_items']);
});
```

What a test can do with a host:

| | |
|---|---|
| `mounted()`, `idle()`, `waitFor(check)` | wait for the first tree, for quiet, or for anything |
| `byText(words)`, `findAll(check)`, `parentOf(node)`, `outline()` | look at the tree; `outline()` is readable in a diff |
| `press(node)`, `event(node, name, detail)`, `setContext({ theme })` | do what a person or Brydio does |
| `asks: 'allow' \| 'deny' \| 'hold'`, `answer(decision)` | answer a write's approval card, now or later |
| `fixtures`, `tools`, `store.records(collection)` | sample records, tools of the test's own, the records after |
| `calls`, `refusals`, `toasts`, `stopped` | what the screen did, what was refused, and why it was stopped |

Under `brydio test` the app is built once, before the tests. Under a plain
`bun test` (an editor's test button), `testApp` builds it on first use.

## Working on the SDK itself

```sh
bun install
bun test               # every package, the template, and the end-to-end runs in a worker
bun run check-types
```

Some tests compare these copies with Brydio's own code: the catalogue, the
manifest schema, grants, limits, the prelude, the tree store, signing and the
publish route's words. When a Brydio checkout sits beside this folder
(`../brydio`, or set `BRYDIO_DIR`), they ask Brydio's code directly. Without
one, as in this repository's own CI, they compare against Brydio's answers
recorded in `contracts/brydio.json`, so they still check something.

When Brydio's answers change, those tests fail with Brydio beside them. Then
run `bun run contracts:record`, which writes the new answers and the Brydio
commit they came from, and review the diff before committing it.

The seven synchronized packages are `@brydio/create-app`, `@brydio/manifest`,
`@brydio/ui`, `@brydio/app`, `@brydio/api`, `@brydio/fake-host` and
`@brydio/cli`. The exact registry state and remaining owner steps are in
[releasing.md](docs/releasing.md). `bun run release:build`
makes the seven packages a registry would get, and refuses publishable output
from a dirty tree or without the addresses [support.md](docs/support.md) names.

What the packages promise and what they do not, and how to report a problem,
are [support.md](docs/support.md) and [security.md](docs/security.md).

The [documentation index](docs/README.md) links every public reference. The
[SDK documentation site](docs-site/README.md) turns those references into a
static, browsable build with checked renderer captures.
Everything a screen can ask Brydio to do, with its limits and what a refusal
looks like, is [bridge.md](docs/bridge.md). Every element a screen may draw,
with its settings, is [elements.md](docs/elements.md) — generated from the catalogue by
`bun run docs:elements`, so it cannot fall behind it.

## Writing a screen

```tsx
import { tools } from '@brydio/app';
import { mount, useList } from '@brydio/app/preact';

function Board() {
  const issues = useList('issues', { limit: 200 });

  return (
    <bry-stack gap="3">
      <bry-heading level={1} text="Issues" />
      {issues.items.map(issue => (
        <bry-card key={issue.id} title={String(issue.title)} />
      ))}
      <bry-button label="New issue" onPress={() => tools.call('create_issue', { title: 'New issue', status: 'todo' })} />
    </bry-stack>
  );
}

void mount(Board);
```

The building blocks and their settings:

| Block | Settings | Tells the screen |
|---|---|---|
| `bry-stack` | `direction` row or column, `gap` 1–8, `align`, `justify`, `wrap` | nothing |
| `bry-grid` | `columns` 1–6 (the most, dropping to one as it narrows), `gap` 1–8, `align` | nothing |
| `bry-heading` | `text` (needed), `level` 1–4, `variant` title, heading, subheading or label | nothing |
| `bry-text` | `text` (needed), `tone` default, muted, neutral, brand, success, warn or danger, `variant` body, ui, caption or label, `size` sm or md | nothing |
| `bry-label` | `text` (needed), `required`; holds the control it names | nothing |
| `bry-button` | `label` (needed), `variant` primary, secondary, ghost or danger, `size`, `disabled`, `working`, `icon` (one of `BUTTON_ICONS`), `hideLabel` | `onPress` |
| `bry-input` | `value`, `placeholder`, `label`, `kind` text, email, url or search, `maxLength`, `required`, `disabled`, `error` | `onChange` and `onSubmit`, with `{ value }` |
| `bry-textarea` | `value`, `placeholder`, `label`, `maxLength`, `required`, `disabled`, `error` | `onChange`, with `{ value }` |
| `bry-select` | `options` (needed, up to 100 `{ value, label }`), `value`, `placeholder`, `label`, `size`, `disabled`, `error` | `onChange`, with `{ value }` |
| `bry-card` | `title`, `padding` 2–6, `pressable`, `loading` | `onPress`, when pressable |
| `bry-list-row` | `title`, `description`, `meta`, `pressable`, `selected`, `loading` | `onPress` |
| `bry-badge` | `text` (needed), `tone` neutral, brand, success, warn or danger | nothing |
| `bry-avatar` | `name` (needed), `size` sm, md or lg; initials, never a picture | nothing |
| `bry-empty-state` | `title` (needed), `text`, `action` | `onAction` |
| `bry-skeleton` | `shape` line, block or row, `count` 1–12 | nothing |
| `bry-table` | `columns` (needed, up to 12 `{ key, heading, align, sortable }`), `rows` (up to 500 `{ id, cells }`), `sort` `{ key, direction }`, `label`, `selectable`, `selected`, `loading`, `empty` | `onSort` with `{ key, direction }`, `onSelect` with `{ row }` |
| `bry-virtual-list` | `count` (needed), `start`, `rowSize` sm, md or lg, `label`, `selectable`, `selected`, `loading`, `empty`; holds only the rows in view | `onRange` with `{ start, end }`, `onSelect` with `{ index }` |
| `bry-dialog` | `title` (needed), `open`, `description`, `actions` (up to 3 `{ id, label, tone, disabled }`), `cancel` | `onAction` with `{ id }`, `onClose` (with `{ refused }` when another dialog is open) |
| `bry-menu` | `items` (needed, up to 20 `{ id, label, icon, tone, separator, disabled }`); holds the button that opens it | `onSelect` with `{ id }` |
| `bry-date` | `value`, `min`, `max` as ISO dates, `label`, `placeholder`, `disabled`, `error` | `onChange`, with `{ value }` |
| `bry-split` | `ratio` 20–80, `label`; holds its two panes | nothing |
| `bry-checkbox` | `label` (needed), `checked`, `disabled`, `error` | `onChange`, with `{ checked }` |
| `bry-switch` | `label` (needed), `checked`, `disabled`, `error` | `onChange`, with `{ checked }` |
| `bry-board` | `label`, `cardSize` sm, md or lg, `settled`, `loading`, `empty`; holds its columns | `onMove` with `{ card, from, to, position }`, node ids |
| `bry-board-column` | `title` (needed), `count`, `limit`, `start`, `loading`, `empty`; holds its cards | `onRange` with `{ start, end }` |
| `bry-markdown` | `text` (needed, up to 50,000), `expanded` | nothing |
| `bry-diff` | `files` (needed, up to 300 `{ path, previous, status, patch }`), `label`, `loading`, `empty` | `onExpand` with `{ file }`, `onSelect` with `{ file, side, start, end }` |

A stack, a grid, a label, a card, a list row, a virtual list, a dialog, a menu,
a split, a board and a board column hold other blocks; the rest take their
words as a setting. Each has a plain factory of the same name in `@brydio/app`
(`listRow`, `emptyState`, `virtualList`, `boardColumn`) for a screen written
without Preact; a switch's is `switchElement`, since `switch` is a reserved
word. A menu item's `icon` is one of `MENU_ICONS` from `@brydio/ui`.

**A board.** Brydio draws a moved card in its new place at once and raises
`move`. The app answers by changing its state so the card renders in the new
column, which confirms it, or by refusing, which puts it back. `useBoard` turns
the event's node ids into your own keys:

```tsx
const keys = useBoard<string, Status>();

<bry-board label="Issues" onMove={async event => {
  const move = keys.read(event); // { card: issue id, from, to: Status, position }
  if (!move) return;
  try {
    await tools.call('update_issue', { id: move.card, version, status: move.to });
    await refetch(); // the card renders under move.to: confirmed
  } catch {
    keys.refuse(event); // sends `settled`: the card goes back
  }
}}>
  {COLUMNS.map(status => (
    <bry-board-column key={status} ref={keys.column(status)} title={title(status)}>
      {issues.filter(one => one.status === status).map(issue => (
        <bry-card key={issue.id} ref={keys.card(issue.id)} title={issue.title} />
      ))}
    </bry-board-column>
  ))}
</bry-board>
```

**Watching data.** `useList('issues', query, { watch: true })` reads the list
again whenever a record in the collection changes, whoever changed it.
`useWatch(collection, changes => …)`, or `data.watch` without Preact, hears
each burst as `{ id, op, version }`; a change never carries the record. An
open app may watch five collections. In `@brydio/fake-host`,
`host.store.put(collection, fields)` and `host.store.remove(collection, id)`
change a record as somebody else would, and `host.endWatch(collection)` ends a
watch.

**Opening things.** `await navigate({ kind: 'chat' | 'file' | 'item', id })`
resolves with `{ opened }` or rejects with a `HostError` saying why not. It
needs the `navigate` host grant.
