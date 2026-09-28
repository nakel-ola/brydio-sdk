import type { Catalogue, ElementName, PropSpec } from './catalogue.ts';

/**
 * The catalogue's types, derived from the table rather than written beside
 * it, so a value added to the table is a value the editor offers and a value
 * taken out is a type error in every app that used it (A6-F01-TC004).
 */

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The TypeScript type of one setting's values. */
export type ValueOf<S extends PropSpec> = S extends { kind: 'enum'; values: readonly (infer V)[] }
  ? V
  : S extends { kind: 'boolean' }
    ? boolean
    : S extends { kind: 'text' }
      ? string
      : S extends { kind: 'int' }
        ? number
        : S extends { kind: 'options' }
          ? { value: string; label: string; avatar?: string }[]
          : S extends { kind: 'list'; of: infer Of extends PropSpec }
            ? ValueOf<Of>[]
            : S extends { kind: 'shape'; fields: infer Fields extends Readonly<Record<string, PropSpec>> }
              ? ShapeOf<Fields, S extends { required: readonly (infer R)[] } ? R & string : never>
              : never;

/** A record's fields: the ones it requires, then the rest, optional. */
type ShapeOf<Fields extends Readonly<Record<string, PropSpec>>, Required extends string> = Simplify<
  { -readonly [K in keyof Fields as K extends Required ? K : never]-?: ValueOf<Fields[K]> } & {
    -readonly [K in keyof Fields as K extends Required ? never : K]?: ValueOf<Fields[K]>;
  }
>;

type PropsOf<E extends ElementName> = Catalogue[E]['props'];
type RequiredOf<E extends ElementName> = Catalogue[E] extends { required: readonly (infer R)[] } ? R & string : never;

/** Every setting an element takes: the ones the host requires, then the rest, optional. */
export type ElementProps<E extends ElementName> = Simplify<
  {
    -readonly [K in keyof PropsOf<E> as K extends RequiredOf<E> ? K : never]-?: PropsOf<E>[K] extends PropSpec
      ? ValueOf<PropsOf<E>[K]>
      : never;
  } & {
    -readonly [K in keyof PropsOf<E> as K extends RequiredOf<E> ? never : K]?: PropsOf<E>[K] extends PropSpec
      ? ValueOf<PropsOf<E>[K]>
      : never;
  }
>;

/** The events an element raises, by name. */
export type ElementEvent<E extends ElementName> = Catalogue[E]['events'][number] & string;

/** What each event carries. `press` carries nothing; a field's `change` and `submit` carry its text. */
export interface EventDetails {
  press: undefined;
  /** What the field holds now, on every keystroke. */
  change: { value: string };
  /** What the field held when Enter was pressed. */
  submit: { value: string };
  /** An empty state's one button was pressed. */
  action: undefined;
}

/**
 * What an event carries where one element's differs from `EventDetails`: a
 * checkbox's `change` is whether it is ticked, not text, and a dialog's
 * `action` names the button. Looked up first, by element.
 */
export interface ElementEventDetails {
  'bry-list-row': {
    /** Whether the work row's selection box is checked now. */
    toggle: { checked: boolean };
    /** The id of the item chosen from the row's own menu. */
    select: { id: string };
    /** The row's cross was pressed. */
    remove: undefined;
  };
  'bry-table': {
    /** The column whose heading was pressed, and the direction it asks for. */
    sort: { key: string; direction: 'asc' | 'desc' };
    /** The id of the row chosen. */
    select: { row: string };
  };
  'bry-virtual-list': {
    /** The rows now in view, `end` excluded: the ones to send, from `start`. */
    range: { start: number; end: number };
    /** The index of the row chosen. */
    select: { index: number };
  };
  'bry-dialog': {
    /** The id of the action pressed. The dialog stays open until the app closes it. */
    action: { id: string };
    /** Nothing when the person closed it; `{ refused }` when another dialog was already open. */
    close: { refused: string } | undefined;
    /** A composer's expand button: whether it asks to be larger now. */
    expand: { expanded: boolean };
    /** A composer's footer switch ("Create another"): whether it is on now. */
    toggle: { checked: boolean };
  };
  'bry-menu': {
    /** The id of the item chosen. */
    select: { id: string };
  };
  'bry-checkbox': {
    /** Whether it is ticked now. */
    change: { checked: boolean };
  };
  'bry-switch': {
    /** Whether it is on now. */
    change: { checked: boolean };
  };
  'bry-board': {
    /**
     * A card moved: the card's node id, the columns' node ids, and its index
     * in `to` afterwards. Answer by moving the card, or by setting `settled`.
     */
    move: { card: string; from: string; to: string; position: number };
  };
  'bry-board-column': {
    /** The cards now wanted, `end` excluded: the ones to send, from `start`. */
    range: { start: number; end: number };
    /** The header was pressed: whether it asks to be folded away now. */
    toggle: { collapsed: boolean };
    /** The "+" or the add line was pressed. */
    add: undefined;
    /** Enter in the add line: what it holds. */
    submit: { value: string };
    /** Escape in the add line. */
    cancel: undefined;
    /** The id of the item chosen from the column's own menu. */
    select: { id: string };
  };
  'bry-diff': {
    /** A file listed without its `patch` was opened: send it. `file` is its path. */
    expand: { file: string };
    /** Lines chosen in one file, on one side, `start` to `end` inclusive. */
    select: { file: string; side: 'old' | 'new'; start: number; end: number };
  };
  // ADR-A23 (catalogue-b)
  'bry-calendar': {
    /** The chosen days, ISO dates: one, the sorted many, or a range's `[start]` then `[start, end]`. */
    change: { values: string[] };
  };
  'bry-command': {
    /** The id of the command chosen. */
    select: { id: string };
  };
  'bry-context-menu': {
    /** The id of the item chosen. */
    select: { id: string };
  };
  'bry-data-table': {
    /** The column whose heading was pressed, and the direction it is now sorted. */
    sort: { key: string; direction: 'asc' | 'desc' };
    /** What the filter box holds now. */
    filter: { value: string };
    /** The page now showing, from 1. */
    page: { page: number };
    /** The keys of the columns now hidden. */
    columns: { hidden: string[] };
    /** The ids of the rows now chosen. */
    select: { rows: string[] };
  };
  'bry-input-group': {
    /** The button at the field's end was pressed, with what the field held. */
    action: { value: string };
  };
  'bry-input-otp': {
    /** The last box was filled: the whole code. */
    complete: { value: string };
  };
  'bry-menubar': {
    /** The menu and the id of the item chosen in it. */
    select: { menu: string; id: string };
  };
  'bry-section-menu': {
    /** The id of the section or entry chosen. */
    select: { id: string };
  };
  'bry-pagination': {
    /** The page asked for, from 1. */
    page: { page: number };
  };
  'bry-questionnaire': {
    /** One question answered: a choice's value, the list of them, the text, or the rating. */
    answer: { question: string; value: string | string[] | number };
    /** The question now showing, from 0. */
    step: { index: number };
    /** Every answer, keyed by question id. */
    submit: { answers: Record<string, string | string[] | number> };
  };
  'bry-slider': {
    /** Where it is now, as it moves. */
    change: { value: number };
    /** Where it settled when let go: the one to save. */
    commit: { value: number };
  };
  'bry-toggle': {
    /** Whether it is pressed now. */
    change: { pressed: boolean };
  };
  'bry-toggle-group': {
    /** The values of the toggles pressed now. */
    change: { values: string[] };
  };
  // ADR-A23 (catalogue-a)
  'bry-accordion': {
    /** The ids of the sections open now. */
    change: { expanded: string[] };
  };
  'bry-alert-dialog': {
    /** The action was pressed. It stays open until the app closes it. */
    action: undefined;
    /** Nothing when the person cancelled; `{ refused }` when another dialog was already open. */
    close: { refused: string } | undefined;
  };
  'bry-attachment': {
    open: undefined;
    remove: undefined;
  };
  'bry-breadcrumb': {
    /** The id of the step pressed. */
    select: { id: string };
  };
  'bry-carousel': {
    /** The slide now shown. */
    change: { index: number };
  };
  'bry-collapsible': {
    /** Whether it is open now. */
    change: { open: boolean };
  };
  'bry-drawer': {
    close: { refused: string } | undefined;
  };
  'bry-hover-card': {
    open: undefined;
    close: undefined;
  };
  'bry-message': {
    retry: undefined;
  };
  'bry-message-scroller': {
    /** The person reached the top: send older messages. */
    more: undefined;
  };
  'bry-popover': {
    open: undefined;
    close: undefined;
  };
  'bry-sheet': {
    close: { refused: string } | undefined;
  };
  'bry-tabs': {
    /** The id of the tab chosen. */
    change: { id: string };
  };
  // Plan fidelity
  'bry-property': {
    /** The value chosen, or, for `members` and `labels`, every value chosen now. Empty when cleared. */
    change: { value: string } | { values: string[] };
  };
  'bry-quick-add': {
    /** The closed row was pressed: answer with `open`. */
    open: undefined;
    /** Enter in the input: what it holds. */
    submit: { value: string };
    /** Escape in the input. */
    cancel: undefined;
  };
  'bry-work-card': {
    /** The id of the item chosen from the card's menu. */
    select: { id: string };
  };
  'bry-page-header': {
    /** The back arrow was pressed. */
    back: undefined;
    /** The id of the crumb pressed. */
    crumb: { id: string };
    /** The id of the tab chosen. */
    tab: { id: string };
  };
  'bry-entity-row': {
    /** The id of the item chosen from the row's menu. */
    select: { id: string };
    /** The chevron was pressed: whether it asks to be expanded now. */
    toggle: { expanded: boolean };
  };
  'bry-filter-menu': {
    /** A facet's options were ticked or unticked: the facet's whole new list. */
    change: { facet: string; values: string[] };
    /** "Reset all filters" was chosen. */
    reset: undefined;
  };
  'bry-gantt': {
    /** A row or its bar was pressed. */
    press: { id: string };
    /** Previous, Today or Next: the first day to show now, an ISO date. */
    navigate: { start: string };
    /** The zoom chosen. */
    zoom: { zoom: 'day' | 'week' | 'month' };
    /** Whether "Show completed" is on now. */
    completed: { checked: boolean };
  };
  'bry-timeline': {
    /** The folded line was pressed: send the block again, unfolded. */
    expand: undefined;
  };
  'bry-comment': {
    /** The action chosen. */
    action: { id: 'reply' | 'edit' | 'resolve' | 'copy' | 'copyLink' | 'subIssue' | 'delete' };
    /** Whether the thread's replies are asked to be folded now. */
    toggle: { collapsed: boolean };
  };
  'bry-reactions': {
    /** The emoji pressed or chosen: add the person's reaction, or take it away. */
    toggle: { emoji: string };
  };
  'bry-peek': {
    previous: undefined;
    next: undefined;
    /** Open the item's full page. */
    expand: undefined;
    close: undefined;
  };
  'bry-spreadsheet': {
    /** A heading's menu asked for this order. */
    sort: { key: string; direction: 'asc' | 'desc' };
    /** A heading's menu asked to hide its column. */
    hide: { key: string };
    /** The corner box: every row chosen, or none. */
    selectAll: { checked: boolean };
  };
  'bry-spreadsheet-row': {
    /** Whether the row's box is ticked now. */
    toggle: { checked: boolean };
    /** Whether the row asks to show its sub-rows now. */
    expand: { expanded: boolean };
  };
  'bry-spreadsheet-group': {
    /** Whether the group asks to be folded now. */
    toggle: { collapsed: boolean };
  };
  'bry-rich-text': {
    /** The markdown, as the person types. */
    change: { value: string };
    /** The markdown, when the person leaves the editor. */
    blur: { value: string };
    /** The markdown, on Mod+Enter. */
    submit: { value: string };
  };
  'bry-board-lane': {
    /** Whether the lane asks to be folded now. */
    toggle: { collapsed: boolean };
    /** The lane's link was pressed. */
    open: undefined;
  };
  'bry-property-list': {
    /** Whether the section asks to be folded now. */
    toggle: { collapsed: boolean };
  };
  'bry-keys': {
    /** The binding pressed, as its `key` names it. */
    press: { key: string };
  };
  'bry-filter-chip': {
    /** The chip was pressed, to change the filter. */
    press: undefined;
    /** Its cross was pressed. */
    remove: undefined;
  };
}

/** What an element's event carries: its own detail if it has one, else the shared one. */
export type DetailOf<E extends ElementName, K extends string> = E extends keyof ElementEventDetails
  ? K extends keyof ElementEventDetails[E]
    ? ElementEventDetails[E][K]
    : K extends keyof EventDetails
      ? EventDetails[K]
      : unknown
  : K extends keyof EventDetails
    ? EventDetails[K]
    : unknown;

/** The object a handler receives, in the plain factories and in Preact alike. */
export interface BryEvent<D = undefined> {
  /** The event's name as it was registered. */
  readonly type: string;
  readonly detail: D;
  /** The node the event is about. */
  readonly target: unknown;
}

/** `onPress` for `press`. */
export type HandlerName<Event extends string> = `on${Capitalize<Event>}`;

/** The handler settings an element takes: one per event. */
export type ElementHandlers<E extends ElementName> = Simplify<{
  [K in ElementEvent<E> as HandlerName<K>]?: (
    event: BryEvent<DetailOf<E, K>>,
  ) => void;
}>;

/** Settings and handlers together: what `<bry-button …>` or `button({…})` takes. */
export type ElementAttributes<E extends ElementName> = Simplify<ElementProps<E> & ElementHandlers<E>>;

/** Whether an element may hold other nodes. */
export type HoldsChildren<E extends ElementName> = Catalogue[E]['children'];
