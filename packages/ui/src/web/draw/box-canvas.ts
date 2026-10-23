/// <reference lib="dom" />
import { css, html } from '../base.ts';
import { drawAs } from '../define.ts';

/**
 * PB23 and PB24 as web components: `bry-box`, a container with no look of its
 * own, and `bry-canvas`, the app's shapes drawn on a canvas clipped to its
 * box, in the page's colours, as Brydio draws them on the host side.
 */

type Element = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean };

interface Op {
  kind: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  x2?: number;
  y2?: number;
  r?: number;
  round?: number;
  d?: string;
  text?: string;
  fill?: string;
  stroke?: string;
  line?: number;
  points?: number;
  weight?: string;
  align?: 'start' | 'center' | 'end';
  opacity?: number;
}

drawAs('bry-box', () => html`<slot></slot>`, [
  css`
    :host {
      display: block;
      min-width: 0;
    }
  `,
]);

/**
 * A shape's colour as CSS: Brydio's (`brydio.text` → its token) or the app's
 * (`app.ocean` → `--app-color-ocean`). The same reading as `cssColourOf` in
 * `@brydio/manifest/look`, kept here so the page's bundle carries no checks.
 */
const TOKENS: Readonly<Record<string, string>> = {
  text: '--fg', 'text-muted': '--fg-muted', surface: '--bg-surface', sunken: '--bg-sunken', line: '--line',
  brand: '--brand', 'brand-text': '--brand-fg', 'brand-soft': '--brand-soft', success: '--success', warn: '--warn', danger: '--danger',
};

function cssColourOf(value: string): string | null {
  if (value === 'transparent') return value;
  if (value.startsWith('app.')) return `var(--app-color-${value.slice(4)}, currentColor)`;
  if (value.startsWith('brydio.')) return TOKENS[value.slice(7)] ? `var(${TOKENS[value.slice(7)]})` : null;

  return null;
}

/** Draws the shapes onto the element's canvas, at the width it has now. */
function paint(element: Element, canvas: HTMLCanvasElement): void {
  const view = (element.view ?? {}) as { w?: number; h?: number };
  const width = view.w ?? 300;
  const height = view.h ?? 150;
  const room = Math.max(1, canvas.clientWidth || width);
  const context = canvas.getContext?.('2d');

  if (!context) return;

  const scale = room / width;
  const ratio = window.devicePixelRatio || 1;

  canvas.width = Math.round(room * ratio);
  canvas.height = Math.round(height * scale * ratio);
  context.setTransform(scale * ratio, 0, 0, scale * ratio, 0, 0);
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();

  const probe = document.createElement('span');

  element.shadowRoot?.append(probe);

  const colour = (value?: string) => {
    const said = value ? cssColourOf(value) : null;

    if (!said) return null;
    probe.style.color = said;

    return getComputedStyle(probe).color || null;
  };
  const family = getComputedStyle(element).fontFamily || 'sans-serif';

  for (const op of Array.isArray(element.ops) ? (element.ops as Op[]) : []) {
    const fill = colour(op.fill);
    const stroke = colour(op.stroke);

    context.globalAlpha = typeof op.opacity === 'number' ? op.opacity / 100 : 1;
    context.lineWidth = op.line ?? 1;
    if (fill) context.fillStyle = fill;
    if (stroke) context.strokeStyle = stroke;
    context.beginPath();

    if (op.kind === 'rect') context.roundRect(op.x ?? 0, op.y ?? 0, op.w ?? 0, op.h ?? 0, op.round ?? 0);
    if (op.kind === 'circle') context.arc(op.x ?? 0, op.y ?? 0, op.r ?? 0, 0, Math.PI * 2);
    if (op.kind === 'line') {
      context.moveTo(op.x ?? 0, op.y ?? 0);
      context.lineTo(op.x2 ?? 0, op.y2 ?? 0);
    }
    if (op.kind === 'path' && op.d) {
      const path = new Path2D(op.d);

      if (fill) context.fill(path);
      if (stroke) context.stroke(path);
      continue;
    }
    if (op.kind === 'text') {
      context.font = `${op.weight ?? '400'} ${op.points ?? 14}px ${family}`;
      context.textAlign = op.align === 'center' ? 'center' : op.align === 'end' ? 'end' : 'start';
      context.textBaseline = 'middle';
      if (fill && op.text) context.fillText(op.text, op.x ?? 0, op.y ?? 0);
      continue;
    }
    if (fill && op.kind !== 'line') context.fill();
    if (stroke) context.stroke();
  }

  probe.remove();
}

drawAs(
  'bry-canvas',
  element => {
    const view = (element.view ?? {}) as { w?: number; h?: number };
    const at = (event: PointerEvent, phase: 'down' | 'move' | 'up') => {
      const target = event.currentTarget as HTMLCanvasElement;
      const rect = target.getBoundingClientRect();
      const scale = rect.width ? (view.w ?? 300) / rect.width : 1;

      element.emit('pointer', { phase, x: Math.round((event.clientX - rect.left) * scale), y: Math.round((event.clientY - rect.top) * scale) });
    };

    queueMicrotask(() => {
      const canvas = element.shadowRoot?.querySelector('canvas');

      if (canvas) paint(element as Element, canvas);
    });

    return html`<canvas
      role="img"
      aria-label=${typeof element.label === 'string' ? element.label : ''}
      tabindex=${element.focusable === true ? '0' : '-1'}
      style="aspect-ratio: ${view.w ?? 300} / ${view.h ?? 150}"
      @pointerdown=${(event: PointerEvent) => at(event, 'down')}
      @pointermove=${(event: PointerEvent) => at(event, 'move')}
      @pointerup=${(event: PointerEvent) => at(event, 'up')}
      @keydown=${(event: KeyboardEvent) => {
        if (element.focusable !== true || event.key === 'Tab') return;
        event.preventDefault();
        element.emit('key', { key: event.key });
      }}
    ></canvas>`;
  },
  [
    css`
      :host {
        display: block;
        width: 100%;
        min-width: 0;
        overflow: clip;
      }
      canvas {
        display: block;
        width: 100%;
        touch-action: none;
        border-radius: var(--radius-md);
      }
    `,
  ],
);
