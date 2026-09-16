import { data, mount, text } from '@brydio/app';

// A screen that watches its notes: the count follows every change, whoever made it.
void mount(async root => {
  const count = text({ text: 'Counting…' });
  const heard = text({ text: 'Nothing changed yet.' });
  const show = async () => {
    const page = await data.list<{ title: string }>('notes');

    count.setAttribute('text', `${page.items.length} notes: ${page.items.map(note => note.title).join(', ')}`);
  };

  root.append(count, heard);

  data.watch(
    'notes',
    changes => {
      heard.setAttribute('text', changes.map(change => `${change.op} ${change.id} v${change.version}`).join('; '));
      void show();
    },
    error => heard.setAttribute('text', `Ended: ${error.message}`),
  );
  data.watch('elsewhere', () => {}, error => root.append(text({ text: `Elsewhere: ${error.message}` })));

  await show();
});
