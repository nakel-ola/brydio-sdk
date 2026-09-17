/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { FOCUS, pick, space, str, TYPE } from './tokens.ts';

/**
 * The first drawings: stack, heading, text, badge, button and card, each as
 * Brydio's React catalogue draws it (`packages/app/src/apps/catalogue/draw.tsx`)
 * with the kit's classes turned into the token variables they stand for.
 */

const GAPS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const;
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const;

drawAs(
  'bry-stack',
  element => {
    const gap = pick(GAPS, element.gap);
    const align = ALIGN[str(element.align) as keyof typeof ALIGN];
    const justify = JUSTIFY[str(element.justify) as keyof typeof JUSTIFY];

    element.style.setProperty('--bry-direction', element.direction === 'row' ? 'row' : 'column');
    element.style.setProperty('--bry-gap', gap ? space(Number(gap)) : '0');
    element.style.setProperty('--bry-align', align ?? 'normal');
    element.style.setProperty('--bry-justify', justify ?? 'normal');
    element.style.setProperty('--bry-wrap', element.wrap === true ? 'wrap' : 'nowrap');

    return html`<slot></slot>`;
  },
  [
    css`
      :host {
        display: flex;
        min-width: 0;
        flex-direction: var(--bry-direction, column);
        gap: var(--bry-gap, 0);
        align-items: var(--bry-align, normal);
        justify-content: var(--bry-justify, normal);
        flex-wrap: var(--bry-wrap, nowrap);
      }
    `,
  ],
);

const HEADING_ROLE = { 1: 'title', 2: 'heading', 3: 'subheading', 4: 'label' } as const;
const HEADING_VARIANTS = ['title', 'heading', 'subheading', 'label'] as const;

drawAs(
  'bry-heading',
  element => {
    const level = (element.level as number) in HEADING_ROLE ? (element.level as keyof typeof HEADING_ROLE) : 2;
    const role = `type-${pick(HEADING_VARIANTS, element.variant) ?? HEADING_ROLE[level]}`;
    const text = str(element.text);

    // The kit's `Heading` puts level 1 at h2: the page's own title is the h1.
    switch (level) {
      case 1:
        return html`<h2 class=${role}>${text}</h2>`;
      case 3:
        return html`<h4 class=${role}>${text}</h4>`;
      case 4:
        return html`<h5 class=${role}>${text}</h5>`;
      default:
        return html`<h3 class=${role}>${text}</h3>`;
    }
  },
  [TYPE, css`:host { display: block; }`],
);

const TEXT_VARIANTS = ['body', 'ui', 'caption', 'label'] as const;
const TEXT_TONE = { muted: 'var(--fg-muted)', brand: 'var(--brand-fg)', success: 'var(--success-fg)', warn: 'var(--warn-fg)', danger: 'var(--danger-fg)' } as const;

drawAs(
  'bry-text',
  element => {
    const role = `type-${pick(TEXT_VARIANTS, element.variant) ?? (element.size === 'sm' ? 'ui' : 'body')}`;
    const tone = TEXT_TONE[str(element.tone) as keyof typeof TEXT_TONE];

    return html`<p class=${role} style=${tone ? `color: ${tone}` : nothing}>${str(element.text)}</p>`;
  },
  [TYPE, css`:host { display: block; }`],
);

/** A badge's tone, as the kit's soft status pills: a tint and its text colour. */
const BADGE = {
  neutral: ['var(--bg-fill)', 'var(--fg-muted)'],
  brand: ['var(--brand-soft)', 'var(--brand-fg)'],
  success: ['var(--success-soft)', 'var(--success-fg)'],
  warn: ['var(--warn-soft)', 'var(--warn-fg)'],
  danger: ['var(--danger-soft)', 'var(--danger-fg)'],
} as const;

drawAs(
  'bry-badge',
  element => {
    const tone = str(element.tone) in BADGE ? (str(element.tone) as keyof typeof BADGE) : 'neutral';
    const [fill, ink] = BADGE[tone];

    return html`<span data-tone=${tone} style="background: ${fill}; color: ${ink}">${str(element.text)}</span>`;
  },
  [
    css`
      :host {
        display: inline-flex;
      }
      span {
        display: inline-flex;
        align-items: center;
        white-space: nowrap;
        border-radius: 9999px;
        padding: 0.125rem 0.5rem;
        font-size: 0.6875rem;
        line-height: 1rem;
        font-weight: 500;
      }
    `,
  ],
);

const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;

drawAs(
  'bry-button',
  element => {
    const working = element.working === true;
    const variant = pick(BUTTON_VARIANTS, element.variant) ?? 'secondary';
    const size = element.size === 'sm' ? 'sm' : 'md';

    return html`<button
      type="button"
      class="${variant} ${size}"
      ?disabled=${element.disabled === true || working}
      aria-busy=${working ? 'true' : nothing}
      @click=${() => element.emit('press')}
    >
      ${working ? html`<span class="spinner" aria-hidden="true"></span>` : nothing}${str(element.label)}
    </button>`;
  },
  [
    FOCUS,
    css`
      :host {
        display: inline-flex;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        white-space: nowrap;
        border: 0;
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color var(--dur-fast), box-shadow var(--dur-fast), color var(--dur-fast);
      }
      button:disabled {
        pointer-events: none;
        opacity: 0.45;
      }
      .md {
        height: var(--control-h);
        padding: 0 0.75rem;
        border-radius: var(--radius-lg);
      }
      .sm {
        height: var(--control-h-sm);
        padding: 0 0.625rem;
        border-radius: var(--radius-md);
      }
      .primary {
        background: var(--brand);
        color: var(--brand-on);
        box-shadow: var(--shadow-brand);
      }
      .primary:hover {
        background: var(--brand-hover);
      }
      .primary:active {
        background: var(--brand-active);
      }
      .secondary {
        background: var(--bg-fill);
        color: var(--fg-strong);
      }
      .secondary:hover {
        background: var(--bg-fill-hover);
      }
      .ghost {
        background: transparent;
        color: var(--fg-soft);
      }
      .ghost:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
      .ghost:active {
        background: var(--layer-press);
      }
      .danger {
        background: var(--danger);
        color: var(--fg-on-solid);
      }
      .danger:hover {
        filter: brightness(1.1);
      }
      .spinner {
        width: 1rem;
        height: 1rem;
        border-radius: 9999px;
        border: 2px solid currentColor;
        border-inline-end-color: transparent;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
);

/** What takes a press of its own inside a pressable card. */
const INTERACTIVE =
  "button, a, input, textarea, select, [role='menuitem'], [role='option'], [role='combobox'], [role='checkbox'], [role='switch'], [contenteditable='true'], bry-button, bry-input, bry-textarea, bry-select, bry-checkbox, bry-switch, bry-menu";

/** Whether a press inside a card was on the card itself, not on a control within it. */
function pressedItself(event: Event, card: HTMLElement): boolean {
  for (const target of event.composedPath()) {
    if (target === card) return true;
    if (target instanceof Element && target.matches(INTERACTIVE)) return false;
  }

  return false;
}

const PADDINGS = ['2', '3', '4', '5', '6'] as const;

drawAs(
  'bry-card',
  element => {
    if (element.loading === true) {
      return html`<div class="loading" role="status" aria-label="Loading"><div class="skeleton"></div></div>`;
    }

    const pressable = element.pressable === true;
    const padding = pick(PADDINGS, element.padding) ?? '4';
    const title = str(element.title);
    const press = () => element.emit('press');

    return html`<div
      class="card ${pressable ? 'pressable' : ''}"
      style="padding: ${space(Number(padding))}"
      role=${pressable ? 'button' : nothing}
      tabindex=${pressable ? '0' : nothing}
      @click=${pressable ? (event: Event) => pressedItself(event, element) && press() : nothing}
      @keydown=${pressable
        ? (event: KeyboardEvent) => {
            if (event.composedPath()[0] !== event.currentTarget) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            press();
          }
        : nothing}
    >
      ${title ? html`<p class="type-label title">${title}</p>` : nothing}
      <slot></slot>
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
      .card {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.5rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background: var(--card);
        color: var(--card-foreground);
      }
      .pressable {
        cursor: pointer;
        transition: background-color var(--dur-fast);
      }
      .pressable:hover {
        background: var(--layer-hover);
      }
      .title {
        color: var(--fg-strong);
      }
      .skeleton {
        height: 6rem;
        border-radius: var(--radius-xl);
        background: var(--bg-fill);
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
