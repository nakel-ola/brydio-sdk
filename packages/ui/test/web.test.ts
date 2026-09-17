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
