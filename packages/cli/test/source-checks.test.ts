import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkSource } from '../src/index.ts';

/** `[line, code]` for each problem, which is what a builder looks for first. */
const found = (source: string, file = 'screen.tsx') => checkSource(file, source).map(problem => [problem.line, problem.code]);
const codes = (source: string, file = 'screen.tsx') => checkSource(file, source).map(problem => problem.code);

describe('elements and settings, in JSX', () => {
  test('an element Brydio does not have, with its file, line and column', () => {
    const [problem] = checkSource('src/screens/home.tsx', 'const a = 1;\nconst x = (\n  <bry-stack>\n    <bry-hologram />\n  </bry-stack>\n);');

    expect(problem).toMatchObject({ code: 'element_unknown', file: 'src/screens/home.tsx', line: 4, column: 6 });
    expect(problem!.message).toContain('"bry-hologram"');
    expect(codes('const x = <div />;')).toEqual(['element_unknown']);
    expect(codes('const x = <svg:rect />;')).toEqual(['element_unknown']);
  });

  test('a setting the element does not take, naming the element and the setting', () => {
    const [problem] = checkSource('a.tsx', '<bry-button label="Save" tone="danger" />');

    expect(problem).toMatchObject({ code: 'prop_unknown', message: 'bry-button has no setting called "tone".' });
  });

  test('a value outside the setting’s list, written out or in either branch of a condition', () => {
    expect(found('<bry-stack gap="9" />')).toEqual([[1, 'prop_value_invalid']]);
    expect(codes('<bry-heading text="Hi" level={5} />')).toEqual(['prop_value_invalid']);
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

describe('the elements added after Phase 0', () => {
  test('are known, with their own settings, events and children', () => {
    const source = [
      '<bry-grid columns="3" gap="4">',
      '  <bry-label text="Status" required><bry-select options={statuses} value={status} onChange={pick} /></bry-label>',
      '  <bry-list-row title="Fix the door" pressable onPress={open}><bry-badge text="bug" tone="danger" /><bry-avatar name="Ada" size="sm" /></bry-list-row>',
      '  <bry-empty-state title="No issues yet" action="New issue" onAction={create} />',
      '  <bry-input value={title} kind="email" onChange={type} onSubmit={save} />',
      '  <bry-textarea value={body} maxLength={4000} onChange={type} />',
      '  <bry-skeleton shape="row" count={3} />',
      '</bry-grid>;',
    ].join('\n');

    expect(checkSource('a.tsx', source)).toEqual([]);
    expect(found('<bry-grid columns="7" />')).toEqual([[1, 'prop_value_invalid']]);
    expect(codes('<bry-select value="a" />')).toEqual(['prop_required']);
    expect(codes('<bry-badge text="x" tone="muted" onPress={go} />')).toEqual(['prop_value_invalid', 'event_unknown']);
    expect(codes('<bry-textarea onSubmit={go} />')).toEqual(['event_unknown']);
    expect(codes('<bry-avatar name="Ada" src="https://x/a.png" />')).toEqual(['prop_unknown']);
    expect(codes('<bry-empty-state title="x">more</bry-empty-state>')).toEqual(['children_not_allowed']);
    expect(codes("import { listRow, skeleton } from '@brydio/app';\nlistRow({ tone: 'x' });\nskeleton({ count: 20 });", 'a.ts')).toEqual([
      'prop_unknown',
      'prop_value_invalid',
    ]);
  });
});

describe('the elements added in Wren’s eight', () => {
  test('are known, with their own settings, events and children', () => {
    const source = [
      '<bry-split ratio={40} label="Issues and detail">',
      '  <bry-virtual-list count={issues.length} start={start} rowSize="md" selectable onRange={load} onSelect={open}>{rows}</bry-virtual-list>',
      '  <bry-stack>',
      '    <bry-table columns={columns} rows={rows} sort={sort} selectable selected="a" empty="No issues" onSort={order} onSelect={open} />',
      '    <bry-menu items={items} onSelect={act}><bry-button label="More" /></bry-menu>',
      '    <bry-dialog open={asking} title="Delete this issue?" cancel="Keep it" actions={actions} onAction={act} onClose={close}><bry-text text="It goes for everyone." /></bry-dialog>',
      '    <bry-date value="2026-09-16" min="2026-01-01" label="Due" onChange={due} />',
      '    <bry-checkbox label="Done" checked onChange={tick} />',
      '    <bry-switch label="Notify me" checked={false} onChange={tick} />',
      '  </bry-stack>',
      '</bry-split>;',
    ].join('\n');

    expect(checkSource('a.tsx', source)).toEqual([]);
    expect(found('<bry-split ratio={90} />')).toEqual([[1, 'prop_value_invalid']]);
    expect(codes('<bry-table rows={rows} />')).toEqual(['prop_required']);
    expect(codes('<bry-checkbox checked />')).toEqual(['prop_required']);
    expect(codes('<bry-virtual-list count={3} rowSize="xl" onPress={go} />')).toEqual(['prop_value_invalid', 'event_unknown']);
    expect(codes('<bry-split onChange={go} />')).toEqual(['event_unknown']);
    expect(codes('<bry-date value="16 September 2026" />')).toEqual(['prop_value_invalid']);
    expect(codes('<bry-switch label="x">on</bry-switch>')).toEqual(['children_not_allowed']);
    expect(codes("import { table, switchElement } from '@brydio/app';\ntable({ columns, width: 3 });\nswitchElement({ label: 'x', checked: 'yes' });", 'a.ts')).toEqual([
      'prop_unknown',
      'prop_value_invalid',
    ]);
    expect(
      codes("import { board, boardColumn, markdown, diff } from '@brydio/app';\nboard({ cardSize: 'xl' });\nboardColumn({ title: 'x', count: -1 });\nmarkdown({ text: 'x', open: true });\ndiff({ files: [], onPress: go });", 'a.ts'),
    ).toEqual(['prop_value_invalid', 'prop_value_invalid', 'prop_unknown', 'event_unknown']);
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

describe('imports (A8-F04-S01)', () => {
  test('refuses anything but @brydio, Preact and the app’s own files, with the specifier and where', () => {
    const source = [
      "import { z } from 'zod';",
      "import lodash from 'lodash/fp';",
      "import { readFileSync } from 'node:fs';",
      "import secret from '../../../brydio/apps/api/src/secret.ts';",
      "import absolute from '/Users/someone/brydio/x.ts';",
      "import url from 'file:///Users/someone/x.ts';",
      "export { thing } from 'some-package';",
      "const later = () => import('left-pad');",
      "const old = require('react');",
      "import type { Row } from 'kysely';",
    ].join('\n');
    const problems = checkSource('src/screens/home.tsx', source);

    expect(problems.map(problem => [problem.line, problem.code])).toEqual(
      Array.from({ length: 10 }, (_, at) => [at + 1, 'import_not_allowed']),
    );
    expect(problems[0]).toMatchObject({ file: 'src/screens/home.tsx', line: 1, column: 19 });
    expect(problems[0]!.message).toContain('"zod"');
    expect(problems[3]!.message).toContain('reaches outside the app');
    expect(problems[4]!.message).toContain('names a place');
    expect(problems[5]!.message).toContain('names a place');
  });

  test('allows @brydio packages, the Preact the adapter uses, and files anywhere inside the app', () => {
    const source = [
      "import { tools } from '@brydio/app';",
      "import { mount, useState } from '@brydio/app/preact';",
      "import type { AppManifestWithData } from '@brydio/manifest';",
      "import { h } from 'preact';",
      "import { useEffect } from 'preact/hooks';",
      "import { jsx } from 'preact/jsx-runtime';",
      "import { COLUMNS } from '../issues.ts';",
      "import { helper } from './helper.ts';",
      "import data from '../../fixtures/sample.ts';",
      "const lazy = () => import('./other.ts');",
    ].join('\n');

    expect(checkSource('src/screens/home.tsx', source)).toEqual([]);
  });

  test('counts a climb from where the file is, not from src', () => {
    expect(codes("import x from '../../x.ts';", 'src/screens/home.ts')).toEqual([]);
    expect(codes("import x from '../../../x.ts';", 'src/screens/home.ts')).toEqual(['import_not_allowed']);
    expect(codes("import x from './a/../../x.ts';", 'src/home.ts')).toEqual([]);
    expect(codes("import x from './a/../../../x.ts';", 'src/home.ts')).toEqual(['import_not_allowed']);
  });

  test('keeps a URL import a network problem, not two', () => {
    expect(codes("const x = () => import('https://cdn.example.com/x.js');")).toEqual(['network_global']);
  });

  test('fails validate and build for an app that imports a package', async () => {
    const { build, validate } = await import('../src/index.ts');
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const root = mkdtempSync(join(tmpdir(), 'brydio-imports-'));

    try {
      mkdirSync(join(root, '.brydio'));
      mkdirSync(join(root, 'src/screens'), { recursive: true });
      writeFileSync(join(root, '.brydio/app.json'), JSON.stringify({ name: 'tiny', version: '1.0.0', screens: { home: { entry: 'screens/home.js' } } }));
      writeFileSync(join(root, 'src/screens/home.ts'), "import { z } from 'zod';\nexport const home = z;\n");

      const built = await build(root);

      expect(built.ok).toBe(false);
      expect(built.problems.map(problem => [problem.file, problem.line, problem.column, problem.code])).toEqual([['src/screens/home.ts', 1, 19, 'import_not_allowed']]);
      expect(validate(root).problems.map(problem => problem.code)).toContain('import_not_allowed');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
