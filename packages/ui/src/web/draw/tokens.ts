/// <reference lib="dom" />
import { css } from '../base.ts';

/**
 * The kit's scale, as the Lit drawings use it. Colours, radii, shadows and
 * durations are the token stylesheet's variables (`../tokens.css`, Brydio's
 * `packages/ui/src/styles/tokens.css`), which reach inside every element's
 * shadow root. The type sizes and the spacing step are Tailwind's `@theme`
 * in Brydio's `globals.css`, which the token file doesn't hold, so they are
 * named once here.
 */

/** A spacing step: Tailwind's `gap-3` is `calc(0.25rem * 3)`. */
export const space = (step: number) => `calc(0.25rem * ${step})`;

/** The type roles (`type-title` … `type-caption`), as classes inside a shadow root. */
export const TYPE = css`
  .type-title {
    font-size: 1.3125rem;
    line-height: 1.75rem;
    letter-spacing: -0.016em;
    font-weight: 600;
    color: var(--fg-strong);
  }
  .type-heading {
    font-size: 1.0625rem;
    line-height: 1.5rem;
    letter-spacing: -0.011em;
    font-weight: 600;
    color: var(--fg);
  }
  .type-subheading {
    font-size: 0.875rem;
    line-height: 1.375rem;
    font-weight: 600;
    color: var(--fg);
  }
  .type-body {
    font-size: 0.875rem;
    line-height: 1.375rem;
    color: var(--fg-soft);
  }
  .type-ui {
    font-size: 0.8125rem;
    line-height: 1.25rem;
    color: var(--fg);
  }
  .type-label {
    font-size: 0.75rem;
    line-height: 1.125rem;
    letter-spacing: 0.005em;
    font-weight: 500;
    color: var(--fg);
  }
  .type-caption {
    font-size: 0.75rem;
    line-height: 1.125rem;
    letter-spacing: 0.005em;
    color: var(--fg-muted);
  }
  h2,
  h3,
  h4,
  h5,
  p {
    margin: 0;
  }
`;

/** The focus ring every pressable thing shows from the keyboard. */
export const FOCUS = css`
  :focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--brand-ring);
  }
`;

/** The value when it is one of `names`, else `undefined`: nothing else passes through. */
export function pick<const T extends string>(names: readonly T[], value: unknown): T | undefined {
  return (names as readonly unknown[]).includes(value) ? (value as T) : undefined;
}

export const str = (value: unknown): string => (typeof value === 'string' ? value : '');
