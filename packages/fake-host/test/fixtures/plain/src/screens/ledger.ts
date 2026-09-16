import { HostError, ToolError, button, data, mount, stack, text, tools } from '@brydio/app';

// A screen that pages through every note, writes, and watches: each line says what happened.
void mount(async root => {
  const pages = text({ text: 'Reading…' });
  const heard = text({ text: 'Nothing changed yet.' });
  const said = text({ text: 'Nothing written yet.' });
  const attempt = async (what: () => Promise<unknown>) => {
    try {
      await what();
      said.setAttribute('text', 'Written.');
    } catch (error) {
      const code = error instanceof ToolError ? error.code : error instanceof HostError ? error.code : 'other';

      said.setAttribute('text', `Refused (${code}): ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  root.append(
    stack(
      { gap: '2' },
      pages,
      heard,
      said,
      button({ label: 'Add', onPress: () => void attempt(() => tools.call('create_note', { title: 'Added here' })) }),
      button({ label: 'Rename from version 1', onPress: () => void attempt(() => tools.call('update_note', { id: 'note_0', version: 1, title: 'Renamed' })) }),
      button({ label: 'Delete', onPress: () => void attempt(() => tools.call('delete_note', { id: 'note_1' })) }),
    ),
  );

  data.watch('notes', changes => heard.setAttribute('text', changes.map(change => `${change.op} ${change.id} v${change.version}`).join('; ')));

  let cursor: string | undefined;
  const sizes: number[] = [];

  do {
    const page = await data.list('notes', { limit: 50, sort: { field: 'createdAt', dir: 'asc' }, ...(cursor ? { cursor } : {}) });

    sizes.push(page.items.length);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  pages.setAttribute('text', `read ${sizes.reduce((sum, size) => sum + size, 0)} in pages of ${sizes.join(', ')}`);
});
