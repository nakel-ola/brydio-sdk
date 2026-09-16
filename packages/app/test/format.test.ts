import { afterEach, describe, expect, test } from 'bun:test';

import { format, setDefaultBridge } from '../src/index.ts';
import { CONTEXT, harness } from './harness.ts';

afterEach(() => setDefaultBridge(null));

describe('format', () => {
  test('writes dates and numbers in the locale the host said, and follows it when it changes', async () => {
    const { bridge, hostSays, connect } = harness();

    setDefaultBridge(bridge);
    await connect();

    const day = new Date(Date.UTC(2026, 2, 4, 12));
    const options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeZone: 'UTC' };

    expect(format.locale).toBe('en-GB');
    expect(format.date(day, options)).toBe('4 Mar 2026');
    expect(format.number(1234.5)).toBe('1,234.5');

    hostSays('host/context', { ...CONTEXT, locale: 'de-DE' });

    expect(format.locale).toBe('de-DE');
    expect(format.date(day, options)).toBe('04.03.2026');
    expect(format.number(1234.5)).toBe('1.234,5');
    expect(format.number(0.5, { style: 'percent' })).toBe('50\u00a0%');

    hostSays('host/context', { ...CONTEXT, locale: 'en-US' });

    expect(format.date(day.toISOString(), options)).toBe('Mar 4, 2026');
  });

  test('takes a bridge of its own, for a screen that made one', async () => {
    const { bridge, hostSays, connect } = harness();

    await connect();
    hostSays('host/context', { ...CONTEXT, locale: 'fr-FR' });

    expect(format.number(1234.5, undefined, bridge)).toBe('1\u202f234,5');
  });
});
