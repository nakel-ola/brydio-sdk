import { checkSource, formatProblem } from '@brydio/cli';
import { describe, expect, test } from 'bun:test';

import { TreeStore } from '../src/index.ts';

/**
 * A mistake in a screen reads the same wherever it is caught: `brydio
 * validate` reading the source, and the fake host (Brydio's own receiver,
 * copied) refusing the node when the screen runs. `validate` may add what to
 * do about it, but as a hint after the sentence, never in it.
 */

const MISTAKES: { jsx: string; node: { type: string; props?: Record<string, unknown> } }[] = [
  { jsx: '<bry-chart />', node: { type: 'bry-chart' } },
  { jsx: '<bry-button label="Save" tone="danger" />', node: { type: 'bry-button', props: { label: 'Save', tone: 'danger' } } },
  { jsx: '<bry-stack style="color: red" />', node: { type: 'bry-stack', props: { style: 'color: red' } } },
  { jsx: '<bry-stack gap="9" />', node: { type: 'bry-stack', props: { gap: '9' } } },
  { jsx: '<bry-heading text="Hi" level={5} />', node: { type: 'bry-heading', props: { text: 'Hi', level: 5 } } },
  { jsx: '<bry-button variant="primary" />', node: { type: 'bry-button', props: { variant: 'primary' } } },
  { jsx: '<bry-board-column count={3} />', node: { type: 'bry-board-column', props: { count: 3 } } },
];

describe('an unknown element or setting', () => {
  test('fails in the fake host at that node with the message validate gives', () => {
    for (const { jsx, node } of MISTAKES) {
      const [problem] = checkSource('src/screens/board.tsx', `const screen = ${jsx};`);
      const store = new TreeStore();
      const outcome = store.mount('root', [{ id: 'root', type: 'bry-stack', children: ['n1'] }, { id: 'n1', ...node }]);

      expect(outcome.refused).toHaveLength(1);
      expect(outcome.refused[0]).toMatchObject({ op: 'mount', node: 'n1' });
      expect(problem?.message).toBe(outcome.refused[0]!.reason);
    }
  });

  test('keeps validate’s advice as a hint, printed after the sentence', () => {
    const [element] = checkSource('a.tsx', 'const x = <bry-chart />;');
    const [style] = checkSource('a.tsx', 'const x = <bry-stack className="box" />;');

    expect(element!.hint).toStartWith('A screen draws with bry-stack, ');
    expect(formatProblem(element!)).toContain('Brydio has no element called "bry-chart". A screen draws with bry-stack,');
    expect(style).toMatchObject({ code: 'style_forbidden', message: 'bry-stack has no setting called "className".' });
    expect(formatProblem(style!)).toContain('bry-stack has no setting called "className". There are no classes in a Brydio app');
  });
});
