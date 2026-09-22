/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { str } from './tokens.ts';

/**
 * What the catalogue-b drawings (ADR-A23) share: the element's shape, the
 * draft a control holds until the app says otherwise, and the field's look.
 */

export type El = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean; requestUpdate(): void };

export const listOf = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** What each drawing last heard from the app, per setting, and what the person has made of it since. */
const held = new WeakMap<object, Map<string, { seen: string; draft: unknown }>>();

/**
 * The person's value until the app sends a different one, as Brydio's React
 * drawings keep it: the app's value wins only when it changes.
 */
export function draftOf<T>(element: object, name: string, sent: T): { draft: T; set: (next: T) => void } {
  let all = held.get(element);

  if (!all) {
    all = new Map();
    held.set(element, all);
  }

  const seen = JSON.stringify(sent ?? null);
  let state = all.get(name);

  if (!state || state.seen !== seen) {
    state = { seen, draft: sent };
    all.set(name, state);
  }

  const current = state;

  return { draft: current.draft as T, set: next => void (current.draft = next) };
}

/** Whatever else a drawing keeps between draws: which popup is open, which row is active. */
const kept = new WeakMap<object, Record<string, unknown>>();

export function keptOf<T extends Record<string, unknown>>(element: object, start: () => T): T {
  let state = kept.get(element) as T | undefined;

  if (!state) {
    state = start();
    kept.set(element, state);
  }

  return state;
}

/** The error under a control, which its `aria-describedby` points at. */
export const errorOf = (element: El) => {
  const message = str(element.error);

  return message ? html`<p id="error" class="type-caption error">${message}</p>` : nothing;
};

/** The control's accessible name: its own `label`, or that of the `bry-label` or `bry-field` around it. */
export function nameOf(element: El): string | undefined {
  const own = str(element.label);

  if (own) return own;

  const around = element.closest('bry-label, bry-field') as (HTMLElement & { text?: unknown; label?: unknown }) | null;

  return str(around?.text) || str(around?.label) || undefined;
}

export const rtlOf = (element: HTMLElement) => typeof getComputedStyle === 'function' && getComputedStyle(element).direction === 'rtl';

/** Focuses what matches in the element's shadow root once it has drawn. */
export function focusIn(element: El, selector: string): void {
  queueMicrotask(() => (element.shadowRoot?.querySelector(selector) as HTMLElement | null)?.focus());
}

export const FIELD_B = css`
  :host {
    display: block;
    min-width: 0;
  }
  .field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.25rem;
  }
  .error {
    color: var(--danger-fg);
  }
  .box {
    border: 1px solid var(--line-input);
    border-radius: var(--field-radius);
    background: var(--bg-surface);
    font: inherit;
    font-size: 0.8125rem;
    color: var(--fg);
    transition:
      border-color var(--dur-fast) var(--ease-out),
      box-shadow var(--dur-fast) var(--ease-out);
  }
  .box[aria-invalid='true'],
  [aria-invalid='true'] .box {
    border-color: var(--danger);
  }
  .unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  button {
    font: inherit;
  }
`;

/** A quiet button, as the kit's ghost and outline buttons are drawn. */
export const QUIET = css`
  .quiet {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    height: var(--control-h);
    min-width: var(--control-h);
    padding: 0 0.625rem;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--fg-soft);
    font-size: 0.8125rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--dur-fast), color var(--dur-fast);
  }
  .quiet:hover {
    background: var(--layer-hover);
    color: var(--fg);
  }
  .quiet:disabled,
  .quiet[aria-disabled='true'] {
    pointer-events: none;
    opacity: 0.45;
  }
  .quiet[aria-current='page'],
  .quiet[aria-pressed='true'],
  .quiet[aria-checked='true'] {
    border-color: var(--line-strong);
    background: var(--layer-hover);
    color: var(--fg-strong);
  }
`;
