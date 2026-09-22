import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';

import { buildPlugin } from '../scripts/build-ts-plugin.ts';
import { checkSource } from '../src/index.ts';

const cli = join(import.meta.dir, '..');
const require = createRequire(import.meta.url);

/** An app on disk with a screen, a test beside it, and a language service over it with the built plugin on. */
function editor(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'brydio-editor-'));

  for (const [path, text] of Object.entries({ '.brydio/app.json': '{"name":"x","version":"1.0.0"}', ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }

  const names = Object.keys(files).map(path => join(root, path));
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => names,
    getScriptVersion: () => '1',
    getScriptSnapshot: name => (ts.sys.fileExists(name) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(name)!) : undefined),
    getCurrentDirectory: () => root,
    getCompilationSettings: () => ({ jsx: ts.JsxEmit.Preserve, noLib: true, noResolve: true, allowJs: true }),
    getDefaultLibFileName: () => 'lib.d.ts',
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
  };
  const plain = ts.createLanguageService(host);
  const factory = require(join(cli, 'ts-plugin', 'index.cjs')) as (modules: { typescript: typeof ts }) => ts.server.PluginModule;
  const service = factory({ typescript: ts }).create({
    languageService: plain,
    project: { projectService: { logger: { info() {} } } },
  } as unknown as ts.server.PluginCreateInfo);

  return {
    root,
    brydio: (path: string) => service.getSemanticDiagnostics(join(root, path)).filter(one => one.source === 'brydio'),
    done: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('the editor plugin (A5-F03-S03)', () => {
  const SCREEN = [
    "import { mount } from '@brydio/app/preact';",
    'const Board = () => (',
    '  <bry-stack gap="9">',
    '    <bry-hologram />',
    '    <bry-button label="Save" tone="danger" />',
    '  </bry-stack>',
    ');',
    'document.title = "x";',
    'void mount(Board);',
    '',
  ].join('\n');

  test('underlines what validate refuses, where it is written, in validate’s words', () => {
    const app = editor({ 'src/screens/board.tsx': SCREEN, 'src/screens/board.test.ts': 'document.title = "fine in a test";\n', 'scripts/seed.ts': 'fetch("x");\n' });

    try {
      const found = app.brydio('src/screens/board.tsx');
      const expected = checkSource('src/screens/board.tsx', SCREEN);

      expect(found.map(one => [SCREEN.slice(one.start!, one.start! + one.length!), one.messageText])).toEqual([
        ['gap', 'bry-stack gap must be one of 1, 2, 3, 4, 5, 6, 7, 8. [prop_value_invalid]'],
        ['bry-hologram', expect.stringMatching(/^Brydio has no element called "bry-hologram"\. A screen draws with bry-stack, .* \[element_unknown\]$/)],
        ['tone', 'bry-button has no setting called "tone". [prop_unknown]'],
        ['document', expect.stringContaining('[dom_global]')],
      ]);
      // One implementation: the plugin's list is validate's list, sentence for sentence.
      expect(found.map(one => String(one.messageText))).toEqual(expected.map(one => `${one.message}${one.hint ? ` ${one.hint}` : ''} [${one.code}]`));
      expect(found.every(one => one.category === ts.DiagnosticCategory.Error && one.code === 91_000)).toBe(true);
      // Tests and files outside src/ are not screens, as validate reads them.
      expect(app.brydio('src/screens/board.test.ts')).toEqual([]);
      expect(app.brydio('scripts/seed.ts')).toEqual([]);
    } finally {
      app.done();
    }
  });

  test('underlines the plain factories too', () => {
    const PLAIN = "import { button, stack } from '@brydio/app';\nstack({ gap: '9' }, button({ label: 'Go', onHover: () => {} }));\n";
    const app = editor({ 'src/screens/plain.ts': PLAIN });

    try {
      expect(app.brydio('src/screens/plain.ts').map(one => [PLAIN.slice(one.start!, one.start! + one.length!), String(one.messageText).split(' [')[1]])).toEqual([
        ['gap', 'prop_value_invalid]'],
        ['onHover', 'event_unknown]'],
      ]);
    } finally {
      app.done();
    }
  });

  test('says nothing for a clean screen, or for a file outside any Brydio app', () => {
    const app = editor({ 'src/screens/home.tsx': 'const x = <bry-text text="Hello" tone="muted" />;\n' });

    try {
      expect(app.brydio('src/screens/home.tsx')).toEqual([]);
    } finally {
      app.done();
    }

    const loose = editor({ 'src/screens/home.tsx': 'const x = <bry-hologram />;\n' });

    try {
      rmSync(join(loose.root, '.brydio'), { recursive: true });
      expect(loose.brydio('src/screens/home.tsx')).toEqual([]);
    } finally {
      loose.done();
    }
  });

  test('ships built from the current source', async () => {
    // The bundler names each source file in a comment, relative to wherever the build ran, so those lines differ
    // between a laptop and CI without the code differing. Compare everything else.
    const code = (text: string) => text.replace(/^\/\/ \S+\.tsx?$/gm, '');

    expect(code(readFileSync(join(cli, 'ts-plugin', 'plugin.cjs'), 'utf8'))).toBe(code(await buildPlugin()));
    expect(JSON.parse(readFileSync(join(cli, 'package.json'), 'utf8')).exports['./ts-plugin']).toBe('./ts-plugin/index.cjs');
    // tsserver resolves a plugin the old Node way, without `exports`: a folder, its package.json's main, as CommonJS.
    expect(JSON.parse(readFileSync(join(cli, 'ts-plugin', 'package.json'), 'utf8'))).toEqual({ type: 'commonjs', main: 'index.cjs' });

  });

  test.skipIf(!Bun.which('node'))('loads in a real tsserver, found from an app’s own node_modules', async () => {
    // What an editor does: tsserver in Node, the plugin named and looked for beside the app.
    const app = join(cli, '..', '..', 'templates', 'plain');
    const server = Bun.spawn(['node', require.resolve('typescript/lib/tsserver.js'), '--globalPlugins', '@brydio/cli/ts-plugin', '--pluginProbeLocations', app], {
      cwd: app,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const file = join(app, 'src', 'screens', 'probe.ts');
    const send = (seq: number, command: string, args: object) => server.stdin.write(`${JSON.stringify({ seq, type: 'request', command, arguments: args })}\n`);
    const reader = server.stdout.getReader();
    let text = '';

    send(1, 'open', { file, fileContent: "import { stack } from '@brydio/app';\nstack({ gap: '9' });\n", scriptKindName: 'TS', projectRootPath: app });
    send(2, 'semanticDiagnosticsSync', { file });

    try {
      const deadline = Date.now() + 20_000;

      while (!text.includes('"command":"semanticDiagnosticsSync"') && Date.now() < deadline) {
        const { value, done } = await reader.read();

        if (done) break;

        text += new TextDecoder().decode(value);
      }
    } finally {
      server.kill();
    }

    const answer = JSON.parse(text.split('\n').find(line => line.includes('"command":"semanticDiagnosticsSync"'))!) as { body: { text: string; source?: string }[] };

    expect(answer.body.filter(one => one.source === 'brydio').map(one => one.text)).toEqual(['bry-stack gap must be one of 1, 2, 3, 4, 5, 6, 7, 8. [prop_value_invalid]']);
  }, 30_000);
});
