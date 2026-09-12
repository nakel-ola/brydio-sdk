import { describe, expect, test } from 'bun:test';

import {
  CATALOGUE,
  ELEMENT_NAMES,
  checkChild,
  checkElement,
  checkEvent,
  checkProp,
  eventOfHandler,
  handlerName,
  type ElementAttributes,
  type PropSpec,
} from '../src/index.ts';

// Whole-list assertions (A6-F04-TC001): written over every element, so an
// element added tomorrow is covered on the day it is added.
describe('the catalogue as a whole', () => {
  test('has the five Phase 0 elements, all named bry-', () => {
    expect(ELEMENT_NAMES).toEqual(['bry-stack', 'bry-heading', 'bry-text', 'bry-button', 'bry-card']);
    for (const name of ELEMENT_NAMES) expect(name.startsWith('bry-')).toBe(true);
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

  test('names no element for chrome the shell owns', () => {
    for (const name of ELEMENT_NAMES) expect(name).not.toMatch(/theme|titlebar|nav|sidebar/);
  });

  test('matches contracts §10 value for value', () => {
    expect(CATALOGUE['bry-stack'].props.gap.values).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(CATALOGUE['bry-stack'].props.direction.default).toBe('column');
    expect(CATALOGUE['bry-heading'].props.level.values).toEqual([1, 2, 3]);
    expect(CATALOGUE['bry-text'].props.tone.values).toEqual(['default', 'muted', 'danger']);
    expect(CATALOGUE['bry-button'].props.variant.values).toEqual(['primary', 'secondary', 'ghost', 'danger']);
    expect(CATALOGUE['bry-card'].props.padding.values).toEqual(['2', '3', '4', '5', '6']);
    expect(Object.keys(CATALOGUE['bry-button'].events)).toEqual(['press']);
    expect(CATALOGUE['bry-card'].events.press.when).toBe('pressable');
  });
});

describe('the checks', () => {
  test('refuse an element outside the list and accept text nodes', () => {
    expect(checkElement('bry-card')).toBeNull();
    expect(checkElement('#text')).toBeNull();
    expect(checkElement('div')).toContain('"div" is not an element');
    expect(checkElement('bry-titlebar')).toContain('"bry-titlebar"');
  });

  test('refuse an unknown setting, and say why for style', () => {
    expect(checkProp('bry-stack', 'gap', '3')).toBeNull();
    expect(checkProp('bry-stack', 'padding', '3')).toContain('no "padding" setting');
    expect(checkProp('bry-text', 'style', { color: 'red' })).toContain('no `style` setting');
    expect(checkProp('bry-text', 'className', 'x')).toContain('no classes');
  });

  test('refuse a value outside a setting’s list', () => {
    expect(checkProp('bry-stack', 'gap', '9')).toContain('not "9"');
    expect(checkProp('bry-stack', 'gap', 3)).toContain('not 3');
    expect(checkProp('bry-heading', 'level', 4)).toContain('not 4');
    expect(checkProp('bry-button', 'disabled', 'yes')).toContain('true or false');
    expect(checkProp('bry-text', 'text', 12)).toContain('is text');
    expect(checkProp('bry-text', 'tone', undefined)).toBeNull();
  });

  test('know which events each element raises', () => {
    expect(checkEvent('bry-button', 'press')).toBeNull();
    expect(checkEvent('bry-stack', 'press')).toContain('raises no events');
    expect(checkEvent('bry-button', 'change')).toContain('not "change"');
    expect(handlerName('press')).toBe('onPress');
    expect(eventOfHandler('onPress')).toBe('press');
    expect(eventOfHandler('online')).toBeNull();
  });

  test('know what each element may hold', () => {
    expect(checkChild('bry-stack', 'bry-card')).toBeNull();
    expect(checkChild('bry-stack', '#text')).toContain('Put the words in a <bry-text>');
    expect(checkChild('bry-text', '#text')).toBeNull();
    expect(checkChild('bry-text', 'bry-card')).toContain('holds text only');
    expect(checkChild('bry-button', '#text')).toContain('holds nothing');
  });
});

describe('the derived types', () => {
  test('accept the catalogue’s values and refuse others at compile time', () => {
    const fine: ElementAttributes<'bry-stack'> = { direction: 'row', gap: '3', wrap: true };
    const button: ElementAttributes<'bry-button'> = { label: 'Save', onPress: () => {} };
    // @ts-expect-error: 9 is not on the spacing scale.
    const wrongGap: ElementAttributes<'bry-stack'> = { gap: '9' };
    // @ts-expect-error: there is no style setting.
    const styled: ElementAttributes<'bry-text'> = { style: 'color: red' };
    // @ts-expect-error: a stack raises no events.
    const pressedStack: ElementAttributes<'bry-stack'> = { onPress: () => {} };

    expect([fine, button, wrongGap, styled, pressedStack]).toHaveLength(5);
  });
});
