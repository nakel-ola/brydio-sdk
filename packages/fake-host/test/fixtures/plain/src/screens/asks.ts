import { mount, text } from '@brydio/app';
import { askAbout } from '@brydio/app/ask';

// Asks about a note, then about one that isn't there, and says what came of each.
void mount(async root => {
  for (const [id, words] of [['note_a', 'What is left to do on this?'], ['note_gone', 'And this?']] as const) {
    try {
      const { drafted } = await askAbout({ collection: 'notes', id, title: `Note ${id}` }, words);

      root.append(text({ text: `${id}: ${drafted ? 'drafted' : 'not drafted'}` }));
    } catch (error) {
      root.append(text({ text: `${id}: ${error instanceof Error ? error.message : String(error)}` }));
    }
  }
});
