/// <reference lib="dom" />
import { css, html, nothing, type TemplateResult } from '../base.ts';
import { drawAs } from '../define.ts';
import { FIELD_B, focusIn, keptOf, listOf, QUIET, rtlOf, type El } from './catalogue-b-shared.ts';
import { nextActive } from './overlays.ts';
import { FOCUS, str, TYPE } from './tokens.ts';

/**
 * ADR-A23 (catalogue-b): command, context menu, menubar and section menu, as
 * Brydio's React catalogue draws them on Radix and cmdk. None of them is a
 * link or the app's navigation (ADR-A13): every item raises `select` to the
 * app, which decides what it does in its own screen.
 */

interface Item {
  id: string;
  label: string;
  icon?: string;
  tone?: string;
  separator?: boolean;
  disabled?: boolean;
}

interface Command extends Item {
  group?: string;
  hint?: string;
}

interface Menu {
  id: string;
  label: string;
  items: Item[];
}

interface Section {
  id: string;
  label: string;
  entries?: { id: string; label: string; description?: string; disabled?: boolean }[];
  disabled?: boolean;
}

const MENU_LOOK = css`
  .popup {
    position: absolute;
    z-index: 50;
    min-width: 10rem;
    max-height: 18rem;
    overflow-y: auto;
    padding: 0.25rem;
    border: 1px solid var(--line);
    border-radius: var(--menu-radius);
    background: var(--popover);
    color: var(--popover-foreground);
    box-shadow: var(--shadow-pop);
  }
  [role='menuitem'].item,
  [role='option'] {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    border: 0;
    border-radius: var(--menu-item-radius);
    background: transparent;
    padding: 0.375rem 0.5rem;
    font: inherit;
    font-size: 0.8125rem;
    color: inherit;
    text-align: start;
    cursor: pointer;
  }
  [data-active] {
    background: var(--layer-hover);
  }
  [aria-disabled='true'] {
    pointer-events: none;
    opacity: 0.5;
  }
  [data-tone='danger'] {
    color: var(--danger-fg);
  }
  .separator {
    height: 1px;
    margin: 0.25rem -0.25rem;
    background: var(--line);
  }
`;

/** One menu's items, drawn the way `bry-menu`'s are. */
function menuItems(items: Item[], active: number, choose: (item: Item) => void, hover: (at: number) => void): TemplateResult[] {
  return items.map(
    (item, index) => html`${item.separator && index > 0 ? html`<div class="separator" role="separator"></div>` : nothing}
      <button
        type="button"
        class="item"
        role="menuitem"
        tabindex="-1"
        data-item=${item.id}
        data-tone=${item.tone === 'danger' ? 'danger' : nothing}
        data-active=${index === active ? '' : nothing}
        aria-disabled=${item.disabled === true ? 'true' : nothing}
        @click=${() => choose(item)}
        @mousemove=${() => hover(index)}
      >
        ${item.label}
      </button>`,
  );
}

drawAs(
  'bry-command',
  element => {
    const items = listOf<Command>(element.items);
    const state = keptOf(element, () => ({ query: '', active: 0 }));
    const matching = items.filter(item => item.label.toLowerCase().includes(state.query.toLowerCase()));
    const groups: [string, Command[]][] = [];

    for (const item of matching) {
      const name = item.group ?? '';
      const found = groups.find(([group]) => group === name);

      if (found) found[1].push(item);
      else groups.push([name, [item]]);
    }

    const ordered = groups.flatMap(([, members]) => members);
    const active = Math.min(state.active, ordered.length - 1);
    const choose = (item: Command | undefined) => {
      if (!item || item.disabled === true) return;
      element.emit('select', { id: item.id });
    };

    if (element.loading === true) {
      return html`<div class="command" role="status" aria-label="Loading">
        <div class="bone"></div><div class="bone"></div><div class="bone"></div>
      </div>`;
    }

    return html`<div class="command">
      <input
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="list"
        aria-autocomplete="list"
        aria-label=${str(element.label) || str(element.placeholder) || 'Search'}
        placeholder=${str(element.placeholder) || nothing}
        aria-activedescendant=${ordered[active] ? `command-${ordered[active]!.id}` : nothing}
        .value=${state.query}
        @input=${(event: Event) => {
          const value = (event.currentTarget as HTMLInputElement).value;

          state.query = value;
          state.active = 0;
          element.emit('change', { value });
          element.requestUpdate();
        }}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === ' ' || event.key === 'Escape') return;

          const answer = nextActive(event.key, ordered, active, '');

          if (answer === null || answer === 'close') return;

          event.preventDefault();
          if (answer === 'choose') return choose(ordered[active]);

          state.active = answer.active;
          element.requestUpdate();
        }}
      />
      <div id="list" role="listbox" aria-label=${str(element.label) || nothing}>
        ${ordered.length === 0
          ? html`<p class="empty type-ui" data-empty>${str(element.empty) || 'No results.'}</p>`
          : groups.map(
              ([group, members]) => html`<div role="group" aria-label=${group || nothing}>
                ${group ? html`<p class="heading type-caption" aria-hidden="true">${group}</p>` : nothing}
                ${members.map(
                  item => html`<div
                    id="command-${item.id}"
                    role="option"
                    data-item=${item.id}
                    aria-selected=${ordered[active] === item ? 'true' : 'false'}
                    aria-disabled=${item.disabled === true ? 'true' : nothing}
                    data-active=${ordered[active] === item ? '' : nothing}
                    @mousedown=${(event: Event) => event.preventDefault()}
                    @click=${() => choose(item)}
                  >
                    <span class="label">${item.label}</span>
                    ${item.hint ? html`<span class="hint type-caption">${item.hint}</span>` : nothing}
                  </div>`,
                )}
              </div>`,
            )}
      </div>
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    MENU_LOOK,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .command {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: var(--menu-radius);
        background: var(--popover);
        color: var(--popover-foreground);
      }
      input {
        height: 2.25rem;
        border: 0;
        border-bottom: 1px solid var(--line);
        background: transparent;
        padding: 0 0.75rem;
        font: inherit;
        font-size: 0.8125rem;
        color: var(--fg);
        outline: none;
      }
      input:focus-visible {
        box-shadow: inset 0 0 0 2px var(--brand-ring);
      }
      [role='listbox'] {
        max-height: 18rem;
        overflow-y: auto;
        padding: 0.25rem;
      }
      .heading {
        padding: 0.375rem 0.5rem;
      }
      .label {
        flex: 1;
      }
      .empty {
        padding: 1.5rem 0;
        text-align: center;
      }
      .bone {
        height: 0.75rem;
        margin: 0.5rem;
        border-radius: var(--radius-md);
        background: var(--layer-hover);
      }
    `,
  ],
);

drawAs(
  'bry-context-menu',
  element => {
    const items = listOf<Item>(element.items);
    const state = keptOf(element, () => ({ open: false, active: -1, x: 0, y: 0 }));
    const shut = () => {
      state.open = false;
      state.active = -1;
      element.requestUpdate();
      queueMicrotask(() => (element.querySelector('button, [tabindex], bry-button, bry-card') as HTMLElement | null)?.focus());
    };
    const open = (x: number, y: number) => {
      state.open = true;
      state.active = items.findIndex(item => item.disabled !== true);
      state.x = x;
      state.y = y;
      element.requestUpdate();
      focusIn(element as El, '[data-active]');
    };

    return html`<div
      class="anchor"
      @contextmenu=${(event: MouseEvent) => {
        event.preventDefault();
        const box = element.getBoundingClientRect();

        open(event.clientX - box.left, event.clientY - box.top);
      }}
      @keydown=${(event: KeyboardEvent) => {
        if (!state.open) {
          if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
          event.preventDefault();
          open(0, 0);

          return;
        }

        const answer = nextActive(event.key, items, state.active, '');

        if (answer === null) return;

        event.preventDefault();
        if (answer === 'close') return shut();
        if (answer === 'choose') {
          const item = items[state.active];

          if (item && item.disabled !== true) element.emit('select', { id: item.id });

          return shut();
        }

        state.active = answer.active;
        element.requestUpdate();
        focusIn(element as El, '[data-active]');
      }}
      @focusout=${(event: FocusEvent) => {
        if (state.open && !element.shadowRoot?.contains(event.relatedTarget as Node) && !element.contains(event.relatedTarget as Node)) {
          state.open = false;
          element.requestUpdate();
        }
      }}
    >
      <slot></slot>
      ${state.open
        ? html`<div class="popup" role="menu" style="inset-inline-start: ${state.x}px; top: ${state.y}px">
            ${menuItems(
              items,
              state.active,
              item => {
                if (item.disabled === true) return;
                element.emit('select', { id: item.id });
                shut();
              },
              at => {
                if (state.active === at) return;
                state.active = at;
                element.requestUpdate();
              },
            )}
          </div>`
        : nothing}
    </div>`;
  },
  [
    FOCUS,
    MENU_LOOK,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .anchor {
        position: relative;
      }
    `,
  ],
);

drawAs(
  'bry-menubar',
  element => {
    const menus = listOf<Menu>(element.menus);
    const state = keptOf(element, () => ({ focus: 0, open: -1, active: -1 }));
    const focus = Math.min(state.focus, Math.max(0, menus.length - 1));
    const openMenu = (at: number) => {
      state.focus = at;
      state.open = at;
      state.active = listOf<Item>(menus[at]?.items).findIndex(item => item.disabled !== true);
      element.requestUpdate();
      focusIn(element as El, '.popup [data-active]');
    };
    const shut = () => {
      state.open = -1;
      state.active = -1;
      element.requestUpdate();
      focusIn(element as El, `[data-menu="${CSS.escape(menus[state.focus]?.id ?? '')}"]`);
    };
    const along = (by: number) => (focus + by + menus.length) % menus.length;

    return html`<div
      role="menubar"
      class="bar"
      aria-label=${str(element.label) || nothing}
      @keydown=${(event: KeyboardEvent) => {
        const rtl = rtlOf(element);
        const side = event.key === 'ArrowRight' ? (rtl ? -1 : 1) : event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;

        if (side !== 0) {
          event.preventDefault();
          if (state.open === -1) {
            state.focus = along(side);
            element.requestUpdate();
            focusIn(element as El, `[data-menu="${CSS.escape(menus[state.focus]!.id)}"]`);
          } else openMenu(along(side));

          return;
        }

        if (state.open === -1) {
          if (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openMenu(focus);

          return;
        }

        const items = listOf<Item>(menus[state.open]?.items);
        const answer = nextActive(event.key, items, state.active, '');

        if (answer === null) return;

        event.preventDefault();
        if (answer === 'close') return shut();
        if (answer === 'choose') {
          const item = items[state.active];

          if (item && item.disabled !== true) element.emit('select', { menu: menus[state.open]!.id, id: item.id });

          return shut();
        }

        state.active = answer.active;
        element.requestUpdate();
        focusIn(element as El, '.popup [data-active]');
      }}
      @focusout=${(event: FocusEvent) => {
        if (state.open !== -1 && !element.shadowRoot?.contains(event.relatedTarget as Node)) {
          state.open = -1;
          element.requestUpdate();
        }
      }}
    >
      ${menus.map(
        (menu, at) => html`<div class="menu">
          <button
            type="button"
            role="menuitem"
            class="trigger"
            data-menu=${menu.id}
            aria-haspopup="menu"
            aria-expanded=${state.open === at ? 'true' : 'false'}
            tabindex=${at === focus ? '0' : '-1'}
            @focus=${() => void (state.focus = at)}
            @click=${() => (state.open === at ? shut() : openMenu(at))}
          >
            ${menu.label}
          </button>
          ${state.open === at
            ? html`<div class="popup" role="menu" aria-label=${menu.label}>
                ${menuItems(
                  listOf<Item>(menu.items),
                  state.active,
                  item => {
                    if (item.disabled === true) return;
                    element.emit('select', { menu: menu.id, id: item.id });
                    shut();
                  },
                  index => {
                    if (state.active === index) return;
                    state.active = index;
                    element.requestUpdate();
                  },
                )}
              </div>`
            : nothing}
        </div>`,
      )}
    </div>`;
  },
  [
    FOCUS,
    MENU_LOOK,
    css`
      :host {
        display: block;
      }
      .bar {
        display: flex;
        height: var(--control-h);
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: var(--bg-surface);
      }
      .menu {
        position: relative;
      }
      .trigger {
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        padding: 0.125rem 0.5rem;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--fg);
        cursor: pointer;
      }
      .trigger:hover,
      .trigger[aria-expanded='true'] {
        background: var(--layer-hover);
      }
      .popup {
        inset-inline-start: 0;
        margin-top: 0.5rem;
      }
    `,
  ],
);

drawAs(
  'bry-section-menu',
  element => {
    const sections = listOf<Section>(element.sections);
    const current = str(element.current);
    const state = keptOf(element, () => ({ open: '' }));
    const choose = (id: string) => {
      state.open = '';
      element.emit('select', { id });
      element.requestUpdate();
    };

    // A group of buttons, not a navigation landmark: these are sections of this screen (ADR-A13).
    return html`<div
      role="group"
      class="bar"
      aria-label=${str(element.label) || nothing}
      @keydown=${(event: KeyboardEvent) => {
        if (event.key === 'Escape' && state.open) {
          const open = state.open;

          state.open = '';
          element.requestUpdate();
          focusIn(element as El, `[data-section="${CSS.escape(open)}"]`);
        }
      }}
      @focusout=${(event: FocusEvent) => {
        if (state.open && !element.shadowRoot?.contains(event.relatedTarget as Node)) {
          state.open = '';
          element.requestUpdate();
        }
      }}
    >
      <ul>
        ${sections.map(section => {
          const entries = listOf<NonNullable<Section['entries']>[number]>(section.entries);
          const here = section.id === current || entries.some(entry => entry.id === current);

          return html`<li class="section">
            <button
              type="button"
              class="quiet"
              data-section=${section.id}
              aria-current=${here ? 'true' : nothing}
              aria-expanded=${entries.length ? (state.open === section.id ? 'true' : 'false') : nothing}
              ?disabled=${section.disabled === true}
              @click=${() => {
                if (!entries.length) return choose(section.id);

                state.open = state.open === section.id ? '' : section.id;
                element.requestUpdate();
                if (state.open) focusIn(element as El, '.panel button:not([disabled])');
              }}
            >
              ${section.label}
            </button>
            ${entries.length && state.open === section.id
              ? html`<div class="panel">
                  ${entries.map(
                    entry => html`<button
                      type="button"
                      class="entry"
                      data-entry=${entry.id}
                      aria-current=${entry.id === current ? 'true' : nothing}
                      ?disabled=${entry.disabled === true}
                      @click=${() => choose(entry.id)}
                    >
                      <span class="type-label">${entry.label}</span>
                      ${entry.description ? html`<span class="type-caption">${entry.description}</span>` : nothing}
                    </button>`,
                  )}
                </div>`
              : nothing}
          </li>`;
        })}
      </ul>
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    FIELD_B,
    QUIET,
    css`
      ul {
        display: flex;
        gap: 0.25rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .section {
        position: relative;
      }
      .quiet[aria-current='true'] {
        background: var(--bg-fill);
        color: var(--fg-strong);
      }
      .panel {
        position: absolute;
        z-index: 50;
        inset-inline-start: 0;
        margin-top: 0.375rem;
        display: grid;
        min-width: 16rem;
        gap: 0.125rem;
        padding: 0.5rem;
        border: 1px solid var(--line);
        border-radius: var(--menu-radius);
        background: var(--popover);
        box-shadow: var(--shadow-pop);
      }
      .entry {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        border: 0;
        border-radius: var(--menu-item-radius);
        background: transparent;
        padding: 0.5rem;
        text-align: start;
        cursor: pointer;
      }
      .entry:hover,
      .entry[aria-current='true'] {
        background: var(--layer-hover);
      }
      .entry:disabled {
        opacity: 0.5;
        pointer-events: none;
      }
    `,
  ],
);
