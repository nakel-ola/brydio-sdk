import { board, boardColumn, button, card, checkbox, input, menu, mount, stack, text } from '@brydio/app';

// A screen for driving: a field, a menu, a checkbox, a board and a button that
// takes itself away, each saying what it last heard.
void mount(root => {
  const heard = text({ text: 'Nothing yet.' });
  const say = (words: string) => heard.setAttribute('text', words);
  const typed: string[] = [];
  const field = input({ label: 'Title', onChange: event => (typed.push(event.detail.value), say(`typed ${typed.join(' > ')}`)) });
  const more = menu({ items: [{ id: 'archive', label: 'Archive' }], onSelect: event => say(`chose ${event.detail.id}`) }, button({ label: 'More' }));
  const done = checkbox({ label: 'Done', onChange: event => say(`done ${event.detail.checked}`) });
  const todo = boardColumn({ title: 'To do' }, card({ title: 'First' }));
  const doing = boardColumn({ title: 'Doing' });
  const issues = board({
    label: 'Issues',
    onMove: event => {
      const moved = root.nodeById(event.detail.card);
      const to = root.nodeById(event.detail.to);

      if (!moved || !to || !('appendChild' in to)) return;

      (to as typeof doing).appendChild(moved);
      say(`moved to ${(to as typeof doing).getAttribute('title')} at ${event.detail.position}`);
    },
  }, todo, doing);
  let presses = 0;
  const once = button({
    label: 'Once',
    onPress: () => {
      presses += 1;
      once.remove();
      say(`pressed ${presses}`);
    },
  });

  root.append(stack({ gap: '2' }, heard, field, more, done, issues, once));
});
