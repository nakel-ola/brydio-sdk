import { tools, toast } from '@brydio/app';
import { mount, useHost, useList, useState } from '@brydio/app/preact';

/**
 * A checklist: a field to add an item, and every item as a card you can
 * tick off. The starting point `brydio create` copies, so it uses a little of
 * everything a screen can: where it is shown (`useHost`), a collection read
 * that follows changes (`useList` with `watch`), writes through the app's own
 * tools, and Brydio's toast.
 *
 * The list is never changed by hand after a write. The write goes through
 * the tool, the person allows it, and the watch reads the list again, so what
 * you see is what was saved, whoever saved it.
 */

interface Item {
  id: string;
  version: number;
  title: string;
  done: boolean;
  note?: string;
}

function Home() {
  const host = useHost();
  const items = useList<Item>('items', { limit: 200 }, { watch: true });
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const write = async (tool: string, input: Record<string, unknown>): Promise<boolean> => {
    try {
      await tools.call(tool, input);
      setError(null);

      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));

      return false;
    }
  };

  const add = async () => {
    const words = title.trim();

    if (!words) return;
    if (await write('create_item', { title: words, done: false })) {
      setTitle('');
      toast('Added.', 'success');
    }
  };

  return (
    <bry-stack gap="3">
      <bry-heading level={1} text={host.instance.name || 'Checklist'} />
      <bry-stack direction="row" gap="2" align="end">
        <bry-input
          label="New item"
          placeholder="Something to do"
          value={title}
          onChange={event => setTitle(event.detail.value)}
          onSubmit={() => void add()}
        />
        <bry-button label="Save" variant="primary" disabled={!title.trim()} onPress={() => void add()} />
      </bry-stack>
      {items.error && <bry-text tone="danger" text={items.error.message} />}
      {error && <bry-text tone="danger" text={error} />}
      {items.items.length === 0 && !items.loading && <bry-empty-state title="Nothing to do yet" text="Add the first item above." />}
      {items.items.map(item => (
        <bry-card key={item.id} padding="3">
          <bry-stack direction="row" gap="2" justify="between" align="center">
            <bry-text text={item.title} tone={item.done ? 'muted' : 'default'} />
            <bry-button
              label={item.done ? 'Undo' : 'Done'}
              variant="secondary"
              size="sm"
              onPress={() => void write('update_item', { id: item.id, version: item.version, done: !item.done })}
            />
          </bry-stack>
        </bry-card>
      ))}
    </bry-stack>
  );
}

void mount(Home);
