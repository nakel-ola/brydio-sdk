/**
 * `@brydio/ui`: the catalogue, as data and as types.
 *
 * Phase 0 ships no drawing here — Brydio draws every element with its own kit
 * on the host side. What an app, the CLI and the fake host need is the list
 * of what exists and what each thing takes, and that is this package.
 */

export {
  CATALOGUE,
  ELEMENT_NAMES,
  FORBIDDEN_PROPS,
  TEXT_NODE,
  type BooleanSpec,
  type Catalogue,
  type ChildrenSpec,
  type ElementName,
  type ElementSpec,
  type EnumSpec,
  type EventSpec,
  type PropSpec,
  type TextSpec,
} from './catalogue.ts';

export {
  checkChild,
  checkElement,
  checkEvent,
  checkProp,
  elementSpec,
  eventOfHandler,
  handlerName,
  isElementName,
} from './checks.ts';

export type {
  BryEvent,
  ChildrenKind,
  ElementAttributes,
  ElementEvent,
  ElementHandlers,
  ElementProps,
  EventDetails,
  HandlerName,
  ValueOf,
} from './types.ts';
