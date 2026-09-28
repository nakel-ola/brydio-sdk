/// <reference lib="dom" />
import { css, html, nothing, svg, type TemplateResult } from '../base.ts';

type Svg = ReturnType<typeof svg>;
import { MENU_ICONS, PRIORITIES, STATE_GROUPS } from '../../catalogue.ts';
import { draftOf, keptOf, listOf, type El } from './catalogue-b-shared.ts';
import { nextActive } from './keyboard.ts';
import { pick, str } from './tokens.ts';

/**
 * What the Plan fidelity drawings share (`bry-glyph` … `bry-filter-menu`, and
 * the planning variants of the list row, board and dialog): the icons they
 * name, the state and priority marks, people's faces, the completion ring,
 * the "⋯" menu a row keeps at its end and the quick-add line. Brydio draws
 * these from `draw/plan-marks.tsx` and `draw/row-menu.tsx`; the shapes here
 * are this build's own line drawings of the same things, in the same tones.
 */

export type StateGroup = (typeof STATE_GROUPS)[number];
export type Priority = (typeof PRIORITIES)[number];
export const TONE_NAMES = ['neutral', 'brand', 'success', 'warn', 'danger'] as const;
export type Tone = (typeof TONE_NAMES)[number];

/** The records in a list setting, anything else dropped. */
export const records = (value: unknown): Record<string, unknown>[] =>
  listOf<unknown>(value).filter((one): one is Record<string, unknown> => Boolean(one) && typeof one === 'object' && !Array.isArray(one));

/** The strings in a list setting. */
export const strings = (value: unknown): string[] => listOf<unknown>(value).filter((one): one is string => typeof one === 'string');

/**
 * Every icon a button or a menu item may name, as a 16px line drawing: one
 * path each, drawn in the current colour. A name this map doesn't hold draws
 * nothing, never a stranger's picture.
 */
const ICON: Record<string, string> = {
  // A menu's.
  add: 'M8 3v10M3 8h10',
  archive: 'M2 3.5h12v3H2zM3 6.5v6.5h10V6.5M6.5 9h3',
  calendar: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
  check: 'M3.5 8.5l3 3 6-7',
  copy: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3',
  dismiss: 'M4 4l8 8M12 4l-8 8',
  docs: 'M4 1.5h5l3.5 3.5v9.5h-8.5zM9 1.5V5h3.5M6 8.5h4M6 11h4',
  info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7.5v4M8 5h.01',
  mail: 'M2 3.5h12v9H2zM2 4l6 5 6-5',
  members: 'M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 3a2.2 2.2 0 0 1 0 4.4M12.5 9.8c1.2.5 2 1.8 2 3.7',
  notes: 'M3 2h10v12H3zM5.5 5h5M5.5 8h5M5.5 11h3',
  pin: 'M6 2h4l-.5 4 2.5 2.5H4L6.5 6zM8 8.5v5.5',
  rename: 'M10.5 2.5l3 3-8 8h-3v-3zM9 4l3 3',
  retry: 'M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3h-3',
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM10.5 10.5 14 14',
  settings: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  tasks: 'M2.5 4l1.5 1.5L6.5 3M2.5 10l1.5 1.5L6.5 9M8.5 4.5h5M8.5 10.5h5',
  trash: 'M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.5 6.5v4.5M9.5 6.5v4.5',
  // Plan fidelity: what a planning app names.
  account: 'M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 14.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5',
  activity: 'M1.5 8h3l2-5 3 10 2-5h3',
  attach: 'M13 7.5 8 12.5a3 3 0 0 1-4.5-4.5L9 2.5a2 2 0 0 1 3 3L6.5 11a1 1 0 0 1-1.5-1.5L10 4.5',
  bell: 'M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11zM6.5 14h3',
  boardLayout: 'M2 2.5h3.5v11H2zM6.25 2.5h3.5v7h-3.5zM10.5 2.5H14v9h-3.5z',
  box: 'M8 1.5l6 3v7l-6 3-6-3v-7zM2 4.5l6 3 6-3M8 7.5v7',
  branch: 'M4.5 2v12M4.5 5.5a2 2 0 1 0 0-4M11.5 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM11.5 6.5c0 3-7 2.5-7 6',
  calendarRange: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3M5 9.5h6',
  channel: 'M6 2 4.5 14M11.5 2 10 14M2.5 5.5h11M2 10.5h11',
  chart: 'M2 14h12M4 14V8M7 14V4M10 14V9.5M13 14V6',
  cycle: 'M13.5 8a5.5 5.5 0 0 1-9.9 3.3M2.5 8a5.5 5.5 0 0 1 9.9-3.3M12.5 2v3h-3M3.5 14v-3h3',
  download: 'M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11',
  externalLink: 'M9.5 2.5h4v4M13.5 2.5 7 9M11.5 9.5v4h-9v-9h4',
  flag: 'M3 14V2.5M3 2.5h9l-2 3.25 2 3.25H3',
  ganttLayout: 'M2 3.5h7M4.5 8h8M7 12.5h7',
  history: 'M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.5H5M8 5v3.5l2.5 1.5',
  home: 'M2 7.5 8 2l6 5.5M3.5 6.5v7h9v-7M6.5 13.5v-4h3v4',
  inbox: 'M2 9.5 4 3h8l2 6.5v4H2zM2 9.5h3.5l1 1.5h3l1-1.5H14',
  layers: 'M8 2 14 5 8 8 2 5zM2 8l6 3 6-3M2 11l6 3 6-3',
  link: 'M7 9a3 3 0 0 0 4.2.3l2-2a3 3 0 0 0-4.2-4.2l-1 1M9 7a3 3 0 0 0-4.2-.3l-2 2a3 3 0 0 0 4.2 4.2l1-1',
  listLayout: 'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
  lock: 'M3.5 7h9v7h-9zM5.5 7V5a2.5 2.5 0 0 1 5 0v2',
  maximise: 'M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5l-4.5 4.5M2.5 13.5 7 9',
  panelRight: 'M2 2.5h12v11H2zM10 2.5v11',
  pause: 'M5.5 3v10M10.5 3v10',
  play: 'M4.5 2.5v11l9-5.5z',
  progress: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 1.5V8l4.6 4.6',
  project: 'M2 4.5h4.5l1.5 1.5H14v7.5H2zM2 4.5V3h4',
  relation: 'M4 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM12 14.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4 5.5v3a3 3 0 0 0 3 3h3',
  sliders: 'M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6M10 3v3M6 10v3',
  tableLayout: 'M2 2.5h12v11H2zM2 6h12M2 9.75h12M6.5 6v7.5',
  swimlaneLayout: 'M2 4.5c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1M2 8c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1M2 11.5c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1',
  tag: 'M2 2h5.5L14 8.5 8.5 14 2 7.5zM5 5h.01',
  target: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 8h.01',
  temporary: 'M4.5 1.5h7M4.5 14.5h7M5 1.5c0 3.5 6 3.5 6 6.5s-6 3-6 6.5M11 1.5c0 3.5-6 3.5-6 6.5s6 3 6 6.5',
  userAdd: 'M6.5 7.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM1.5 14c0-2.75 2.25-4.5 5-4.5 1.2 0 2.3.3 3.1.9M12.5 9.5v4M10.5 11.5h4',
  status: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 11.5a3.5 3.5 0 0 0 0-7z',
  filter: 'M2 3h12L9.5 8.5V13l-3-1.5v-3z',
  stateReview: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 4.5a3.5 3.5 0 1 1-3.5 3.5H8z',
  // A button's.
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  close: 'M4 4l8 8M12 4l-8 8',
  arrowRight: 'M2.5 8h11M9 3.5 13.5 8 9 12.5',
  chevronRight: 'M6 3.5 10.5 8 6 12.5',
  chevronDown: 'M3.5 6 8 10.5 12.5 6',
  chevronUp: 'M3.5 10 8 5.5 12.5 10',
  // Drawn by the elements themselves, never named by an app.
  back: 'M13.5 8h-11M7 3.5 2.5 8 7 12.5',
  forward: 'M2.5 8h11M9 3.5 13.5 8 9 12.5',
  reply: 'M6.5 3.5 2.5 7.5l4 4M2.5 7.5h7a4 4 0 0 1 4 4v1',
  quote: 'M6.7 7.3H4a.7.7 0 0 1-.7-.7V4.7A.7.7 0 0 1 4 4h2a.7.7 0 0 1 .7.7v2.6c0 2-1 3.3-3 4M12.7 7.3H10a.7.7 0 0 1-.7-.7V4.7A.7.7 0 0 1 10 4h2a.7.7 0 0 1 .7.7v2.6c0 2-1 3.3-3 4',
  edit: 'M10.5 2.5l3 3-8 8h-3v-3zM9 4l3 3',
  emoji: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM5.5 9.5c.6 1 1.5 1.5 2.5 1.5s1.9-.5 2.5-1.5M6 6.5h.01M10 6.5h.01',
};

/** An icon by name, or nothing for a name this build doesn't draw. */
export function icon(name: string | undefined, size = 16, label = ''): TemplateResult | typeof nothing {
  const path = name ? ICON[name] : undefined;

  if (!path) return nothing;

  return html`<svg
    class="icon"
    viewBox="0 0 16 16"
    width=${size}
    height=${size}
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    role=${label ? 'img' : nothing}
    aria-label=${label || nothing}
    aria-hidden=${label ? nothing : 'true'}
    data-icon=${name}
  ><path d=${path}></path></svg>`;
}

/** Whether the build draws `name`: a test reads it, and so does anything choosing a fallback. */
export const drawsIcon = (name: string): boolean => name in ICON;

/** The ink each tone draws a mark in, and the dot a label or a state carries. */
export const TONE_INK: Record<Tone, string> = {
  neutral: 'var(--fg-muted)',
  brand: 'var(--brand-fg)',
  success: 'var(--success-fg)',
  warn: 'var(--warn-fg)',
  danger: 'var(--danger-fg)',
};
export const TONE_DOT: Record<Tone, string> = {
  neutral: 'var(--fg-muted)',
  brand: 'var(--brand)',
  success: 'var(--success)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
};
/** A soft tint and its ink, for a tag or a badge. */
export const TONE_TAG: Record<Tone, string> = {
  neutral: 'background: var(--layer-hover); color: var(--fg-muted)',
  brand: 'background: var(--brand-soft); color: var(--brand-fg)',
  success: 'background: var(--success-soft); color: var(--success-fg)',
  warn: 'background: var(--warn-soft); color: var(--warn-fg)',
  danger: 'background: var(--danger-soft); color: var(--danger-fg)',
};

export const STATE_TONE: Record<StateGroup, Tone> = {
  backlog: 'neutral',
  unstarted: 'neutral',
  started: 'warn',
  completed: 'success',
  cancelled: 'danger',
};
export const PRIORITY_TONE: Record<Priority, Tone> = {
  urgent: 'danger',
  high: 'warn',
  medium: 'warn',
  low: 'brand',
  none: 'neutral',
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No priority',
};
export const GROUP_LABEL: Record<StateGroup, string> = {
  backlog: 'Backlog',
  unstarted: 'Unstarted',
  started: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const MARK_SIZE = { sm: 14, md: 16 } as const;

/** A mark's box: 16 units, drawn in `ink`. */
const markBox = (size: keyof typeof MARK_SIZE, ink: string, body: Svg, kind: string) =>
  html`<svg
    class="mark"
    data-mark=${kind}
    viewBox="0 0 16 16"
    width=${MARK_SIZE[size]}
    height=${MARK_SIZE[size]}
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    style="color: ${ink}; flex-shrink: 0"
  >${body}</svg>`;

/**
 * A state group's mark: a dashed ring for backlog, a ring for unstarted, a
 * ring with its centre filled for started, a check for completed, a cross for
 * cancelled. `review` is a ring three quarters filled.
 */
export function stateMark(group: StateGroup | 'review', tone?: Tone, size: keyof typeof MARK_SIZE = 'sm'): TemplateResult {
  const ink = TONE_INK[tone ?? (group === 'review' ? 'success' : STATE_TONE[group])];
  let body: Svg;

  switch (group) {
    case 'backlog':
      body = svg`<circle cx="8" cy="8" r="6" stroke-dasharray="2.2 2.2"></circle>`;
      break;
    case 'started':
      body = svg`<circle cx="8" cy="8" r="6"></circle><path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" stroke="none"></path>`;
      break;
    case 'review':
      body = svg`<circle cx="8" cy="8" r="6"></circle><path d="M8 4.5a3.5 3.5 0 1 1-3.5 3.5H8z" fill="currentColor" stroke="none"></path>`;
      break;
    case 'completed':
      body = svg`<circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="none"></circle><path d="M5.25 8.25 7.2 10.2 10.8 6" stroke="var(--bg-surface)"></path>`;
      break;
    case 'cancelled':
      body = svg`<circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="none"></circle><path d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5" stroke="var(--bg-surface)"></path>`;
      break;
    default:
      body = svg`<circle cx="8" cy="8" r="6"></circle>`;
  }

  return markBox(size, ink, body, group);
}

/**
 * A priority's mark: a warning square for urgent, three, two or one raised
 * bars for high, medium and low, a struck ring for none.
 */
export function priorityMark(priority: Priority, tone?: Tone, size: keyof typeof MARK_SIZE = 'sm'): TemplateResult {
  const ink = TONE_INK[tone ?? PRIORITY_TONE[priority]];

  if (priority === 'urgent') {
    return markBox(
      size,
      ink,
      svg`<rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="currentColor" stroke="none"></rect><path d="M8 4.5v4.25M8 11.25h.01" stroke="var(--bg-surface)" stroke-width="1.75"></path>`,
      priority,
    );
  }
  if (priority === 'none') return markBox(size, ink, svg`<circle cx="8" cy="8" r="6"></circle><path d="M3.8 12.2 12.2 3.8"></path>`, priority);

  const lit = priority === 'high' ? 3 : priority === 'medium' ? 2 : 1;
  const bars = [
    { x: 2.5, y: 9.5 },
    { x: 6.75, y: 6.5 },
    { x: 11, y: 3 },
  ];

  return markBox(
    size,
    ink,
    svg`${bars.map(
      (bar, index) =>
        svg`<rect x=${bar.x} y=${bar.y} width="2.5" height=${14 - bar.y} rx="0.75" fill="currentColor" stroke="none" opacity=${index < lit ? '1' : '0.3'}></rect>`,
    )}`,
    priority,
  );
}

/** A person's initials: the first letter of the first and the last word. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words;

  return letters.map(word => Array.from(word)[0]!.toUpperCase()).join('') || '?';
}

/** The tint a face takes follows who it is, so the same person keeps their colour. */
const FACE_TINT = [
  'background: var(--brand-soft); color: var(--brand-fg)',
  'background: var(--success-soft); color: var(--success-fg)',
  'background: var(--warn-soft); color: var(--warn-fg)',
  'background: var(--danger-soft); color: var(--danger-fg)',
  'background: var(--layer-selected); color: var(--fg)',
] as const;

function tintOf(key: string): string {
  let hash = 0;

  for (let index = 0; index < key.length; index++) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;

  return FACE_TINT[hash % FACE_TINT.length]!;
}

export const face = (id: string, name: string, size: 'xs' | 'sm' = 'sm') =>
  html`<span class="face ${size}" title=${name} style=${tintOf(id)}>${initialsOf(name)}</span>`;

/** Up to `max` people, overlapping, and how many more. Named in full for a screen reader. */
export function faces(people: readonly { id: string; name: string }[], max = 3) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;

  return html`<span class="faces" role="img" aria-label=${people.map(person => person.name).join(', ')}>
    ${shown.map(person => face(person.id, person.name))}${more > 0 ? html`<span class="face sm more">+${more}</span>` : nothing}
  </span>`;
}

/** A label as a planning app tags it: a small tinted pill with its dot. */
export const labelTag = (label: string, tone?: Tone) =>
  html`<span class="tag"><span class="dot" style="background: ${TONE_DOT[tone ?? 'neutral']}"></span><span class="tag-text">${label}</span></span>`;

/** Any of the planning marks, drawn at picker size: a ring, a priority, a person or a dot. */
export function optionMark(mark: string, tone?: Tone, name = '', id = ''): TemplateResult | typeof nothing {
  if (mark === 'person') return face(id || name, name, 'xs');
  if (mark === 'dot') return html`<span class="dot lg" style="background: ${TONE_DOT[tone ?? 'neutral']}"></span>`;
  if (mark === 'review') return stateMark('review', tone);
  if (mark === 'blocked') return priorityMark('none', tone ?? 'danger');
  if (mark in PRIORITY_TONE) return priorityMark(mark as Priority, tone);
  if (mark in STATE_TONE) return stateMark(mark as StateGroup, tone);

  return nothing;
}

/** A completion ring: muted under half, brand past it, warn past everything. */
export function ring(value: number, size = 16, label = false): TemplateResult {
  const stroke = 2;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * circ;
  const ink = value > 100 ? 'var(--warn-fg)' : value > 50 ? 'var(--brand-fg)' : 'var(--fg-muted)';

  return html`<span class="ring" role="img" aria-label="${Math.round(value)}%">
    <svg width=${size} height=${size} viewBox="0 0 ${size} ${size}" aria-hidden="true" style="transform: rotate(-90deg)">
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--line)" stroke-width=${stroke}></circle>
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${ink} stroke-width=${stroke} stroke-dasharray="${dash} ${circ}" stroke-linecap="round"></circle>
    </svg>
    ${label ? html`<span class="ring-value" aria-hidden="true">${Math.round(value)}</span>` : nothing}
  </span>`;
}

/** The person's locale, as the page says it or the browser does. */
export function localeOf(element: HTMLElement): string {
  const lang = element.closest('[lang]')?.getAttribute('lang');

  return lang || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en-US';
}

/** A day short, as a row shows it: `Mar 4` in en-US, `4 Mar` in en-GB. */
export function shortDate(iso: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);

  if (!match) return '';

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));

  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
  }
}

/** Whether an ISO day is before today, where the person is. */
export function isPastDay(iso: string, now = new Date()): boolean {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso < today;
}

/** "3m ago", "2h ago", "5d ago", then a short date. Empty for a moment that can't be read. */
export function timeAgo(iso: string, locale: string, now = Date.now()): string {
  const when = Date.parse(iso);

  if (!iso || Number.isNaN(when)) return '';

  const seconds = Math.max(0, Math.round((now - when) / 1000));

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d ago`;

  const date = new Date(when);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();

  try {
    return new Intl.DateTimeFormat(locale, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** The whole date and time, for the hover over a relative one. */
export function fullTime(iso: string, locale: string): string {
  const when = Date.parse(iso);

  if (Number.isNaN(when)) return '';

  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(when);
  } catch {
    return new Date(when).toISOString();
  }
}

/** What takes a press of its own inside a pressable row or card. */
const INTERACTIVE =
  "button, a, input, textarea, select, [role='menuitem'], [role='menuitemcheckbox'], [role='option'], [role='combobox'], [role='checkbox'], [role='switch'], bry-button, bry-input, bry-textarea, bry-select, bry-checkbox, bry-switch, bry-menu, bry-property, bry-filter-menu";

/** Whether a press was on `host` itself, not on a control within it. */
/** The keys held on a press, or nothing when none were: Shift, and ⌘ or Ctrl. */
export function heldKeys(event: Event): { shift: boolean; mod: boolean } | undefined {
  const keys = event as Partial<MouseEvent>;
  const mod = keys.metaKey === true || keys.ctrlKey === true;

  return keys.shiftKey === true || mod ? { shift: keys.shiftKey === true, mod } : undefined;
}

export function pressedItself(event: Event, host: HTMLElement): boolean {
  for (const target of event.composedPath()) {
    if (target === host) return true;
    if (target instanceof Element && target.matches(INTERACTIVE)) return false;
  }

  return false;
}

/** Enter or Space on the pressable box itself, not on something inside it. */
export const pressKey = (press: () => void) => (event: KeyboardEvent) => {
  if (event.composedPath()[0] !== event.currentTarget) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  press();
};

// ---------------------------------------------------------------------------
// Popups: the "⋯" menu, a property's picker, the filter menu.

/** What one popup keeps while it is open. */
export interface Pop {
  open: boolean;
  active: number;
  typed: string;
  typedAt: number;
  /** A second level, where the popup has one: the facet a filter menu shows. */
  view: string;
  query: string;
}

/** The popup `key` of `element`, made closed the first time it is asked for. */
const pops = new WeakMap<object, Record<string, Pop>>();

export function popOf(element: object, key: string): Pop {
  let all = pops.get(element);

  if (!all) {
    all = {};
    pops.set(element, all);
  }

  return (all[key] ??= { open: false, active: -1, typed: '', typedAt: 0, view: '', query: '' });
}

/** What was typed within a second, as a word to search with. */
function typing(pop: Pop, key: string): string {
  const now = Date.now();

  pop.typed = now - pop.typedAt < 1_000 ? pop.typed + key.toLowerCase() : key.toLowerCase();
  pop.typedAt = now;

  return pop.typed;
}

/** Focus the active row of an open popup, once it is drawn. */
export const focusActive = (element: El) =>
  queueMicrotask(() => (element.shadowRoot?.querySelector('.popup [data-active]') as HTMLElement | null)?.focus());

/**
 * The keyboard a popup list answers, and what it does with each answer:
 * move the active row, choose it, or close and give the focus back.
 */
export function popupKeys(
  element: El,
  pop: Pop,
  rows: readonly { label: string; disabled?: boolean }[],
  choose: (index: number) => void,
  close: () => void,
) {
  return (event: KeyboardEvent) => {
    if (!pop.open) return;
    // Typing into a search box types; only the arrows, Enter and Escape reach the list.
    const typingInField = (event.composedPath()[0] as Element | undefined)?.tagName === 'INPUT';

    if (typingInField && event.key.length === 1) return;

    const answer = nextActive(event.key, rows, pop.active, !typingInField && event.key.length === 1 ? typing(pop, event.key) : '');

    if (answer === null) return;

    event.preventDefault();
    event.stopPropagation();
    if (answer === 'close') return close();
    if (answer === 'choose') return pop.active >= 0 ? choose(pop.active) : undefined;

    pop.active = answer.active;
    element.requestUpdate();
    if (!typingInField) focusActive(element);
  };
}

/** Closes a popup when the focus leaves it and its trigger. */
export const closeOnLeave = (element: El, pop: Pop, close: (refocus: boolean) => void) => (event: FocusEvent) => {
  if (!pop.open) return;

  const to = event.relatedTarget as Node | null;

  if (to && (element.shadowRoot?.contains(to) || element.contains(to))) return;
  close(false);
};

/** A menu item as a planning element's own menu takes it. */
export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  tone?: string;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
  /** Drawn in the submenu of the item with this id. */
  parent?: string;
}

export function menuItemsOf(value: unknown): MenuItem[] {
  return records(value).map(item => ({
    id: str(item.id),
    label: str(item.label),
    icon: pick(MENU_ICONS, item.icon),
    tone: str(item.tone),
    separator: item.separator === true,
    disabled: item.disabled === true,
    checked: item.checked === true,
    parent: str(item.parent) || undefined,
  }));
}

/** One row of a menu as it stands: an item, a submenu's way in, or the way back out of one. */
export interface TreeRow extends MenuItem {
  /** Opens the submenu of the items whose `parent` is this one. */
  branch?: boolean;
  /** Heads a submenu, and goes back out of it. */
  back?: boolean;
}

/**
 * The rows a menu shows in `view`: the items without a `parent` at the top;
 * in a submenu, a row back out, then the items whose `parent` it is. A
 * submenu is shown in the menu's own place rather than beside it, so it
 * reads the same by keyboard, by pointer and on a narrow screen.
 */
export function treeRows(items: readonly MenuItem[], view: string): TreeRow[] {
  const branch = (item: MenuItem) => items.some(one => one.parent === item.id);
  const at = view ? items.find(item => item.id === view) : undefined;
  const under = (parent: string | undefined) => items.filter(item => item.parent === parent).map(item => ({ ...item, branch: branch(item) }));

  if (!at) return under(undefined);

  return [{ ...at, back: true, separator: false, disabled: false, tone: '', checked: false, icon: undefined }, ...under(at.id)];
}

/**
 * Choosing a row: into a submenu, back out of one, or the item's id to raise.
 * `view` is where the menu is now.
 */
export function treeChoice(rows: readonly TreeRow[], index: number): { view: string; active: number } | { id: string } | null {
  const row = rows[index];

  if (!row || row.disabled) return null;
  if (row.back) return { view: row.parent ?? '', active: 0 };
  if (row.branch) return { view: row.id, active: 1 };

  return { id: row.id };
}

/**
 * A menu's keyboard, with its submenus: the arrow across the reading
 * direction goes into a submenu, the one back comes out, and so does Escape.
 * Everything else is `popupKeys`'.
 */
export function treeKeys(element: El, pop: Pop, rows: readonly TreeRow[], choose: (index: number) => void, close: () => void) {
  const keys = popupKeys(element, pop, rows, choose, close);

  return (event: KeyboardEvent) => {
    if (pop.open && pop.active >= 0) {
      const inward = getComputedStyle(element).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const outward = inward === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';
      const row = rows[pop.active];

      if (event.key === inward && row?.branch) {
        event.preventDefault();
        event.stopPropagation();
        return choose(pop.active);
      }
      if ((event.key === outward || event.key === 'Escape') && rows[0]?.back) {
        event.preventDefault();
        event.stopPropagation();
        return choose(0);
      }
    }

    keys(event);
  };
}

/** One menu's rows, as `bry-menu`, `bry-context-menu` and every "⋯" draw them. */
export function menuRows(element: El, pop: Pop, items: readonly TreeRow[], choose: (index: number) => void) {
  return items.map(
    (item, index) => html`${item.separator && index > 0 && !items[index - 1]?.back ? html`<div class="separator" role="separator"></div>` : nothing}
      <button
        type="button"
        role="menuitem"
        tabindex="-1"
        class=${item.back ? 'back' : nothing}
        data-item=${item.back ? nothing : item.id}
        data-back=${item.back ? item.id : nothing}
        data-tone=${item.tone === 'danger' ? 'danger' : nothing}
        data-active=${index === pop.active ? '' : nothing}
        aria-haspopup=${item.branch ? 'menu' : nothing}
        aria-disabled=${item.disabled === true ? 'true' : nothing}
        @click=${(event: Event) => {
          event.stopPropagation();
          choose(index);
        }}
        @mousemove=${() => {
          if (pop.active === index) return;
          pop.active = index;
          element.requestUpdate();
        }}
      >
        ${item.back ? html`<span class="flip">${icon('chevronRight', 14)}</span>` : icon(item.icon, 14)}<span class="item-label">${item.label}</span>${item.checked === true
          ? html`<span class="tick" role="img" aria-label="Chosen">${icon('check', 14)}</span>`
          : nothing}${item.branch ? html`<span class="tick">${icon('chevronRight', 14)}</span>` : nothing}
      </button>${item.back ? html`<div class="separator" role="separator"></div>` : nothing}`,
  );
}

/**
 * The "⋯" a row, card or entity keeps at its end: faint until the row is
 * hovered or focused. Choosing an item raises `select` with its id. Draws
 * nothing when there are no items.
 */
export function rowMenu(element: El, value: unknown, label: string, key = 'row-menu', reveal = true): TemplateResult | typeof nothing {
  const items = menuItemsOf(value);

  if (items.length === 0) return nothing;

  const pop = popOf(element, key);
  const rows = treeRows(items, pop.view);
  const close = (refocus = true) => {
    pop.open = false;
    pop.active = -1;
    pop.view = '';
    element.requestUpdate();
    if (refocus) queueMicrotask(() => (element.shadowRoot?.querySelector(`[data-menu="${key}"] > .trigger`) as HTMLElement | null)?.focus());
  };
  const choose = (index: number) => {
    const next = treeChoice(rows, index);

    if (!next) return;
    if ('view' in next) {
      pop.view = next.view;
      pop.active = next.active;
      element.requestUpdate();
      return focusActive(element);
    }
    element.emit('select', { id: next.id });
    close();
  };
  const open = () => {
    pop.open = true;
    pop.view = '';
    pop.active = rows.findIndex(item => !item.disabled);
    element.requestUpdate();
    focusActive(element);
  };

  return html`<div
    class="menu-anchor ${reveal ? 'reveal' : ''}"
    data-menu=${key}
    data-open=${pop.open ? '' : nothing}
    @keydown=${treeKeys(element, pop, rows, choose, close)}
    @focusout=${closeOnLeave(element, pop, close)}
  >
    <button
      type="button"
      class="trigger more"
      aria-label=${label}
      aria-haspopup="menu"
      aria-expanded=${pop.open ? 'true' : 'false'}
      @click=${(event: Event) => {
        event.stopPropagation();
        pop.open ? close() : open();
      }}
      @keydown=${(event: KeyboardEvent) => {
        if (pop.open || event.key !== 'ArrowDown') return;
        event.preventDefault();
        open();
      }}
    >
      ${icon('more', 14)}
    </button>
    ${pop.open ? html`<div class="popup" role="menu" aria-label=${label}>${menuRows(element, pop, rows, choose)}</div>` : nothing}
  </div>`;
}

/** The quick-add line's variants: in a list, at the foot of a column, or a small link. */
export type QuickAddVariant = 'row' | 'card' | 'link';

/**
 * "+ New work item" that becomes a bare input where it sits. Shared by
 * `bry-quick-add` and a board column that adds its own cards. Enter raises
 * `onSubmit` with the trimmed text; the input keeps it until the app sends a
 * new `value`.
 */
export function quickAddLine(
  element: El,
  options: {
    variant: QuickAddVariant;
    trigger: string;
    placeholder: string;
    hint: string;
    open: boolean;
    busy: boolean;
    value: string;
    onOpen: () => void;
    onSubmit: (value: string) => void;
    onCancel: () => void;
  },
): TemplateResult {
  const { draft, set } = draftOf(element, 'quick-add', options.value);
  const was = keptOf(element, () => ({ quickAddOpen: false }) as Record<string, unknown>);

  // Opening takes the focus into the input, once.
  if (options.open && was.quickAddOpen !== true) {
    queueMicrotask(() => (element.shadowRoot?.querySelector('.quick-add input') as HTMLInputElement | null)?.focus());
  }
  was.quickAddOpen = options.open;

  if (!options.open) {
    return html`<button type="button" class="quick-add closed ${options.variant}" @click=${options.onOpen}>
      ${icon('add', 14)}<span>${options.trigger}</span>
    </button>`;
  }

  return html`<div class="quick-add opened ${options.variant}">
    ${options.busy ? html`<span class="spinner" role="status" aria-label="Saving"></span>` : icon('add', 14)}
    <input
      type="text"
      .value=${draft}
      ?disabled=${options.busy}
      aria-label=${options.trigger}
      placeholder=${options.placeholder || 'Title…'}
      @input=${(event: Event) => set((event.currentTarget as HTMLInputElement).value)}
      @keydown=${(event: KeyboardEvent) => {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          const text = (event.currentTarget as HTMLInputElement).value.trim();

          if (text) options.onSubmit(text);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          options.onCancel();
        }
      }}
    />
    ${options.hint && options.variant !== 'link' ? html`<span class="hint">${options.hint}</span>` : nothing}
  </div>`;
}

/** The look every piece above draws with. Each Plan drawing includes it. */
export const PLAN = css`
  .icon,
  .mark {
    flex-shrink: 0;
  }
  .unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .truncate {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .face {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    box-shadow: 0 0 0 2px var(--bg-surface);
    font-weight: 600;
  }
  .face.sm {
    width: 1.25rem;
    height: 1.25rem;
    font-size: 0.5625rem;
  }
  .face.xs {
    width: 1.125rem;
    height: 1.125rem;
    font-size: 0.5rem;
  }
  .face.more {
    background: var(--layer-hover);
    color: var(--fg-muted);
  }
  .faces {
    display: inline-flex;
    align-items: center;
  }
  .faces > * + * {
    margin-inline-start: -0.25rem;
  }
  .tag {
    display: inline-flex;
    height: 1rem;
    flex-shrink: 0;
    align-items: center;
    gap: 0.25rem;
    border-radius: 9999px;
    background: var(--layer-hover);
    padding: 0 0.375rem;
    font-size: 0.625rem;
    font-weight: 500;
    color: var(--fg);
  }
  .tag-text {
    max-width: 6rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    display: inline-block;
    width: 0.375rem;
    height: 0.375rem;
    flex-shrink: 0;
    border-radius: 9999px;
  }
  .dot.lg {
    width: 0.5rem;
    height: 0.5rem;
  }
  .ring {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
  }
  .ring-value {
    position: absolute;
    font-size: 0.5rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
  }
  .menu-anchor {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
  }
  .trigger.more {
    display: inline-flex;
    width: 1.25rem;
    height: 1.25rem;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition:
      opacity var(--dur-fast),
      background-color var(--dur-fast);
  }
  .reveal .trigger.more {
    opacity: 0.4;
  }
  :host(:hover) .reveal .trigger.more,
  :host(:focus-within) .reveal .trigger.more,
  .menu-anchor[data-open] .trigger.more {
    opacity: 1;
  }
  .trigger.more:hover {
    background: var(--layer-hover);
    color: var(--fg);
  }
  .popup {
    position: absolute;
    z-index: 50;
    top: 100%;
    inset-inline-end: 0;
    margin-top: 0.25rem;
    min-width: 9rem;
    max-height: 20rem;
    overflow-y: auto;
    padding: 0.25rem;
    border: 1px solid var(--line);
    border-radius: var(--menu-radius);
    background: var(--popover);
    color: var(--popover-foreground);
    box-shadow: var(--shadow-pop);
    text-align: start;
  }
  .popup.start {
    inset-inline-end: auto;
    inset-inline-start: 0;
  }
  .popup [role='menuitem'],
  .popup [role='menuitemcheckbox'],
  .popup [role='option'] {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    border: 0;
    border-radius: var(--menu-item-radius);
    background: transparent;
    padding: 0.375rem 0.5rem;
    font: inherit;
    font-size: 0.75rem;
    color: inherit;
    text-align: start;
    cursor: pointer;
    outline: none;
  }
  .popup [data-active] {
    background: var(--layer-hover);
  }
  .popup [aria-disabled='true'] {
    pointer-events: none;
    opacity: 0.5;
  }
  .popup [data-tone='danger'] {
    color: var(--danger-fg);
  }
  .item-label {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tick {
    display: inline-flex;
    margin-inline-start: auto;
  }
  .popup .back {
    font-weight: 500;
  }
  .flip {
    display: inline-flex;
    transform: scaleX(-1);
  }
  :host(:dir(rtl)) .flip {
    transform: none;
  }
  .separator {
    height: 1px;
    margin: 0.25rem -0.25rem;
    background: var(--line);
  }
  .group-heading {
    padding: 0.375rem 0.5rem 0.25rem;
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--fg-muted);
  }
  .search {
    width: 100%;
    height: 2rem;
    margin-bottom: 0.25rem;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: transparent;
    padding: 0 0.5rem;
    font: inherit;
    font-size: 0.75rem;
    color: var(--fg);
    outline: none;
  }
  .search::placeholder,
  .quick-add input::placeholder {
    color: var(--fg-placeholder);
  }
  .quick-add {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 0.5rem;
    font: inherit;
    color: var(--fg-muted);
  }
  .quick-add.closed {
    border: 0;
    background: transparent;
    cursor: pointer;
    text-align: start;
    transition:
      color var(--dur-fast),
      background-color var(--dur-fast);
  }
  .quick-add.closed:hover {
    background: var(--layer-hover);
    color: var(--fg);
  }
  .quick-add.row {
    min-height: 2.75rem;
    padding: 0.5rem 0.875rem;
    font-size: 0.875rem;
  }
  .quick-add.card {
    border-radius: var(--radius-lg);
    padding: 0.375rem 0.5rem;
    font-size: 0.75rem;
  }
  .quick-add.link {
    width: auto;
    border-radius: var(--radius-md);
    padding: 0.25rem;
    font-size: 0.75rem;
  }
  .quick-add.opened.row {
    background: var(--layer-hover);
  }
  .quick-add.opened.card {
    border: 1px solid var(--line);
    background: var(--bg-surface);
    padding: 0.5rem 0.625rem;
  }
  .quick-add.opened.link {
    height: 1.75rem;
    border: 1px solid var(--line);
    padding: 0 0.5rem;
  }
  .quick-add input {
    min-width: 0;
    flex: 1;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 0.875rem;
    color: var(--fg);
    outline: none;
  }
  .quick-add input:disabled {
    opacity: 0.5;
  }
  .hint {
    flex-shrink: 0;
    font-size: 0.625rem;
    color: var(--fg-muted);
  }
  .spinner {
    width: 0.875rem;
    height: 0.875rem;
    flex-shrink: 0;
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
  .bone {
    border-radius: var(--radius-md);
    background: var(--layer-hover);
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
`;
