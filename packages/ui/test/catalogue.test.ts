import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
const hostElements = join(brydio, 'packages/app/src/apps/catalogue/elements.ts');

describe('the catalogue as a whole', () => {
  test('has the five Phase 0 elements, all named bry-', () => {
    expect(ELEMENT_NAMES).toEqual(['bry-stack', 'bry-heading', 'bry-text', 'bry-button', 'bry-card']);
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
        if (spec.kind === 'text') expect(['text', 'label', 'title']).toContain(prop);
      }
    }
  });
});

describe('the same as Brydio’s receiver', () => {
  test.skipIf(!existsSync(hostElements))('declares exactly what packages/app/src/apps/catalogue/elements.ts declares', async () => {
    const host = await import(hostElements);

    expect(JSON.parse(JSON.stringify(CATALOGUE))).toEqual(JSON.parse(JSON.stringify(host.ELEMENTS)));
    expect(host.TEXT_NODE).toBe('#text');
  });

  test.skipIf(!existsSync(hostElements))('refuses with the host’s own sentences', async () => {
    const host = await import(hostElements);
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

    expect([fine, unlabelled, wide, pressed]).toHaveLength(4);
  });
});
