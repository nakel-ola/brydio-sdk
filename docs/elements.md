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

A toast is not an element: it is said, not placed. A screen shows one with
`toast(text, tone)` from `@brydio/app`, which Brydio draws in its own
toaster; see [the bridge](bridge.md).

There are 72 elements.

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
- [`bry-button-group`](#bry-button-group)
- [`bry-calendar`](#bry-calendar)
- [`bry-combobox`](#bry-combobox)
- [`bry-command`](#bry-command)
- [`bry-context-menu`](#bry-context-menu)
- [`bry-data-table`](#bry-data-table)
- [`bry-field`](#bry-field)
- [`bry-input-group`](#bry-input-group)
- [`bry-input-otp`](#bry-input-otp)
- [`bry-menubar`](#bry-menubar)
- [`bry-native-select`](#bry-native-select)
- [`bry-section-menu`](#bry-section-menu)
- [`bry-pagination`](#bry-pagination)
- [`bry-questionnaire`](#bry-questionnaire)
- [`bry-radio-group`](#bry-radio-group)
- [`bry-slider`](#bry-slider)
- [`bry-toggle`](#bry-toggle)
- [`bry-toggle-group`](#bry-toggle-group)
- [`bry-accordion`](#bry-accordion)
- [`bry-alert`](#bry-alert)
- [`bry-alert-dialog`](#bry-alert-dialog)
- [`bry-aspect-ratio`](#bry-aspect-ratio)
- [`bry-attachment`](#bry-attachment)
- [`bry-breadcrumb`](#bry-breadcrumb)
- [`bry-bubble`](#bry-bubble)
- [`bry-carousel`](#bry-carousel)
- [`bry-chart`](#bry-chart)
- [`bry-collapsible`](#bry-collapsible)
- [`bry-direction`](#bry-direction)
- [`bry-drawer`](#bry-drawer)
- [`bry-hover-card`](#bry-hover-card)
- [`bry-item`](#bry-item)
- [`bry-kbd`](#bry-kbd)
- [`bry-marker`](#bry-marker)
- [`bry-message`](#bry-message)
- [`bry-message-scroller`](#bry-message-scroller)
- [`bry-popover`](#bry-popover)
- [`bry-progress`](#bry-progress)
- [`bry-scroll-area`](#bry-scroll-area)
- [`bry-separator`](#bry-separator)
- [`bry-sheet`](#bry-sheet)
- [`bry-spinner`](#bry-spinner)
- [`bry-tabs`](#bry-tabs)
- [`bry-tooltip`](#bry-tooltip)

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

## `bry-button-group`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `label` | text, at most 200 characters | yes |
| `orientation` | `horizontal`, `vertical` | no |

Tells the app nothing.

## `bry-calendar`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `mode` | `single`, `multiple`, `range` | no |
| `values` | a list of at most 366: text, at most 10 characters | no |
| `month` | text, at most 10 characters | no |
| `min` | text, at most 10 characters | no |
| `max` | text, at most 10 characters | no |
| `label` | text, at most 200 characters | no |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`.

## `bry-combobox`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `value` | text, at most 200 characters | no |
| `options` | at most 500 `{ value, label }` choices | yes |
| `placeholder` | text, at most 200 characters | no |
| `search` | text, at most 200 characters | no |
| `empty` | text, at most 200 characters | no |
| `label` | text, at most 200 characters | no |
| `size` | `sm`, `md` | no |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`.

## `bry-command`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `items` | a list of at most 200: a record of `id`, `label`, `group`, `icon`, `hint`, `disabled` (needs `id`, `label`) | yes |
| `placeholder` | text, at most 200 characters | no |
| `label` | text, at most 200 characters | no |
| `loading` | `true` or `false` | no |
| `empty` | text, at most 200 characters | no |

Tells the app: `select`, `change`.

## `bry-context-menu`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `items` | a list of at most 20: a record of `id`, `label`, `icon`, `tone`, `separator`, `disabled` (needs `id`, `label`) | yes |

Tells the app: `select`.

## `bry-data-table`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `columns` | a list of at most 12: a record of `key`, `heading`, `align`, `sortable`, `hideable` (needs `key`, `heading`) | yes |
| `rows` | a list of at most 500: a record of `id`, `cells` (needs `id`, `cells`) | no |
| `sort` | a record of `key`, `direction` (needs `key`, `direction`) | no |
| `filter` | text, at most 200 characters | no |
| `placeholder` | text, at most 200 characters | no |
| `page` | a whole number from 1 to 500 | no |
| `perPage` | a whole number from 1 to 100 | no |
| `hidden` | a list of at most 12: text, at most 128 characters | no |
| `selectable` | `true` or `false` | no |
| `selected` | a list of at most 500: text, at most 128 characters | no |
| `label` | text, at most 200 characters | no |
| `loading` | `true` or `false` | no |
| `empty` | text, at most 200 characters | no |

Tells the app: `sort`, `filter`, `page`, `columns`, `select`.

## `bry-field`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `label` | text, at most 200 characters | yes |
| `description` | text, at most 4,000 characters | no |
| `error` | text, at most 200 characters | no |
| `required` | `true` or `false` | no |
| `orientation` | `vertical`, `horizontal` | no |

Tells the app nothing.

## `bry-input-group`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `value` | text, at most 1,000 characters | no |
| `placeholder` | text, at most 200 characters | no |
| `label` | text, at most 200 characters | no |
| `kind` | `text`, `email`, `url`, `search` | no |
| `icon` | `add`, `archive`, `calendar`, `check`, `copy`, `dismiss`, `docs`, `info`, `mail`, `members`, `notes`, `pin`, `rename`, `retry`, `search`, `settings`, `tasks`, `trash` | no |
| `prefix` | text, at most 24 characters | no |
| `suffix` | text, at most 24 characters | no |
| `action` | text, at most 200 characters | no |
| `actionIcon` | `add`, `archive`, `calendar`, `check`, `copy`, `dismiss`, `docs`, `info`, `mail`, `members`, `notes`, `pin`, `rename`, `retry`, `search`, `settings`, `tasks`, `trash` | no |
| `maxLength` | a whole number from 1 to 1000 | no |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`, `submit`, `action`.

## `bry-input-otp`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `value` | text, at most 8 characters | no |
| `length` | a whole number from 4 to 8 | no |
| `pattern` | `digits`, `alphanumeric` | no |
| `label` | text, at most 200 characters | yes |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`, `complete`.

## `bry-menubar`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `menus` | a list of at most 8: a record of `id`, `label`, `items` (needs `id`, `label`, `items`) | yes |
| `label` | text, at most 200 characters | yes |

Tells the app: `select`.

## `bry-native-select`

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

## `bry-section-menu`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `sections` | a list of at most 8: a record of `id`, `label`, `entries`, `disabled` (needs `id`, `label`) | yes |
| `current` | text, at most 128 characters | no |
| `label` | text, at most 200 characters | yes |

Tells the app: `select`.

## `bry-pagination`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `page` | a whole number from 1 to 100000 | yes |
| `count` | a whole number from 1 to 100000 | yes |
| `label` | text, at most 200 characters | no |
| `disabled` | `true` or `false` | no |

Tells the app: `page`.

## `bry-questionnaire`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `title` | text, at most 200 characters | no |
| `questions` | a list of at most 50: a record of `id`, `kind`, `prompt`, `description`, `choices`, `required`, `scale`, `placeholder` (needs `id`, `kind`, `prompt`) | yes |
| `action` | text, at most 200 characters | no |
| `working` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `answer`, `step`, `submit`.

## `bry-radio-group`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `value` | text, at most 200 characters | no |
| `options` | at most 20 `{ value, label }` choices | yes |
| `label` | text, at most 200 characters | yes |
| `orientation` | `vertical`, `horizontal` | no |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`.

## `bry-slider`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `value` | a whole number from -1000000 to 1000000 | no |
| `min` | a whole number from -1000000 to 1000000 | no |
| `max` | a whole number from -1000000 to 1000000 | no |
| `step` | a whole number from 1 to 1000000 | no |
| `label` | text, at most 200 characters | yes |
| `disabled` | `true` or `false` | no |
| `error` | text, at most 200 characters | no |

Tells the app: `change`, `commit`.

## `bry-toggle`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `pressed` | `true` or `false` | no |
| `label` | text, at most 200 characters | yes |
| `icon` | `add`, `archive`, `calendar`, `check`, `copy`, `dismiss`, `docs`, `info`, `mail`, `members`, `notes`, `pin`, `rename`, `retry`, `search`, `settings`, `tasks`, `trash`, `more`, `close`, `arrowRight`, `chevronRight`, `chevronDown`, `chevronUp` | no |
| `hideLabel` | `true` or `false` | no |
| `variant` | `default`, `outline` | no |
| `size` | `sm`, `md` | no |
| `disabled` | `true` or `false` | no |

Tells the app: `change`.

## `bry-toggle-group`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `type` | `single`, `multiple` | no |
| `items` | a list of at most 12: a record of `value`, `label`, `icon`, `hideLabel`, `disabled` (needs `value`, `label`) | yes |
| `values` | a list of at most 12: text, at most 128 characters | no |
| `label` | text, at most 200 characters | yes |
| `variant` | `default`, `outline` | no |
| `size` | `sm`, `md` | no |
| `disabled` | `true` or `false` | no |

Tells the app: `change`.

## `bry-accordion`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `sections` | a list of at most 20: a record of `id`, `title`, `disabled` (needs `id`, `title`) | yes |
| `expanded` | a list of at most 20: text, at most 128 characters | no |
| `multiple` | `true` or `false` | no |

Tells the app: `change`.

## `bry-alert`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `title` | text, at most 200 characters | yes |
| `description` | text, at most 4,000 characters | no |
| `tone` | `neutral`, `brand`, `success`, `warn`, `danger` | no |

Tells the app nothing.

## `bry-alert-dialog`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `open` | `true` or `false` | no |
| `title` | text, at most 200 characters | yes |
| `description` | text, at most 4,000 characters | no |
| `action` | text, at most 200 characters | yes |
| `tone` | `default`, `danger` | no |
| `cancel` | text, at most 200 characters | no |

Tells the app: `action`, `close`.

## `bry-aspect-ratio`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `ratio` | `21:9`, `16:9`, `3:2`, `4:3`, `1:1`, `3:4`, `2:3`, `9:16` | no |

Tells the app nothing.

## `bry-attachment`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `name` | text, at most 200 characters | yes |
| `kind` | `document`, `spreadsheet`, `presentation`, `pdf`, `image`, `video`, `audio`, `code`, `archive`, `folder`, `other` | no |
| `bytes` | a whole number from 0 to 2000000000 | no |
| `pressable` | `true` or `false` | no |
| `removable` | `true` or `false` | no |

Tells the app: `open`, `remove`.

## `bry-breadcrumb`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `items` | a list of at most 8: a record of `id`, `label` (needs `id`, `label`) | yes |

Tells the app: `select`.

## `bry-bubble`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `text` | text, at most 4,000 characters | no |
| `from` | `self`, `other` | no |

Tells the app nothing.

## `bry-carousel`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `label` | text, at most 200 characters | yes |
| `index` | a whole number from 0 to 49 | no |

Tells the app: `change`.

## `bry-chart`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `kind` | `bar`, `line`, `area`, `pie` | yes |
| `label` | text, at most 200 characters | yes |
| `categories` | a list of at most 60: text, at most 200 characters | yes |
| `series` | a list of at most 6: a record of `name`, `values` (needs `name`, `values`) | yes |
| `decimals` | a whole number from 0 to 4 | no |
| `stacked` | `true` or `false` | no |
| `loading` | `true` or `false` | no |
| `empty` | text, at most 200 characters | no |

Tells the app nothing.

## `bry-collapsible`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `title` | text, at most 200 characters | yes |
| `open` | `true` or `false` | no |

Tells the app: `change`.

## `bry-direction`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `dir` | `ltr`, `rtl` | yes |

Tells the app nothing.

## `bry-drawer`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `open` | `true` or `false` | no |
| `title` | text, at most 200 characters | yes |
| `description` | text, at most 4,000 characters | no |

Tells the app: `close`.

## `bry-hover-card`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `side` | `top`, `bottom` | no |

Tells the app: `open`, `close`.

## `bry-item`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `title` | text, at most 200 characters | no |
| `description` | text, at most 200 characters | no |
| `icon` | `add`, `archive`, `calendar`, `check`, `copy`, `dismiss`, `docs`, `info`, `mail`, `members`, `notes`, `pin`, `rename`, `retry`, `search`, `settings`, `tasks`, `trash` | no |
| `variant` | `default`, `outline`, `muted` | no |
| `size` | `sm`, `md` | no |
| `pressable` | `true` or `false` | no |
| `loading` | `true` or `false` | no |

Tells the app: `press`.

## `bry-kbd`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `text` | text, at most 40 characters | yes |

Tells the app nothing.

## `bry-marker`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `text` | text, at most 200 characters | yes |
| `tone` | `neutral`, `brand`, `success`, `warn`, `danger` | no |

Tells the app nothing.

## `bry-message`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `name` | text, at most 200 characters | yes |
| `meta` | text, at most 200 characters | no |
| `from` | `self`, `other` | no |
| `status` | `sent`, `sending`, `failed` | no |

Tells the app: `retry`.

## `bry-message-scroller`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `label` | text, at most 200 characters | yes |
| `more` | `true` or `false` | no |
| `loading` | `true` or `false` | no |
| `empty` | text, at most 200 characters | no |

Tells the app: `more`.

## `bry-popover`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `open` | `true` or `false` | no |
| `title` | text, at most 200 characters | no |
| `side` | `top`, `bottom` | no |
| `align` | `start`, `center`, `end` | no |

Tells the app: `open`, `close`.

## `bry-progress`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `value` | a whole number from 0 to 100 | no |
| `label` | text, at most 200 characters | yes |

Tells the app nothing.

## `bry-scroll-area`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `label` | text, at most 200 characters | yes |
| `size` | `sm`, `md`, `lg` | no |

Tells the app nothing.

## `bry-separator`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `orientation` | `horizontal`, `vertical` | no |

Tells the app nothing.

## `bry-sheet`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `open` | `true` or `false` | no |
| `title` | text, at most 200 characters | yes |
| `description` | text, at most 4,000 characters | no |
| `side` | `start`, `end` | no |

Tells the app: `close`.

## `bry-spinner`

Holds nothing: it is drawn from its settings alone.

| Setting | Takes | Needed |
|---|---|---|
| `label` | text, at most 200 characters | no |
| `size` | `sm`, `md`, `lg` | no |

Tells the app nothing.

## `bry-tabs`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `tabs` | a list of at most 12: a record of `id`, `label`, `disabled` (needs `id`, `label`) | yes |
| `value` | text, at most 128 characters | no |
| `label` | text, at most 200 characters | no |
| `variant` | `segmented`, `line` | no |

Tells the app: `change`.

## `bry-tooltip`

Holds other elements or text.

| Setting | Takes | Needed |
|---|---|---|
| `text` | text, at most 200 characters | yes |
| `side` | `top`, `bottom` | no |

Tells the app nothing.
