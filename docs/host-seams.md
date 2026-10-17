# Chat cards, other apps' tools, the directory and webhooks

Four things a handler can ask Brydio for, each behind its own grant. Every
refusal is an error whose message ends with its code in brackets, such as
`… (chat_cannot_post)`, because a screen only ever sees the words. A visitor
on a public page can use none of them (`not_for_visitors`).

## Post a card in a chat (`chat`)

```json
{
  "placements": [{ "kind": "chat-card", "key": "answer-card", "screen": "card" }],
  "grants": { "host": ["chat"] }
}
```

`chat` is not `chats`. `chats` lets the typed API reach the person's assistant
conversations. `chat` lets a handler post in a workspace room.

```ts
const share: Handler<{ room: string; form: string }> = ({ room, form }, { chat }) =>
  chat.post({ room, text: 'Please answer the team survey', card: { placement: 'answer-card', route: `/forms/${form}` } });
```

- Only a write tool may post. The caller must be able to post in the room
  themselves. In an announcement channel, that means its managers and the
  people it names.
- The app's own member writes the message. Brydio makes that member the first
  time the instance posts and adds it to the room. In an announcement channel,
  a manager must name it as a poster (`chat_app_not_poster`).
- A direct message takes a post too. Name it by `room`, or pass `to` (a
  member's user id) instead and the post goes in the caller's DM with them,
  opened as the caller would open it. The DM keeps its name and face: the
  app's member never counts as one of its people.
- `text` is plain text of up to 2000 characters. A post never tags anyone:
  `@channel` and `@here` stay as plain text.
- `card` names a `chat-card` placement by key and a route (default `/`).
  People who can open this instance see that screen in the message, at the
  message column's width and 420 pixels high. Its `placement.kind` is
  `chat-card` and its `placement.id` is `card:<key>`. Everyone else sees one
  plain line instead.
- An instance can post 30 times a minute.
- `chat.rooms(query?)` lists the caller's own rooms so a screen can let
  someone pick where to post. Each one is `{ id, name, kind: 'channel' | 'dm'
  | 'group', canPost }`. It returns at most 50, leaves out archived rooms, and
  when `query` is given keeps only the rooms whose names contain it.
  `canPost` is whether `chat.post` would take this app's post there. It needs
  the `chat` grant, and a read tool may call it.
- Codes: `chat_cannot_post`, `chat_app_not_poster`, `chat_card_unknown`,
  `chat_text_too_long`, `chat_invalid`, `chat_rate_limited`, `not_granted`,
  `read_tool`.

A `chat-card` placement has no `sizes`, `children` or `settings`
(`placement_chat_card_shape`), and nobody adds it anywhere by hand.

## A panel on a person's profile

Declare a `person-profile` placement and Brydio draws its screen on every
person's Directory profile, for each viewer who can read the instance; anyone
else sees nothing of it. The screen sees `placement.kind === 'person-profile'`,
`placement.id` `profile:<key>:<personId>` and `placement.personId`, the workspace user id
of the person whose profile it is. Everything it reads is read as the viewer:
a tool that refuses them refuses on the profile too, so say so in the panel
rather than drawing an empty one.

```json
{ "placements": [{ "kind": "person-profile", "key": "hr-card", "screen": "profile", "label": "HR" }] }
```

A `person-profile` placement has no `sizes`, `children` or `settings`
(`placement_person_profile_shape`), and nobody adds it anywhere by hand.

## Call another app's tool

Name the tool the way the assistant knows it, `<slug>__<tool>`, exactly, in
`grants.tools`. `*` covers only the app's own tools.

```json
{ "grants": { "tools": ["*", "tasks__create_numbered_issue"] } }
```

```ts
const file: Handler<{ title: string; project?: string }> = (input, { tools }) =>
  tools.call('tasks__create_numbered_issue', input);
```

Brydio picks the other app's instance the way the assistant does. If
`input.project` names a project that has its own instance, or shows one, it
uses that one. Otherwise it uses the workspace's one. The tool runs as the
caller, so every check that app makes of a person still applies. It also
needs that app's grants and admin switches. Only a write tool can call a
write. Calls nest at most three deep, as any `tools.call` does. Naming the
app itself is refused when you publish (`grant_tool_cross_app_self`) and
when the handler runs.

Codes: `cross_app_not_granted`, `cross_app_self`, `cross_app_unknown`,
`cross_app_no_instance`, `cross_app_no_tool`, `cross_app_blocked`, `read_tool`.

## Read the directory (`directory`)

```ts
const prefill: Handler<{ user: string }> = async ({ user }, { directory }) => {
  const person = await directory.profile(user); // { id, name, email, title, team, manager } or null
  const groups = await directory.groups(); // [{ id, name, kind }]
  const sales = await directory.membersOf(groups.find(one => one.name === 'Sales')!.id); // user ids
  return { person, sales };
};
```

Ids are user ids, the same ones member fields hold. If a person keeps a
field to themselves, it comes back `null` to everyone but them. A bot, a
guest or someone who has left has no profile here. On a screen,
`host.profile()` returns the viewer's own profile and never anyone else's.

## Send a webhook (`webhooks`)

```ts
const notify: Handler<{ url: string; answer: unknown }> = ({ url, answer }, { webhooks }) =>
  webhooks.send({ url, body: { type: 'form.answered', answer } }); // { status }
```

- Only a write tool may send, and only to an `https` address. Brydio refuses
  a private, local or cloud metadata address before anything is sent, and the
  same goes for a redirect to one.
- The body is sent as JSON, up to 64 KB. The receiver has 10 seconds to
  answer. Only its status comes back to the app. An instance can send 60 a
  minute.
- Each request carries `X-Brydio-Instance: <instance id>` and
  `X-Brydio-Signature: sha256=<hex HMAC-SHA256 of the exact body>`. The key
  is the instance's signing secret, which a workspace admin reads from
  `GET /apps/instances/<id>/webhook-secret`. Brydio stores neither the
  address nor the body.
- Codes: `webhook_not_https`, `webhook_private_address`,
  `webhook_url_refused`, `webhook_too_large`, `webhook_invalid`,
  `webhook_timeout`, `webhook_failed`, `webhook_rate_limited`,
  `not_granted`, `read_tool`.

## In tests

`runHandler` in `@brydio/fake-host` gives the handler all four, with the same
refusals and codes:

```ts
const run = await runHandler(share, { room: 'room_1', form: 'f1' }, {
  manifest,
  chat: { rooms: [{ id: 'room_1', name: 'survey', kind: 'channel', canPost: true }] },
  directory: { profiles: [ada], groups: [{ id: 'team_web', name: 'Web', kind: 'team', members: ['user_ada'] }] },
  webhook: () => 202,
});
run.posts; // what it posted
run.webhooks; // what it sent, signed with `webhookSecret` (default `whsec_test`)
```

A screen under the fake host gets `host.profile()` from the `profile` option.

## Read dashboard metrics (`metrics`)

An app with `grants.host: ["metrics"]` can read dashboard numbers through
`client.metrics.list()` and `client.metrics.get(id)` in a handler. Both work
from read tools. Visitors cannot use them.

```ts
const read: Handler<{ metric: string }> = async ({ metric }, { metrics }) => {
  const observed = await metrics.get(metric);
  if (observed.status !== 'ok' || observed.value === null) {
    return { available: false, reason: observed.error ?? 'No value yet' };
  }
  return { available: true, value: observed.value, observedAt: observed.observedAt };
};
```

`list` returns `{ metrics: MetricSummary[] }`, each with `id`, `name`,
`unit`, `target`, `ownerId`, `dashboardId` and `revision`. `get` returns that
definition with `value`, `previous`, `change`, `range`, `source`, `history`,
`observedAt`, `status` and an optional `error`. Numeric values may be null.
A failed source stays null rather than becoming zero.

Reads check current dashboard and source permissions as the caller. A timer
reads as its setter. History belongs to this reader. `get` reads the source
live, so it is not a read of somebody else's cached Home number. Missing
access refuses; a host without dashboards answers `metrics_unavailable`.
The app must decide where a caller's metric may be shared before saving it
in a record others can read.

The fake host takes `metrics: MetricRead[]` fixtures, already limited to the
caller's visible metrics. Omit the fixture to test an unavailable service;
an empty array means a working service with no visible metrics.

## Co-partner reminders

A notice may include `delivery: 'co-partner'`. It uses the same `notify`
grant and notification policy. `notify.send` queues it durably and returns
`{ notified: true, held: true }`; `notify.at` keeps its scheduled result.
At delivery, Brydio rechecks record access and notification preferences.
The co-partner waits through quiet hours, pauses and its shared daily cap.
If the recipient's co-partner is off, the ordinary notification is the fallback.

For a reminder to the timer's setter, use `notify.at` with a stable key and
`at` set to now. `notify.send` retains its usual self-notification refusal.
A scheduled reminder to oneself is allowed for `reminder`, `due_soon` and
`overdue`. Reusing the key replaces its pending notice.
