/**
 * The catalogue: every element an app can draw with, and nothing else
 * (contracts §10, A6-F01, ADR-A13).
 *
 * This is a copy of Brydio's own declaration,
 * `packages/app/src/apps/catalogue/elements.ts`, which is what the host checks
 * every node against before it draws anything. The copy is kept exact on
 * purpose, down to the lengths and the wording of each refusal: the worker
 * runtime refuses a node here with the sentence the host would send back in
 * `tree/refused`, `brydio validate` reads the same table, and the fake host
 * refuses exactly what a workspace would. A copy that was merely similar
 * would let a screen pass every local check and stop in front of a person.
 * `test/catalogue.test.ts` compares the two whenever a Brydio checkout sits
 * beside this repository.
 *
 * No setting accepts a colour, a pixel size, a class name or a style. Spacing,
 * tone and size are chosen by name, and Brydio turns the name into the right
 * value for the theme.
 */

/** One setting: which values it takes. */
export type PropSpec =
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'text'; readonly max: number }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'int'; readonly min: number; readonly max: number };

export interface ElementSpec {
  readonly props: Readonly<Record<string, PropSpec>>;
  /** Settings a node must carry to be drawn at all. */
  readonly required?: readonly string[];
  /** What it tells the app: a button's `press`. */
  readonly events: readonly string[];
  /** Whether other nodes, elements or text, may sit inside it. */
  readonly children: boolean;
}

/** Short text on a control or a heading. Long enough for a sentence, no more. */
export const LABEL_MAX = 200;
/** A paragraph. Long text belongs in more than one node. */
export const PARAGRAPH_MAX = 4_000;

/** Steps on the spacing scale an app may name. `gap="3"` is Brydio's `gap-3`. */
export const GAPS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
export const PADDINGS = ['2', '3', '4', '5', '6'] as const;

/** The five elements of Phase 0, as the host declares them. */
export const CATALOGUE = {
  'bry-stack': {
    props: {
      direction: { kind: 'enum', values: ['row', 'column'] },
      gap: { kind: 'enum', values: GAPS },
      align: { kind: 'enum', values: ['start', 'center', 'end', 'stretch'] },
      justify: { kind: 'enum', values: ['start', 'center', 'end', 'between'] },
      wrap: { kind: 'boolean' },
    },
    events: [],
    children: true,
  },
  'bry-heading': {
    props: { level: { kind: 'int', min: 1, max: 3 }, text: { kind: 'text', max: LABEL_MAX } },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-text': {
    props: {
      text: { kind: 'text', max: PARAGRAPH_MAX },
      tone: { kind: 'enum', values: ['default', 'muted', 'danger'] },
      size: { kind: 'enum', values: ['sm', 'md'] },
    },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-button': {
    props: {
      label: { kind: 'text', max: LABEL_MAX },
      variant: { kind: 'enum', values: ['primary', 'secondary', 'ghost', 'danger'] },
      size: { kind: 'enum', values: ['sm', 'md'] },
      disabled: { kind: 'boolean' },
    },
    required: ['label'],
    events: ['press'],
    children: false,
  },
  'bry-card': {
    // The host raises `press` only while `pressable` is true.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      padding: { kind: 'enum', values: PADDINGS },
      pressable: { kind: 'boolean' },
    },
    events: ['press'],
    children: true,
  },
} as const satisfies Readonly<Record<`bry-${string}`, ElementSpec>>;

export type Catalogue = typeof CATALOGUE;

export type ElementName = keyof Catalogue;

/** The element names, in the catalogue's order. */
export const ELEMENT_NAMES = Object.keys(CATALOGUE) as ElementName[];

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
