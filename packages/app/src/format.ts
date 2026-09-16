import { defaultBridge, type Bridge } from './bridge.ts';

/**
 * Dates and numbers in the person's own locale (`tasks/apps` A4-F05).
 *
 * The locale is read from the host's context at each call, not once, so a
 * change of language while the screen is open (the host sends `host/context`
 * again) changes what the next call writes. Before the first context, the
 * worker's own locale is used.
 */

function localeOf(bridge: Bridge | undefined): string | undefined {
  return (bridge ?? defaultBridge()).context?.locale || undefined;
}

export const format = {
  /** A date, as `Intl.DateTimeFormat` writes it in the person's locale. Medium date by default. */
  date(value: Date | string | number, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }, bridge?: Bridge): string {
    return new Intl.DateTimeFormat(localeOf(bridge), options).format(value instanceof Date ? value : new Date(value));
  },
  /** A number, as `Intl.NumberFormat` writes it in the person's locale. */
  number(value: number | bigint, options?: Intl.NumberFormatOptions, bridge?: Bridge): string {
    return new Intl.NumberFormat(localeOf(bridge), options).format(value);
  },
  /** The locale those write in: the person's, once the host has said. */
  get locale(): string {
    return localeOf(undefined) ?? new Intl.NumberFormat().resolvedOptions().locale;
  },
};
