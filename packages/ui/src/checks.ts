import {
  CATALOGUE,
  FORBIDDEN_PROPS,
  TEXT_NODE,
  type ElementName,
  type ElementSpec,
  type PropSpec,
} from './catalogue.ts';

/**
 * The checks every reader of the catalogue shares.
 *
 * Each answers with a sentence or `null`, never a boolean, because each of its
 * callers has to tell somebody why: the runtime throws the sentence at the
 * line that set the prop, `validate` prints it against a file and line, and
 * the fake host sends it back in `tree/refused` as the reason. One sentence
 * for one mistake, wherever it is caught (A5-F05-S04).
 */

export function isElementName(value: unknown): value is ElementName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CATALOGUE, value);
}

export function elementSpec(element: ElementName): ElementSpec {
  return CATALOGUE[element];
}

/** Why a node type is refused, or `null` when it is one the host can draw. */
export function checkElement(type: unknown): string | null {
  if (type === TEXT_NODE || isElementName(type)) return null;

  const name = typeof type === 'string' ? type : String(type);

  return `"${name}" is not an element a Brydio app can draw. The catalogue has ${listOf(Object.keys(CATALOGUE))}.`;
}

/** `press` → `onPress`. */
export const handlerName = (event: string): string =>
  `on${event.charAt(0).toUpperCase()}${event.slice(1)}`;

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
  const events = Object.keys(CATALOGUE[element].events);

  if (events.includes(event)) return null;

  return events.length
    ? `<${element}> raises ${listOf(events)}, not "${event}".`
    : `<${element}> raises no events, so it takes no "${handlerName(event)}".`;
}

/**
 * Why a setting is refused on an element, or `null` when the host would draw
 * it.
 *
 * `undefined` and `null` mean "not set" and are always accepted: that is how
 * a setting is taken away again.
 */
export function checkProp(element: ElementName, name: string, value: unknown): string | null {
  const spec: PropSpec | undefined = (CATALOGUE[element].props as Record<string, PropSpec>)[name];

  if (!spec) {
    const why = FORBIDDEN_PROPS[name];
    const offered = Object.keys(CATALOGUE[element].props);

    return (
      `<${element}> has no "${name}" setting.` +
      (why ? ` ${why}` : '') +
      (offered.length ? ` It takes ${listOf(offered)}.` : ' It takes no settings.')
    );
  }

  if (value === undefined || value === null) return null;

  if (spec.kind === 'boolean') {
    return typeof value === 'boolean' ? null : `<${element}>'s "${name}" is true or false, not ${shown(value)}.`;
  }

  if (spec.kind === 'text') {
    return typeof value === 'string' ? null : `<${element}>'s "${name}" is text, not ${shown(value)}.`;
  }

  return spec.values.includes(value as string | number)
    ? null
    : `<${element}>'s "${name}" is one of ${listOf(spec.values.map(shown))}, not ${shown(value)}.`;
}

/** Why a child is refused inside a parent, or `null` when the parent takes it. */
export function checkChild(parent: ElementName, child: string): string | null {
  const holds = CATALOGUE[parent].children;

  if (child === TEXT_NODE) {
    if (holds === 'text') return null;

    return holds === 'elements'
      ? `<${parent}> holds elements, not bare text. Put the words in a <bry-text>.`
      : `<${parent}> holds nothing; its words go in a setting.`;
  }

  if (holds === 'elements') return null;

  return holds === 'text'
    ? `<${parent}> holds text only, not <${child}>.`
    : `<${parent}> holds nothing, so <${child}> cannot go inside it.`;
}

function shown(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');

  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
