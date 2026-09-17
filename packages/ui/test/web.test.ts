import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOGUE, ELEMENT_NAMES, type ElementSpec } from '../src/catalogue.ts';

// A page for this file only, so no other test in the repository gets a DOM.
GlobalRegistrator.register();
afterAll(() => GlobalRegistrator.unregister());

const { attributeOf, defineCatalogue } = await import('../src/web/index.ts');

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

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
