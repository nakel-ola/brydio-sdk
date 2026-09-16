/**
 * `@brydio/ui`: the catalogue, as data and as types.
 *
 * Phase 0 ships no drawing here — Brydio draws every element with its own kit
 * on the host side. What an app, the CLI and the fake host need is the list
 * of what exists and what each thing takes, and that is this package.
 */

export {
  CATALOGUE,
  DIALOG_ACTIONS,
  ELEMENT_NAMES,
  FORBIDDEN_PROPS,
  GAPS,
  INPUT_MAX,
  KEY_MAX,
  LABEL_MAX,
  MAX_TEXT,
  MENU_ICONS,
  MENU_ITEMS,
  PADDINGS,
  PARAGRAPH_MAX,
  SELECT_MAX,
  TABLE_COLUMNS,
  TABLE_ROWS,
  TEXT_NODE,
  TONES,
  VIRTUAL_ROWS,
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
  refusalForValue,
} from './checks.ts';

export type {
  BryEvent,
  DetailOf,
  ElementAttributes,
  ElementEvent,
  ElementHandlers,
  ElementEventDetails,
  ElementProps,
  EventDetails,
  HandlerName,
  HoldsChildren,
  ValueOf,
} from './types.ts';
