import type {
  CalendarAttendee,
  CalendarEventInput,
  CalendarOccurrence,
  CalendarPerson,
  CalendarResponse,
  HandlerCalendar,
} from '@brydio/app/handler';

/**
 * An event as the fake host keeps it (CA02): the event layer's row, with
 * people named by user id. A series has `rrule`; the fake expands `DAILY`
 * and `WEEKLY` rules (`INTERVAL`, `COUNT`, `UNTIL`, `BYDAY`) on UTC days,
 * which is enough to test screens. Brydio expands every rule in the event's
 * own zone, DST kept.
 */
export interface FakeCalendarEvent {
  id: string;
  owner: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  timeZone?: string;
  description?: string | null;
  location?: string | null;
  attendees?: CalendarAttendee[];
  rrule?: string | null;
  exdates?: string[];
  status?: CalendarOccurrence['status'];
  showAs?: CalendarOccurrence['showAs'];
  visibility?: 'default' | 'private';
  project?: string | null;
  room?: string | null;
  call?: string | null;
  source?: CalendarOccurrence['source'];
  /** For an occurrence moved on its own: the series and the start it replaces. */
  series?: string | null;
  originalStart?: string | null;
}

/** What the fake calendar starts with: events, and how each person shares. */
export interface FakeCalendarOptions {
  events?: FakeCalendarEvent[];
  /** Per member: zone, working hours and sharing (`busy` by default). */
  people?: (Partial<Omit<CalendarPerson, 'member' | 'freshness'>> & { member: string })[];
  /** The caller's connected calendars, as `calendar.calendars()` lists them. */
  calendars?: Awaited<ReturnType<HandlerCalendar['calendars']>>['items'];
  /** Members of the workspace; others are refused. Default: everyone named anywhere above, plus the caller. */
  members?: string[];
}

const MAX_RANGE_DAYS = 62;
const DAY = 86_400_000;
const RESPONSES: CalendarResponse[] = ['needs_action', 'accepted', 'tentative', 'declined'];

const refuse = (code: string, words: string): never => {
  throw new Error(`${words} (${code})`);
};

/** The calendar a handler gets from the fake host, over `events`. */
export function fakeCalendar(options: FakeCalendarOptions, callerId: string, events: Map<string, FakeCalendarEvent>): HandlerCalendar {
  let serial = 0;
  const people = new Map((options.people ?? []).map(one => [one.member, one]));
  const members = new Set(options.members ?? [callerId, ...people.keys(), ...[...events.values()].flatMap(one => [one.owner, ...(one.attendees ?? []).flatMap(a => (a.member ? [a.member] : []))])]);

  const member = (id: unknown) => {
    if (typeof id !== 'string' || !members.has(id)) refuse('calendar_not_found', 'One of those people is not a member here.');
    return id as string;
  };
  const personOf = (id: string): CalendarPerson => {
    const one = people.get(id);
    return {
      member: id,
      timeZone: one?.timeZone ?? 'UTC',
      workingHours: one?.workingHours ?? { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
      sharing: one?.sharing ?? 'busy',
      freshness: { state: 'none' },
    };
  };
  const span = (query: { from?: unknown; to?: unknown }) => {
    const from = Date.parse(String(query.from));
    const to = Date.parse(String(query.to));
    if (Number.isNaN(from) || Number.isNaN(to) || to <= from || to - from > MAX_RANGE_DAYS * DAY) {
      refuse('calendar_invalid', `A range runs forward, ${MAX_RANGE_DAYS} days at most.`);
    }
    return { from, to };
  };
  const whoOf = (raw: unknown) => (raw === undefined ? [callerId] : [...new Set((raw as unknown[]).map(member))]);

  const seen = (event: FakeCalendarEvent, on: string, start: number, end: number, originalStart: string | null): CalendarOccurrence => {
    const invited = (event.attendees ?? []).some(one => one.member === callerId);
    const mine = event.owner === callerId;
    const busyOnly = !mine && !invited && (event.visibility === 'private' || personOf(event.owner).sharing !== 'details');
    const series = event.rrule ? event.id : (event.series ?? null);
    return {
      id: event.rrule && originalStart ? `${event.id}@${originalStart}` : event.id,
      event: event.id,
      series,
      originalStart: originalStart ?? event.originalStart ?? null,
      on,
      owner: event.owner,
      source: event.source ?? 'brydio',
      calendar: null,
      calendarName: null,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      allDay: event.allDay ?? false,
      timeZone: event.timeZone ?? 'UTC',
      status: event.status ?? 'confirmed',
      showAs: event.showAs ?? 'busy',
      busyOnly,
      private: event.visibility === 'private',
      ...(busyOnly
        ? {}
        : {
            title: event.title,
            description: event.description ?? null,
            location: event.location ?? null,
            attendees: event.attendees ?? [],
            conferenceUrl: null,
            webLink: null,
          }),
      room: event.room ?? null,
      call: event.call ?? null,
      project: event.project ?? null,
      recurring: Boolean(series),
      rrule: event.rrule ?? null,
      editable: mine,
    };
  };

  const occurrences = (from: number, to: number, who: string[], project?: string, cancelled = false): CalendarOccurrence[] => {
    const out: CalendarOccurrence[] = [];
    const moved = [...events.values()].filter(one => one.series && one.originalStart);
    for (const person of who) {
      for (const event of events.values()) {
        const theirs = event.owner === person || (event.attendees ?? []).some(one => one.member === person && one.response !== 'declined');
        if (!theirs || (project && event.project !== project) || (!cancelled && event.status === 'cancelled')) continue;
        const start = Date.parse(event.start);
        const length = Date.parse(event.end) - start;
        if (!event.rrule) {
          if (start < to && start + length > from) out.push(seen(event, person, start, start + length, null));
          continue;
        }
        for (const at of expand(event.rrule, start, to)) {
          const iso = new Date(at).toISOString();
          if ((event.exdates ?? []).includes(iso) || moved.some(one => one.series === event.id && one.originalStart === iso)) continue;
          if (at < to && at + length > from) out.push(seen(event, person, at, at + length, iso));
        }
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  };

  const editable = (raw: unknown) => {
    const id = String(raw);
    const at = id.lastIndexOf('@');
    const event = events.get(at >= 0 ? id.slice(0, at) : id);
    if (!event) refuse('calendar_not_found', 'No such event');
    if (event!.owner !== callerId) refuse('calendar_forbidden', 'Only its owner changes this event');
    return { event: event!, originalStart: at >= 0 ? id.slice(at + 1) : null };
  };

  const shaped = (raw: CalendarEventInput): Omit<FakeCalendarEvent, 'id' | 'owner'> => {
    if (!raw || typeof raw.title !== 'string' || !raw.title.trim()) refuse('calendar_invalid', 'An event needs a title.');
    const start = Date.parse(raw.start);
    const end = Date.parse(raw.end);
    if (Number.isNaN(start) || Number.isNaN(end)) refuse('calendar_invalid', 'start is an ISO time.');
    if (end < start) refuse('calendar_invalid', 'An event ends after it starts.');
    try {
      Intl.DateTimeFormat('en', { timeZone: raw.timeZone }).resolvedOptions();
    } catch {
      refuse('calendar_invalid', 'timeZone is an IANA zone.');
    }
    const attendees: CalendarAttendee[] = (raw.attendees ?? []).map(one => {
      const optional = one.optional ? { optional: true } : {};
      if ('member' in one) return { kind: 'person', member: member(one.member), response: 'needs_action', ...optional };
      if ('bot' in one) return { kind: 'bot', bot: one.bot, response: 'needs_action', ...optional };
      const email = String(one.email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+$/.test(email)) refuse('calendar_invalid', 'An attendee is a member, a bot or an email address.');
      return { kind: 'email', email, ...(one.name ? { name: one.name } : {}), response: 'needs_action', ...optional };
    });
    return {
      title: raw.title.trim(),
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      allDay: raw.allDay ?? false,
      timeZone: raw.timeZone,
      description: raw.description ?? null,
      location: raw.location ?? null,
      attendees,
      rrule: raw.rrule ?? null,
      exdates: raw.exdates ?? [],
      showAs: raw.showAs ?? 'busy',
      visibility: raw.visibility ?? 'default',
      ...(raw.project !== undefined ? { project: raw.project } : {}),
      ...(raw.room !== undefined ? { room: raw.room } : {}),
    };
  };

  const one = (id: string) => {
    const at = id.lastIndexOf('@');
    const event = events.get(at >= 0 ? id.slice(0, at) : id);
    if (!event) return null;
    const start = at >= 0 ? Date.parse(id.slice(at + 1)) : Date.parse(event.start);
    const view = seen(event, event.owner, start, start + Date.parse(event.end) - Date.parse(event.start), at >= 0 ? id.slice(at + 1) : null);
    const allowed = !view.busyOnly || event.owner === callerId || personOf(event.owner).sharing === 'details';
    return allowed ? { ...view, exdates: event.exdates ?? [], seriesEndsAt: null } : { ...view, exdates: [], seriesEndsAt: null };
  };

  return {
    async range(query) {
      const { from, to } = span(query);
      const who = whoOf(query.people);
      return { people: who.map(personOf), events: occurrences(from, to, who, query.project, query.cancelled === true) };
    },
    async busy(query) {
      const { from, to } = span(query);
      const who = whoOf(query.people);
      return {
        people: who.map(person => ({
          ...personOf(person),
          busy: occurrences(from, to, [person])
            .filter(o => o.showAs !== 'free')
            .map(o => ({ start: o.start, end: o.end })),
          working: [],
        })),
      };
    },
    async event(id) {
      return one(String(id));
    },
    async calendars() {
      return { items: options.calendars ?? [] };
    },
    async create(input) {
      const id = `evt_fake_${++serial}`;
      events.set(id, { id, owner: callerId, ...shaped(input) });
      return one(id);
    },
    async update(id, input, options) {
      const { event, originalStart } = editable(id);
      const scope = options?.scope ?? 'all';
      const at = options?.originalStart ?? originalStart;
      if (scope === 'this' && event.rrule) {
        if (!at) refuse('calendar_invalid', 'originalStart names the occurrence');
        const moved = `evt_fake_${++serial}`;
        events.set(moved, { id: moved, owner: callerId, ...shaped({ ...input, rrule: null }), series: event.id, originalStart: at });
        return one(moved);
      }
      events.set(event.id, { ...event, ...shaped(input) });
      return one(event.id);
    },
    async cancel(id, options) {
      const { event, originalStart } = editable(id);
      const at = options?.originalStart ?? originalStart;
      if ((options?.scope ?? 'all') === 'this' && event.rrule && at) {
        events.set(event.id, { ...event, exdates: [...(event.exdates ?? []), at] });
      } else {
        events.delete(event.id);
      }
      return { cancelled: event.id };
    },
    async respond(id, response) {
      if (!RESPONSES.includes(response)) refuse('calendar_invalid', `calendar.respond takes one of ${RESPONSES.join(', ')}.`);
      const raw = String(id);
      const event = events.get(raw.includes('@') ? raw.slice(0, raw.lastIndexOf('@')) : raw);
      if (!event || !(event.attendees ?? []).some(a => a.member === callerId)) refuse('calendar_not_found', 'No such invitation');
      events.set(event!.id, { ...event!, attendees: event!.attendees!.map(a => (a.member === callerId ? { ...a, response } : a)) });
      return one(event!.id);
    },
  };
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Starts of a DAILY or WEEKLY series up to `to`, on UTC days. Other rules give only the first. */
export function expand(rrule: string, first: number, to: number): number[] {
  const rule = Object.fromEntries(rrule.split(';').map(part => part.split('=') as [string, string]));
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? Date.parse(rule.UNTIL.replace(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2}))?Z?$/, (_m, y, mo, d, _t, h = '23', mi = '59', s = '59') => `${y}-${mo}-${d}T${h}:${mi}:${s}Z`)) : Infinity;
  const out: number[] = [];
  if (rule.FREQ !== 'DAILY' && rule.FREQ !== 'WEEKLY') return [first];
  const days = rule.FREQ === 'WEEKLY' && rule.BYDAY ? rule.BYDAY.split(',').map(day => WEEKDAYS.indexOf(day.slice(-2))) : null;
  const weekOf = (at: number) => Math.floor((at / DAY + 4) / 7); // weeks since a Sunday
  for (let at = first; at < to && at <= until && out.length < count; at += DAY) {
    const dayGap = Math.round((at - first) / DAY);
    const fits =
      rule.FREQ === 'DAILY'
        ? dayGap % interval === 0
        : (weekOf(at) - weekOf(first)) % interval === 0 && (days ? days.includes(new Date(at).getUTCDay()) : new Date(at).getUTCDay() === new Date(first).getUTCDay());
    if (fits) out.push(at);
  }
  return out;
}
