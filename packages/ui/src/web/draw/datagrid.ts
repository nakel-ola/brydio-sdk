/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { keptOf, listOf } from './catalogue-b-shared.ts';
import {
  display,
  fillSeries,
  INLINE_TYPES,
  labelsOf,
  LIST_TYPES,
  normal,
  parseHtmlTable,
  parseTsv,
  pasteEdits,
  ROW_PX,
  toClipboard,
  type GridColumn,
  type Range,
} from './datagrid-model.ts';
import { FOCUS, str } from './tokens.ts';

/**
 * Database DB02: `bry-datagrid`, as Brydio's React catalogue draws it. Every
 * row sent is drawn (at most 500), with the same keys, editing, copy, paste,
 * fill handle and events, so a screen tried under `brydio dev` behaves as it
 * will in a workspace.
 */

interface Row {
  id: string;
  cells: string[];
}

interface State extends Record<string, unknown> {
  active: { r: number; c: number } | null;
  range: Range | null;
  editing: { r: number; c: number; draft: string } | null;
}

const WIDTH_PX = { sm: 120, md: 180, lg: 260, xl: 360 } as const;
const GUTTER_PX = 64;

drawAs(
  'bry-datagrid',
  element => {
    const columns = listOf<GridColumn>(element.columns).filter(column => column && typeof column.key === 'string');
    const rows = listOf<Row>(element.rows).filter(row => row && typeof row.id === 'string' && Array.isArray(row.cells));
    const offset = typeof element.offset === 'number' ? element.offset : 0;
    const editable = element.editable === true;
    const addable = element.addable === true && editable;
    const selectable = element.selectable === true;
    const selected = new Set(listOf<string>(element.selected));
    const frozen = Math.min(columns.length, typeof element.frozen === 'number' ? element.frozen : 1);
    const height = ROW_PX[(element.lines as keyof typeof ROW_PX) ?? 'one'] ?? ROW_PX.one;
    const search = str(element.search).toLowerCase();
    const state = keptOf<State>(element, () => ({ active: null, range: null, editing: null }));
    const update = () => element.requestUpdate();
    const cellAt = (r: number, c: number) => rows[r]?.cells[c] ?? '';
    const area = (): Range | null => (state.range ? normal(state.range) : state.active ? { r0: state.active.r, r1: state.active.r, c0: state.active.c, c1: state.active.c } : null);
    const inArea = (r: number, c: number) => {
      const a = area();

      return Boolean(a && r >= a.r0 && r <= a.r1 && c >= a.c0 && c <= a.c1);
    };
    const commit = (edits: { row: string; key: string; value: string }[]) => {
      const kept = edits.filter(edit => columns.some(column => column.key === edit.key && !column.readOnly));

      if (kept.length) element.emit('edit', { edits: kept });
    };
    const startEdit = (r: number, c: number, draft?: string) => {
      const column = columns[c];
      const row = rows[r];

      if (!editable || !column || !row || column.readOnly) return;
      if (column.type === 'checkbox') return commit([{ row: row.id, key: column.key, value: cellAt(r, c) === 'true' ? '' : 'true' }]);
      if (!INLINE_TYPES.has(column.type)) return void element.emit('open', { row: row.id, key: column.key });
      state.editing = { r, c, draft: draft ?? cellAt(r, c) };
      update();
    };
    const finish = (move: { dr: number; dc: number } | null, keep = true) => {
      const editing = state.editing;

      if (!editing) return;
      const row = rows[editing.r];

      if (keep && row && editing.draft !== cellAt(editing.r, editing.c)) commit([{ row: row.id, key: columns[editing.c]!.key, value: editing.draft }]);
      state.editing = null;
      if (move) state.active = { r: Math.max(0, Math.min(rows.length - 1, editing.r + move.dr)), c: Math.max(0, Math.min(columns.length - 1, editing.c + move.dc)) };
      update();
      queueMicrotask(() => (element.shadowRoot?.querySelector('[role="grid"]') as HTMLElement | null)?.focus());
    };
    const go = (r: number, c: number, extend: boolean) => {
      const row = Math.max(0, Math.min(rows.length - 1, r));
      const col = Math.max(0, Math.min(columns.length - 1, c));

      if (extend && state.active) state.range = { r0: state.range?.r0 ?? state.active.r, c0: state.range?.c0 ?? state.active.c, r1: row, c1: col };
      else {
        state.active = { r: row, c: col };
        state.range = null;
      }
      update();
    };
    const keys = (event: KeyboardEvent) => {
      if (state.editing || !state.active) return;
      const at = state.range ? { r: state.range.r1, c: state.range.c1 } : state.active;
      const step = (dr: number, dc: number) => {
        event.preventDefault();
        go(at.r + dr, at.c + dc, event.shiftKey);
      };

      switch (event.key) {
        case 'ArrowUp':
          return step(-1, 0);
        case 'ArrowDown':
          return step(1, 0);
        case 'ArrowLeft':
          return step(0, -1);
        case 'ArrowRight':
          return step(0, 1);
        case 'Tab':
          event.preventDefault();

          return go(state.active.r, state.active.c + (event.shiftKey ? -1 : 1), false);
        case 'Enter':
        case 'F2':
          event.preventDefault();

          return startEdit(state.active.r, state.active.c);
        case ' ':
          if (columns[state.active.c]?.type === 'checkbox') {
            event.preventDefault();
            startEdit(state.active.r, state.active.c);
          }

          return;
        case 'Delete':
        case 'Backspace': {
          if (!editable) return;
          event.preventDefault();
          const a = area()!;
          const edits: { row: string; key: string; value: string }[] = [];

          for (let r = a.r0; r <= a.r1; r += 1) for (let c = a.c0; c <= a.c1; c += 1) if (rows[r] && cellAt(r, c) !== '') edits.push({ row: rows[r]!.id, key: columns[c]!.key, value: '' });

          return commit(edits);
        }
        default:
          break;
      }
      const column = columns[state.active.c];

      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && editable && column && INLINE_TYPES.has(column.type) && column.type !== 'checkbox' && column.type !== 'select') {
        event.preventDefault();
        startEdit(state.active.r, state.active.c, event.key);
      }
    };
    const copy = (event: ClipboardEvent) => {
      const a = area();

      if (!a || state.editing || !event.clipboardData) return;
      const cells: string[][] = [];

      for (let r = a.r0; r <= a.r1; r += 1) cells.push(columns.slice(a.c0, a.c1 + 1).map((_, at) => cellAt(r, a.c0 + at)));
      const { text, html: table } = toClipboard(columns.slice(a.c0, a.c1 + 1), cells);

      event.clipboardData.setData('text/plain', text);
      event.clipboardData.setData('text/html', table);
      event.preventDefault();
    };
    const paste = (event: ClipboardEvent) => {
      const a = area();

      if (!a || state.editing || !editable || !event.clipboardData) return;
      const markup = event.clipboardData.getData('text/html');
      const pasted = (markup && parseHtmlTable(markup)) || parseTsv(event.clipboardData.getData('text/plain'));

      if (!pasted.length) return;
      event.preventDefault();
      const { edits, extra } = pasteEdits(columns, rows, a, pasted);

      commit(edits);
      if (extra.length) element.emit('add', { rows: extra });
    };
    const fillDown = () => {
      const a = area();

      if (!a || !editable || a.r1 >= rows.length - 1) return;
      const edits: { row: string; key: string; value: string }[] = [];

      for (let c = a.c0; c <= a.c1; c += 1) {
        const source = Array.from({ length: a.r1 - a.r0 + 1 }, (_, at) => cellAt(a.r0 + at, c));

        fillSeries(columns[c]!.type, source, 1).forEach(value => rows[a.r1 + 1] && edits.push({ row: rows[a.r1 + 1]!.id, key: columns[c]!.key, value }));
      }
      commit(edits);
    };
    const widthOf = (column: GridColumn) => WIDTH_PX[column.width ?? 'md'];
    const template = [`${GUTTER_PX}px`, ...columns.map(column => `${widthOf(column)}px`)].join(' ');
    const sort = element.sort && typeof element.sort === 'object' ? (element.sort as { key?: string; direction?: string }) : null;

    if (element.loading === true) {
      return html`<div class="wrap" role="status" aria-label="Loading">${[0, 1, 2].map(() => html`<div class="bone" data-slot="skeleton"></div>`)}</div>`;
    }

    const cellView = (column: GridColumn, cell: string) => {
      const hit = search && cell.toLowerCase().includes(search) ? 'hit' : '';

      if (column.type === 'checkbox') return html`<span class="box ${cell === 'true' ? 'on' : ''}" aria-label=${cell === 'true' ? 'Checked' : 'Not checked'}></span>`;
      if (column.type === 'select' || column.type === 'multi_select' || LIST_TYPES.has(column.type)) {
        const values = column.type === 'select' ? (cell ? [cell] : []) : labelsOf(cell);

        return html`<span class="pills ${hit}">${values.map(value => html`<span class="pill" data-hue=${column.choices?.find(one => one.value === value)?.hue ?? nothing}>${value}</span>`)}</span>`;
      }

      return html`<span class="text ${hit} ${['number', 'currency', 'percent', 'rating'].includes(column.type) ? 'num' : ''}">${display(column, cell)}</span>`;
    };

    return html`<div
      class="wrap"
      role="grid"
      tabindex="0"
      aria-label=${str(element.label) || nothing}
      aria-rowcount=${rows.length + 1}
      @keydown=${keys}
      @copy=${copy}
      @paste=${paste}
    >
      <div class="row head" role="row" style="grid-template-columns:${template}">
        <div role="columnheader" class="gutter">
          ${selectable
            ? html`<input
                type="checkbox"
                aria-label="Select all rows"
                .checked=${rows.length > 0 && rows.every(row => selected.has(row.id))}
                @change=${(event: Event) => element.emit('select', { rows: (event.currentTarget as HTMLInputElement).checked ? rows.map(row => row.id) : [] })}
              />`
            : nothing}
        </div>
        ${columns.map(
          (column, c) => html`<div role="columnheader" class="heading ${c < frozen ? 'frozen' : ''}" aria-sort=${sort?.key === column.key ? (sort.direction === 'desc' ? 'descending' : 'ascending') : nothing}>
            <button type="button" class="heading-button" @click=${() => element.emit('column', { key: column.key })}>${column.heading}</button>
            <button type="button" class="quiet" aria-label=${`Sort ${column.heading}`} @click=${() => element.emit('sort', { key: column.key, direction: sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc' })}>↕</button>
          </div>`,
        )}
      </div>
      ${rows.length === 0 && offset === 0
        ? html`<div class="empty" data-slot="empty-state">${str(element.empty) || 'No rows yet.'}</div>`
        : rows.map(
            (row, r) => html`<div class="row" role="row" aria-selected=${selected.has(row.id) ? 'true' : nothing} style="grid-template-columns:${template};height:${height}px">
              <div role="rowheader" class="gutter">
                ${selectable
                  ? html`<input
                      type="checkbox"
                      aria-label=${`Select row ${offset + r + 1}`}
                      .checked=${selected.has(row.id)}
                      @change=${(event: Event) => element.emit('select', { rows: (event.currentTarget as HTMLInputElement).checked ? [...selected, row.id] : [...selected].filter(id => id !== row.id) })}
                    />`
                  : html`<span class="number">${offset + r + 1}</span>`}
                <button type="button" class="quiet" aria-label=${`Open row ${offset + r + 1}`} @click=${() => element.emit('expand', { row: row.id })}>⤢</button>
              </div>
              ${columns.map((column, c) => {
                const editing = state.editing?.r === r && state.editing.c === c;

                return html`<div
                  role="gridcell"
                  class="cell ${c < frozen ? 'frozen' : ''} ${inArea(r, c) ? 'in' : ''} ${state.active?.r === r && state.active.c === c ? 'active' : ''}"
                  aria-readonly=${column.readOnly || !editable ? 'true' : nothing}
                  @pointerdown=${(event: PointerEvent) => {
                    if (editing) return;
                    if (event.shiftKey && state.active) state.range = { r0: state.active.r, c0: state.active.c, r1: r, c1: c };
                    else {
                      state.active = { r, c };
                      state.range = null;
                    }
                    update();
                  }}
                  @dblclick=${() => startEdit(r, c)}
                >
                  ${editing
                    ? column.type === 'select'
                      ? html`<select
                          aria-label=${column.heading}
                          .value=${state.editing!.draft}
                          @change=${(event: Event) => {
                            state.editing!.draft = (event.currentTarget as HTMLSelectElement).value;
                            finish({ dr: 1, dc: 0 });
                          }}
                          @blur=${() => finish(null)}
                        >
                          <option value="">—</option>
                          ${(column.choices ?? []).map(choice => html`<option value=${choice.value}>${choice.value}</option>`)}
                        </select>`
                      : html`<input
                          aria-label=${column.heading}
                          .value=${state.editing!.draft}
                          @input=${(event: Event) => (state.editing!.draft = (event.currentTarget as HTMLInputElement).value)}
                          @keydown=${(event: KeyboardEvent) => {
                            event.stopPropagation();
                            if (event.key === 'Enter') finish({ dr: 1, dc: 0 });
                            else if (event.key === 'Tab') {
                              event.preventDefault();
                              finish({ dr: 0, dc: event.shiftKey ? -1 : 1 });
                            } else if (event.key === 'Escape') finish(null, false);
                          }}
                          @blur=${() => finish(null)}
                        />`
                    : cellView(column, row.cells[c] ?? '')}
                </div>`;
              })}
            </div>`,
          )}
      ${addable ? html`<button type="button" class="add quiet" @click=${() => element.emit('add', { rows: [{}] })}>+ New row</button>` : nothing}
      ${editable && rows.length > 1 ? html`<button type="button" class="quiet fill" @click=${fillDown}>Fill down</button>` : nothing}
      <div class="row foot" role="row" style="grid-template-columns:${template}">
        <div class="gutter number">${typeof element.total === 'number' ? element.total : rows.length}</div>
        ${columns.map(column => html`<div class="stat">${column.statistic ?? ''}</div>`)}
      </div>
    </div>`;
  },
  [
    FOCUS,
    css`
      .wrap {
        display: block;
        overflow: auto;
        max-height: 44rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        font-size: 0.8125rem;
        outline: none;
      }
      .row {
        display: grid;
        min-width: max-content;
        border-bottom: 1px solid var(--line);
      }
      .head,
      .foot {
        position: sticky;
        z-index: 2;
        background: var(--layer-hover);
        color: var(--fg-muted);
      }
      .head {
        top: 0;
        height: 34px;
      }
      .foot {
        bottom: 0;
        height: 30px;
        border-top: 1px solid var(--line);
      }
      .gutter,
      .heading,
      .cell,
      .stat {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0 0.5rem;
        border-inline-end: 1px solid var(--line);
        overflow: hidden;
        white-space: nowrap;
      }
      .frozen {
        position: sticky;
        inset-inline-start: 64px;
        background: var(--background);
        z-index: 1;
      }
      .cell.in {
        background: var(--brand-soft);
      }
      .cell.active {
        outline: 2px solid var(--brand);
        outline-offset: -2px;
      }
      .num {
        margin-inline-start: auto;
        font-variant-numeric: tabular-nums;
      }
      .pills {
        display: flex;
        gap: 0.25rem;
      }
      .pill {
        padding: 0.125rem 0.5rem;
        border-radius: 999px;
        background: var(--layer-hover);
      }
      .box {
        width: 1rem;
        height: 1rem;
        border: 1px solid var(--line-strong);
        border-radius: 0.25rem;
      }
      .box.on {
        background: var(--brand);
        border-color: var(--brand);
      }
      .hit {
        background: var(--warn-soft);
      }
      .heading-button,
      .quiet {
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
        border-radius: var(--radius-sm);
      }
      .heading-button {
        flex: 1;
        text-align: start;
      }
      .empty {
        padding: 2.5rem 1.5rem;
        text-align: center;
        color: var(--fg-muted);
      }
      .add,
      .fill {
        padding: 0.5rem 0.75rem;
      }
      .bone {
        height: 2rem;
        margin: 0.25rem;
        border-radius: var(--radius-md);
        background: var(--layer-hover);
      }
      input,
      select {
        width: 100%;
        border: 0;
        background: transparent;
        font: inherit;
        outline: none;
      }
      input[type='checkbox'] {
        width: 0.875rem;
        accent-color: var(--brand);
      }
    `,
  ],
);
