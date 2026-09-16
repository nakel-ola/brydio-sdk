import { mount, stack, text } from '@brydio/app';

// Tries the network and storage, and draws what it was told.
void mount(root => {
  const attempts: [string, () => unknown][] = [
    ['fetch', () => fetch('https://example.com')],
    ['Worker', () => new Worker('x.js')],
    ['WebSocket', () => new WebSocket('wss://example.com')],
  ];

  root.append(
    stack(
      null,
      ...attempts.map(([name, attempt]) => {
        try {
          attempt();

          return text({ text: `${name} worked` });
        } catch (error) {
          return text({ text: error instanceof Error ? error.message : String(error) });
        }
      }),
    ),
  );
});
