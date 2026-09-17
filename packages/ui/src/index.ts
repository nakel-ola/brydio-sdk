/**
 * `@brydio/ui`: what a screen's runtime needs, and the catalogue's types.
 *
 * Phase 0 ships no drawing here — Brydio draws every element with its own kit
 * on the host side. The catalogue's table, and the checks that read it, are
 * `@brydio/ui/validate`: `brydio validate`, the editor plugin and the fake
 * host read them, a published screen does not carry them (A5-F03-S01).
 */

export { FORBIDDEN_PROPS, MAX_TEXT, PARAGRAPH_MAX, TEXT_NODE, checkText, eventOfHandler, handlerName } from './basics.ts';

export type { Catalogue, ElementName, ElementSpec, PropSpec } from './catalogue.ts';

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
