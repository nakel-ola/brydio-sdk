# Open-schema collections

Most collections have the fields their manifest declares, and nothing else.
An open-schema collection also has fields that people define while they use
the app: a database's columns, a CRM's custom properties, a tracker's extra
fields. Each field definition is a record of a second collection, its
companion, so a person (or Brydio's assistant) adds, renames, retypes and
deletes fields without a new version of the app.

Brydio checks every row against the live definitions. It keeps structured
values in plain so a list can filter and sort on them, and seals words and
attachments in the encrypted body like any other text.

## The flag

Mark the collection with `openSchema` and name its companion:

```json
"data": {
  "tables":  { "schema": { "name": "string" } },
  "columns": {
    "schema": {
      "table": "string",
      "key": "string?",
      "name": "string",
      "type": ["text", "long_text", "number", "currency", "percent", "rating",
               "date", "datetime", "checkbox", "select", "multi_select",
               "person", "link", "url", "email", "phone", "attachment"],
      "choices": "string[]",
      "required": "boolean?",
      "currency": "string?",
      "precision": "number?",
      "linkTo": "string?",
      "description": "string?"
    },
    "label": "column"
  },
  "rows": {
    "schema": { "table": "string", "title": "string?" },
    "label": "row",
    "openSchema": { "fields": "columns", "table": "table" }
  }
}
```

- `openSchema.fields` (required) names the companion collection. It must be
  another collection of the same app, it must not be open itself, and it may
  define the fields of one collection only.
- `openSchema.table` (optional) names a `string` field declared on **both**
  collections. Its value says which table a row or a definition belongs to,
  so one instance can hold many tables, each with its own fields. Without
  `table`, the whole collection in one instance is one table. The table field
  is kept in plain on both sides, so it filters and sorts.

`openSchema` takes only these two keys. Anything else is `manifest_invalid`.

## The companion

Brydio reads three fields of every definition, and the companion must
declare them:

| Field | Declare it as | Meaning |
|---|---|---|
| `key` | `"string?"` | The field's stable id. Rows, tools, filters and sorts use it. |
| `name` | `"string"` | What people see. Renaming a field changes only this. |
| `type` | a choice of open types | One or more of the types below. |

Brydio also reads these when you declare them, and then they must have
these kinds:

| Field | Kind | Meaning |
|---|---|---|
| `choices` | `string[]` | The values of a `select` or `multi_select`. |
| `required` | `boolean` | A create must give a value. |
| `currency` | `string` | A currency code, for `currency`. |
| `precision` | `number` | Decimal places to show. |
| `linkTo` | `string` | What a `link` points at. |
| `description` | `string` or `text` | Help text for the field. |

Any other field of the companion (a position, a width, a colour) is the
app's own, and Brydio leaves it alone.

`brydio validate` refuses a companion that is wrong with one of three codes:

| Code | When |
|---|---|
| `data_open_fields_unknown` | `fields` names no other collection of the app, names an open collection, or names a companion that already defines another collection's fields. |
| `data_open_fields_shape` | `key`, `name` or `type` is missing or of the wrong kind, `type` offers a value that is not an open type, or an optional field has a kind Brydio does not read. |
| `data_open_table_unknown` | `table` is not a required `string` on both collections. |

## Open types

`OPEN_TYPES` in `@brydio/manifest` lists them. Each is stored as one of the
store's own field types:

| Type | Value | Kept | Filter | Sort |
|---|---|---|---|---|
| `text` | Short text | Sealed | no | no |
| `long_text` | Long text | Sealed | no | no |
| `url` | An `http://` or `https://` address | Sealed | no | no |
| `email` | An email address | Sealed | no | no |
| `phone` | A phone number | Sealed | no | no |
| `attachment` | A list of file ids | Sealed | no | no |
| `number`, `currency`, `percent` | A number | Plain | yes | yes |
| `rating` | A whole number from 0 to 10 | Plain | yes | yes |
| `date` | `YYYY-MM-DD` | Plain | yes | yes |
| `datetime` | `YYYY-MM-DDTHH:MM:SSZ` | Plain | yes | yes |
| `checkbox` | `true` or `false` | Plain | yes | yes |
| `select` | One of `choices` | Plain | yes | yes |
| `multi_select` | Some of `choices` | Plain | yes | no |
| `person` | A Brydio member id | Plain | yes | yes |
| `link` | A list of record ids | Plain | yes | no |

An open field may be left out unless its definition says `required`, and
`required` is checked on create only, so a field made required later never
leaves an older row stuck.

## Keys

A definition's `key` is what rows hold and tools take. Leave it out on
create and Brydio makes one from the name: `"Deal size"` becomes
`deal_size`, then `deal_size_2` if that is taken. A key is letters, digits
and `_`, starts with a lower-case letter, is at most 40 characters, and is
never a name Brydio keeps (`id`, `version`, …) or one of the collection's
declared fields. It is unique within its table.

A key never changes. An update that tries is refused, so a rename moves no
data and a row written before the rename still has its value.
`keyFromName` and `keyProblem` in `@brydio/manifest` do what Brydio does.

## Changing a field

A change to a definition moves the table's values with it, in the same
write:

- **Rename.** Only `name` changes. No row is touched.
- **Retype.** Each value is converted when it can be read as the new type,
  else cleared: text `"1,200"` becomes the number `1200`, `"big"` is cleared,
  a number becomes text, `"Yes"` becomes `true`, and a multi-select becomes a
  select by its first value that is still a choice. A choice is never made
  up.
- **Fewer choices.** Values no longer offered are cleared.
- **Delete.** The field's values are taken out of every row of its table.

The answer to a retype or a narrowing carries a `fieldChange` report,
counts only:

```json
{ "fieldChange": { "field": "amount", "op": "retype", "rows": 2, "kept": 0, "converted": 1, "cleared": 1 } }
```

`rows` is how many rows held a value. `op` is `retype`, `choices` or
`delete`. Each moved row gets a new version and is heard by a watch as a
change. `moveValue` in `@brydio/manifest` converts one value the way Brydio
does, so you can show a person what a retype will do before they confirm it.

A row's table never changes, and neither does a definition's.

## Tools and lists

The generated tools of an open collection take open fields by key beside
the declared ones: `create_row({ table: "t1", title: "Acme", deal_size: 1200 })`.
A key the table does not define is refused, naming the table's fields.
The companion's own tools (`create_column`, `update_column`, …) manage the
fields.

A list filters and sorts on an open field only when the filter names the
table, such as `list_rows({ filter: { table: "t1", stage: "won" }, sort: { field: "deal_size" } })`.
Without the table in the filter, only the declared fields filter and sort.
A collection with no `table` field is one table, so its open fields always
do.

## Limits

| Limit | Value |
|---|---|
| `OPEN_LIMITS.rowsPerTable` | 50,000 rows per table. The insert after that is refused. The collection-wide record limit does not apply to an open collection. |
| `OPEN_LIMITS.fieldsPerTable` | 200 field definitions per table. |
| `OPEN_LIMITS.ratingMax` | A rating is at most 10. |

## In the fake host

`@brydio/fake-host` keeps open tables the way Brydio does: definitions are
read from the companion's records, rows are checked against them, keys are
made from names and never change, and a retype, a narrowing or a delete
moves the table's values and answers with `fieldChange`. Seed the companion
in `fixtures` beside the rows. Definitions are seeded first, so the rows are
checked against them. `new FixtureStore(manifest, fixtures, { rowsPerTable })`
lowers the row limit for a test.
