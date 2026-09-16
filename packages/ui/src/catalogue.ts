/**
 * The catalogue: every element an app can draw with, and nothing else
 * (contracts §10, A6-F01, ADR-A13).
 *
 * This is a copy of Brydio's own declaration,
 * `packages/app/src/apps/catalogue/elements.ts`, which is what the host checks
 * every node against before it draws anything. The copy is kept exact on
 * purpose, down to the lengths and the wording of each refusal: the worker
 * runtime refuses a node here with the sentence the host would send back in
 * `tree/refused`, `brydio validate` reads the same table, and the fake host
 * refuses exactly what a workspace would. A copy that was merely similar
 * would let a screen pass every local check and stop in front of a person.
 * `test/catalogue.test.ts` compares the two whenever a Brydio checkout sits
 * beside this repository.
 *
 * No setting accepts a colour, a pixel size, a class name or a style. Spacing,
 * tone and size are chosen by name, and Brydio turns the name into the right
 * value for the theme.
 */

/** One setting: which values it takes. */
export type PropSpec =
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'text'; readonly max: number }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'int'; readonly min: number; readonly max: number }
  /** A list of `{ value, label }` choices, at most `max` of them: a select's options. */
  | { readonly kind: 'options'; readonly max: number }
  /** A list of at most `max` values, each checked against `of`: a table's columns. */
  | { readonly kind: 'list'; readonly max: number; readonly of: PropSpec }
  /** One record with named fields, each checked on its own: a column. No other field is allowed. */
  | { readonly kind: 'shape'; readonly fields: Readonly<Record<string, PropSpec>>; readonly required?: readonly string[] };

export interface ElementSpec {
  readonly props: Readonly<Record<string, PropSpec>>;
  /** Settings a node must carry to be drawn at all. */
  readonly required?: readonly string[];
  /** What it tells the app: a button's `press`. */
  readonly events: readonly string[];
  /** Whether other nodes, elements or text, may sit inside it. */
  readonly children: boolean;
}

/** Short text on a control or a heading. Long enough for a sentence, no more. */
export const LABEL_MAX = 200;
/** A paragraph. Long text belongs in more than one node. */
export const PARAGRAPH_MAX = 4_000;

/** Steps on the spacing scale an app may name. `gap="3"` is Brydio's `gap-3`. */
export const GAPS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
export const PADDINGS = ['2', '3', '4', '5', '6'] as const;

/** The five tones a status can be shown in (A6-F01-S02). */
export const TONES = ['neutral', 'brand', 'success', 'warn', 'danger'] as const;

/** The most a one-line field holds. */
export const INPUT_MAX = 1_000;

/** The most choices a select offers. A longer list wants a search. */
export const SELECT_MAX = 100;

/** The most columns a table has. More belongs in a detail view. */
export const TABLE_COLUMNS = 12;
/** The most rows a table holds at once. A longer list is a `bry-virtual-list`. */
export const TABLE_ROWS = 500;
/** A column's key and a row's id: short, and never shown. */
export const KEY_MAX = 128;

/** The most rows a virtual list can say it has. */
export const VIRTUAL_ROWS = 1_000_000;

/** The most buttons a dialog has, not counting Cancel. */
export const DIALOG_ACTIONS = 3;

/** The most items a menu has. */
export const MENU_ITEMS = 20;

/**
 * The icons a menu item may show, by name, from the shell's own set. An app
 * can't supply a picture, and a name outside this list is refused.
 */
export const MENU_ICONS = [
  'add',
  'archive',
  'calendar',
  'check',
  'copy',
  'dismiss',
  'docs',
  'info',
  'mail',
  'members',
  'notes',
  'pin',
  'rename',
  'retry',
  'search',
  'settings',
  'tasks',
  'trash',
] as const;

/** An ISO date is ten characters: `2026-09-16`. */
const ISO_DATE = 10;

/**
 * Every element an app may use, as the host declares them: Phase 0's five,
 * then each one Brydio has added since, in the order it registers them.
 */
export const CATALOGUE = {
  'bry-stack': {
    props: {
      direction: { kind: 'enum', values: ['row', 'column'] },
      gap: { kind: 'enum', values: GAPS },
      align: { kind: 'enum', values: ['start', 'center', 'end', 'stretch'] },
      justify: { kind: 'enum', values: ['start', 'center', 'end', 'between'] },
      wrap: { kind: 'boolean' },
    },
    events: [],
    children: true,
  },
  'bry-heading': {
    props: { level: { kind: 'int', min: 1, max: 3 }, text: { kind: 'text', max: LABEL_MAX } },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-text': {
    props: {
      text: { kind: 'text', max: PARAGRAPH_MAX },
      tone: { kind: 'enum', values: ['default', 'muted', 'danger'] },
      size: { kind: 'enum', values: ['sm', 'md'] },
    },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-button': {
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      variant: { kind: 'enum', values: ['primary', 'secondary', 'ghost', 'danger'] },
      size: { kind: 'enum', values: ['sm', 'md'] },
      disabled: { kind: 'boolean' },
      // Disabled, showing progress, while what it started is running.
      working: { kind: 'boolean' },
    },
    required: ['label'],
    events: ['press'],
    children: false,
  },
  'bry-card': {
    // The host raises `press` only while `pressable` is true.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      padding: { kind: 'enum', values: PADDINGS },
      pressable: { kind: 'boolean' },
      // Draws the shell's loading placeholder in the card's place.
      loading: { kind: 'boolean' },
    },
    events: ['press'],
    children: true,
  },
  'bry-input': {
    // One line the person types. `change` carries `{ value }` on every
    // keystroke and Enter raises `submit` with the same; the field keeps what
    // was typed until the app sends a different `value`.
    props: {
      value: { kind: 'text', max: INPUT_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      kind: { kind: 'enum', values: ['text', 'email', 'url', 'search'] },
      maxLength: { kind: 'int', min: 1, max: INPUT_MAX },
      required: { kind: 'boolean' },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    events: ['change', 'submit'],
    children: false,
  },
  'bry-textarea': {
    // Like `bry-input` over more than one line, without `submit`: Enter starts a new line.
    props: {
      value: { kind: 'text', max: PARAGRAPH_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      maxLength: { kind: 'int', min: 1, max: PARAGRAPH_MAX },
      required: { kind: 'boolean' },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    events: ['change'],
    children: false,
  },
  'bry-select': {
    // One choice from a short list. Choosing raises `change` with `{ value }`;
    // what is shown stays the app's `value` until the app sends a new one.
    props: {
      value: { kind: 'text', max: LABEL_MAX },
      options: { kind: 'options', max: SELECT_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      size: { kind: 'enum', values: ['sm', 'md'] },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    required: ['options'],
    events: ['change'],
    children: false,
  },
  'bry-label': {
    // A field's name, above the control it holds, which it names for a screen reader.
    props: {
      text: { kind: 'text', max: LABEL_MAX },
      required: { kind: 'boolean' },
    },
    required: ['text'],
    events: [],
    children: true,
  },
  'bry-grid': {
    // Children in equal columns; the app picks how many from the width it is given.
    props: {
      columns: { kind: 'enum', values: ['1', '2', '3', '4', '5', '6'] },
      gap: { kind: 'enum', values: GAPS },
      align: { kind: 'enum', values: ['start', 'center', 'end', 'stretch'] },
    },
    events: [],
    children: true,
  },
  'bry-badge': {
    props: {
      text: { kind: 'text', max: LABEL_MAX },
      tone: { kind: 'enum', values: TONES },
    },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-avatar': {
    // Initials only: a picture address would let an app load anything from anywhere.
    props: {
      name: { kind: 'text', max: LABEL_MAX },
      size: { kind: 'enum', values: ['sm', 'md', 'lg'] },
    },
    required: ['name'],
    events: [],
    children: false,
  },
  'bry-list-row': {
    // Children sit at the end of the row (a badge, an avatar).
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: LABEL_MAX },
      meta: { kind: 'text', max: LABEL_MAX },
      pressable: { kind: 'boolean' },
      selected: { kind: 'boolean' },
      loading: { kind: 'boolean' },
    },
    events: ['press'],
    children: true,
  },
  'bry-empty-state': {
    // `action` is one button's label; pressing it raises `action`.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      text: { kind: 'text', max: PARAGRAPH_MAX },
      action: { kind: 'text', max: LABEL_MAX },
    },
    required: ['title'],
    events: ['action'],
    children: false,
  },
  'bry-skeleton': {
    props: {
      shape: { kind: 'enum', values: ['line', 'block', 'row'] },
      count: { kind: 'int', min: 1, max: 12 },
    },
    events: [],
    children: false,
  },
  'bry-table': {
    // Rows of text under column headings. Sorting is the app's: a header press
    // raises `sort` with `{ key, direction }`, the app re-orders `rows` and
    // sends `sort` back. With `selectable`, choosing a row raises `select`
    // with `{ row }`, the row's id.
    props: {
      columns: {
        kind: 'list',
        max: TABLE_COLUMNS,
        of: {
          kind: 'shape',
          fields: {
            key: { kind: 'text', max: KEY_MAX },
            heading: { kind: 'text', max: LABEL_MAX },
            align: { kind: 'enum', values: ['start', 'end'] },
            sortable: { kind: 'boolean' },
          },
          required: ['key', 'heading'],
        },
      },
      rows: {
        kind: 'list',
        max: TABLE_ROWS,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            cells: { kind: 'list', max: TABLE_COLUMNS, of: { kind: 'text', max: LABEL_MAX } },
          },
          required: ['id', 'cells'],
        },
      },
      sort: {
        kind: 'shape',
        fields: { key: { kind: 'text', max: KEY_MAX }, direction: { kind: 'enum', values: ['asc', 'desc'] } },
        required: ['key', 'direction'],
      },
      label: { kind: 'text', max: LABEL_MAX },
      selectable: { kind: 'boolean' },
      selected: { kind: 'text', max: KEY_MAX },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    required: ['columns'],
    events: ['sort', 'select'],
    children: false,
  },
  'bry-virtual-list': {
    // A long list that keeps only the rows in view. The app says how many rows
    // there are and sends, as children, only those it is asked for, the first
    // being row `start`. `range` carries `{ start, end }`, `end` excluded;
    // `select` carries `{ index }`.
    props: {
      count: { kind: 'int', min: 0, max: VIRTUAL_ROWS },
      start: { kind: 'int', min: 0, max: VIRTUAL_ROWS },
      rowSize: { kind: 'enum', values: ['sm', 'md', 'lg'] },
      label: { kind: 'text', max: LABEL_MAX },
      selectable: { kind: 'boolean' },
      selected: { kind: 'int', min: 0, max: VIRTUAL_ROWS },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    required: ['count'],
    events: ['range', 'select'],
    children: true,
  },
  'bry-dialog': {
    // A question answered before going on. Escape, the backdrop and Cancel
    // always close it and raise `close`; an action raises `action` with
    // `{ id }` and the dialog stays open until the app closes it. A second
    // dialog asking to open stays shut and raises `close` with `{ refused }`.
    props: {
      open: { kind: 'boolean' },
      title: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: PARAGRAPH_MAX },
      actions: {
        kind: 'list',
        max: DIALOG_ACTIONS,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            tone: { kind: 'enum', values: ['default', 'primary', 'danger'] },
            disabled: { kind: 'boolean' },
          },
          required: ['id', 'label'],
        },
      },
      cancel: { kind: 'text', max: LABEL_MAX },
    },
    required: ['title'],
    events: ['action', 'close'],
    children: true,
  },
  'bry-menu': {
    // A short list of things to do, opened from its one child, the anchor.
    // Choosing an item raises `select` with `{ id }`.
    props: {
      items: {
        kind: 'list',
        max: MENU_ITEMS,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            icon: { kind: 'enum', values: MENU_ICONS },
            tone: { kind: 'enum', values: ['default', 'danger'] },
            separator: { kind: 'boolean' },
            disabled: { kind: 'boolean' },
          },
          required: ['id', 'label'],
        },
      },
    },
    required: ['items'],
    events: ['select'],
    children: true,
  },
  'bry-date': {
    // A day picked from a calendar. `value`, `min`, `max` and what `change`
    // carries as `{ value }` are ISO dates; the person sees their own locale.
    props: {
      value: { kind: 'text', max: ISO_DATE },
      min: { kind: 'text', max: ISO_DATE },
      max: { kind: 'text', max: ISO_DATE },
      label: { kind: 'text', max: LABEL_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    events: ['change'],
    children: false,
  },
  'bry-split': {
    // Two panes, its two children, with a handle between. `ratio` is the
    // first pane's starting share in percent. Where there isn't room they stack.
    props: {
      ratio: { kind: 'int', min: 20, max: 80 },
      label: { kind: 'text', max: LABEL_MAX },
    },
    events: [],
    children: true,
  },
  'bry-checkbox': {
    // A yes or no with its label. Pressing it raises `change` with `{ checked }`.
    props: {
      checked: { kind: 'boolean' },
      label: { kind: 'text', max: LABEL_MAX },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    required: ['label'],
    events: ['change'],
    children: false,
  },
  'bry-switch': {
    // The same contract as `bry-checkbox`, drawn as the shell's switch.
    props: {
      checked: { kind: 'boolean' },
      label: { kind: 'text', max: LABEL_MAX },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    required: ['label'],
    events: ['change'],
    children: false,
  },
} as const satisfies Readonly<Record<`bry-${string}`, ElementSpec>>;

export type Catalogue = typeof CATALOGUE;

export type ElementName = keyof Catalogue;

/** The element names, in the catalogue's order. */
export const ELEMENT_NAMES = Object.keys(CATALOGUE) as ElementName[];

/** A run of text between elements. Drawn as text, never as markup. */
export const TEXT_NODE = '#text';

/** The longest a text node may be. */
export const MAX_TEXT = PARAGRAPH_MAX;

/**
 * Settings no element will ever take, named so a local refusal can say why
 * rather than just "unknown". Only the SDK adds these words; the host's
 * sentence comes first, unchanged.
 */
export const FORBIDDEN_PROPS: Readonly<Record<string, string>> = {
  style: 'Brydio draws every element in its own style; there is no style setting.',
  className: 'There are no classes in a Brydio app; choose a setting the element offers.',
  class: 'There are no classes in a Brydio app; choose a setting the element offers.',
  color: 'Colours come from Brydio’s tokens through a setting like tone, never a value.',
  colour: 'Colours come from Brydio’s tokens through a setting like tone, never a value.',
  dangerouslySetInnerHTML: 'A Brydio app has no HTML to set.',
  innerHTML: 'A Brydio app has no HTML to set.',
};
