# Reporting a security problem

An app runs other people's code inside a workspace. A hole in the SDK or in
the way Brydio draws an app's screen is not an ordinary bug, and it must not
be reported in a place where everyone can read it before we have fixed it.

## Where to send it

Email [security@brydio.app](mailto:security@brydio.app). Include the affected
package and version, what you observed, and the smallest reproduction you can
share safely. Do not include real workspace data or credentials.

Please do not open a public issue for a security problem.

## Secrets, and what an app is never given

An app that needs a credential of its own (an API key, a signing secret)
declares it by name under `secrets` in `.brydio/app.json` and asks for the
`secrets` host grant. It never ships the value: `brydio validate` and the
publish route refuse a value written beside a name. An administrator enters
the value in the app's settings, where it can be set, replaced or cleared and
is never shown again. Brydio keeps it encrypted with the workspace's key.

Only the app's own handlers read it, and only its own:

```ts
import type { Handler } from '@brydio/app/handler';

const syncInvoices: Handler = async (_input, { secrets }) => {
  const key = await secrets.get('api_key');

  if (!key) return { message: 'Set the API key in the app’s settings first.' };

  // A token the handler obtained itself can be kept for next time.
  await secrets.set('refresh_token', 'rt_…');

  return { configured: true };
};

export default syncInvoices;
```

A screen can never read a secret, another app can never read yours, and the
assistant never sees one. A value a handler holds is replaced with
`[secret]` in what it returns and in its errors, and Brydio refuses a record,
a nested tool call or a model prompt that would carry it. Test the same rules
without Brydio with `runHandler` from `@brydio/fake-host`.

No part of an app — screen, worker or handler — is ever given a Brydio
session token, a cookie, or any other credential that reaches Brydio's
backend. A handler's `caller` is a user id and an origin, and a connection's
request carries the connection's own token, added by Brydio; a handler
cannot set headers.

## What is worth reporting

- A way for an app's code to reach outside its worker: the page, the network,
  another app's data, or anything a person has not granted it.
- A way to draw something the catalogue's checks should have refused, or to
  get a tree past the host's checks.
- A way to publish, install or pin a version that should have been refused —
  an unsigned one where signing is required, one that failed review, or one
  built with an SDK outside the range.
- A way to read or change records belonging to a workspace, an instance or a
  person that the caller is not entitled to.
- A way for a screen, another app or the assistant to read an app's secret,
  or for any part of an app to obtain a Brydio session token, cookie or
  other credential.
- Anything that lets a publisher's name, signature or review state say
  something untrue about a version.

## What we will do

Read it, tell you we have it, fix it, and say when it is fixed. If the fix
changes anything a builder depends on, it goes in the changelog like any
other change — with what to do about it, not only that it happened.
