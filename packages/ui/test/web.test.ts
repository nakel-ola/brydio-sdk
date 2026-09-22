import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';
import { CATALOGUE, ELEMENT_NAMES, type ElementSpec } from '../src/catalogue.ts';

/** Brydio's token stylesheet, which `src/web/tokens.css` is a copy of. */
const TOKENS = 'packages/ui/src/styles/tokens.css';

// A page for this file only, so no other test in the repository gets a DOM. One file,
// because Lit's classes and style sheets belong to the first page they meet.
GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());

const { attributeOf, defineCatalogue } = await import('../src/web/index.ts');
const { positionAt, steered } = await import('../src/web/draw/board.ts');
const { movedTo, windowOf } = await import('../src/web/draw/virtual-list.ts');
const { DIFF_OPEN_UNDER, opensAll, parseUnifiedDiff, splitRows } = await import('../src/web/draw/diff.ts');

const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

/** Puts markup on the page and waits for every element to draw. */
async function page(markup: string) {
  document.body.innerHTML = markup;
  await settle();
}

const shadowOf = (selector: string) => document.querySelector(selector)!.shadowRoot!;

describe('the catalogue as web components (A6-F06-TC001)', () => {
  test('every element is a custom element of the same name, with the same settings and events', () => {
    const classes = defineCatalogue();

    expect([...classes.keys()].sort()).toEqual([...ELEMENT_NAMES].sort());

    for (const name of ELEMENT_NAMES) {
      const spec = CATALOGUE[name] as ElementSpec;
      const made = customElements.get(name) as unknown as { events: readonly string[]; observedAttributes: string[]; elementProperties: Map<string, unknown> };

      expect(made, name).toBeDefined();
      expect([...made.events], name).toEqual([...spec.events]);
      expect([...made.elementProperties.keys()].sort(), name).toEqual(Object.keys(spec.props).sort());
      expect([...made.observedAttributes].sort(), name).toEqual(Object.keys(spec.props).map(attributeOf).sort());
    }
  });

  test('reads each kind of setting from its attribute', async () => {
    document.body.innerHTML = `
      <bry-button label="Save" variant="danger" hide-label disabled></bry-button>
      <bry-select label="Status" options='[{"value":"todo","label":"To do"}]'></bry-select>`;
    await settle();

    const button = document.querySelector('bry-button') as unknown as Record<string, unknown>;
    const select = document.querySelector('bry-select') as unknown as Record<string, unknown>;

    expect(button.label).toBe('Save');
    expect(button.variant).toBe('danger');
    expect(button.hideLabel).toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.working).toBeUndefined();
    expect(select.options).toEqual([{ value: 'todo', label: 'To do' }]);
  });

  test('registering again changes nothing', () => {
    const first = customElements.get('bry-button');

    defineCatalogue();
    expect(customElements.get('bry-button')).toBe(first);
  });
});

describe('Lit stays in one file (A6-F06-TC004)', () => {
  test('only src/web/base.ts imports lit', () => {
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);

        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && /from\s+['"]lit(\/[^'"]*)?['"]|import\(\s*['"]lit/.test(readFileSync(path, 'utf8'))) {
          importers.push(path.slice(path.indexOf('src')));
        }
      }
    };

    walk(join(import.meta.dir, '../src'));
    expect(importers).toEqual(['src/web/base.ts']);
  });
});

describe('the first drawings (A6-F06-S01)', () => {
  test('a button shows its label and says press, and holds still while disabled or working', async () => {
    await page(`<bry-button id="save" label="Save" variant="primary"></bry-button><bry-button id="busy" label="Saving" working></bry-button>`);

    const presses: string[] = [];

    document.body.addEventListener('press', event => presses.push((event.target as HTMLElement).id));

    const save = shadowOf('#save').querySelector('button')!;

    expect(save.textContent!.trim()).toBe('Save');
    expect(save.className).toContain('primary');
    save.click();
    expect(presses).toEqual(['save']);

    const busy = shadowOf('#busy').querySelector('button')!;

    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(shadowOf('#busy').querySelector('.spinner')).not.toBeNull();
  });

  test('a variant the catalogue lacks falls back to secondary, never passes through', async () => {
    await page(`<bry-button label="Go" variant="rainbow"></bry-button>`);

    expect(shadowOf('bry-button').querySelector('button')!.className).toBe('secondary md');
  });

  test('a heading keeps its place in the outline apart from its size', async () => {
    await page(`<bry-heading id="a" level="1" text="Board"></bry-heading><bry-heading id="b" level="3" variant="title" text="Small, loud"></bry-heading>`);

    const a = shadowOf('#a').querySelector('h2')!;
    const b = shadowOf('#b').querySelector('h4')!;

    expect([a.textContent, a.className]).toEqual(['Board', 'type-title']);
    expect([b.textContent, b.className]).toEqual(['Small, loud', 'type-title']);
  });

  test('text takes a role and a tone by name', async () => {
    await page(`<bry-text text="Overdue" variant="caption" tone="danger"></bry-text>`);

    const p = shadowOf('bry-text').querySelector('p')!;

    expect(p.className).toBe('type-caption');
    expect(p.getAttribute('style')).toBe('color: var(--danger-fg)');
  });

  test('a badge is tinted by its tone, and an unknown tone is neutral', async () => {
    await page(`<bry-badge id="ok" text="Done" tone="success"></bry-badge><bry-badge id="odd" text="?" tone="pink"></bry-badge>`);

    expect(shadowOf('#ok').querySelector('span')!.dataset.tone).toBe('success');
    expect(shadowOf('#ok').querySelector('span')!.getAttribute('style')).toBe('background: var(--success-soft); color: var(--success-fg)');
    expect(shadowOf('#odd').querySelector('span')!.dataset.tone).toBe('neutral');
  });

  test('a pressable card says press when it is pressed itself, not when a button inside it is', async () => {
    await page(`<bry-card title="Issue" pressable><bry-button label="Close"></bry-button></bry-card>`);

    const presses: string[] = [];

    document.body.addEventListener('press', event => presses.push((event.target as HTMLElement).localName));

    const card = shadowOf('bry-card').querySelector('.card') as HTMLElement;

    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('tabindex')).toBe('0');
    expect(shadowOf('bry-card').querySelector('.title')!.textContent).toBe('Issue');

    card.click();
    expect(presses).toEqual(['bry-card']);

    shadowOf('bry-button').querySelector('button')!.click();
    expect(presses).toEqual(['bry-card', 'bry-button']);

    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    expect(presses).toEqual(['bry-card', 'bry-button', 'bry-card']);
  });

  test('a loading card is a skeleton in its place', async () => {
    await page(`<bry-card loading><bry-text text="hidden"></bry-text></bry-card>`);

    expect(shadowOf('bry-card').querySelector('[role="status"]')!.getAttribute('aria-label')).toBe('Loading');
    expect(shadowOf('bry-card').querySelector('slot')).toBeNull();
  });

  test('a stack lays out by name, and a gap it lacks is none', async () => {
    await page(`<bry-stack id="row" direction="row" gap="3" justify="between"><bry-text text="a"></bry-text></bry-stack><bry-stack id="odd" gap="99"></bry-stack>`);

    const row = document.querySelector('#row') as HTMLElement;

    expect(row.style.getPropertyValue('--bry-direction')).toBe('row');
    expect(row.style.getPropertyValue('--bry-gap')).toBe('calc(0.25rem * 3)');
    expect(row.style.getPropertyValue('--bry-justify')).toBe('space-between');
    expect((document.querySelector('#odd') as HTMLElement).style.getPropertyValue('--bry-gap')).toBe('0');
  });
});

describe('the layout drawings (A6-F06-S01)', () => {
  test('an avatar is named for a screen reader and shows initials', async () => {
    await page(`<bry-avatar name="Ada Byron Lovelace" size="sm"></bry-avatar><bry-avatar id="one" name="Grace"></bry-avatar>`);

    const avatar = shadowOf('bry-avatar').querySelector('[role="img"]')!;

    expect(avatar.getAttribute('aria-label')).toBe('Ada Byron Lovelace');
    expect(avatar.textContent).toBe('AL');
    expect(avatar.className).toBe('avatar sm');
    expect(shadowOf('#one').querySelector('[role="img"]')!.textContent).toBe('G');
  });

  test('a label names what it holds, and marks it required', async () => {
    await page(`<bry-label text="Title" required><bry-text text="x"></bry-text></bry-label>`);

    const label = shadowOf('bry-label').querySelector('[part="label"]')!;

    expect(label.textContent).toBe('Title*');
    expect(label.querySelector('.required')!.getAttribute('aria-hidden')).toBe('true');
    expect(shadowOf('bry-label').querySelector('slot')).not.toBeNull();
  });

  test('a pressable row says press on itself, not through a button inside it, and says whether it is selected', async () => {
    await page(`<bry-list-row title="Fix login" description="Assigned to Ada" meta="2d" pressable selected><bry-button label="Close"></bry-button></bry-list-row>`);

    const presses: string[] = [];

    document.body.addEventListener('press', event => presses.push((event.target as HTMLElement).localName));

    const row = shadowOf('bry-list-row').querySelector('.row') as HTMLElement;

    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(Array.from(shadowOf('bry-list-row').querySelectorAll('p')).map(p => p.textContent)).toEqual(['Fix login', 'Assigned to Ada', '2d']);

    row.click();
    shadowOf('bry-button').querySelector('button')!.click();
    expect(presses).toEqual(['bry-list-row', 'bry-button']);
  });

  test('an empty state says what to do and raises action from its one button', async () => {
    await page(`<bry-empty-state title="No issues yet" text="Make one to start." action="New issue"></bry-empty-state>`);

    const actions: string[] = [];

    document.body.addEventListener('action', event => actions.push((event.target as HTMLElement).localName));

    const root = shadowOf('bry-empty-state');

    expect(Array.from(root.querySelectorAll('p')).map(p => p.textContent)).toEqual(['No issues yet', 'Make one to start.']);
    root.querySelector('button')!.click();
    expect(actions).toEqual(['bry-empty-state']);
  });

  test('a skeleton draws as many shapes as asked, and says it is loading', async () => {
    await page(`<bry-skeleton shape="row" count="3"></bry-skeleton><bry-skeleton id="odd" shape="blob" count="99"></bry-skeleton>`);

    const status = shadowOf('bry-skeleton').querySelector('[role="status"]')!;

    expect(status.getAttribute('aria-label')).toBe('Loading');
    expect(status.querySelectorAll('.row')).toHaveLength(3);
    expect(shadowOf('#odd').querySelector('[data-shape]')!.getAttribute('data-shape')).toBe('line');
    expect(shadowOf('#odd').querySelectorAll('.line')).toHaveLength(12);
  });

  test('a grid takes columns and a gap by name, and one it lacks is a single column', async () => {
    await page(`<bry-grid columns="3" gap="4"></bry-grid><bry-grid id="odd" columns="12"></bry-grid>`);

    const grid = shadowOf('bry-grid').querySelector('.grid')!;

    expect(grid.getAttribute('data-columns')).toBe('3');
    expect(grid.getAttribute('style')).toContain('gap: calc(0.25rem * 4)');
    expect(shadowOf('#odd').querySelector('.grid')!.getAttribute('data-columns')).toBe('1');
  });
});

describe('the controls (A6-F06-S01)', () => {
  const events: { name: string; detail: unknown }[] = [];
  const heard = new Set<string>();
  const listen = (...names: string[]) => {
    events.length = 0;
    for (const name of names) {
      if (heard.has(name)) continue;
      heard.add(name);
      document.body.addEventListener(name, event => events.push({ name, detail: (event as CustomEvent).detail }));
    }
  };

  test('an input says change as the person types and submit on Enter, and keeps typing until the app sends a new value', async () => {
    await page(`<bry-input label="Title" value="Draft" max-length="80" required></bry-input>`);
    listen('change', 'submit');

    const host = document.querySelector('bry-input') as HTMLElement & { value: string; requestUpdate(): void; updateComplete: Promise<unknown> };
    const input = shadowOf('bry-input').querySelector('input')!;

    expect([input.value, input.getAttribute('aria-label'), input.maxLength, input.required]).toEqual(['Draft', 'Title', 80, true]);

    input.value = 'Renew the domain';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(events).toEqual([
      { name: 'change', detail: { value: 'Renew the domain' } },
      { name: 'submit', detail: { value: 'Renew the domain' } },
    ]);

    // A redraw for any other reason keeps what was typed.
    host.requestUpdate();
    await host.updateComplete;
    expect(input.value).toBe('Renew the domain');

    // The app saves and clears the field.
    host.value = '';
    await host.updateComplete;
    expect(input.value).toBe('');
  });

  test('a field shows its error under it and points the control at it', async () => {
    await page(`<bry-textarea label="Notes" error="Too long"></bry-textarea>`);

    const root = shadowOf('bry-textarea');
    const textarea = root.querySelector('textarea')!;

    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(root.getElementById(textarea.getAttribute('aria-describedby')!)!.textContent).toBe('Too long');
  });

  test('a control inside a bry-label is named by it', async () => {
    await page(`<bry-label text="Assignee"><bry-input></bry-input></bry-label>`);

    expect(shadowOf('bry-input').querySelector('input')!.getAttribute('aria-label')).toBe('Assignee');
  });

  test('a checkbox says change with checked, and its label ticks it', async () => {
    await page(`<bry-checkbox label="Done"></bry-checkbox>`);
    listen('change');

    const root = shadowOf('bry-checkbox');
    const box = root.querySelector('input')!;

    expect(root.querySelector('label')!.getAttribute('for')).toBe(box.id);
    box.click();
    expect(box.checked).toBe(true);
    expect(events).toEqual([{ name: 'change', detail: { checked: true } }]);
  });

  test('a switch is a switch a screen reader can name, flips on press, and holds still disabled', async () => {
    await page(`<bry-switch id="on" label="Notify me" checked></bry-switch><bry-switch id="off" label="Locked" disabled></bry-switch>`);
    listen('change');

    const root = shadowOf('#on');
    const control = root.querySelector('[role="switch"]') as HTMLButtonElement;

    expect(root.getElementById(control.getAttribute('aria-labelledby')!)!.textContent).toBe('Notify me');
    expect(control.getAttribute('aria-checked')).toBe('true');
    control.click();
    await (document.querySelector('#on') as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(events).toEqual([{ name: 'change', detail: { checked: false } }]);

    (shadowOf('#off').querySelector('[role="switch"]') as HTMLButtonElement).click();
    expect(events).toHaveLength(1);
  });
});

describe('dialog, menu and select (A6-F06-S01)', () => {
  const heard: { name: string; detail: unknown }[] = [];
  const names = new Set<string>();
  const listen = (...events: string[]) => {
    heard.length = 0;
    for (const name of events) {
      if (names.has(name)) continue;
      names.add(name);
      document.body.addEventListener(name, event => heard.push({ name, detail: (event as CustomEvent).detail }));
    }
  };
  const press = (element: Element, key: string) =>
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));

  test('a dialog names itself, puts whatever destroys last, and cancel takes the focus', async () => {
    await page(`<bry-dialog open title="Delete board?" description="This cannot be undone." actions='[{"id":"remove","label":"Delete","tone":"danger"},{"id":"keep","label":"Keep","tone":"primary"}]'></bry-dialog>`);
    listen('action', 'close');

    const root = shadowOf('bry-dialog');
    const box = root.querySelector('dialog')!;

    expect(root.getElementById(box.getAttribute('aria-labelledby')!)!.textContent).toBe('Delete board?');
    expect(root.getElementById(box.getAttribute('aria-describedby')!)!.textContent).toBe('This cannot be undone.');
    expect(Array.from(root.querySelectorAll('[data-action]')).map(one => one.getAttribute('data-action'))).toEqual(['cancel', 'keep', 'remove']);

    (root.querySelector('[data-action="remove"]') as HTMLButtonElement).click();
    expect(heard).toEqual([{ name: 'action', detail: { id: 'remove' } }]);
  });

  test('a dialog the person closes stays closed while the app still says open, and opens again when the app asks again', async () => {
    await page(`<bry-dialog open title="Rename"></bry-dialog>`);
    listen('close');

    const host = document.querySelector('bry-dialog') as HTMLElement & { open: boolean; updateComplete: Promise<unknown>; requestUpdate(): void };

    (shadowOf('bry-dialog').querySelector('[data-action="cancel"]') as HTMLButtonElement).click();
    await host.updateComplete;
    expect(heard).toEqual([{ name: 'close', detail: null }]);
    expect(shadowOf('bry-dialog').querySelector('dialog')).toBeNull();

    // Still open as far as the app knows: it stays shut.
    host.requestUpdate();
    await host.updateComplete;
    expect(shadowOf('bry-dialog').querySelector('dialog')).toBeNull();

    host.open = false;
    await host.updateComplete;
    host.open = true;
    await host.updateComplete;
    expect(shadowOf('bry-dialog').querySelector('dialog')).not.toBeNull();
  });

  test('a second dialog is refused in the shell’s words, and does not draw', async () => {
    // Listening first: the refusal goes out as the second dialog first draws.
    listen('close');
    await page(`<bry-dialog id="first" open title="One"></bry-dialog><bry-dialog id="second" open title="Two"></bry-dialog>`);
    await settle();

    expect(shadowOf('#first').querySelector('dialog')).not.toBeNull();
    expect(shadowOf('#second').querySelector('dialog')).toBeNull();
    expect(heard).toEqual([
      { name: 'close', detail: { refused: 'Another dialog from this app is already open. Close it first.' } },
    ]);
  });

  test('a menu opens from the keyboard, walks with the arrows and Home and End, and chooses with Enter', async () => {
    await page(`<bry-menu items='[{"id":"open","label":"Open"},{"id":"rename","label":"Rename"},{"id":"delete","label":"Delete","tone":"danger","separator":true}]'><bry-button label="More"></bry-button></bry-menu>`);
    listen('select');

    const host = document.querySelector('bry-menu') as HTMLElement & { updateComplete: Promise<unknown> };
    const anchor = shadowOf('bry-menu').querySelector('.anchor')!;

    expect(shadowOf('bry-menu').querySelector('[role="menu"]')).toBeNull();

    press(anchor, 'ArrowDown');
    await host.updateComplete;

    const items = () => Array.from(shadowOf('bry-menu').querySelectorAll('[role="menuitem"]'));

    expect(items().map(one => one.getAttribute('data-item'))).toEqual(['open', 'rename', 'delete']);
    expect(shadowOf('bry-menu').querySelector('[data-active]')!.getAttribute('data-item')).toBe('open');
    expect(shadowOf('bry-menu').querySelector('[role="separator"]')).not.toBeNull();
    expect(items()[2]!.getAttribute('data-tone')).toBe('danger');

    press(shadowOf('bry-menu').querySelector('[data-active]')!, 'End');
    await host.updateComplete;
    expect(shadowOf('bry-menu').querySelector('[data-active]')!.getAttribute('data-item')).toBe('delete');

    press(shadowOf('bry-menu').querySelector('[data-active]')!, 'ArrowDown');
    await host.updateComplete;
    expect(shadowOf('bry-menu').querySelector('[data-active]')!.getAttribute('data-item')).toBe('open');

    press(shadowOf('bry-menu').querySelector('[data-active]')!, 'Enter');
    await host.updateComplete;
    expect(heard).toEqual([{ name: 'select', detail: { id: 'open' } }]);
    expect(shadowOf('bry-menu').querySelector('[role="menu"]')).toBeNull();
  });

  test('a menu closes on Escape without choosing, and skips an item that cannot be chosen', async () => {
    await page(`<bry-menu items='[{"id":"a","label":"Archive","disabled":true},{"id":"b","label":"Bump"}]'><bry-button label="More"></bry-button></bry-menu>`);
    listen('select');

    const host = document.querySelector('bry-menu') as HTMLElement & { updateComplete: Promise<unknown> };

    press(shadowOf('bry-menu').querySelector('.anchor')!, 'ArrowDown');
    await host.updateComplete;
    expect(shadowOf('bry-menu').querySelector('[data-active]')!.getAttribute('data-item')).toBe('b');
    expect(shadowOf('bry-menu').querySelector('[data-item="a"]')!.getAttribute('aria-disabled')).toBe('true');

    press(shadowOf('bry-menu').querySelector('[data-active]')!, 'Escape');
    await host.updateComplete;
    expect(shadowOf('bry-menu').querySelector('[role="menu"]')).toBeNull();
    expect(heard).toEqual([]);
  });

  test('a select shows the placeholder for a value its options lack, opens a listbox and says change once', async () => {
    await page(`<bry-select label="Status" placeholder="Choose" value="gone" options='[{"value":"todo","label":"To do"},{"value":"doing","label":"Doing"}]'></bry-select>`);
    listen('change');

    const host = document.querySelector('bry-select') as HTMLElement & { updateComplete: Promise<unknown> };
    const trigger = () => shadowOf('bry-select').querySelector('[role="combobox"]') as HTMLButtonElement;

    expect(trigger().textContent!.trim()).toBe('Choose');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(trigger().getAttribute('aria-label')).toBe('Status');

    trigger().click();
    await host.updateComplete;

    const options = Array.from(shadowOf('bry-select').querySelectorAll('[role="option"]'));

    expect(options.map(one => one.getAttribute('data-value'))).toEqual(['todo', 'doing']);
    expect(trigger().getAttribute('aria-expanded')).toBe('true');

    press(shadowOf('bry-select').querySelector('[role="listbox"]')!, 'ArrowDown');
    await host.updateComplete;
    press(shadowOf('bry-select').querySelector('[role="listbox"]')!, 'Enter');
    await host.updateComplete;

    expect(heard).toEqual([{ name: 'change', detail: { value: 'doing' } }]);
    expect(shadowOf('bry-select').querySelector('[role="listbox"]')).toBeNull();
  });

  test('a select says nothing when the same choice is chosen again, and a disabled one does not open', async () => {
    await page(`<bry-select id="same" value="todo" options='[{"value":"todo","label":"To do"}]'></bry-select><bry-select id="off" disabled options='[{"value":"todo","label":"To do"}]'></bry-select>`);
    listen('change');

    const same = document.querySelector('#same') as HTMLElement & { updateComplete: Promise<unknown> };

    (shadowOf('#same').querySelector('[role="combobox"]') as HTMLButtonElement).click();
    await same.updateComplete;
    (shadowOf('#same').querySelector('[data-value="todo"]') as HTMLButtonElement).click();
    await same.updateComplete;
    expect(heard).toEqual([]);

    const off = document.querySelector('#off') as HTMLElement & { updateComplete: Promise<unknown> };

    (shadowOf('#off').querySelector('[role="combobox"]') as HTMLButtonElement).click();
    await off.updateComplete;
    expect(shadowOf('#off').querySelector('[role="listbox"]')).toBeNull();
  });

  test('a choice can carry a member’s initials (G16)', async () => {
    await page(`<bry-select options='[{"value":"u1","label":"Ada Lovelace","avatar":"mem_1"}]'></bry-select>`);

    const host = document.querySelector('bry-select') as HTMLElement & { updateComplete: Promise<unknown> };

    (shadowOf('bry-select').querySelector('[role="combobox"]') as HTMLButtonElement).click();
    await host.updateComplete;

    const avatar = shadowOf('bry-select').querySelector('.avatar')!;

    expect([avatar.getAttribute('data-avatar'), avatar.textContent]).toEqual(['mem_1', 'AL']);
  });
});

describe('date and markdown (A6-F06-S01)', () => {
  test('a date is a date field with its bounds, and says change as an ISO date', async () => {
    await page(`<bry-date label="Due" value="2026-03-04" min="2026-01-01" max="2026-12-31"></bry-date>`);

    const changes: unknown[] = [];

    document.body.addEventListener('change', event => changes.push((event as CustomEvent).detail));

    const input = shadowOf('bry-date').querySelector('input')!;

    expect([input.type, input.value, input.min, input.max, input.getAttribute('aria-label')]).toEqual([
      'date',
      '2026-03-04',
      '2026-01-01',
      '2026-12-31',
      'Due',
    ]);

    input.value = '2026-04-01';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(changes).toEqual([{ value: '2026-04-01' }]);
  });

  test('markdown draws the blocks it allows, and anything that looks like markup stays text', async () => {
    await page(`<bry-markdown text="# Title
Some **bold** and \`code\`.

- one
- two

> quoted

<script>alert(1)</script> &amp; <b>not bold</b>"></bry-markdown>`);

    const root = shadowOf('bry-markdown');

    expect(root.querySelector('h3')!.textContent).toBe('Title');
    expect(root.querySelector('strong')!.textContent).toBe('bold');
    expect(root.querySelector('code')!.textContent).toBe('code');
    expect(Array.from(root.querySelectorAll('li')).map(one => one.textContent)).toEqual(['one', 'two']);
    expect(root.querySelector('blockquote')!.textContent).toBe('quoted');

    // Nothing an app writes becomes markup: no script, no bold, and the
    // characters are still there to read.
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.textContent).toContain('<script>alert(1)</script>');
    expect(root.textContent).toContain('<b>not bold</b>');
  });

  test('a link asks before it opens, and one that is not https is not a link at all', async () => {
    await page(`<bry-markdown text="[Brydio](https://brydio.example/app) and [bad](javascript:alert(1))"></bry-markdown>`);

    const host = document.querySelector('bry-markdown') as HTMLElement & { updateComplete: Promise<unknown> };
    const links = Array.from(shadowOf('bry-markdown').querySelectorAll('a'));

    expect(links.map(one => one.getAttribute('href'))).toEqual(['https://brydio.example/app']);
    expect(shadowOf('bry-markdown').textContent).toContain('bad');

    links[0]!.click();
    await host.updateComplete;

    const strip = shadowOf('bry-markdown').querySelector('[role="alert"]')!;

    expect(strip.textContent).toContain('Open brydio.example?');
    expect(strip.textContent).toContain('https://brydio.example/app');
  });

  test('a picture is never fetched: its description is shown instead', async () => {
    await page(`<bry-markdown text="![a chart](https://example.test/chart.png)"></bry-markdown>`);

    expect(shadowOf('bry-markdown').querySelector('img')).toBeNull();
    expect(shadowOf('bry-markdown').textContent).toContain('a chart');
  });

  test('a long text is cut with Show more, and the whole of it is shown once asked', async () => {
    const long = `${'a'.repeat(3_000)}\n\n${'b'.repeat(3_000)}`;

    await page(`<bry-markdown></bry-markdown>`);

    const host = document.querySelector('bry-markdown') as HTMLElement & { text: string; updateComplete: Promise<unknown> };

    host.text = long;
    await host.updateComplete;

    expect(shadowOf('bry-markdown').textContent).not.toContain('b'.repeat(3_000));

    const more = shadowOf('bry-markdown').querySelector('.more') as HTMLButtonElement;

    expect(more.textContent!.trim()).toBe('Show more');
    more.click();
    await host.updateComplete;
    expect(shadowOf('bry-markdown').textContent).toContain('b'.repeat(3_000));
  });
});

describe('split (A6-F06-S01)', () => {
  test('keeps its handle between the bounds, and reads before and after rather than left and right', async () => {
    await page(`<bry-split label="Board and details" ratio="30"><bry-text slot="first" text="a"></bry-text><bry-text slot="second" text="b"></bry-text></bry-split>`);

    const host = document.querySelector('bry-split') as HTMLElement & { updateComplete: Promise<unknown> };
    const handle = () => shadowOf('bry-split').querySelector('[role="separator"]')!;

    expect([handle().getAttribute('aria-valuenow'), handle().getAttribute('aria-valuemin'), handle().getAttribute('aria-valuemax')]).toEqual([
      '30',
      '20',
      '80',
    ]);
    expect(handle().getAttribute('aria-label')).toBe('Board and details');

    handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true, cancelable: true }));
    await host.updateComplete;
    expect(handle().getAttribute('aria-valuenow')).toBe('25');

    // It can't be driven shut.
    for (let press = 0; press < 5; press++) {
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, composed: true, cancelable: true }));
      await host.updateComplete;
    }
    expect(handle().getAttribute('aria-valuenow')).toBe('20');

    handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, composed: true, cancelable: true }));
    await host.updateComplete;
    expect(handle().getAttribute('aria-valuenow')).toBe('80');
    expect(host.style.getPropertyValue('--bry-ratio')).toBe('80%');
  });

  test('a ratio outside the bounds is brought inside, and one the app changes wins', async () => {
    await page(`<bry-split ratio="5"></bry-split>`);

    const host = document.querySelector('bry-split') as HTMLElement & { ratio: number; updateComplete: Promise<unknown> };

    expect(shadowOf('bry-split').querySelector('[role="separator"]')!.getAttribute('aria-valuenow')).toBe('20');

    host.ratio = 70;
    await host.updateComplete;
    expect(shadowOf('bry-split').querySelector('[role="separator"]')!.getAttribute('aria-valuenow')).toBe('70');
  });
});

describe('board and board column (A6-F06-S01)', () => {
  const moves: unknown[] = [];
  let listening = false;
  const listen = () => {
    moves.length = 0;
    if (listening) return;
    listening = true;
    document.body.addEventListener('move', event => moves.push((event as CustomEvent).detail));
  };
  const press = (element: Element, key: string) =>
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));

  const BOARD = `<bry-board label="Issues" card-size="md">
      <bry-board-column id="todo" title="To do" count="2"><bry-card id="c1" title="One"></bry-card><bry-card id="c2" title="Two"></bry-card></bry-board-column>
      <bry-board-column id="doing" title="Doing" count="0"></bry-board-column>
    </bry-board>`;

  test('a column names itself, counts its cards and says when it is empty', async () => {
    await page(BOARD);

    const todo = shadowOf('#todo');
    const doing = shadowOf('#doing');

    expect(todo.querySelector('section')!.getAttribute('aria-label')).toBe('To do');
    expect(todo.querySelector('[data-slot="board-column-count"]')!.textContent).toBe('2');
    expect(doing.querySelector('.empty')!.textContent).toBe('Nothing here yet.');
  });

  test('a card is picked up, steered and dropped on the keyboard, and the board says move once', async () => {
    await page(BOARD);
    listen();

    const board = document.querySelector('bry-board') as HTMLElement & { updateComplete: Promise<unknown> };
    const card = document.querySelector('#c1') as HTMLElement;

    // The column gives its cards the focus and says what they are.
    expect(card.tabIndex).toBe(0);
    expect(card.getAttribute('aria-roledescription')).toBe('card');

    press(card, ' ');
    await board.updateComplete;
    expect(shadowOf('bry-board').querySelector('[aria-live="assertive"]')!.textContent).toContain('c1 lifted');

    press(card, 'ArrowRight');
    await board.updateComplete;
    expect(shadowOf('bry-board').querySelector('[aria-live="assertive"]')!.textContent).toContain('Doing');

    press(card, ' ');
    await board.updateComplete;
    expect(moves).toEqual([{ card: 'c1', from: 'todo', to: 'doing', position: 0 }]);
  });

  test('Escape puts a card back, and dropping it where it started says nothing', async () => {
    await page(BOARD);
    listen();

    const board = document.querySelector('bry-board') as HTMLElement & { updateComplete: Promise<unknown> };
    const card = document.querySelector('#c2') as HTMLElement;

    press(card, ' ');
    press(card, 'ArrowRight');
    press(card, 'Escape');
    await board.updateComplete;
    expect(moves).toEqual([]);
    expect(shadowOf('bry-board').querySelector('[aria-live="assertive"]')!.textContent).toContain('Put back');

    press(card, ' ');
    press(card, ' ');
    await board.updateComplete;
    expect(moves).toEqual([]);
  });

  test('it tells the person how to move a card, once, for a screen reader', async () => {
    await page(BOARD);

    const how = shadowOf('bry-board').querySelector('#how')!;

    expect(how.textContent).toContain('Press Space to pick up a card');
    expect(shadowOf('bry-board').querySelector('[role="group"]')!.getAttribute('aria-describedby')).toBe('how');
  });

  test('left and right mean before and after: a key steers by the column order it is given', () => {
    const columns = ['todo', 'doing', 'done'];

    expect(steered('ArrowRight', false, { to: 'todo', position: 0 }, columns)).toEqual({ to: 'doing', position: 0 });
    expect(steered('ArrowRight', true, { to: 'doing', position: 1 }, columns)).toEqual({ to: 'todo', position: 1 });
    expect(steered('ArrowLeft', false, { to: 'todo', position: 0 }, columns)).toBeNull();
    expect(steered('ArrowDown', false, { to: 'todo', position: 0 }, columns)).toEqual({ to: 'todo', position: 1 });
    expect(steered('ArrowUp', false, { to: 'todo', position: 0 }, columns)).toEqual({ to: 'todo', position: 0 });
  });

  test('a pointer drop lands before the card it was let go above', () => {
    const cards = [
      { top: 0, height: 100 },
      { top: 100, height: 100 },
      { top: 200, height: 100 },
    ];

    expect(positionAt(cards, 10)).toBe(0);
    expect(positionAt(cards, 140)).toBe(1);
    expect(positionAt(cards, 290)).toBe(3);
    expect(positionAt([], 10)).toBe(0);
  });
});

describe('virtual list (A6-F06-S01)', () => {
  const heard: { name: string; detail: unknown }[] = [];
  const names = new Set<string>();
  const listen = (...events: string[]) => {
    heard.length = 0;
    for (const name of events) {
      if (names.has(name)) continue;
      names.add(name);
      document.body.addEventListener(name, event => heard.push({ name, detail: (event as CustomEvent).detail }));
    }
  };

  const LIST = `<bry-virtual-list label="Issues" count="1000" start="10" selectable selected="10" row-size="md">
      <div id="r10">Row 10</div><div id="r11">Row 11</div><div id="r12">Row 12</div>
    </bry-virtual-list>`;

  test('draws only the rows it was given, at their place in a list as tall as the whole', async () => {
    await page(LIST);

    const root = shadowOf('bry-virtual-list');

    expect(root.querySelector('[role="listbox"]')!.getAttribute('aria-label')).toBe('Issues');
    // 1000 rows at 3rem, and the window sits 10 rows down.
    expect(root.querySelector('.tall')!.getAttribute('style')).toContain('height: 3000rem');
    expect(root.querySelector('.window')!.getAttribute('style')).toContain('translateY(30rem)');

    // Each row says where it sits in the whole list, not in the window.
    const row = document.querySelector('#r11')!;

    expect([row.getAttribute('role'), row.getAttribute('aria-posinset'), row.getAttribute('aria-setsize')]).toEqual(['option', '12', '1000']);
  });

  test('the arrows, Home and End choose a row, and a press chooses the row pressed', async () => {
    await page(LIST);
    listen('select');

    const host = document.querySelector('bry-virtual-list') as HTMLElement & { updateComplete: Promise<unknown> };
    const box = shadowOf('bry-virtual-list').querySelector('[role="listbox"]')!;

    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true, cancelable: true }));
    await host.updateComplete;
    expect(heard).toEqual([{ name: 'select', detail: { index: 11 } }]);
    expect(document.querySelector('#r11')!.getAttribute('aria-selected')).toBe('true');

    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, composed: true, cancelable: true }));
    await host.updateComplete;
    expect(heard.at(-1)).toEqual({ name: 'select', detail: { index: 999 } });

    (document.querySelector('#r12') as HTMLElement).click();
    await host.updateComplete;
    expect(heard.at(-1)).toEqual({ name: 'select', detail: { index: 12 } });
  });

  test('a list that cannot be chosen from is a plain list, and says nothing on a press', async () => {
    await page(`<bry-virtual-list count="3" start="0"><div id="p0">a</div></bry-virtual-list>`);
    listen('select');

    expect(shadowOf('bry-virtual-list').querySelector('[role="list"]')).not.toBeNull();
    expect(document.querySelector('#p0')!.getAttribute('role')).toBe('listitem');
    (document.querySelector('#p0') as HTMLElement).click();
    expect(heard).toEqual([]);
  });

  test('loading shows the shell’s placeholder, and nothing at all shows the app’s words', async () => {
    await page(`<bry-virtual-list loading count="10"></bry-virtual-list>`);
    expect(shadowOf('bry-virtual-list').querySelector('[role="status"]')!.getAttribute('aria-label')).toBe('Loading');

    await page(`<bry-virtual-list count="0" empty="No issues yet."></bry-virtual-list>`);
    expect(shadowOf('bry-virtual-list').querySelector('[data-empty]')!.textContent).toContain('No issues yet.');
  });

  test('the window it asks for covers what is in view, with a few rows either side', () => {
    // 48px rows, a 480px viewport, scrolled to row 20: ten in view, six over each edge.
    expect(windowOf(960, 480, 48, 1_000)).toEqual({ start: 14, end: 36 });
    expect(windowOf(0, 480, 48, 1_000)).toEqual({ start: 0, end: 16 });
    // Never past the end, and nothing at all for an empty list.
    expect(windowOf(47_000, 480, 48, 1_000)).toEqual({ start: 973, end: 996 });
    expect(windowOf(0, 480, 48, 0)).toEqual({ start: 0, end: 0 });
  });

  test('where a key takes the choice, at either end of the list', () => {
    expect(movedTo('ArrowDown', 0, 3)).toBe(1);
    expect(movedTo('ArrowDown', 2, 3)).toBe(2);
    expect(movedTo('ArrowUp', 0, 3)).toBe(0);
    expect(movedTo('Home', 2, 3)).toBe(0);
    expect(movedTo('End', 0, 3)).toBe(2);
    expect(movedTo('Enter', 0, 3)).toBeNull();
    expect(movedTo('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('diff (A6-F06-S01)', () => {
  const heard: { name: string; detail: unknown }[] = [];
  const names = new Set<string>();
  const listen = (...events: string[]) => {
    heard.length = 0;
    for (const name of events) {
      if (names.has(name)) continue;
      names.add(name);
      document.body.addEventListener(name, event => heard.push({ name, detail: (event as CustomEvent).detail }));
    }
  };

  const PATCH = `@@ -1,3 +1,3 @@ header
 kept
-was this
+is this
 also kept`;

  test('reads hunks from unified diff text, numbering both sides', () => {
    const hunks = parseUnifiedDiff(`diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n${PATCH}\n\\ No newline at end of file`);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.lines).toEqual([
      { kind: 'context', old: 1, new: 1, text: 'kept' },
      { kind: 'remove', old: 2, text: 'was this' },
      { kind: 'add', new: 2, text: 'is this' },
      { kind: 'context', old: 3, new: 3, text: 'also kept' },
    ]);
    // Anything before the first hunk header belongs to no hunk.
    expect(parseUnifiedDiff('diff --git a/x b/x')).toEqual([]);
  });

  test('pairs a run of removals beside the additions after it', () => {
    const rows = splitRows([
      { kind: 'context', old: 1, new: 1, text: 'a' },
      { kind: 'remove', old: 2, text: 'b' },
      { kind: 'remove', old: 3, text: 'c' },
      { kind: 'add', new: 2, text: 'B' },
    ]);

    expect(rows).toEqual([
      { left: { kind: 'context', old: 1, new: 1, text: 'a' }, right: { kind: 'context', old: 1, new: 1, text: 'a' } },
      { left: { kind: 'remove', old: 2, text: 'b' }, right: { kind: 'add', new: 2, text: 'B' } },
      { left: { kind: 'remove', old: 3, text: 'c' }, right: undefined },
    ]);
  });

  test('every file opens at once only when they are all here and there is not much of them', () => {
    expect(opensAll([{ path: 'a', patch: 'x' }, { path: 'b', patch: 'y' }])).toBe(true);
    expect(opensAll([{ path: 'a', patch: 'x' }, { path: 'b' }])).toBe(false);
    expect(opensAll([{ path: 'a', patch: 'x'.repeat(DIFF_OPEN_UNDER + 1) }])).toBe(false);
  });

  test('draws each file’s changes, and a press on a line number chooses it', async () => {
    await page(`<bry-diff label="Changes"></bry-diff>`);

    const host = document.querySelector('bry-diff') as HTMLElement & { files: unknown; updateComplete: Promise<unknown> };

    listen('select', 'expand');
    host.files = [{ path: 'src/app.ts', status: 'modified', patch: PATCH }];
    await host.updateComplete;

    const root = shadowOf('bry-diff');

    expect(root.querySelector('.path')!.textContent).toBe('src/app.ts');
    expect(root.querySelector('[data-status="modified"]')!.textContent).toBe('Changed');
    expect(root.querySelector('.head')!.getAttribute('aria-expanded')).toBe('true');
    expect(Array.from(root.querySelectorAll('.text')).map(one => one.textContent)).toContain('was this');

    const numbers = Array.from(root.querySelectorAll('.number')).filter(one => one.textContent!.trim() !== '');

    (numbers[0] as HTMLButtonElement).click();
    await host.updateComplete;
    expect(heard).toEqual([{ name: 'select', detail: { file: 'src/app.ts', side: 'old', start: 1, end: 1 } }]);
  });

  test('Shift takes the run between, on one side of one file', async () => {
    await page(`<bry-diff></bry-diff>`);

    const host = document.querySelector('bry-diff') as HTMLElement & { files: unknown; updateComplete: Promise<unknown> };

    listen('select');
    host.files = [{ path: 'src/app.ts', patch: PATCH }];
    await host.updateComplete;

    const oldSide = Array.from(shadowOf('bry-diff').querySelectorAll('.number')).filter(
      one => one.getAttribute('aria-label')?.startsWith('Before'),
    ) as HTMLButtonElement[];

    oldSide[0]!.click();
    oldSide[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, shiftKey: true }));
    await host.updateComplete;

    expect(heard.at(-1)).toEqual({ name: 'select', detail: { file: 'src/app.ts', side: 'old', start: 1, end: 3 } });
    expect(shadowOf('bry-diff').querySelectorAll('.number.chosen')).toHaveLength(3);
  });

  test('a file the app has not sent asks for it when it is opened, once', async () => {
    await page(`<bry-diff></bry-diff>`);

    const host = document.querySelector('bry-diff') as HTMLElement & { files: unknown; updateComplete: Promise<unknown> };

    listen('expand');
    host.files = [{ path: 'big.ts' }];
    await host.updateComplete;

    // Closed, because its text isn't here.
    expect(shadowOf('bry-diff').querySelector('.head')!.getAttribute('aria-expanded')).toBe('false');

    (shadowOf('bry-diff').querySelector('.head') as HTMLButtonElement).click();
    await host.updateComplete;
    expect(heard).toEqual([{ name: 'expand', detail: { file: 'big.ts' } }]);
    expect(shadowOf('bry-diff').querySelector('.waiting')!.textContent).toContain('Loading');
  });

  test('nothing changed says so, and loading shows the shell’s placeholder', async () => {
    await page(`<bry-diff empty="No changes in this pull request."></bry-diff>`);
    expect(shadowOf('bry-diff').querySelector('.empty')!.textContent).toContain('No changes in this pull request.');

    await page(`<bry-diff loading></bry-diff>`);
    expect(shadowOf('bry-diff').querySelector('[role="status"]')!.getAttribute('aria-label')).toBe('Loading');
  });
});

describe('the token stylesheet (A6-F05-S01, A6-F06-S01)', () => {
  test('is Brydio’s own tokens.css, byte for byte', async () => {
    const here = readFileSync(join(import.meta.dir, '../src/web/tokens.css'), 'utf8');
    const brydio = await brydioAnswers('tokens-css', [TOKENS], () => {
      const theirs = readFileSync(inBrydio(TOKENS), 'utf8');

      return { sha256: new Bun.CryptoHasher('sha256').update(theirs).digest('hex'), bytes: theirs.length };
    });

    expect({ sha256: new Bun.CryptoHasher('sha256').update(here).digest('hex'), bytes: here.length }).toEqual(brydio);
  });

  test('switches every colour with a .dark class on the document', async () => {
    const style = document.createElement('style');

    style.textContent = readFileSync(join(import.meta.dir, '../src/web/tokens.css'), 'utf8');
    document.head.append(style);

    const read = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const light = ['--bg-surface', '--fg', '--line'].map(read);

    document.documentElement.classList.add('dark');

    const dark = ['--bg-surface', '--fg', '--line'].map(read);

    document.documentElement.classList.remove('dark');
    style.remove();

    expect(light.every(Boolean)).toBe(true);
    light.forEach((value, index) => expect(dark[index]).not.toBe(value));
  });
});

describe('table (A6-F06-S01)', () => {
  const COLUMNS = JSON.stringify([
    { key: 'title', heading: 'Title', sortable: true },
    { key: 'points', heading: 'Points', align: 'end' },
  ]).replace(/"/g, '&quot;');
  const ROWS = JSON.stringify([
    { id: 'a', cells: ['Fix the login', '3'] },
    { id: 'b', cells: ['Add dark mode', '5'] },
  ]).replace(/"/g, '&quot;');

  test('a sortable heading asks for a direction, and the heading shows what the app sent back', async () => {
    await page(`<bry-table columns="${COLUMNS}" rows="${ROWS}"></bry-table>`);

    const host = document.querySelector('bry-table') as HTMLElement & { sort: unknown; updateComplete: Promise<unknown> };
    const asked: unknown[] = [];

    host.addEventListener('sort', event => asked.push((event as CustomEvent).detail));

    const head = () => shadowOf('bry-table').querySelectorAll('th');

    // Only the column that says it can be sorted is a button.
    expect(shadowOf('bry-table').querySelectorAll('button.sort')).toHaveLength(1);
    expect(head()[0]!.hasAttribute('aria-sort')).toBe(false);

    shadowOf('bry-table').querySelector<HTMLElement>('[data-sort="title"]')!.click();
    expect(asked).toEqual([{ key: 'title', direction: 'asc' }]);

    // Nothing moves until the app sends the sort back: the rows are its own.
    expect(head()[0]!.hasAttribute('aria-sort')).toBe(false);

    host.sort = { key: 'title', direction: 'asc' };
    await host.updateComplete;
    expect(head()[0]!.getAttribute('aria-sort')).toBe('ascending');

    shadowOf('bry-table').querySelector<HTMLElement>('[data-sort="title"]')!.click();
    expect(asked[1]).toEqual({ key: 'title', direction: 'desc' });
  });

  test('a selectable table is one tab stop, moves on the arrows, and chooses on Enter', async () => {
    await page(`<bry-table selectable columns="${COLUMNS}" rows="${ROWS}" selected="a"></bry-table>`);

    const host = document.querySelector('bry-table') as HTMLElement & { updateComplete: Promise<unknown> };
    const chosen: unknown[] = [];

    host.addEventListener('select', event => chosen.push((event as CustomEvent).detail));

    const rows = () => Array.from(shadowOf('bry-table').querySelectorAll('tbody tr'));
    const body = shadowOf('bry-table').querySelector('tbody')!;

    expect(shadowOf('bry-table').querySelector('table')!.getAttribute('role')).toBe('grid');
    // A hundred rows are not a hundred tab stops: the chosen one holds it.
    expect(rows().map(row => row.getAttribute('tabindex'))).toEqual(['0', '-1']);
    expect(rows().map(row => row.getAttribute('aria-selected'))).toEqual(['true', 'false']);

    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true, cancelable: true }));
    await host.updateComplete;
    expect(rows().map(row => row.getAttribute('tabindex'))).toEqual(['-1', '0']);
    // Moving is not choosing: the app still says which row is chosen.
    expect(chosen).toEqual([]);
    expect(rows().map(row => row.getAttribute('aria-selected'))).toEqual(['true', 'false']);

    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true }));
    expect(chosen).toEqual([{ row: 'b' }]);

    rows()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(chosen[1]).toEqual({ row: 'a' });
  });

  test('a table nobody may pick has no grid, no tab stop and no select', async () => {
    await page(`<bry-table columns="${COLUMNS}" rows="${ROWS}"></bry-table>`);

    const host = document.querySelector('bry-table') as HTMLElement;
    const chosen: unknown[] = [];

    host.addEventListener('select', event => chosen.push((event as CustomEvent).detail));

    const rows = Array.from(shadowOf('bry-table').querySelectorAll('tbody tr'));

    expect(shadowOf('bry-table').querySelector('table')!.hasAttribute('role')).toBe(false);
    expect(rows.map(row => row.getAttribute('tabindex'))).toEqual([null, null]);
    rows[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(chosen).toEqual([]);
  });

  test('loading draws placeholder rows and says so; no rows draws the app’s words', async () => {
    await page(`<bry-table loading columns="${COLUMNS}"></bry-table>`);

    expect(shadowOf('bry-table').querySelector('table')!.getAttribute('aria-busy')).toBe('true');
    expect(shadowOf('bry-table').querySelectorAll('tr[data-loading]')).toHaveLength(3);

    await page(`<bry-table columns="${COLUMNS}" empty="No pull requests yet."></bry-table>`);

    const empty = shadowOf('bry-table').querySelector('tr[data-empty] td')!;

    expect(empty.textContent!.trim()).toBe('No pull requests yet.');
    expect(empty.getAttribute('colspan')).toBe('2');
  });

  test('a column or a row missing what it needs is left out, and a cell is text', async () => {
    const columns = JSON.stringify([{ key: 'title', heading: 'Title' }, { key: 'nope' }, 'rubbish']).replace(/"/g, '&quot;');
    const rows = JSON.stringify([{ cells: ['no id'] }, { id: 'a', cells: ['<b>not bold</b>'] }]).replace(/"/g, '&quot;');

    await page(`<bry-table columns="${columns}" rows="${rows}"></bry-table>`);

    expect(shadowOf('bry-table').querySelectorAll('th')).toHaveLength(1);
    expect(Array.from(shadowOf('bry-table').querySelectorAll('tbody tr')).map(row => row.getAttribute('data-row'))).toEqual(['a']);
    // Markup in a cell is what it says, not what it does.
    const cell = shadowOf('bry-table').querySelector('tbody td')!;

    expect(cell.textContent).toBe('<b>not bold</b>');
    expect(cell.querySelector('b')).toBeNull();
  });
});

describe('file grid (A6-F06-S01)', () => {
  const FILES = JSON.stringify([
    { id: 'f1', name: 'Plan.pdf', kind: 'pdf', size: 20_480, modified: '2026-09-01T10:00:00.000Z' },
    { id: 'f2', name: 'Shot.png', kind: 'image', preview: 'src_1' },
    { id: 'f3', name: 'Notes', kind: 'folder' },
  ]).replace(/"/g, '&quot;');
  const MENU = JSON.stringify([
    { id: 'rename', label: 'Rename' },
    { id: 'delete', label: 'Delete', tone: 'danger' },
  ]).replace(/"/g, '&quot;');

  const tiles = () => Array.from(shadowOf('bry-file-grid').querySelectorAll('.tile[data-file]'));

  test('says what each file is and what it weighs, and never fetches a preview', async () => {
    await page(`<bry-file-grid count="3" files="${FILES}"></bry-file-grid>`);

    expect(tiles().map(tile => tile.getAttribute('data-file'))).toEqual(['f1', 'f2', 'f3']);
    expect(tiles()[0]!.querySelector('.name')!.textContent!.trim()).toBe('Plan.pdf');
    expect(tiles()[0]!.querySelector('.mark')!.textContent!.trim()).toBe('PDF');
    expect(tiles()[0]!.querySelector('.meta')!.textContent).toContain('20 KB');
    expect(tiles()[0]!.querySelector('.meta')!.textContent).toContain('2026-09-01');
    // A preview is a Brydio source id, and this build has no session to read
    // it with: no image is drawn and nothing is asked for.
    expect(shadowOf('bry-file-grid').querySelector('img')).toBeNull();
    // Each tile says where it sits in the whole folder, not in the window.
    expect(tiles()[2]!.getAttribute('aria-posinset')).toBe('3');
    expect(tiles()[2]!.getAttribute('aria-setsize')).toBe('3');
  });

  test('a press opens when nothing is selectable, and chooses when it is', async () => {
    await page(`<bry-file-grid count="3" files="${FILES}"></bry-file-grid>`);

    const host = document.querySelector('bry-file-grid') as HTMLElement & { selectable: boolean; selected: string[]; updateComplete: Promise<unknown> };
    const opened: unknown[] = [];
    const chosen: unknown[] = [];

    host.addEventListener('open', event => opened.push((event as CustomEvent).detail));
    host.addEventListener('select', event => chosen.push((event as CustomEvent).detail));

    tiles()[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(opened).toEqual([{ id: 'f2' }]);
    expect(chosen).toEqual([]);

    host.selectable = true;
    await host.updateComplete;

    tiles()[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(chosen).toEqual([{ ids: ['f2'] }]);
    // Now a press chooses, and opening is the second press.
    expect(opened).toHaveLength(1);

    tiles()[1]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    expect(opened).toEqual([{ id: 'f2' }, { id: 'f2' }]);
  });

  test('⌘ adds one and takes it away again, and Shift takes everything between', async () => {
    await page(`<bry-file-grid selectable count="3" files="${FILES}" selected="[&quot;f1&quot;]"></bry-file-grid>`);

    const host = document.querySelector('bry-file-grid') as HTMLElement & { selected: string[]; updateComplete: Promise<unknown> };
    const chosen: { ids: string[] }[] = [];

    host.addEventListener('select', event => chosen.push((event as CustomEvent).detail as { ids: string[] }));

    tiles()[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, metaKey: true }));
    expect(chosen[0]).toEqual({ ids: ['f1', 'f3'] });

    host.selected = ['f1', 'f3'];
    await host.updateComplete;
    tiles()[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, metaKey: true }));
    expect(chosen[1]).toEqual({ ids: ['f1'] });

    // An anchor, then everything between it and here.
    tiles()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    tiles()[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, shiftKey: true }));
    expect(chosen.at(-1)).toEqual({ ids: ['f1', 'f2', 'f3'] });
  });

  test('Enter opens the tile in hand, Space chooses it, and the arrows move between them', async () => {
    await page(`<bry-file-grid selectable count="3" files="${FILES}"></bry-file-grid>`);

    const host = document.querySelector('bry-file-grid') as HTMLElement & { updateComplete: Promise<unknown> };
    const opened: unknown[] = [];
    const chosen: unknown[] = [];

    host.addEventListener('open', event => opened.push((event as CustomEvent).detail));
    host.addEventListener('select', event => chosen.push((event as CustomEvent).detail));

    const press = (tile: Element, key: string) =>
      tile.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }));

    // One tile in the tab order, as a grid of a hundred files must be.
    expect(tiles().map(tile => tile.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    press(tiles()[0]!, 'Enter');
    expect(opened).toEqual([{ id: 'f1' }]);

    press(tiles()[0]!, ' ');
    expect(chosen).toEqual([{ ids: ['f1'] }]);

    press(tiles()[0]!, 'ArrowRight');
    await host.updateComplete;
    expect(tiles().map(tile => tile.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  test('one menu serves every tile, and choosing says which file and which item', async () => {
    await page(`<bry-file-grid count="3" files="${FILES}" menu="${MENU}"></bry-file-grid>`);

    const host = document.querySelector('bry-file-grid') as HTMLElement & { updateComplete: Promise<unknown> };
    const asked: unknown[] = [];
    const opened: unknown[] = [];

    host.addEventListener('menu', event => asked.push((event as CustomEvent).detail));
    host.addEventListener('open', event => opened.push((event as CustomEvent).detail));

    const more = shadowOf('bry-file-grid').querySelector<HTMLElement>('[data-menu-for="f2"]')!;

    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await host.updateComplete;

    const items = Array.from(shadowOf('bry-file-grid').querySelectorAll('[role="menuitem"]'));

    expect(items.map(item => item.textContent!.trim())).toEqual(['Rename', 'Delete']);
    expect(items[1]!.classList.contains('danger')).toBe(true);

    items[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(asked).toEqual([{ file: 'f2', item: 'rename' }]);
    // Reaching for the menu is not opening the file.
    expect(opened).toEqual([]);
  });

  test('loading says so, an empty folder says the app’s words, and a file needs a name', async () => {
    await page(`<bry-file-grid loading count="9"></bry-file-grid>`);

    expect(shadowOf('bry-file-grid').querySelector('[role="status"]')!.getAttribute('aria-label')).toBe('Loading');

    await page(`<bry-file-grid count="0" empty="This folder is empty."></bry-file-grid>`);
    expect(shadowOf('bry-file-grid').querySelector('[data-empty]')!.textContent).toContain('This folder is empty.');

    const half = JSON.stringify([{ id: 'f1' }, { name: 'No id' }, { id: 'f2', name: 'Kept', kind: 'code' }]).replace(/"/g, '&quot;');

    await page(`<bry-file-grid count="3" files="${half}"></bry-file-grid>`);
    expect(tiles().map(tile => tile.getAttribute('data-file'))).toEqual(['f2']);
  });
});

// ADR-A23 (catalogue-a)
describe('the shadcn elements, drawn (ADR-A23)', () => {
  const heard: { name: string; detail: unknown }[] = [];

  for (const name of ['change', 'select', 'open', 'close', 'action', 'remove', 'retry']) {
    document.body.addEventListener(name, event => heard.push({ name, detail: (event as CustomEvent).detail }));
  }

  test('every one draws something of its own, rather than falling back to its children', async () => {
    const drawn = [
      `<bry-accordion sections='[{"id":"a","title":"First"}]'><bry-text text="x"></bry-text></bry-accordion>`,
      `<bry-alert title="Sync is on" tone="success"></bry-alert>`,
      `<bry-aspect-ratio ratio="4:3"></bry-aspect-ratio>`,
      `<bry-attachment name="Brief.docx" kind="document" bytes="48200" pressable removable></bry-attachment>`,
      `<bry-breadcrumb items='[{"id":"a","label":"All"},{"id":"b","label":"Here"}]'></bry-breadcrumb>`,
      `<bry-bubble text="Hello" from="self"></bry-bubble>`,
      `<bry-carousel label="Shots"><bry-text text="1"></bry-text><bry-text text="2"></bry-text></bry-carousel>`,
      `<bry-chart kind="bar" label="Issues" categories='["W1","W2"]' series='[{"name":"Opened","values":[3,4]}]'></bry-chart>`,
      `<bry-collapsible title="Details"></bry-collapsible>`,
      `<bry-kbd text="mod+k"></bry-kbd>`,
      `<bry-marker text="Today"></bry-marker>`,
      `<bry-message name="Ada Lovelace" meta="09:41"></bry-message>`,
      `<bry-message-scroller label="Thread" empty="Say hello."></bry-message-scroller>`,
      `<bry-popover title="Snooze"><bry-button label="Snooze"></bry-button></bry-popover>`,
      `<bry-hover-card><bry-button label="Ada"></bry-button></bry-hover-card>`,
      `<bry-tooltip text="Archive"><bry-button label="Archive"></bry-button></bry-tooltip>`,
      `<bry-progress label="Import" value="60"></bry-progress>`,
      `<bry-scroll-area label="Activity"></bry-scroll-area>`,
      `<bry-separator></bry-separator>`,
      `<bry-spinner label="Syncing"></bry-spinner>`,
      `<bry-tabs tabs='[{"id":"a","label":"A"},{"id":"b","label":"B"}]'></bry-tabs>`,
      `<bry-item title="Email" variant="outline"></bry-item>`,
    ];

    for (const markup of drawn) {
      await page(markup);

      const element = document.body.firstElementChild!;

      expect({ markup, drawn: (element.shadowRoot?.children.length ?? 0) > 0 && element.shadowRoot!.innerHTML.replace(/<!--[^]*?-->/g, '').trim() !== '<slot></slot>' }).toEqual({
        markup,
        drawn: true,
      });
    }
  });

  test('a chart draws each series in the chart colours, and folds a pie into five slices and Other', async () => {
    await page(`<bry-chart kind="bar" label="Issues" categories='["W1","W2"]' series='[{"name":"Opened","values":[3,4]},{"name":"Closed","values":[1,2]}]'></bry-chart>`);

    const bars = Array.from(shadowOf('bry-chart').querySelectorAll('rect'), rect => rect.getAttribute('fill'));

    expect(new Set(bars)).toEqual(new Set(['var(--chart-1)', 'var(--chart-2)']));
    expect(shadowOf('bry-chart').querySelector('.legend')!.textContent!.replace(/\s+/g, '')).toBe('OpenedClosed');

    await page(`<bry-chart kind="pie" label="By label" categories='["a","b","c","d","e","f","g"]' series='[{"name":"n","values":[7,6,5,4,3,2,1]}]'></bry-chart>`);
    expect(shadowOf('bry-chart').querySelector('.legend')!.textContent!.replace(/\s+/g, '')).toBe('abcdeOther');
  });

  test('tabs and an accordion show the chosen child and say what was chosen', async () => {
    await page(`<bry-tabs tabs='[{"id":"a","label":"A"},{"id":"b","label":"B"}]'><bry-text text="one"></bry-text><bry-text text="two"></bry-text></bry-tabs>`);
    heard.length = 0;

    (shadowOf('bry-tabs').querySelector('[data-tab="b"]') as HTMLButtonElement).click();
    await settle();

    expect(heard).toEqual([{ name: 'change', detail: { id: 'b' } }]);
    expect(shadowOf('bry-tabs').querySelector('#panel-b')!.hasAttribute('hidden')).toBe(false);

    await page(`<bry-accordion sections='[{"id":"a","title":"First"},{"id":"b","title":"Second"}]'><bry-text text="1"></bry-text><bry-text text="2"></bry-text></bry-accordion>`);
    heard.length = 0;

    (shadowOf('bry-accordion').querySelector('[data-section="b"] button') as HTMLButtonElement).click();
    await settle();

    expect(heard).toEqual([{ name: 'change', detail: { expanded: ['b'] } }]);
  });

  test('a modal shares the one dialog slot with bry-dialog', async () => {
    await page(`<bry-dialog open title="First"></bry-dialog><bry-sheet open title="Second"></bry-sheet>`);

    expect(heard.some(one => one.name === 'close' && (one.detail as { refused?: string } | undefined)?.refused?.includes('already open'))).toBe(true);
    expect(shadowOf('bry-sheet').querySelector('dialog')).toBeNull();
  });
});
