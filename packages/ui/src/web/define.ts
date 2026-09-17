/// <reference lib="dom" />
import { CATALOGUE, ELEMENT_NAMES, type ElementName, type ElementSpec, type PropSpec } from '../catalogue.ts';
import { BryElement, html, nothing, type PropertyDeclaration, type TemplateResult } from './base.ts';

/**
 * The catalogue as custom elements (A6-F06-S01), made from `CATALOGUE` rather
 * than written a second time: an element added there is registered here after
 * a build, under the same name, with the same settings and events.
 *
 * A setting is a property of the same name and an attribute in kebab case
 * (`hideLabel` is `hide-label`). A list or a record (a select's options, a
 * table's columns) is a property, or an attribute holding JSON.
 */

/** A setting's attribute: `hideLabel` → `hide-label`. */
export function attributeOf(setting: string): string {
  return setting.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

const json = {
  fromAttribute(value: string | null): unknown {
    if (value === null) return undefined;

    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  },
  toAttribute(value: unknown): string {
    return JSON.stringify(value);
  },
};

/** How one setting is declared on the element. */
export function declarationOf(name: string, spec: PropSpec): PropertyDeclaration {
  const attribute = attributeOf(name);

  switch (spec.kind) {
    case 'boolean':
      return { type: Boolean, attribute };
    case 'int':
      return { type: Number, attribute };
    case 'text':
    case 'enum':
      return { type: String, attribute };
    default:
      return { attribute, converter: json };
  }
}

/** A catalogue element as a web component class. */
export interface CatalogueElementClass {
  new (): BryElement;
  readonly element: ElementName;
  readonly spec: ElementSpec;
  /** The events it sends, as the catalogue names them. */
  readonly events: readonly string[];
}

/**
 * How an element is drawn. An element with no drawing of its own yet shows
 * what sits inside it, so a page using it still reads.
 */
export type Draw = (element: BryElement & Record<string, unknown>) => TemplateResult | typeof nothing;

const DRAW: Partial<Record<ElementName, Draw>> = {};

/** Gives an element its drawing. Drawings are added a few elements at a time. */
export function drawAs(name: ElementName, draw: Draw): void {
  DRAW[name] = draw;
}

function classFor(name: ElementName): CatalogueElementClass {
  const spec = CATALOGUE[name] as ElementSpec;

  const made = class extends BryElement {
    static readonly element = name;
    static readonly spec = spec;
    static readonly events = spec.events;

    override render() {
      const draw = DRAW[name];

      if (draw) return draw(this as unknown as BryElement & Record<string, unknown>);

      return spec.children ? html`<slot></slot>` : nothing;
    }
  };

  for (const [setting, propSpec] of Object.entries(spec.props)) {
    made.setting(setting, declarationOf(setting, propSpec));
  }

  return made;
}

/**
 * Registers every catalogue element that isn't registered yet, and answers
 * with the classes, by name. Linking the build calls it once; calling it
 * again changes nothing.
 */
export function defineCatalogue(registry: CustomElementRegistry = customElements): Map<ElementName, CatalogueElementClass> {
  const classes = new Map<ElementName, CatalogueElementClass>();

  for (const name of ELEMENT_NAMES) {
    const existing = registry.get(name) as CatalogueElementClass | undefined;

    if (existing) {
      classes.set(name, existing);
      continue;
    }

    const made = classFor(name);

    registry.define(name, made);
    classes.set(name, made);
  }

  return classes;
}
