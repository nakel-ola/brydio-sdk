import { mount, text } from '@brydio/app';
import { askAbout } from '@brydio/app/ask';

/*
 * Asks about something the app keeps no record of (A8-F02-S03): a pull
 * request it fetched and deliberately stores nothing of. The words are the
 * whole message, and there is no attachment — so `notes` is untouched, even
 * though this app has a `notes` collection with a record in it.
 */
void mount(async root => {
  try {
    const { drafted } = await askAbout(null, 'What is this pull request doing to the login page?');

    root.append(text({ text: `no record: ${drafted ? 'drafted' : 'not drafted'}` }));
  } catch (error) {
    root.append(text({ text: `no record: ${error instanceof Error ? error.message : String(error)}` }));
  }
});
