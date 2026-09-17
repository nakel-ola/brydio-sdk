/// <reference lib="dom" />
import { css, html } from '../base.ts';
import { drawAs } from '../define.ts';
import { str } from './tokens.ts';

/**
 * `bry-split`: two panes with a handle between them, as the kit's `SplitPane`
 * draws it (`packages/ui/src/components/split-pane.tsx`).
 *
 * Below `STACK_BELOW` rem of the split's own width the panes stack and the
 * handle goes away, so a split in a narrow column stacks on a wide window
 * too. The handle answers the arrows, Home and End, and reads before and
 * after, so left and right swap under right-to-left.
 */

type Element = HTMLElement & Record<string, unknown> & { requestUpdate(): void };

/** Narrower than this, in rem, and the panes stack. */
export const STACK_BELOW = 40;
export const MIN_RATIO = 20;
export const MAX_RATIO = 80;
/** How far one arrow press moves the handle, in percent. */
const KEY_STEP = 5;

export const clampRatio = (ratio: number): number => Math.min(MAX_RATIO, Math.max(MIN_RATIO, Math.round(ratio)));

/** Where a key means to go, reading before and after rather than left and right. */
export function steerBy(key: string, rtl: boolean): number | null {
  const before = rtl ? 'ArrowRight' : 'ArrowLeft';
  const after = rtl ? 'ArrowLeft' : 'ArrowRight';

  if (key === before) return -KEY_STEP;
  if (key === after) return KEY_STEP;

  return null;
}

const held = new WeakMap<object, { ratio: number; seen: number }>();

drawAs(
  'bry-split',
  element => {
    const wanted = clampRatio(typeof element.ratio === 'number' ? element.ratio : 50);
    let state = held.get(element);

    if (!state || state.seen !== wanted) {
      state = { ratio: wanted, seen: wanted };
      held.set(element, state);
    }

    const current = state;
    const label = str(element.label);
    const rtl = getComputedStyle(element).direction === 'rtl';
    const set = (ratio: number) => {
      current.ratio = clampRatio(ratio);
      (element as Element).requestUpdate();
    };
    const fromPointer = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();

      if (box.width <= 0) return;

      const across = ((event.clientX - box.left) / box.width) * 100;

      set(rtl ? 100 - across : across);
    };

    element.style.setProperty('--bry-ratio', `${current.ratio}%`);

    return html`<div class="split">
      <div class="pane first"><slot name="first"></slot><slot></slot></div>
      <div
        class="handle"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-label=${label || 'Resize'}
        aria-valuenow=${current.ratio}
        aria-valuemin=${MIN_RATIO}
        aria-valuemax=${MAX_RATIO}
        @pointerdown=${(event: PointerEvent) => {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        @pointermove=${(event: PointerEvent) => {
          if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return;
          fromPointer(event);
        }}
        @pointerup=${(event: PointerEvent) => (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)}
        @keydown=${(event: KeyboardEvent) => {
          const by = steerBy(event.key, rtl);

          if (by !== null) {
            event.preventDefault();
            set(current.ratio + by);

            return;
          }
          if (event.key === 'Home') {
            event.preventDefault();
            set(MIN_RATIO);
          } else if (event.key === 'End') {
            event.preventDefault();
            set(MAX_RATIO);
          }
        }}
      ></div>
      <div class="pane second"><slot name="second"></slot></div>
    </div>`;
  },
  [
    css`
      :host {
        display: block;
        min-width: 0;
        container-type: inline-size;
      }
      .split {
        display: grid;
        min-width: 0;
        grid-template-columns: 1fr;
        gap: 0.5rem;
      }
      .pane {
        min-width: 0;
        overflow: auto;
      }
      .handle {
        display: none;
      }
      /* Side by side only when this split itself is wide enough (STACK_BELOW). */
      @container (min-width: 40rem) {
        .split {
          grid-template-columns: var(--bry-ratio, 50%) 0.5rem 1fr;
          gap: 0;
        }
        .handle {
          display: block;
          cursor: col-resize;
          border-radius: 9999px;
          background: var(--line);
          outline: none;
          touch-action: none;
        }
        .handle:hover,
        .handle:focus-visible {
          background: var(--brand);
        }
        .handle:focus-visible {
          box-shadow: 0 0 0 3px var(--brand-ring);
        }
      }
    `,
  ],
);
