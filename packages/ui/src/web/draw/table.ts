/// <reference lib="dom" />
import { css, html, nothing, type TemplateResult } from '../base.ts';
import { drawAs } from '../define.ts';
import { FOCUS, pick, str, TYPE } from './tokens.ts';

/**
 * `bry-table`: rows of text under column headings, as the kit's `Table`
 * draws it (Brydio's `packages/app/src/apps/catalogue/draw/table.tsx`).
 *
 * Sorting is the app's. A sortable heading is a button that asks for a
 * direction, and the heading shows what the app sends back in `sort` — so a
 * table whose app ignores the ask simply doesn't move, which is honest.
 *
 * A selectable table is a grid with **one row in the tab order**: the arrows
 * move between rows, Home and End go to the ends, and Enter or Space
 * chooses. That is the same bargain the kit makes — a hundred rows are not a
 * hundred tab stops — and it is why the row the keyboard last reached is
 * remembered here rather than read from the app.
 */

interface Column {
  key: string;
  heading: string;
  align?: 'start' | 'end';
  sortable?: boolean;
}

interface Row {
  id: string;
  cells: string[];
}

interface Sort {
  key: string;
  direction: 'asc' | 'desc';
}

/** Placeholder rows drawn while a table loads, as the kit draws them. */
export const LOADING_ROWS = 3;

const listOf = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** One column, with only the settings the catalogue allows; anything else is left out. */
export function columnOf(raw: unknown): Column | null {
  const one = (raw ?? {}) as Record<string, unknown>;
  const key = str(one.key);
  const heading = str(one.heading);

  if (!key || !heading) return null;

  const align = pick(['start', 'end'] as const, one.align);

  return { key, heading, ...(align ? { align } : {}), ...(one.sortable === true ? { sortable: true } : {}) };
}

/** One row: an id and its cells as text, never markup. */
export function rowOf(raw: unknown): Row | null {
  const one = (raw ?? {}) as Record<string, unknown>;
  const id = str(one.id);

  if (!id) return null;

  return { id, cells: listOf<unknown>(one.cells).map(str) };
}

/** What a press on a sortable heading asks for: the other way round, or ascending afresh. */
export function nextSort(column: Column, sort: Sort | undefined): Sort {
  return { key: column.key, direction: sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc' };
}

/** Where a key means to go among `count` rows, or `null` when it means nothing here. */
export function moveTo(key: string, at: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return Math.min(count - 1, at + 1);
  if (key === 'ArrowUp') return Math.max(0, at - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;

  return null;
}

/** The row the keyboard last reached, per element. Not a setting: the app never sent it. */
const reached = new WeakMap<object, string>();

const ALIGN = { start: 'start', end: 'end' } as const;

drawAs(
  'bry-table',
  element => {
    const columns = listOf<unknown>(element.columns).map(columnOf).filter((one): one is Column => one !== null);
    const rows = listOf<unknown>(element.rows).map(rowOf).filter((one): one is Row => one !== null);
    const sort = (element.sort ?? undefined) as Sort | undefined;
    const selectable = element.selectable === true;
    const selected = str(element.selected);
    const loading = element.loading === true;
    const label = str(element.label);
    const empty = str(element.empty);
    // The row in the tab order: the one last reached, else the chosen one,
    // else the first. A row that has gone away takes its turn with it.
    const been = reached.get(element);
    const current = rows.find(row => row.id === been) ?? rows.find(row => row.id === selected) ?? rows[0];

    const choose = (row: Row) => {
      reached.set(element, row.id);
      element.emit('select', { row: row.id });
    };

    const steer = (event: KeyboardEvent) => {
      if (!selectable || rows.length === 0) return;

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (current) choose(current);

        return;
      }

      const at = Math.max(0, rows.findIndex(row => row.id === current?.id));
      const next = moveTo(event.key, at, rows.length);

      if (next === null) return;

      event.preventDefault();

      const row = rows[next]!;

      reached.set(element, row.id);
      element.requestUpdate();
      // After the redraw, so the row that takes the tab stop is the one focused.
      void element.updateComplete.then(() => {
        const body = element.renderRoot as ParentNode;

        body.querySelector<HTMLElement>(`[data-row="${CSS.escape(row.id)}"]`)?.focus();
      });
    };

    const heading = (column: Column): TemplateResult => {
      const sorted = sort?.key === column.key ? sort.direction : null;

      return html`<th
        scope="col"
        class=${`align-${ALIGN[column.align ?? 'start']}`}
        aria-sort=${sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : nothing}
      >
        ${column.sortable
          ? html`<button
              type="button"
              class="sort"
              data-sort=${column.key}
              @click=${() => element.emit('sort', nextSort(column, sort))}
            >
              ${column.heading}<span class="arrow ${sorted ?? 'none'}" aria-hidden="true">▾</span>
            </button>`
          : column.heading}
      </th>`;
    };

    const body = (): TemplateResult => {
      if (loading) {
        return html`${Array.from(
          { length: LOADING_ROWS },
          () => html`<tr data-loading>
            ${columns.map(() => html`<td><span class="skeleton"></span></td>`)}
          </tr>`,
        )}`;
      }

      if (rows.length === 0) {
        return html`<tr data-empty>
          <td colspan=${Math.max(1, columns.length)} class="empty">${empty || 'Nothing here yet.'}</td>
        </tr>`;
      }

      return html`${rows.map(row => {
        const chosen = selectable && row.id === selected;

        return html`<tr
          data-row=${row.id}
          data-state=${chosen ? 'selected' : nothing}
          aria-selected=${selectable ? chosen : nothing}
          tabindex=${selectable ? (row.id === current?.id ? 0 : -1) : nothing}
          class=${selectable ? 'pickable' : ''}
          @click=${selectable ? () => choose(row) : nothing}
        >
          ${columns.map(
            (column, index) => html`<td class=${`align-${ALIGN[column.align ?? 'start']}`}>${row.cells[index] ?? ''}</td>`,
          )}
        </tr>`;
      })}`;
    };

    return html`<div class="wrap">
      <table
        role=${selectable ? 'grid' : nothing}
        aria-label=${label || nothing}
        aria-busy=${loading ? 'true' : nothing}
      >
        <thead>
          <tr>
            ${columns.map(heading)}
          </tr>
        </thead>
        <tbody @keydown=${steer}>
          ${body()}
        </tbody>
      </table>
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .wrap {
        min-width: 0;
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;
        line-height: 1.25rem;
        color: var(--fg);
      }
      th,
      td {
        padding: calc(0.25rem * 2) calc(0.25rem * 3);
        text-align: start;
        white-space: nowrap;
        vertical-align: middle;
      }
      th {
        font-size: 0.75rem;
        line-height: 1.125rem;
        letter-spacing: 0.005em;
        font-weight: 500;
        color: var(--fg-muted);
        border-bottom: 1px solid var(--line);
      }
      td {
        border-bottom: 1px solid var(--line-faint);
        color: var(--fg-soft);
      }
      .align-end {
        text-align: end;
      }
      .sort {
        display: inline-flex;
        align-items: center;
        gap: calc(0.25rem * 1);
        background: none;
        border: 0;
        padding: 0;
        font: inherit;
        color: inherit;
        cursor: pointer;
        border-radius: 0.25rem;
        outline: none;
      }
      .sort:hover {
        color: var(--fg-strong);
      }
      /* The arrow keeps its room whichever way the table is sorted, so a
         press doesn't shift the heading beside it. */
      .arrow {
        opacity: 0;
        transition: transform var(--dur-fast);
      }
      .arrow.asc {
        opacity: 1;
        transform: rotate(180deg);
      }
      .arrow.desc {
        opacity: 1;
      }
      tr.pickable {
        cursor: pointer;
        outline: none;
      }
      tr.pickable:hover td {
        background: var(--layer-hover);
      }
      tr[data-state='selected'] td {
        background: var(--layer-selected);
        color: var(--fg-strong);
      }
      tr.pickable:focus-visible {
        box-shadow: inset 0 0 0 3px var(--brand-ring);
      }
      td.empty {
        white-space: normal;
        text-align: center;
        color: var(--fg-muted);
        padding: calc(0.25rem * 6) calc(0.25rem * 3);
      }
      .skeleton {
        display: block;
        height: 0.75rem;
        width: 60%;
        border-radius: 0.25rem;
        background: var(--bg-sunken);
      }
    `,
  ],
);
