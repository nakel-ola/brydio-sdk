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
import { PARAGRAPH_MAX } from './basics.ts';

export { FORBIDDEN_PROPS, MAX_TEXT, PARAGRAPH_MAX, TEXT_NODE } from './basics.ts';


/** Steps on the spacing scale an app may name. `gap="3"` is Brydio's `gap-3`. */
export const GAPS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
export const PADDINGS = ['2', '3', '4', '5', '6'] as const;

/**
 * The tones a status can be shown in, and the sizes an element may name.
 * Brydio generates these from its kit's `tokens.css` (A6-F01-S02, A6-F05-S03),
 * so the catalogue can't offer one the stylesheet doesn't have.
 */
export const TONES = ['neutral', 'brand', 'success', 'warn', 'danger'] as const;
export const SIZES = ['sm', 'md', 'lg'] as const;

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

/**
 * The icons a button may show, by name, from the shell's own set: a menu's,
 * plus the few a button needs that a menu item doesn't. An app can't supply a
 * picture.
 */
export const BUTTON_ICONS = [...MENU_ICONS, 'more', 'close', 'arrowRight', 'chevronRight', 'chevronDown', 'chevronUp'] as const;

/** The most cards a board column can say it holds. */
export const BOARD_CARDS = 100_000;

/** The most text one `bry-markdown` holds. Longer belongs in more than one. */
export const MARKDOWN_MAX = 50_000;

/** The most files one diff lists. */
export const DIFF_FILES = 300;
/** A file's path, and where it was. */
const DIFF_PATH = 1_000;
/** One file's unified diff text. A larger one is sent when the person opens it, or not at all. */
export const DIFF_PATCH = 200_000;

/** The most files a folder may say it has, and the most sent in one window. */
export const FILE_GRID_COUNT = 100_000;
export const FILE_GRID_WINDOW = 200;

/** What a file is, as far as its icon and preview go. */
export const FILE_KINDS = ['document', 'spreadsheet', 'presentation', 'pdf', 'image', 'video', 'audio', 'code', 'archive', 'folder', 'other'] as const;

/** An ISO date is ten characters: `2026-09-16`. */
const ISO_DATE = 10;

// ADR-A23 (catalogue-b)
/** The most days a calendar holds chosen at once: a year's worth. */
export const CALENDAR_DAYS = 366;
/** The most choices a combobox offers. Past this the app searches for them itself. */
export const COMBOBOX_MAX = 500;
/** The most commands one `bry-command` list holds. */
export const COMMAND_ITEMS = 200;
/** The most rows one page of a data table shows. */
export const DATA_TABLE_PAGE = 100;
/** A prefix or suffix on an input group is a few characters: `https://`, `.com`, `kg`. */
const AFFIX = 24;
/** The longest one-time code. */
export const OTP_MAX = 8;
/** The most menus on one menubar. */
export const MENUBAR_MENUS = 8;
/** The most sections along one section menu, and the most entries under one. */
export const SECTION_MENU_SECTIONS = 8;
export const SECTION_MENU_ENTRIES = 12;
/** The most pages a pagination can say there are. */
export const PAGES = 100_000;
/** The most questions one questionnaire asks, and the most choices one question offers. */
export const QUESTIONS = 50;
export const QUESTION_CHOICES = 20;
/** The most choices a radio group shows. More belongs in a select. */
export const RADIO_MAX = 20;
/** The furthest a slider reaches either side of nought. */
export const SLIDER_LIMIT = 1_000_000;
/** The most toggles in one toggle group. */
export const TOGGLE_GROUP_ITEMS = 12;

/** A menu item, as `bry-menu`, `bry-context-menu` and `bry-menubar` take it. */
const MENU_ITEM = {
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
} as const;

// ADR-A23 (catalogue-a)
/** The most sections an accordion has. */
export const ACCORDION_SECTIONS = 20;
/** The shapes an aspect ratio holds, wide to tall. */
export const RATIOS = ['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16'] as const;
/** The most steps a breadcrumb shows. */
export const BREADCRUMB_STEPS = 8;
/** The most slides a carousel shows. */
export const CAROUSEL_SLIDES = 50;
/** The most categories along a chart's axis, or slices offered to a pie. */
export const CHART_POINTS = 60;
/** The most series one chart holds: one for each of Brydio's chart colours. */
export const CHART_SERIES = 6;
/** The largest value a chart takes, either side of zero. */
export const CHART_VALUE = 1_000_000_000_000;
/** A shortcut is a few keys. */
export const KBD_MAX = 40;
/** The most tabs one set has. */
export const TABS_MAX = 12;

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
    // `level` is its place in the outline, `variant` its size, chosen apart
    // so a small heading never lies about its level. Without a `variant`,
    // the level picks one.
    props: {
      level: { kind: 'int', min: 1, max: 4 },
      text: { kind: 'text', max: LABEL_MAX },
      variant: { kind: 'enum', values: ['title', 'heading', 'subheading', 'label'] },
    },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-text': {
    props: {
      text: { kind: 'text', max: PARAGRAPH_MAX },
      // The five status tones, plus the two ink levels text has.
      tone: { kind: 'enum', values: ['default', 'muted', ...TONES] },
      // The type role it is set in. `size` is the older way to say body or
      // ui; `variant` wins when both are given.
      variant: { kind: 'enum', values: ['body', 'ui', 'caption', 'label'] },
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
      // An icon beside the label, or instead of it with `hideLabel`: the
      // label is still what a screen reader says.
      icon: { kind: 'enum', values: BUTTON_ICONS },
      hideLabel: { kind: 'boolean' },
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
    // Children in equal columns. `columns` is the most there are when there is
    // room: the grid drops columns as its container narrows, down to one.
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
      size: { kind: 'enum', values: SIZES },
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
  'bry-board': {
    // Columns of cards a person moves between (A6-F03-S01). Its children are
    // `bry-board-column`s, in order, and theirs are the cards. Every card on a
    // board is one height, `cardSize`, so a long column is windowed.
    //
    // A card dragged, or moved with the keyboard, raises `move` with
    // `{ card, from, to, position }`: node ids, and the card's index in `to`
    // afterwards. It is drawn there at once. The app confirms by changing the
    // columns' cards (moving the card there), or refuses by sending `settled`
    // with the card's id, and the card goes back. A move with no answer goes
    // back after fifteen seconds.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      cardSize: { kind: 'enum', values: ['sm', 'md', 'lg'] },
      settled: { kind: 'text', max: KEY_MAX },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    events: ['move'],
    children: true,
  },
  'bry-board-column': {
    // One column of a board. `count` is how many cards it holds when the app
    // sends only some, `start` the index of the first sent; like a virtual
    // list it raises `range` with `{ start, end }` when it needs others. A
    // column at its `limit` refuses a drop, and says so.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      count: { kind: 'int', min: 0, max: BOARD_CARDS },
      limit: { kind: 'int', min: 1, max: BOARD_CARDS },
      start: { kind: 'int', min: 0, max: BOARD_CARDS },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    required: ['title'],
    events: ['range'],
    children: true,
  },
  'bry-markdown': {
    // Formatted text, drawn the way the assistant's messages are. Raw HTML is
    // shown as the characters it is; a link is `https` only and asks the
    // person first; a picture loads only from Brydio's own file store. Past
    // 4,000 characters the rest waits behind "Show more", unless `expanded`.
    props: {
      text: { kind: 'text', max: MARKDOWN_MAX },
      expanded: { kind: 'boolean' },
    },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-diff': {
    // A pull request's changes. `files` lists each changed file with its
    // unified diff text in `patch`; a file sent without `patch` is listed, and
    // opening it raises `expand` with `{ file }` so the app can send it.
    // Pressing a line number chooses that line, and Shift the range to it;
    // either raises `select` with `{ file, side, start, end }`.
    props: {
      files: {
        kind: 'list',
        max: DIFF_FILES,
        of: {
          kind: 'shape',
          fields: {
            path: { kind: 'text', max: DIFF_PATH },
            previous: { kind: 'text', max: DIFF_PATH },
            status: { kind: 'enum', values: ['added', 'modified', 'removed', 'renamed'] },
            patch: { kind: 'text', max: DIFF_PATCH },
          },
          required: ['path'],
        },
      },
      label: { kind: 'text', max: LABEL_MAX },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    required: ['files'],
    events: ['expand', 'select'],
    children: false,
  },
  'bry-file-grid': {
    // A folder's files as tiles, windowed like bry-virtual-list: `count` is
    // the whole folder and `files` the ones from `start`; `range` asks for the
    // tiles in view. `preview` is a Brydio source id, never an address. One
    // `menu` serves every tile.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      count: { kind: 'int', min: 0, max: FILE_GRID_COUNT },
      start: { kind: 'int', min: 0, max: FILE_GRID_COUNT },
      files: {
        kind: 'list',
        max: FILE_GRID_WINDOW,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            name: { kind: 'text', max: LABEL_MAX },
            kind: { kind: 'enum', values: FILE_KINDS },
            preview: { kind: 'text', max: KEY_MAX },
            size: { kind: 'int', min: 0, max: 2_000_000_000 },
            modified: { kind: 'text', max: 40 },
          },
          required: ['id', 'name', 'kind'],
        },
      },
      tileSize: { kind: 'enum', values: ['sm', 'md', 'lg'] },
      selectable: { kind: 'boolean' },
      selected: { kind: 'list', max: FILE_GRID_WINDOW, of: { kind: 'text', max: KEY_MAX } },
      menu: {
        kind: 'list',
        max: 12,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            icon: { kind: 'enum', values: MENU_ICONS },
            tone: { kind: 'enum', values: ['default', 'danger'] },
          },
          required: ['id', 'label'],
        },
      },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    required: ['count'],
    events: ['open', 'select', 'menu', 'range'],
    children: false,
  },
  // ADR-A23 (catalogue-b)
  'bry-button-group': {
    // Buttons that belong together, drawn joined. `label` names the group.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      orientation: { kind: 'enum', values: ['horizontal', 'vertical'] },
    },
    required: ['label'],
    events: [],
    children: true,
  },
  'bry-calendar': {
    // A month always open. `mode` single, multiple or range; the chosen days
    // are `values`, ISO dates, and `change` carries `{ values }`.
    props: {
      mode: { kind: 'enum', values: ['single', 'multiple', 'range'] },
      values: { kind: 'list', max: CALENDAR_DAYS, of: { kind: 'text', max: ISO_DATE } },
      month: { kind: 'text', max: ISO_DATE },
      min: { kind: 'text', max: ISO_DATE },
      max: { kind: 'text', max: ISO_DATE },
      label: { kind: 'text', max: LABEL_MAX },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    events: ['change'],
    children: false,
  },
  'bry-combobox': {
    // A select with a search box: `change` with `{ value }`.
    props: {
      value: { kind: 'text', max: LABEL_MAX },
      options: { kind: 'options', max: COMBOBOX_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      search: { kind: 'text', max: LABEL_MAX },
      empty: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      size: { kind: 'enum', values: ['sm', 'md'] },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    required: ['options'],
    events: ['change'],
    children: false,
  },
  'bry-command': {
    // A search box over things to do, in the screen. `select` with `{ id }`,
    // `change` with the search's `{ value }`.
    props: {
      items: {
        kind: 'list',
        max: COMMAND_ITEMS,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            group: { kind: 'text', max: LABEL_MAX },
            icon: { kind: 'enum', values: MENU_ICONS },
            hint: { kind: 'text', max: 40 },
            disabled: { kind: 'boolean' },
          },
          required: ['id', 'label'],
        },
      },
      placeholder: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    required: ['items'],
    events: ['select', 'change'],
    children: false,
  },
  'bry-context-menu': {
    // A `bry-menu`'s items, opened by a right-click or the menu key on its child.
    props: {
      items: { kind: 'list', max: MENU_ITEMS, of: MENU_ITEM },
    },
    required: ['items'],
    events: ['select'],
    children: true,
  },
  'bry-data-table': {
    // A table sorted, filtered, paged, chosen in and shown by column, by the
    // person, at once; each change is told to the app.
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
            hideable: { kind: 'boolean' },
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
      filter: { kind: 'text', max: LABEL_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      page: { kind: 'int', min: 1, max: TABLE_ROWS },
      perPage: { kind: 'int', min: 1, max: DATA_TABLE_PAGE },
      hidden: { kind: 'list', max: TABLE_COLUMNS, of: { kind: 'text', max: KEY_MAX } },
      selectable: { kind: 'boolean' },
      selected: { kind: 'list', max: TABLE_ROWS, of: { kind: 'text', max: KEY_MAX } },
      label: { kind: 'text', max: LABEL_MAX },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    required: ['columns'],
    events: ['sort', 'filter', 'page', 'columns', 'select'],
    children: false,
  },
  'bry-field': {
    // A control's name, description and error, around the control.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: PARAGRAPH_MAX },
      error: { kind: 'text', max: LABEL_MAX },
      required: { kind: 'boolean' },
      orientation: { kind: 'enum', values: ['vertical', 'horizontal'] },
    },
    required: ['label'],
    events: [],
    children: true,
  },
  'bry-input-group': {
    // A `bry-input` with an icon, a prefix, a suffix or a button fixed to it.
    props: {
      value: { kind: 'text', max: INPUT_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      kind: { kind: 'enum', values: ['text', 'email', 'url', 'search'] },
      icon: { kind: 'enum', values: MENU_ICONS },
      prefix: { kind: 'text', max: AFFIX },
      suffix: { kind: 'text', max: AFFIX },
      action: { kind: 'text', max: LABEL_MAX },
      actionIcon: { kind: 'enum', values: MENU_ICONS },
      maxLength: { kind: 'int', min: 1, max: INPUT_MAX },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    events: ['change', 'submit', 'action'],
    children: false,
  },
  'bry-input-otp': {
    // A one-time code in a row of boxes: `change` as it is typed, `complete` when full.
    props: {
      value: { kind: 'text', max: OTP_MAX },
      length: { kind: 'int', min: 4, max: OTP_MAX },
      pattern: { kind: 'enum', values: ['digits', 'alphanumeric'] },
      label: { kind: 'text', max: LABEL_MAX },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    required: ['label'],
    events: ['change', 'complete'],
    children: false,
  },
  'bry-menubar': {
    // Menus over one part of the screen: commands, never the app's navigation.
    props: {
      menus: {
        kind: 'list',
        max: MENUBAR_MENUS,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            items: { kind: 'list', max: MENU_ITEMS, of: MENU_ITEM },
          },
          required: ['id', 'label', 'items'],
        },
      },
      label: { kind: 'text', max: LABEL_MAX },
    },
    required: ['menus', 'label'],
    events: ['select'],
    children: false,
  },
  'bry-native-select': {
    // `bry-select`'s contract, drawn by the system's own list.
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
  'bry-section-menu': {
    // shadcn's Navigation Menu, held to the sections of this screen: nothing
    // is a link, nothing opens another screen.
    props: {
      sections: {
        kind: 'list',
        max: SECTION_MENU_SECTIONS,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            entries: {
              kind: 'list',
              max: SECTION_MENU_ENTRIES,
              of: {
                kind: 'shape',
                fields: {
                  id: { kind: 'text', max: KEY_MAX },
                  label: { kind: 'text', max: LABEL_MAX },
                  description: { kind: 'text', max: LABEL_MAX },
                  disabled: { kind: 'boolean' },
                },
                required: ['id', 'label'],
              },
            },
            disabled: { kind: 'boolean' },
          },
          required: ['id', 'label'],
        },
      },
      current: { kind: 'text', max: KEY_MAX },
      label: { kind: 'text', max: LABEL_MAX },
    },
    required: ['sections', 'label'],
    events: ['select'],
    children: false,
  },
  'bry-pagination': {
    // Which page shows, from 1, of `count`: `page` with `{ page }`.
    props: {
      page: { kind: 'int', min: 1, max: PAGES },
      count: { kind: 'int', min: 1, max: PAGES },
      label: { kind: 'text', max: LABEL_MAX },
      disabled: { kind: 'boolean' },
    },
    required: ['page', 'count'],
    events: ['page'],
    children: false,
  },
  'bry-questionnaire': {
    // Questions asked one at a time: `answer`, `step`, and `submit` with `{ answers }`.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      questions: {
        kind: 'list',
        max: QUESTIONS,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            kind: { kind: 'enum', values: ['single', 'multiple', 'text', 'rating'] },
            prompt: { kind: 'text', max: LABEL_MAX },
            description: { kind: 'text', max: PARAGRAPH_MAX },
            choices: {
              kind: 'list',
              max: QUESTION_CHOICES,
              of: {
                kind: 'shape',
                fields: { value: { kind: 'text', max: KEY_MAX }, label: { kind: 'text', max: LABEL_MAX } },
                required: ['value', 'label'],
              },
            },
            required: { kind: 'boolean' },
            scale: { kind: 'int', min: 3, max: 10 },
            placeholder: { kind: 'text', max: LABEL_MAX },
          },
          required: ['id', 'kind', 'prompt'],
        },
      },
      action: { kind: 'text', max: LABEL_MAX },
      working: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    required: ['questions'],
    events: ['answer', 'step', 'submit'],
    children: false,
  },
  'bry-radio-group': {
    // One choice with every choice in view: `change` with `{ value }`.
    props: {
      value: { kind: 'text', max: LABEL_MAX },
      options: { kind: 'options', max: RADIO_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      orientation: { kind: 'enum', values: ['vertical', 'horizontal'] },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    required: ['options', 'label'],
    events: ['change'],
    children: false,
  },
  'bry-slider': {
    // A number along a line: `change` as it moves, `commit` when let go.
    props: {
      value: { kind: 'int', min: -SLIDER_LIMIT, max: SLIDER_LIMIT },
      min: { kind: 'int', min: -SLIDER_LIMIT, max: SLIDER_LIMIT },
      max: { kind: 'int', min: -SLIDER_LIMIT, max: SLIDER_LIMIT },
      step: { kind: 'int', min: 1, max: SLIDER_LIMIT },
      label: { kind: 'text', max: LABEL_MAX },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    required: ['label'],
    events: ['change', 'commit'],
    children: false,
  },
  'bry-toggle': {
    // A button that stays pressed: `change` with `{ pressed }`.
    props: {
      pressed: { kind: 'boolean' },
      label: { kind: 'text', max: LABEL_MAX },
      icon: { kind: 'enum', values: BUTTON_ICONS },
      hideLabel: { kind: 'boolean' },
      variant: { kind: 'enum', values: ['default', 'outline'] },
      size: { kind: 'enum', values: ['sm', 'md'] },
      disabled: { kind: 'boolean' },
    },
    required: ['label'],
    events: ['change'],
    children: false,
  },
  'bry-toggle-group': {
    // Toggles side by side, one or many pressed: `change` with `{ values }`.
    props: {
      type: { kind: 'enum', values: ['single', 'multiple'] },
      items: {
        kind: 'list',
        max: TOGGLE_GROUP_ITEMS,
        of: {
          kind: 'shape',
          fields: {
            value: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            icon: { kind: 'enum', values: BUTTON_ICONS },
            hideLabel: { kind: 'boolean' },
            disabled: { kind: 'boolean' },
          },
          required: ['value', 'label'],
        },
      },
      values: { kind: 'list', max: TOGGLE_GROUP_ITEMS, of: { kind: 'text', max: KEY_MAX } },
      label: { kind: 'text', max: LABEL_MAX },
      variant: { kind: 'enum', values: ['default', 'outline'] },
      size: { kind: 'enum', values: ['sm', 'md'] },
      disabled: { kind: 'boolean' },
    },
    required: ['items', 'label'],
    events: ['change'],
    children: false,
  },
  // ADR-A23 (catalogue-a)
  'bry-accordion': {
    // Sections that open and close under their headings. `sections` names them
    // in order and the n-th child is the n-th section's content; `expanded` is
    // the ids open, one at a time unless `multiple`. A change raises `change`
    // with `{ expanded }`.
    props: {
      sections: {
        kind: 'list',
        max: ACCORDION_SECTIONS,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            title: { kind: 'text', max: LABEL_MAX },
            disabled: { kind: 'boolean' },
          },
          required: ['id', 'title'],
        },
      },
      expanded: { kind: 'list', max: ACCORDION_SECTIONS, of: { kind: 'text', max: KEY_MAX } },
      multiple: { kind: 'boolean' },
    },
    required: ['sections'],
    events: ['change'],
    children: true,
  },
  'bry-alert': {
    // A note that stays on the screen, in one of the five tones with the tone's
    // icon. Children sit under the words.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: PARAGRAPH_MAX },
      tone: { kind: 'enum', values: TONES },
    },
    required: ['title'],
    events: [],
    children: true,
  },
  'bry-alert-dialog': {
    // A yes-or-no that must be answered, in the app's one dialog slot; the
    // backdrop doesn't close it. Cancel and Escape raise `close`; the action
    // raises `action` and it stays open until the app closes it.
    props: {
      open: { kind: 'boolean' },
      title: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: PARAGRAPH_MAX },
      action: { kind: 'text', max: LABEL_MAX },
      tone: { kind: 'enum', values: ['default', 'danger'] },
      cancel: { kind: 'text', max: LABEL_MAX },
    },
    required: ['title', 'action'],
    events: ['action', 'close'],
    children: false,
  },
  'bry-aspect-ratio': {
    // Holds its children to one named shape, whatever the width.
    props: { ratio: { kind: 'enum', values: RATIOS } },
    events: [],
    children: true,
  },
  'bry-attachment': {
    // A file as a chip: its kind's icon, name and size (`bytes`). `pressable`
    // raises `open`; `removable` adds a Remove button raising `remove`.
    props: {
      name: { kind: 'text', max: LABEL_MAX },
      kind: { kind: 'enum', values: FILE_KINDS },
      bytes: { kind: 'int', min: 0, max: 2_000_000_000 },
      pressable: { kind: 'boolean' },
      removable: { kind: 'boolean' },
    },
    required: ['name'],
    events: ['open', 'remove'],
    children: false,
  },
  'bry-breadcrumb': {
    // Where the screen is, from the top. The last item is the page; pressing an
    // earlier one raises `select` with `{ id }`.
    props: {
      items: {
        kind: 'list',
        max: BREADCRUMB_STEPS,
        of: {
          kind: 'shape',
          fields: { id: { kind: 'text', max: KEY_MAX }, label: { kind: 'text', max: LABEL_MAX } },
          required: ['id', 'label'],
        },
      },
    },
    required: ['items'],
    events: ['select'],
    children: false,
  },
  'bry-bubble': {
    // One said thing in Brydio's chat bubble: `self` at the end, `other` (the
    // default) at the start.
    props: {
      text: { kind: 'text', max: PARAGRAPH_MAX },
      from: { kind: 'enum', values: ['self', 'other'] },
    },
    events: [],
    children: true,
  },
  'bry-carousel': {
    // Its children as slides, one at a time. `index` is the slide shown;
    // Previous, Next and the arrow keys raise `change` with `{ index }`.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      index: { kind: 'int', min: 0, max: CAROUSEL_SLIDES - 1 },
    },
    required: ['label'],
    events: ['change'],
    children: true,
  },
  'bry-chart': {
    // Numbers as a bar, line, area or pie chart in Brydio's chart colours,
    // never the app's. Values are whole numbers and `decimals` places the
    // point: 1234 with `decimals: 2` is 12.34. A pie draws the first series,
    // five slices and "Other".
    props: {
      kind: { kind: 'enum', values: ['bar', 'line', 'area', 'pie'] },
      label: { kind: 'text', max: LABEL_MAX },
      categories: { kind: 'list', max: CHART_POINTS, of: { kind: 'text', max: LABEL_MAX } },
      series: {
        kind: 'list',
        max: CHART_SERIES,
        of: {
          kind: 'shape',
          fields: {
            name: { kind: 'text', max: LABEL_MAX },
            values: {
              kind: 'list',
              max: CHART_POINTS,
              of: { kind: 'int', min: -CHART_VALUE, max: CHART_VALUE },
            },
          },
          required: ['name', 'values'],
        },
      },
      decimals: { kind: 'int', min: 0, max: 4 },
      stacked: { kind: 'boolean' },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    required: ['kind', 'label', 'categories', 'series'],
    events: [],
    children: false,
  },
  'bry-collapsible': {
    // One section under a button bearing its `title`; pressing it raises
    // `change` with `{ open }`.
    props: { title: { kind: 'text', max: LABEL_MAX }, open: { kind: 'boolean' } },
    required: ['title'],
    events: ['change'],
    children: true,
  },
  'bry-direction': {
    // Its children read left to right or right to left, whatever the page
    // reads.
    props: { dir: { kind: 'enum', values: ['ltr', 'rtl'] } },
    required: ['dir'],
    events: [],
    children: true,
  },
  'bry-drawer': {
    // A panel from the bottom edge, in the app's one dialog slot. Escape and
    // the backdrop close it and raise `close`.
    props: {
      open: { kind: 'boolean' },
      title: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: PARAGRAPH_MAX },
    },
    required: ['title'],
    events: ['close'],
    children: true,
  },
  'bry-hover-card': {
    // A preview shown while the pointer rests on, or the focus is in, its first
    // child; the rest of its children are the preview. Raises `open` and
    // `close`.
    props: { side: { kind: 'enum', values: ['top', 'bottom'] } },
    events: ['open', 'close'],
    children: true,
  },
  'bry-item': {
    // One thing that stands on its own, as shadcn's Item: an icon, a title and
    // a line, and its children as actions at the end. Not `bry-list-row`, which
    // is one line among many in a list.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: LABEL_MAX },
      icon: { kind: 'enum', values: MENU_ICONS },
      variant: { kind: 'enum', values: ['default', 'outline', 'muted'] },
      size: { kind: 'enum', values: ['sm', 'md'] },
      pressable: { kind: 'boolean' },
      loading: { kind: 'boolean' },
    },
    events: ['press'],
    children: true,
  },
  'bry-kbd': {
    // A key or shortcut as a keycap: `mod+k` is ⌘K on a Mac and Ctrl+K
    // elsewhere.
    props: { text: { kind: 'text', max: KBD_MAX } },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-marker': {
    // A mark across a thread or timeline ("Today"), read as a separator named
    // by its text.
    props: { text: { kind: 'text', max: LABEL_MAX }, tone: { kind: 'enum', values: TONES } },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-message': {
    // One message: who sent it, their initials, when (`meta`), and its
    // children. `from: self` sits at the end; a `failed` one shows Retry,
    // raising `retry`.
    props: {
      name: { kind: 'text', max: LABEL_MAX },
      meta: { kind: 'text', max: LABEL_MAX },
      from: { kind: 'enum', values: ['self', 'other'] },
      status: { kind: 'enum', values: ['sent', 'sending', 'failed'] },
    },
    required: ['name'],
    events: ['retry'],
    children: true,
  },
  'bry-message-scroller': {
    // A thread's messages, oldest first, kept at the newest while the person is
    // at the bottom. With `more`, reaching the top raises `more`.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      more: { kind: 'boolean' },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    required: ['label'],
    events: ['more'],
    children: true,
  },
  'bry-popover': {
    // A small panel opened from its first child; the rest of its children are
    // the panel. Opening raises `open`, closing `close`; the app may set `open`
    // too.
    props: {
      open: { kind: 'boolean' },
      title: { kind: 'text', max: LABEL_MAX },
      side: { kind: 'enum', values: ['top', 'bottom'] },
      align: { kind: 'enum', values: ['start', 'center', 'end'] },
    },
    events: ['open', 'close'],
    children: true,
  },
  'bry-progress': {
    // How far along something is, as a percentage; without `value` it says only
    // that it is under way.
    props: { value: { kind: 'int', min: 0, max: 100 }, label: { kind: 'text', max: LABEL_MAX } },
    required: ['label'],
    events: [],
    children: false,
  },
  'bry-scroll-area': {
    // Its children in a region that scrolls on its own, up to a named `size`.
    props: { label: { kind: 'text', max: LABEL_MAX }, size: { kind: 'enum', values: SIZES } },
    required: ['label'],
    events: [],
    children: true,
  },
  'bry-separator': {
    // A hairline between groups, across or down. A screen reader skips it.
    props: { orientation: { kind: 'enum', values: ['horizontal', 'vertical'] } },
    events: [],
    children: false,
  },
  'bry-sheet': {
    // A panel from the `end` (default) or `start` side, in the app's one dialog
    // slot. Closing raises `close`.
    props: {
      open: { kind: 'boolean' },
      title: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: PARAGRAPH_MAX },
      side: { kind: 'enum', values: ['start', 'end'] },
    },
    required: ['title'],
    events: ['close'],
    children: true,
  },
  'bry-spinner': {
    // Something is under way; `label` is what a screen reader says.
    props: { label: { kind: 'text', max: LABEL_MAX }, size: { kind: 'enum', values: SIZES } },
    events: [],
    children: false,
  },
  'bry-tabs': {
    // Views of one thing, one at a time. `tabs` names them and the n-th child
    // is the n-th tab's panel; choosing one raises `change` with `{ id }`.
    props: {
      tabs: {
        kind: 'list',
        max: TABS_MAX,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            disabled: { kind: 'boolean' },
          },
          required: ['id', 'label'],
        },
      },
      value: { kind: 'text', max: KEY_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      variant: { kind: 'enum', values: ['segmented', 'line'] },
    },
    required: ['tabs'],
    events: ['change'],
    children: true,
  },
  'bry-tooltip': {
    // A short hint over its child on hover and focus. It raises nothing: a hint
    // is never the only place something is said.
    props: { text: { kind: 'text', max: LABEL_MAX }, side: { kind: 'enum', values: ['top', 'bottom'] } },
    required: ['text'],
    events: [],
    children: true,
  },
} as const satisfies Readonly<Record<`bry-${string}`, ElementSpec>>;

export type Catalogue = typeof CATALOGUE;

export type ElementName = keyof Catalogue;

/** The element names, in the catalogue's order. */
export const ELEMENT_NAMES = Object.keys(CATALOGUE) as ElementName[];

