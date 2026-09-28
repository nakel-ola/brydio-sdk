/// <reference lib="dom" />
import { CATALOGUE, ELEMENT_NAMES, type ElementName, type ElementSpec, type PropSpec } from '../catalogue.ts';
import { BryElement, css, html, nothing, type CSSResult, type PropertyDeclaration, type TemplateResult } from './base.ts';

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

const DRAW: Partial<Record<ElementName, { draw: Draw; styles: CSSResult[] }>> = {};

/** What every element starts from: the page's own font, and nothing that leaks out. */
const HOST = css`
  :host {
    font: inherit;
    color: var(--fg);
    box-sizing: border-box;
  }
  :host([hidden]) {
    display: none;
  }
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }
`;

/**
 * Gives an element its drawing and its styles. Called before the catalogue is
 * registered (`index.ts` imports the drawings first), since an element's
 * styles are fixed when its class is made.
 */
export function drawAs(name: ElementName, draw: Draw, styles: CSSResult[] = []): void {
  DRAW[name] = { draw, styles };
}

/**
 * Setting names Lit's own element already uses for its lifecycle:
 * `bry-work-card`'s `updated` is one. A setting declared the ordinary way
 * would put its value where Lit calls a method, and stop the element drawing.
 */
const LIFECYCLE = new Set([
  'update',
  'updated',
  'render',
  'firstUpdated',
  'willUpdate',
  'shouldUpdate',
  'requestUpdate',
  'performUpdate',
  'scheduleUpdate',
  'getUpdateComplete',
  'updateComplete',
  'hasUpdated',
  'isUpdatePending',
  'createRenderRoot',
  'renderRoot',
  'renderOptions',
  'connectedCallback',
  'disconnectedCallback',
  'attributeChangedCallback',
  'emit',
]);

/** The values of settings named like a lifecycle member, kept beside the element. */
const shadowed = new WeakMap<object, Record<string, unknown>>();

/**
 * A setting's value. The same as `element[name]`, except for a setting named
 * like one of Lit's lifecycle members, whose property stays Lit's: its value
 * is set through the property or the attribute as usual, and read here.
 */
export function settingOf(element: object, name: string): unknown {
  return LIFECYCLE.has(name) ? shadowed.get(element)?.[name] : (element as Record<string, unknown>)[name];
}

/**
 * Declares a setting whose name Lit's lifecycle takes: setting it stores the
 * value and draws again; reading it still answers Lit's own member.
 */
function lifecycleSetting(made: typeof BryElement, setting: string, options: PropertyDeclaration): void {
  const own = (made.prototype as unknown as Record<string, unknown>)[setting];

  made.setting(setting, { ...options, noAccessor: true });
  Object.defineProperty(made.prototype, setting, {
    configurable: true,
    get() {
      return own;
    },
    set(this: BryElement, value: unknown) {
      const values = shadowed.get(this) ?? {};
      const old = values[setting];

      values[setting] = value;
      shadowed.set(this, values);
      this.requestUpdate(setting, old);
    },
  });
}

function classFor(name: ElementName): CatalogueElementClass {
  const spec = CATALOGUE[name] as ElementSpec;

  const made = class extends BryElement {
    static readonly element = name;
    static readonly spec = spec;
    static readonly events = spec.events;
    static override styles = [HOST, ...(DRAW[name]?.styles ?? [])];

    override render() {
      const drawing = DRAW[name];

      if (drawing) return drawing.draw(this as unknown as BryElement & Record<string, unknown>);

      return spec.children ? html`<slot></slot>` : nothing;
    }
  };

  for (const [setting, propSpec] of Object.entries(spec.props)) {
    if (LIFECYCLE.has(setting)) lifecycleSetting(made, setting, declarationOf(setting, propSpec));
    else made.setting(setting, declarationOf(setting, propSpec));
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
