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
  /** Booking links' hosts who said yes, by link key (CA05). */
  offers?: Record<string, string[]>;
  /** Bookings already made, e.g. to test a manage link. */
  bookings?: FakeBooking[];
}

/** A booking as the fake host keeps it (CA05), with the secret Brydio would only ever email. */
export interface FakeBooking {
  id: string;
  link: string;
  host: string;
  event: string;
  token: string;
  status: 'booked' | 'cancelled';
  guest: { email: string; name?: string };
  createdAt: string;
}

/** The booking state a run starts with and ends with. */
export interface FakeBookingState {
  offers: Map<string, Set<string>>;
  bookings: Map<string, FakeBooking>;
}

export const bookingStateOf = (options: FakeCalendarOptions): FakeBookingState => ({
  offers: new Map(Object.entries(options.offers ?? {}).map(([link, members]) => [link, new Set(members)])),
  bookings: new Map((options.bookings ?? []).map(one => [one.id, { ...one }])),
});

const MAX_RANGE_DAYS = 62;
const DAY = 86_400_000;
const RESPONSES: CalendarResponse[] = ['needs_action', 'accepted', 'tentative', 'declined'];

const refuse = (code: string, words: string): never => {
  throw new Error(`${words} (${code})`);
};

/** The calendar a handler gets from the fake host, over `events`. */
export function fakeCalendar(
  options: FakeCalendarOptions,
  callerId: string,
  events: Map<string, FakeCalendarEvent>,
  state: FakeBookingState = bookingStateOf(options),
  visitor = false
): HandlerCalendar {
  let serial = 0;
  const people = new Map((options.people ?? []).map(one => [one.member, one]));
  const members = new Set(options.members ?? [callerId, ...people.keys(), ...Object.values(options.offers ?? {}).flat(), ...[...events.values()].flatMap(one => [one.owner, ...(one.attendees ?? []).flatMap(a => (a.member ? [a.member] : []))])]);

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
    async offer(query) {
      if (visitor) refuse('calendar_forbidden', 'Only a member says yes to being booked.');
      const link = linkKey(query.link);
      const hosts = state.offers.get(link) ?? new Set<string>();
      if (query.on === false) hosts.delete(callerId);
      else hosts.add(callerId);
      state.offers.set(link, hosts);
      return { link, offered: query.on !== false };
    },
    async offers(query) {
      const link = linkKey(query.link);
      return { link, members: [...(state.offers.get(link) ?? [])].sort() };
    },
    async free(query) {
      const link = linkKey(query.link);
      const { from, to } = span(query);
      const hosts = [...(state.offers.get(link) ?? [])].filter(one => !query.people || query.people.includes(one));
      const mine = [...state.bookings.values()].filter(one => one.link === link && one.status === 'booked');
      return {
        people: hosts.map(host => ({
          member: host,
          timeZone: personOf(host).timeZone,
          busy: occurrences(from, to, [host])
            .filter(o => o.showAs !== 'free')
            .map(o => ({ start: o.start, end: o.end })),
          working: [],
          booked: mine.filter(one => one.host === host).flatMap(one => (events.get(one.event) ? [events.get(one.event)!.start] : [])).sort(),
          lastBookedAt: mine.filter(one => one.host === host).map(one => one.createdAt).sort().at(-1) ?? null,
        })),
      };
    },
    async book(input) {
      const link = linkKey(input.link);
      if (!state.offers.get(link)?.has(input.host)) refuse('calendar_not_offered', 'That person can’t be booked through this link.');
      const start = Date.parse(input.start);
      const end = Date.parse(input.end);
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) refuse('calendar_invalid', 'A booking runs forward, a day at most.');
      const before = (input.buffer?.before ?? 0) * 60_000;
      const after = (input.buffer?.after ?? 0) * 60_000;
      if (occurrences(start - before, end + after, [input.host]).some(o => o.showAs !== 'free')) refuse('calendar_taken', 'That time was just taken. Pick another.');
      const email = String(input.guest?.email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+$/.test(email)) refuse('calendar_invalid', 'guest.email is the booker’s email address.');
      const event = `evt_fake_${++serial}`;
      events.set(event, {
        id: event,
        owner: input.host,
        title: input.title,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        timeZone: input.timeZone,
        description: input.description ?? null,
        location: input.location ?? null,
        attendees: [{ kind: 'email', email, ...(input.guest.name ? { name: input.guest.name } : {}), response: 'accepted' }],
      });
      const id = `bkg_fake_${++serial}`;
      state.bookings.set(id, { id, link, host: input.host, event, token: `tok_${id}_secret_secret`, status: 'booked', guest: { email, ...(input.guest.name ? { name: input.guest.name } : {}) }, createdAt: new Date().toISOString() });
      return { booking: id, event, host: input.host, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
    },
    async booking(query) {
      const found = [...state.bookings.values()].find(one => one.token === query?.token);
      if (!found) return null;
      const event = events.get(found.event);
      return {
        booking: found.id,
        link: found.link,
        host: found.host,
        status: found.status,
        start: event?.start ?? null,
        end: event?.end ?? null,
        timeZone: event?.timeZone ?? null,
        title: event?.title ?? null,
      };
    },
    async rebook(change) {
      const found = [...state.bookings.values()].find(one => one.token === change?.token);
      if (!found || found.status !== 'booked' || !events.get(found.event)) refuse('calendar_not_found', 'That booking is no longer there.');
      if (!state.offers.get(found!.link)?.has(found!.host)) refuse('calendar_not_offered', 'That person can’t be booked through this link any more.');
      const start = Date.parse(change.start);
      const end = Date.parse(change.end);
      const clash = occurrences(start, end, [found!.host]).some(o => o.event !== found!.event && o.showAs !== 'free');
      if (clash) refuse('calendar_taken', 'That time was just taken. Pick another.');
      events.set(found!.event, { ...events.get(found!.event)!, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      return { booking: found!.id, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
    },
    async unbook(query) {
      const found = [...state.bookings.values()].find(one => one.token === query?.token);
      if (!found || found.status !== 'booked') refuse('calendar_not_found', 'That booking is no longer there.');
      events.delete(found!.event);
      found!.status = 'cancelled';
      return { booking: found!.id, cancelled: true as const };
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

function linkKey(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9:_.-]{1,120}$/.test(raw)) refuse('calendar_invalid', 'link is the app’s own key for the booking link (letters, digits, : _ . -, up to 120).');
  return raw as string;
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
