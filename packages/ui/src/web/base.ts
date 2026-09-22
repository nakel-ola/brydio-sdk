/// <reference lib="dom" />
import { LitElement, css, html, nothing, svg, unsafeCSS, type CSSResult, type PropertyDeclaration, type TemplateResult } from 'lit';

/**
 * The one file that imports Lit (A6-F06-S02).
 *
 * Every web component in this package extends `BryElement` and takes `html`,
 * `css` and `nothing` from here, never from `lit` itself, so replacing Lit is a
 * change to this file and a rebuild. `test/web.test.ts` fails if any other file
 * imports it.
 */

export { css, html, nothing, svg, unsafeCSS };
export type { CSSResult, PropertyDeclaration, TemplateResult };

export abstract class BryElement extends LitElement {
  /**
   * Tells the page what happened, under the same name the React catalogue's
   * event has (`press`, `change`, …). It bubbles and leaves the shadow root, so
   * a listener on the element or on any ancestor hears it.
   */
  emit(name: string, detail?: unknown): boolean {
    return this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /** Declares one reactive setting on a class made at run time. */
  static setting(name: string, options: PropertyDeclaration): void {
    this.createProperty(name, options);
  }
}
