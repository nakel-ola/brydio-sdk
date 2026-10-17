# People

Handlers use `client.people.call<T>(operation, input?)` with the `people` host
grant. `T` describes the expected result; it does not validate the host's reply.
The native host validates the operation, input, current caller and record access.
The `directory` grant does not authorize People operations.

```ts
import type { Handler } from '@brydio/app/handler';

export default (async (_input, client) => {
  const context = await client.people.call<{
    userId: string;
    isHr: boolean;
    hrGroupId: string | null;
    hrReaders: string[];
    people: Array<{
      id: string;
      principalId: string;
      name: string;
      title: string | null;
      team: string | null;
      manager: { id: string; name: string } | null;
    }>;
  }>('context');
  return { userId: context.userId, isHr: context.isHr };
}) satisfies Handler;
```

`context`, `listPeople` and `whoOut` are read operations. Every other operation requires
a custom tool declared with `write: true`, including `configure`,
`updateWorkProfile`, `applyApprovedLeave`, `cancelLeave` and `welcomes`.
`whoOut({ from, to })` returns `{ items: [{ person, name, from, to, cover }] }`
for approved leave over a maximum 93-day range. The host omits private reasons
and attachments. Unknown operations are never assumed to be reads. The host remains responsible
for operation-specific input validation, HR authority and approval checks.
An app cannot authorize itself by supplying a user ID or `isHr` in its input.
Visitors cannot use this capability.

HR-private salary, contracts, emergency contacts and documents belong in
records readable only by HR admins and the person. Check access again for
assistant tools, searches and attachments. A manager relationship alone does
not grant access to those records.

## Fake-host fixtures

People is unavailable by default, with `people_unavailable`. A fixture supplies
only results already authorized as the test caller. The fake host enforces the
People grant, visitor refusal, secret forwarding restrictions and the fixed
read/write operation boundary. It does not simulate native HR authorization,
approval, Calendar or Out of office effects.

```ts
import { runHandler } from '@brydio/fake-host';
import context from './handlers/context';

const run = await runHandler(context, {}, {
  manifest: { name: 'People', grants: { host: ['people'] } },
  caller: { userId: 'person_1', role: 'member', origin: 'screen' },
  write: false,
  people: {
    results: {
      context: { userId: 'person_1', isHr: false, hrGroupId: null, hrReaders: [], people: [] },
    },
  },
});
```

For input-dependent behavior, use
`people: { call: async (operation, input) => result }`. That function takes
precedence over `results`. Otherwise only an own key in `results` supplies an
answer, including an explicit `null` or `false`. A missing operation fails
with `people_unavailable`. Calls are recorded as `people.call` with the
operation and input in `run.calls`.
