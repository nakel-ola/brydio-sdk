import { data, heading, mount, text } from '@brydio/app';

// Waits longer than a 25 ms quiet moment before asking for its data, the way a
// screen does on a busy machine. A capture that took the first quiet moment as
// "finished" pictured this screen with nothing on it.
void mount(async root => {
  await new Promise(resolve => setTimeout(resolve, 80));

  const page = await data.list<{ title: string }>('notes', { sort: { field: 'createdAt', dir: 'asc' } });

  root.append(heading({ text: 'Slow notes', level: 1 }), ...page.items.map(note => text({ text: note.title })));
});
