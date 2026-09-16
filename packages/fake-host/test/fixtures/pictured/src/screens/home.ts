import { data, heading, mount, text } from '@brydio/app';

// Draws the sample notes, and says where it was drawn.
void mount(async (root, context) => {
  const page = await data.list<{ title: string }>('notes', { sort: { field: 'createdAt', dir: 'asc' } });

  root.append(heading({ text: 'Notes', level: 1 }), text({ text: `${context.size.width} ${context.theme} ${context.placement.kind}` }), ...page.items.map(note => text({ text: note.title })));
});
