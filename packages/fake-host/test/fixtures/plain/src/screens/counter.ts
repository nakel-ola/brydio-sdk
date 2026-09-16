import { HostError, button, data, mount, stack, text, toast, tools } from '@brydio/app';

// A screen written with the plain API: a count of notes, and a button that adds one.
void mount(async root => {
  const count = text({ text: 'Counting…' });
  const show = async () => {
    const page = await data.list<{ title: string }>('notes');

    count.setAttribute('text', `${page.items.length} notes`);
  };

  root.append(
    stack(
      { gap: '2' },
      count,
      button({
        label: 'Add a note',
        onPress: async () => {
          try {
            await tools.call('create_note', { title: 'Hello' });
            toast('Added a note.', 'success');
          } catch (error) {
            count.setAttribute('text', error instanceof HostError ? `Refused: ${error.message}` : String(error));

            return;
          }

          await show();
        },
      }),
    ),
  );

  await show();
});
