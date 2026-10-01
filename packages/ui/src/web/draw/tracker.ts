/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { ACTIVITY_MARKS, BUTTON_ICONS, COMMENT_ACTIONS, GANTT_ZOOMS, MARKS, PRIORITIES } from '../../catalogue.ts';
import { drawAs } from '../define.ts';
import { draftOf, keptOf, type El } from './catalogue-b-shared.ts';
import {
  closeOnLeave,
  face,
  faces,
  focusActive,
  fullTime,
  icon,
  localeOf,
  menuRows,
  optionMark,
  PLAN,
  popOf,
  popupKeys,
  PRIORITY_LABEL,
  priorityMark,
  records,
  STATE_TONE,
  strings,
  timeAgo,
  TONE_DOT,
  TONE_INK,
  TONE_NAMES,
  type Tone,
  type TreeRow,
} from './plan-shared.ts';
import { FOCUS, pick, str, TYPE } from './tokens.ts';

/**
 * The issue tracker's elements, as Brydio's React catalogue draws them
 * (`packages/app/src/apps/catalogue/draw/{gantt,timeline,comment,reactions,
 * peek,spreadsheet,rich-text,property-list,keys}.tsx`), with the same events
 * and details. Where Brydio uses a library this build doesn't carry — the
 * rich-text editor is TipTap there — the drawing here keeps the contract
 * (markdown in, markdown out) with the platform's own controls.
 */

const as = (element: unknown) => element as El;

/** Whether a key press belongs to something being typed in, or a control that uses the keys itself. */
function typing(event: KeyboardEvent): boolean {
  for (const target of event.composedPath()) {
    if (!(target instanceof Element)) continue;
    if (target.matches("input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox'], [role='menu'], [role='listbox'], [role='slider'], [role='tab']")) {
      return true;
    }
  }

  return false;
}

/**
 * Listens on the page for as long as `element` is on it, once per element.
 * The listener takes itself off the first time it hears a key after the
 * element has gone.
 */
const listening = new WeakSet<object>();

function listenOnPage(element: El, listen: (event: KeyboardEvent) => void): void {
  if (listening.has(element) || typeof document === 'undefined') return;

  listening.add(element);

  const heard = (event: KeyboardEvent) => {
    if (!element.isConnected) {
      document.removeEventListener('keydown', heard);
      listening.delete(element);

      return;
    }
    listen(event);
  };

  document.addEventListener('keydown', heard);
}

// ---------------------------------------------------------------------------
// bry-gantt

type Zoom = (typeof GANTT_ZOOMS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_PX = 36;
const PANE_PX = 280;
const DAY_PX: Record<Zoom, number> = { day: 36, week: 14, month: 6 };
const SPAN: Record<Zoom, number> = { day: 28, week: 84, month: 182 };
const STEP: Record<Zoom, number> = { day: 7, week: 28, month: 91 };
const LEAD: Record<Zoom, number> = { day: 3, week: 7, month: 14 };
const ZOOM_LABEL: Record<Zoom, string> = { day: 'Day', week: 'Week', month: 'Month' };

/** A bar in each tone: its border, fill and ink. */
const BAR: Record<Tone, string> = {
  neutral: 'border-color: var(--line-strong); background: var(--layer-selected); color: var(--fg)',
  brand: 'border-color: var(--brand-line); background: var(--brand-soft); color: var(--brand-fg)',
  success: 'border-color: var(--success-line); background: var(--success-soft); color: var(--success-fg)',
  warn: 'border-color: var(--warn-line); background: var(--warn-soft); color: var(--warn-fg)',
  danger: 'border-color: var(--danger-line); background: var(--danger-soft); color: var(--danger-fg)',
};

interface GanttRow {
  id: string;
  title: string;
  identifier: string;
  mark?: (typeof MARKS)[number];
  tone?: Tone;
  priority?: (typeof PRIORITIES)[number];
  assignee: string;
  start: number | null;
  end: number | null;
}

/** An ISO day as the UTC midnight it starts at, or `null`. */
export function dayOf(iso: unknown): number | null {
  const match = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;

  if (!match) return null;

  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  return Number.isNaN(time) ? null : time;
}

export const isoOf = (time: number): string => new Date(time).toISOString().slice(0, 10);

const todayUtc = (now = new Date()) => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const addDays = (time: number, days: number) => time + days * DAY_MS;
const daysBetween = (from: number, to: number) => Math.round((to - from) / DAY_MS);

/** The days drawn: from `start` for one window, or around every row and today. */
export function rangeOf(rows: readonly { start: number | null; end: number | null }[], zoom: Zoom, start: number | null, now: number): { first: number; days: number } {
  if (start !== null) return { first: start, days: SPAN[zoom] };

  const dates = rows.flatMap(row => [row.start, row.end]).filter((one): one is number => one !== null);
  const first = addDays(Math.min(now, ...dates), -LEAD[zoom]);
  const last = addDays(Math.max(now, ...dates), LEAD[zoom] + 1);

  return { first, days: Math.max(SPAN[zoom], daysBetween(first, last)) };
}

function ganttRows(value: unknown): GanttRow[] {
  return records(value).map(row => ({
    id: str(row.id),
    title: str(row.title),
    identifier: str(row.identifier),
    mark: pick(MARKS, row.mark),
    tone: pick(TONE_NAMES, row.tone),
    priority: pick(PRIORITIES, row.priority),
    assignee: str(row.assignee),
    start: dayOf(row.start),
    end: dayOf(row.end),
  }));
}

const toneOfRow = (row: GanttRow): Tone => row.tone ?? (row.mark && row.mark in STATE_TONE ? STATE_TONE[row.mark as keyof typeof STATE_TONE] : 'neutral');

function format(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
  }
}

drawAs(
  'bry-gantt',
  element => {
    const host = as(element);

    if (element.loading === true) {
      return html`<div role="status" aria-label="Loading" class="loading">${[0, 1, 2, 3].map(() => html`<div class="bone"></div>`)}</div>`;
    }

    const locale = localeOf(host);
    const zoom = pick(GANTT_ZOOMS, element.zoom) ?? 'week';
    const rows = ganttRows(element.rows);
    const now = todayUtc();
    const start = dayOf(element.start);
    const { first, days } = rangeOf(rows, zoom, start, now);
    const dayPx = DAY_PX[zoom];
    const width = days * dayPx;
    const todayAt = daysBetween(first, now);
    const showToday = todayAt >= 0 && todayAt < days;
    const shownFirst = start ?? first;
    const navigate = (to: number) => host.emit('navigate', { start: isoOf(to) });
    const showCompleted = element.showCompleted === true;

    const toolbar = html`<div class="toolbar">
      <div role="group" aria-label="Zoom" class="zooms">
        ${GANTT_ZOOMS.map(
          one => html`<button type="button" class="zoom ${zoom === one ? 'on' : ''}" aria-pressed=${zoom === one ? 'true' : 'false'} @click=${() => host.emit('zoom', { zoom: one })}>
            ${ZOOM_LABEL[one]}
          </button>`,
        )}
      </div>
      <div class="steps">
        <button type="button" class="step" aria-label="Previous" @click=${() => navigate(addDays(shownFirst, -STEP[zoom]))}><span class="flip-rtl">${icon('back', 14)}</span></button>
        <button type="button" class="step today" @click=${() => navigate(addDays(now, -LEAD[zoom]))}>Today</button>
        <button type="button" class="step" aria-label="Next" @click=${() => navigate(addDays(shownFirst, STEP[zoom]))}><span class="flip-rtl">${icon('forward', 14)}</span></button>
      </div>
      <span class="grow"></span>
      <label class="completed">
        <button
          type="button"
          role="switch"
          class="switch"
          aria-label="Show completed"
          aria-checked=${showCompleted ? 'true' : 'false'}
          @click=${() => host.emit('completed', { checked: !showCompleted })}
        >
          <span class="thumb"></span>
        </button>
        <span aria-hidden="true">Show completed</span>
      </label>
    </div>`;

    if (rows.length === 0) {
      return html`<div class="chart" data-empty="true">${toolbar}<p class="empty">${str(element.empty) || 'Nothing is scheduled.'}</p></div>`;
    }

    const long = format(locale, { month: 'short', day: 'numeric', year: 'numeric' });
    const monthYear = format(locale, { month: 'short', year: 'numeric' });
    const weekday = format(locale, { weekday: 'short' });
    const monthDay = format(locale, { month: 'short', day: 'numeric' });
    const end = addDays(first, days);
    const months: { label: string; at: number; span: number }[] = [];

    for (let cursor = first; cursor < end; ) {
      const date = new Date(cursor);
      const next = Math.min(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1), end);

      months.push({ label: monthYear.format(date), at: daysBetween(first, cursor), span: daysBetween(cursor, next) });
      cursor = next;
    }

    const dayList = Array.from({ length: days }, (_, index) => new Date(addDays(first, index)));

    const axis = html`<div class="axis" aria-hidden="true" style="width: ${width}px">
      <div class="months">
        ${months.map(
          month => html`<div class="month" style="inset-inline-start: ${month.at * dayPx}px; width: ${month.span * dayPx}px">
            ${month.span * dayPx > 40 ? html`<span class="truncate">${month.label}</span>` : nothing}
          </div>`,
        )}
      </div>
      <div class="ticks">
        ${dayList.map((date, index) => {
          const monthStart = date.getUTCDate() === 1;
          const weekStart = date.getUTCDay() === 1;
          const labelled = zoom === 'day' || (zoom === 'week' && weekStart) || (zoom === 'month' && monthStart);

          return html`<div
            class="tick ${monthStart ? 'month-start' : weekStart ? 'week-start' : ''}"
            data-day=${isoOf(date.getTime())}
            style="inset-inline-start: ${index * dayPx}px; width: ${dayPx}px"
          >
            ${labelled
              ? html`<span class="tick-label">${zoom === 'month' ? monthDay.format(date) : date.getUTCDate()}${zoom === 'day' ? html`<span>${weekday.format(date)}</span>` : nothing}</span>`
              : nothing}
          </div>`;
        })}
        ${showToday ? html`<div class="today-line" style="inset-inline-start: ${todayAt * dayPx}px"></div>` : nothing}
      </div>
    </div>`;

    const background = html`<div class="background" aria-hidden="true" style="inset-inline-start: ${PANE_PX}px; width: ${width}px; height: ${rows.length * ROW_PX}px">
      ${dayList.map((date, index) => {
        const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
        const monthStart = date.getUTCDate() === 1;
        const weekStart = date.getUTCDay() === 1;

        if (!weekend && !monthStart && !weekStart) return nothing;

        return html`<div class="day" data-weekend=${weekend ? 'true' : nothing} style="inset-inline-start: ${index * dayPx}px; width: ${dayPx}px">
          ${weekend ? html`<div class="weekend"></div>` : nothing}${monthStart || weekStart ? html`<div class="line ${monthStart ? 'strong' : ''}"></div>` : nothing}
        </div>`;
      })}
      ${showToday ? html`<div class="today-line" data-today="true" style="inset-inline-start: ${todayAt * dayPx}px"></div>` : nothing}
    </div>`;

    const drawRow = (row: GanttRow) => {
      const press = () => host.emit('press', { id: row.id });
      // A start after the end is a mistake in the data: draw it anyway, in the warning tone, and say so.
      const inverted = row.start !== null && row.end !== null && row.start > row.end;
      const from = row.start !== null && row.end !== null ? Math.min(row.start, row.end) : (row.start ?? row.end);
      const to = row.start !== null && row.end !== null ? Math.max(row.start, row.end) : (row.start ?? row.end);
      const tone = inverted ? 'warn' : toneOfRow(row);
      const span = `${row.start !== null ? long.format(row.start) : '—'} → ${row.end !== null ? long.format(row.end) : '—'}`;
      let bar: { at: number; width: number; single: boolean } | null = null;

      if (from !== null && to !== null) {
        const at = Math.max(daysBetween(first, from), 0);
        const until = Math.min(daysBetween(first, to) + 1, days);

        if (until > at) {
          const single = row.start === null || row.end === null;

          bar = single ? { at: at * dayPx, width: Math.max(dayPx, 12), single } : { at: at * dayPx, width: (until - at) * dayPx, single };
        }
      }

      return html`<div role="listitem" class="row" data-row=${row.id}>
        <button type="button" class="pane" @click=${press}>
          ${row.mark ? optionMark(row.mark, row.tone, row.assignee, row.assignee) : nothing}
          ${row.priority ? html`<span class="priority" title=${PRIORITY_LABEL[row.priority]}>${priorityMark(row.priority)}</span>` : nothing}
          ${row.identifier ? html`<span class="identifier truncate">${row.identifier}</span>` : nothing}
          <span class="row-title truncate">${row.title}</span>
          ${row.assignee ? face(row.assignee, row.assignee) : nothing}
        </button>
        <div class="lane" style="width: ${width}px">
          ${bar
            ? html`<div
                class="bar ${bar.single ? 'marker' : 'range'}"
                data-bar=${bar.single ? 'marker' : 'range'}
                data-tone=${tone}
                data-inverted=${inverted ? 'true' : nothing}
                title="${row.title}\n${span}${inverted ? '\nStarts after it ends' : ''}"
                style="inset-inline-start: ${bar.at}px; ${bar.single ? `background: ${TONE_DOT[tone]}` : `width: ${bar.width}px; ${BAR[tone]}`}"
                @click=${press}
              >
                ${!bar.single && bar.width > 60 ? html`<span class="bar-title truncate">${row.title}</span>` : nothing}
                ${inverted ? html`<span class="unseen">Starts after it ends</span>` : nothing}
              </div>`
            : from === null
              ? html`<div class="bar placeholder" data-bar="placeholder" style="inset-inline-start: ${(showToday ? todayAt : 0) * dayPx}px" @click=${press}>No dates</div>`
              : nothing}
        </div>
      </div>`;
    };

    return html`<div class="chart" data-zoom=${zoom}>
      ${toolbar}
      <div class="scroller" tabindex="0" aria-label="Timeline">
        <div style="min-width: ${PANE_PX + width}px">
          <div class="head">
            <div class="pane-head">Work item</div>
            ${axis}
          </div>
          <div role="list" aria-label="Scheduled work" class="rows">${background}${rows.map(drawRow)}</div>
        </div>
      </div>
    </div>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: flex;
        min-width: 0;
        min-height: 0;
        flex-direction: column;
      }
      .chart {
        display: flex;
        min-width: 0;
        min-height: 0;
        flex: 1;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background: var(--bg-surface);
      }
      .loading {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .loading .bone {
        height: 2.25rem;
      }
      button {
        font: inherit;
        cursor: pointer;
      }
      .toolbar {
        display: flex;
        height: 2.5rem;
        flex-shrink: 0;
        align-items: center;
        gap: 0.5rem;
        border-bottom: 1px solid var(--line);
        padding: 0 0.75rem;
      }
      .zooms {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 9999px;
        padding: 0.125rem;
      }
      .zoom {
        height: 1.5rem;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        padding: 0 0.625rem;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--fg-muted);
      }
      .zoom.on {
        background: var(--bg-fill);
        color: var(--fg-strong);
      }
      .steps {
        display: flex;
        align-items: center;
        gap: 0.125rem;
      }
      .step {
        display: inline-flex;
        height: 1.5rem;
        min-width: 1.5rem;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--fg-soft);
      }
      .step:hover {
        background: var(--layer-hover);
      }
      .today {
        padding: 0 0.5rem;
        font-size: 0.75rem;
      }
      .flip-rtl {
        display: inline-flex;
      }
      :host(:dir(rtl)) .flip-rtl {
        transform: scaleX(-1);
      }
      .grow {
        flex: 1;
      }
      .completed {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .switch {
        display: inline-flex;
        width: 1.75rem;
        height: 1rem;
        align-items: center;
        border: 1px solid transparent;
        border-radius: 9999px;
        background: var(--input);
        padding: 0;
      }
      .switch[aria-checked='true'] {
        background: var(--primary);
      }
      .thumb {
        display: block;
        width: 0.875rem;
        height: 0.875rem;
        border-radius: 9999px;
        background: var(--background);
        transition: transform var(--dur-fast);
      }
      .switch[aria-checked='true'] .thumb {
        transform: translateX(calc(100% - 2px));
      }
      :host(:dir(rtl)) .switch[aria-checked='true'] .thumb {
        transform: translateX(calc(-100% + 2px));
      }
      .empty {
        margin: 0;
        padding: 2.5rem 1rem;
        text-align: center;
        font-size: 0.875rem;
        color: var(--fg-muted);
      }
      .scroller {
        min-height: 0;
        flex: 1;
        overflow: auto;
        outline: none;
        /* The days scroll inside it: they don't widen whatever holds the chart. */
        contain: inline-size;
      }
      .head {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
      }
      .pane-head {
        position: sticky;
        inset-inline-start: 0;
        z-index: 30;
        display: flex;
        width: ${PANE_PX}px;
        height: 3.5rem;
        flex-shrink: 0;
        align-items: flex-end;
        border-inline-end: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
        background: var(--bg-surface);
        padding: 0 0.75rem 0.375rem;
        font-size: 0.625rem;
        font-weight: 500;
        color: var(--fg-muted);
      }
      .axis {
        position: relative;
        height: 3.5rem;
        flex-shrink: 0;
        border-bottom: 1px solid var(--line);
        background: var(--bg-surface);
      }
      .months {
        position: relative;
        height: 1.75rem;
        border-bottom: 1px solid var(--line);
      }
      .month {
        position: absolute;
        top: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        padding: 0 0.5rem;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--fg);
      }
      .ticks {
        position: relative;
        height: 1.75rem;
      }
      .tick {
        position: absolute;
        top: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-inline-start: 1px solid var(--line);
        font-size: 0.625rem;
        color: var(--fg-muted);
      }
      .tick.month-start {
        border-inline-start-color: var(--line-strong);
      }
      .tick-label {
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.1;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .today-line {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 1px;
        background: var(--brand);
      }
      .rows {
        position: relative;
      }
      .background {
        position: absolute;
        top: 0;
        pointer-events: none;
      }
      .day {
        position: absolute;
        top: 0;
        bottom: 0;
      }
      .weekend {
        position: absolute;
        inset: 0;
        background: var(--layer-hover);
      }
      .line {
        position: absolute;
        top: 0;
        bottom: 0;
        inset-inline-start: 0;
        width: 1px;
        background: var(--line);
      }
      .line.strong {
        background: var(--line-strong);
      }
      .row {
        display: flex;
        height: ${ROW_PX}px;
        border-bottom: 1px solid var(--line);
      }
      .row:hover {
        background: var(--layer-hover);
      }
      .pane {
        position: sticky;
        inset-inline-start: 0;
        z-index: 1;
        display: flex;
        width: ${PANE_PX}px;
        min-width: 0;
        flex-shrink: 0;
        align-items: center;
        gap: 0.5rem;
        border: 0;
        border-inline-end: 1px solid var(--line);
        background: var(--bg-surface);
        padding: 0 0.75rem;
        text-align: start;
        font-size: 0.875rem;
        color: var(--fg);
      }
      .priority {
        display: flex;
        flex-shrink: 0;
      }
      .identifier {
        width: 3.5rem;
        flex-shrink: 0;
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
        color: var(--fg-muted);
      }
      .row-title {
        flex: 1;
      }
      .lane {
        position: relative;
        flex-shrink: 0;
      }
      .bar {
        position: absolute;
        top: 50%;
        cursor: pointer;
      }
      .bar.range {
        display: flex;
        height: 1.25rem;
        align-items: center;
        border: 1px solid;
        border-radius: 9999px;
        transform: translateY(-50%);
      }
      .bar.marker {
        width: 0.75rem;
        height: 0.75rem;
        border-radius: 3px;
        transform: translateY(-50%) rotate(45deg);
      }
      .bar.placeholder {
        display: flex;
        height: 1.25rem;
        align-items: center;
        border: 1px dashed var(--line-strong);
        border-radius: 9999px;
        padding: 0 0.5rem;
        transform: translateY(-50%);
        white-space: nowrap;
        font-size: 0.625rem;
        color: var(--fg-muted);
      }
      .bar-title {
        display: block;
        padding: 0 0.5rem;
        font-size: 0.625rem;
        line-height: 1rem;
        font-weight: 500;
      }
    `,
  ],
);

// ---------------------------------------------------------------------------
// bry-timeline, bry-timeline-item

/** The mark for each kind of change. */
const ACTIVITY_ICON: Record<(typeof ACTIVITY_MARKS)[number], string> = {
  status: 'status',
  priority: 'flag',
  assignee: 'userAdd',
  date: 'calendar',
  title: 'rename',
  description: 'docs',
  duplicate: 'layers',
  created: 'add',
  comment: 'reply',
};

/** A moment, said relatively, with the whole of it on hover. */
const ago = (element: HTMLElement, iso: string, extra = '') => {
  const locale = localeOf(element);
  const said = timeAgo(iso, locale);

  return said ? html`<time class="ago ${extra}" datetime=${iso} title=${fullTime(iso, locale)}>${said}</time>` : nothing;
};

drawAs(
  'bry-timeline',
  element => {
    const host = as(element);

    if (element.loading === true) {
      return html`<div role="status" aria-label="Loading" class="stack">${[0, 1, 2].map(() => html`<div class="bone line-bone"></div>`)}</div>`;
    }

    const count = host.children.length;

    if (count === 0) return html`<p class="empty">${str(element.empty) || 'No activity yet.'}</p>`;
    if (element.folded === true) {
      return html`<button type="button" class="fold" aria-expanded="false" @click=${() => host.emit('expand')}>
        <span class="flip-rtl">${icon('chevronRight', 12)}</span>${str(element.collapsedLabel) || `${count} ${count === 1 ? 'activity' : 'activities'}`}
      </button>`;
    }

    return html`<div role="list" class="stack"><slot></slot></div>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .stack {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .line-bone {
        height: 0.75rem;
      }
      .empty {
        margin: 0;
        padding: 1.5rem 0;
        text-align: center;
        font-size: 0.875rem;
        color: var(--fg-muted);
      }
      .fold {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        margin-inline-start: -0.375rem;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        padding: 0.125rem 0.375rem;
        font: inherit;
        font-size: 0.75rem;
        color: var(--fg-muted);
        cursor: pointer;
      }
      .fold:hover {
        color: var(--fg);
      }
      .flip-rtl {
        display: inline-flex;
      }
      :host(:dir(rtl)) .flip-rtl {
        transform: scaleX(-1);
      }
    `,
  ],
);

drawAs(
  'bry-timeline-item',
  element => {
    const host = as(element);
    const mark = pick(ACTIVITY_MARKS, element.mark);
    const tone = pick(TONE_NAMES, element.tone) ?? 'neutral';
    const actor = str(element.actor);
    const count = typeof element.count === 'number' ? element.count : 1;

    host.setAttribute('role', 'listitem');

    return html`<div class="item">
      <span class="lead">
        ${mark
          ? html`<span class="mark" data-mark=${mark} style="color: ${TONE_INK[tone]}">${icon(ACTIVITY_ICON[mark], 16)}</span>`
          : actor
            ? face(str(element.actorId) || actor, actor, 'xs')
            : nothing}
      </span>
      <span class="body">
        ${actor ? html`<span class="actor">${actor}</span>` : nothing}
        <span class="truncate">${str(element.text)}</span>
        ${count > 1 ? html`<span class="times">×${count}</span>` : nothing}
        ${ago(host, str(element.time), 'end')}
      </span>
    </div>`;
  },
  [
    PLAN,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .item {
        display: flex;
        align-items: center;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .lead {
        display: flex;
        width: 1rem;
        flex-shrink: 0;
        justify-content: center;
        margin-inline-end: 0.5rem;
      }
      .mark {
        display: inline-flex;
      }
      .body {
        display: flex;
        min-width: 0;
        flex: 1;
        align-items: center;
        gap: 0.25rem;
      }
      .actor {
        flex-shrink: 0;
        font-weight: 500;
        color: var(--fg);
      }
      .times {
        flex-shrink: 0;
        border-radius: 9999px;
        background: var(--layer-hover);
        padding: 0.125rem 0.375rem;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
      }
      .ago {
        flex-shrink: 0;
        cursor: default;
      }
      .ago.end {
        margin-inline-start: auto;
        padding-inline-start: 0.25rem;
      }
    `,
  ],
);

// ---------------------------------------------------------------------------
// bry-comment

type CommentAction = (typeof COMMENT_ACTIONS)[number];

/** Shown as buttons on hover as well as in the menu. */
const QUICK_ACTIONS: readonly CommentAction[] = ['reply', 'edit'];
const ACTION_ICON: Record<CommentAction, string> = {
  reply: 'reply',
  quote: 'quote',
  edit: 'edit',
  resolve: 'check',
  copy: 'copy',
  copyLink: 'link',
  subIssue: 'branch',
  delete: 'trash',
};

function actionLabel(action: CommentAction, resolved: boolean): string {
  switch (action) {
    case 'reply':
      return 'Reply';
    case 'quote':
      return 'Quote reply';
    case 'edit':
      return 'Edit';
    case 'resolve':
      return resolved ? 'Reopen thread' : 'Resolve thread';
    case 'copy':
      return 'Copy text';
    case 'copyLink':
      return 'Copy link';
    case 'subIssue':
      return 'Create sub-issue';
    case 'delete':
      return 'Delete';
  }
}

drawAs(
  'bry-comment',
  element => {
    const host = as(element);

    if (element.loading === true) return html`<div role="status" aria-label="Loading"><div class="bone block"></div></div>`;

    const author = str(element.author);
    const reply = element.depth === 1;
    const deleted = element.deleted === true;
    const resolved = element.resolved === true;
    const collapsed = element.collapsed === true;
    const replies = typeof element.replies === 'number' ? element.replies : 0;
    // Always in the menu's own order, whatever order the app gave.
    const given = new Set(strings(element.actions));
    const actions = deleted ? [] : COMMENT_ACTIONS.filter(action => given.has(action));
    const quick = actions.filter(action => QUICK_ACTIONS.includes(action));
    const hasBody = !deleted && host.children.length > 0;
    const repliers = records(element.repliers).map(one => ({ id: str(one.id), name: str(one.name) }));
    const pop = popOf(host, 'actions');
    const rows: TreeRow[] = actions.map(action => ({
      id: action,
      label: actionLabel(action, resolved),
      icon: ACTION_ICON[action],
      tone: action === 'delete' ? 'danger' : '',
      separator: action === 'delete' && actions.length > 1,
    }));
    const close = (refocus = true) => {
      pop.open = false;
      pop.active = -1;
      host.requestUpdate();
      if (refocus) queueMicrotask(() => (host.shadowRoot?.querySelector('.more-actions') as HTMLElement | null)?.focus());
    };
    const choose = (index: number) => {
      const row = rows[index];

      if (!row) return;
      host.emit('action', { id: row.id });
      close();
    };

    return html`<article
      class="comment ${reply ? 'reply' : 'thread'} ${element.highlighted === true ? 'highlighted' : ''}"
      data-depth=${reply ? '1' : '0'}
      aria-label=${deleted ? 'Deleted comment' : `Comment by ${author}`}
    >
      <header class=${hasBody ? 'with-body' : ''}>
        ${deleted
          ? html`<span class="deleted truncate">This comment was deleted</span>`
          : html`${face(str(element.authorId) || author, author)}<span class="author">${author}</span>${ago(host, str(element.time))}
              ${element.edited === true ? html`<span class="small faint">(edited)</span>` : nothing}
              ${element.resolution === true ? html`<span class="small resolution">Resolution</span>` : nothing}
              ${resolved ? html`<span class="resolved">${icon('check', 12)}Resolved</span>` : nothing}`}
        <div class="tools">
          ${quick.map(action => {
            const label = actionLabel(action, resolved);

            return html`<button type="button" class="tool reveal" aria-label=${label} title=${label} @click=${() => host.emit('action', { id: action })}>${icon(ACTION_ICON[action], 14)}</button>`;
          })}
          ${actions.length > 0
            ? html`<div
                class="menu-anchor"
                data-open=${pop.open ? '' : nothing}
                @keydown=${popupKeys(host, pop, rows, choose, close)}
                @focusout=${closeOnLeave(host, pop, close)}
              >
                <button
                  type="button"
                  class="tool reveal more-actions"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded=${pop.open ? 'true' : 'false'}
                  @click=${() => {
                    if (pop.open) return close();
                    pop.open = true;
                    pop.active = 0;
                    host.requestUpdate();
                    focusActive(host);
                  }}
                >
                  ${icon('more', 16)}
                </button>
                ${pop.open ? html`<div class="popup" role="menu" aria-label="Comment actions">${menuRows(host, pop, rows, choose)}</div>` : nothing}
              </div>`
            : nothing}
          ${replies > 0 && !collapsed && !reply
            ? html`<button type="button" class="tool" aria-label="Collapse replies" aria-expanded="true" @click=${() => host.emit('toggle', { collapsed: true })}>
                ${icon('chevronDown', 14)}
              </button>`
            : nothing}
        </div>
      </header>
      ${hasBody ? html`<div class="body"><slot></slot></div>` : nothing}
      ${collapsed && replies > 0
        ? html`<button type="button" class="replies" aria-expanded="false" @click=${() => host.emit('toggle', { collapsed: false })}>
            ${repliers.length > 0 ? faces(repliers) : nothing}<span class="truncate grow">${replies} ${replies === 1 ? 'reply' : 'replies'}</span>
            <span class="flip-rtl">${icon('chevronRight', 14)}</span>
          </button>`
        : nothing}
    </article>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .comment.thread {
        overflow: clip;
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background: var(--bg-surface);
      }
      .comment.reply {
        border-top: 1px solid var(--line);
      }
      .comment.highlighted {
        background: var(--brand-soft);
      }
      header {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.625rem;
        padding: 0.75rem 1rem;
      }
      header.with-body {
        padding-bottom: 0.5rem;
      }
      .deleted {
        font-size: 0.875rem;
        font-style: italic;
        color: var(--fg-muted);
      }
      .author {
        flex-shrink: 0;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--fg-strong);
      }
      .ago,
      .small {
        flex-shrink: 0;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .faint {
        opacity: 0.7;
      }
      .resolution {
        font-weight: 500;
        color: var(--success-fg);
      }
      .resolved {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.25rem;
        border-radius: 9999px;
        background: var(--success-soft);
        padding: 0.125rem 0.5rem;
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--success-fg);
      }
      .tools {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.125rem;
        margin-inline-start: auto;
      }
      .tool {
        display: inline-flex;
        width: 1.5rem;
        height: 1.5rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        color: var(--fg-muted);
        cursor: pointer;
        transition: opacity var(--dur-fast);
      }
      .tool:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
      .reveal {
        opacity: 0;
      }
      :host(:hover) .reveal,
      :host(:focus-within) .reveal,
      .reveal:focus-visible,
      .menu-anchor[data-open] .reveal {
        opacity: 1;
      }
      .body {
        min-width: 0;
        padding: 0 1rem 0.75rem 2.875rem;
        font-size: 0.875rem;
        line-height: 1.625;
        color: var(--fg);
      }
      .replies {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 0.625rem;
        border: 0;
        border-top: 1px solid var(--line);
        background: var(--layer-hover);
        padding: 0.625rem 1rem;
        font: inherit;
        font-size: 0.875rem;
        text-align: start;
        color: var(--fg-muted);
        cursor: pointer;
      }
      .replies:hover {
        color: var(--fg);
      }
      .grow {
        flex: 1;
      }
      .flip-rtl {
        display: inline-flex;
      }
      :host(:dir(rtl)) .flip-rtl {
        transform: scaleX(-1);
      }
      .block {
        height: 6rem;
        border-radius: var(--radius-xl);
      }
    `,
  ],
);

// ---------------------------------------------------------------------------
// bry-reactions

/** The quick picks offered when the app names none. */
const QUICK_EMOJI = ['👍', '👌', '❤️', '✅', '🎉', '😕', '🚀', '👀'];

drawAs(
  'bry-reactions',
  element => {
    const host = as(element);
    const pop = popOf(host, 'emoji');
    const items = records(element.items)
      .map(item => ({ emoji: str(item.emoji), count: typeof item.count === 'number' ? item.count : 0, mine: item.mine === true }))
      .filter(item => item.emoji);
    const named = strings(element.choices).filter(Boolean);
    const choices = named.length > 0 ? named : QUICK_EMOJI;
    const disabled = element.disabled === true;
    const close = (refocus = true) => {
      pop.open = false;
      host.requestUpdate();
      if (refocus) queueMicrotask(() => (host.shadowRoot?.querySelector('.add') as HTMLElement | null)?.focus());
    };
    const choose = (emoji: string) => {
      close();
      host.emit('toggle', { emoji });
    };

    return html`<div role="group" aria-label="Reactions" class="bar">
      ${items.map(
        item => html`<button
          type="button"
          class="chip ${item.mine ? 'mine' : ''}"
          ?disabled=${disabled}
          aria-pressed=${item.mine ? 'true' : 'false'}
          aria-label="${item.emoji} ${item.count}"
          @click=${() => host.emit('toggle', { emoji: item.emoji })}
        >
          <span aria-hidden="true">${item.emoji}</span><span aria-hidden="true">${item.count}</span>
        </button>`,
      )}
      ${disabled
        ? nothing
        : html`<div
            class="menu-anchor"
            @focusout=${closeOnLeave(host, pop, close)}
            @keydown=${(event: KeyboardEvent) => {
              if (event.key !== 'Escape' || !pop.open) return;
              event.preventDefault();
              close();
            }}
          >
            <button
              type="button"
              class="add"
              aria-label="Add reaction"
              title="Add reaction"
              aria-expanded=${pop.open ? 'true' : 'false'}
              @click=${() => {
                if (pop.open) return close();
                pop.open = true;
                host.requestUpdate();
                queueMicrotask(() => (host.shadowRoot?.querySelector('.grid button') as HTMLElement | null)?.focus());
              }}
            >
              ${icon('emoji', 14)}
            </button>
            ${pop.open
              ? html`<div class="popup start picker">
                  <div role="group" aria-label="Choose a reaction" class="grid">
                    ${choices.map(emoji => html`<button type="button" class="emoji" aria-label=${emoji} @click=${() => choose(emoji)}>${emoji}</button>`)}
                  </div>
                </div>`
              : nothing}
          </div>`}
    </div>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
      }
      .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.375rem;
      }
      button {
        font: inherit;
        cursor: pointer;
      }
      .chip {
        display: inline-flex;
        height: 1.5rem;
        align-items: center;
        gap: 0.25rem;
        border: 1px solid var(--line);
        border-radius: 9999px;
        background: var(--bg-surface);
        padding: 0 0.5rem;
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
        color: var(--fg-muted);
      }
      .chip:hover {
        background: var(--brand-soft);
      }
      .chip.mine {
        border-color: var(--brand-line);
        background: var(--brand-soft);
        color: var(--brand-fg);
      }
      .chip:disabled {
        cursor: default;
        opacity: 0.6;
      }
      .add {
        display: inline-flex;
        width: 1.5rem;
        height: 1.5rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border: 1px dashed var(--line-strong);
        border-radius: 9999px;
        background: transparent;
        color: var(--fg-muted);
      }
      .add:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
      .picker {
        width: auto;
        min-width: 0;
        border-radius: var(--radius-2xl);
        padding: 0.5rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(8, 2rem);
        gap: 0.25rem;
      }
      .emoji {
        display: flex;
        width: 2rem;
        height: 2rem;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        font-size: 1.125rem;
      }
      .emoji:hover {
        background: var(--layer-hover);
      }
    `,
  ],
);

// ---------------------------------------------------------------------------
// bry-peek

drawAs(
  'bry-peek',
  element => {
    const host = as(element);
    const open = element.open === true;
    const previous = element.previous === true;
    const next = element.next === true;

    // J/K and the up and down arrows step, Escape closes, while nothing is being typed.
    listenOnPage(host, event => {
      if (host.open !== true || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        host.emit('close');
      } else if ((event.key === 'k' || event.key === 'ArrowUp') && host.previous === true) {
        event.preventDefault();
        host.emit('previous');
      } else if ((event.key === 'j' || event.key === 'ArrowDown') && host.next === true) {
        event.preventDefault();
        host.emit('next');
      }
    });

    host.toggleAttribute('data-open', open);

    if (!open) return nothing;

    const step = (name: 'previous' | 'next', enabled: boolean, key: string, glyph: string, said: string) =>
      html`<button type="button" class="square" aria-label=${said} title="${said} (${key.toUpperCase()})" aria-keyshortcuts=${key} ?disabled=${!enabled} @click=${() => host.emit(name)}>
        ${icon(glyph, 16)}
      </button>`;

    return html`<aside class="panel" aria-label=${str(element.label)}>
      <div class="bar">
        <div class="side">
          ${step('previous', previous, 'k', 'chevronUp', 'Previous')}${step('next', next, 'j', 'chevronDown', 'Next')}
          ${str(element.position) ? html`<span class="position">${str(element.position)}</span>` : nothing}
        </div>
        <div class="side">
          <button type="button" class="square" aria-label="Open full page" title="Open full page" @click=${() => host.emit('expand')}>${icon('maximise', 16)}</button>
          <button type="button" class="square" aria-label="Close" title="Close (Esc)" @click=${() => host.emit('close')}>${icon('close', 16)}</button>
        </div>
      </div>
      <div class="content"><slot></slot></div>
    </aside>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: contents;
      }
      .panel {
        position: absolute;
        top: 0.5rem;
        bottom: 0.5rem;
        inset-inline-end: 0.5rem;
        z-index: 30;
        display: flex;
        width: min(520px, calc(100% - 1rem));
        flex-direction: column;
        overflow: hidden;
        border-radius: var(--radius-xl);
        background: var(--background);
        box-shadow:
          var(--shadow-pop),
          0 0 0 1px var(--line);
      }
      .bar {
        display: flex;
        height: 3rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: space-between;
        gap: 0.25rem;
        border-bottom: 1px solid var(--line);
        padding: 0 1rem;
      }
      .side {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .square {
        display: inline-flex;
        width: 1.75rem;
        height: 1.75rem;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--fg-muted);
        cursor: pointer;
      }
      .square:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
      .square:disabled {
        cursor: default;
        opacity: 0.4;
      }
      .position {
        margin-inline-start: 0.25rem;
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
        color: var(--fg-muted);
      }
      .content {
        display: flex;
        min-height: 0;
        flex: 1;
        flex-direction: column;
        gap: 1rem;
        overflow-y: auto;
        padding: 1rem 1.25rem;
      }
    `,
  ],
);

// ---------------------------------------------------------------------------
// bry-spreadsheet, bry-spreadsheet-row, bry-spreadsheet-group

interface SheetColumn {
  key: string;
  heading: string;
  width?: 'sm' | 'md' | 'lg' | 'fill';
  pinned?: boolean;
  sortable?: boolean;
  hideable?: boolean;
}

/** Column widths, as the host defaults them. */
const SHEET_WIDTH = { sm: '7rem', md: '10rem', lg: '16rem', fill: 'minmax(16rem, 1fr)' } as const;

const sheetColumns = (value: unknown): SheetColumn[] => records(value) as unknown as SheetColumn[];

export const templateOf = (columns: readonly SheetColumn[], selectable: boolean): string =>
  [selectable ? '2.25rem' : '', ...columns.map(column => SHEET_WIDTH[column.width ?? 'md'] ?? SHEET_WIDTH.md)].filter(Boolean).join(' ');

/** What a row needs of the sheet around it. */
function sheetOf(row: HTMLElement): { columns: SheetColumn[]; selectable: boolean; template: string } {
  const sheet = row.closest('bry-spreadsheet') as (HTMLElement & Record<string, unknown>) | null;
  const columns = sheetColumns(sheet?.columns);
  const selectable = sheet?.selectable === true;

  return { columns, selectable, template: templateOf(columns, selectable) };
}

const SHEET = css`
  .pinned {
    position: sticky;
    z-index: 10;
    background: var(--background);
  }
  .pinned.after-box {
    inset-inline-start: 2.25rem;
  }
  .pinned.first {
    inset-inline-start: 0;
  }
  .first-column {
    border-inline-end: 1px solid var(--line);
  }
  input[type='checkbox'] {
    width: 0.875rem;
    height: 0.875rem;
    margin: 0;
    accent-color: var(--brand);
  }
`;

drawAs(
  'bry-spreadsheet',
  element => {
    const host = as(element);
    const columns = sheetColumns(element.columns);
    const selectable = element.selectable === true;
    const template = templateOf(columns, selectable);
    const sort =
      element.sort && typeof element.sort === 'object' ? (element.sort as { key?: unknown; direction?: unknown }) : null;
    const selected = typeof element.selected === 'number' ? element.selected : 0;
    const total = typeof element.total === 'number' ? element.total : 0;
    const loading = element.loading === true;

    // A row draws its cells from the sheet's columns: tell each to draw again.
    for (const row of Array.from(host.children)) (row as unknown as El).requestUpdate?.();

    const headerFor = (column: SheetColumn, index: number) => {
      const sorted = sort?.key === column.key ? (sort.direction === 'desc' ? 'desc' : 'asc') : null;
      const pop = popOf(host, `column-${column.key}`);
      const rows: TreeRow[] = [
        ...(column.sortable ? [{ id: 'asc', label: 'Ascending', icon: 'chevronUp' }, { id: 'desc', label: 'Descending', icon: 'chevronDown' }] : []),
        ...(column.hideable ? [{ id: 'hide', label: 'Hide column', icon: 'temporary', separator: Boolean(column.sortable) }] : []),
      ];
      const close = (refocus = true) => {
        pop.open = false;
        pop.active = -1;
        host.requestUpdate();
        if (refocus) queueMicrotask(() => (host.shadowRoot?.querySelector(`[data-column="${column.key}"]`) as HTMLElement | null)?.focus());
      };
      const choose = (at: number) => {
        const row = rows[at];

        if (!row) return;
        if (row.id === 'hide') host.emit('hide', { key: column.key });
        else host.emit('sort', { key: column.key, direction: row.id });
        close();
      };

      return html`<div
        role="columnheader"
        class="heading ${column.pinned ? `pinned ${selectable ? 'after-box' : 'first'}` : ''} ${index === 0 ? 'first-column' : ''}"
        aria-sort=${sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : nothing}
      >
        ${rows.length > 0
          ? html`<div class="menu-anchor" @keydown=${popupKeys(host, pop, rows, choose, close)} @focusout=${closeOnLeave(host, pop, close)}>
              <button
                type="button"
                class="heading-button"
                data-column=${column.key}
                aria-haspopup="menu"
                aria-expanded=${pop.open ? 'true' : 'false'}
                @click=${() => {
                  if (pop.open) return close();
                  pop.open = true;
                  pop.active = 0;
                  host.requestUpdate();
                  focusActive(host);
                }}
              >
                <span class="truncate">${column.heading}</span>${sorted ? html`<span class="sorted ${sorted}">${icon('chevronDown', 12)}</span>` : nothing}
              </button>
              ${pop.open ? html`<div class="popup start" role="menu" aria-label=${column.heading}>${menuRows(host, pop, rows, choose)}</div>` : nothing}
            </div>`
          : html`<span class="truncate">${column.heading}</span>`}
      </div>`;
    };

    return html`<div role="table" class="sheet" aria-label=${str(element.label) || nothing} aria-busy=${loading ? 'true' : nothing}>
      <div role="rowgroup" class="head">
        <div role="row" class="header-row" style="grid-template-columns: ${template}">
          ${selectable
            ? html`<div role="columnheader" class="box-cell pinned first">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  .checked=${total > 0 && selected === total}
                  .indeterminate=${selected > 0 && selected < total}
                  @change=${(event: Event) => host.emit('all', { checked: (event.currentTarget as HTMLInputElement).checked })}
                />
              </div>`
            : nothing}
          ${columns.map(headerFor)}
        </div>
      </div>
      <div role="rowgroup" class="body">
        ${loading
          ? html`<div role="status" aria-label="Loading" class="loading">${[0, 1, 2].map(() => html`<div class="bone"></div>`)}</div>`
          : host.children.length === 0
            ? html`<p class="empty">${str(element.empty) || 'Nothing here yet.'}</p>`
            : html`<slot></slot>`}
      </div>
    </div>`;
  },
  [
    FOCUS,
    PLAN,
    SHEET,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .sheet {
        min-width: 0;
        overflow: auto;
        /* The columns scroll inside it: they don't widen whatever holds the sheet. */
        contain: inline-size;
      }
      .head {
        position: sticky;
        top: 0;
        z-index: 20;
      }
      .header-row {
        display: grid;
        min-width: max-content;
        border-bottom: 1px solid var(--line);
        background: var(--background);
      }
      .box-cell {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .heading {
        display: flex;
        height: 2rem;
        min-width: 0;
        align-items: center;
        padding: 0 0.75rem;
        font-size: 0.6875rem;
        font-weight: 500;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--fg-muted);
      }
      .heading-button {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.25rem;
        border: 0;
        border-radius: var(--radius-xs);
        background: transparent;
        padding: 0;
        font: inherit;
        letter-spacing: inherit;
        text-transform: inherit;
        color: inherit;
        cursor: pointer;
      }
      .heading-button:hover {
        color: var(--fg);
      }
      .sorted {
        display: inline-flex;
      }
      .sorted.asc {
        transform: rotate(180deg);
      }
      .popup {
        text-transform: none;
        letter-spacing: normal;
      }
      .body {
        min-width: max-content;
      }
      .loading {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.5rem;
      }
      .loading .bone {
        height: 2.25rem;
      }
      .empty {
        margin: 0;
        padding: 2.5rem 1rem;
        text-align: center;
        font-size: 0.875rem;
        color: var(--fg-muted);
      }
    `,
  ],
);

drawAs(
  'bry-spreadsheet-row',
  element => {
    const host = as(element);
    const { columns, selectable, template } = sheetOf(host);
    const depth = typeof element.depth === 'number' ? element.depth : 0;
    const expandable = element.expandable === true;
    const expanded = element.expanded === true;
    const checked = element.checked === true;
    const label = str(element.label);

    host.setAttribute('role', 'row');
    if (label) host.setAttribute('aria-label', label);
    else host.removeAttribute('aria-label');
    host.toggleAttribute('aria-selected', checked);

    if (element.loading === true) return html`<div class="loading" aria-label="Loading"><div class="bone"></div></div>`;

    // Outside a spreadsheet there are no columns to lay the cells under: they sit in a line.
    if (columns.length === 0) {
      Array.from(host.children).forEach(cell => cell.getAttribute('slot')?.startsWith('cell-') && cell.removeAttribute('slot'));

      return html`<div class="row loose ${checked ? 'checked' : ''}" style=${depth ? `padding-inline-start: ${0.75 + depth * 1.25}rem` : nothing}><slot></slot></div>`;
    }

    // Each child is one cell, in the columns' order.
    Array.from(host.children).forEach((cell, index) => cell.setAttribute('slot', `cell-${index}`));

    return html`<div class="row ${checked ? 'checked' : ''}" style="grid-template-columns: ${template}">
      ${selectable
        ? html`<div role="cell" class="box-cell pinned first">
            <input
              type="checkbox"
              aria-label=${`Select ${label || 'row'}`}
              .checked=${checked}
              @change=${(event: Event) => host.emit('toggle', { checked: (event.currentTarget as HTMLInputElement).checked })}
            />
          </div>`
        : nothing}
      ${columns.map(
        (column, index) => html`<div
          role="cell"
          class="cell ${column.pinned ? `pinned ${selectable ? 'after-box' : 'first'}` : ''} ${index === 0 ? 'first-column' : ''}"
          style=${index === 0 && depth ? `padding-inline-start: ${0.75 + depth * 1.25}rem` : nothing}
        >
          ${index === 0 && expandable
            ? html`<button
                type="button"
                class="expand ${expanded ? 'open' : ''}"
                aria-label=${expanded ? 'Hide sub-issues' : 'Show sub-issues'}
                aria-expanded=${expanded ? 'true' : 'false'}
                @click=${() => host.emit('expand', { expanded: !expanded })}
              >
                ${icon('chevronRight', 12)}
              </button>`
            : nothing}
          <div class="content"><slot name=${`cell-${index}`}></slot></div>
        </div>`,
      )}
    </div>`;
  },
  [
    FOCUS,
    PLAN,
    SHEET,
    css`
      :host {
        display: block;
      }
      .row {
        display: grid;
        min-height: 2.25rem;
        min-width: max-content;
        border-bottom: 1px solid var(--line);
        font-size: 0.875rem;
      }
      .row.loose {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.25rem 0.75rem;
      }
      .row:hover {
        background: var(--layer-hover);
      }
      .row.checked {
        background: var(--layer-selected);
      }
      .box-cell {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .row input[type='checkbox'] {
        opacity: 0.4;
        transition: opacity var(--dur-fast);
      }
      .row:hover input[type='checkbox'],
      .row input[type='checkbox']:checked,
      .row input[type='checkbox']:focus-visible {
        opacity: 1;
      }
      .cell {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.75rem;
      }
      .expand {
        display: inline-flex;
        width: 1rem;
        height: 1rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: var(--radius-xs);
        background: transparent;
        color: var(--fg-muted);
        cursor: pointer;
      }
      .expand:hover {
        background: var(--layer-hover);
      }
      .expand .icon {
        transition: transform var(--dur-fast);
      }
      .expand.open .icon {
        transform: rotate(90deg);
      }
      .content {
        display: flex;
        min-width: 0;
        flex: 1;
        align-items: center;
      }
      .loading {
        padding: 0.25rem;
      }
      .loading .bone {
        height: 2rem;
      }
    `,
  ],
);

drawAs(
  'bry-spreadsheet-group',
  element => {
    const host = as(element);
    const collapsed = element.collapsed === true;

    host.setAttribute('role', 'row');

    return html`<button type="button" aria-expanded=${collapsed ? 'false' : 'true'} @click=${() => host.emit('toggle', { collapsed: !collapsed })}>
      <span class="fold ${collapsed ? '' : 'open'}" aria-hidden="true">${icon('chevronRight', 12)}</span>
      ${str(element.mark) ? optionMark(str(element.mark), pick(TONE_NAMES, element.tone)) : nothing}
      <span class="label">${str(element.label)}</span>
      ${typeof element.count === 'number' ? html`<span class="count">${element.count}</span>` : nothing}
    </button>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        position: sticky;
        top: 2rem;
        z-index: 10;
        display: block;
        border-bottom: 1px solid var(--line);
        background: var(--background);
      }
      button {
        display: flex;
        width: 100%;
        height: 2rem;
        align-items: center;
        gap: 0.5rem;
        border: 0;
        background: transparent;
        padding: 0 0.75rem;
        font: inherit;
        font-size: 0.875rem;
        text-align: start;
        cursor: pointer;
      }
      button:hover {
        background: var(--layer-hover);
      }
      .fold {
        display: inline-flex;
        color: var(--fg-muted);
        transition: transform var(--dur-fast);
      }
      .fold.open {
        transform: rotate(90deg);
      }
      .label {
        font-weight: 500;
        color: var(--fg);
      }
      .count {
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
        color: var(--fg-muted);
      }
    `,
  ],
);

// ---------------------------------------------------------------------------
// bry-rich-text

interface Tool {
  id: string;
  label: string;
  glyph: string;
  /** Wraps the selection, or starts each of its lines. */
  wrap?: string;
  line?: string | ((index: number) => string);
}

const TOOLS: readonly Tool[] = [
  { id: 'bold', label: 'Bold', glyph: 'B', wrap: '**' },
  { id: 'italic', label: 'Italic', glyph: 'I', wrap: '_' },
  { id: 'strike', label: 'Strikethrough', glyph: 'S', wrap: '~~' },
  { id: 'code', label: 'Code', glyph: '</>', wrap: '`' },
  { id: 'h1', label: 'Heading 1', glyph: 'H1', line: '# ' },
  { id: 'h2', label: 'Heading 2', glyph: 'H2', line: '## ' },
  { id: 'bullets', label: 'Bulleted list', glyph: '•', line: '- ' },
  { id: 'numbers', label: 'Numbered list', glyph: '1.', line: index => `${index + 1}. ` },
  { id: 'tasks', label: 'Task list', glyph: '☐', line: '- [ ] ' },
  { id: 'quote', label: 'Quote', glyph: '❝', line: '> ' },
];

/** The text with `tool` applied to the selection from `start` to `end`, and where the selection is afterwards. */
export function applyTool(text: string, start: number, end: number, tool: Pick<Tool, 'wrap' | 'line'>): { text: string; start: number; end: number } {
  if (tool.wrap) {
    const mark = tool.wrap;
    const inside = text.slice(start, end);

    return { text: text.slice(0, start) + mark + inside + mark + text.slice(end), start: start + mark.length, end: end + mark.length };
  }

  const from = text.lastIndexOf('\n', start - 1) + 1;
  const to = end > start && text[end - 1] === '\n' ? end - 1 : end;
  const lines = text.slice(from, to).split('\n');
  const prefix = tool.line!;
  const done = lines.map((line, index) => (typeof prefix === 'string' ? prefix : prefix(index)) + line).join('\n');

  return { text: text.slice(0, from) + done + text.slice(to), start: from, end: from + done.length };
}

/** The `@name` being typed just before `at`, or `null`. */
export function mentionAt(text: string, at: number): { from: number; query: string } | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, at));

  return match ? { from: at - match[2]!.length - 1, query: match[2]! } : null;
}

// bry-whiteboard

const BOARD_HEIGHTS = { sm: 320, md: 520, lg: 760 } as const;

// Brydio draws the board with Excalidraw and keeps the drawing in the record's
// shared document; outside Brydio there is no document to draw, so the
// preview says what would be there.
drawAs(
  'bry-whiteboard',
  element => {
    const size = pick(['sm', 'md', 'lg'] as const, element.size) ?? 'md';
    const label = str(element.label) || 'Whiteboard';

    element.style.setProperty('--bry-board-height', `${BOARD_HEIGHTS[size]}px`);

    return html`<div class="board type-body" role="group" aria-label=${label}>${label}: drawn together in Brydio</div>`;
  },
  [
    TYPE,
    css`
      :host { display: block; }
      .board {
        display: flex;
        align-items: center;
        justify-content: center;
        height: var(--bry-board-height);
        border: 1px dashed var(--line);
        border-radius: 0.75rem;
        color: var(--fg-muted);
      }
    `,
  ],
);

drawAs(
  'bry-rich-text',
  element => {
    const host = as(element);
    const { draft, set } = draftOf(host, 'value', str(element.value));
    const variant = element.variant === 'comment' || element.variant === 'bare' ? element.variant : 'document';
    const placeholder = str(element.placeholder) || 'Add description…';
    const label = str(element.label);
    const error = str(element.error);
    const disabled = element.disabled === true;
    const people = records(element.mentions).map(one => ({ value: str(one.value), label: str(one.label) }));
    const pop = popOf(host, 'mention');
    const kept = keptOf(host, () => ({ focused: false, mention: null as { from: number; query: string } | null }) as Record<string, unknown>);
    const mention = kept.mention as { from: number; query: string } | null;
    const offered = mention ? people.filter(person => person.label.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8) : [];
    const area = () => host.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement | null;

    host.toggleAttribute('data-bare', variant === 'bare');

    if (element.autofocus === true && kept.focused !== true) {
      kept.focused = true;
      queueMicrotask(() => area()?.focus());
    }

    const write = (text: string, start: number, end: number) => {
      const box = area();

      set(text);
      if (box) {
        box.value = text;
        box.setSelectionRange(start, end);
        box.focus();
      }
      host.emit('change', { value: text.trim() });
    };
    const look = (box: HTMLTextAreaElement) => {
      const found = people.length > 0 ? mentionAt(box.value, box.selectionStart) : null;

      kept.mention = found;
      pop.open = Boolean(found);
      pop.active = 0;
      host.requestUpdate();
    };
    const insert = (index: number) => {
      const person = offered[index];
      const box = area();

      if (!person || !box || !mention) return;

      const text = `${box.value.slice(0, mention.from)}@${person.label} ${box.value.slice(box.selectionStart)}`;
      const at = mention.from + person.label.length + 2;

      kept.mention = null;
      pop.open = false;
      write(text, at, at);
      host.requestUpdate();
    };
    const closeMentions = () => {
      kept.mention = null;
      pop.open = false;
      host.requestUpdate();
    };
    const keys = popupKeys(host, pop, offered, insert, closeMentions);

    return html`<div class="editor ${variant} ${error ? 'invalid' : ''}">
      ${disabled
        ? nothing
        : html`<div class="tools" role="toolbar" aria-label="Formatting">
            ${TOOLS.map(
              tool => html`<button
                type="button"
                class="tool"
                data-tool=${tool.id}
                aria-label=${tool.label}
                title=${tool.label}
                @mousedown=${(event: Event) => event.preventDefault()}
                @click=${() => {
                  const box = area();

                  if (!box) return;

                  const next = applyTool(box.value, box.selectionStart, box.selectionEnd, tool);

                  write(next.text, next.start, next.end);
                }}
              >
                ${tool.glyph}
              </button>`,
            )}
          </div>`}
      <div class="menu-anchor field">
        <textarea
          .value=${draft}
          placeholder=${placeholder}
          aria-label=${label || placeholder}
          aria-invalid=${error ? 'true' : nothing}
          aria-describedby=${error ? 'error' : nothing}
          aria-autocomplete=${people.length > 0 ? 'list' : nothing}
          ?disabled=${disabled}
          @input=${(event: Event) => {
            const box = event.currentTarget as HTMLTextAreaElement;

            set(box.value);
            host.emit('change', { value: box.value.trim() });
            look(box);
          }}
          @keydown=${(event: KeyboardEvent) => {
            if (pop.open && offered.length > 0 && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
              if (event.key === 'Tab') {
                event.preventDefault();
                return insert(pop.active);
              }
              return keys(event);
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
              event.preventDefault();
              host.emit('submit', { value: (event.currentTarget as HTMLTextAreaElement).value.trim() });
            }
          }}
          @blur=${(event: FocusEvent) => {
            if ((event.relatedTarget as Element | null)?.closest?.('.popup')) return;
            closeMentions();
            host.emit('blur', { value: (event.currentTarget as HTMLTextAreaElement).value.trim() });
          }}
        ></textarea>
        ${pop.open && offered.length > 0
          ? html`<div class="popup start" role="listbox" aria-label="People">
              ${offered.map(
                (person, index) => html`<div
                  role="option"
                  tabindex="-1"
                  data-value=${person.value}
                  data-active=${index === pop.active ? '' : nothing}
                  aria-selected=${index === pop.active ? 'true' : 'false'}
                  @mousedown=${(event: Event) => event.preventDefault()}
                  @click=${() => insert(index)}
                >
                  ${face(person.value, person.label, 'xs')}<span class="item-label">${person.label}</span>
                </div>`,
              )}
            </div>`
          : nothing}
      </div>
      ${error ? html`<p id="error" class="type-caption error">${error}</p>` : nothing}
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      :host([data-bare]) {
        display: flex;
        min-height: 0;
        flex: 1;
        flex-direction: column;
      }
      .editor {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.25rem;
      }
      .editor.bare {
        min-height: 0;
        flex: 1;
      }
      .tools {
        display: flex;
        flex-wrap: wrap;
        gap: 0.125rem;
        opacity: 0;
        transition: opacity var(--dur-fast);
      }
      .editor:focus-within .tools,
      .editor:hover .tools {
        opacity: 1;
      }
      .tool {
        min-width: 1.5rem;
        height: 1.5rem;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        padding: 0 0.25rem;
        font: inherit;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--fg-muted);
        cursor: pointer;
      }
      .tool:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
      .field {
        display: flex;
        min-height: 0;
        flex: 1;
      }
      textarea {
        width: 100%;
        min-width: 0;
        min-height: 6rem;
        border: 0;
        background: transparent;
        padding: 0;
        font: inherit;
        font-size: 0.875rem;
        line-height: 1.625;
        color: var(--fg);
        outline: none;
        resize: none;
        field-sizing: content;
      }
      textarea::placeholder {
        color: var(--fg-placeholder);
      }
      .comment textarea {
        min-height: 4rem;
        border: 1px solid var(--line-input);
        border-radius: var(--field-radius);
        background: var(--bg-surface);
        padding: 0.5rem var(--field-px);
      }
      .comment textarea:focus-visible {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-ring);
      }
      .bare textarea {
        min-height: 0;
        flex: 1;
      }
      .invalid textarea {
        border-color: var(--danger);
      }
      .error {
        margin: 0;
        color: var(--danger-fg);
      }
      .popup {
        top: auto;
        margin-top: 0;
        bottom: 100%;
        width: 14rem;
      }
    `,
  ],
);

// ---------------------------------------------------------------------------
// bry-property-list, bry-property-row

drawAs(
  'bry-property-list',
  element => {
    const host = as(element);
    const title = str(element.title);
    const collapsible = element.collapsible === true;
    const collapsed = collapsible && element.collapsed === true;

    return html`<section aria-label=${title || nothing}>
      ${title
        ? collapsible
          ? html`<button type="button" class="caption button ${collapsed ? 'shut' : ''}" aria-expanded=${collapsed ? 'false' : 'true'} @click=${() => host.emit('toggle', { collapsed: !collapsed })}>
              <span class="fold ${collapsed ? '' : 'open'}" aria-hidden="true">${icon('chevronRight', 12)}</span>${title}
            </button>`
          : html`<h3 class="caption">${title}</h3>`
        : nothing}
      ${collapsed ? nothing : html`<div class="grid"><slot></slot></div>`}
    </section>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .caption {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        margin: 0 0 0.5rem;
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--fg-muted);
      }
      .button {
        width: 100%;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        font: inherit;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--fg);
        cursor: pointer;
      }
      .button.shut {
        color: var(--fg-muted);
      }
      .button:hover {
        background: var(--layer-hover);
      }
      .fold {
        display: inline-flex;
        color: var(--fg-muted);
        transition: transform var(--dur-fast);
      }
      .fold.open {
        transform: rotate(90deg);
      }
      .grid {
        display: grid;
        grid-template-columns: auto 1fr;
        column-gap: 0.5rem;
        row-gap: 0.125rem;
        padding-inline-start: 0.5rem;
      }
    `,
  ],
);

drawAs(
  'bry-property-row',
  element =>
    html`<div class="row ${element.readonly === true ? '' : 'live'}">
      <span class="label">${icon(pick(BUTTON_ICONS, element.icon), 14)}${str(element.label)}</span>
      <div class="value"><slot></slot></div>
    </div>`,
  [
    PLAN,
    css`
      :host {
        display: grid;
        grid-column: span 2;
        grid-template-columns: subgrid;
        min-width: 0;
      }
      .row {
        display: grid;
        grid-column: span 2;
        grid-template-columns: subgrid;
        min-height: 2rem;
        align-items: center;
        margin-inline: -0.5rem;
        border-radius: var(--radius-md);
        padding: 0 0.5rem;
      }
      .row.live:hover {
        background: var(--layer-hover);
      }
      .label {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .value {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.375rem;
        overflow: hidden;
        font-size: 0.75rem;
      }
    `,
  ],
);

// ---------------------------------------------------------------------------
// bry-keys

/** Keys Brydio answers itself: an app can't take them. */
const SHELL_KEYS = new Set(['mod+k', 'mod+b', 'mod+/', 'mod+[', 'mod+]', 'mod+w', 'mod+t', 'mod+,', 'mod+n']);

/** `mod+enter` for ⌘↵ or Ctrl+Enter; `shift+/` for ?; plain keys lower case. */
export function keyName(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): string {
  const key = event.key === ' ' ? 'space' : event.key.toLowerCase();

  return [event.metaKey || event.ctrlKey ? 'mod' : '', event.altKey ? 'alt' : '', event.shiftKey && key.length > 1 ? 'shift' : '', key].filter(Boolean).join('+');
}

drawAs(
  'bry-keys',
  element => {
    const host = as(element);

    listenOnPage(host, event => {
      if (event.defaultPrevented || event.isComposing || typing(event)) return;

      const wanted = new Set(
        records(host.bindings)
          .map(one => str(one.key).toLowerCase())
          .filter(key => key && !SHELL_KEYS.has(key)),
      );
      const key = keyName(event);

      if (!wanted.has(key)) return;
      event.preventDefault();
      host.emit('press', { key });
    });

    return nothing;
  },
  [
    css`
      :host {
        display: none;
      }
    `,
  ],
);

