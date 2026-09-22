/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { FOCUS, pick, str, TYPE } from './tokens.ts';

/**
 * ADR-A23 (catalogue-a): the shadcn elements that arrange their children,
 * drawn as Brydio's React catalogue draws them. Where the n-th child belongs
 * to the n-th section or tab, each child is given a named slot here.
 */

type Element = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean; requestUpdate(): void };

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Puts the n-th child in the slot `p<n>`, and says how many there are. */
function slotChildren(element: Element): number {
  const children = Array.from(element.children);

  children.forEach((child, index) => child.setAttribute('slot', `p${index}`));

  return children.length;
}

const rtl = (element: Element) => getComputedStyle(element).direction === 'rtl';

const chevron = html`<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"></path></svg>`;

/** What the person has chosen since the app last said otherwise, per element. */
const chosen = new WeakMap<object, { seen: string; value: unknown }>();

/** The app's value, until the person changes it; the app saying something new wins again. */
function held<T>(element: Element, said: T): { value: T; set(next: T): void } {
  const key = JSON.stringify(said ?? null);
  let state = chosen.get(element);

  if (!state || state.seen !== key) {
    state = { seen: key, value: said };
    chosen.set(element, state);
  }

  const current = state;

  return {
    value: current.value as T,
    set(next) {
      current.value = next;
      element.requestUpdate();
    },
  };
}

drawAs(
  'bry-accordion',
  element => {
    const sections = list<{ id: string; title: string; disabled?: boolean }>(element.sections);
    const multiple = element.multiple === true;
    const open = held(element, list<string>(element.expanded));

    slotChildren(element);

    const toggle = (id: string) => {
      const was = open.value.includes(id);
      const next = was ? open.value.filter(one => one !== id) : multiple ? [...open.value, id] : [id];

      open.set(next);
      element.emit('change', { expanded: next });
    };

    return html`${sections.map((section, index) => {
      const expanded = open.value.includes(section.id);

      return html`<div class="section" data-section=${section.id}>
        <h3>
          <button
            type="button"
            class="type-ui"
            aria-expanded=${expanded ? 'true' : 'false'}
            aria-controls="panel-${index}"
            ?disabled=${section.disabled === true}
            @click=${() => toggle(section.id)}
          >
            <span>${section.title}</span>${chevron}
          </button>
        </h3>
        <div id="panel-${index}" role="region" ?hidden=${!expanded}><slot name="p${index}"></slot></div>
      </div>`;
    })}`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: block;
      }
      .section {
        border-bottom: 1px solid var(--line-faint);
      }
      .section:last-child {
        border-bottom: 0;
      }
      h3 {
        margin: 0;
      }
      button {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.75rem 0;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--fg);
        text-align: start;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
        pointer-events: none;
      }
      button svg {
        color: var(--fg-muted);
        transition: transform var(--dur-fast);
      }
      button[aria-expanded='true'] svg {
        transform: rotate(180deg);
      }
      [role='region'] {
        padding-bottom: 1rem;
      }
      [hidden] {
        display: none;
      }
    `,
  ],
);

const RATIOS = ['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16'] as const;

drawAs(
  'bry-aspect-ratio',
  element => {
    const [wide, tall] = (pick(RATIOS, element.ratio) ?? '16:9').split(':');

    return html`<div style="aspect-ratio: ${wide} / ${tall}"><slot></slot></div>`;
  },
  [
    css`
      :host {
        display: block;
        width: 100%;
        min-width: 0;
      }
      div {
        width: 100%;
        overflow: hidden;
        border-radius: var(--radius-lg);
      }
      ::slotted(*) {
        width: 100%;
        height: 100%;
      }
    `,
  ],
);

drawAs(
  'bry-carousel',
  element => {
    const count = Math.min(slotChildren(element), 50);
    const index = held(element, typeof element.index === 'number' ? element.index : 0);
    const at = Math.min(Math.max(index.value, 0), Math.max(count - 1, 0));
    const go = (to: number) => {
      if (to < 0 || to >= count || to === at) return;
      index.set(to);
      element.emit('change', { index: to });
    };

    return html`<section
      aria-roledescription="carousel"
      aria-label=${str(element.label)}
      @keydown=${(event: KeyboardEvent) => {
        const back = rtl(element) ? 'ArrowRight' : 'ArrowLeft';
        const on = rtl(element) ? 'ArrowLeft' : 'ArrowRight';

        if (event.key === back) go(at - 1);
        else if (event.key === on) go(at + 1);
        else return;
        event.preventDefault();
      }}
    >
      <div class="track" aria-live="polite">
        ${Array.from(
          { length: count },
          (_, n) =>
            html`<div role="group" aria-roledescription="slide" aria-label="${n + 1} of ${count}" ?hidden=${n !== at}><slot name="p${n}"></slot></div>`,
        )}
      </div>
      ${count > 1
        ? html`<div class="controls">
            <button type="button" aria-label="Previous slide" ?disabled=${at === 0} @click=${() => go(at - 1)}>‹</button>
            <span class="type-caption">${at + 1} / ${count}</span>
            <button type="button" aria-label="Next slide" ?disabled=${at === count - 1} @click=${() => go(at + 1)}>›</button>
          </div>`
        : nothing}
    </section>`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      [hidden] {
        display: none;
      }
      .controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
      }
      button {
        width: var(--control-h-sm);
        height: var(--control-h-sm);
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        background: transparent;
        font: inherit;
        font-size: 1rem;
        color: var(--fg);
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.45;
        pointer-events: none;
      }
      :host(:dir(rtl)) button {
        transform: scaleX(-1);
      }
    `,
  ],
);

drawAs(
  'bry-collapsible',
  element => {
    const open = held(element, element.open === true);

    return html`<button
        type="button"
        class="type-ui"
        aria-expanded=${open.value ? 'true' : 'false'}
        aria-controls="content"
        @click=${() => {
          const next = !open.value;

          open.set(next);
          element.emit('change', { open: next });
        }}
      >
        ${chevron}${str(element.title)}
      </button>
      <div id="content" ?hidden=${!open.value}><slot></slot></div>`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.5rem;
      }
      button {
        display: inline-flex;
        width: fit-content;
        align-items: center;
        gap: 0.375rem;
        padding: 0.25rem 0;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--fg);
        cursor: pointer;
      }
      button svg {
        color: var(--fg-muted);
        transform: rotate(-90deg);
        transition: transform var(--dur-fast);
      }
      :host(:dir(rtl)) button svg {
        transform: rotate(90deg);
      }
      button[aria-expanded='true'] svg {
        transform: none;
      }
      [hidden] {
        display: none;
      }
      #content {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      #content[hidden] {
        display: none;
      }
    `,
  ],
);

drawAs(
  'bry-direction',
  element => {
    element.setAttribute('dir', element.dir === 'rtl' ? 'rtl' : 'ltr');

    return html`<slot></slot>`;
  },
  [
    css`
      :host {
        display: contents;
      }
    `,
  ],
);

const SCROLL = { sm: '12rem', md: '20rem', lg: '32rem' } as const;

drawAs(
  'bry-scroll-area',
  element =>
    html`<div role="region" tabindex="0" aria-label=${str(element.label)} style="max-height: ${SCROLL[pick(['sm', 'md', 'lg'] as const, element.size) ?? 'md']}">
      <slot></slot>
    </div>`,
  [
    FOCUS,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      div {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        overflow-y: auto;
        padding: 0.25rem;
        border-radius: var(--radius-md);
        scrollbar-width: thin;
      }
    `,
  ],
);

drawAs(
  'bry-tabs',
  element => {
    const tabs = list<{ id: string; label: string; disabled?: boolean }>(element.tabs);
    const value = held(element, str(element.value) || tabs[0]?.id || '');
    const variant = element.variant === 'line' ? 'line' : 'segmented';

    slotChildren(element);

    const choose = (id: string) => {
      if (id === value.value) return;
      value.set(id);
      element.emit('change', { id });
    };
    const key = (event: KeyboardEvent) => {
      const usable = tabs.filter(tab => tab.disabled !== true);
      const at = usable.findIndex(tab => tab.id === value.value);
      const forward = rtl(element) ? 'ArrowLeft' : 'ArrowRight';
      const back = rtl(element) ? 'ArrowRight' : 'ArrowLeft';
      const next =
        event.key === forward ? usable[(at + 1) % usable.length] : event.key === back ? usable[(at - 1 + usable.length) % usable.length] : event.key === 'Home' ? usable[0] : event.key === 'End' ? usable[usable.length - 1] : undefined;

      if (!next) return;
      event.preventDefault();
      choose(next.id);
      queueMicrotask(() => (element.shadowRoot?.querySelector(`[data-tab="${next.id}"]`) as HTMLElement | null)?.focus());
    };

    return html`<div role="tablist" class=${variant} aria-label=${str(element.label) || nothing} @keydown=${key}>
        ${tabs.map(
          tab => html`<button
            type="button"
            role="tab"
            data-tab=${tab.id}
            id="tab-${tab.id}"
            aria-selected=${tab.id === value.value ? 'true' : 'false'}
            aria-controls="panel-${tab.id}"
            tabindex=${tab.id === value.value ? 0 : -1}
            ?disabled=${tab.disabled === true}
            @click=${() => choose(tab.id)}
          >
            ${tab.label}
          </button>`,
        )}
      </div>
      ${tabs.map(
        (tab, index) =>
          html`<div role="tabpanel" id="panel-${tab.id}" aria-labelledby="tab-${tab.id}" tabindex="0" ?hidden=${tab.id !== value.value}><slot name="p${index}"></slot></div>`,
      )}`;
  },
  [
    FOCUS,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      [role='tablist'] {
        display: inline-flex;
        align-items: center;
      }
      .segmented {
        width: fit-content;
        gap: 0.125rem;
        padding: 0.125rem;
        border-radius: var(--radius-lg);
        background: var(--bg-fill);
      }
      .line {
        gap: 1rem;
        border-bottom: 1px solid var(--line);
      }
      [role='tab'] {
        height: calc(var(--control-h) - 0.25rem);
        padding: 0 0.75rem;
        border: 1px solid transparent;
        border-radius: var(--radius-md);
        background: transparent;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--fg-muted);
        cursor: pointer;
      }
      [role='tab']:hover {
        color: var(--fg);
      }
      .segmented [aria-selected='true'] {
        border-color: var(--line);
        background: var(--bg-surface);
        color: var(--fg);
      }
      .line [role='tab'] {
        height: var(--control-h-lg);
        padding: 0 0.125rem;
        border-radius: 0;
        margin-bottom: -1px;
      }
      .line [aria-selected='true'] {
        border-bottom: 2px solid var(--brand);
        color: var(--fg);
      }
      [role='tab']:disabled {
        opacity: 0.45;
        pointer-events: none;
      }
      [hidden] {
        display: none;
      }
    `,
  ],
);

drawAs(
  'bry-message-scroller',
  element => {
    if (element.loading === true) {
      return html`<div class="loading" role="status" aria-label="Loading">${[0, 1, 2].map(() => html`<span></span>`)}</div>`;
    }

    if (element.children.length === 0) {
      return html`<div class="empty"><p>${str(element.empty) || 'No messages yet.'}</p></div>`;
    }

    // A thread starts at its newest message.
    queueMicrotask(() => {
      const log = element.shadowRoot?.querySelector('[role="log"]');

      if (log && log.getAttribute('data-read') !== 'true') log.scrollTop = log.scrollHeight;
    });

    return html`<div
      role="log"
      tabindex="0"
      aria-label=${str(element.label)}
      @scroll=${(event: Event) => {
        const log = event.currentTarget as HTMLElement;

        log.setAttribute('data-read', String(log.scrollHeight - log.scrollTop - log.clientHeight > 48));
        if (log.scrollTop <= 0 && element.more === true) element.emit('more');
      }}
    >
      <slot></slot>
    </div>`;
  },
  [
    FOCUS,
    css`
      :host {
        display: flex;
        min-height: 0;
        flex-direction: column;
      }
      [role='log'] {
        display: flex;
        min-height: 0;
        flex: 1;
        flex-direction: column;
        gap: 1rem;
        overflow-y: auto;
        padding: 0.25rem;
        border-radius: var(--radius-lg);
      }
      .loading {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .loading span {
        height: 2.5rem;
        border-radius: var(--radius-lg);
        background: var(--bg-fill);
      }
      .empty {
        padding: 2.5rem 1.5rem;
        border: 1px dashed var(--line);
        border-radius: var(--radius-xl);
        text-align: center;
        color: var(--fg-strong);
      }
    `,
  ],
);
