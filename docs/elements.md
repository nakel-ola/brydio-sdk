# The catalogue

Every element an app may draw, with its settings and what each takes.
A screen draws these and nothing else: there is no HTML, no styling and no
colour of your own — Brydio draws them in its own theme, light and dark,
so an app looks like the rest of the product without trying to.

**This page is generated** from the catalogue itself by
`bun run docs:elements`. Adding an element or a setting and not running it
fails `packages/cli/test/elements-doc.test.ts`, so the reference cannot
fall behind the code. Do not edit it by hand.

A setting the element does not declare is refused, as is a value outside
what it takes; `brydio validate` catches both before you publish, with the
codes in [the publish checklist](publish-checklist.md).

There are 28 elements.

- [`bry-stack`](#bry-stack)
- [`bry-heading`](#bry-heading)
- [`bry-text`](#bry-text)
- [`bry-button`](#bry-button)
- [`bry-card`](#bry-card)
- [`bry-input`](#bry-input)
- [`bry-textarea`](#bry-textarea)
- [`bry-select`](#bry-select)
- [`bry-label`](#bry-label)
- [`bry-grid`](#bry-grid)
- [`bry-badge`](#bry-badge)
- [`bry-avatar`](#bry-avatar)
- [`bry-list-row`](#bry-list-row)
- [`bry-empty-state`](#bry-empty-state)
- [`bry-skeleton`](#bry-skeleton)
- [`bry-table`](#bry-table)
- [`bry-virtual-list`](#bry-virtual-list)
- [`bry-dialog`](#bry-dialog)
- [`bry-menu`](#bry-menu)
- [`bry-date`](#bry-date)
- [`bry-split`](#bry-split)
- [`bry-checkbox`](#bry-checkbox)
- [`bry-switch`](#bry-switch)
- [`bry-board`](#bry-board)
- [`bry-board-column`](#bry-board-column)
- [`bry-markdown`](#bry-markdown)
- [`bry-diff`](#bry-diff)
- [`bry-file-grid`](#bry-file-grid)

## `bry-stack`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `direction` | `row`, `column` | no |
| `gap` | `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8` | no |
| `align` | `start`, `center`, `end`, `stretch` | no |
| `justify` | `start`, `center`, `end`, `between` | no |
| `wrap` | `true` or `false` | no |

Tells the app nothing.

## `bry-heading`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `level` | a whole number from 1 to 4 | no |
| `text` | text, at most 200 characters | yes |
| `variant` | `title`, `heading`, `subheading`, `label` | no |

Tells the app nothing.

## `bry-text`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `text` | text, at most 4,000 characters | yes |
| `tone` | `default`, `muted`, `neutral`, `brand`, `success`, `warn`, `danger` | no |
| `variant` | `body`, `ui`, `caption`, `label` | no |
| `size` | `sm`, `md` | no |

Tells the app nothing.

## `bry-button`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `label` | text, at most 200 characters | yes |
| `variant` | `primary`, `secondary`, `ghost`, `danger` | no |
| `size` | `sm`, `md` | no |
| `disabled` | `true` or `false` | no |
| `working` | `true` or `false` | no |
| `icon` | `add`, `archive`, `calendar`, `check`, `copy`, `dismiss`, `docs`, `info`, `mail`, `members`, `notes`, `pin`, `rename`, `retry`, `search`, `settings`, `tasks`, `trash`, `more`, `close`, `arrowRight`, `chevronRight`, `chevronDown`, `chevronUp` | no |
| `hideLabel` | `true` or `false` | no |

Tells the app: `press`.

## `bry-card`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `title` | text, at most 200 characters | no |
| `padding` | `2`, `3`, `4`, `5`, `6` | no |
| `pressable` | `true` or `false` | no |
| `loading` | `true` or `false` | no |

Tells the app: `press`.

## `bry-input`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `value` | text, at most 1,000 characters | no |
| `placeholder` | text, at most 200 characters | no |
| `label` | text, at most 200 characters | no |
| `kind` | `text`, `email`, `url`, `search` | no |
| `maxLength` | a whole number from 1 to 1000 | no |
| `required` | `true` or `false` | no |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`, `submit`.

## `bry-textarea`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `value` | text, at most 4,000 characters | no |
| `placeholder` | text, at most 200 characters | no |
| `label` | text, at most 200 characters | no |
| `maxLength` | a whole number from 1 to 4000 | no |
| `required` | `true` or `false` | no |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`.

## `bry-select`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `value` | text, at most 200 characters | no |
| `options` | at most 100 `{ value, label }` choices | yes |
| `placeholder` | text, at most 200 characters | no |
| `label` | text, at most 200 characters | no |
| `size` | `sm`, `md` | no |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`.

## `bry-label`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `text` | text, at most 200 characters | yes |
| `required` | `true` or `false` | no |

Tells the app nothing.

## `bry-grid`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `columns` | `1`, `2`, `3`, `4`, `5`, `6` | no |
| `gap` | `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8` | no |
| `align` | `start`, `center`, `end`, `stretch` | no |

Tells the app nothing.

## `bry-badge`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `text` | text, at most 200 characters | yes |
| `tone` | `neutral`, `brand`, `success`, `warn`, `danger` | no |

Tells the app nothing.

## `bry-avatar`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `name` | text, at most 200 characters | yes |
| `size` | `sm`, `md`, `lg` | no |

Tells the app nothing.

## `bry-list-row`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `title` | text, at most 200 characters | no |
| `description` | text, at most 200 characters | no |
| `meta` | text, at most 200 characters | no |
| `pressable` | `true` or `false` | no |
| `selected` | `true` or `false` | no |
| `loading` | `true` or `false` | no |

Tells the app: `press`.

## `bry-empty-state`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `title` | text, at most 200 characters | yes |
| `text` | text, at most 4,000 characters | no |
| `action` | text, at most 200 characters | no |

Tells the app: `action`.

## `bry-skeleton`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `shape` | `line`, `block`, `row` | no |
| `count` | a whole number from 1 to 12 | no |

Tells the app nothing.

## `bry-table`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `columns` | a list of at most 12: a record of `key`, `heading`, `align`, `sortable` (needs `key`, `heading`) | yes |
| `rows` | a list of at most 500: a record of `id`, `cells` (needs `id`, `cells`) | no |
| `sort` | a record of `key`, `direction` (needs `key`, `direction`) | no |
| `label` | text, at most 200 characters | no |
| `selectable` | `true` or `false` | no |
| `selected` | text, at most 128 characters | no |
| `loading` | `true` or `false` | no |
| `empty` | text, at most 200 characters | no |

Tells the app: `sort`, `select`.

## `bry-virtual-list`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `count` | a whole number from 0 to 1000000 | yes |
| `start` | a whole number from 0 to 1000000 | no |
| `rowSize` | `sm`, `md`, `lg` | no |
| `label` | text, at most 200 characters | no |
| `selectable` | `true` or `false` | no |
| `selected` | a whole number from 0 to 1000000 | no |
| `loading` | `true` or `false` | no |
| `empty` | text, at most 200 characters | no |

Tells the app: `range`, `select`.

## `bry-dialog`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `open` | `true` or `false` | no |
| `title` | text, at most 200 characters | yes |
| `description` | text, at most 4,000 characters | no |
| `actions` | a list of at most 3: a record of `id`, `label`, `tone`, `disabled` (needs `id`, `label`) | no |
| `cancel` | text, at most 200 characters | no |

Tells the app: `action`, `close`.

## `bry-menu`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `items` | a list of at most 20: a record of `id`, `label`, `icon`, `tone`, `separator`, `disabled` (needs `id`, `label`) | yes |

Tells the app: `select`.

## `bry-date`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `value` | text, at most 10 characters | no |
| `min` | text, at most 10 characters | no |
| `max` | text, at most 10 characters | no |
| `label` | text, at most 200 characters | no |
| `placeholder` | text, at most 200 characters | no |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`.

## `bry-split`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `ratio` | a whole number from 20 to 80 | no |
| `label` | text, at most 200 characters | no |

Tells the app nothing.

## `bry-checkbox`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `checked` | `true` or `false` | no |
| `label` | text, at most 200 characters | yes |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`.

## `bry-switch`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `checked` | `true` or `false` | no |
| `label` | text, at most 200 characters | yes |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`.

## `bry-board`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `label` | text, at most 200 characters | no |
| `cardSize` | `sm`, `md`, `lg` | no |
| `settled` | text, at most 128 characters | no |
| `loading` | `true` or `false` | no |
| `empty` | text, at most 200 characters | no |

Tells the app: `move`.

## `bry-board-column`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `title` | text, at most 200 characters | yes |
| `count` | a whole number from 0 to 100000 | no |
| `limit` | a whole number from 1 to 100000 | no |
| `start` | a whole number from 0 to 100000 | no |
| `loading` | `true` or `false` | no |
| `empty` | text, at most 200 characters | no |

Tells the app: `range`.

## `bry-markdown`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `text` | text, at most 50,000 characters | yes |
| `expanded` | `true` or `false` | no |

Tells the app nothing.

## `bry-diff`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `files` | a list of at most 300: a record of `path`, `previous`, `status`, `patch` (needs `path`) | yes |
| `label` | text, at most 200 characters | no |
| `loading` | `true` or `false` | no |
| `empty` | text, at most 200 characters | no |

Tells the app: `expand`, `select`.

## `bry-file-grid`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `label` | text, at most 200 characters | no |
| `count` | a whole number from 0 to 100000 | yes |
| `start` | a whole number from 0 to 100000 | no |
| `files` | a list of at most 200: a record of `id`, `name`, `kind`, `preview`, `size`, `modified` (needs `id`, `name`, `kind`) | no |
| `tileSize` | `sm`, `md`, `lg` | no |
| `selectable` | `true` or `false` | no |
| `selected` | a list of at most 200: text, at most 128 characters | no |
| `menu` | a list of at most 12: a record of `id`, `label`, `icon`, `tone` (needs `id`, `label`) | no |
| `loading` | `true` or `false` | no |
| `empty` | text, at most 200 characters | no |

Tells the app: `open`, `select`, `menu`, `range`.
