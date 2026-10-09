# Calendar

A handler with the `calendar` host grant reads and writes the caller's
calendar on Brydio's event layer: Brydio's own events and the mirrors of
each person's Google, Outlook and CalDAV calendars, in one model. Everything
is done **as the caller**. The app never talks to Google or Microsoft; a
Brydio event also goes to the caller's default Google calendar when they have
one.

```json
"grants": { "tools": ["*"], "collections": ["*"], "host": ["calendar"] }
```

## Read

```ts
const week: Handler<{ from: string; to: string }> = async ({ from, to }, { calendar }) => {
  // The caller's own events, series expanded, sorted by start. 62 days at most.
  const mine = await calendar.range({ from, to });

  // Colleagues by member id: busy-only unless they share details with the workspace.
  const team = await calendar.range({ from, to, people: ['user_ada', 'user_sam'] });

  // One project's events (CA10).
  const project = await calendar.range({ from, to, project: 'prj_web' });

  return { mine, team, project };
};

await calendar.busy({ from, to, people: ['user_ada'] }); // { people: [{ member, timeZone, busy: [{ start, end }], working: [...] }] }
await calendar.event('evt_1@2026-10-13T09:00:00.000Z'); // one occurrence, or null
await calendar.calendars(); // the caller's connected calendars: { items: [{ id, provider, name, color, primary, enabled, … }] }
```

An occurrence has `id` (`event` for a single event, `event@<original start>`
for one occurrence of a series), `on` (whose calendar it sits on), `owner`,
`start`/`end` (ISO), `allDay`, `timeZone`, `status`, `showAs`, `busyOnly`,
`project`, `room`, `call`, `recurring`, `rrule` and `editable` (the caller
may change it). A `busyOnly` occurrence has no `title`, `location`,
`attendees` or notes: the viewer may see only that the time is taken.

People are named by **user id**, the id a `member` field holds. Bots are
named by their own id (`bot`), outside guests by `email`.

## Write

`create`, `update`, `cancel` and `respond` need a write tool.

```ts
const made = await calendar.create({
  title: 'Design review',
  start: '2026-10-13T14:00:00Z',
  end: '2026-10-13T15:00:00Z',
  timeZone: 'Africa/Lagos',
  attendees: [{ member: 'user_sam' }, { email: 'guest@example.com', name: 'Guest' }],
  project: 'prj_web',
  rrule: 'FREQ=WEEKLY;BYDAY=TU', // optional; RFC 5545 without DTSTART
});

// One occurrence of a series, by its own id:
await calendar.update('evt_1@2026-10-20T14:00:00.000Z', { ...changed }, { scope: 'this' });
// The whole series:
await calendar.update('evt_1', { ...changed });

await calendar.cancel('evt_1@2026-10-27T14:00:00.000Z', { scope: 'this' });
await calendar.respond('evt_9', 'accepted'); // needs_action | accepted | tentative | declined
```

Only the event's owner changes or cancels it. `respond` is for a Brydio
person invited to a Brydio event; a series answers as a whole.

## Refusals

Each ends with a code: `(not_granted)` without the grant, `(read_tool)` for a
write from a read tool, `(calendar_invalid)`, `(calendar_not_found)`,
`(calendar_forbidden)` and `(calendar_unavailable)`. A visitor on a public
page never reaches the calendar.

## Testing

The fake host keeps an in-memory calendar with the same rules for sharing,
owners and invitations:

```ts
const run = await runHandler(week, { from, to }, {
  manifest,
  caller: { userId: 'user_ada' },
  calendar: {
    events: [{ id: 'evt_1', owner: 'user_ada', title: 'Standup', start: '…', end: '…', rrule: 'FREQ=DAILY;COUNT=5' }],
    people: [{ member: 'user_sam', sharing: 'details' }],
  },
});
run.calendar; // the events after the run, by id
```

The fake expands `DAILY` and `WEEKLY` rules on UTC days; Brydio expands every
rule in the event's own zone, keeping DST.
