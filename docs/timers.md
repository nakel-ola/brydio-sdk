# Timers

A handler with the `timers` host grant can ask Brydio to run one of the app's
own tools later: once at a time, or on a repeat. The tool runs as the person
whose call set the timer.

```json
"grants": { "tools": ["*"], "collections": ["*"], "host": ["timers"] }
```

## Set, move and cancel

```ts
const startRound: Handler<{ id: string }> = async ({ id }, { timers }) => {
  // Once, at a time:
  await timers.set({ key: `round:${id}:3`, tool: 'start_round', input: { id }, at: '2026-10-19T08:00:00Z' });

  // On a repeat: an RFC 5545 rule with no DTSTART, read in a time zone.
  return timers.set({
    key: `round:${id}`,
    tool: 'start_round',
    input: { id },
    rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
    zone: 'Africa/Lagos',
  }); // { key, tool, next, status, … }
};

await timers.cancel(`round:${id}`); // { cancelled: true }
await timers.list(); // { items: [{ key, tool, at, rrule, zone, next, status, reason, setBy, runs, lastRunAt, lastOutcome }] }
```

- A timer's `key` is the app's own: letters, digits, `: _ . -`, up to 120.
  Setting the same key again moves that timer, and it then runs as the new
  caller.
- `tool` is one of the app's own tools (`tools.custom`). `input` is what it
  gets, up to 8 KB as JSON, and may not carry one of the app's secrets.
- `set` and `cancel` need a write tool. `list` works from any tool.
- A repeat counts from `start` (default now), in whole minutes. Its times are
  read on the wall clock of `zone` (IANA, default `UTC`), so "9:00 every
  Monday" stays 9:00 when the clocks change.

## When it runs

- It runs as the person who set it, as they are at that moment, through the
  same checks as a click on the app's screen: they are still a member, can
  still change the instance, the app is switched on and the tool is not
  blocked. Their handler sees `caller.origin === 'timer'` and
  `caller.timer` (`{ key, due }`).
- If they have left, or an admin switched the app off or blocked the tool,
  the timer is paused with a reason. Set it again to resume it.
- A tool the app no longer has (a newer version dropped it) ends the timer.
- If Brydio was down when a repeat was due, it runs once when Brydio is back,
  then keeps its times.
- Three failed runs in a row pause a repeat. A one-off goes once it has run.
- Removing the instance, or the app, removes its timers.

## Limits and codes

- 100 timers an instance, a repeat at most every 15 minutes, at most 400
  days ahead, 20 runs a minute an instance (the rest wait a minute).
- Codes: `timer_invalid`, `timer_too_often`, `timer_too_far`,
  `timer_too_large`, `timer_unknown_tool`, `timer_limit`,
  `timer_unavailable`, `not_granted`, `read_tool`.

## In tests

```ts
const run = await runHandler(startRound, { id: 'f1' }, { manifest, caller: { userId: 'ada' } });
run.timers.get('round:f1'); // as it stands after the run, with its input

// A timer's run:
await runHandler(start, { id: 'f1' }, { caller: { userId: 'ada', origin: 'timer', role: 'member', timer: { key: 'round:f1', due: '2026-10-19T08:00:00Z' } } });
```

The fake host checks what Brydio checks on `set`, but does not expand a rule:
a repeat's `next` is its start.
