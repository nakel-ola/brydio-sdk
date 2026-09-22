/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { initials } from './layout.ts';
import { FOCUS, pick, str, TYPE } from './tokens.ts';

/**
 * Dialog, menu and select: the three the shell draws with Radix, which has no
 * web-component form (A6-F06's note). Each keeps the behaviour the kit's
 * version has and an app can't turn off — a modal that traps focus and closes
 * on Escape, a menu and a list with the arrows, Home, End, type-ahead and the
 * focus going back where it came from — and says the same words on a refusal.
 */

type Element = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean; requestUpdate(): void };

interface Action {
  id: string;
  label: string;
  tone?: string;
  disabled?: boolean;
}

interface Item extends Action {
  icon?: string;
  separator?: boolean;
}

interface Choice {
  value: string;
  label: string;
  avatar?: string;
}

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Said to the app when its second dialog asks to open: the host's own sentence. */
export const ONE_DIALOG = 'Another dialog from this app is already open. Close it first.';

/**
 * The one dialog a page shows at a time, as the shell's single slot does. A
 * dialog taken off the page gives the slot up: an app that removes one while
 * it is open would otherwise keep every later dialog out.
 */
let holder: Element | null = null;

const holds = (element: Element) => holder === element;
const free = () => holder === null || !holder.isConnected;

/** What each dialog has been told and what the person has done with it since. */
const dialogs = new WeakMap<object, { seen: boolean; dismissed: boolean }>();

const POPUP = css`
  .popup {
    position: absolute;
    z-index: 50;
    inset-inline-end: 0;
    margin-top: 0.25rem;
    min-width: 8rem;
    max-height: 18rem;
    overflow-y: auto;
    padding: 0.25rem;
    border: 1px solid var(--line);
    border-radius: var(--menu-radius);
    background: var(--popover);
    color: var(--popover-foreground);
    box-shadow: var(--shadow-pop);
  }
  [role='menuitem'],
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
  [role='menuitem'][data-active],
  [role='option'][data-active] {
    background: var(--layer-hover);
  }
  [role='menuitem'][aria-disabled='true'],
  [role='option'][aria-disabled='true'] {
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

/**
 * The keyboard every popup list answers, whatever it holds: the arrows, Home
 * and End, typing to find, and Escape to close. Answers with the row to make
 * active, or `null` for none of its business.
 */
export function nextActive(
  key: string,
  rows: readonly { label: string; disabled?: boolean }[],
  active: number,
  typed: string,
): { active: number } | 'close' | 'choose' | null {
  const usable = rows.map((row, index) => ({ index, row })).filter(({ row }) => row.disabled !== true);

  if (usable.length === 0) return key === 'Escape' ? 'close' : null;

  const at = usable.findIndex(({ index }) => index === active);
  const step = (by: number) => ({ active: usable[(((at === -1 ? 0 : at) + by) % usable.length + usable.length) % usable.length]!.index });

  switch (key) {
    case 'ArrowDown':
      return at === -1 ? { active: usable[0]!.index } : step(1);
    case 'ArrowUp':
      return at === -1 ? { active: usable[usable.length - 1]!.index } : step(-1);
    case 'Home':
      return { active: usable[0]!.index };
    case 'End':
      return { active: usable[usable.length - 1]!.index };
    case 'Escape':
      return 'close';
    case 'Enter':
    case ' ':
      return 'choose';
    default: {
      // Typing finds the next row that starts with what has been typed.
      if (key.length !== 1 || typed === '') return null;

      const from = usable.findIndex(({ index }) => index > active && rows[index]!.label.toLowerCase().startsWith(typed));
      const found = from === -1 ? usable.find(({ index }) => rows[index]!.label.toLowerCase().startsWith(typed)) : usable[from];

      return found ? { active: found.index } : null;
    }
  }
}

/** What a popup keeps while it is open: which row is active and what has been typed. */
const popups = new WeakMap<object, { open: boolean; active: number; typed: string; typedAt: number }>();

function stateOf(element: Element) {
  let state = popups.get(element);

  if (!state) {
    state = { open: false, active: -1, typed: '', typedAt: 0 };
    popups.set(element, state);
  }

  return state;
}

/** What was typed within a second, as a word to search with. */
function typing(state: { typed: string; typedAt: number }, key: string): string {
  const now = Date.now();

  state.typed = now - state.typedAt < 1_000 ? state.typed + key.toLowerCase() : key.toLowerCase();
  state.typedAt = now;

  return state.typed;
}

const DIALOG_VARIANT = { default: 'secondary', primary: 'primary', danger: 'danger' } as const;

drawAs(
  'bry-dialog',
  element => {
    const wanted = element.open === true;
    let state = dialogs.get(element);

    if (!state) {
      state = { seen: wanted, dismissed: false };
      dialogs.set(element, state);
    }
    if (state.seen !== wanted) {
      state.seen = wanted;
      // The app closing its dialog forgets that the person dismissed it, so
      // the next open shows it again.
      if (!wanted) {
        state.dismissed = false;
        if (holds(element)) holder = null;
      }
    }

    const asking = wanted && !state.dismissed;

    if (asking && free()) holder = element;
    if (asking && !holds(element)) {
      // Asked once per opening: a refused dialog waits for the app to ask again.
      state.dismissed = true;
      queueMicrotask(() => element.emit('close', { refused: ONE_DIALOG }));

      return nothing;
    }
    if (!asking) return nothing;

    const dismiss = () => {
      state.dismissed = true;
      if (holds(element)) holder = null;
      element.emit('close');
      element.requestUpdate();
    };
    // The shell's destructive confirmation: whatever destroys goes last.
    const actions = list<Action>(element.actions)
      .slice()
      .sort((a, b) => Number(a.tone === 'danger') - Number(b.tone === 'danger'));
    const description = str(element.description);

    return html`<dialog
      aria-labelledby="title"
      aria-describedby="description"
      @close=${dismiss}
      @cancel=${dismiss}
      @click=${(event: MouseEvent) => {
        // The backdrop: a press outside the panel closes, as the kit's does.
        if (event.composedPath()[0] === event.currentTarget) dismiss();
      }}
    >
      <div class="panel">
        <div class="head">
          <h2 id="title" class="type-heading">${str(element.title)}</h2>
          <p id="description" class="type-body ${description ? '' : 'unseen'}">${description || str(element.title)}</p>
        </div>
        <slot></slot>
        <div class="foot">
          <button type="button" class="ghost" data-action="cancel" @click=${dismiss}>${str(element.cancel) || 'Cancel'}</button>
          ${actions.map(
            action => html`<button
              type="button"
              class=${DIALOG_VARIANT[(action.tone ?? 'default') as keyof typeof DIALOG_VARIANT] ?? 'secondary'}
              data-action=${action.id}
              ?disabled=${action.disabled === true}
              @click=${() => element.emit('action', { id: action.id })}
            >
              ${action.label}
            </button>`,
          )}
        </div>
      </div>
    </dialog>`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: contents;
      }
      dialog {
        margin: auto;
        max-width: min(32rem, calc(100vw - 2rem));
        padding: 0;
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background: var(--popover);
        color: var(--popover-foreground);
        box-shadow: var(--shadow-modal);
      }
      dialog::backdrop {
        background: var(--bg-overlay);
      }
      .panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.5rem;
      }
      .head {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .foot {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .unseen {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      button {
        height: var(--control-h);
        padding: 0 0.75rem;
        border: 0;
        border-radius: var(--radius-lg);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
      }
      button:disabled {
        pointer-events: none;
        opacity: 0.45;
      }
      .ghost {
        background: transparent;
        color: var(--fg-soft);
      }
      .ghost:hover {
        background: var(--layer-hover);
      }
      .secondary {
        background: var(--bg-fill);
        color: var(--fg-strong);
      }
      .primary {
        background: var(--brand);
        color: var(--brand-on);
      }
      .danger {
        background: var(--danger);
        color: var(--fg-on-solid);
      }
    `,
  ],
);

drawAs(
  'bry-menu',
  element => {
    const state = stateOf(element);
    const items = list<Item>(element.items);
    const shut = (toTrigger = true) => {
      state.open = false;
      state.active = -1;
      element.requestUpdate();
      if (toTrigger) queueMicrotask(() => (element.querySelector('button, [tabindex]') as HTMLElement | null)?.focus());
    };
    const choose = (item: Item | undefined) => {
      if (!item || item.disabled === true) return;

      element.emit('select', { id: item.id });
      shut();
    };
    const open = () => {
      state.open = true;
      state.active = items.findIndex(item => item.disabled !== true);
      element.requestUpdate();
      queueMicrotask(() => (element.shadowRoot?.querySelector('[data-active]') as HTMLElement | null)?.focus());
    };

    return html`<div
      class="anchor"
      @click=${(event: MouseEvent) => {
        if (state.open || (event.composedPath()[0] as Element)?.closest?.('.popup')) return;
        open();
      }}
      @keydown=${(event: KeyboardEvent) => {
        if (!state.open) {
          if (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          open();

          return;
        }

        const answer = nextActive(event.key, items, state.active, event.key.length === 1 ? typing(state, event.key) : '');

        if (answer === null) return;

        event.preventDefault();
        if (answer === 'close') return shut();
        if (answer === 'choose') return choose(items[state.active]);

        state.active = answer.active;
        element.requestUpdate();
        queueMicrotask(() => (element.shadowRoot?.querySelector('[data-active]') as HTMLElement | null)?.focus());
      }}
      @focusout=${(event: FocusEvent) => {
        if (!state.open) return;
        // Tab out, or a press elsewhere: the menu shuts without taking focus back.
        if (!event.relatedTarget || !element.contains(event.relatedTarget as Node)) {
          if (!element.shadowRoot?.contains(event.relatedTarget as Node)) shut(false);
        }
      }}
    >
      <slot></slot>
      ${state.open
        ? html`<div class="popup" role="menu">
            ${items.map(
              (item, index) => html`${item.separator && index > 0 ? html`<div class="separator" role="separator"></div>` : nothing}
                <button
                  type="button"
                  role="menuitem"
                  tabindex="-1"
                  data-item=${item.id}
                  data-tone=${item.tone === 'danger' ? 'danger' : nothing}
                  data-active=${index === state.active ? '' : nothing}
                  aria-disabled=${item.disabled === true ? 'true' : nothing}
                  @click=${() => choose(item)}
                  @mousemove=${() => {
                    if (state.active === index) return;
                    state.active = index;
                    element.requestUpdate();
                  }}
                >
                  ${item.label}
                </button>`,
            )}
          </div>`
        : nothing}
    </div>`;
  },
  [
    FOCUS,
    POPUP,
    css`
      :host {
        display: inline-flex;
        min-width: 0;
      }
      .anchor {
        position: relative;
        display: inline-flex;
        min-width: 0;
      }
    `,
  ],
);

const SELECT_SIZES = ['sm', 'md'] as const;

drawAs(
  'bry-select',
  element => {
    const state = stateOf(element);
    const options = list<Choice>(element.options);
    const value = str(element.value);
    // A value the options don't hold shows the placeholder, not a blank.
    const shown = options.find(choice => choice.value === value);
    const invalid = Boolean(str(element.error));
    const size = pick(SELECT_SIZES, element.size) ?? 'md';
    const rows = options.map(choice => ({ label: choice.label }));
    const shut = () => {
      state.open = false;
      element.requestUpdate();
      queueMicrotask(() => (element.shadowRoot?.querySelector('[role=combobox]') as HTMLElement | null)?.focus());
    };
    const choose = (choice: Choice | undefined) => {
      if (!choice) return;
      if (choice.value !== (shown?.value ?? '')) element.emit('change', { value: choice.value });
      shut();
    };
    const open = () => {
      if (element.disabled === true) return;

      state.open = true;
      state.active = Math.max(0, options.findIndex(choice => choice.value === shown?.value));
      element.requestUpdate();
      queueMicrotask(() => (element.shadowRoot?.querySelector('[data-active]') as HTMLElement | null)?.focus());
    };

    return html`<div class="field">
      <div class="anchor">
        <button
          type="button"
          role="combobox"
          class=${size}
          aria-haspopup="listbox"
          aria-expanded=${state.open ? 'true' : 'false'}
          aria-label=${str(element.label) || nothing}
          aria-invalid=${invalid ? 'true' : nothing}
          aria-describedby=${invalid ? 'error' : nothing}
          ?disabled=${element.disabled === true}
          @click=${() => (state.open ? shut() : open())}
          @keydown=${(event: KeyboardEvent) => {
            if (state.open || (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            open();
          }}
        >
          <span class=${shown ? 'value' : 'placeholder'}>${shown ? shown.label : str(element.placeholder)}</span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
        ${state.open
          ? html`<div
              class="popup"
              role="listbox"
              aria-label=${str(element.label) || nothing}
              @keydown=${(event: KeyboardEvent) => {
                const answer = nextActive(event.key, rows, state.active, event.key.length === 1 ? typing(state, event.key) : '');

                if (answer === null) return;

                event.preventDefault();
                if (answer === 'close') return shut();
                if (answer === 'choose') return choose(options[state.active]);

                state.active = answer.active;
                element.requestUpdate();
                queueMicrotask(() => (element.shadowRoot?.querySelector('[data-active]') as HTMLElement | null)?.focus());
              }}
              @focusout=${(event: FocusEvent) => {
                if (state.open && !element.shadowRoot?.contains(event.relatedTarget as Node)) {
                  state.open = false;
                  element.requestUpdate();
                }
              }}
            >
              ${options.map(
                (choice, index) => html`<button
                  type="button"
                  role="option"
                  tabindex="-1"
                  data-value=${choice.value}
                  data-active=${index === state.active ? '' : nothing}
                  aria-selected=${choice.value === shown?.value ? 'true' : 'false'}
                  @click=${() => choose(choice)}
                >
                  ${choice.avatar
                    ? html`<span class="avatar" data-avatar=${choice.avatar} aria-hidden="true">${initials(choice.label)}</span>`
                    : nothing}
                  ${choice.label}
                </button>`,
              )}
            </div>`
          : nothing}
      </div>
      ${invalid ? html`<p id="error" class="type-caption error">${str(element.error)}</p>` : nothing}
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    POPUP,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .field {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.25rem;
      }
      .anchor {
        position: relative;
        display: block;
        min-width: 0;
      }
      [role='combobox'] {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        border: 1px solid var(--line-input);
        border-radius: var(--field-radius);
        background: var(--bg-surface);
        padding: 0 var(--field-px);
        font: inherit;
        font-size: 0.8125rem;
        color: var(--fg);
        cursor: pointer;
      }
      .md {
        height: var(--field-h);
      }
      .sm {
        height: var(--control-h-sm);
      }
      [role='combobox']:disabled {
        pointer-events: none;
        background: var(--bg-fill);
        color: var(--fg-muted);
      }
      [aria-invalid='true'] {
        border-color: var(--danger);
      }
      .placeholder {
        color: var(--fg-placeholder);
      }
      .chevron {
        width: 0.5rem;
        height: 0.5rem;
        flex-shrink: 0;
        border: solid var(--fg-muted);
        border-width: 0 1.5px 1.5px 0;
        transform: translateY(-2px) rotate(45deg);
      }
      .popup {
        inset-inline: 0;
      }
      .avatar {
        display: inline-flex;
        width: 1.5rem;
        height: 1.5rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border-radius: 9999px;
        background: var(--muted);
        color: var(--fg-muted);
        font-size: 0.75rem;
      }
      .error {
        color: var(--danger-fg);
      }
    `,
  ],
);

// ADR-A23 (catalogue-a)
/**
 * The one dialog slot, for the other modals (an alert dialog, a drawer, a
 * sheet), which share it with `bry-dialog` as they do in the shell.
 */
export const dialogSlot = {
  /** Takes the slot for `element`. False when another modal holds it. */
  claim(element: Element): boolean {
    if (free()) holder = element;

    return holds(element);
  },
  release(element: Element): void {
    if (holds(element)) holder = null;
  },
};
