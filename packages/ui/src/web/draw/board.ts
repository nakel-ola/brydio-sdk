/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { pick, str, TYPE } from './tokens.ts';

/**
 * `bry-board` and `bry-board-column`: columns of cards a person moves between,
 * as the kit's board draws them (`packages/ui/src/components/board.tsx`).
 *
 * A card is picked up with Space or Enter, steered with the arrows, dropped
 * with Space or Enter and put back with Escape; left and right mean before and
 * after, so they swap under right-to-left. A pointer drag does the same thing.
 * Either way the board says `move { card, from, to, position }` once, and the
 * app decides: nothing here moves a card of its own accord.
 *
 * A card is named by its `id`, and so is a column — in an HTML view those are
 * the ids the page writes, where a screen's tree would have the node's own.
 */

type Element = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean; requestUpdate(): void };

/** A card's height by size, in rem, as the kit has it. */
const CARD_REM = { sm: 4, md: 5.5, lg: 7.5 } as const;

interface Drag {
  card: string;
  from: string;
  to: string;
  position: number;
  origin: number;
  by: 'keyboard' | 'pointer';
}

const dragging = new WeakMap<object, { drag: Drag | null; said: string }>();

/** Boards already listening to their own cards. */
const wired = new WeakSet<object>();

function stateOf(board: Element) {
  let state = dragging.get(board);

  if (!state) {
    state = { drag: null, said: '' };
    dragging.set(board, state);
  }

  return state;
}

const columnsOf = (board: Element): HTMLElement[] =>
  Array.from(board.children).filter((child): child is HTMLElement => child.localName === 'bry-board-column');

const cardsOf = (column: Element | HTMLElement): HTMLElement[] =>
  Array.from(column.children).filter((child): child is HTMLElement => child instanceof HTMLElement && Boolean(child.id));

/** Where a key means to take the card. Left and right read as before and after. */
export function steered(
  key: string,
  rtl: boolean,
  drag: { to: string; position: number },
  columns: readonly string[],
): { to: string; position: number } | null {
  const at = columns.indexOf(drag.to);
  const before = rtl ? 'ArrowRight' : 'ArrowLeft';
  const after = rtl ? 'ArrowLeft' : 'ArrowRight';

  if (key === 'ArrowUp') return { to: drag.to, position: Math.max(0, drag.position - 1) };
  if (key === 'ArrowDown') return { to: drag.to, position: drag.position + 1 };
  if (key === before && at > 0) return { to: columns[at - 1]!, position: drag.position };
  if (key === after && at >= 0 && at < columns.length - 1) return { to: columns[at + 1]!, position: drag.position };

  return null;
}

/** Where a pointer at `y` would put a card in this column. */
export function positionAt(cards: readonly { top: number; height: number }[], y: number): number {
  let position = cards.length;

  for (const [index, card] of cards.entries()) {
    if (y < card.top + card.height / 2) {
      position = index;
      break;
    }
  }

  return position;
}

const titleOf = (column: HTMLElement | undefined) => str((column as unknown as Record<string, unknown> | undefined)?.title) || 'a column';

drawAs(
  'bry-board',
  element => {
    const board = element as Element;
    const state = stateOf(board);
    const size = pick(['sm', 'md', 'lg'] as const, element.cardSize) ?? 'md';
    const loading = element.loading === true;
    const columns = () => columnsOf(board);
    const ids = () => columns().map(column => column.id);

    element.style.setProperty('--bry-card-rem', `${CARD_REM[size]}rem`);

    const say = (words: string) => {
      state.said = words;
      board.requestUpdate();
    };
    const put = (card: string, from: string, at: number) => {
      state.drag = { card, from, to: from, position: at, origin: at, by: 'keyboard' };
      say(`${card} lifted. ${titleOf(columns().find(column => column.id === from))}, position ${at + 1}.`);
    };
    const drop = () => {
      const drag = state.drag;

      state.drag = null;

      if (!drag) return;
      if (drag.to === drag.from && drag.position === drag.origin) {
        say('Put back where it was.');

        return;
      }

      say(`Moved to ${titleOf(columns().find(column => column.id === drag.to))}, position ${drag.position + 1}.`);
      board.emit('move', { card: drag.card, from: drag.from, to: drag.to, position: drag.position });
    };

    const cardUnder = (target: EventTarget | null): { card: HTMLElement; column: HTMLElement } | null => {
      if (!(target instanceof Element)) return null;

      for (const column of columns()) {
        const card = cardsOf(column).find(one => one === target || one.contains(target));

        if (card) return { card, column };
      }

      return null;
    };

    if (!wired.has(board)) {
      wired.add(board);
      board.addEventListener('keydown', (event: KeyboardEvent) => {
        const found = cardUnder(event.composedPath()[0] ?? null);
        const drag = state.drag;

        if (event.key === 'Escape' && drag) {
          event.preventDefault();
          state.drag = null;
          say('Put back where it was.');

          return;
        }
        if (!found && !drag) return;
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();

          if (drag) drop();
          else if (found) put(found.card.id, found.column.id, cardsOf(found.column).indexOf(found.card));

          return;
        }
        if (!drag || !event.key.startsWith('Arrow')) return;

        event.preventDefault();

        const next = steered(event.key, getComputedStyle(board).direction === 'rtl', drag, ids());

        if (!next) return;

        const column = columns().find(one => one.id === next.to);
        const room = column ? cardsOf(column).length + (next.to === drag.from ? 0 : 1) : 0;

        state.drag = { ...drag, to: next.to, position: Math.min(next.position, Math.max(0, room - 1)) };
        say(`${titleOf(column)}, position ${state.drag.position + 1} of ${Math.max(room, 1)}.`);
      });
      board.addEventListener('pointerdown', (event: PointerEvent) => {
        const found = cardUnder(event.composedPath()[0] ?? null);

        if (!found || event.button !== 0) return;
        if ((event.composedPath()[0] as Element)?.closest?.("button, a, input, textarea, select, [role='menuitem']")) return;

        state.drag = {
          card: found.card.id,
          from: found.column.id,
          to: found.column.id,
          position: cardsOf(found.column).indexOf(found.card),
          origin: cardsOf(found.column).indexOf(found.card),
          by: 'pointer',
        };
      });
      board.addEventListener('pointerup', (event: PointerEvent) => {
        const drag = state.drag;

        if (!drag || drag.by !== 'pointer') return;

        const over = columns().find(column => {
          const box = column.getBoundingClientRect();

          return event.clientX >= box.left && event.clientX <= box.right;
        });

        if (over) {
          const boxes = cardsOf(over)
            .filter(card => card.id !== drag.card)
            .map(card => {
              const box = card.getBoundingClientRect();

              return { top: box.top, height: box.height };
            });

          state.drag = { ...drag, to: over.id, position: positionAt(boxes, event.clientY) };
        }

        drop();
      });
    }

    return html`<div
      class="board ${loading ? 'loading' : ''}"
      role="group"
      aria-label=${str(element.label) || nothing}
      aria-busy=${loading ? 'true' : nothing}
      aria-describedby="how"
    >
      <slot></slot>
      <p id="how" class="unseen">Press Space to pick up a card, the arrow keys to move it, and Space again to drop it.</p>
      <p class="unseen" role="status" aria-live="assertive">${state.said}</p>
    </div>`;
  },
  [
    TYPE,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .board {
        display: flex;
        min-width: 0;
        align-items: flex-start;
        gap: 0.75rem;
        overflow-x: auto;
        padding-bottom: 0.25rem;
      }
      .loading {
        opacity: 0.6;
      }
      .unseen {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    `,
  ],
);

/** What a column last told the app it wanted drawn, so it isn't told twice. */
const asked = new WeakMap<object, string>();

drawAs(
  'bry-board-column',
  element => {
    const column = element as Element;
    const title = str(element.title);
    const count = typeof element.count === 'number' ? element.count : undefined;
    const limit = typeof element.limit === 'number' ? element.limit : undefined;
    const loading = element.loading === true;
    const empty = str(element.empty) || 'Nothing here yet.';
    const cards = cardsOf(column);
    const holds = cards.length;

    // A card takes the focus and says what it is, so the keyboard can lift it.
    for (const card of cards) {
      card.tabIndex = 0;
      card.setAttribute('aria-roledescription', 'card');
    }

    /** The cards in view, as indexes into the whole column, for the app to send. */
    const askForRange = (viewport: HTMLElement) => {
      const card = parseFloat(getComputedStyle(column).getPropertyValue('--bry-card-rem')) || 5.5;
      const step = card * 16;
      const start = Math.max(0, Math.floor(viewport.scrollTop / step) - 2);
      const end = Math.min(count ?? holds, Math.ceil((viewport.scrollTop + viewport.clientHeight) / step) + 2);
      const window = `${start}:${end}`;

      if (asked.get(column) === window || end <= start) return;

      asked.set(column, window);
      column.emit('range', { start, end });
    };

    return html`<section class="column" aria-label=${title || nothing}>
      <header>
        <p class="type-label">${title}</p>
        <span class="count" data-slot="board-column-count">${count ?? holds}${limit === undefined ? nothing : html`/${limit}`}</span>
      </header>
      <div class="cards" @scroll=${(event: Event) => askForRange(event.currentTarget as HTMLElement)}>
        ${loading ? html`<div class="bone" role="status" aria-label="Loading"></div>` : nothing}
        <slot></slot>
        ${holds === 0 && !loading ? html`<p class="empty type-caption">${empty}</p>` : nothing}
      </div>
    </section>`;
  },
  [
    TYPE,
    css`
      :host {
        display: block;
        width: 18rem;
        flex-shrink: 0;
      }
      .column {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.5rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background: var(--bg-sunken);
        padding: 0.5rem;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0 0.25rem;
      }
      .count {
        font-size: 0.6875rem;
        color: var(--fg-muted);
      }
      .cards {
        display: flex;
        max-height: 70vh;
        flex-direction: column;
        gap: 0.5rem;
        overflow-y: auto;
      }
      .empty {
        padding: 1.5rem 0.75rem;
        text-align: center;
      }
      .bone {
        height: var(--bry-card-rem, 5.5rem);
        border-radius: var(--radius-lg);
        background: var(--layer-hover);
        animation: pulse 2s ease-in-out infinite;
      }
      @keyframes pulse {
        50% {
          opacity: 0.5;
        }
      }
    `,
  ],
);
