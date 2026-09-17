/// <reference lib="dom" />
import { css, html, nothing, type TemplateResult } from '../base.ts';
import { drawAs } from '../define.ts';
import { FOCUS, pick, str, TYPE } from './tokens.ts';

/**
 * `bry-file-grid`: a folder's files as tiles, as the kit's `FileGrid` draws
 * them (Brydio's `packages/ui/src/components/file-grid.tsx`).
 *
 * Windowed like `bry-virtual-list`: `count` is the whole folder and `files`
 * holds the tiles from `start`. Scrolling says `range { start, end }` and the
 * app sends that window; **nothing here fetches anything**.
 *
 * **No previews, on purpose.** In Brydio a `preview` is a source id that the
 * host reads with the person's own access. A web component in somebody
 * else's page has no Brydio session and no such right, and turning an id
 * into an address here would either break or point the element at whatever
 * the page liked. So a tile shows what kind of file it is, and `preview` is
 * carried but not drawn.
 */

interface File {
  id: string;
  name: string;
  kind: string;
  size?: number;
  modified?: string;
}

interface MenuItem {
  id: string;
  label: string;
  tone?: 'default' | 'danger';
}

type Element = HTMLElement &
  Record<string, unknown> & { emit(name: string, detail?: unknown): boolean; requestUpdate(): void; updateComplete: Promise<unknown> };

/** A tile's width and height by size, in rem, as the kit has them. */
const TILE = { sm: { width: 7, height: 8 }, md: { width: 9.5, height: 10.5 }, lg: { width: 13, height: 14 } } as const;
/** Rows drawn beyond each edge, so a scroll doesn't show a gap. */
const OVERSCAN = 2;
const LOADING_TILES = 6;

/** What a tile says it is, since this build ships no icon set. */
const KIND_WORDS: Record<string, string> = {
  document: 'Document',
  spreadsheet: 'Sheet',
  presentation: 'Slides',
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  code: 'Code',
  archive: 'Archive',
  folder: 'Folder',
  other: 'File',
};

const whole = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;

/** How many tiles fit across, never fewer than one. */
export function columnsIn(width: number, tileWidth: number): number {
  return Math.max(1, Math.floor(width / tileWidth) || 1);
}

/** The rows in view, with a few either side, as tile numbers. */
export function tilesIn(
  scrollTop: number,
  height: number,
  tileHeight: number,
  columns: number,
  count: number
): { start: number; end: number } {
  if (tileHeight <= 0 || count === 0) return { start: 0, end: 0 };

  const firstRow = Math.max(0, Math.floor(scrollTop / tileHeight) - OVERSCAN);
  const lastRow = Math.ceil((scrollTop + height) / tileHeight) + OVERSCAN;

  return { start: firstRow * columns, end: Math.min(count, Math.max(firstRow * columns, lastRow * columns)) };
}

/** Where an arrow takes the tile in hand, reading before and after rather than left and right. */
export function steppedTo(key: string, at: number, columns: number, count: number, rtl: boolean): number | null {
  const sideways = rtl ? -1 : 1;
  const steps: Record<string, number> = {
    ArrowRight: sideways,
    ArrowLeft: -sideways,
    ArrowDown: columns,
    ArrowUp: -columns,
  };
  const step = steps[key];

  if (step === undefined || count === 0) return null;

  return Math.max(0, Math.min(count - 1, at + step));
}

/**
 * What a press chooses: one tile, the same tile added or taken away
 * (⌘ or Ctrl), or everything between the anchor and here (Shift). The same
 * three the kit makes, so a folder behaves the way a folder does.
 */
export function chosenBy(
  index: number,
  anchor: number | null,
  selected: readonly string[],
  idOf: (index: number) => string | undefined,
  press: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }
): string[] | null {
  const id = idOf(index);

  if (id === undefined) return null;

  if (press.shiftKey && anchor !== null) {
    const from = Math.min(anchor, index);
    const to = Math.max(anchor, index);
    const range: string[] = [];

    for (let at = from; at <= to; at += 1) {
      const one = idOf(at);

      if (one !== undefined) range.push(one);
    }

    return range;
  }

  if (press.metaKey === true || press.ctrlKey === true) {
    return selected.includes(id) ? selected.filter(one => one !== id) : [...selected, id];
  }

  return [id];
}

interface Held {
  active: number;
  anchor: number | null;
  asked: string;
  open: string | null;
}

const held = new WeakMap<object, Held>();

drawAs(
  'bry-file-grid',
  element => {
    const grid = element as Element;
    const count = whole(element.count, 0);
    const start = whole(element.start, 0);
    const size = pick(['sm', 'md', 'lg'] as const, element.tileSize) ?? 'md';
    const tile = TILE[size];
    const files = (Array.isArray(element.files) ? element.files : []).flatMap((raw: unknown) => {
      const one = (raw ?? {}) as Record<string, unknown>;
      const id = str(one.id);
      const name = str(one.name);

      if (!id || !name) return [];

      return [
        {
          id,
          name,
          kind: str(one.kind) || 'other',
          ...(typeof one.size === 'number' ? { size: one.size } : {}),
          ...(str(one.modified) ? { modified: str(one.modified) } : {}),
        } as File,
      ];
    });
    const items: MenuItem[] = (Array.isArray(element.menu) ? element.menu : []).flatMap((raw: unknown) => {
      const one = (raw ?? {}) as Record<string, unknown>;
      const id = str(one.id);
      const label = str(one.label);

      return id && label ? [{ id, label, ...(one.tone === 'danger' ? { tone: 'danger' as const } : {}) }] : [];
    });
    const selectable = element.selectable === true;
    const selected = (Array.isArray(element.selected) ? element.selected : []).filter(
      (one: unknown): one is string => typeof one === 'string'
    );
    const label = str(element.label);

    let state = held.get(grid);

    if (!state) {
      state = { active: start, anchor: null, asked: '', open: null };
      held.set(grid, state);
    }

    const current = state;

    if (element.loading === true) {
      return html`<div class="loading" role="status" aria-label="Loading" style=${`--bry-tile: ${tile.width}rem`}>
        ${Array.from({ length: LOADING_TILES }, () => html`<div class="bone" style=${`height: ${tile.height}rem`}></div>`)}
      </div>`;
    }

    if (count === 0) {
      return html`<div class="empty" data-empty><p class="type-body">${str(element.empty) || 'Nothing here yet.'}</p></div>`;
    }

    const at = (index: number): File | undefined =>
      index >= start && index < start + files.length ? files[index - start] : undefined;
    const idOf = (index: number): string | undefined => at(index)?.id;

    const choose = (index: number, press: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
      if (!selectable) return;

      const ids = chosenBy(index, current.anchor, selected, idOf, press);

      if (ids === null) return;

      current.active = index;
      if (!press.shiftKey) current.anchor = index;
      grid.emit('select', { ids });
      grid.requestUpdate();
    };

    const open = (index: number) => {
      const id = idOf(index);

      if (id !== undefined) grid.emit('open', { id });
    };

    const ask = (scroller: HTMLElement) => {
      const columns = columnsIn(scroller.clientWidth, tile.width * 16);
      const next = tilesIn(scroller.scrollTop, scroller.clientHeight, tile.height * 16, columns, count);
      const asked = `${next.start}:${next.end}`;

      if (current.asked === asked || next.end <= next.start) return;

      current.asked = asked;
      grid.emit('range', next);
    };

    const steer = (event: KeyboardEvent, index: number) => {
      const rtl = getComputedStyle(grid).direction === 'rtl';

      if (event.key === 'Enter') {
        event.preventDefault();
        open(index);

        return;
      }

      if (event.key === ' ' && selectable) {
        event.preventDefault();
        choose(index, { shiftKey: event.shiftKey, metaKey: true });

        return;
      }

      const box = event.currentTarget as HTMLElement;
      const columns = columnsIn(box.closest('.scroller')?.clientWidth ?? 0, tile.width * 16);
      const next = steppedTo(event.key, index, columns, count, rtl);

      if (next === null) return;

      event.preventDefault();
      current.active = next;

      if (selectable && event.shiftKey) choose(next, { shiftKey: true });
      else grid.requestUpdate();

      void grid.updateComplete.then(() => {
        (grid.renderRoot as ParentNode).querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
      });
    };

    const meta = (file: File): string => {
      const parts: string[] = [];

      if (typeof file.size === 'number') parts.push(`${Math.max(1, Math.round(file.size / 1024))} KB`);
      if (file.modified && !Number.isNaN(Date.parse(file.modified))) {
        parts.push(new Date(file.modified).toISOString().slice(0, 10));
      }

      return parts.join(' · ');
    };

    const menuFor = (file: File): TemplateResult => html`<div class="menu-holder">
      <button
        type="button"
        class="more"
        data-menu-for=${file.id}
        aria-label=${`More for ${file.name}`}
        aria-haspopup="menu"
        aria-expanded=${current.open === file.id ? 'true' : 'false'}
        @click=${(event: MouseEvent) => {
          event.stopPropagation();
          current.open = current.open === file.id ? null : file.id;
          grid.requestUpdate();
        }}
      >
        ⋯
      </button>
      ${current.open === file.id
        ? html`<div class="menu" role="menu">
            ${items.map(
              item => html`<button
                type="button"
                role="menuitem"
                class=${item.tone === 'danger' ? 'danger' : ''}
                @click=${(event: MouseEvent) => {
                  event.stopPropagation();
                  current.open = null;
                  grid.emit('menu', { file: file.id, item: item.id });
                  grid.requestUpdate();
                }}
              >
                ${item.label}
              </button>`,
            )}
          </div>`
        : nothing}
    </div>`;

    // Every place in the whole folder, so the scrollbar is the folder's
    // length; the ones outside the window are empty until the app sends them.
    const places = Array.from({ length: count }, (_, index) => index).slice(
      Math.max(0, start - 1),
      Math.min(count, start + files.length + 1),
    );

    return html`<div
      class="scroller"
      style=${`--bry-tile: ${tile.width}rem; --bry-tile-height: ${tile.height}rem`}
      @scroll=${(event: Event) => ask(event.currentTarget as HTMLElement)}
    >
      <div class="tall" style=${`height: ${Math.ceil(count) * tile.height}rem`}>
        <div
          class="tiles"
          role=${selectable ? 'listbox' : 'list'}
          aria-label=${label || nothing}
          aria-multiselectable=${selectable ? 'true' : nothing}
        >
          ${places.map(index => {
            const file = at(index);

            if (!file) return html`<div class="tile blank" aria-hidden="true"></div>`;

            const chosen = selectable && selected.includes(file.id);

            return html`<div
              class="tile"
              data-index=${index}
              data-file=${file.id}
              data-kind=${file.kind}
              role=${selectable ? 'option' : 'listitem'}
              aria-selected=${selectable ? String(chosen) : nothing}
              aria-label=${file.name}
              aria-setsize=${count}
              aria-posinset=${index + 1}
              tabindex=${index === current.active ? '0' : '-1'}
              @click=${(event: MouseEvent) => {
                if ((event.target as Element).closest('.menu-holder')) return;
                if (selectable) choose(index, event);
                else open(index);
              }}
              @dblclick=${() => selectable && open(index)}
              @keydown=${(event: KeyboardEvent) => steer(event, index)}
            >
              <div class="mark" aria-hidden="true">${KIND_WORDS[file.kind] ?? KIND_WORDS.other}</div>
              <p class="name type-label" title=${file.name}>${file.name}</p>
              ${meta(file) ? html`<p class="meta type-caption">${meta(file)}</p>` : nothing}
              ${items.length ? menuFor(file) : nothing}
            </div>`;
          })}
        </div>
      </div>
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
      .scroller {
        max-height: 70dvh;
        overflow-y: auto;
        min-width: 0;
      }
      .tall {
        position: relative;
        width: 100%;
      }
      .tiles,
      .loading {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(var(--bry-tile, 9.5rem), 1fr));
        gap: 0.75rem;
      }
      .tile {
        position: relative;
        height: var(--bry-tile-height, 10.5rem);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.5rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg, 0.75rem);
        background: var(--bg);
        outline: none;
        cursor: pointer;
      }
      .tile.blank {
        border-style: dashed;
        opacity: 0.4;
        cursor: default;
      }
      .tile[aria-selected='true'] {
        background: var(--layer-selected);
        border-color: var(--brand);
      }
      .mark {
        flex: 1;
        display: grid;
        place-items: center;
        border-radius: var(--radius-md, 0.5rem);
        background: var(--bg-sunken, var(--line));
        font-size: 0.75rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--fg-muted);
      }
      .name {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        margin: 0;
      }
      .menu-holder {
        position: absolute;
        inset-block-start: 0.5rem;
        inset-inline-end: 0.5rem;
      }
      .more {
        border: 1px solid var(--line);
        border-radius: var(--radius-md, 0.5rem);
        background: var(--bg);
        color: var(--fg);
        cursor: pointer;
        line-height: 1;
        padding: 0.125rem 0.375rem;
      }
      .menu {
        position: absolute;
        inset-inline-end: 0;
        inset-block-start: 100%;
        z-index: 1;
        min-width: 9rem;
        display: flex;
        flex-direction: column;
        padding: 0.25rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-md, 0.5rem);
        background: var(--bg-raised, var(--bg));
        box-shadow: var(--shadow-md, 0 8px 24px rgb(0 0 0 / 0.12));
      }
      .menu button {
        text-align: start;
        background: none;
        border: 0;
        padding: 0.375rem 0.5rem;
        border-radius: 0.375rem;
        font: inherit;
        color: var(--fg);
        cursor: pointer;
      }
      .menu button:hover {
        background: var(--layer-hover, var(--bg-sunken));
      }
      .menu button.danger {
        color: var(--danger, crimson);
      }
      .bone {
        border-radius: var(--radius-lg, 0.75rem);
        background: var(--bg-sunken, var(--line));
      }
      .empty {
        padding: calc(0.25rem * 6);
        text-align: center;
      }
    `,
  ],
);
