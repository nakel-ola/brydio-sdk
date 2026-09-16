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
  GAPS,
  LABEL_MAX,
  MAX_TEXT,
  PADDINGS,
  PARAGRAPH_MAX,
  TEXT_NODE,
  type Catalogue,
  type ElementName,
  type ElementSpec,
  type PropSpec,
} from './catalogue.ts';

export {
  checkChild,
  checkElement,
  checkEvent,
  checkProp,
  checkText,
  elementSpec,
  eventOfHandler,
  handlerName,
  isElementName,
  refusalFor,
  refusalForProps,
} from './checks.ts';

export type {
  BryEvent,
  ElementAttributes,
  ElementEvent,
  ElementHandlers,
  ElementProps,
  EventDetails,
  HandlerName,
  HoldsChildren,
  ValueOf,
} from './types.ts';
