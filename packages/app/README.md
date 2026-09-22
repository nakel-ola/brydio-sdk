# @brydio/app

The runtime a Brydio screen uses to draw a catalogue tree and call its tools,
data, navigation, toast, and host context bridge.

```tsx
import { tools } from '@brydio/app';
import { mount } from '@brydio/app/preact';

function Home() {
  return (
    <bry-button
      label="Add item"
      onPress={() => tools.call('create_item', { title: 'New item' })}
    />
  );
}

void mount(Home);
```

The worker has no DOM, network, cookies, or storage. Brydio draws every
element and checks every call. Read the
[bridge reference](https://github.com/nakel-ola/brydio-sdk/blob/main/docs/bridge.md)
and the [catalogue](https://github.com/nakel-ola/brydio-sdk/blob/main/docs/elements.md)
before adding a screen.

A custom tool's handler, which Brydio runs on its side, is typed with
`import type { Handler } from '@brydio/app/handler'`: its data, tools,
connections, model and the app's own secrets (`secrets.get`, `secrets.set`).
A screen has no way to read a secret, and no part of an app is given a Brydio
credential. Read the
[security page](https://github.com/nakel-ola/brydio-sdk/blob/main/docs/security.md).

This package is MIT licensed. While the SDK is `0.x`, a minor version may
contain a breaking change. Read the repository changelog before upgrading.
