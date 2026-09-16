import {
  button,
  card,
  data,
  emptyState,
  heading,
  input,
  mount,
  stack,
  text,
  toast,
  tools,
  type RemoteElement,
} from '@brydio/app';

/**
 * The same checklist as the Preact template, with no framework: the screen is
 * built once from Brydio's element functions, and the list is redrawn by
 * handing the SDK its new children, which it compares with the old ones and
 * sends only the difference.
 *
 * As in the Preact template, a write never changes the list by hand. The
 * watch on `items` reads the list again once the change is saved.
 */

interface Item {
  id: string;
  version: number;
  title: string;
  done: boolean;
  note?: string;
}

await mount(async (root, context) => {
  let title = '';
  const problem = stack({ gap: '1' });
  const list = stack({ gap: '3' });

  const say = (message: string | null) => problem.replaceChildren(...(message ? [text({ text: message, tone: 'danger' })] : []));

  const write = async (tool: string, input: Record<string, unknown>): Promise<boolean> => {
    try {
      await tools.call(tool, input);
      say(null);

      return true;
    } catch (failure) {
      say(failure instanceof Error ? failure.message : String(failure));

      return false;
    }
  };

  const save: RemoteElement<'bry-button'> = button({ label: 'Save', variant: 'primary', disabled: true, onPress: () => void add() });
  const field: RemoteElement<'bry-input'> = input({
    label: 'New item',
    placeholder: 'Something to do',
    value: '',
    onChange: event => {
      title = event.detail.value;
      save.setAttribute('disabled', !title.trim());
    },
    onSubmit: () => void add(),
  });

  const add = async () => {
    const words = title.trim();

    if (!words) return;
    if (await write('create_item', { title: words, done: false })) {
      title = '';
      field.setAttribute('value', '');
      save.setAttribute('disabled', true);
      toast('Added.', 'success');
    }
  };

  const row = (item: Item) =>
    card(
      { padding: '3' },
      stack(
        { direction: 'row', gap: '2', justify: 'between', align: 'center' },
        text({ text: item.title, tone: item.done ? 'muted' : 'default' }),
        button({
          label: item.done ? 'Undo' : 'Done',
          variant: 'secondary',
          size: 'sm',
          onPress: () => void write('update_item', { id: item.id, version: item.version, done: !item.done }),
        }),
      ),
    );

  const redraw = async () => {
    try {
      const page = await data.list<Item>('items', { limit: 200 });

      list.replaceChildren(
        ...(page.items.length ? page.items.map(row) : [emptyState({ title: 'Nothing to do yet', text: 'Add the first item above.' })]),
      );
    } catch (failure) {
      say(failure instanceof Error ? failure.message : String(failure));
    }
  };

  root.append(
    stack(
      { gap: '3' },
      heading({ level: 1, text: context.instance.name || 'Checklist' }),
      stack({ direction: 'row', gap: '2', align: 'end' }, field, save),
      problem,
      list,
    ),
  );

  data.watch('items', () => void redraw());
  await redraw();
});
