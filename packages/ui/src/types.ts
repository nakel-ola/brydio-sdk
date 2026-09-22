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
  };
  'bry-diff': {
    /** A file listed without its `patch` was opened: send it. `file` is its path. */
    expand: { file: string };
    /** Lines chosen in one file, on one side, `start` to `end` inclusive. */
    select: { file: string; side: 'old' | 'new'; start: number; end: number };
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
