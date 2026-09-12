/**
 * The catalogue: every element an app can draw with, and nothing else
 * (contracts §10, A6-F01, ADR-A13).
 *
 * This table is the one list. The worker runtime refuses a node or a setting
 * that is not in it, `brydio validate` reads it to check a screen's source,
 * the fake host refuses what the real receiver would, and the typed JSX and
 * factories are derived from it at the type level. A second list anywhere
 * would be a list that can drift, which is how "an app cannot look wrong"
 * stops being true without anyone noticing.
 *
 * Every setting is one of three kinds. An `enum` names its allowed values,
 * which are token names ("3", "danger") and never a pixel or a colour. A
 * `boolean` is a switch. A `text` is words shown to a person: a label, a
 * title, a line of copy. There is no fourth kind, so there is nowhere to put
 * a style, a class or a hex value (A6-F04-S01).
 *
 * Phase 0 has five elements. The values below are contracts §10's; where §10
 * names a setting without its values (`align`, `justify`) the values are the
 * SDK's smallest reading, written down in CONTRACT-NOTES.md.
 */

export interface EnumSpec {
  readonly kind: 'enum';
  readonly values: readonly (string | number)[];
  /** What the host draws when the setting is absent, where the contract says. */
  readonly default?: string | number;
}

export interface BooleanSpec {
  readonly kind: 'boolean';
}

/** Words for a person to read. Content, never presentation. */
export interface TextSpec {
  readonly kind: 'text';
}

export type PropSpec = EnumSpec | BooleanSpec | TextSpec;

export interface EventSpec {
  /** A boolean setting that has to be on before the host raises the event. */
  readonly when?: string;
}

/**
 * What an element may hold.
 *
 * `elements` takes other catalogue elements; `text` takes text nodes only,
 * which is how a framework's `<bry-text>Hello</bry-text>` reaches the host;
 * `none` takes nothing, because its words are a setting (a button's label).
 * Raw text directly inside a stack or a card is refused: it would be text
 * drawn in no type role, which is exactly the unstyled span A6-F04 rules out.
 */
export type ChildrenSpec = 'elements' | 'text' | 'none';

export interface ElementSpec {
  readonly props: Readonly<Record<string, PropSpec>>;
  readonly events: Readonly<Record<string, EventSpec>>;
  readonly children: ChildrenSpec;
}

const SPACING_GAP = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
const SPACING_PADDING = ['2', '3', '4', '5', '6'] as const;

export const CATALOGUE = {
  'bry-stack': {
    props: {
      direction: { kind: 'enum', values: ['row', 'column'], default: 'column' },
      gap: { kind: 'enum', values: SPACING_GAP },
      align: { kind: 'enum', values: ['start', 'center', 'end', 'stretch'] },
      justify: { kind: 'enum', values: ['start', 'center', 'end', 'between'] },
      wrap: { kind: 'boolean' },
    },
    events: {},
    children: 'elements',
  },
  'bry-heading': {
    props: {
      level: { kind: 'enum', values: [1, 2, 3] },
      text: { kind: 'text' },
    },
    events: {},
    children: 'text',
  },
  'bry-text': {
    props: {
      text: { kind: 'text' },
      tone: { kind: 'enum', values: ['default', 'muted', 'danger'] },
      size: { kind: 'enum', values: ['sm', 'md'] },
    },
    events: {},
    children: 'text',
  },
  'bry-button': {
    props: {
      label: { kind: 'text' },
      variant: { kind: 'enum', values: ['primary', 'secondary', 'ghost', 'danger'] },
      size: { kind: 'enum', values: ['sm', 'md'] },
      disabled: { kind: 'boolean' },
    },
    events: { press: {} },
    children: 'none',
  },
  'bry-card': {
    props: {
      title: { kind: 'text' },
      padding: { kind: 'enum', values: SPACING_PADDING },
      // §10 gives the card a `press` event "when pressable: true", which
      // makes `pressable` a setting even though its props column omits it.
      pressable: { kind: 'boolean' },
    },
    events: { press: { when: 'pressable' } },
    children: 'elements',
  },
} as const satisfies Readonly<Record<`bry-${string}`, ElementSpec>>;

export type Catalogue = typeof CATALOGUE;

export type ElementName = keyof Catalogue;

/** The element names, in the catalogue's order. */
export const ELEMENT_NAMES = Object.keys(CATALOGUE) as ElementName[];

/** The node type a text node carries on the wire (contracts §9). */
export const TEXT_NODE = '#text';

/**
 * Settings no element will ever take, named so the refusal can say why
 * rather than just "unknown". The list is for the message only: the real
 * refusal is that none of these is in the table.
 */
export const FORBIDDEN_PROPS: Readonly<Record<string, string>> = {
  style: 'Brydio draws every element in its own style; there is no `style` setting.',
  className: 'There are no classes in a Brydio app; choose a setting the element offers.',
  class: 'There are no classes in a Brydio app; choose a setting the element offers.',
  color: 'Colours come from Brydio’s tokens through a setting like `tone`, never a value.',
  colour: 'Colours come from Brydio’s tokens through a setting like `tone`, never a value.',
  dangerouslySetInnerHTML: 'A Brydio app has no HTML to set.',
  innerHTML: 'A Brydio app has no HTML to set.',
};
