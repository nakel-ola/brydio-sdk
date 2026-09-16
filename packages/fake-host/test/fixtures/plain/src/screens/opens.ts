import { HostError, host, mount, navigate, text } from '@brydio/app';

// A screen that asks Brydio to open things, and says what came of each.
void mount(async root => {
  const said = async (to: Parameters<typeof navigate>[0]) => {
    try {
      const { opened } = await navigate(to);

      root.append(text({ text: `${to.kind} ${to.id}: ${opened ? 'opened' : 'not opened'}` }));
    } catch (error) {
      root.append(text({ text: `${to.kind} ${to.id}: ${error instanceof HostError ? error.message : String(error)}` }));
    }
  };

  root.append(text({ text: 'Opening' }));
  host.subscribe(context => {
    if (context.selection) root.append(text({ text: `selected ${JSON.stringify(context.selection)}` }));
  });
  await said({ kind: 'chat', id: 'conv_1' });
  await said({ kind: 'item', id: 'note_gone' });
  await said({ kind: 'url' as never, id: 'https://example.com' });
  await said({ kind: 'item', id: 'note_a' });
});
