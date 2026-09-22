/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { draftOf, FIELD_B, keptOf, listOf, QUIET } from './catalogue-b-shared.ts';
import { FOCUS, str, TYPE } from './tokens.ts';

/**
 * ADR-A23 (catalogue-b): `bry-data-table`, as Brydio's React catalogue draws
 * it on the kit's table. The person sorts, filters, pages, hides columns and
 * chooses rows at once, over the rows the app sent, and each change is told
 * to the app: `sort`, `filter`, `page`, `columns` and `select`. What the app
 * says each one is wins only when it changes, as a field's value does.
 */

interface Column {
  key: string;
  heading: string;
  align?: 'start' | 'end';
  sortable?: boolean;
  hideable?: boolean;
}

interface Row {
  id: string;
  cells: string[];
}

interface Sort {
  key: string;
  direction: 'asc' | 'desc';
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** The rows a person sees, before paging: filtered over the shown columns, then sorted. */
export function shownRows(rows: Row[], columns: Column[], hidden: string[], filter: string, sort: Sort | null): Row[] {
  const wanted = filter.trim().toLowerCase();
  const shown = columns.map((column, at) => (hidden.includes(column.key) ? -1 : at)).filter(at => at >= 0);
  const kept = wanted ? rows.filter(row => shown.some(at => (row.cells[at] ?? '').toLowerCase().includes(wanted))) : rows;
  const by = sort ? columns.findIndex(column => column.key === sort.key) : -1;

  if (!sort || by === -1) return kept;

  const sign = sort.direction === 'desc' ? -1 : 1;

  return [...kept].sort((a, b) => sign * collator.compare(a.cells[by] ?? '', b.cells[by] ?? ''));
}

drawAs(
  'bry-data-table',
  element => {
    const columns = listOf<Column>(element.columns).filter(column => column && typeof column.key === 'string');
    const rows = listOf<Row>(element.rows).filter(row => row && typeof row.id === 'string');
    const sentSort = element.sort && typeof element.sort === 'object' ? (element.sort as Sort) : null;
    const sort = draftOf<Sort | null>(element, 'sort', sentSort);
    const filter = draftOf(element, 'filter', str(element.filter));
    const hidden = draftOf(element, 'hidden', listOf<string>(element.hidden));
    const selected = draftOf(element, 'selected', listOf<string>(element.selected));
    const page = draftOf(element, 'page', typeof element.page === 'number' ? element.page : 1);
    const state = keptOf(element, () => ({ picking: false }));
    const perPage = typeof element.perPage === 'number' ? element.perPage : 10;
    const label = str(element.label);
    const selectable = element.selectable === true;
    const visible = columns.filter(column => !hidden.draft.includes(column.key));
    const all = shownRows(rows, columns, hidden.draft, filter.draft, sort.draft);
    const pages = Math.max(1, Math.ceil(all.length / perPage));
    const at = Math.min(Math.max(1, page.draft), pages);
    const onPage = all.slice((at - 1) * perPage, at * perPage);
    const update = () => element.requestUpdate();
    const goTo = (to: number) => {
      page.set(to);
      element.emit('page', { page: to });
      update();
    };
    const choose = (ids: string[]) => {
      selected.set(ids);
      element.emit('select', { rows: ids });
      update();
    };
    const everyOnPage = onPage.length > 0 && onPage.every(row => selected.draft.includes(row.id));

    if (element.loading === true) {
      return html`<div class="wrap" role="status" aria-label="Loading">
        ${[0, 1, 2].map(() => html`<div class="bone"></div>`)}
      </div>`;
    }

    return html`<div class="wrap">
      <div class="tools">
        <input
          class="filter box"
          type="search"
          .value=${filter.draft}
          placeholder=${str(element.placeholder) || 'Filter'}
          aria-label=${str(element.placeholder) || 'Filter'}
          @input=${(event: Event) => {
            const value = (event.currentTarget as HTMLInputElement).value;

            filter.set(value);
            element.emit('filter', { value });
            if (at !== 1) goTo(1);
            else update();
          }}
        />
        <div class="columns">
          <button
            type="button"
            class="quiet"
            aria-haspopup="true"
            aria-expanded=${state.picking ? 'true' : 'false'}
            @click=${() => {
              state.picking = !state.picking;
              update();
            }}
          >
            Columns
          </button>
          ${state.picking
            ? html`<div
                class="picker"
                role="group"
                aria-label="Columns"
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key !== 'Escape') return;
                  state.picking = false;
                  update();
                }}
              >
                ${columns
                  .filter(column => column.hideable !== false)
                  .map(
                    column => html`<label class="type-ui">
                      <input
                        type="checkbox"
                        data-column=${column.key}
                        .checked=${!hidden.draft.includes(column.key)}
                        @change=${(event: Event) => {
                          const show = (event.currentTarget as HTMLInputElement).checked;
                          const next = show ? hidden.draft.filter(key => key !== column.key) : [...hidden.draft, column.key];

                          hidden.set(next);
                          element.emit('columns', { hidden: next });
                          update();
                        }}
                      />
                      ${column.heading}
                    </label>`,
                  )}
              </div>`
            : nothing}
        </div>
      </div>
      ${all.length === 0
        ? html`<div class="empty type-ui" data-empty>${str(element.empty) || 'No results.'}</div>`
        : html`<table aria-label=${label || nothing}>
            <thead>
              <tr>
                ${selectable
                  ? html`<th class="pick">
                      <input
                        type="checkbox"
                        aria-label="Choose every row on this page"
                        .checked=${everyOnPage}
                        @change=${() =>
                          choose(
                            everyOnPage
                              ? selected.draft.filter(id => !onPage.some(row => row.id === id))
                              : [...selected.draft, ...onPage.map(row => row.id).filter(id => !selected.draft.includes(id))],
                          )}
                      />
                    </th>`
                  : nothing}
                ${visible.map(column => {
                  const sorted = sort.draft?.key === column.key ? sort.draft.direction : null;

                  return html`<th
                    data-align=${column.align === 'end' ? 'end' : 'start'}
                    aria-sort=${sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : nothing}
                  >
                    ${column.sortable === true
                      ? html`<button
                          type="button"
                          class="sort"
                          data-sort=${column.key}
                          @click=${() => {
                            const next: Sort = { key: column.key, direction: sorted === 'asc' ? 'desc' : 'asc' };

                            sort.set(next);
                            element.emit('sort', next);
                            update();
                          }}
                        >
                          ${column.heading}<span aria-hidden="true">${sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ''}</span>
                        </button>`
                      : column.heading}
                  </th>`;
                })}
              </tr>
            </thead>
            <tbody>
              ${onPage.map(row => {
                const chosen = selected.draft.includes(row.id);

                return html`<tr data-row=${row.id} aria-selected=${selectable ? (chosen ? 'true' : 'false') : nothing}>
                  ${selectable
                    ? html`<td class="pick">
                        <input
                          type="checkbox"
                          aria-label="Choose row"
                          .checked=${chosen}
                          @change=${() => choose(chosen ? selected.draft.filter(id => id !== row.id) : [...selected.draft, row.id])}
                        />
                      </td>`
                    : nothing}
                  ${visible.map(column => html`<td data-align=${column.align === 'end' ? 'end' : 'start'}>${row.cells[columns.indexOf(column)] ?? ''}</td>`)}
                </tr>`;
              })}
            </tbody>
          </table>`}
      <div class="foot type-caption">
        <span>${selectable ? `${selected.draft.length} of ${rows.length} chosen` : `${all.length} rows`}</span>
        <span class="pager">
          <span>Page ${at} of ${pages}</span>
          <button type="button" class="quiet" data-page="previous" ?disabled=${at <= 1} @click=${() => goTo(at - 1)}>Previous</button>
          <button type="button" class="quiet" data-page="next" ?disabled=${at >= pages} @click=${() => goTo(at + 1)}>Next</button>
        </span>
      </div>
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    FIELD_B,
    QUIET,
    css`
      .wrap {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 0;
      }
      .tools {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .filter {
        height: var(--field-h);
        max-width: 18rem;
        flex: 1;
        padding: 0 var(--field-px);
        outline: none;
      }
      .filter:focus-visible {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-ring);
      }
      .columns {
        position: relative;
      }
      .picker {
        position: absolute;
        z-index: 50;
        inset-inline-end: 0;
        margin-top: 0.25rem;
        display: grid;
        min-width: 10rem;
        gap: 0.25rem;
        padding: 0.5rem;
        border: 1px solid var(--line);
        border-radius: var(--menu-radius);
        background: var(--popover);
        box-shadow: var(--shadow-pop);
      }
      .picker label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;
      }
      th,
      td {
        padding: 0.5rem;
        border-bottom: 1px solid var(--line);
        text-align: start;
      }
      th {
        color: var(--fg-muted);
        font-weight: 500;
      }
      [data-align='end'] {
        text-align: end;
      }
      .pick {
        width: 2rem;
      }
      tr[aria-selected='true'] {
        background: var(--layer-hover);
      }
      .sort {
        border: 0;
        background: transparent;
        padding: 0;
        color: inherit;
        font-weight: 500;
        cursor: pointer;
      }
      input[type='checkbox'] {
        accent-color: var(--brand);
      }
      .empty {
        padding: 2.5rem 1.5rem;
        border: 1px dashed var(--line);
        border-radius: var(--radius-xl);
        text-align: center;
      }
      .foot,
      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .bone {
        height: 2rem;
        border-radius: var(--radius-md);
        background: var(--layer-hover);
      }
    `,
  ],
);
