/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { draftOf, errorOf, FIELD_B, focusIn, keptOf, listOf, rtlOf, type El } from './catalogue-b-shared.ts';
import { FOCUS, str, TYPE } from './tokens.ts';

/**
 * ADR-A23 (catalogue-b): `bry-calendar`, a month always open, as the kit's
 * `Calendar` draws it (Brydio's `packages/ui/src/components/calendar.tsx`).
 * Dates are ISO calendar dates in and out, never `Date`s, so a day is the
 * same day in every time zone. The days are one tab stop: the arrows move a
 * day or a week, Page Up and Page Down a month, Home and End the week's ends.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

interface Day {
  year: number;
  month: number;
  day: number;
}

export function parseDay(value: unknown): Day | null {
  if (typeof value !== 'string') return null;

  const match = ISO.exec(value);

  if (!match) return null;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));

  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? { year, month, day } : null;
}

const pad = (value: number, width: number) => String(value).padStart(width, '0');
export const isoOf = ({ year, month, day }: Day) => `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
const utc = ({ year, month, day }: Day) => new Date(Date.UTC(year, month - 1, day));

function addDays(date: Day, days: number): Day {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));

  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

function addMonths(date: Day, months: number): Day {
  const first = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;

  return { year, month, day: Math.min(date.day, new Date(Date.UTC(year, month, 0)).getUTCDate()) };
}

function today(): Day {
  const now = new Date();

  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** What a press on `iso` makes of the chosen days, in each mode. */
export function choose(mode: string, values: readonly string[], iso: string): string[] {
  if (mode === 'multiple') return values.includes(iso) ? values.filter(value => value !== iso) : [...values, iso].sort();
  if (mode !== 'range' || values.length !== 1) return [iso];

  const [start] = values as [string];

  return iso < start ? [iso, start] : [start, iso];
}

const locale = () => (typeof navigator !== 'undefined' && navigator.language) || 'en';

drawAs(
  'bry-calendar',
  element => {
    const mode = element.mode === 'multiple' || element.mode === 'range' ? element.mode : 'single';
    const { draft, set } = draftOf(element, 'values', listOf<string>(element.values).filter(value => parseDay(value)));
    const lowest = str(element.min);
    const highest = str(element.max);
    const state = keptOf(element, () => ({ focused: parseDay(draft[0]) ?? parseDay(element.month) ?? today(), moved: false }));
    const focused = state.focused;
    const disabled = element.disabled === true;
    const invalid = Boolean(str(element.error));
    const allowed = (iso: string) => (!parseDay(lowest) || iso >= lowest) && (!parseDay(highest) || iso <= highest);
    const monthName = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc({ ...focused, day: 1 }));
    const fullName = new Intl.DateTimeFormat(locale(), { dateStyle: 'full', timeZone: 'UTC' });
    const dayName = new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' });
    const first: Day = { ...focused, day: 1 };
    const lead = (utc(first).getUTCDay() + 6) % 7;
    const cells = Array.from({ length: 42 }, (_, index) => addDays(first, index - lead));
    const weeks = Array.from({ length: 6 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
    // 2023-01-02 was a Monday: the week starts on Monday.
    const headings = Array.from({ length: 7 }, (_, index) => dayName.format(new Date(Date.UTC(2023, 0, 2 + index))));
    const [start, end] = mode === 'range' ? draft : [];
    const move = (next: Day) => {
      state.focused = next;
      element.requestUpdate();
      focusIn(element as El, `[data-day="${isoOf(next)}"]`);
    };
    const label = str(element.label);

    return html`<div class="field">
      <div class="calendar" aria-invalid=${invalid ? 'true' : nothing} aria-describedby=${invalid ? 'error' : nothing}>
        <div class="head">
          <button type="button" class="nav" aria-label="Previous month" ?disabled=${disabled} @click=${() => { state.focused = addMonths(focused, -1); element.requestUpdate(); }}>‹</button>
          <p class="type-label" aria-live="polite">${monthName}</p>
          <button type="button" class="nav" aria-label="Next month" ?disabled=${disabled} @click=${() => { state.focused = addMonths(focused, 1); element.requestUpdate(); }}>›</button>
        </div>
        <div
          role="grid"
          aria-label=${label ? `${label}, ${monthName}` : monthName}
          aria-multiselectable=${mode === 'single' ? nothing : 'true'}
          @keydown=${(event: KeyboardEvent) => {
            const rtl = rtlOf(element);
            const weekday = (utc(focused).getUTCDay() + 6) % 7;
            const step: Record<string, () => Day> = {
              ArrowLeft: () => addDays(focused, rtl ? 1 : -1),
              ArrowRight: () => addDays(focused, rtl ? -1 : 1),
              ArrowUp: () => addDays(focused, -7),
              ArrowDown: () => addDays(focused, 7),
              PageUp: () => addMonths(focused, -1),
              PageDown: () => addMonths(focused, 1),
              Home: () => addDays(focused, -weekday),
              End: () => addDays(focused, 6 - weekday),
            };
            const next = step[event.key];

            if (!next) return;

            event.preventDefault();
            move(next());
          }}
        >
          <div role="row" class="week">${headings.map(heading => html`<span role="columnheader" class="type-caption">${heading}</span>`)}</div>
          ${weeks.map(
            week => html`<div role="row" class="week">
              ${week.map(date => {
                const iso = isoOf(date);
                const chosen = draft.includes(iso);
                const between = !chosen && start !== undefined && end !== undefined && iso > start && iso < end;

                return html`<span role="gridcell" aria-selected=${chosen ? 'true' : 'false'}>
                  <button
                    type="button"
                    class="day"
                    data-day=${iso}
                    data-outside=${date.month !== focused.month ? '' : nothing}
                    data-between=${between ? '' : nothing}
                    data-chosen=${chosen ? '' : nothing}
                    tabindex=${iso === isoOf(focused) ? '0' : '-1'}
                    ?disabled=${disabled || !allowed(iso)}
                    aria-label=${fullName.format(utc(date))}
                    @focus=${() => void (state.focused = date)}
                    @click=${() => {
                      const values = choose(mode, draft, iso);

                      state.focused = date;
                      set(values);
                      element.emit('change', { values });
                      element.requestUpdate();
                    }}
                  >
                    ${date.day}
                  </button>
                </span>`;
              })}
            </div>`,
          )}
        </div>
      </div>
      ${errorOf(element as El)}
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    FIELD_B,
    css`
      :host {
        display: inline-block;
      }
      .calendar {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .nav,
      .day {
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        font: inherit;
        font-size: 0.8125rem;
        color: var(--fg);
        cursor: pointer;
      }
      .nav {
        width: var(--control-h-sm);
        height: var(--control-h-sm);
      }
      [role='grid'] {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .week {
        display: grid;
        grid-template-columns: repeat(7, minmax(2rem, 1fr));
        gap: 0.25rem;
        text-align: center;
      }
      .day {
        width: 100%;
        height: var(--control-h);
      }
      .day:hover,
      .nav:hover {
        background: var(--layer-hover);
      }
      .day[data-outside] {
        color: var(--fg-faint);
      }
      .day[data-between] {
        background: var(--brand-soft);
        color: var(--brand-fg);
      }
      .day[data-chosen] {
        background: var(--brand);
        color: var(--brand-on);
      }
      .day:disabled,
      .nav:disabled {
        pointer-events: none;
        opacity: 0.4;
      }
    `,
  ],
);
