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

Run the app's tests with `brydio test`. The command builds once, then runs its
`*.test.ts` files against that build.

This package is MIT licensed. While the SDK is `0.x`, a minor version may
contain a breaking change. Read the repository changelog before upgrading.
