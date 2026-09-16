import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  CATALOGUE,
  ELEMENT_NAMES,
  checkChild,
  checkElement,
  checkEvent,
  checkProp,
  checkText,
  eventOfHandler,
  handlerName,
  refusalFor,
  refusalForProps,
  type ElementAttributes,
  type PropSpec,
} from '../src/index.ts';

/** Brydio's own declaration, when a checkout sits beside this repository. */
const brydio = process.env.BRYDIO_DIR ?? join(import.meta.dir, '..', '..', '..', '..', 'brydio');
const catalogueDir = 'packages/app/src/apps/catalogue';
const hasHost = existsSync(join(brydio, catalogueDir, 'elements.ts'));

/**
 * The host's catalogue as committed at HEAD, not as it sits on disk: other
 * agents add elements in the same checkout, and the SDK copies what has
 * landed, not what is half written. Exported to a scratch folder, since each
 * element's declaration lives in its own file beside the list.
 *
 * A commit can register an element whose own file was never committed (one
 * agent's commit sweeping up another's line). Such an element has not landed:
 * a stand-in takes its file's place only so the list can be imported, and it
 * is left out of the comparison, by name.
 */
let committed: Promise<{ host: Record<string, any>; unlanded: string[] }> | null = null;
const hostAtHead = () =>
  (committed ??= (async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'brydio-catalogue-'));
    const archive = Bun.spawnSync(['git', '-C', brydio, 'archive', 'HEAD', catalogueDir]);

    if (archive.exitCode !== 0) throw new Error(`git archive failed: ${archive.stderr.toString()}`);

    Bun.spawnSync(['tar', '-x', '-C', scratch], { stdin: archive.stdout });

    const list = join(scratch, catalogueDir, 'elements.ts');
    const source = readFileSync(list, 'utf8');
    const unlanded: string[] = [];

    for (const [, binding, file] of source.matchAll(/import \{ (\w+) \} from "\.\/(elements\/[\w-]+)";/g)) {
      const copy = join(scratch, catalogueDir, `${file}.ts`);

      if (existsSync(copy)) continue;

      mkdirSync(dirname(copy), { recursive: true });
      writeFileSync(copy, `export const ${binding} = { props: {}, events: [], children: false };\n`);

      for (const [, name] of source.matchAll(new RegExp(`"(bry-[\\w-]+)": ${binding},`, 'g'))) unlanded.push(name!);
    }

    return { host: await import(list), unlanded };
  })());

describe('the catalogue as a whole', () => {
  test('has the first fifteen, all named bry-', () => {
    expect(ELEMENT_NAMES).toEqual([
      'bry-stack',
      'bry-heading',
      'bry-text',
      'bry-button',
      'bry-card',
      'bry-input',
      'bry-textarea',
      'bry-select',
      'bry-label',
      'bry-grid',
      'bry-badge',
      'bry-avatar',
      'bry-list-row',
      'bry-empty-state',
      'bry-skeleton',
    ]);
  });

  test('offers no style, class, colour or pixel setting on any element', () => {
    const banned = /^(style|class|classname|colou?r|background|width|height|font|px|css)/i;

    for (const name of ELEMENT_NAMES) {
      for (const prop of Object.keys(CATALOGUE[name].props)) expect(prop).not.toMatch(banned);
    }
  });

  test('keeps free text to the settings that are words for a person', () => {
    for (const name of ELEMENT_NAMES) {
      for (const [prop, spec] of Object.entries(CATALOGUE[name].props) as [string, PropSpec][]) {
        if (spec.kind === 'text') expect(['text', 'label', 'title', 'value', 'placeholder', 'error', 'name', 'description', 'meta', 'action']).toContain(prop);
      }
    }
  });
});

describe('the same as Brydio’s receiver', () => {
  test.skipIf(!hasHost)('declares exactly what packages/app/src/apps/catalogue/elements.ts declares at HEAD', async () => {
    const { host, unlanded } = await hostAtHead();

    const landed = Object.fromEntries(Object.entries(host.ELEMENTS).filter(([name]) => !unlanded.includes(name)));

    expect(JSON.parse(JSON.stringify(CATALOGUE))).toEqual(JSON.parse(JSON.stringify(landed)));
    expect(host.TEXT_NODE).toBe('#text');
  });

  test.skipIf(!hasHost)('refuses with the host’s own sentences', async () => {
    const { host, unlanded } = await hostAtHead();
    const cases: [string, string, unknown][] = [
      ['bry-stack', 'gap', '9'],
      ['bry-stack', 'style', 'x'],
      ['bry-heading', 'level', 4],
      ['bry-heading', 'level', 1.5],
      ['bry-text', 'text', 'x'.repeat(4_001)],
      ['bry-button', 'disabled', 'yes'],
      ['bry-card', 'padding', '8'],
    ];

    for (const [type, name, value] of cases) {
      expect(refusalFor(type as never, name, value)).toBe(host.refusalFor(type, name, value));
    }

    expect(refusalForProps('bry-button', {})).toBe(host.refusalForProps('bry-button', {}));

    const fields: [string, string, unknown][] = [
      ['bry-input', 'kind', 'password'],
      ['bry-input', 'maxLength', 0],
      ['bry-input', 'value', 'x'.repeat(1_001)],
      ['bry-textarea', 'value', 'x'.repeat(4_000)],
      ['bry-textarea', 'kind', 'text'],
      ['bry-select', 'options', [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }]],
      ['bry-select', 'options', Array.from({ length: 101 }, (_, at) => ({ value: `v${at}`, label: 'x' }))],
      ['bry-select', 'options', [{ value: 'a', label: 'A', tone: 'red' }]],
      ['bry-grid', 'columns', '7'],
      ['bry-badge', 'tone', 'muted'],
      ['bry-avatar', 'src', 'https://x'],
      ['bry-skeleton', 'count', 13],
      ['bry-empty-state', 'action', 'x'.repeat(201)],
    ];

    for (const [type, name, value] of fields) expect(refusalFor(type as never, name, value)).toBe(host.refusalFor(type, name, value));

    for (const type of ['bry-select', 'bry-label', 'bry-badge', 'bry-avatar', 'bry-empty-state']) {
      expect(refusalForProps(type as never, {})).toBe(host.refusalForProps(type, {}));
    }
  });

  test('checks a select’s choices: distinct values, non-empty labels, nothing else, at most a hundred', () => {
    const one = { value: 'a', label: 'A' };

    expect(refusalFor('bry-select', 'options', [one, { value: 'b', label: 'B' }])).toBeNull();
    expect(refusalFor('bry-select', 'options', [])).toBeNull();

    for (const bad of [[one, one], [{ value: 'a', label: '' }], [{ value: '', label: 'A' }], [{ ...one, colour: 'red' }], 'a', [null]]) {
      expect(refusalFor('bry-select', 'options', bad)).toBe(
        'bry-select options must be a list of at most 100 choices, each with a value and a label of at most 200 characters, and no value twice.',
      );
    }
  });
});

describe('checks', () => {
  test('refuse an element outside the catalogue', () => {
    expect(checkElement('bry-stack')).toBeNull();
    expect(checkElement('#text')).toBeNull();
    expect(checkElement('div')).toBe('Brydio has no element called "div".');
  });

  test('refuse a setting the element does not take, saying why for the web’s favourites', () => {
    expect(checkProp('bry-text', 'tone', 'muted')).toBeNull();
    expect(checkProp('bry-text', 'tone', 'loud')).toBe('bry-text tone must be one of default, muted, danger.');
    expect(checkProp('bry-text', 'style', 'color: red')).toContain('there is no style setting');
    expect(checkProp('bry-heading', 'level', 2)).toBeNull();
    expect(checkProp('bry-heading', 'level', '2')).toContain('whole number from 1 to 3');
  });

  test('require the words an element cannot be drawn without', () => {
    expect(refusalForProps('bry-button', { variant: 'primary' })).toBe('bry-button needs a label.');
    expect(refusalForProps('bry-button', { label: 'Save' })).toBeNull();
    expect(refusalForProps('bry-stack', {})).toBeNull();
  });

  test('let only stacks and cards hold other nodes', () => {
    expect(checkChild('bry-stack')).toBeNull();
    expect(checkChild('bry-card')).toBeNull();
    expect(checkChild('bry-text')).toBe('bry-text can’t hold other nodes.');
    expect(checkChild('bry-button')).toBe('bry-button can’t hold other nodes.');
  });

  test('cap text at a paragraph', () => {
    expect(checkText('Hello')).toBeNull();
    expect(checkText('x'.repeat(4_001))).toBe('Text must be at most 4000 characters.');
  });

  test('name events and their handlers', () => {
    expect(handlerName('press')).toBe('onPress');
    expect(eventOfHandler('onPress')).toBe('press');
    expect(eventOfHandler('press')).toBeNull();
    expect(checkEvent('bry-button', 'press')).toBeNull();
    expect(checkEvent('bry-text', 'press')).toBe('bry-text raises no events, so it takes no onPress.');
  });

  test('type the settings from the table', () => {
    const fine: ElementAttributes<'bry-button'> = { label: 'Save', variant: 'primary', onPress: () => {} };
    // @ts-expect-error a button needs a label
    const unlabelled: ElementAttributes<'bry-button'> = { variant: 'primary' };
    // @ts-expect-error nine is not on the spacing scale
    const wide: ElementAttributes<'bry-stack'> = { gap: '9' };
    // @ts-expect-error a stack raises no press
    const pressed: ElementAttributes<'bry-stack'> = { onPress: () => {} };

    const typed: ElementAttributes<'bry-input'> = { value: '', onChange: event => event.detail.value.trim(), onSubmit: () => {} };
    const chosen: ElementAttributes<'bry-select'> = { options: [{ value: 'todo', label: 'To do' }], onChange: event => event.detail.value };
    // @ts-expect-error a select needs its options
    const choiceless: ElementAttributes<'bry-select'> = { value: 'todo' };
    // @ts-expect-error a badge's tone is one of the five
    const loud: ElementAttributes<'bry-badge'> = { text: 'x', tone: 'muted' };
    // @ts-expect-error a textarea has no submit
    const submitted: ElementAttributes<'bry-textarea'> = { onSubmit: () => {} };

    expect([fine, unlabelled, wide, pressed, typed, chosen, choiceless, loud, submitted]).toHaveLength(9);
  });
});
