/**
 * What a screen's runtime needs from the catalogue, and nothing that pulls
 * the catalogue itself in (A5-F03-S01, the 30 KB runtime cap).
 *
 * The catalogue's own table — every element's settings, their lengths and
 * their values — is read by `brydio validate`, the editor plugin and the fake
 * host, which all catch a mistake before anything is published, and by the
 * host, which refuses every node it is sent. A published screen carries none
 * of it: it carries these few words and lengths, which it uses on every node.
 */

/** A paragraph. Long text belongs in more than one node. */
export const PARAGRAPH_MAX = 4_000;

/** A run of text between elements. Drawn as text, never as markup. */
export const TEXT_NODE = '#text';

/** The longest a text node may be. */
export const MAX_TEXT = PARAGRAPH_MAX;

/**
 * Settings no element will ever take, named so a local refusal can say why
 * rather than just "unknown". Only the SDK adds these words; the host's
 * sentence comes first, unchanged.
 */
export const FORBIDDEN_PROPS: Readonly<Record<string, string>> = {
  style: 'Brydio draws every element in its own style; there is no style setting.',
  className: 'There are no classes in a Brydio app; choose a setting the element offers.',
  class: 'There are no classes in a Brydio app; choose a setting the element offers.',
  color: 'Colours come from Brydio’s tokens through a setting like tone, never a value.',
  colour: 'Colours come from Brydio’s tokens through a setting like tone, never a value.',
  dangerouslySetInnerHTML: 'A Brydio app has no HTML to set.',
  innerHTML: 'A Brydio app has no HTML to set.',
};

/** Why a text is refused, or `null`. The host's words. */
export function checkText(text: unknown): string | null {
  return typeof text === 'string' && text.length <= MAX_TEXT ? null : `Text must be at most ${MAX_TEXT} characters.`;
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
