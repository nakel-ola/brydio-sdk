import { tools, toast } from '@brydio/app';
import { mount, useList, useState } from '@brydio/app/preact';

/**
 * A checklist: every item as a card, a button to tick it off, and one to add
 * an item. The starting point `brydio` apps are copied from, so it uses a
 * little of everything a screen can: reading a collection, writing through
 * its tools, and saying so in Brydio's toast.
 */

interface Item {
  id: string;
  version: number;
  title: string;
  done: boolean;
}

function Home() {
  const items = useList<Item>('items', { limit: 200 });
  const [error, setError] = useState<string | null>(null);

  const write = async (tool: string, input: Record<string, unknown>) => {
    try {
      await tools.call(tool, input);
      setError(null);
      await items.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <bry-stack gap="3">
      <bry-heading level={1} text="Checklist" />
      {items.error && <bry-text tone="danger" text={items.error.message} />}
      {error && <bry-text tone="danger" text={error} />}
      {items.items.map(item => (
        <bry-card key={item.id} padding="3">
          <bry-stack direction="row" gap="2" justify="between" align="center">
            <bry-text text={item.title} tone={item.done ? 'muted' : 'default'} />
            <bry-button
              label={item.done ? 'Undo' : 'Done'}
              variant="secondary"
              size="sm"
              onPress={() => write('update_item', { id: item.id, version: item.version, done: !item.done })}
            />
          </bry-stack>
        </bry-card>
      ))}
      <bry-button
        label="Add an item"
        variant="primary"
        onPress={async () => {
          await write('create_item', { title: 'Something to do', done: false });
          toast('Added.', 'success');
        }}
      />
    </bry-stack>
  );
}

void mount(Home);
