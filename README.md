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
  using **five building blocks** (a stack, a heading, a text, a button and a
  card), and Brydio draws them. It can't use colours, styles or anything
  Brydio doesn't offer, which is why every app looks right.
- When a screen **changes something** (a button that moves an issue), Brydio
  asks the person first.
- An app is **built** into a small bundle of files, at most 1 MB. Each bundle
  gets a **fingerprint** (a long code worked out from its files), which is the
  address Brydio serves it from.

## What is in here

| Folder | What it is |
|---|---|
| `packages/ui` | The list of the five building blocks and what each accepts. A copy of Brydio's own list. |
| `packages/manifest` | The rules for a manifest, the tools Brydio makes from it, and the bundle rules and fingerprint. Copies of Brydio's server rules. |
| `packages/app` | What runs inside a screen: it keeps the screen's tree of building blocks, talks to Brydio, and lets you write screens with Preact (a small React). |
| `packages/fake-host` | A pretend Brydio for tests: it runs a built screen, remembers what it drew, lets a test press buttons, and answers tools from sample records. |
| `packages/cli` | The `brydio` command: `build`, `validate`, `test`, `dev` and `publish`. |
| `templates/preact` | A starter app (a checklist) to copy. |
| `CONTRACT-NOTES.md` | Every place the plan and Brydio's actual code differed, and which way this went. |

## The `brydio` command

Run these in an app's folder (they need [Bun](https://bun.sh) 1.3):

- `brydio build` turns the screens in `src/screens/` into `dist/`, one file
  per screen plus `app.json`, and prints the size and the fingerprint.
- `brydio validate` checks everything Brydio would refuse: the manifest, the
  built bundle (only scripts, under 1 MB, every screen built), and the screens'
  source, read with TypeScript's parser (only the catalogue's elements, only
  their settings and values, the settings each needs, no children where an
  element holds none, no styles, no page, network, storage or other workers).
  Every problem has a code and a `file:line:column`:

  | Code | What it means |
  |---|---|
  | `manifest_missing`, `manifest_not_json`, `manifest_invalid`, `data_*`, `placement_*` | The manifest, in the server's own codes |
  | `bundle_not_built`, `screen_not_built`, `bundle_stale` (warning) | `dist/` is missing, lacks a screen, or is older than the manifest |
  | `bundle_too_large`, `bundle_file_not_code`, `bundle_path_invalid`, `bundle_manifest_missing`, `bundle_empty` | What the bundle store refuses |
  | `element_unknown`, `prop_unknown`, `prop_value_invalid`, `prop_required`, `event_unknown`, `children_not_allowed` | A screen asks for something the catalogue does not have |
  | `style_forbidden` | `style`, `className`, `class`, `color`/`colour`, `innerHTML` |
  | `dom_global`, `network_global`, `storage_global`, `worker_global`, `eval_forbidden` | A screen reaches for what its worker does not have |
  | `import_not_allowed` | A screen imports something other than `@brydio/*`, Preact (`preact`, `preact/hooks`, `preact/jsx-runtime`) or the app's own files: a bare package, an absolute path, a `file:` URL, or a relative path out of the app's folder |
  | `source_syntax` | A source file does not parse |

- `brydio test` builds the app, then runs its `*.test.ts` files with
  `bun test` against that build. Words after `--` go to `bun test`
  (`brydio test -- --test-name-pattern adds`). A build that fails runs no
  tests.
- `brydio publish` builds and validates the app, then uploads `dist/` to
  Brydio as a new version, signed in as you. Set `BRYDIO_TOKEN` to a Brydio
  session token and `BRYDIO_API_URL` to the API's address (or pass
  `--api <url>`). It prints the version, the fingerprint and each screen's
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

Some tests compare these copies with Brydio's own code. They run when a Brydio
checkout sits beside this folder (`../brydio`, or set `BRYDIO_DIR`), and are
skipped otherwise.

Nothing here is published anywhere yet. An app uses the packages straight from
this folder (see `../brydio-issues/package.json`).

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

The five building blocks and their settings:

| Block | Settings | Tells the screen |
|---|---|---|
| `bry-stack` | `direction` row or column, `gap` 1–8, `align`, `justify`, `wrap` | nothing |
| `bry-heading` | `text` (needed), `level` 1–3 | nothing |
| `bry-text` | `text` (needed), `tone` default, muted or danger, `size` sm or md | nothing |
| `bry-button` | `label` (needed), `variant` primary, secondary, ghost or danger, `size`, `disabled` | `onPress` |
| `bry-card` | `title`, `padding` 2–6, `pressable` | `onPress`, when pressable |

Only a stack and a card can hold other blocks. There is no text box yet: a
screen can't ask a person to type in Phase 0.
