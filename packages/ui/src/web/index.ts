/// <reference lib="dom" />
/**
 * `@brydio/ui/web`: Brydio's catalogue as standard web components, for HTML
 * views (A6-F06). Link it and write `<bry-button label="Save">`; nothing else
 * is needed. App screens don't use this: Brydio draws them with its own kit.
 */

// The drawings go first: an element's styles are fixed when its class is made.
import './draw/basics.ts';
import './draw/layout.ts';
import { defineCatalogue } from './define.ts';

export { BryElement } from './base.ts';
export { attributeOf, declarationOf, defineCatalogue, drawAs, type CatalogueElementClass, type Draw } from './define.ts';

if (typeof customElements !== 'undefined') defineCatalogue();
