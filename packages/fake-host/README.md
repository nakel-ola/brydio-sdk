# @brydio/fake-host

A local Brydio host for screen tests. It runs a built screen in a worker,
checks the same tree rules and budgets, answers tools from fixtures, and lets a
test inspect or act on the drawn tree.

```ts
import { afterEach, expect, test } from 'bun:test';
import { testApp } from '@brydio/fake-host';

const app = await testApp(import.meta.dir);
afterEach(() => app.stopAll());

test('adds an item', async () => {
  const host = app.start('home', { fixtures: { items: [] } });

  await host.mounted();
  host.press(await host.waitFor(() => host.byText('Add item')));
  expect(host.calls.map(call => call.tool)).toEqual(['create_item']);
});
```

A custom tool's handler is tested the same way, without a worker: `runHandler`
gives it the client Brydio gives it, with the same refusals. Secrets are only
the names the manifest declares, need the `secrets` grant, and a value the
handler held comes back as `[secret]`, as Brydio would pass it on.

```ts
import { runHandler } from '@brydio/fake-host';
import listInvoices from '../src/handlers/list_invoices.ts';
import manifest from '../.brydio/app.json';

test('asks for the key before listing', async () => {
  const run = await runHandler(listInvoices, {}, { manifest, secrets: {} });

  expect(run.result).toEqual({ message: 'Set the API key in the app’s settings first.' });
});
```

Run the app's tests with `brydio test`. The command builds once, then runs its
`*.test.ts` files against that build.

This package is MIT licensed. While the SDK is `0.x`, a minor version may
contain a breaking change. Read the repository changelog before upgrading.
