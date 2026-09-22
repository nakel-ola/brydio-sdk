/// <reference lib="dom" />
import { css, html, nothing, svg, type TemplateResult } from '../base.ts';
import { drawAs } from '../define.ts';
import { initials } from './layout.ts';
import { FOCUS, pick, str, TYPE } from './tokens.ts';

/**
 * ADR-A23 (catalogue-a): the shadcn elements that show something, drawn as
 * Brydio's React catalogue draws them (`packages/app/src/apps/catalogue/draw/`)
 * with the kit's classes turned into the token variables they stand for.
 */

type Element = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean };

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const TONES = ['neutral', 'brand', 'success', 'warn', 'danger'] as const;

/** A tone's soft tint, its edge and its ink, as the kit's status notes use them. */
const TINT = {
  neutral: ['var(--bg-fill)', 'var(--line)', 'var(--fg-muted)'],
  brand: ['var(--brand-soft)', 'var(--brand-line)', 'var(--brand-fg)'],
  success: ['var(--success-soft)', 'var(--success-line)', 'var(--success-fg)'],
  warn: ['var(--warn-soft)', 'var(--warn-line)', 'var(--warn-fg)'],
  danger: ['var(--danger-soft)', 'var(--danger-line)', 'var(--danger-fg)'],
} as const;

/** A 16px line glyph, drawn in the current colour. */
const glyph = (path: string, label = '') =>
  html`<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-glyph=${label}><path d=${path}></path></svg>`;

const GLYPH = {
  info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7.5v4M8 5h.01',
  check: 'M3.5 8.5l3 3 6-7',
  danger: 'M8 1.8 15 14H1L8 1.8ZM8 6.5v3.5M8 12h.01',
  chevron: 'M6 3.5 10.5 8 6 12.5',
  dismiss: 'M4 4l8 8M12 4l-8 8',
  file: 'M4 1.5h5l3.5 3.5v9.5h-8.5zM9 1.5V5h3.5',
  retry: 'M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3h-3',
} as const;

const UNSEEN = css`
  .unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
`;

drawAs(
  'bry-alert',
  element => {
    const tone = pick(TONES, element.tone) ?? 'neutral';
    const [fill, edge, ink] = TINT[tone];
    const icon = tone === 'success' ? GLYPH.check : tone === 'warn' || tone === 'danger' ? GLYPH.danger : GLYPH.info;
    const description = str(element.description);

    return html`<div
      class="alert"
      data-tone=${tone}
      role=${tone === 'warn' || tone === 'danger' ? 'alert' : 'status'}
      style="background: ${tone === 'neutral' ? 'var(--card)' : fill}; border-color: ${edge}"
    >
      <span class="icon" style="color: ${ink}">${glyph(icon)}</span>
      <div class="words">
        <p class="type-label">${str(element.title)}</p>
        ${description ? html`<p class="type-caption">${description}</p>` : nothing}
        <slot></slot>
      </div>
    </div>`;
  },
  [
    TYPE,
    css`
      :host {
        display: block;
      }
      .alert {
        display: flex;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border: 1px solid;
        border-radius: var(--radius-lg);
        color: var(--fg);
      }
      .icon {
        display: inline-flex;
        padding-top: 0.125rem;
      }
      .words {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.25rem;
      }
    `,
  ],
);

/** 48200 as "47.1 kB", the person's way. */
export function sizeOf(bytes: number, locale?: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return new Intl.NumberFormat(locale, { style: 'unit', unit: units[unit], unitDisplay: 'short', maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value);
}

drawAs(
  'bry-attachment',
  element => {
    const name = str(element.name);
    const size = typeof element.bytes === 'number' ? sizeOf(element.bytes) : '';
    const body = html`<span class="kind" data-kind=${str(element.kind) || 'other'}>${glyph(GLYPH.file)}</span>
      <span class="words"><span class="type-ui name">${name}</span>${size ? html`<span class="type-caption">${size}</span>` : nothing}</span>`;

    return html`<div class="chip">
      ${element.pressable === true
        ? html`<button type="button" class="open" @click=${() => element.emit('open')}>${body}</button>`
        : html`<span class="open">${body}</span>`}
      ${element.removable === true
        ? html`<button type="button" class="remove" aria-label="Remove ${name}" @click=${() => element.emit('remove')}>${glyph(GLYPH.dismiss)}</button>`
        : nothing}
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: inline-flex;
        max-width: 18rem;
        min-width: 0;
      }
      .chip {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: 0.25rem;
        padding: 0.375rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: var(--card);
      }
      .open {
        display: flex;
        min-width: 0;
        flex: 1;
        align-items: center;
        gap: 0.625rem;
        padding-block: 0.125rem;
        padding-inline: 0.125rem 0.5rem;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        font: inherit;
        color: inherit;
        text-align: start;
      }
      button.open {
        cursor: pointer;
      }
      button.open:hover,
      .remove:hover {
        background: var(--layer-hover);
      }
      .kind {
        display: inline-flex;
        width: 2rem;
        height: 2rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-md);
        background: var(--bg-fill);
        color: var(--fg-muted);
      }
      .words {
        display: flex;
        min-width: 0;
        flex-direction: column;
      }
      .name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .remove {
        display: inline-flex;
        width: 1.5rem;
        height: 1.5rem;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--fg-muted);
        cursor: pointer;
      }
    `,
  ],
);

drawAs(
  'bry-breadcrumb',
  element => {
    const steps = list<{ id: string; label: string }>(element.items);

    return html`<nav aria-label="Breadcrumb">
      <ol class="type-ui">
        ${steps.map(
          (step, index) => html`${index > 0 ? html`<li class="sep" role="presentation" aria-hidden="true">${glyph(GLYPH.chevron)}</li>` : nothing}
            <li>
              ${index === steps.length - 1
                ? html`<span aria-current="page" class="here">${step.label}</span>`
                : html`<button type="button" @click=${() => element.emit('select', { id: step.id })}>${step.label}</button>`}
            </li>`,
        )}
      </ol>
    </nav>`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: block;
      }
      ol {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.375rem;
        margin: 0;
        padding: 0;
        list-style: none;
        color: var(--fg-muted);
      }
      li {
        display: inline-flex;
        align-items: center;
      }
      .sep svg {
        width: 0.875rem;
        height: 0.875rem;
      }
      :host(:dir(rtl)) .sep svg {
        transform: scaleX(-1);
      }
      button {
        border: 0;
        border-radius: var(--radius-xs);
        background: transparent;
        padding: 0;
        font: inherit;
        color: inherit;
        cursor: pointer;
      }
      button:hover {
        color: var(--fg);
      }
      .here {
        font-weight: 500;
        color: var(--fg);
      }
    `,
  ],
);

drawAs(
  'bry-bubble',
  element => {
    const self = element.from === 'self';

    element.toggleAttribute('data-self', self);

    return html`<div class="bubble ${self ? 'self' : 'other'}">${str(element.text)}<slot></slot></div>`;
  },
  [
    css`
      :host {
        display: flex;
        min-width: 0;
        max-width: 85%;
        align-self: flex-start;
      }
      :host([data-self]) {
        align-self: flex-end;
      }
      .bubble {
        max-width: 100%;
        padding: 0.625rem 1rem;
        border-radius: var(--bubble-radius);
        font-size: 0.9375rem;
        line-height: 1.5rem;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .self {
        background: var(--bubble-user);
        color: var(--bubble-user-fg);
      }
      .other {
        border: 1px solid var(--bubble-brydio-line);
        background: var(--bubble-brydio);
        color: var(--bubble-brydio-fg);
      }
    `,
  ],
);

/** The keys a shortcut names, as the kit's `Kbd` writes them off a Mac. */
const KEYS: Record<string, string> = { mod: 'Ctrl', meta: 'Win', alt: 'Alt', shift: 'Shift', enter: 'Enter', esc: 'Esc', backspace: 'Backspace', up: '↑', down: '↓' };

export const keysOf = (keys: string): string =>
  keys
    .split('+')
    .map(raw => {
      const key = raw.trim().toLowerCase();

      return KEYS[key] ?? (key.length === 1 ? key.toUpperCase() : raw.trim());
    })
    .join('+');

drawAs('bry-kbd', element => html`<kbd>${keysOf(str(element.text))}</kbd>`, [
  css`
    :host {
      display: inline-flex;
    }
    kbd {
      display: inline-flex;
      height: 1.25rem;
      min-width: 1.25rem;
      align-items: center;
      justify-content: center;
      padding: 0 0.375rem;
      border: 1px solid var(--line);
      border-radius: var(--radius-xs);
      background: var(--bg-fill);
      font: inherit;
      font-size: 0.6875rem;
      font-weight: 500;
      color: var(--fg-muted);
    }
  `,
]);

drawAs(
  'bry-marker',
  element => {
    const tone = pick(TONES, element.tone) ?? 'neutral';
    const [fill, , ink] = TINT[tone];
    const text = str(element.text);

    return html`<div role="separator" aria-label=${text} data-tone=${tone}>
      <span class="rule" aria-hidden="true"></span>
      <span class="label type-caption" aria-hidden="true" style="color: ${ink}; background: ${tone === 'neutral' ? 'transparent' : fill}">${text}</span>
      <span class="rule" aria-hidden="true"></span>
    </div>`;
  },
  [
    TYPE,
    css`
      :host {
        display: block;
      }
      div {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .rule {
        height: 1px;
        flex: 1;
        background: var(--line-faint);
      }
      .label {
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        font-weight: 500;
      }
    `,
  ],
);

drawAs(
  'bry-message',
  element => {
    const name = str(element.name);
    const meta = str(element.meta);
    const self = element.from === 'self';

    return html`<article aria-label=${name} class=${self ? 'self' : ''} aria-busy=${element.status === 'sending' ? 'true' : nothing}>
      <span class="avatar" aria-hidden="true">${initials(name)}</span>
      <div class="body">
        <header><span class="type-label">${name}</span>${meta ? html`<span class="type-caption">${meta}</span>` : nothing}</header>
        <slot></slot>
        ${element.status === 'sending' ? html`<p class="type-caption status">Sending…</p>` : nothing}
        ${element.status === 'failed'
          ? html`<p class="type-caption status failed" role="alert">
              Not sent.
              <button type="button" @click=${() => element.emit('retry')}>${glyph(GLYPH.retry)} Retry</button>
            </p>`
          : nothing}
      </div>
    </article>`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: block;
      }
      article {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
      }
      .self {
        flex-direction: row-reverse;
      }
      .avatar {
        display: inline-flex;
        width: 1.5rem;
        height: 1.5rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        margin-top: 0.125rem;
        border-radius: 9999px;
        background: var(--bg-fill);
        font-size: 0.6875rem;
        color: var(--fg-muted);
      }
      .body {
        display: flex;
        min-width: 0;
        flex: 1;
        flex-direction: column;
        gap: 0.375rem;
      }
      .self .body {
        align-items: flex-end;
      }
      header {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
      }
      .status {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .failed {
        color: var(--danger-fg);
      }
      button {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        height: var(--control-h-sm);
        padding: 0 0.5rem;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        font: inherit;
        font-size: 0.8125rem;
        color: var(--fg-soft);
        cursor: pointer;
      }
      button:hover {
        background: var(--layer-hover);
      }
    `,
  ],
);

drawAs(
  'bry-progress',
  element => {
    const value = typeof element.value === 'number' ? Math.min(100, Math.max(0, element.value)) : null;

    return html`<div
      role="progressbar"
      aria-label=${str(element.label)}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow=${value === null ? nothing : value}
      data-state=${value === null ? 'indeterminate' : 'loading'}
    >
      <span style="width: ${value ?? 0}%"></span>
    </div>`;
  },
  [
    css`
      :host {
        display: block;
      }
      div {
        position: relative;
        height: 0.5rem;
        overflow: hidden;
        border-radius: 9999px;
        background: var(--brand-soft);
      }
      span {
        display: block;
        height: 100%;
        background: var(--brand);
        transition: width var(--dur-base);
      }
    `,
  ],
);

drawAs(
  'bry-separator',
  element => {
    element.toggleAttribute('data-vertical', element.orientation === 'vertical');

    return html`<div role="none"></div>`;
  },
  [
    css`
      :host {
        display: block;
        align-self: stretch;
      }
      div {
        width: 100%;
        height: 1px;
        background: var(--line);
      }
      :host([data-vertical]) div {
        width: 1px;
        height: 100%;
        min-height: 1rem;
      }
    `,
  ],
);

const SPINNER = { sm: '0.875rem', md: '1rem', lg: '1.5rem' } as const;

drawAs(
  'bry-spinner',
  element => {
    const size = SPINNER[pick(['sm', 'md', 'lg'] as const, element.size) ?? 'md'];

    return html`<span role="status" aria-label=${str(element.label) || 'Loading'}>
      <span class="ring" aria-hidden="true" style="width: ${size}; height: ${size}"></span>
    </span>`;
  },
  [
    css`
      :host {
        display: inline-flex;
      }
      [role='status'] {
        display: inline-flex;
        align-items: center;
      }
      .ring {
        display: block;
        border: 2px solid var(--line);
        border-top-color: var(--fg-muted);
        border-radius: 9999px;
        animation: spin 0.8s linear infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .ring {
          animation: none;
        }
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
);

const ITEM_VARIANTS = ['default', 'outline', 'muted'] as const;

drawAs(
  'bry-item',
  element => {
    if (element.loading === true) {
      return html`<div class="loading" role="status" aria-label="Loading"><span class="dot"></span><span class="bar"></span></div>`;
    }

    const variant = pick(ITEM_VARIANTS, element.variant) ?? 'default';
    const pressable = element.pressable === true;
    const description = str(element.description);
    const press = (event: Event) => {
      // A control inside the item has its own press.
      if (event.composedPath().some(node => node instanceof HTMLElement && node !== element && node.matches('button, a, input, [role="switch"], [role="checkbox"]') && element.contains(node))) return;
      element.emit('press');
    };

    return html`<div
      class="item ${variant} ${element.size === 'sm' ? 'sm' : 'md'}"
      role=${pressable ? 'button' : nothing}
      tabindex=${pressable ? 0 : nothing}
      @click=${pressable ? press : nothing}
      @keydown=${pressable
        ? (event: KeyboardEvent) => {
            if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            element.emit('press');
          }
        : nothing}
    >
      ${element.icon ? html`<span class="media">${glyph(GLYPH.info, str(element.icon))}</span>` : nothing}
      <div class="words">
        <p class="type-ui title">${str(element.title)}</p>
        ${description ? html`<p class="type-caption">${description}</p>` : nothing}
      </div>
      <div class="actions"><slot></slot></div>
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: block;
      }
      .item {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        border: 1px solid transparent;
        border-radius: var(--radius-lg);
      }
      .md {
        gap: 0.75rem;
        padding: 1rem;
      }
      .sm {
        gap: 0.625rem;
        padding: 0.5rem 0.75rem;
      }
      .outline {
        border-color: var(--line);
      }
      .muted {
        background: var(--bg-fill);
      }
      [role='button'] {
        cursor: pointer;
      }
      [role='button']:hover {
        background: var(--layer-hover);
      }
      .media {
        display: inline-flex;
        width: 2rem;
        height: 2rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-md);
        background: var(--bg-fill);
        color: var(--fg-muted);
      }
      .words {
        display: flex;
        min-width: 0;
        flex: 1;
        flex-direction: column;
        gap: 0.125rem;
      }
      .title {
        font-weight: 500;
      }
      .actions {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.5rem;
      }
      .loading {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0;
      }
      .dot,
      .bar {
        border-radius: var(--radius-md);
        background: var(--bg-fill);
      }
      .dot {
        width: 2rem;
        height: 2rem;
      }
      .bar {
        height: 0.75rem;
        flex: 1;
      }
    `,
  ],
);

/**
 * The chart, as the kit draws it: series in `--chart-1` onwards, in order; a
 * faint horizontal grid; muted tick labels; a legend for two or more
 * series; a pie of five slices and "Other"; and the numbers as a table.
 */
const W = 480;
const H = 240;
const PAD = { top: 12, end: 12, bottom: 28, start: 44 };

/** The kit's six chart colours, named in full so each is a token the stylesheet declares. */
const CHART = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'] as const;

const colour = (index: number) => CHART[index % CHART.length]!;

interface Series {
  name: string;
  values: number[];
}

/** The pie's slices: the five largest, in the given order, and the rest summed. */
export function pieSlices(categories: readonly string[], values: readonly number[]): { name: string; value: number }[] {
  const all = categories.map((name, index) => ({ name, value: Math.max(0, values[index] ?? 0) }));

  if (all.length <= 6) return all;

  const kept = new Set(
    all
      .map((slice, index) => ({ ...slice, index }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map(slice => slice.index),
  );

  return [...all.filter((_, index) => kept.has(index)), { name: 'Other', value: all.filter((_, index) => !kept.has(index)).reduce((sum, slice) => sum + slice.value, 0) }];
}

/** A round step for about four gridlines over `span`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(span: number): number {
  const rough = span / 4;
  const power = 10 ** Math.floor(Math.log10(rough));

  return ([1, 2, 2.5, 5, 10].find(step => step * power >= rough) ?? 10) * power;
}

function cartesian(kind: string, categories: string[], series: Series[], format: (value: number) => string, stacked: boolean): TemplateResult {
  const totals = categories.map((_, index) => series.reduce((sum, one) => sum + Math.max(0, one.values[index] ?? 0), 0));
  const values = series.flatMap(one => one.values);
  const step = niceStep(Math.max(1, ...(stacked ? totals : values)) - Math.min(0, ...values));
  const top = Math.ceil(Math.max(1, ...(stacked ? totals : values)) / step) * step;
  const bottom = Math.floor(Math.min(0, ...values) / step) * step;
  const x0 = PAD.start;
  const x1 = W - PAD.end;
  const y0 = PAD.top;
  const y1 = H - PAD.bottom;
  const y = (value: number) => y1 - ((value - bottom) / (top - bottom)) * (y1 - y0);
  const band = (x1 - x0) / Math.max(1, categories.length);
  const ticks = Array.from({ length: Math.round((top - bottom) / step) + 1 }, (_, n) => bottom + n * step);
  const frame = (inner: unknown) => html`<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
    ${ticks.map(
      tick => svg`<line x1=${x0} x2=${x1} y1=${y(tick)} y2=${y(tick)} stroke="var(--chart-grid)"></line>
        <text x=${x0 - 8} y=${y(tick) + 4} text-anchor="end" class="tick">${format(tick)}</text>`,
    )}
    ${categories.map((category, index) => svg`<text x=${x0 + band * (index + 0.5)} y=${H - 8} text-anchor="middle" class="tick">${category}</text>`)}
    ${inner}
  </svg>`;

  if (kind === 'bar') {
    const width = Math.min(32, (band * 0.8 - 2 * (series.length - 1)) / (stacked ? 1 : series.length));

    return frame(
      categories.map((_, index) => {
        let base = 0;

        return series.map((one, n) => {
          const value = one.values[index] ?? 0;
          const from = stacked ? base : 0;

          base += Math.max(0, value);

          const x = x0 + band * index + (band - (stacked ? width : width * series.length + 2 * (series.length - 1))) / 2 + (stacked ? 0 : n * (width + 2));
          const a = y(from + value);
          const b = y(from);

          return svg`<rect x=${x} y=${Math.min(a, b)} width=${width} height=${Math.abs(b - a)} rx="4" fill=${colour(n)}></rect>`;
        });
      }),
    );
  }

  let below = categories.map(() => 0);

  return frame(
    series.map((one, n) => {
      const tops = categories.map((_, index) => (stacked ? below[index]! : 0) + (one.values[index] ?? 0));
      const points = tops.map((value, index) => `${x0 + band * (index + 0.5)},${y(value)}`);
      const floor = categories.map((_, index) => `${x0 + band * (index + 0.5)},${y(stacked ? below[index]! : 0)}`).reverse();

      below = tops;

      return svg`${kind === 'area' ? svg`<polygon points=${[...points, ...floor].join(' ')} fill=${colour(n)} fill-opacity="0.16"></polygon>` : nothing}
        <polyline points=${points.join(' ')} fill="none" stroke=${colour(n)} stroke-width="2" stroke-linejoin="round"></polyline>`;
    }),
  );
}

function pie(slices: { name: string; value: number }[]): TemplateResult {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const [cx, cy, outer, inner] = [W / 2, H / 2, 100, 56];
  let angle = -Math.PI / 2;
  const at = (radius: number, turn: number) => `${cx + radius * Math.cos(turn)} ${cy + radius * Math.sin(turn)}`;

  return html`<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
    ${slices.map((slice, index) => {
      const sweep = (slice.value / total) * Math.PI * 2;
      const start = angle;
      const end = (angle += sweep);
      const large = sweep > Math.PI ? 1 : 0;

      if (sweep <= 0) return nothing;

      return svg`<path
        d="M ${at(outer, start)} A ${outer} ${outer} 0 ${large} 1 ${at(outer, end - 0.0001)} L ${at(inner, end - 0.0001)} A ${inner} ${inner} 0 ${large} 0 ${at(inner, start)} Z"
        fill=${colour(index)}
        stroke="var(--background)"
        stroke-width="2"
      ></path>`;
    })}
  </svg>`;
}

drawAs(
  'bry-chart',
  element => {
    const label = str(element.label);

    if (element.loading === true) return html`<div class="loading" role="status" aria-label="Loading"></div>`;

    const categories = list<string>(element.categories);
    const series = list<Series>(element.series).slice(0, 6);

    if (categories.length === 0 || series.length === 0) {
      return html`<div class="empty"><p>${str(element.empty) || 'Nothing to show yet.'}</p></div>`;
    }

    const decimals = typeof element.decimals === 'number' ? element.decimals : 0;
    const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const format = (value: number) => number.format(value / 10 ** decimals);
    const kind = pick(['bar', 'line', 'area', 'pie'] as const, element.kind) ?? 'bar';
    const slices = kind === 'pie' ? pieSlices(categories, series[0]!.values) : [];
    const legend = kind === 'pie' ? slices.map(slice => slice.name) : series.map(one => one.name);

    return html`<figure aria-label=${label}>
      ${kind === 'pie' ? pie(slices) : cartesian(kind, categories, series, format, element.stacked === true)}
      ${kind === 'pie' || series.length > 1
        ? html`<ul class="legend type-caption" aria-hidden="true">
            ${legend.map((name, index) => html`<li><span style="background: ${colour(index)}"></span>${name}</li>`)}
          </ul>`
        : nothing}
      <table class="unseen">
        <caption>${label}</caption>
        <thead><tr><th></th>${series.map(one => html`<th scope="col">${one.name}</th>`)}</tr></thead>
        <tbody>
          ${categories.map(
            (category, index) => html`<tr><th scope="row">${category}</th>${series.map(one => html`<td>${format(one.values[index] ?? 0)}</td>`)}</tr>`,
          )}
        </tbody>
      </table>
    </figure>`;
  },
  [
    TYPE,
    UNSEEN,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      figure {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin: 0;
      }
      svg {
        width: 100%;
        height: auto;
      }
      .tick {
        font-size: 12px;
        fill: var(--fg-muted);
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.25rem 1rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .legend li {
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }
      .legend span {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 9999px;
      }
      .loading {
        height: 6rem;
        border-radius: var(--radius-xl);
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
