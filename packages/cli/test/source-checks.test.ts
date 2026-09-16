import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkSource } from '../src/index.ts';

/** `[line, code]` for each problem, which is what a builder looks for first. */
const found = (source: string, file = 'screen.tsx') => checkSource(file, source).map(problem => [problem.line, problem.code]);
const codes = (source: string, file = 'screen.tsx') => checkSource(file, source).map(problem => problem.code);

describe('elements and settings, in JSX', () => {
  test('an element Brydio does not have, with its file, line and column', () => {
    const [problem] = checkSource('src/screens/home.tsx', 'const a = 1;\nconst x = (\n  <bry-stack>\n    <bry-table />\n  </bry-stack>\n);');

    expect(problem).toMatchObject({ code: 'element_unknown', file: 'src/screens/home.tsx', line: 4, column: 6 });
    expect(problem!.message).toContain('"bry-table"');
    expect(codes('const x = <div />;')).toEqual(['element_unknown']);
    expect(codes('const x = <svg:rect />;')).toEqual(['element_unknown']);
  });

  test('a setting the element does not take, naming the element and the setting', () => {
    const [problem] = checkSource('a.tsx', '<bry-button label="Save" tone="danger" />');

    expect(problem).toMatchObject({ code: 'prop_unknown', message: 'bry-button has no setting called "tone".' });
  });

  test('a value outside the setting’s list, written out or in either branch of a condition', () => {
    expect(found('<bry-stack gap="9" />')).toEqual([[1, 'prop_value_invalid']]);
    expect(codes('<bry-heading text="Hi" level={4} />')).toEqual(['prop_value_invalid']);
    expect(codes('<bry-heading text="Hi" level="2" />')).toEqual(['prop_value_invalid']);
    expect(codes('<bry-button label="Go" disabled="yes" />')).toEqual(['prop_value_invalid']);
    expect(codes('<bry-text text="Hi" tone={done ? "muted" : "loud"} />')).toEqual(['prop_value_invalid']);
    expect(codes(`<bry-text text={\`${'x'.repeat(4_001)}\`} />`)).toEqual(['prop_value_invalid']);
  });

  test('a style, a class or a colour, whatever the element', () => {
    expect(codes('<bry-stack style={{ color: "red" }} />')).toEqual(['style_forbidden']);
    expect(codes('<bry-card className="box" />')).toEqual(['style_forbidden']);
    expect(codes('<bry-text text="x" class="big" colour="red" />')).toEqual(['style_forbidden', 'style_forbidden']);
    expect(codes('<bry-stack {...{ style: s }} />')).toEqual(['style_forbidden']);
  });

  test('a handler for an event the element does not raise', () => {
    expect(checkSource('a.tsx', '<bry-text text="x" onPress={go} />')[0]).toMatchObject({
      code: 'event_unknown',
      message: 'bry-text raises no events, so it takes no onPress.',
    });
    expect(codes('<bry-button label="x" onHover={go} />')).toEqual(['event_unknown']);
  });

  test('a setting the element cannot be drawn without', () => {
    expect(checkSource('a.tsx', '<bry-button variant="primary" />')[0]).toMatchObject({ code: 'prop_required', message: 'bry-button needs a label.' });
    expect(codes('<bry-heading level={1} />')).toEqual(['prop_required']);
  });

  test('children inside an element that holds none', () => {
    expect(codes('<bry-text>Hello</bry-text>')).toEqual(['prop_required', 'children_not_allowed']);
    expect(codes('<bry-button label="x">{icon}</bry-button>')).toEqual(['children_not_allowed']);
    expect(checkSource('a.tsx', '<bry-button label="x"><bry-text text="y" /></bry-button>')[0]!.message).toBe(
      'bry-button can’t hold other nodes. Give it its words as label="…".',
    );
  });
});

describe('elements and settings, without JSX', () => {
  test('h and createElement from @brydio/app or Preact', () => {
    expect(codes("import { h } from '@brydio/app';\nh('span', null);", 'a.ts')).toEqual(['element_unknown']);
    expect(codes("import { createElement as make } from 'preact';\nmake('bry-stack', { gap: '12' });", 'a.ts')).toEqual(['prop_value_invalid']);
    expect(codes("import { h } from '@brydio/app';\nh('bry-button', { onPress: go });", 'a.ts')).toEqual(['prop_required']);
    expect(codes("import { h } from '@brydio/app';\nh('#text', null);", 'a.ts')).toEqual([]);
  });

  test('the plain factories', () => {
    const source = [
      "import { button, stack, text as words } from '@brydio/app';",
      "stack({ gap: '3' }, button({ label: 'Save', variant: 'loud' }));",
      "words({ tone: 'muted' });",
      "button({ label: 'Go', style: 'x' });",
    ].join('\n');

    expect(found(source, 'a.ts')).toEqual([
      [2, 'prop_value_invalid'],
      [3, 'prop_required'],
      [4, 'style_forbidden'],
    ]);
  });
});

describe('what a worker does not have', () => {
  test('a page, a network, storage and other workers, each with its own code', () => {
    const source = [
      'document.title = "x";',
      'window.addEventListener("x", go);',
      'fetch("/api");',
      'new XMLHttpRequest();',
      'new WebSocket("wss://x");',
      'localStorage.setItem("a", "b");',
      'indexedDB.open("x");',
      'navigator.storage.estimate();',
      'navigator.sendBeacon("/x");',
      'new Worker("x.js");',
      'importScripts("x.js");',
      'self.fetch("/api");',
      'globalThis["caches"].open("x");',
      'const load = () => import("https://cdn.example.com/x.js");',
      'eval("1");',
      'new Function("return 1");',
    ].join('\n');

    expect(found(source, 'a.ts')).toEqual([
      [1, 'dom_global'],
      [2, 'dom_global'],
      [3, 'network_global'],
      [4, 'network_global'],
      [5, 'network_global'],
      [6, 'storage_global'],
      [7, 'storage_global'],
      [8, 'storage_global'],
      [9, 'network_global'],
      [10, 'worker_global'],
      [11, 'worker_global'],
      [12, 'network_global'],
      [13, 'storage_global'],
      [14, 'network_global'],
      [15, 'eval_forbidden'],
      [16, 'eval_forbidden'],
    ]);
  });
});

describe('no false alarms', () => {
  test('words in strings, comments and JSX text are not code', () => {
    const source = [
      '// fetch("/api") and <div> in a comment',
      '/* document.title, <bry-table /> */',
      'const help = "call fetch() or use <div style={x}>";',
      'const more = `localStorage is ${"not"} here`;',
      '<bry-stack><bry-card title="fetch, document, <div>">window and style="x"</bry-card></bry-stack>;',
    ].join('\n');

    expect(checkSource('a.tsx', source)).toEqual([]);
  });

  test('a name the file declares is its own, not the worker’s', () => {
    const source = [
      "import { fetch } from './api.ts';",
      'function load(document: { title: string }) { return document.title; }',
      'const { caches } = store;',
      'const window = { width: 3 };',
      'fetch(); window.width;',
    ].join('\n');

    expect(checkSource('a.ts', source)).toEqual([]);
  });

  test('keys, members and types that share a global’s name', () => {
    const source = [
      'interface Page { document: string; fetch(): void; window: Window }',
      'type Loader = typeof fetch;',
      'const record = { document: 1, fetch: 2, style: 3, className: "x" };',
      'record.document; record.fetch; record.style;',
      'class Store { fetch() {} window = 1; }',
    ].join('\n');

    expect(checkSource('a.ts', source)).toEqual([]);
  });

  test('generics, comparisons and components are not elements', () => {
    const source = [
      "import { useState } from '@brydio/app/preact';",
      'const [a, setA] = useState<string>("");',
      'if (a.length <b) {}',
      'const Row = (props: { title: string }) => <bry-card title={props.title} />;',
      'const list = <Row title="x" style="anything" />;',
      'const many = <><bry-text text="a" /><ui.Thing /></>;',
    ].join('\n');

    expect(checkSource('a.tsx', source)).toEqual([]);
  });

  test('values worked out at run time, spreads and handlers the element raises', () => {
    const source = [
      '<bry-stack gap={gap} direction={row ? "row" : "column"} wrap>',
      '  <bry-button label={label} {...rest} onPress={() => go()} key="k" ref={r} />',
      '  <bry-button {...props} />',
      '  <bry-text text={`${count} left`} tone={tone as "muted"} />',
      '  <bry-card pressable onPress={open}>{items.map(item => <bry-text key={item.id} text={item.title} />)}</bry-card>',
      '</bry-stack>;',
    ].join('\n');

    expect(checkSource('a.tsx', source)).toEqual([]);
  });

  test('a local function called text or h is not a factory', () => {
    const source = ['const text = (o: object) => o;', "text({ style: 'x' });", "function h(tag: string) { return tag; }\nh('div');"].join('\n');

    expect(checkSource('a.ts', source)).toEqual([]);
  });

  test('the template and the Issues app pass as they are', () => {
    const roots = [join(import.meta.dir, '../../../templates/preact/src'), join(import.meta.dir, '../../../../brydio-issues/src')];

    for (const root of roots) {
      let names: string[];

      try {
        names = readdirSync(root, { recursive: true }) as string[];
      } catch {
        continue;
      }

      for (const name of names.filter(one => /\.[jt]sx?$/.test(one))) {
        expect({ name, problems: checkSource(name, readFileSync(join(root, name), 'utf8')) }).toEqual({ name, problems: [] });
      }
    }
  });
});

test('a file that does not parse says so, and nothing more', () => {
  const problems = checkSource('a.tsx', 'const x = <bry-stack gap="9">;\n');

  expect(problems.length).toBeGreaterThan(0);
  expect(new Set(problems.map(problem => problem.code))).toEqual(new Set(['source_syntax']));
});
