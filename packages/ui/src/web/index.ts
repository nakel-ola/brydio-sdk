/// <reference lib="dom" />
/**
 * `@brydio/ui/web`: Brydio's catalogue as standard web components, for HTML
 * views (A6-F06). Link it and write `<bry-button label="Save">`; nothing else
 * is needed. App screens don't use this: Brydio draws them with its own kit.
 */

// The drawings go first: an element's styles are fixed when its class is made.
import './draw/basics.ts';
import './draw/layout.ts';
import './draw/controls.ts';
import './draw/overlays.ts';
import './draw/text-and-date.ts';
import './draw/split.ts';
import './draw/board.ts';
import './draw/virtual-list.ts';
import './draw/diff.ts';
import './draw/table.ts';
import './draw/file-grid.ts';
// ADR-A23 (catalogue-b)
import './draw/catalogue-b-controls.ts';
import './draw/catalogue-b-menus.ts';
import './draw/calendar.ts';
import './draw/data-table.ts';
import './draw/questionnaire.ts';
// ADR-A23 (catalogue-a)
import './draw/a23-content.ts';
import './draw/a23-layout.ts';
import './draw/a23-overlays.ts';
import { defineCatalogue } from './define.ts';

export { BryElement } from './base.ts';
export { attributeOf, declarationOf, defineCatalogue, drawAs, type CatalogueElementClass, type Draw } from './define.ts';

if (typeof customElements !== 'undefined') defineCatalogue();
