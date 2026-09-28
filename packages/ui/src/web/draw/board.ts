/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { STATE_GROUPS } from '../../catalogue.ts';
import type { El } from './catalogue-b-shared.ts';
import { icon, optionMark, PLAN, quickAddLine, rowMenu, stateMark, TONE_DOT, TONE_NAMES, type Tone } from './plan-shared.ts';
import { FOCUS, pick, str, TYPE } from './tokens.ts';

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

/**
 * A card's height by size, in rem, as the kit has it. `row` is a list
 * layout's and `xl` a plan board's: neither is a size an app picks.
 */
const CARD_REM = { row: 2.75, sm: 4, md: 5.5, lg: 7.5, xl: 9 } as const;

/** How a column's board is laid out and drawn, read from the board around it. */
function lookOf(column: HTMLElement): { plan: boolean; list: boolean } {
  const board = column.closest('bry-board') as (HTMLElement & Record<string, unknown>) | null;

  return { plan: board?.variant === 'plan', list: board?.layout === 'list' };
}

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
    const list = element.layout === 'list';
    const lanes = element.layout === 'lanes';
    const plan = element.variant === 'plan';
    const size = list ? 'row' : plan ? 'xl' : (pick(['sm', 'md', 'lg'] as const, element.cardSize) ?? 'md');
    const loading = element.loading === true;
    const columns = () => columnsOf(board);
    const ids = () => columns().map(column => column.id);

    element.style.setProperty('--bry-card-rem', `${CARD_REM[size]}rem`);
    element.dataset.layout = list ? 'list' : lanes ? 'lanes' : 'columns';
    // A swimlane board is a grid: each lane's heading across it, its columns under it.
    element.style.setProperty('--bry-lane-columns', String(typeof element.laneColumns === 'number' ? element.laneColumns : 1));
    element.dataset.variant = plan ? 'plan' : 'default';
    // A column draws its header from its board's look: tell each to draw again.
    for (const column of columns()) (column as unknown as Element).requestUpdate?.();

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
      :host([data-layout='lanes']) .board {
        display: grid;
        grid-template-columns: repeat(var(--bry-lane-columns, 1), 17.5rem);
        align-items: start;
      }
      :host([data-layout='list']) .board {
        flex-direction: column;
        align-items: stretch;
        gap: 0;
        overflow-x: visible;
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

/** A column's header tint on a plan board, by tone. */
const TINT: Record<Tone, string> = {
  neutral: 'var(--layer-hover)',
  brand: 'var(--brand-soft)',
  success: 'var(--success-soft)',
  warn: 'var(--warn-soft)',
  danger: 'var(--danger-soft)',
};

/**
 * A column on a `plan` board: its state group's `glyph` in `tone`, folded
 * away by its header when `collapsible`, with a "+" and an add line under the
 * cards when `addable`. A list layout draws it as a full-width group of rows.
 */
function planColumn(
  column: Element,
  look: {
    list: boolean;
    title: string;
    count: number;
    limit: number | undefined;
    loading: boolean;
    holds: number;
    askForRange: (viewport: HTMLElement) => void;
  },
) {
  const { list, title, count, loading, holds } = look;
  const group = pick(STATE_GROUPS, column.glyph);
  const tone = pick(TONE_NAMES, column.tone);
  const collapsible = column.collapsible === true;
  const collapsed = collapsible && column.collapsed === true;
  const addable = column.addable === true;
  const add = () => column.emit('add');
  const fold = () => column.emit('toggle', { collapsed: !collapsed });

  const menu = rowMenu(column as unknown as El, column.menu, `${title} options`, 'column-menu', false);
  const plus = addable
    ? html`<button
        type="button"
        class="plus"
        aria-label=${`Add to ${title}`}
        @click=${(event: Event) => {
          event.stopPropagation();
          add();
        }}
      >
        ${icon('add', 14)}
      </button>`
    : nothing;

  const header = list
    ? html`<header class="list-head ${collapsible ? 'foldable' : ''}" @click=${collapsible ? fold : nothing}>
        ${collapsible ? html`<span class="fold ${collapsed ? '' : 'open'}" aria-hidden="true">${icon('chevronRight', 12)}</span>` : nothing}
        ${group ? stateMark(group, tone, 'md') : nothing}
        <h3>${title}</h3>
        <span class="list-count">${count}</span>
        <span class="grow"></span>
        ${collapsible
          ? html`<button
              type="button"
              class="unseen-until-focus"
              aria-expanded=${collapsed ? 'false' : 'true'}
              aria-label=${collapsed ? `Show ${title}` : `Hide ${title}`}
              @click=${(event: Event) => {
                event.stopPropagation();
                fold();
              }}
            ></button>`
          : nothing}
        ${menu}${plus}
      </header>`
    : html`<header class="plan-head" style="background: ${tone ? TINT[tone] : 'var(--layer-hover)'}">
        <span class="bar" style="background: ${TONE_DOT[tone ?? 'neutral']}"></span>
        ${group ? stateMark(group, tone) : nothing}
        <h3 class="truncate">${title}</h3>
        <span class="plan-count">${count}</span>
        ${collapsible
          ? html`<button
              type="button"
              class="plus"
              aria-expanded=${collapsed ? 'false' : 'true'}
              aria-label=${collapsed ? `Show ${title}` : `Hide ${title}`}
              @click=${fold}
            >
              <span class="fold ${collapsed ? '' : 'open'}">${icon('chevronRight', 12)}</span>
            </button>`
          : nothing}
        ${menu}${plus}
      </header>`;

  const footer =
    addable && (str(column.addLabel) || column.adding === true)
      ? quickAddLine(column as unknown as El, {
          variant: list ? 'row' : 'card',
          trigger: str(column.addLabel) || `Add to ${title}`,
          placeholder: 'Issue title…',
          hint: 'Enter to save · Esc to cancel',
          open: column.adding === true,
          busy: column.busy === true,
          value: '',
          onOpen: add,
          onSubmit: value => column.emit('submit', { value }),
          onCancel: () => column.emit('cancel'),
        })
      : nothing;

  return html`<section class="column plan ${list ? 'listed' : ''}" aria-label=${title || nothing}>
    ${header}
    ${collapsed
      ? nothing
      : html`<div class="cards" @scroll=${(event: Event) => look.askForRange(event.currentTarget as HTMLElement)}>
            ${loading ? html`<div class="bone" role="status" aria-label="Loading"></div>` : nothing}
            <slot></slot>
            ${holds === 0 && !loading && !list ? html`<p class="empty plan-empty">${str(column.empty) || 'No issues'}</p>` : nothing}
          </div>
          ${footer}`}
  </section>`;
}

/** What a column last told the app it wanted drawn, so it isn't told twice. */
const asked = new WeakMap<object, string>();

drawAs(
  'bry-board-column',
  element => {
    const column = element as Element;
    const { plan, list } = lookOf(column);
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

    column.dataset.layout = list ? 'list' : 'columns';
    column.dataset.variant = plan ? 'plan' : 'default';

    if (plan) return planColumn(column, { list, title, count: count ?? holds, limit, loading, holds, askForRange });

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
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
        width: 18rem;
        flex-shrink: 0;
      }
      :host([data-layout='list']) {
        width: auto;
      }
      .column.plan {
        border: 0;
        background: transparent;
        padding: 0;
      }
      .column.plan .cards {
        min-height: 7.5rem;
        gap: 0.625rem;
        border-radius: var(--radius-xl);
        background: var(--layer-hover);
        padding: 0.5rem;
      }
      .column.listed {
        gap: 0;
        border-radius: 0;
      }
      .column.listed .cards {
        min-height: 0;
        max-height: none;
        gap: 0;
        border-radius: 0;
        background: transparent;
        padding: 0;
      }
      .plan-head,
      .list-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        user-select: none;
      }
      .plan-head {
        border-radius: var(--radius-lg);
        padding: 0.5rem 0.625rem;
      }
      .list-head {
        position: sticky;
        top: 0;
        z-index: 10;
        height: 2.25rem;
        border-bottom: 1px solid var(--line);
        background: var(--bg-surface);
        padding: 0 0.875rem;
      }
      .foldable {
        cursor: pointer;
      }
      h3 {
        margin: 0;
        min-width: 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--fg);
      }
      .plan-head h3 {
        flex: 1;
      }
      .bar {
        width: 0.25rem;
        height: 1.25rem;
        flex-shrink: 0;
        border-radius: 9999px;
      }
      .plan-count {
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
        color: var(--fg-muted);
      }
      .list-count {
        font-size: 0.875rem;
        color: var(--fg-muted);
      }
      .grow {
        flex: 1;
      }
      .fold {
        display: inline-flex;
        color: var(--fg-muted);
        transition: transform var(--dur-fast);
      }
      .fold.open {
        transform: rotate(90deg);
      }
      .plus {
        display: inline-flex;
        width: 1.5rem;
        height: 1.5rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: var(--radius-lg);
        background: transparent;
        color: var(--fg-muted);
        cursor: pointer;
      }
      .list-head .plus {
        width: 1.25rem;
        height: 1.25rem;
        border-radius: var(--radius-md);
      }
      .plus:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
      .unseen-until-focus {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        border: 0;
        padding: 0;
      }
      .unseen-until-focus:focus {
        position: static;
        width: auto;
        height: auto;
        clip-path: none;
      }
      .plan-empty {
        margin: 0;
        padding: 1.5rem 0;
        text-align: center;
        font-size: 0.75rem;
        color: var(--fg-muted);
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

drawAs(
  'bry-board-lane',
  element => {
    const lane = element as Element;
    const collapsible = element.collapsible === true;
    const collapsed = collapsible && element.collapsed === true;
    const title = str(element.title);
    const tone = pick(TONE_NAMES, element.tone);

    return html`<div class="lane">
      <button
        type="button"
        class="head"
        ?disabled=${!collapsible}
        aria-expanded=${collapsible ? (collapsed ? 'false' : 'true') : nothing}
        @click=${() => lane.emit('toggle', { collapsed: !collapsed })}
      >
        ${collapsible ? html`<span class="fold ${collapsed ? '' : 'open'}" aria-hidden="true">${icon('chevronRight', 12)}</span>` : nothing}
        ${str(element.mark) ? optionMark(str(element.mark), tone, title, title) : nothing}
        <span class="title">${title}</span>
        ${typeof element.count === 'number' ? html`<span class="count">${element.count}</span>` : nothing}
      </button>
      ${element.openable === true ? html`<button type="button" class="open-link" @click=${() => lane.emit('open')}>${str(element.openLabel) || 'Open'}</button>` : nothing}
    </div>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
        grid-column: 1 / -1;
        padding-top: 1rem;
      }
      :host(:first-child) {
        padding-top: 0;
      }
      .lane {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 0.5rem;
        border-radius: var(--radius-md);
        padding: 0.25rem;
      }
      button {
        border: 0;
        background: transparent;
        font: inherit;
        cursor: pointer;
      }
      .head {
        display: flex;
        min-width: 0;
        flex: 1;
        align-items: center;
        gap: 0.5rem;
        border-radius: var(--radius-md);
        padding: 0;
        text-align: start;
        color: inherit;
      }
      .head:disabled {
        cursor: default;
      }
      .head:not(:disabled):hover {
        background: var(--layer-hover);
      }
      .fold {
        display: inline-flex;
        color: var(--fg-muted);
        transition: transform var(--dur-fast);
      }
      .fold.open {
        transform: rotate(90deg);
      }
      .title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--fg);
      }
      .count {
        flex-shrink: 0;
        border-radius: 9999px;
        background: var(--layer-hover);
        padding: 0.125rem 0.375rem;
        font-size: 0.625rem;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        color: var(--fg-muted);
      }
      .open-link {
        flex-shrink: 0;
        border-radius: var(--radius-md);
        padding: 0.125rem 0.375rem;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .open-link:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
    `,
  ],
);
