# The manifest

Every app has a manifest at `.brydio/app.json`. It says who the app is, what
it keeps, where it can be shown, which screens it has, and what it may ask
Brydio for. `@brydio/manifest` exports its schema (`appManifestSchema`) and
its type, and `defineManifest()` checks a manifest kept in TypeScript as you
write it. `brydio validate` reads the JSON file with the same schema Brydio
uses when you publish.

```json
{
  "name": "issues",
  "version": "0.1.0",
  "displayName": "Issues",
  "placements": [{ "kind": "project-tab", "screen": "board", "label": "Issues" }],
  "data": {
    "issues": {
      "schema": { "title": "string", "body": "text?", "status": ["todo", "doing", "done"], "assignee": "member?" },
      "label": "issue",
      "search": ["title", "body"]
    }
  },
  "tools": { "generated": true },
  "screens": { "board": { "entry": "screens/board.js" } },
  "grants": { "tools": ["*"], "collections": ["*"], "host": ["navigate"] }
}
```

- **`name`, `version`, `displayName`, `summary`:** who the app is. `version`
  is semver. `brydio build` writes `sdk` itself.
- **`placements`:** where a person can add it: `project-tab`,
  `project-sidebar` or `workspace-sidebar`, each naming one of `screens`.
- **`data`:** the collections it keeps. Each has a `schema` of fields, an
  optional `label` (the singular the tools are named with: `issue` gives
  `create_issue`), and an optional `search` list of `string`, `text` or
  `string[]` fields.
- **`tools`:** `generated: true` gives each collection its create, update,
  get, list, search, delete and batch tools. The ones that change a record
  ask the person first from a screen.
- **`screens`:** each screen's built entry, one ES module.
- **`grants`:** what the app may ask of Brydio. A person agrees to these when
  they install it.

The full list of what's checked, with the sentence each check refuses with,
is in [the publish checklist](publish-checklist.md).

## Limits

These bounds keep an app's data small enough for Brydio to carry. They're
the same on your machine and in Brydio: `FIELD_LIMITS` and `DOCUMENT_LIMITS`
in `@brydio/manifest` are copies of Brydio's own, and
`packages/manifest/test/limits-doc.test.ts` fails if a number here differs
from either.

### A schema

`brydio validate` refuses a manifest that crosses one of these, and says the
number in its message.

| Limit | Value | What it bounds |
|---|---|---|
| `FIELD_LIMITS.collections` | 20 | Collections one app may keep |
| `FIELD_LIMITS.fields` | 40 | Fields one collection may have |
| `FIELD_LIMITS.enumValues` | 50 | Values one choice may allow |
| `FIELD_LIMITS.enumValueChars` | 64 | Characters in one of a choice's values |
| `FIELD_LIMITS.nameChars` | 40 | Characters in a collection, label, field or screen name |

### A record's values

A write that crosses one of these is refused, naming the field and the
number. That happens in Brydio and in the fake host your tests run against.

| Limit | Value | What it bounds |
|---|---|---|
| `FIELD_LIMITS.stringChars` | 1,000 | Characters in a `string` value (what `bry-input` lets a person type) |
| `FIELD_LIMITS.textChars` | 100,000 | Characters in a `text` value |
| `FIELD_LIMITS.listEntries` | 100 | Entries in a `string[]` value |

### Records

| Limit | Value | What it bounds |
|---|---|---|
| `DOCUMENT_LIMITS.bodyBytes` | 262,144 | Bytes in one stored record (256 KB) |
| `DOCUMENT_LIMITS.recordsPerCollection` | 100,000 | Live records in one collection of one instance |
| `DOCUMENT_LIMITS.pageDefault` | 50 | Records a list or search returns when it doesn't say how many |
| `DOCUMENT_LIMITS.pageMax` | 200 | The most records one list or search page returns |
| `DOCUMENT_LIMITS.pageBytes` | 2,097,152 | Bytes after which a page stops and hands back a cursor (2 MB) |
| `DOCUMENT_LIMITS.batchChanges` | 50 | Changes one `batch_<plural>` call may make |
