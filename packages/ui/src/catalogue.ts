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
  | { readonly kind: 'int'; readonly min: number; readonly max: number }
  /** A list of `{ value, label }` choices, at most `max` of them: a select's options. */
  | { readonly kind: 'options'; readonly max: number };

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

/** The five tones a status can be shown in (A6-F01-S02). */
export const TONES = ['neutral', 'brand', 'success', 'warn', 'danger'] as const;

/** The most a one-line field holds. */
export const INPUT_MAX = 1_000;

/** The most choices a select offers. A longer list wants a search. */
export const SELECT_MAX = 100;

/**
 * Every element an app may use, as the host declares them: Phase 0's five,
 * then each one Brydio has added since, in the order it registers them.
 */
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
      // Disabled, showing progress, while what it started is running.
      working: { kind: 'boolean' },
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
      // Draws the shell's loading placeholder in the card's place.
      loading: { kind: 'boolean' },
    },
    events: ['press'],
    children: true,
  },
  'bry-input': {
    // One line the person types. `change` carries `{ value }` on every
    // keystroke and Enter raises `submit` with the same; the field keeps what
    // was typed until the app sends a different `value`.
    props: {
      value: { kind: 'text', max: INPUT_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      kind: { kind: 'enum', values: ['text', 'email', 'url', 'search'] },
      maxLength: { kind: 'int', min: 1, max: INPUT_MAX },
      required: { kind: 'boolean' },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    events: ['change', 'submit'],
    children: false,
  },
  'bry-textarea': {
    // Like `bry-input` over more than one line, without `submit`: Enter starts a new line.
    props: {
      value: { kind: 'text', max: PARAGRAPH_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      maxLength: { kind: 'int', min: 1, max: PARAGRAPH_MAX },
      required: { kind: 'boolean' },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    events: ['change'],
    children: false,
  },
  'bry-select': {
    // One choice from a short list. Choosing raises `change` with `{ value }`;
    // what is shown stays the app's `value` until the app sends a new one.
    props: {
      value: { kind: 'text', max: LABEL_MAX },
      options: { kind: 'options', max: SELECT_MAX },
      placeholder: { kind: 'text', max: LABEL_MAX },
      label: { kind: 'text', max: LABEL_MAX },
      size: { kind: 'enum', values: ['sm', 'md'] },
      disabled: { kind: 'boolean' },
      error: { kind: 'text', max: LABEL_MAX },
    },
    required: ['options'],
    events: ['change'],
    children: false,
  },
  'bry-label': {
    // A field's name, above the control it holds, which it names for a screen reader.
    props: {
      text: { kind: 'text', max: LABEL_MAX },
      required: { kind: 'boolean' },
    },
    required: ['text'],
    events: [],
    children: true,
  },
  'bry-grid': {
    // Children in equal columns; the app picks how many from the width it is given.
    props: {
      columns: { kind: 'enum', values: ['1', '2', '3', '4', '5', '6'] },
      gap: { kind: 'enum', values: GAPS },
      align: { kind: 'enum', values: ['start', 'center', 'end', 'stretch'] },
    },
    events: [],
    children: true,
  },
  'bry-badge': {
    props: {
      text: { kind: 'text', max: LABEL_MAX },
      tone: { kind: 'enum', values: TONES },
    },
    required: ['text'],
    events: [],
    children: false,
  },
  'bry-avatar': {
    // Initials only: a picture address would let an app load anything from anywhere.
    props: {
      name: { kind: 'text', max: LABEL_MAX },
      size: { kind: 'enum', values: ['sm', 'md', 'lg'] },
    },
    required: ['name'],
    events: [],
    children: false,
  },
  'bry-list-row': {
    // Children sit at the end of the row (a badge, an avatar).
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      description: { kind: 'text', max: LABEL_MAX },
      meta: { kind: 'text', max: LABEL_MAX },
      pressable: { kind: 'boolean' },
      selected: { kind: 'boolean' },
      loading: { kind: 'boolean' },
    },
    events: ['press'],
    children: true,
  },
  'bry-empty-state': {
    // `action` is one button's label; pressing it raises `action`.
    props: {
      title: { kind: 'text', max: LABEL_MAX },
      text: { kind: 'text', max: PARAGRAPH_MAX },
      action: { kind: 'text', max: LABEL_MAX },
    },
    required: ['title'],
    events: ['action'],
    children: false,
  },
  'bry-skeleton': {
    props: {
      shape: { kind: 'enum', values: ['line', 'block', 'row'] },
      count: { kind: 'int', min: 1, max: 12 },
    },
    events: [],
    children: false,
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
