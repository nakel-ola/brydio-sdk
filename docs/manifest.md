# The manifest

Every app has a manifest at `.brydio/app.json`. It names the app, its screens,
the records it keeps, where it may appear, and every grant it asks for.
`@brydio/manifest` exports `appManifestSchema`, its TypeScript types, and
`defineManifest()`. `brydio validate` and Brydio use the same rules.

**This page is generated** by `bun run docs:manifest`. Its field list comes
from the Zod schemas, its limits come from the exported constants, and its
worked example is the checked-in Issues manifest. Do not edit it by hand.

## Issues, as a complete example

This is `packages/manifest/examples/issues.json`, the proposal app used to
exercise project and workspace placements, two collections, generated tools,
two screens, collection grants, tool grants, and host grants.

```json
{
  "name": "issues",
  "version": "0.1.0",
  "displayName": "Issues",
  "placements": [
    { "kind": "project-tab", "screen": "board", "label": "Issues", "icon": "kanban" },
    { "kind": "project-sidebar", "screen": "board", "label": "Issues", "icon": "kanban" },
    { "kind": "workspace-sidebar", "screen": "board", "label": "Issues", "icon": "kanban" }
  ],
  "data": {
    "issues": {
      "schema": {
        "title": "string",
        "status": ["todo", "doing", "done"],
        "assignee": "member?",
        "labels": "string[]",
        "body": "text?",
        "project": "project?"
      },
      "search": ["title", "body"],
      "label": "issue"
    },
    "labels": {
      "schema": { "name": "string", "colour": "token" },
      "label": "label"
    }
  },
  "tools": { "generated": true, "custom": [] },
  "screens": {
    "board": { "entry": "screens/board.js" },
    "issue": { "entry": "screens/issue.js" }
  },
  "grants": { "tools": ["*"], "collections": ["*"], "host": ["navigate", "message"] }
}
```

## Top-level fields

| Field | Takes | Required | What it does |
|---|---|---|---|
| `name` | kebab-case text, at most 64 characters | yes | The stable app key. A published app keeps this name for every version. |
| `version` | semver text, at most 64 characters | yes | The app version. A published version is immutable. |
| `displayName` | text, at most 80 characters | no | The name people see. Brydio falls back to `name` when this is absent. |
| `summary` | text, at most 240 characters | no | One sentence shown in the directory and install flow. |
| `description` | text, at most 4,000 characters | no | The longer explanation of what the app does. |
| `author` | `{ name, email?, url? }` | no | The app author. `name` is required inside this record. |
| `homepage` | text | no | The public page for the app. |
| `repository` | text | no | The source repository for the app. |
| `license` | text, at most 64 characters | no | The licence identifier or name for this app. |
| `keywords` | a list of at most 20 strings | no | Words used to find the app in the directory. |
| `links` | `{ privacy?, terms?, support? }` | no | Public policy and support links shown with the app. |
| `icon` | text | no | The app icon reference used by Brydio. |
| `brandColor` | text | no | The legacy light-theme brand colour. |
| `brandColorDark` | text | no | The legacy dark-theme brand colour. |
| `defaultPrompts` | a list of at most 3 strings | no | Prompts Brydio may offer when the app is installed. |
| `skills` | a relative path | no | The legacy skill declaration path. |
| `servers` | a relative path | no | The legacy MCP server declaration path. |
| `integrations` | a relative path | no | The legacy integration declaration path. |
| `requires` | `{ servers?, integrations?, builtin? }` | no | Lists extension dependencies. Each inner value is a list of ids. |
| `metadata` | a record of JSON values | no | Publisher metadata that Brydio preserves without giving it SDK meaning. |
| `placements` | a list of placement offers | no | Where a person may place the app. Each offer names a declared screen. |
| `data` | a record of collections | no | The records the app keeps. Each collection declares its fields and generated-tool noun. |
| `tools` | `{ generated?, custom? }` | no | Generated collection tools and custom server-side handlers. |
| `screens` | a record of `{ entry }` values | no | The screen names and their compiled `.js` or `.mjs` entries inside the bundle. |
| `grants` | `{ tools?, collections?, host? }` | no | Everything the app asks a workspace to let it read, call, or open. |
| `secrets` | a list of at most 20 `{ name, label, description?, required?, scope? }` | no | The secrets the app’s handlers read. Names only: a value is entered in the app’s settings, never shipped. |
| `migrations` | an ordered list of versioned migration steps | no | How existing records move when a later version changes a collection schema. |
| `sdk` | semver text | no | Written by `brydio build`. Do not add or edit it in `.brydio/app.json`. |

Unknown top-level fields are rejected. The sections below expand the fields
that have their own nested grammar.

## Placements and screens

Each `placements` entry has a `kind`, a `screen`, and optional `label` and
`icon` text. `kind` is `project-tab`, `project-sidebar`, or
`workspace-sidebar`. `screen` must name a key in `screens`. Each screen has
one `entry`, a relative `.js` or `.mjs` path inside the built bundle.

### Folders

A `project-sidebar` or `workspace-sidebar` placement with `children` is a
folder: its row opens into rows one of the app's read tools lists, only while
it is open. `children` takes `tool`, and optional `refreshSeconds` (15 to
3600, default 60), `cap` (1 to 50, default 20) and `noun` ("pull requests").
The tool is called with `{ folder }` and answers `{ items, nextCursor?,
total?, empty? }`; each item is `{ id, title, subtitle?, icon?, badge?,
hasChildren? }`.

A folder nests only when it declares `nested`: a list of the levels under
its own rows, each with an optional `noun` and `create`. A row marked
`hasChildren` then opens into the rows the same tool lists for
`{ folder, parent }`, one level at a time. A folder is at most 4 levels
deep, its own rows counting as the first, so `nested` has at most three
entries.

`create` (on `children` for the first level, or on a `nested` level) puts
"New `<noun>`" at the end of that level. It takes `tool`, a tool that makes
records, and optional `noun` ("sprint"), `titleField` (default `title`) and
`parentField` (default `parent`). The name the person types goes in
`titleField`; below the first level the row it is made under goes in
`parentField`. It runs as the person's own click on the app's screen would.

## Collections and schema types

Each key in `data` is a collection name. A collection has a required `schema`,
an optional singular `label` used in generated tool names, and an optional
`search` list. Search fields must use `string`, `text`, or `string[]`.

| Manifest spelling | Stored value |
|---|---|
| `string` | Short text, at most 1,000 characters. |
| `text` | Long text, at most 100,000 characters. |
| `["todo", "done"]` | A choice. It may list at most 50 unique values. |
| `member` | A Brydio member id. |
| `project` | A Brydio project id. One collection may have one project field. |
| `date` | An ISO calendar date in `YYYY-MM-DD` form. |
| `number` | A finite number. |
| `boolean` | `true` or `false`. |
| `string[]` | A list of at most 100 short strings. |
| `token` | One of `neutral`, `brand`, `success`, `warn`, `danger`. |

Add `?` to a named type to make the field optional, such as `member?`.
A field may also use `{ "type": ..., "optional": true, "default": ...,
`"labels": ... }`. Only optional choices and booleans may have defaults.
Choice labels are 1 to 60 characters and may name only declared values.

## Tools

`tools.generated` defaults to `true`. Each collection then gets create,
update, get, list, search, delete, and batch tools. `tools.custom` may hold
at most 20 handlers. A custom tool has a lower-case `name`,
a `description`, a built `handler` path, and optional `input`, `write`, and
`collection`. Its input fields use the same schema types as collection fields.
A custom tool that writes must set `write: true`, which makes Brydio ask the
person before it runs.

## Secrets

`secrets` names what the app’s handlers need and must never ship: an API
key, a signing secret. Each has a lower-case `name`, a `label` for the
app’s settings, an optional `description`, `required`, and a `scope`:
`install` (the default) is one value for the whole install, `instance` is
one value per instance. An app may declare at most 20, each at most
8,192 characters long.

An administrator sets, replaces or clears a value in the app’s settings,
and it is never shown again. Only the app’s own handlers read one, with
`secrets.get(name)`, and a handler may store one it obtained itself with
`secrets.set(name, value)`. A screen never can, and no other app can. An
app that declares secrets must ask for the `secrets` host grant.

## Grants

`grants.tools` names generated or custom tools, a collection noun, or `*`.
`grants.collections` names collections or `*`. `grants.host` may contain:

- `navigate`
- `message`
- `members`
- `projects`
- `files`
- `chats`
- `model`
- `secrets`

A named connection grant is `connection:<name>`. `*` never grants a
connection. A collection the app keeps must appear in `grants.collections`,
and a custom tool must appear in `grants.tools` unless that list has `*`.

## Migrations

When a published version changes a collection schema, `migrations` explains
how records from earlier versions become readable by the new one. Each entry
has the target `version` and 1 to 100 `steps`. Keep every migration in order
so a workspace several versions behind can run each one.

| Operation | What it does |
|---|---|
| `add` | Add a field. A required field needs a valid `default` for existing records. |
| `rename` | Move one field to a new name without losing its values. |
| `drop` | Remove one field and its stored values. |
| `dropCollection` | Remove a collection and all records it kept. |
| `replace` | Replace one removed choice value with a value the new schema allows. |

## Limits

The generator reads these values from `FIELD_LIMITS` and `DOCUMENT_LIMITS`.
The manifest validator and the fake host use the same exports.

| Limit | Value | What it bounds |
|---|---|---|
| `FIELD_LIMITS.collections` | 20 | Collections one app may keep |
| `FIELD_LIMITS.fields` | 40 | Fields one collection may have |
| `FIELD_LIMITS.enumValues` | 50 | Values one choice may allow |
| `FIELD_LIMITS.enumValueChars` | 64 | Characters in one of a choice's values |
| `FIELD_LIMITS.stringChars` | 1,000 | Characters in a `string` value |
| `FIELD_LIMITS.textChars` | 100,000 | Characters in a `text` value |
| `FIELD_LIMITS.listEntries` | 100 | Entries in a `string[]` value |
| `FIELD_LIMITS.nameChars` | 40 | Characters in a collection, label, field or screen name |

| Limit | Value | What it bounds |
|---|---|---|
| `DOCUMENT_LIMITS.pageDefault` | 50 | Records returned when a list or search does not say how many |
| `DOCUMENT_LIMITS.pageMax` | 200 | Records one list or search page may return |
| `DOCUMENT_LIMITS.bodyBytes` | 262,144 | Bytes in one stored record |
| `DOCUMENT_LIMITS.pageBytes` | 2,097,152 | Bytes after which a page stops and returns a cursor |
| `DOCUMENT_LIMITS.recordsPerCollection` | 100,000 | Live records in one collection of one instance |
| `DOCUMENT_LIMITS.batchChanges` | 50 | Changes one `batch_<plural>` call may make |

The full validation list, with every problem code and refusal sentence, is
in [the publish checklist](publish-checklist.md).
