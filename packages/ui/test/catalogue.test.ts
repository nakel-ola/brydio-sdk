import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { BRYDIO, brydioAnswers } from '../../../test-support/contracts.ts';

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
  refusalForValue,
  type ElementAttributes,
  type PropSpec,
} from '../src/index.ts';

/** Brydio's own declaration: live from a checkout beside this repository, recorded in `contracts/brydio.json` otherwise. */
const brydio = BRYDIO;
const catalogueDir = 'packages/app/src/apps/catalogue';
/** The kit's generated token names, which the host's `spec.ts` imports as `@repo/ui/token-names`. */
const tokenNames = 'packages/ui/src/lib/token-names.ts';
const HOST_LIST = `${catalogueDir}/elements.ts`;

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
    const archive = Bun.spawnSync(['git', '-C', brydio, 'archive', 'HEAD', catalogueDir, tokenNames]);

    if (archive.exitCode !== 0) throw new Error(`git archive failed: ${archive.stderr.toString()}`);

    Bun.spawnSync(['tar', '-x', '-C', scratch], { stdin: archive.stdout });

    // The workspace alias can't resolve from a scratch folder, so it points at the exported file.
    const spec = join(scratch, catalogueDir, 'spec.ts');

    writeFileSync(spec, readFileSync(spec, 'utf8').replace('"@repo/ui/token-names"', JSON.stringify(join(scratch, tokenNames))));

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
  test('has the twenty-eight Brydio draws, all named bry-', () => {
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
      'bry-table',
      'bry-virtual-list',
      'bry-dialog',
      'bry-menu',
      'bry-date',
      'bry-split',
      'bry-checkbox',
      'bry-switch',
      'bry-board',
      'bry-board-column',
      'bry-markdown',
      'bry-diff',
      'bry-file-grid',
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
        if (spec.kind === 'text') expect(['text', 'label', 'title', 'value', 'placeholder', 'error', 'name', 'description', 'meta', 'action', 'empty', 'selected', 'cancel', 'min', 'max', 'settled']).toContain(prop);
      }
    }
  });
});

describe('the same as Brydio’s receiver', () => {
  test('declares exactly what packages/app/src/apps/catalogue/elements.ts declares at HEAD', async () => {
    const host = await brydioAnswers('catalogue-elements', [HOST_LIST, tokenNames], async () => {
      const { host: list, unlanded } = await hostAtHead();

      return { elements: Object.fromEntries(Object.entries(list.ELEMENTS).filter(([name]) => !unlanded.includes(name))), textNode: list.TEXT_NODE };
    });

    expect(JSON.parse(JSON.stringify(CATALOGUE))).toEqual(host.elements);
    expect(host.textNode).toBe('#text');
  });

  test('refuses with the host’s own sentences', async () => {
    const cases: [string, string, unknown][] = [
      ['bry-stack', 'gap', '9'],
      ['bry-stack', 'style', 'x'],
      ['bry-heading', 'level', 4],
      ['bry-heading', 'level', 1.5],
      ['bry-text', 'text', 'x'.repeat(4_001)],
      ['bry-button', 'disabled', 'yes'],
      ['bry-card', 'padding', '8'],
    ];

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

    // Wren's eight, whose lists and records name the path to the field they refuse.
    const column = { key: 'title', heading: 'Title' };
    const later: [string, string, unknown][] = [
      ['bry-table', 'columns', [{ ...column, align: 'middle' }]],
      ['bry-table', 'columns', [column, { key: 'x' }]],
      ['bry-table', 'columns', [{ ...column, width: 3 }]],
      ['bry-table', 'columns', Array.from({ length: 13 }, (_, at) => ({ key: `c${at}`, heading: 'x' }))],
      ['bry-table', 'columns', 'title'],
      ['bry-table', 'columns', [null]],
      ['bry-table', 'rows', [{ id: 'a', cells: ['x', 7] }]],
      ['bry-table', 'rows', [{ id: 'x'.repeat(129), cells: [] }]],
      ['bry-table', 'sort', { key: 'title', direction: 'up' }],
      ['bry-table', 'sort', { key: 'title' }],
      ['bry-table', 'selected', 'x'.repeat(129)],
      ['bry-virtual-list', 'count', 1_000_001],
      ['bry-virtual-list', 'rowSize', 'xl'],
      ['bry-dialog', 'actions', [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }]],
      ['bry-dialog', 'actions', [{ id: 'a', label: 'A', tone: 'warn' }]],
      ['bry-dialog', 'description', 'x'.repeat(4_001)],
      ['bry-menu', 'items', [{ id: 'a', label: 'A', icon: 'rocket' }]],
      ['bry-menu', 'items', [{ id: 'a', label: 'A', icon: 'trash', tone: 'danger', separator: 'yes' }]],
      ['bry-date', 'value', '2026-09-16T00:00'],
      ['bry-split', 'ratio', 90],
      ['bry-checkbox', 'checked', 'true'],
      ['bry-switch', 'onChange', 'x'],
      // The board, the button's icon and the heading's variant.
      ['bry-board', 'cardSize', '120px'],
      ['bry-board', 'indicator', 'line'],
      ['bry-board', 'settled', 'x'.repeat(129)],
      ['bry-board-column', 'limit', 0],
      ['bry-board-column', 'count', 100_001],
      ['bry-button', 'icon', 'rocket'],
      ['bry-button', 'hideLabel', 'yes'],
      ['bry-heading', 'level', 5],
      ['bry-heading', 'variant', 'display'],
      ['bry-avatar', 'size', 'xl'],
      ['bry-text', 'tone', 'loud'],
      ['bry-text', 'variant', 'heading'],
      ['bry-markdown', 'text', 'x'.repeat(50_001)],
      ['bry-markdown', 'expanded', 'yes'],
      ['bry-diff', 'files', [{ path: 'a.ts', status: 'moved' }]],
      ['bry-diff', 'files', [{ patch: '@@' }]],
      ['bry-diff', 'files', [{ path: 'a.ts', patch: 'x'.repeat(200_001) }]],
      ['bry-diff', 'files', Array.from({ length: 301 }, (_, at) => ({ path: `f${at}` }))],
    ];

    const values = [...cases, ...fields, ...later];
    const empties = ['bry-button', 'bry-select', 'bry-label', 'bry-badge', 'bry-avatar', 'bry-empty-state', 'bry-table', 'bry-virtual-list', 'bry-dialog', 'bry-menu', 'bry-checkbox', 'bry-switch', 'bry-board', 'bry-board-column', 'bry-markdown', 'bry-diff'];
    const host = await brydioAnswers('catalogue-refusals', [HOST_LIST, tokenNames], async () => {
      const { host: list } = await hostAtHead();

      return {
        values: values.map(([type, name, value]) => list.refusalFor(type, name, value)),
        empties: empties.map(type => list.refusalForProps(type, {})),
      };
    });

    for (const [type, name, value] of later) expect(refusalFor(type as never, name, value)).not.toBeNull();

    expect(values.map(([type, name, value]) => refusalFor(type as never, name, value))).toEqual(host.values);
    expect(empties.map(type => refusalForProps(type as never, {}))).toEqual(host.empties);
  });

  test('refuses inside a table’s columns and a menu’s items with the path to the field', () => {
    expect(refusalFor('bry-table', 'columns', [{ key: 'title', heading: 'Title', align: 'end', sortable: true }])).toBeNull();
    expect(refusalFor('bry-table', 'columns', [{ key: 'title', heading: 'Title', align: 'middle' }])).toBe(
      'bry-table columns[0].align must be one of start, end.',
    );
    expect(refusalFor('bry-table', 'columns', [{ key: 'a', heading: 'A' }, { key: 'b' }])).toBe('bry-table columns[1] needs a heading.');
    expect(refusalFor('bry-table', 'rows', [{ id: 'a', cells: ['x', 7] }])).toBe('bry-table rows[0].cells[1] must be text of at most 200 characters.');
    expect(refusalFor('bry-table', 'sort', [])).toBe('bry-table sort must be a record with key, direction.');
    expect(refusalFor('bry-menu', 'items', [{ id: 'a', label: 'A', href: '/x' }])).toBe('bry-menu items[0] has no field called "href".');
    expect(refusalFor('bry-dialog', 'actions', 'save')).toBe('bry-dialog actions must be a list of at most 3.');
    expect(refusalFor('bry-menu', 'items', [{ id: 'a', label: 'A', icon: undefined }])).toBeNull();
    expect(refusalForValue('bry-x list[0]', { kind: 'options', max: 1 }, [])).toBe("bry-x list[0] can't hold a list of choices.");
  });

  test('checks a select’s choices: distinct values, non-empty labels, nothing else, at most a hundred', () => {
    const one = { value: 'a', label: 'A' };

    expect(refusalFor('bry-select', 'options', [one, { value: 'b', label: 'B' }])).toBeNull();
    expect(refusalFor('bry-select', 'options', [])).toBeNull();
    // G16: a person's choice may carry their member id, drawn as their initials.
    expect(refusalFor('bry-select', 'options', [{ value: 'u1', label: 'Ada Lovelace', avatar: 'user_ada' }])).toBeNull();

    for (const bad of [[one, one], [{ value: 'a', label: '' }], [{ value: '', label: 'A' }], [{ ...one, colour: 'red' }], 'a', [null]]) {
      expect(refusalFor('bry-select', 'options', bad)).toBe(
        'bry-select options must be a list of at most 100 choices, each with a value and a label of at most 200 characters (and optionally a member id as avatar), and no value twice.',
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
    expect(checkProp('bry-text', 'tone', 'loud')).toBe('bry-text tone must be one of default, muted, neutral, brand, success, warn, danger.');
    expect(checkProp('bry-text', 'tone', 'success')).toBeNull();
    expect(checkProp('bry-text', 'variant', 'caption')).toBeNull();
    expect(checkProp('bry-text', 'style', 'color: red')).toContain('there is no style setting');
    expect(checkProp('bry-heading', 'level', 2)).toBeNull();
    expect(checkProp('bry-heading', 'level', '2')).toContain('whole number from 1 to 4');
    expect(checkProp('bry-heading', 'variant', 'subheading')).toBeNull();
    expect(checkProp('bry-button', 'icon', 'chevronDown')).toBeNull();
    expect(checkProp('bry-button', 'icon', 'trash')).toBeNull();
    expect(checkProp('bry-board-column', 'limit', 0)).toBe('bry-board-column limit must be a whole number from 1 to 100000.');
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

    const sorted: ElementAttributes<'bry-table'> = {
      columns: [{ key: 'title', heading: 'Title', sortable: true }],
      rows: [{ id: 'a', cells: ['Fix the door'] }],
      sort: { key: 'title', direction: 'asc' },
      onSort: event => event.detail.direction satisfies 'asc' | 'desc',
      onSelect: event => event.detail.row.trim(),
    };
    // @ts-expect-error a column needs its heading
    const headless: ElementAttributes<'bry-table'> = { columns: [{ key: 'title' }] };
    // @ts-expect-error a column aligns to the start or the end
    const centred: ElementAttributes<'bry-table'> = { columns: [{ key: 'title', heading: 'Title', align: 'center' }] };
    const long: ElementAttributes<'bry-virtual-list'> = {
      count: 10_000,
      onRange: event => event.detail.start + event.detail.end,
      onSelect: event => event.detail.index.toFixed(),
    };
    const asked: ElementAttributes<'bry-dialog'> = {
      title: 'Delete?',
      actions: [{ id: 'delete', label: 'Delete', tone: 'danger' }],
      onAction: event => event.detail.id.trim(),
      onClose: event => event.detail?.refused.trim(),
    };
    const more: ElementAttributes<'bry-menu'> = { items: [{ id: 'bin', label: 'Delete', icon: 'trash' }], onSelect: event => event.detail.id.trim() };
    // @ts-expect-error a menu's icons are the shell's own
    const drawn: ElementAttributes<'bry-menu'> = { items: [{ id: 'bin', label: 'Delete', icon: 'rocket' }] };
    const due: ElementAttributes<'bry-date'> = { value: '2026-09-16', onChange: event => event.detail.value.trim() };
    const ticked: ElementAttributes<'bry-checkbox'> = { label: 'Done', onChange: event => event.detail.checked satisfies boolean };
    // @ts-expect-error a switch's change carries whether it is on, not text
    const worded: ElementAttributes<'bry-switch'> = { label: 'On', onChange: event => event.detail.value };
    // @ts-expect-error a split raises nothing
    const dragged: ElementAttributes<'bry-split'> = { ratio: 50, onChange: () => {} };

    const board: ElementAttributes<'bry-board'> = {
      label: 'Issues',
      cardSize: 'md',
      onMove: event => `${event.detail.card} ${event.detail.from} ${event.detail.to} ${event.detail.position.toFixed()}`,
    };
    const column: ElementAttributes<'bry-board-column'> = { title: 'To do', count: 250, onRange: event => event.detail.end - event.detail.start };
    // @ts-expect-error a column needs its title
    const untitled: ElementAttributes<'bry-board-column'> = { count: 3 };
    // @ts-expect-error a board's cards are sized by name
    const pixels: ElementAttributes<'bry-board'> = { cardSize: '120px' };
    const iconic: ElementAttributes<'bry-button'> = { label: 'More', icon: 'more', hideLabel: true };
    // @ts-expect-error a button's icons are the shell's own
    const rocket: ElementAttributes<'bry-button'> = { label: 'Go', icon: 'rocket' };
    const small: ElementAttributes<'bry-heading'> = { text: 'Doing', level: 4, variant: 'label' };
    const notes: ElementAttributes<'bry-markdown'> = { text: '**Done**', expanded: true };
    const changes: ElementAttributes<'bry-diff'> = {
      files: [{ path: 'src/a.ts', status: 'modified', patch: '@@ -1 +1 @@' }, { path: 'src/big.ts' }],
      onExpand: event => event.detail.file.trim(),
      onSelect: event => `${event.detail.file} ${event.detail.side satisfies 'old' | 'new'} ${event.detail.start + event.detail.end}`,
    };
    // @ts-expect-error a diff needs its files
    const fileless: ElementAttributes<'bry-diff'> = { label: 'Changes' };

    expect([
      fine, unlabelled, wide, pressed, typed, chosen, choiceless, loud, submitted,
      sorted, headless, centred, long, asked, more, drawn, due, ticked, worded, dragged,
      board, column, untitled, pixels, iconic, rocket, small, notes, changes, fileless,
    ]).toHaveLength(30);
  });
});
