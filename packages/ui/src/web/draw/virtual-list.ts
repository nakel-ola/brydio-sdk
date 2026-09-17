/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { pick, str, TYPE } from './tokens.ts';

/**
 * `bry-virtual-list`: a list of any length, of which only a window exists.
 *
 * The app says how many rows there are (`count`) and sends, as children, only
 * the ones from `start`. Scrolling says `range { start, end }` and the app
 * sends that window; nothing here fetches. As the kit's `VirtualRows` does,
 * the rows sit at their own offset inside a box as tall as the whole list, so
 * the scrollbar is the length of the list rather than of the window.
 */

type Element = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean; requestUpdate(): void };

/** A row's height by size, in rem, as the kit has it. */
const ROW_REM = { sm: 2.25, md: 3, lg: 4.5 } as const;
/** Rows drawn beyond each edge, so a scroll doesn't show a gap. */
const OVERSCAN = 6;
const LOADING_ROWS = 5;

const whole = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;

/** The rows a scroller wants drawn: what is in view, with a few either side. */
export function windowOf(scrollTop: number, height: number, rowHeight: number, count: number): { start: number; end: number } {
  if (rowHeight <= 0 || count === 0) return { start: 0, end: 0 };

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const last = Math.min(count, Math.ceil((scrollTop + height) / rowHeight) + OVERSCAN);

  return { start: first, end: Math.max(first, last) };
}

/** Where a key takes the choice, or `null` when the key isn't one of these. */
export function movedTo(key: string, active: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return Math.min(count - 1, active + 1);
  if (key === 'ArrowUp') return Math.max(0, active - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;

  return null;
}

const held = new WeakMap<object, { active: number | undefined; seen: number | undefined; asked: string }>();

/** Lists already listening to their own rows. */
const wired = new WeakSet<object>();

drawAs(
  'bry-virtual-list',
  element => {
    const list = element as Element;
    const count = whole(element.count, 0);
    const start = whole(element.start, 0);
    const size = pick(['sm', 'md', 'lg'] as const, element.rowSize) ?? 'md';
    const selectable = element.selectable === true;
    const chosen = typeof element.selected === 'number' ? element.selected : undefined;
    const label = str(element.label);
    const rows = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);

    let state = held.get(list);

    if (!state) {
      state = { active: chosen, seen: chosen, asked: '' };
      held.set(list, state);
    }
    if (state.seen !== chosen) {
      state.seen = chosen;
      state.active = chosen;
    }

    const current = state;
    const drawn = (index: number) => index >= start && index < start + rows.length;

    // Each row says where it sits in the whole list, whatever window it is in.
    for (const [at, row] of rows.entries()) {
      const index = start + at;

      row.id = row.id || `${label || 'row'}-${index}`;
      row.setAttribute('role', selectable ? 'option' : 'listitem');
      row.setAttribute('aria-setsize', String(count));
      row.setAttribute('aria-posinset', String(index + 1));
      if (selectable) row.setAttribute('aria-selected', String(current.active === index));
      row.toggleAttribute('data-active', selectable && current.active === index);
    }

    if (element.loading === true) {
      return html`<div class="loading" role="status" aria-label="Loading">
        ${Array.from({ length: LOADING_ROWS }, () => html`<div class="bone"></div>`)}
      </div>`;
    }
    if (count === 0) {
      return html`<div class="empty" data-empty><p>${str(element.empty) || 'Nothing here yet.'}</p></div>`;
    }

    const rowHeight = ROW_REM[size] * 16;
    const choose = (index: number) => {
      current.active = index;
      list.emit('select', { index });
      list.requestUpdate();
    };
    const ask = (viewport: HTMLElement) => {
      const next = windowOf(viewport.scrollTop, viewport.clientHeight, rowHeight, count);
      const asked = `${next.start}:${next.end}`;

      if (current.asked === asked || next.end <= next.start) return;

      current.asked = asked;
      list.emit('range', next);
    };
    const active = current.active;

    // On the element itself: a press on a row is a press on the app's own
    // node, which a listener inside the shadow root never hears.
    if (!wired.has(list)) {
      wired.add(list);
      list.addEventListener('click', (event: MouseEvent) => {
        if (element.selectable !== true) return;

        const drawnRows = Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
        const row = drawnRows.findIndex(one => event.composedPath().includes(one));

        if (row >= 0) choose(whole(element.start, 0) + row);
      });
      list.addEventListener('keydown', (event: KeyboardEvent) => {
        if (element.selectable !== true) return;

        const next = movedTo(event.key, current.active ?? -1, whole(element.count, 0));

        if (next === null) return;

        event.preventDefault();
        choose(next);
      });
    }

    return html`<div
      class="scroller"
      role=${selectable ? 'listbox' : 'list'}
      aria-label=${label || nothing}
      tabindex=${selectable ? '0' : nothing}
      aria-activedescendant=${selectable && active !== undefined && drawn(active) ? (rows[active - start]?.id ?? nothing) : nothing}
      style="--bry-row: ${ROW_REM[size]}rem"
      @scroll=${(event: Event) => ask(event.currentTarget as HTMLElement)}
    >
      <div class="tall" style="height: ${count * ROW_REM[size]}rem">
        <div class="window" style="transform: translateY(${start * ROW_REM[size]}rem)"><slot></slot></div>
      </div>
    </div>`;
  },
  [
    TYPE,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .scroller {
        max-height: 70dvh;
        overflow-y: auto;
        outline: none;
      }
      .scroller:focus-visible {
        box-shadow: 0 0 0 3px var(--brand-ring);
        border-radius: var(--radius-lg);
      }
      .tall {
        position: relative;
        width: 100%;
      }
      .window {
        position: absolute;
        inset-inline: 0;
        top: 0;
      }
      ::slotted(*) {
        display: block;
        height: var(--bry-row, 3rem);
        box-sizing: border-box;
      }
      ::slotted([role='option']) {
        cursor: pointer;
        border-radius: var(--radius-md);
      }
      ::slotted([aria-selected='true']) {
        background: var(--layer-selected);
      }
      ::slotted([data-active]) {
        box-shadow: inset 0 0 0 3px var(--brand-ring);
      }
      .loading {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.5rem 0;
      }
      .bone {
        height: 0.75rem;
        border-radius: var(--radius-md);
        background: var(--layer-hover);
        animation: pulse 2s ease-in-out infinite;
      }
      @keyframes pulse {
        50% {
          opacity: 0.5;
        }
      }
      .empty {
        border: 1px dashed var(--line);
        border-radius: var(--radius-xl);
        padding: 2.5rem 1.5rem;
        text-align: center;
      }
      .empty p {
        margin: 0;
        font-size: 0.9375rem;
        font-weight: 500;
        color: var(--fg-strong);
      }
    `,
  ],
);
