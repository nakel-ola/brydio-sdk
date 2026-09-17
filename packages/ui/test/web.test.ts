import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOGUE, ELEMENT_NAMES, type ElementSpec } from '../src/catalogue.ts';

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

describe('the token stylesheet (A6-F05-S01, A6-F06-S01)', () => {
  const brydio = join(import.meta.dir, '../../../../brydio/packages/ui/src/styles/tokens.css');

  test.skipIf(!existsSync(brydio))('is Brydio’s own tokens.css, byte for byte', () => {
    expect(readFileSync(join(import.meta.dir, '../src/web/tokens.css'), 'utf8')).toBe(readFileSync(brydio, 'utf8'));
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
