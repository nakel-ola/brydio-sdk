/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { CALENDAR_VIEWS, HUES } from '../../catalogue.ts';
import { drawAs } from '../define.ts';
import { keptOf, listOf, rtlOf, type El } from './catalogue-b-shared.ts';
import { icon, localeOf } from './plan-shared.ts';
import { FOCUS, pick, str } from './tokens.ts';

/**
 * CA02: `bry-calendar-view`, as Brydio's React catalogue draws it
 * (`packages/app/src/apps/catalogue/draw/calendar-view.tsx`), with the same
 * events and details. Brydio draws it with FullCalendar; this build carries
 * no library beyond Lit, so the grid is drawn here with the platform's own
 * `Intl` for the time zones. The contract is the same: a day, week or month
 * on a grid or an agenda, events side by side when they overlap, a move drawn
 * at once and taken back when the app sends `settled`.
 */

type View = (typeof CALENDAR_VIEWS)[number];
type Hue = (typeof HUES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_MINUTES = 24 * 60;
/** How long a move waits for the app's answer before it goes back. */
export const HOLD_MS = 15_000;
const VIEW_LABEL: Record<View, string> = { day: 'Day', week: 'Week', month: 'Month', agenda: 'Agenda' };
/** How many events a month's day shows before "+n more". */
const MONTH_SHOWN = 3;

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allday: boolean;
  hue?: Hue;
  editable: boolean;
  busy: boolean;
  tentative: boolean;
  cancelled: boolean;
  meta: string;
}

/** Where an event sits: UTC instants, or ISO dates when all day (the end the day after the last). */
export interface Placed {
  start: string;
  end: string;
  allday: boolean;
}

function eventsOf(value: unknown): CalendarEvent[] {
  return listOf<Record<string, unknown>>(value).flatMap(item => {
    if (!item || typeof item !== 'object' || !str(item.id) || !str(item.start)) return [];

    return [{
      id: str(item.id),
      title: str(item.title),
      start: str(item.start),
      end: str(item.end),
      allday: item.allday === true,
      hue: pick(HUES, item.hue),
      editable: item.editable === true && item.busy !== true,
      busy: item.busy === true,
      tentative: item.tentative === true,
      cancelled: item.cancelled === true,
      meta: str(item.meta),
    }];
  });
}

// ---- Calendar dates, as ISO strings: the same day in every zone. ----

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const pad = (value: number, width = 2) => String(value).padStart(width, '0');
const dayMs = (iso: string) => {
  const match = ISO.exec(iso);

  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : NaN;
};
const isoOfMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => isoOfMs(dayMs(iso) + days * DAY_MS);

function addMonths(iso: string, months: number): string {
  const at = new Date(dayMs(iso));
  const first = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();

  return isoOfMs(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(at.getUTCDate(), last)));
}

const weekdayOf = (iso: string) => new Date(dayMs(iso)).getUTCDay();

// ---- Time zones, with Intl alone. ----

/** A real IANA zone, or the viewer's own (`local`). */
export function zoneOf(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'local';

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });

    return value;
  } catch {
    return 'local';
  }
}

const formats = new Map<string, Intl.DateTimeFormat>();

function wallFormat(zone: string): Intl.DateTimeFormat {
  let format = formats.get(zone);

  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      ...(zone === 'local' ? {} : { timeZone: zone }),
    });
    formats.set(zone, format);
  }

  return format;
}

/** An instant as the calendar date and minute of the day it is in `zone`. */
export function wallOf(ms: number, zone: string): { day: string; minute: number } {
  const parts = Object.fromEntries(wallFormat(zone).formatToParts(new Date(ms)).map(part => [part.type, part.value]));

  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

/** The instant a calendar date and minute of the day are in `zone`. */
export function instantAt(day: string, minute: number, zone: string): number {
  const guess = dayMs(day) + minute * 60_000;
  const offset = (at: number) => {
    const wall = wallOf(at, zone);

    return dayMs(wall.day) + wall.minute * 60_000 - Math.floor(at / 60_000) * 60_000;
  };
  const first = guess - offset(guess);
  const second = guess - offset(first);

  return second;
}

const instant = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
const todayIn = (zone: string) => wallOf(Date.now(), zone).day;

/** The locale's first day of the week, where the browser knows it; Sunday otherwise. */
function firstDayOf(locale: string): number {
  try {
    const known = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = known.getWeekInfo?.() ?? known.weekInfo;

    return info ? info.firstDay % 7 : 0;
  } catch {
    return 0;
  }
}

/** The days `view` shows around `date`. */
export function daysShown(view: View, date: string, firstDay: number): string[] {
  if (view === 'day') return [date];

  const from = (iso: string) => addDays(iso, -((weekdayOf(iso) - firstDay + 7) % 7));

  if (view === 'month') {
    const start = from(`${date.slice(0, 8)}01`);

    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }

  const start = from(date);

  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** The date Previous (`-1`) or Next (`1`) shows in `view`. */
export function stepped(view: View, date: string, by: -1 | 1): string {
  if (view === 'month') return addMonths(date, by);

  return addDays(date, view === 'day' ? by : 7 * by);
}

/** Where an event is on the grid's days: the minutes it covers on each. */
interface Piece {
  event: CalendarEvent;
  day: string;
  from: number;
  to: number;
  column: number;
  columns: number;
}

function piecesOn(days: string[], events: CalendarEvent[], at: (event: CalendarEvent) => Placed, zone: string): Piece[] {
  const pieces: Piece[] = [];

  for (const day of days) {
    const opens = instantAt(day, 0, zone);
    const closes = instantAt(addDays(day, 1), 0, zone);
    const today: Piece[] = [];

    for (const event of events) {
      const place = at(event);

      if (place.allday) continue;

      const start = Date.parse(place.start);
      const end = Math.max(Date.parse(place.end || place.start), start + 15 * 60_000);

      if (Number.isNaN(start) || end <= opens || start >= closes) continue;

      const from = Math.max(0, Math.round((start - opens) / 60_000));
      const to = Math.min(DAY_MINUTES, Math.round((end - opens) / 60_000));

      today.push({ event, day, from, to, column: 0, columns: 1 });
    }

    pieces.push(...sideBySide(today));
  }

  return pieces;
}

/** Overlapping events share their time's width, side by side, as FullCalendar lays them. */
export function sideBySide<T extends { from: number; to: number; column: number; columns: number }>(pieces: T[]): T[] {
  const sorted = [...pieces].sort((a, b) => a.from - b.from || b.to - a.to);
  let cluster: T[] = [];
  let reach = -1;
  const close = () => {
    const ends: number[] = [];

    for (const piece of cluster) {
      const free = ends.findIndex(end => end <= piece.from);

      piece.column = free === -1 ? ends.length : free;
      ends[piece.column] = piece.to;
    }

    for (const piece of cluster) piece.columns = ends.length;
    cluster = [];
  };

  for (const piece of sorted) {
    if (piece.from >= reach && cluster.length) close();
    cluster.push(piece);
    reach = Math.max(reach, piece.to);
  }

  if (cluster.length) close();

  return sorted;
}

/** Where Alt with an arrow key puts an event, as Brydio's drawing moves it. */
export function nudged(at: Placed, key: string, options: { shift: boolean; rtl: boolean; slot: number }): { kind: 'move' | 'resize'; at: Placed } | null {
  const forward = options.rtl ? 'ArrowLeft' : 'ArrowRight';
  const back = options.rtl ? 'ArrowRight' : 'ArrowLeft';

  if (at.allday) {
    const by = options.shift ? (key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0) : 0;

    if (options.shift) {
      const end = addDays(at.end || addDays(at.start, 1), by);

      return by && end > at.start ? { kind: 'resize', at: { ...at, end } } : null;
    }

    const days = key === 'ArrowDown' ? 7 : key === 'ArrowUp' ? -7 : key === forward ? 1 : key === back ? -1 : 0;

    return days ? { kind: 'move', at: { start: addDays(at.start, days), end: addDays(at.end || addDays(at.start, 1), days), allday: true } } : null;
  }

  const start = Date.parse(at.start);
  const end = Date.parse(at.end || at.start);
  const slot = options.slot * 60_000;

  if (options.shift) {
    const next = key === 'ArrowDown' ? end + slot : key === 'ArrowUp' ? end - slot : NaN;

    return next > start ? { kind: 'resize', at: { ...at, end: instant(next) } } : null;
  }

  const by = key === 'ArrowDown' ? slot : key === 'ArrowUp' ? -slot : key === forward ? DAY_MS : key === back ? -DAY_MS : 0;

  return by ? { kind: 'move', at: { start: instant(start + by), end: instant(end + by), allday: false } } : null;
}

/** Each hue's edge and tint, from the label tokens. Written out, so each token is one the stylesheet is checked to declare. */
const HUE_RULES = css`
  .hue-gray {
    --bry-ev: var(--label-gray);
    --bry-ev-soft: var(--label-gray-soft);
  }
  .hue-red {
    --bry-ev: var(--label-red);
    --bry-ev-soft: var(--label-red-soft);
  }
  .hue-orange {
    --bry-ev: var(--label-orange);
    --bry-ev-soft: var(--label-orange-soft);
  }
  .hue-yellow {
    --bry-ev: var(--label-yellow);
    --bry-ev-soft: var(--label-yellow-soft);
  }
  .hue-green {
    --bry-ev: var(--label-green);
    --bry-ev-soft: var(--label-green-soft);
  }
  .hue-teal {
    --bry-ev: var(--label-teal);
    --bry-ev-soft: var(--label-teal-soft);
  }
  .hue-blue {
    --bry-ev: var(--label-blue);
    --bry-ev-soft: var(--label-blue-soft);
  }
  .hue-indigo {
    --bry-ev: var(--label-indigo);
    --bry-ev-soft: var(--label-indigo-soft);
  }
  .hue-purple {
    --bry-ev: var(--label-purple);
    --bry-ev-soft: var(--label-purple-soft);
  }
  .hue-pink {
    --bry-ev: var(--label-pink);
    --bry-ev-soft: var(--label-pink-soft);
  }
`;

interface State {
  held: Map<string, Placed>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  answered: unknown;
  settled: unknown;
  sent: string;
  view: View;
  date: string;
  refocus: string | null;
  drag: { id: string; x: number; y: number; width: number; height: number; at: Placed; moved: boolean } | null;
  create: { day: string; from: number; to: number; height: number; y: number } | null;
}

drawAs(
  'bry-calendar-view',
  element => {
    const host = element as unknown as El;

    if (element.loading === true) {
      return html`<div role="status" aria-label="Loading" class="loading"><div class="bone bar"></div><div class="bone"></div><div class="bone"></div></div>`;
    }

    const state = keptOf<State & Record<string, unknown>>(element, () => ({
      held: new Map(),
      timers: new Map(),
      answered: element.events,
      settled: element.settled,
      sent: '',
      view: 'week',
      date: '',
      refocus: null,
      drag: null,
      create: null,
    }));
    const locale = localeOf(host);
    const rtl = rtlOf(host);
    const zone = zoneOf(element.zone);
    const second = element.secondzone === undefined ? '' : zoneOf(element.secondzone);
    const secondZone = second !== 'local' ? second : '';
    const slot = typeof element.slotminutes === 'number' && element.slotminutes >= 5 && element.slotminutes <= 60 ? Math.round(element.slotminutes) : 30;
    const creatable = element.creatable === true;
    const sentView = pick(CALENDAR_VIEWS, element.view) ?? 'week';
    const sentDate = /^\d{4}-\d{2}-\d{2}$/.test(str(element.date)) ? str(element.date) : '';

    // What is shown: the app's until the person moves it, and the app's again when it sends another.
    if (state.sent !== `${sentView}|${sentDate}`) {
      state.sent = `${sentView}|${sentDate}`;
      state.view = sentView;
      state.date = sentDate;
    }

    // New events answer every move waiting; `settled` refuses one.
    if (state.answered !== element.events) {
      state.answered = element.events;
      state.held.clear();
    }

    if (state.settled !== element.settled) {
      state.settled = element.settled;
      if (typeof element.settled === 'string') state.held.delete(element.settled);
    }

    const release = (id: string) => {
      clearTimeout(state.timers.get(id));
      state.timers.delete(id);
      if (state.held.delete(id)) host.requestUpdate();
    };
    const hold = (id: string, at: Placed) => {
      clearTimeout(state.timers.get(id));
      state.timers.set(id, setTimeout(() => release(id), HOLD_MS));
      state.held.set(id, at);
      // The same refusal sent again must still be heard.
      if (element.settled === id) {
        state.settled = undefined;
        element.settled = undefined;
      }
      host.requestUpdate();
    };
    const place = (kind: 'move' | 'resize', id: string, at: Placed) => {
      hold(id, at);
      host.emit(kind, kind === 'move' ? { id, ...at } : { id, start: at.start, end: at.end });
    };

    const events = eventsOf(element.events);
    const placed = (event: CalendarEvent): Placed => state.held.get(event.id) ?? { start: event.start, end: event.end, allday: event.allday };
    const view = state.view;
    const date = state.date || todayIn(zone);
    const days = daysShown(view, date, firstDayOf(locale));
    const go = (next: View, on: string) => {
      state.view = next;
      state.date = on;
      host.emit('navigate', { view: next, date: on });
      host.requestUpdate();
    };
    const tz = zone === 'local' ? {} : { timeZone: zone };
    const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', ...tz });
    const span = (at: Placed) => (at.allday ? 'all day' : `${time.format(new Date(Date.parse(at.start)))} – ${time.format(new Date(Date.parse(at.end || at.start)))}`);
    const empty = str(element.empty) || 'Nothing scheduled.';

    const onKey = (event: CalendarEvent) => (key: KeyboardEvent) => {
      if (!key.altKey || !key.key.startsWith('Arrow') || !event.editable) return;

      const next = nudged(placed(event), key.key, { shift: key.shiftKey, rtl, slot });

      if (!next) return;
      key.preventDefault();
      state.refocus = event.id;
      place(next.kind, event.id, next.at);
    };

    if (state.refocus) {
      const id = state.refocus;

      state.refocus = null;
      queueMicrotask(() => (host.shadowRoot?.querySelector(`[data-event="${CSS.escape(id)}"]`) as HTMLElement | null)?.focus());
    }

    const label = (event: CalendarEvent) =>
      [event.busy ? 'Busy' : event.title || 'Untitled', span(placed(event)), event.busy ? '' : event.meta, event.tentative && 'tentative', event.cancelled && 'cancelled'].filter(Boolean).join(', ');
    const classes = (event: CalendarEvent) =>
      `event hue-${event.busy ? 'gray' : (event.hue ?? 'brand')} ${event.busy ? 'busy' : ''} ${event.tentative ? 'tentative' : ''} ${event.cancelled ? 'cancelled' : ''}`;
    const face = (event: CalendarEvent, withTime: boolean) => html`
      ${withTime ? html`<span class="time">${span(placed(event))}</span>` : nothing}
      <span class="title">${event.busy ? 'Busy' : event.title || 'Untitled'}</span>
      ${!event.busy && event.meta ? html`<span class="meta">${event.meta}</span>` : nothing}
    `;
    const pill = (event: CalendarEvent, withTime = false) => html`<button
      type="button"
      class="${classes(event)} pill"
      data-event=${event.id}
      aria-label=${label(event)}
      @click=${() => host.emit('select', { id: event.id })}
      @keydown=${onKey(event)}
    >
      ${face(event, withTime)}
    </button>`;
    const dayName = (day: string, format: Intl.DateTimeFormatOptions) => {
      const named = new Intl.DateTimeFormat(locale, { ...format, timeZone: 'UTC' }).format(new Date(dayMs(day)));

      return html`<button type="button" class="day-name ${day === todayIn(zone) ? 'today' : ''}" data-day=${day} @click=${() => host.emit('pick', { date: day })}>${named}</button>`;
    };
    const allDayOn = (day: string) =>
      events.filter(event => {
        const at = placed(event);

        return at.allday && at.start <= day && day < (at.end || addDays(at.start, 1));
      });

    const zones = secondZone || element.zone !== undefined ? html`<span class="zones" data-zones="">${secondZone ? `${zoneName(secondZone, locale)} · ${zoneName(zone, locale)}` : zoneName(zone, locale)}</span>` : nothing;

    const title = titleOf(view, days, date, locale);
    const toolbar = html`<div class="toolbar">
      <button type="button" class="today-button" @click=${() => go(view, todayIn(zone))}>Today</button>
      <span class="steps">
        <button type="button" class="step" aria-label="Previous" @click=${() => go(view, stepped(view, date, -1))}><span class="flip-rtl">${icon('back', 14)}</span></button>
        <button type="button" class="step" aria-label="Next" @click=${() => go(view, stepped(view, date, 1))}><span class="flip-rtl">${icon('forward', 14)}</span></button>
      </span>
      <h2 class="heading" aria-live="polite">${title}</h2>
      ${zones}
      <span class="grow"></span>
      ${creatable
        ? html`<button type="button" class="new" @click=${() => host.emit('create', newSlot(state.date, zone, slot))}>${icon('add', 14)} New event</button>`
        : nothing}
      <span role="group" aria-label="View" class="views">
        ${CALENDAR_VIEWS.map(
          one => html`<button type="button" class="view ${view === one ? 'on' : ''}" aria-pressed=${view === one ? 'true' : 'false'} @click=${() => go(one, date)}>${VIEW_LABEL[one]}</button>`,
        )}
      </span>
    </div>`;

    const nothingHere = events.length === 0 ? html`<p class="empty" data-empty="true">${empty}</p>` : nothing;

    if (view === 'agenda') {
      const rows = days.flatMap(day => {
        const opens = instantAt(day, 0, zone);
        const closes = instantAt(addDays(day, 1), 0, zone);
        const on = events.filter(event => {
          const at = placed(event);

          if (at.allday) return at.start <= day && day < (at.end || addDays(at.start, 1));

          const start = Date.parse(at.start);

          return start < closes && Math.max(Date.parse(at.end || at.start), start + 1) > opens;
        });

        if (on.length === 0) return [];

        return [html`<li class="agenda-day">
          <div class="agenda-date">${dayName(day, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <ul class="agenda-events">${on.map(event => html`<li>${pill(event, true)}</li>`)}</ul>
        </li>`];
      });

      return html`<div class="calendar" data-view="agenda">${toolbar}${rows.length ? html`<ul class="agenda">${rows}</ul>` : html`<p class="empty" data-empty="true">${empty}</p>`}</div>`;
    }

    if (view === 'month') {
      const month = date.slice(0, 7);
      const weekdays = days.slice(0, 7);

      return html`<div class="calendar" data-view="month">
        ${toolbar}
        <div class="month">
          ${weekdays.map(day => html`<div class="weekday" aria-hidden="true">${new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(dayMs(day)))}</div>`)}
          ${days.map(day => {
            const timed = piecesOn([day], events, placed, zone).map(piece => piece.event);
            const on = [...allDayOn(day), ...timed];
            const shown = on.slice(0, MONTH_SHOWN);

            return html`<div class="cell ${day.slice(0, 7) === month ? '' : 'outside'}" data-cell=${day}>
              ${dayName(day, { day: 'numeric' })}
              ${shown.map(event => pill(event, !placed(event).allday))}
              ${on.length > MONTH_SHOWN ? html`<button type="button" class="more" @click=${() => go('day', day)}>+${on.length - MONTH_SHOWN} more</button>` : nothing}
            </div>`;
          })}
        </div>
        ${nothingHere}
      </div>`;
    }

    // Day and week: an all-day row, then the hours.
    const pieces = piecesOn(days, events, placed, zone);
    const workday = workdayOf(element.workday);
    const shaded = listOf<Record<string, unknown>>(element.shaded).filter(one => one && typeof one === 'object' && str(one.start));
    const now = wallOf(Date.now(), zone);
    const hours = Array.from({ length: 24 }, (_, hour) => hour);
    const hourLabel = (hour: number, inZone: string, day: string) =>
      new Intl.DateTimeFormat(locale, { hour: 'numeric', ...(inZone === 'local' ? {} : { timeZone: inZone }) }).format(new Date(instantAt(day, hour * 60, zone)));
    const pct = (minute: number) => `${(minute / DAY_MINUTES) * 100}%`;

    const startDrag = (event: CalendarEvent) => (pointer: PointerEvent) => {
      if (!event.editable || pointer.button !== 0) return;

      const column = (pointer.currentTarget as HTMLElement).closest('.column') as HTMLElement | null;

      if (!column) return;

      const box = column.getBoundingClientRect();

      state.drag = { id: event.id, x: pointer.clientX, y: pointer.clientY, width: box.width, height: box.height, at: placed(event), moved: false };
      (pointer.currentTarget as HTMLElement).setPointerCapture?.(pointer.pointerId);
    };
    const dragMove = (pointer: PointerEvent) => {
      const drag = state.drag;

      if (!drag || !drag.height) return;

      const minutes = Math.round(((pointer.clientY - drag.y) / drag.height) * (DAY_MINUTES / slot)) * slot;
      const dayShift = Math.round((pointer.clientX - drag.x) / (drag.width || 1)) * (rtl ? -1 : 1);

      drag.moved = minutes !== 0 || dayShift !== 0;
      (pointer.currentTarget as HTMLElement).style.transform = `translate(${dayShift * (rtl ? -1 : 1) * drag.width}px, ${(minutes / DAY_MINUTES) * drag.height}px)`;
    };
    const endDrag = (pointer: PointerEvent) => {
      const drag = state.drag;

      state.drag = null;
      (pointer.currentTarget as HTMLElement).style.transform = '';

      if (!drag?.moved || !drag.height) return;

      const minutes = Math.round(((pointer.clientY - drag.y) / drag.height) * (DAY_MINUTES / slot)) * slot;
      const dayShift = Math.round((pointer.clientX - drag.x) / (drag.width || 1)) * (rtl ? -1 : 1);
      const by = minutes * 60_000 + dayShift * DAY_MS;
      const at = { start: instant(Date.parse(drag.at.start) + by), end: instant(Date.parse(drag.at.end || drag.at.start) + by), allday: false };

      pointer.preventDefault();
      // The click that ends a drag is not a press.
      host.shadowRoot?.addEventListener('click', stop => stop.stopPropagation(), { capture: true, once: true });
      place('move', drag.id, at);
    };

    const minuteAt = (pointer: PointerEvent, column: HTMLElement) => {
      const box = column.getBoundingClientRect();

      return box.height ? Math.max(0, Math.min(DAY_MINUTES, Math.floor((((pointer.clientY - box.top) / box.height) * DAY_MINUTES) / slot) * slot)) : 0;
    };
    const startCreate = (day: string) => (pointer: PointerEvent) => {
      if (!creatable || pointer.button !== 0 || pointer.target !== pointer.currentTarget) return;

      const column = pointer.currentTarget as HTMLElement;
      const from = minuteAt(pointer, column);

      state.create = { day, from, to: from + slot, height: column.getBoundingClientRect().height, y: pointer.clientY };
      column.setPointerCapture?.(pointer.pointerId);
      host.requestUpdate();
    };
    const moveCreate = (pointer: PointerEvent) => {
      const making = state.create;

      if (!making) return;

      const to = minuteAt(pointer, pointer.currentTarget as HTMLElement) + slot;

      if (to !== making.to) {
        making.to = Math.max(making.from + slot, to);
        host.requestUpdate();
      }
    };
    const endCreate = () => {
      const making = state.create;

      if (!making) return;

      state.create = null;
      host.emit('create', { start: instant(instantAt(making.day, making.from, zone)), end: instant(instantAt(making.day, making.to, zone)), allday: false });
      host.requestUpdate();
    };

    return html`<div class="calendar" data-view=${view}>
      ${toolbar}
      <div class="grid" style="--bry-days: ${days.length}; --bry-axis: ${secondZone ? '7rem' : '4.5rem'}">
        <div class="head">
          <div class="axis-head">${secondZone ? html`<span class="second">${zoneName(secondZone, locale)}</span>` : nothing}<span>${zoneName(zone, locale)}</span></div>
          ${days.map(day => html`<div class="day-head">${dayName(day, view === 'day' ? { weekday: 'long', month: 'short', day: 'numeric' } : { weekday: 'short', day: 'numeric' })}</div>`)}
        </div>
        <div class="all-day">
          <div class="axis-head">All day</div>
          ${days.map(day => html`<div class="all-day-cell">${allDayOn(day).map(event => pill(event))}</div>`)}
        </div>
        <div class="hours" tabindex="0" aria-label="Hours">
          <div class="axis">
            ${hours.map(hour => html`<div class="hour-label" style="top: ${pct(hour * 60)}">
              ${secondZone ? html`<span class="second" data-zone="second">${hourLabel(hour, secondZone, days[0]!)}</span>` : nothing}
              <span>${hour ? hourLabel(hour, zone, days[0]!) : ''}</span>
            </div>`)}
          </div>
          ${days.map(day => {
            const weekday = weekdayOf(day);
            const working = workday && workday.days.includes(weekday) ? workday : null;
            const opens = instantAt(day, 0, zone);
            const closes = instantAt(addDays(day, 1), 0, zone);

            return html`<div
              class="column"
              data-column=${day}
              @pointerdown=${startCreate(day)}
              @pointermove=${moveCreate}
              @pointerup=${endCreate}
            >
              ${hours.map(hour => html`<div class="line" style="top: ${pct(hour * 60)}"></div>`)}
              ${workday && !working ? html`<div class="off" data-off="" style="top: 0; height: 100%"></div>` : nothing}
              ${working
                ? html`<div class="off" data-off="" style="top: 0; height: ${pct(working.start)}"></div>
                    <div class="off" data-off="" style="top: ${pct(working.end)}; height: ${pct(DAY_MINUTES - working.end)}"></div>`
                : nothing}
              ${shaded.map(one => {
                const start = Date.parse(str(one.start));
                const end = Date.parse(str(one.end) || str(one.start));

                if (Number.isNaN(start) || end <= opens || start >= closes) return nothing;

                const from = Math.max(0, (start - opens) / 60_000);
                const to = Math.min(DAY_MINUTES, (end - opens) / 60_000);
                const hue = pick(HUES, one.hue);

                return html`<div class="shade ${hue ? `hue-${hue}` : ''}" data-shade=${str(one.label)} style="top: ${pct(from)}; height: ${pct(to - from)}">
                  ${str(one.label) ? html`<span>${str(one.label)}</span>` : nothing}
                </div>`;
              })}
              ${now.day === day ? html`<div class="now" style="top: ${pct(now.minute)}"></div>` : nothing}
              ${state.create?.day === day
                ? html`<div class="making" style="top: ${pct(state.create.from)}; height: ${pct(state.create.to - state.create.from)}"></div>`
                : nothing}
              ${pieces
                .filter(piece => piece.day === day)
                .map(
                  piece => html`<button
                    type="button"
                    class="${classes(piece.event)} block"
                    data-event=${piece.event.id}
                    aria-label=${label(piece.event)}
                    style="top: ${pct(piece.from)}; height: ${pct(piece.to - piece.from)}; inset-inline-start: ${(piece.column / piece.columns) * 100}%; width: ${100 / piece.columns}%"
                    @click=${() => host.emit('select', { id: piece.event.id })}
                    @keydown=${onKey(piece.event)}
                    @pointerdown=${startDrag(piece.event)}
                    @pointermove=${dragMove}
                    @pointerup=${endDrag}
                  >
                    ${face(piece.event, true)}
                  </button>`,
                )}
            </div>`;
          })}
        </div>
      </div>
      ${nothingHere}
    </div>`;
  },
  [
    FOCUS,
    css`
      :host {
        display: flex;
        min-width: 0;
        min-height: 0;
        flex-direction: column;
      }
      button {
        font: inherit;
        cursor: pointer;
      }
      .loading {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-2xl);
        padding: 0.75rem;
      }
      .bone {
        height: 6rem;
        border-radius: var(--radius-xl);
        background: var(--layer-selected);
      }
      .bone.bar {
        height: 1.75rem;
        width: 14rem;
        border-radius: 9999px;
      }
      .calendar {
        position: relative;
        display: flex;
        min-width: 0;
        min-height: 36rem;
        flex: 1;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: var(--radius-2xl);
        background: var(--bg-surface);
        color: var(--fg);
        font-size: 0.8125rem;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        flex-shrink: 0;
        align-items: center;
        gap: 0.5rem;
        border-bottom: 1px solid var(--line);
        padding: 0.625rem 0.75rem;
      }
      .today-button,
      .new {
        display: inline-flex;
        height: 2rem;
        align-items: center;
        gap: 0.375rem;
        border: 1px solid var(--line-strong);
        border-radius: 9999px;
        background: var(--bg-surface);
        padding: 0 0.875rem;
        font-weight: 500;
        color: var(--fg-strong);
      }
      .new {
        border-color: transparent;
        background: var(--brand);
        color: var(--brand-on);
      }
      .steps {
        display: inline-flex;
        gap: 0.125rem;
      }
      .step {
        display: inline-flex;
        width: 2rem;
        height: 2rem;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        color: var(--fg-soft);
      }
      .step:hover,
      .today-button:hover {
        background: var(--layer-hover);
      }
      :host(:dir(rtl)) .flip-rtl {
        display: inline-flex;
        transform: scaleX(-1);
      }
      .heading {
        margin: 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--fg-strong);
      }
      .zones {
        border-radius: 9999px;
        background: var(--layer-hover);
        padding: 0.25rem 0.625rem;
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--fg-muted);
      }
      .grow {
        flex: 1;
      }
      .views {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 9999px;
        padding: 0.125rem;
      }
      .view {
        height: 1.75rem;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        padding: 0 0.75rem;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--fg-muted);
      }
      .view.on {
        background: var(--bg-fill);
        color: var(--fg-strong);
      }
      .day-name {
        border: 0;
        border-radius: 9999px;
        background: transparent;
        padding: 0.1875rem 0.625rem;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--fg-muted);
      }
      .day-name:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
      .day-name.today {
        background: var(--brand);
        color: var(--brand-on);
      }
      .grid {
        display: flex;
        min-height: 0;
        flex: 1;
        flex-direction: column;
      }
      .head,
      .all-day {
        display: grid;
        grid-template-columns: var(--bry-axis) repeat(var(--bry-days), minmax(0, 1fr));
        border-bottom: 1px solid var(--line-faint);
      }
      .axis-head {
        display: flex;
        align-items: center;
        justify-content: end;
        gap: 0.5rem;
        padding: 0.375rem 0.5rem;
        font-size: 0.6875rem;
        color: var(--fg-faint);
      }
      .day-head {
        display: flex;
        justify-content: center;
        padding: 0.375rem 0;
      }
      .all-day-cell {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.125rem;
        border-inline-start: 1px solid var(--line-faint);
        padding: 0.125rem;
      }
      .hours {
        position: relative;
        display: grid;
        min-height: 0;
        flex: 1;
        grid-template-columns: var(--bry-axis) repeat(var(--bry-days), minmax(0, 1fr));
        overflow-y: auto;
      }
      .axis,
      .column {
        position: relative;
        height: 66rem;
      }
      .column {
        border-inline-start: 1px solid var(--line-faint);
        touch-action: none;
      }
      .hour-label {
        position: absolute;
        inset-inline-end: 0.5rem;
        display: flex;
        gap: 0.5rem;
        transform: translateY(-50%);
        white-space: nowrap;
        font-size: 0.6875rem;
        color: var(--fg-faint);
      }
      .second {
        opacity: 0.75;
      }
      .line {
        position: absolute;
        inset-inline: 0;
        border-top: 1px solid var(--line-faint);
        pointer-events: none;
      }
      .off {
        position: absolute;
        inset-inline: 0;
        background: color-mix(in oklab, var(--fg) 4%, transparent);
        pointer-events: none;
      }
      .shade {
        position: absolute;
        inset-inline: 0.125rem;
        border-radius: var(--radius-sm);
        background: var(--bry-ev-soft, var(--layer-selected));
        background-image: repeating-linear-gradient(135deg, color-mix(in oklab, var(--fg) 5%, transparent) 0 4px, transparent 4px 10px);
        padding: 0.25rem 0.375rem;
        font-size: 0.6875rem;
        color: var(--fg-muted);
        pointer-events: none;
      }
      .now {
        position: absolute;
        inset-inline: 0;
        z-index: 3;
        border-top: 2px solid var(--danger);
        pointer-events: none;
      }
      .making {
        position: absolute;
        inset-inline: 0.125rem;
        z-index: 2;
        border-radius: var(--radius-md);
        background: var(--brand-soft);
        pointer-events: none;
      }
      .event {
        display: flex;
        min-width: 0;
        flex-direction: column;
        align-items: start;
        gap: 1px;
        overflow: hidden;
        border: 0;
        border-inline-start: 3px solid var(--bry-ev);
        border-radius: var(--radius-md);
        background: var(--bry-ev-soft);
        padding: 0.1875rem 0.375rem;
        text-align: start;
        line-height: 1.25;
        color: var(--fg);
      }
      .block {
        position: absolute;
        z-index: 1;
        box-shadow: 0 0 0 1px var(--bg-surface);
      }
      .pill {
        flex-direction: row;
        align-items: center;
        gap: 0.375rem;
        border-radius: 9999px;
      }
      .time,
      .meta {
        overflow: hidden;
        font-size: 0.6875rem;
        color: var(--fg-muted);
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .title {
        overflow: hidden;
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .busy {
        background: var(--bg-surface-soft);
        background-image: repeating-linear-gradient(135deg, var(--layer-selected) 0 6px, transparent 6px 12px);
        border-inline-start-color: var(--line-strong);
      }
      .busy .title {
        color: var(--fg-muted);
      }
      .tentative {
        border: 1.5px dashed var(--bry-ev);
        background: color-mix(in oklab, var(--bry-ev-soft) 45%, transparent);
      }
      .cancelled {
        opacity: 0.6;
      }
      .cancelled .title {
        text-decoration: line-through;
      }
      .month {
        display: grid;
        flex: 1;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        grid-auto-rows: minmax(6rem, 1fr);
      }
      .month .weekday {
        min-height: 0;
        padding: 0.5rem;
        text-align: center;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--fg-muted);
      }
      .cell {
        display: flex;
        min-width: 0;
        flex-direction: column;
        align-items: stretch;
        gap: 0.125rem;
        border-top: 1px solid var(--line-faint);
        border-inline-start: 1px solid var(--line-faint);
        padding: 0.25rem;
      }
      .cell > .day-name {
        align-self: start;
      }
      .cell.outside .day-name {
        color: var(--fg-faint);
      }
      .more {
        align-self: start;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        padding: 0.0625rem 0.5rem;
        font-size: 0.6875rem;
        color: var(--fg-muted);
      }
      .agenda,
      .agenda-events {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .agenda {
        overflow-y: auto;
      }
      .agenda-date {
        background: var(--bg-surface-soft);
        padding: 0.375rem 0.75rem;
      }
      .agenda-events {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.5rem 0.75rem;
      }
      .agenda-events .pill {
        width: 100%;
      }
      .empty {
        margin: 1rem auto;
        border: 1px dashed var(--line-strong);
        border-radius: var(--radius-2xl);
        padding: 1rem 1.5rem;
        text-align: center;
        color: var(--fg-muted);
      }
      .grid ~ .empty,
      .month ~ .empty {
        position: absolute;
        inset-inline: 0;
        top: 40%;
        width: fit-content;
        background: var(--bg-surface);
        pointer-events: none;
      }
      .hue-brand {
        --bry-ev: var(--brand);
        --bry-ev-soft: var(--brand-soft);
      }
      ${HUE_RULES}
    `,
  ],
);

/** `workday` as minutes of the day and the weekdays it holds, or nothing to shade. */
function workdayOf(value: unknown): { days: number[]; start: number; end: number } | null {
  if (!value || typeof value !== 'object') return null;

  const day = value as Record<string, unknown>;
  const clock = (text: unknown) => {
    const match = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(str(text));

    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = clock(day.start);
  const end = clock(day.end);

  if (start === null || end === null) return null;

  const days = Array.isArray(day.days) ? day.days.filter((one): one is number => Number.isInteger(one) && one >= 0 && one <= 6) : [1, 2, 3, 4, 5];

  return { days, start, end };
}

/** A zone's short name now (`BST`, `GMT+1`), for the toolbar. */
function zoneName(zone: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZoneName: 'short', ...(zone === 'local' ? {} : { timeZone: zone }) }).formatToParts(new Date());

    return parts.find(part => part.type === 'timeZoneName')?.value ?? zone;
  } catch {
    return zone;
  }
}

/** What the toolbar says is shown: `October 2026`, `Oct 4 – 10, 2026`, `Wednesday, October 7, 2026`. */
function titleOf(view: View, days: string[], date: string, locale: string): string {
  const at = (iso: string) => new Date(dayMs(iso));

  if (view === 'month') return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(at(date));
  if (view === 'day') return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(at(date));

  const range = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  return range.formatRange(at(days[0]!), at(days.at(-1)!));
}

/** The next slot after now on today, else 9:00 on the day shown: what New event creates. */
export function newSlot(date: string, zone: string, slot: number, now = Date.now()): Placed {
  const here = wallOf(now, zone);
  const day = date || here.day;
  const from = day === here.day ? Math.ceil((here.minute + 1) / slot) * slot : 9 * 60;

  return { start: instant(instantAt(day, from, zone)), end: instant(instantAt(day, from + Math.max(slot, 30), zone)), allday: false };
}

