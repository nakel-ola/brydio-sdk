import { CATALOGUE, FORBIDDEN_PROPS, MAX_TEXT, TEXT_NODE, type ElementName, type ElementSpec, type PropSpec } from './catalogue.ts';

/**
 * The checks every reader of the catalogue shares.
 *
 * `refusalFor` and `refusalForProps` are the host's own functions, copied with
 * their sentences, so a refusal reads the same whether the worker caught it,
 * `brydio validate` printed it, or Brydio sent it back in `tree/refused`. The
 * rest are the SDK's small conveniences on top: each answers with a sentence
 * or `null`, never a boolean, because each caller has to tell somebody why.
 */

export function isElementName(value: unknown): value is ElementName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATALOGUE, value);
}

export function elementSpec(element: ElementName): ElementSpec {
  return CATALOGUE[element];
}

/**
 * Why a setting can't be drawn, or `null` when it can. The host's words.
 *
 * `null` and `undefined` are not values here: on the wire a setting is either
 * sent with a value or not sent, and `null` only means "unset" inside a
 * `props` op.
 */
export function refusalFor(type: ElementName, name: string, value: unknown): string | null {
  const spec = (CATALOGUE[type].props as Record<string, PropSpec>)[name];

  if (!spec) return `${type} has no setting called "${name}".`;

  switch (spec.kind) {
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value)
        ? null
        : `${type} ${name} must be one of ${spec.values.join(', ')}.`;
    case 'text':
      return typeof value === 'string' && value.length <= spec.max
        ? null
        : `${type} ${name} must be text of at most ${spec.max} characters.`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `${type} ${name} must be true or false.`;
    case 'int':
      return Number.isInteger(value) && (value as number) >= spec.min && (value as number) <= spec.max
        ? null
        : `${type} ${name} must be a whole number from ${spec.min} to ${spec.max}.`;
  }
}

/** Why a node's settings as a whole can't be drawn, or `null`. The host's words. */
export function refusalForProps(type: ElementName, props: Record<string, unknown>): string | null {
  for (const [name, value] of Object.entries(props)) {
    const refused = refusalFor(type, name, value);

    if (refused) return refused;
  }

  for (const name of (CATALOGUE[type] as ElementSpec).required ?? []) {
    if (props[name] === undefined) return `${type} needs a ${name}.`;
  }

  return null;
}

/** Why a node type is refused, or `null` when the host can draw it. The host's words. */
export function checkElement(type: unknown): string | null {
  if (type === TEXT_NODE || isElementName(type)) return null;

  return `Brydio has no element called "${String(type)}".`;
}

/**
 * Why one setting is refused on an element, or `null`.
 *
 * The host's sentence, plus a reason when the name is one people reach for
 * from the web (`style`, `className`).
 */
export function checkProp(element: ElementName, name: string, value: unknown): string | null {
  const refused = refusalFor(element, name, value);

  if (!refused) return null;

  const why = FORBIDDEN_PROPS[name];

  return why ? `${refused} ${why}` : refused;
}

/** Why a text is refused, or `null`. The host's words. */
export function checkText(text: unknown): string | null {
  return typeof text === 'string' && text.length <= MAX_TEXT ? null : `Text must be at most ${MAX_TEXT} characters.`;
}

/** Why a parent can't hold children, or `null` when it can. The host's words. */
export function checkChild(parent: ElementName): string | null {
  return CATALOGUE[parent].children ? null : `${parent} can’t hold other nodes.`;
}

/** `press` → `onPress`. */
export const handlerName = (event: string): string => `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;

/**
 * The event a handler setting names, or `null` when the name is not a handler.
 *
 * `onPress` → `press`. Preact registers some listeners with the case it was
 * given (`Press`) and some lower-cased, so the answer is always lower-case.
 */
export function eventOfHandler(name: string): string | null {
  if (!/^on[A-Z]/.test(name)) return null;

  return name.slice(2).toLowerCase();
}

/** Why an element does not raise this event, or `null` when it does. */
export function checkEvent(element: ElementName, event: string): string | null {
  const events: readonly string[] = CATALOGUE[element].events;

  if (events.includes(event)) return null;

  return events.length
    ? `${element} raises ${events.join(', ')}, not "${event}".`
    : `${element} raises no events, so it takes no ${handlerName(event)}.`;
}
