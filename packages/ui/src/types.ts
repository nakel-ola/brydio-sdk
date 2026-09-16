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
        : never;

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

/** What each event carries. `press` carries nothing. */
export interface EventDetails {
  press: undefined;
}

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
    event: BryEvent<K extends keyof EventDetails ? EventDetails[K] : unknown>,
  ) => void;
}>;

/** Settings and handlers together: what `<bry-button …>` or `button({…})` takes. */
export type ElementAttributes<E extends ElementName> = Simplify<ElementProps<E> & ElementHandlers<E>>;

/** Whether an element may hold other nodes. */
export type HoldsChildren<E extends ElementName> = Catalogue[E]['children'];
