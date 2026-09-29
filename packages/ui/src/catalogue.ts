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
/** A label's colour, Multica's ten presets; drawn from Brydio's own tokens. `hue` wins over `tone`. */
export const HUES = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'] as const;
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
export const MENU_ITEMS = 60;

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
  // Plan fidelity: what a planning app names.
  'account',
  'activity',
  'attach',
  'bell',
  'boardLayout',
  'box',
  'branch',
  'calendarRange',
  'channel',
  'chart',
  'cycle',
  'download',
  'externalLink',
  'flag',
  'ganttLayout',
  'history',
  'home',
  'inbox',
  'layers',
  'link',
  'listLayout',
  'lock',
  'maximise',
  'panelRight',
  'pause',
  'play',
  'progress',
  'project',
  'relation',
  'sliders',
  'tableLayout',
  'tag',
  'target',
  'temporary',
  'userAdd',
  'status',
  'filter',
  'stateReview',
  'swimlaneLayout',
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

/**
 * A menu item as `bry-menubar` takes it: the host declares its own apart from
 * `bry-menu`'s, without `checked` or `parent`.
 */
const ACTION_ITEM = {
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

/** One thing to do in a menu. Shared by every element that opens one of its own. */
export const MENU_ITEM = {
  kind: 'shape',
  fields: {
    ...ACTION_ITEM.fields,
    // Ticked, as the view a View menu has chosen.
    checked: { kind: 'boolean' },
    // Drawn in the submenu of the item with this id, as Status ▸ Todo.
    parent: { kind: 'text', max: KEY_MAX },
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

// Plan fidelity
/** A work item's state group, in the order work moves through them. */
export const STATE_GROUPS = ['backlog', 'unstarted', 'started', 'completed', 'cancelled'] as const;
/** A work item's priority, most pressing first. */
export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
/**
 * Every mark an option in a planning picker can carry: a state ring (with
 * `review` and `blocked` beside the five groups), a priority, a person's
 * initials or a plain coloured dot.
 */
export const MARKS = [...STATE_GROUPS, 'review', 'blocked', 'urgent', 'high', 'medium', 'low', 'none', 'person', 'dot'] as const;
/**
 * Where a planned thing stands: a sprint's period, a module's status or a
 * request's answer. Each has its own mark and colour.
 */
export const ENTITY_STATUSES = [
  'draft',
  'upcoming',
  'active',
  'completed',
  'cancelled',
  'backlog',
  'planned',
  'started',
  'paused',
  'pending',
  'accepted',
  'declined',
  'snoozed',
  'duplicate',
] as const;
/** The most things a row's own "⋯" menu offers. */
export const ROW_MENU_ITEMS = 60;
/** The most choices a property offers: a large team's members, a project's labels. */
export const PROPERTY_OPTIONS = 200;
/** The most choices one facet of a filter menu offers. */
export const FILTER_OPTIONS = 200;
/** An ISO moment, with room for an offset: `2026-09-16T09:30:00.000+05:30`. */
export const ISO_TIME = 40;
/** How wide a day is drawn in a Gantt chart: a column per day, per week or per month. */
export const GANTT_ZOOMS = ['day', 'week', 'month'] as const;
/** The most rows one Gantt chart draws. */
export const GANTT_ROWS = 500;
/** What an activity changed, each drawn with its own mark. */
export const ACTIVITY_MARKS = ['status', 'priority', 'assignee', 'date', 'title', 'description', 'duplicate', 'created', 'comment'] as const;
/** What can be done to a comment, in the order its menu lists them. */
export const COMMENT_ACTIONS = ['reply', 'quote', 'edit', 'resolve', 'copy', 'copyLink', 'subIssue', 'delete'] as const;
/** An emoji is one character to a person, and a few to a string: a flag, a family. */
export const EMOJI_MAX = 16;
/** The most columns a spreadsheet has. */
export const SPREADSHEET_COLUMNS = 16;
/** The longest document a rich-text editor holds: the same as `bry-markdown`'s. */
export const RICH_TEXT_MAX = 50_000;
/** A key as a person presses it: `c`, `j`, `space`, `mod+enter`, `shift+/`. */
const KEY_NAME = 24;

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
      // `page-body` is a page's readable column; `action-bar` floats at the
      // foot of the screen, as a bar of bulk actions does.
      variant: {
        kind: 'enum',
        values: ['default', 'page', 'toolbar', 'scroll', 'section', 'section-header', 'filter-bar', 'page-body', 'action-bar', 'inset', 'narrow', 'group', 'group-header'],
      },
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
      // `bare` has no box, for a composer's title: `size="lg"` sets it as one.
      variant: { kind: 'enum', values: ['default', 'bare'] },
      // Takes the focus when it first appears.
      autofocus: { kind: 'boolean' },
      size: { kind: 'enum', values: SIZES },
      // `compact` keeps a filter box short beside its buttons, as Multica's label search.
      fit: { kind: 'enum', values: ['full', 'compact'] },
    },
    // `blur` with `{ value }` when the person leaves the field; `cancel` on Escape.
    events: ['change', 'submit', 'blur', 'cancel'],
    children: false,
  },
  'bry-textarea': {
    // Like `bry-input` over more than one line: Enter starts a new line, and
    // Mod+Enter raises `submit` with `{ value }`, for a composer that saves from the body.
    props: {
      value: { kind: 'text', max: PARAGRAPH_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      maxLength: { kind: 'int', min: 1, max: PARAGRAPH_MAX },
      required: { kind: 'boolean' },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
      // `bare` has no box and grows to fill its place, for a composer's body.
      variant: { kind: 'enum', values: ['default', 'bare'] },
    },
    events: ['change', 'submit'],
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
    // `variant="count"` is a muted pill for a number beside a heading.
    props: {
      text: { kind: 'text', max: LABEL_MAX },
      tone: { kind: 'enum', values: TONES },
      hue: { kind: 'enum', values: HUES },
      variant: { kind: 'enum', values: ['default', 'count'] },
    },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-avatar': {
    // Initials only: a picture address would let an app load anything from anywhere.
    props: {
      name: { kind: 'text', max: LABEL_MAX },
      // A workspace member's id: Brydio draws their card (name, role, email) on hover or focus.
      memberId: { kind: 'text', max: KEY_MAX },
      size: { kind: 'enum', values: SIZES },
    },
    required: ['name'],
    events: [],
    children: false,
  },
  'bry-list-row': {
    // Children sit at the end of the row (a badge, an avatar). `work` is a
    // planning row: a selection box, a monospaced `identifier`, the title,
    // the children (property chips) and a "⋯" `menu` whose choice raises
    // `select` with `{ id }`. `density="compact"` is tighter; `removable`
    // puts a cross at the end that raises `remove`. `stacked` is a two-line
    // work row: identifier and title above, `description` and the children
    // under them, `meta` at the end.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: LABEL_MAX },
      meta: { kind: 'text', max: LABEL_MAX },
      pressable: { kind: 'boolean' },
      selected: { kind: 'boolean' },
      loading: { kind: 'boolean' },
      variant: { kind: 'enum', values: ['default', 'work', 'stacked'] },
      identifier: { kind: 'text', max: LABEL_MAX },
      selectable: { kind: 'boolean' },
      checked: { kind: 'boolean' },
      density: { kind: 'enum', values: ['default', 'compact'] },
      menu: { kind: 'list', max: ROW_MENU_ITEMS, of: MENU_ITEM },
      removable: { kind: 'boolean' },
      // A work row for something finished: its title greyed.
      muted: { kind: 'boolean' },
      // A work row's first child sits before the identifier.
      lead: { kind: 'boolean' },
    },
    events: ['press', 'toggle', 'select', 'remove'],
    children: true,
  },
  'bry-empty-state': {
    // `action` is one button's label; pressing it raises `action`.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      text: { kind: 'text', max: PARAGRAPH_MAX },
      action: { kind: 'text', max: LABEL_MAX },
      variant: { kind: 'enum', values: ['default', 'plain'] },
      icon: { kind: 'enum', values: BUTTON_ICONS },
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
      // `compose` is a composer rather than a question: a fixed-height card
      // headed by its `crumbs`, with an expand button (raising `expand` with
      // `{ expanded }`) and a close button; its footer holds a `toggle`
      // switch ("Create another", raising `toggle` with `{ checked }`, on
      // while `toggled`) and the primary action, which Mod+Enter raises.
      variant: { kind: 'enum', values: ['default', 'compose'] },
      crumbs: { kind: 'list', max: 3, of: { kind: 'text', max: LABEL_MAX } },
      expanded: { kind: 'boolean' },
      toggle: { kind: 'text', max: LABEL_MAX },
      toggled: { kind: 'boolean' },
    },
    required: ['title'],
    events: ['action', 'close', 'expand', 'toggle'],
    children: true,
  },
  'bry-menu': {
    // A short list of things to do, opened from its one child, the anchor.
    // Choosing an item raises `select` with `{ id }`.
    props: {
      items: { kind: 'list', max: MENU_ITEMS, of: MENU_ITEM },
      // A small caption over the items: "View".
      heading: { kind: 'text', max: LABEL_MAX },
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
    // `side: 'sidebar'` keeps the second pane between a sidebar's widths; where
    // the person leaves the handle is raised as `resize` with `{ ratio }`.
    props: {
      ratio: { kind: 'int', min: 20, max: 80 },
      label: { kind: 'text', max: LABEL_MAX },
      side: { kind: 'enum', values: ['sidebar'] },
    },
    events: ['resize'],
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
      // `list` stacks the columns as full-width groups of rows; `plan` draws
      // the columns with a planning header and cards tall enough for a work card.
      // `lanes` is a swimlane board: a `bry-board-lane` heading, then that
      // lane's `laneColumns` columns, then the next lane.
      layout: { kind: 'enum', values: ['columns', 'list', 'lanes'] },
      laneColumns: { kind: 'int', min: 1, max: 12 },
      variant: { kind: 'enum', values: ['default', 'plan', 'panel'] },
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
      // On a `plan` board: `glyph` is the state group's mark, in `tone`.
      // `collapsible` folds it away, raising `toggle` with `{ collapsed }`.
      // `addable` puts a "+" in the header and `addLabel` under the cards,
      // either raising `add`. With `adding` that line is an input: Enter
      // raises `submit` with `{ value }`, Escape `cancel`; `busy` shows saving.
      glyph: { kind: 'enum', values: STATE_GROUPS },
      tone: { kind: 'enum', values: TONES },
      hue: { kind: 'enum', values: HUES },
      collapsible: { kind: 'boolean' },
      collapsed: { kind: 'boolean' },
      addable: { kind: 'boolean' },
      addLabel: { kind: 'text', max: LABEL_MAX },
      adding: { kind: 'boolean' },
      busy: { kind: 'boolean' },
      // A list group's select-all box: `check` with `{ checked }`; `mixed` when only some are.
      checkable: { kind: 'boolean' },
      checked: { kind: 'boolean' },
      mixed: { kind: 'boolean' },
      // A "⋯" in a plan column's header, as "Hide column"; choosing raises `select`.
      menu: { kind: 'list', max: ROW_MENU_ITEMS, of: MENU_ITEM },
    },
    required: ['title'],
    events: ['range', 'toggle', 'add', 'submit', 'cancel', 'select', 'check'],
    children: true,
  },
  'bry-markdown': {
    // Formatted text, drawn the way the assistant's messages are. Raw HTML is
    // shown as the characters it is; a link is `https` only and asks the
    // person first; a picture loads only from Brydio's own file store. Past
    // 4,000 characters the rest waits behind "Show more", unless `expanded`.
    // With `quote` (a label, "Add to comment"), selecting some of the text
    // offers that button; pressing it raises `quote` with `{ text }`.
    props: {
      text: { kind: 'text', max: MARKDOWN_MAX },
      expanded: { kind: 'boolean' },
      quote: { kind: 'text', max: LABEL_MAX },
      // Whole-word identifiers drawn as links: pressing one raises `open` with `{ route }`.
      references: {
        kind: 'list',
        max: 500,
        of: { kind: 'shape', fields: { text: { kind: 'text', max: LABEL_MAX }, route: { kind: 'text', max: LABEL_MAX } }, required: ['text', 'route'] },
      },
      // Words to find: every match marked; `find` raises `{ count }`; `findIndex` is the current one.
      find: { kind: 'text', max: LABEL_MAX },
      findIndex: { kind: 'int', min: 0, max: 100_000 },
    },
    required: ['text'],
    events: ['quote', 'open', 'find'],
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
            items: { kind: 'list', max: MENU_ITEMS, of: ACTION_ITEM },
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
      // Each choice a round dot in the label hue its `value` names, ringed when chosen.
      variant: { kind: 'enum', values: ['default', 'swatches'] },
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
      variant: { kind: 'enum', values: ['default', 'outline', 'chips'] },
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
  // Plan fidelity
  'bry-glyph': {
    // The small mark before a state or a priority. `kind="state"` draws the
    // `group`'s mark, `kind="priority"` the `priority`'s; `tone` replaces its
    // own colour. `label` is what a screen reader hears; without one the mark
    // is decoration.
    props: {
      // `progress` draws a completion ring filled to `value` (0 to 100);
      // `dot` a plain round dot in a label `hue`, as a label list leads with.
      kind: { kind: 'enum', values: ['state', 'priority', 'progress', 'dot'] },
      value: { kind: 'int', min: 0, max: 100 },
      group: { kind: 'enum', values: STATE_GROUPS },
      priority: { kind: 'enum', values: PRIORITIES },
      tone: { kind: 'enum', values: TONES },
      hue: { kind: 'enum', values: HUES },
      size: { kind: 'enum', values: ['sm', 'md'] },
      label: { kind: 'text', max: LABEL_MAX },
    },
    required: ['kind'],
    events: [],
    children: false,
  },
  'bry-property': {
    // One of a work item's properties, as a chip that opens its own picker.
    // `kind` says what it holds; `display` how the chip looks where it sits.
    // Choosing raises `change` with `{ value }`, or `{ values }` for
    // `members` and `labels`; clearing sends an empty value.
    props: {
      kind: { kind: 'enum', values: ['state', 'priority', 'members', 'labels', 'date', 'choice'] },
      display: { kind: 'enum', values: ['badge', 'icon', 'dot', 'pill', 'button'] },
      label: { kind: 'text', max: LABEL_MAX },
      value: { kind: 'text', max: KEY_MAX },
      values: { kind: 'list', max: PROPERTY_OPTIONS, of: { kind: 'text', max: KEY_MAX } },
      options: {
        kind: 'list',
        max: PROPERTY_OPTIONS,
        of: {
          kind: 'shape',
          fields: {
            value: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            tone: { kind: 'enum', values: TONES }, hue: { kind: 'enum', values: HUES },
            group: { kind: 'enum', values: STATE_GROUPS },
            mark: { kind: 'enum', values: MARKS },
          },
          required: ['value', 'label'],
        },
      },
      placeholder: { kind: 'text', max: LABEL_MAX },
      max: { kind: 'int', min: 1, max: 5 },
      clearable: { kind: 'boolean' },
      due: { kind: 'boolean' },
      disabled: { kind: 'boolean' },
      // Up to three of the app's own actions under the picker: `more` with `{ id }`.
      more: {
        kind: 'list',
        max: 3,
        of: { kind: 'shape', fields: { id: { kind: 'text', max: KEY_MAX }, label: { kind: 'text', max: LABEL_MAX } }, required: ['id', 'label'] },
      },
    },
    required: ['kind', 'label'],
    events: ['change', 'more'],
    children: false,
  },
  'bry-quick-add': {
    // "+ New work item" that turns into a bare input where it sits. Pressing
    // the closed row raises `open`; the app answers with `open`. Enter raises
    // `submit` with `{ value }`, Escape `cancel`; `busy` shows a spinner.
    props: {
      trigger: { kind: 'text', max: LABEL_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      hint: { kind: 'text', max: LABEL_MAX },
      open: { kind: 'boolean' },
      busy: { kind: 'boolean' },
      value: { kind: 'text', max: LABEL_MAX },
      variant: { kind: 'enum', values: ['row', 'card', 'link'] },
    },
    required: ['trigger'],
    events: ['open', 'submit', 'cancel'],
    children: false,
  },
  'bry-work-card': {
    // One work item on a `plan` board: the `priority` mark and `identifier`
    // on top, the title, a line of `description`, the `project` and `labels`
    // as chips, then a foot of its children (pickers), `progress` and how
    // long ago it was `updated`. With `lead` the first child sits on top in
    // place of the priority mark. Without children, the foot shows
    // `assignees` and the `due` date. A "⋯" `menu` raises `select` with
    // `{ id }`; pressing the card raises `press`.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      identifier: { kind: 'text', max: LABEL_MAX },
      priority: { kind: 'enum', values: PRIORITIES },
      description: { kind: 'text', max: LABEL_MAX },
      project: { kind: 'text', max: LABEL_MAX },
      labels: {
        kind: 'list',
        max: 12,
        of: { kind: 'shape', fields: { label: { kind: 'text', max: LABEL_MAX }, tone: { kind: 'enum', values: TONES }, hue: { kind: 'enum', values: HUES } }, required: ['label'] },
      },
      assignees: {
        kind: 'list',
        max: 20,
        of: { kind: 'shape', fields: { id: { kind: 'text', max: KEY_MAX }, name: { kind: 'text', max: LABEL_MAX } }, required: ['id', 'name'] },
      },
      due: { kind: 'text', max: ISO_DATE },
      updated: { kind: 'text', max: ISO_TIME },
      progress: {
        kind: 'shape',
        fields: { done: { kind: 'int', min: 0, max: 10_000 }, total: { kind: 'int', min: 0, max: 10_000 } },
        required: ['done', 'total'],
      },
      lead: { kind: 'boolean' },
      menu: { kind: 'list', max: ROW_MENU_ITEMS, of: MENU_ITEM },
      loading: { kind: 'boolean' },
    },
    required: ['title'],
    events: ['press', 'select'],
    children: true,
  },
  'bry-page-header': {
    // The thin bar across the top of a page: a `back` arrow (raising `back`),
    // `crumbs` (each raising `crumb` with `{ id }`), the `icon`, `title`,
    // `badges` and `count`, `tabs` in the middle (raising `tab` with
    // `{ id }`), and the children, the page's actions, at the end.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      icon: { kind: 'enum', values: BUTTON_ICONS },
      subtitle: { kind: 'text', max: LABEL_MAX },
      back: { kind: 'boolean' },
      count: { kind: 'int', min: 0, max: 1_000_000 },
      crumbs: {
        kind: 'list',
        max: 4,
        of: {
          kind: 'shape',
          fields: { id: { kind: 'text', max: KEY_MAX }, label: { kind: 'text', max: LABEL_MAX }, icon: { kind: 'enum', values: BUTTON_ICONS }, initial: { kind: 'boolean' } },
          required: ['id', 'label'],
        },
      },
      badges: {
        kind: 'list',
        max: 3,
        of: { kind: 'shape', fields: { text: { kind: 'text', max: LABEL_MAX }, tone: { kind: 'enum', values: TONES } }, required: ['text'] },
      },
      tabs: {
        kind: 'list',
        max: 12,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            icon: { kind: 'enum', values: BUTTON_ICONS },
            count: { kind: 'int', min: 0, max: 1_000_000 },
          },
          required: ['id', 'label'],
        },
      },
      tab: { kind: 'text', max: KEY_MAX },
      size: { kind: 'enum', values: ['sm', 'md'] },
    },
    required: ['title'],
    events: ['back', 'crumb', 'tab'],
    children: true,
  },
  'bry-entity-row': {
    // A sprint, a module, a saved view or an inbox request in a list. The
    // `leading` mark (`status`, a completion `ring`, or a `tile` holding
    // `icon`), then `title`, `dateRange`, `meta` and `description`; at the
    // end `statusLabel`, up to four `metrics` and a "⋯" `menu` (raising
    // `select`). `rail` hangs it off a timeline. With `expandable`, a chevron
    // raises `toggle` with `{ expanded }` and the children show under the
    // row while `expanded`. Pressing the row raises `press`.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: LABEL_MAX },
      meta: { kind: 'text', max: LABEL_MAX },
      dateRange: { kind: 'text', max: LABEL_MAX },
      leading: { kind: 'enum', values: ['status', 'ring', 'tile', 'none'] },
      status: { kind: 'enum', values: ENTITY_STATUSES },
      statusLabel: { kind: 'text', max: LABEL_MAX },
      tone: { kind: 'enum', values: TONES },
      icon: { kind: 'enum', values: BUTTON_ICONS },
      ring: { kind: 'int', min: 0, max: 100 },
      metrics: {
        kind: 'list',
        max: 4,
        of: {
          kind: 'shape',
          fields: { label: { kind: 'text', max: LABEL_MAX }, value: { kind: 'text', max: LABEL_MAX }, ring: { kind: 'int', min: 0, max: 100 } },
          required: ['label', 'value'],
        },
      },
      menu: { kind: 'list', max: ROW_MENU_ITEMS, of: MENU_ITEM },
      rail: { kind: 'shape', fields: { month: { kind: 'text', max: LABEL_MAX }, day: { kind: 'text', max: LABEL_MAX }, active: { kind: 'boolean' } }, required: [] },
      highlighted: { kind: 'boolean' },
      selected: { kind: 'boolean' },
      pressable: { kind: 'boolean' },
      expandable: { kind: 'boolean' },
      expanded: { kind: 'boolean' },
      loading: { kind: 'boolean' },
    },
    required: ['title'],
    events: ['press', 'select', 'toggle'],
    children: true,
  },
  'bry-filter-menu': {
    // A "Filter" button whose menu lists `facets`, each opening its options
    // to tick. `values` says what is ticked, per facet. Ticking raises
    // `change` with `{ facet, values }`, the facet's whole new list. A facet
    // with `search` has a search field; one of `kind="dates"` offers `today`,
    // `3d`, `7d` and a `from..to` range, and holds one value. With anything
    // ticked, "Reset all filters" raises `reset`.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      facets: {
        kind: 'list',
        max: 8,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            label: { kind: 'text', max: LABEL_MAX },
            icon: { kind: 'enum', values: BUTTON_ICONS },
            kind: { kind: 'enum', values: ['options', 'dates'] },
            search: { kind: 'boolean' },
            options: {
              kind: 'list',
              max: FILTER_OPTIONS,
              of: {
                kind: 'shape',
                fields: {
                  value: { kind: 'text', max: KEY_MAX },
                  label: { kind: 'text', max: LABEL_MAX },
                  mark: { kind: 'enum', values: MARKS },
                  tone: { kind: 'enum', values: TONES }, hue: { kind: 'enum', values: HUES },
                  count: { kind: 'int', min: 0, max: 1_000_000 },
                },
                required: ['value', 'label'],
              },
            },
          },
          required: ['id', 'label'],
        },
      },
      values: {
        kind: 'list',
        max: 8,
        of: {
          kind: 'shape',
          fields: { facet: { kind: 'text', max: KEY_MAX }, values: { kind: 'list', max: FILTER_OPTIONS, of: { kind: 'text', max: KEY_MAX } } },
          required: ['facet'],
        },
      },
    },
    required: ['facets'],
    events: ['change', 'reset'],
    children: false,
  },
  'bry-gantt': {
    // Work items laid along days: a pane of `rows` beside a timeline cut
    // into day, week or month columns by `zoom`. A row with `start` and `end`
    // is a bar; with one of them a diamond; with neither a placeholder.
    // `start` is the first day shown. The toolbar raises `zoom` with
    // `{ zoom }`, `navigate` with `{ start }` and `completed` with
    // `{ show }`; pressing a row or its bar raises `press` with `{ id }`.
    props: {
      start: { kind: 'text', max: ISO_DATE },
      zoom: { kind: 'enum', values: GANTT_ZOOMS },
      rows: {
        kind: 'list',
        max: GANTT_ROWS,
        of: {
          kind: 'shape',
          fields: {
            id: { kind: 'text', max: KEY_MAX },
            title: { kind: 'text', max: LABEL_MAX },
            identifier: { kind: 'text', max: LABEL_MAX },
            mark: { kind: 'enum', values: MARKS },
            tone: { kind: 'enum', values: TONES },
            priority: { kind: 'enum', values: PRIORITIES },
            assignee: { kind: 'text', max: LABEL_MAX },
            start: { kind: 'text', max: ISO_DATE },
            end: { kind: 'text', max: ISO_DATE },
          },
          required: ['id', 'title'],
        },
      },
      showCompleted: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
      loading: { kind: 'boolean' },
    },
    events: ['press', 'navigate', 'zoom', 'completed'],
    children: false,
  },
  'bry-timeline': {
    // A work item's activity, one `bry-timeline-item` per line. A `folded`
    // block of older activity is one line worded by `collapsedLabel`;
    // pressing it raises `expand`.
    props: {
      collapsedLabel: { kind: 'text', max: LABEL_MAX },
      folded: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
      loading: { kind: 'boolean' },
    },
    events: ['expand'],
    children: true,
  },
  'bry-timeline-item': {
    // One line of activity: the `mark` of what changed (or the `actor`'s
    // face), the actor, the `text`, "×`count`" and how long ago from `time`.
    props: {
      actor: { kind: 'text', max: LABEL_MAX },
      actorId: { kind: 'text', max: KEY_MAX },
      text: { kind: 'text', max: LABEL_MAX },
      mark: { kind: 'enum', values: ACTIVITY_MARKS },
      tone: { kind: 'enum', values: TONES },
      time: { kind: 'text', max: ISO_TIME },
      count: { kind: 'int', min: 1, max: 9_999 },
    },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-comment': {
    // One comment in a discussion; its children are the body (and a reply
    // composer). `actions` sit in its "⋯" menu, reply and edit also on hover;
    // choosing raises `action` with `{ id }`. With `replies` the thread
    // folds: pressing its bar raises `toggle` with `{ collapsed }`.
    props: {
      author: { kind: 'text', max: LABEL_MAX },
      authorId: { kind: 'text', max: KEY_MAX },
      time: { kind: 'text', max: ISO_TIME },
      edited: { kind: 'boolean' },
      deleted: { kind: 'boolean' },
      resolved: { kind: 'boolean' },
      resolution: { kind: 'boolean' },
      depth: { kind: 'int', min: 0, max: 1 },
      collapsed: { kind: 'boolean' },
      replies: { kind: 'int', min: 0, max: 9_999 },
      repliers: {
        kind: 'list',
        max: 12,
        of: { kind: 'shape', fields: { id: { kind: 'text', max: KEY_MAX }, name: { kind: 'text', max: LABEL_MAX } }, required: ['id', 'name'] },
      },
      actions: { kind: 'list', max: COMMENT_ACTIONS.length, of: { kind: 'enum', values: COMMENT_ACTIONS } },
      highlighted: { kind: 'boolean' },
      loading: { kind: 'boolean' },
    },
    events: ['action', 'toggle'],
    children: true,
  },
  'bry-reactions': {
    // A chip per emoji with its `count`, marked when `mine`, then "Add
    // reaction" opening a grid of `choices`. Pressing either raises `toggle`
    // with `{ emoji }`.
    props: {
      items: {
        kind: 'list',
        max: 24,
        of: {
          kind: 'shape',
          fields: { emoji: { kind: 'text', max: EMOJI_MAX }, count: { kind: 'int', min: 0, max: 99_999 }, mine: { kind: 'boolean' } },
          required: ['emoji'],
        },
      },
      choices: { kind: 'list', max: 48, of: { kind: 'text', max: EMOJI_MAX } },
      disabled: { kind: 'boolean' },
    },
    events: ['toggle'],
    children: false,
  },
  'bry-peek': {
    // A floating panel over the side of a list that shows one item without
    // leaving it; not a dialog. `position` reads "3 / 12"; `previous` and
    // `next` (and J/K) raise the same; the expand button raises `expand`, the
    // close button and Escape `close`. Its children are the item.
    props: {
      open: { kind: 'boolean' },
      label: { kind: 'text', max: LABEL_MAX },
      position: { kind: 'text', max: LABEL_MAX },
      previous: { kind: 'boolean' },
      next: { kind: 'boolean' },
    },
    required: ['label'],
    events: ['previous', 'next', 'expand', 'close'],
    children: true,
  },
  'bry-spreadsheet': {
    // A table whose cells are live elements. A heading's menu raises `sort`
    // with `{ key, direction }` and `hide` with `{ key }`; with
    // `selectable`, the corner box raises `all` with `{ checked }`.
    // Its children are `bry-spreadsheet-group`s and `bry-spreadsheet-row`s.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      columns: {
        kind: 'list',
        max: SPREADSHEET_COLUMNS,
        of: {
          kind: 'shape',
          fields: {
            key: { kind: 'text', max: KEY_MAX },
            heading: { kind: 'text', max: LABEL_MAX },
            width: { kind: 'enum', values: ['sm', 'md', 'lg', 'fill'] },
            pinned: { kind: 'boolean' },
            sortable: { kind: 'boolean' },
            hideable: { kind: 'boolean' },
            // Dragged or moved from its menu: `reorder` with `{ keys }`. A resizable
            // column's width is the person's, kept by Brydio, never the app's.
            movable: { kind: 'boolean' },
            resizable: { kind: 'boolean' },
          },
          required: ['key', 'heading'],
        },
      },
      sort: {
        kind: 'shape',
        fields: { key: { kind: 'text', max: KEY_MAX }, direction: { kind: 'enum', values: ['asc', 'desc'] } },
        required: ['key', 'direction'],
      },
      selectable: { kind: 'boolean' },
      selected: { kind: 'int', min: 0, max: 100_000 },
      total: { kind: 'int', min: 0, max: 100_000 },
      loading: { kind: 'boolean' },
      empty: { kind: 'text', max: LABEL_MAX },
    },
    required: ['columns'],
    events: ['sort', 'hide', 'all', 'reorder'],
    children: true,
  },
  'bry-spreadsheet-row': {
    // One row; its children are its cells. Its box raises `toggle` with
    // `{ checked }`; an `expandable` row's chevron raises `expand` with
    // `{ expanded }`; `depth` indents it under its parent.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      checked: { kind: 'boolean' },
      depth: { kind: 'int', min: 0, max: 4 },
      expandable: { kind: 'boolean' },
      expanded: { kind: 'boolean' },
      loading: { kind: 'boolean' },
    },
    events: ['toggle', 'expand'],
    children: true,
  },
  'bry-spreadsheet-group': {
    // A heading row between groups: `label`, `mark` and `count`. Pressing it
    // raises `toggle` with `{ collapsed }`.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      mark: { kind: 'enum', values: MARKS },
      tone: { kind: 'enum', values: ['neutral', 'brand', 'success', 'warn', 'danger'] },
      count: { kind: 'int', min: 0, max: 100_000 },
      collapsed: { kind: 'boolean' },
    },
    required: ['label'],
    events: ['toggle'],
    children: false,
  },
  'bry-rich-text': {
    // A markdown editor. `value` is markdown, and so is what it says:
    // `change` as the person types, `blur` when they leave, `submit` on
    // Mod+Enter, each with `{ value }`. `mentions` are who `@` offers.
    props: {
      value: { kind: 'text', max: RICH_TEXT_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      variant: { kind: 'enum', values: ['document', 'comment', 'bare'] },
      mentions: {
        kind: 'list',
        max: 200,
        of: { kind: 'shape', fields: { value: { kind: 'text', max: KEY_MAX }, label: { kind: 'text', max: LABEL_MAX } }, required: ['value', 'label'] },
      },
      disabled: { kind: 'boolean' },
      autofocus: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
      // Files attached, dropped or pasted: Brydio uploads them and writes `![name](url)` or `!file[name](url)`.
      attachments: { kind: 'boolean' },
      // `@all` offered among the mentions.
      mentionAll: { kind: 'boolean' },
      // What `#` offers: choosing one writes its `value` (an identifier, TQ-2).
      references: {
        kind: 'list',
        max: 500,
        of: { kind: 'shape', fields: { value: { kind: 'text', max: KEY_MAX }, label: { kind: 'text', max: LABEL_MAX } }, required: ['value', 'label'] },
      },
    },
    events: ['change', 'blur', 'submit'],
    children: false,
  },
  'bry-board-lane': {
    // One swimlane's heading on a `layout="lanes"` board: `title`, `mark`,
    // `count`. With `collapsible`, pressing it raises `toggle` with
    // `{ collapsed }`; `openable` adds a link raising `open`.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      mark: { kind: 'enum', values: MARKS },
      tone: { kind: 'enum', values: TONES },
      count: { kind: 'int', min: 0, max: BOARD_CARDS },
      collapsible: { kind: 'boolean' },
      collapsed: { kind: 'boolean' },
      openable: { kind: 'boolean' },
      openLabel: { kind: 'text', max: LABEL_MAX },
    },
    required: ['title'],
    events: ['toggle', 'open'],
    children: false,
  },
  'bry-property-list': {
    // A section of a detail sidebar. With `collapsible`, pressing the
    // `title` raises `toggle` with `{ collapsed }`. Its children are
    // `bry-property-row`s.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      collapsible: { kind: 'boolean' },
      collapsed: { kind: 'boolean' },
    },
    events: ['toggle'],
    children: true,
  },
  'bry-property-row': {
    // One property: a muted `label` (with an `icon`) and its value, the children.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      icon: { kind: 'enum', values: BUTTON_ICONS },
      readonly: { kind: 'boolean' },
    },
    required: ['label'],
    events: [],
    children: true,
  },
  'bry-keys': {
    // The keyboard shortcuts a screen answers while shown. Draws nothing.
    // Pressing one raises `press` with `{ key }`, never while typing.
    props: {
      bindings: {
        kind: 'list',
        max: 20,
        of: { kind: 'shape', fields: { key: { kind: 'text', max: KEY_NAME }, label: { kind: 'text', max: LABEL_MAX } }, required: ['key', 'label'] },
      },
    },
    required: ['bindings'],
    events: ['press'],
    children: false,
  },
  'bry-filter-chip': {
    // One filter in force: the facet's `icon` and `label`, up to four
    // `marks` of what is chosen, and `text` saying it. Pressing it raises
    // `press`; its cross raises `remove`.
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      icon: { kind: 'enum', values: BUTTON_ICONS },
      text: { kind: 'text', max: LABEL_MAX },
      marks: {
        kind: 'list',
        max: 4,
        of: { kind: 'shape', fields: { mark: { kind: 'enum', values: MARKS }, tone: { kind: 'enum', values: TONES }, hue: { kind: 'enum', values: HUES }, name: { kind: 'text', max: LABEL_MAX } }, required: ['mark'] },
      },
    },
    required: ['label'],
    events: ['press', 'remove'],
    children: false,
  },
} as const satisfies Readonly<Record<`bry-${string}`, ElementSpec>>;

export type Catalogue = typeof CATALOGUE;

export type ElementName = keyof Catalogue;

/** The element names, in the catalogue's order. */
export const ELEMENT_NAMES = Object.keys(CATALOGUE) as ElementName[];
