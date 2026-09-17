/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { FOCUS, pick, space, str, TYPE } from './tokens.ts';

/**
 * Avatar, label, list row, empty state, skeleton and grid, as Brydio's React
 * catalogue draws them (`packages/app/src/apps/catalogue/draw/*.tsx`).
 */

/** A person's initials: the first letter of the first and the last word. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words;

  return letters.map(word => Array.from(word)[0]!.toUpperCase()).join('');
}

const PULSE = css`
  .bone {
    border-radius: var(--radius-md);
    background: var(--layer-hover);
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
`;

const SKELETONS = {
  line: html`<div class="bone line"></div>`,
  block: html`<div class="bone block"></div>`,
  row: html`<div class="row"><div class="bone dot"></div><div class="lines"><div class="bone short"></div><div class="bone long"></div></div></div>`,
} as const;

const SKELETON_STYLES = css`
  .line {
    height: 0.75rem;
    width: 100%;
  }
  .block {
    height: 6rem;
    width: 100%;
    border-radius: var(--radius-xl);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
  }
  .dot {
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
    border-radius: 9999px;
  }
  .lines {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 0.375rem;
  }
  .short {
    height: 0.75rem;
    width: 40%;
  }
  .long {
    height: 0.75rem;
    width: 60%;
  }
`;

const AVATAR_SIZES = ['sm', 'md', 'lg'] as const;

drawAs(
  'bry-avatar',
  element => {
    const name = str(element.name);
    const size = pick(AVATAR_SIZES, element.size) ?? 'md';

    return html`<span class="avatar ${size}" role="img" aria-label=${name}><span aria-hidden="true">${initials(name)}</span></span>`;
  },
  [
    css`
      :host {
        display: inline-flex;
      }
      .avatar {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        border-radius: 9999px;
        background: var(--muted);
        color: var(--fg-muted);
        user-select: none;
        width: 2rem;
        height: 2rem;
        font-size: 0.8125rem;
      }
      .sm {
        width: 1.5rem;
        height: 1.5rem;
        font-size: 0.75rem;
      }
      .lg {
        width: 2.5rem;
        height: 2.5rem;
      }
    `,
  ],
);

drawAs(
  'bry-label',
  element => html`<div class="field">
    <span class="type-label" part="label"
      >${str(element.text)}${element.required === true ? html`<span class="required" aria-hidden="true">*</span>` : nothing}</span
    >
    <slot></slot>
  </div>`,
  [
    TYPE,
    css`
      :host {
        display: block;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }
      .required {
        margin-inline-start: 0.125rem;
        color: var(--danger-fg);
      }
    `,
  ],
);

/** What takes a press of its own inside a pressable row. */
const INTERACTIVE =
  "button, a, input, textarea, select, [role='menuitem'], [role='option'], [role='combobox'], bry-button, bry-input, bry-textarea, bry-select, bry-checkbox, bry-switch, bry-menu";

drawAs(
  'bry-list-row',
  element => {
    if (element.loading === true) {
      return html`<div role="status" aria-label="Loading">${SKELETONS.row}</div>`;
    }

    const pressable = element.pressable === true;
    const selected = element.selected === true;
    const description = str(element.description);
    const meta = str(element.meta);
    const press = () => element.emit('press');

    return html`<div
      class="row ${selected ? 'selected' : ''} ${pressable ? 'pressable' : ''}"
      role=${pressable ? 'button' : nothing}
      tabindex=${pressable ? '0' : nothing}
      aria-pressed=${pressable ? String(selected) : nothing}
      @click=${pressable
        ? (event: Event) => {
            for (const target of event.composedPath()) {
              if (target === element) return press();
              if (target instanceof Element && target.matches(INTERACTIVE)) return;
            }
          }
        : nothing}
      @keydown=${pressable
        ? (event: KeyboardEvent) => {
            if (event.composedPath()[0] !== event.currentTarget) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            press();
          }
        : nothing}
    >
      <div class="text">
        <p class="type-ui truncate">${str(element.title)}</p>
        ${description ? html`<p class="type-caption truncate">${description}</p>` : nothing}
      </div>
      <slot></slot>
      ${meta ? html`<p class="type-caption meta">${meta}</p>` : nothing}
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    PULSE,
    SKELETON_STYLES,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .row {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.75rem;
        border-radius: var(--radius-lg);
        padding: 0.5rem 0.75rem;
      }
      .selected {
        background: var(--layer-selected);
      }
      .pressable {
        cursor: pointer;
        transition: background-color var(--dur-fast);
      }
      .pressable:hover {
        background: var(--layer-hover);
      }
      .text {
        display: flex;
        min-width: 0;
        flex: 1;
        flex-direction: column;
      }
      .truncate {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        flex-shrink: 0;
      }
    `,
  ],
);

drawAs(
  'bry-empty-state',
  element => {
    const text = str(element.text);
    const action = str(element.action);

    return html`<div class="empty">
      <p class="title">${str(element.title)}</p>
      ${text ? html`<p class="line">${text}</p>` : nothing}
      ${action ? html`<div class="action"><button type="button" @click=${() => element.emit('action')}>${action}</button></div>` : nothing}
    </div>`;
  },
  [
    FOCUS,
    css`
      :host {
        display: block;
      }
      .empty {
        border: 1px dashed var(--line);
        border-radius: var(--radius-xl);
        padding: 2.5rem 1.5rem;
        text-align: center;
      }
      p {
        margin: 0 auto;
        max-width: 65ch;
        font-size: 0.9375rem;
        line-height: 1.5rem;
        letter-spacing: -0.006em;
      }
      .title {
        font-weight: 500;
        color: var(--fg-strong);
      }
      .line {
        margin-top: 0.25rem;
        color: var(--fg-muted);
      }
      .action {
        margin-top: 1rem;
      }
      /* The kit's outline button, small. */
      button {
        height: var(--control-h-sm);
        padding: 0 0.625rem;
        border: 1px solid var(--line-strong);
        border-radius: var(--radius-md);
        background: var(--bg-surface);
        color: var(--fg-strong);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
      }
      button:hover {
        background: var(--layer-hover);
      }
      button:active {
        background: var(--layer-press);
      }
    `,
  ],
);

const SHAPES = ['line', 'block', 'row'] as const;

drawAs(
  'bry-skeleton',
  element => {
    const shape = pick(SHAPES, element.shape) ?? 'line';
    const count = typeof element.count === 'number' && element.count >= 1 ? Math.min(12, Math.floor(element.count)) : 1;

    return html`<div class="stack" data-shape=${shape} role="status" aria-label="Loading" style="gap: ${space(shape === 'line' ? 2 : 3)}">
      ${Array.from({ length: count }, () => SKELETONS[shape])}
    </div>`;
  },
  [
    PULSE,
    SKELETON_STYLES,
    css`
      :host {
        display: block;
      }
      .stack {
        display: flex;
        flex-direction: column;
      }
    `,
  ],
);

const COLUMNS = ['1', '2', '3', '4', '5', '6'] as const;
const GAPS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
const ALIGN = { start: 'start', center: 'center', end: 'end', stretch: 'stretch' } as const;

drawAs(
  'bry-grid',
  element => {
    const columns = pick(COLUMNS, element.columns) ?? '1';
    const gap = pick(GAPS, element.gap);
    const align = ALIGN[str(element.align) as keyof typeof ALIGN];

    return html`<div class="container">
      <div class="grid" data-columns=${columns} style="gap: ${gap ? space(Number(gap)) : '0'}; align-items: ${align ?? 'normal'}">
        <slot></slot>
      </div>
    </div>`;
  },
  [
    css`
      :host {
        display: block;
        min-width: 0;
      }
      /* Columns follow the grid's own width, not the window's, as the kit's
         container queries do (@md 28rem, @3xl 48rem, @4xl 56rem, @5xl 64rem, @6xl 72rem). */
      .container {
        container-type: inline-size;
        min-width: 0;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(1, minmax(0, 1fr));
      }
      @container (min-width: 28rem) {
        .grid:not([data-columns='1']) {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @container (min-width: 48rem) {
        .grid[data-columns='3'],
        .grid[data-columns='4'],
        .grid[data-columns='5'],
        .grid[data-columns='6'] {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @container (min-width: 56rem) {
        .grid[data-columns='4'],
        .grid[data-columns='5'],
        .grid[data-columns='6'] {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      @container (min-width: 64rem) {
        .grid[data-columns='5'],
        .grid[data-columns='6'] {
          grid-template-columns: repeat(5, minmax(0, 1fr));
        }
      }
      @container (min-width: 72rem) {
        .grid[data-columns='6'] {
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }
      }
    `,
  ],
);
