import { RUNTIME_MAX_BYTES, build, runtimeBytesOf } from '@brydio/cli';
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import ts from 'typescript';

/**
 * The runtime each screen carries (A5-F03-S01). The worker can fetch
 * nothing, so every screen bundles `@brydio/app`; what matters is that it
 * bundles only what the screen uses. Wren's `collection` export once pulled
 * all of `@brydio/manifest` (zod included) into every screen, growing each
 * from about 46 KB to 1.6 MB, with no screen asking for it.
 */

const sdk = join(import.meta.dir, '..', '..', '..');
const template = join(sdk, 'templates', 'plain');
const screen = join(template, 'src', 'screens', 'home.ts');
const mainEntry = join(sdk, 'packages', 'app', 'src', 'index.ts');
const made: string[] = [];

afterAll(() => {
  for (const one of made) rmSync(one, { recursive: true, force: true });
});

/** The names a screen imports from `@brydio/app`'s main entry. */
function namesImported(file: string): Set<string> {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set<string>();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || (statement.moduleSpecifier as ts.StringLiteral).text !== '@brydio/app') continue;

    const bindings = statement.importClause?.namedBindings;

    if (bindings && ts.isNamedImports(bindings)) for (const one of bindings.elements) if (!one.isTypeOnly) names.add((one.propertyName ?? one.name).text);
  }

  return names;
}

/**
 * The main entry with every re-export the screen doesn't use taken out, so
 * nothing but what it imports can reach the bundle through a re-export.
 * Relative paths are made absolute so the copy can live anywhere.
 */
function trimmedEntry(used: Set<string>): string {
  const source = ts.createSourceFile(mainEntry, readFileSync(mainEntry, 'utf8'), ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter();
  const absolute = (node: ts.Expression) => {
    const text = (node as ts.StringLiteral).text;

    return ts.factory.createStringLiteral(text.startsWith('.') ? join(dirname(mainEntry), text) : text);
  };
  const kept: string[] = [];

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      kept.push(printer.printNode(ts.EmitHint.Unspecified, ts.factory.updateImportDeclaration(statement, statement.modifiers, statement.importClause, absolute(statement.moduleSpecifier), statement.attributes), source));
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      if (statement.isTypeOnly) continue;

      const clause = statement.exportClause;

      if (!clause) {
        kept.push(printer.printNode(ts.EmitHint.Unspecified, ts.factory.updateExportDeclaration(statement, statement.modifiers, false, undefined, absolute(statement.moduleSpecifier), statement.attributes), source));
        continue;
      }

      if (!ts.isNamedExports(clause)) continue;

      const elements = clause.elements.filter(one => !one.isTypeOnly && used.has(one.name.text));

      if (elements.length) {
        kept.push(
          printer.printNode(
            ts.EmitHint.Unspecified,
            ts.factory.updateExportDeclaration(statement, statement.modifiers, false, ts.factory.updateNamedExports(clause, elements), absolute(statement.moduleSpecifier), statement.attributes),
            source,
          ),
        );
      }
    } else {
      kept.push(printer.printNode(ts.EmitHint.Unspecified, statement, source));
    }
  }

  const folder = mkdtempSync(join(tmpdir(), 'brydio-trimmed-'));

  made.push(folder);

  const file = join(folder, 'index.ts');

  writeFileSync(file, `${kept.join('\n')}\n`);

  return file;
}

/**
 * The screen bundled as `brydio build` bundles it, minified, with its metafile.
 * In its own process from the template's folder, as `build` runs it, so the
 * template's own `node_modules` decide what `@brydio/app` is.
 */
async function bundled(entryFor?: string): Promise<{ bytes: number; runtime: number }> {
  const folder = mkdtempSync(join(tmpdir(), 'brydio-size-'));

  made.push(folder);

  const script = join(folder, 'size.ts');

  writeFileSync(
    script,
    `const entryFor = ${JSON.stringify(entryFor ?? null)};
const result = await Bun.build({
  entrypoints: [${JSON.stringify(screen)}],
  target: 'browser',
  format: 'esm',
  minify: true,
  metafile: true,
  define: { __BRYDIO_APP__: JSON.stringify('{}'), 'process.env.NODE_ENV': '"production"' },
  plugins: entryFor ? [{ name: 'trimmed', setup: build => { build.onResolve({ filter: /^@brydio\\/app$/ }, () => ({ path: entryFor })); } }] : [],
});
if (!result.success) { console.error(result.logs.map(String).join('\\n')); process.exit(1); }
console.log(JSON.stringify({ bytes: (await result.outputs[0].text()).length, metafile: result.metafile }));
`,
  );

  const child = Bun.spawn([process.execPath, script], { cwd: template, stdout: 'pipe', stderr: 'pipe' });
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);

  if (code !== 0) throw new Error(err);

  const { bytes, metafile } = JSON.parse(out) as { bytes: number; metafile: never };

  return { bytes, runtime: runtimeBytesOf(metafile, template) };
}

describe('the runtime a screen carries', () => {
  test('adds nothing for an export of @brydio/app’s main entry the screen doesn’t import', async () => {
    const used = namesImported(screen);
    const whole = await bundled();
    const trimmed = await bundled(trimmedEntry(used));

    expect(used.size).toBeGreaterThan(5);
    expect(whole.runtime).toBeGreaterThan(10 * 1024);
    expect(whole.runtime).toBeLessThanOrEqual(RUNTIME_MAX_BYTES);
    // Everything the whole entry re-exports beyond what the screen uses is shaken out.
    expect(whole.bytes).toBe(trimmed.bytes);
  }, 30_000);

  test('build refuses a screen carrying more than 30 KB of the runtime, naming it', async () => {
    const root = mkdtempSync(join(import.meta.dir, 'fixtures', 'heavy-'));

    made.push(root);
    mkdirSync(join(root, '.brydio'), { recursive: true });
    mkdirSync(join(root, 'src', 'screens'), { recursive: true });
    writeFileSync(join(root, '.brydio', 'app.json'), JSON.stringify({ name: 'heavy', version: '1.0.0', screens: { home: { entry: 'screens/home.js' }, light: { entry: 'screens/light.js' } } }));
    // Validating a manifest in a screen drags the schema library in: runtime a screen should never carry.
    writeFileSync(join(root, 'src', 'screens', 'home.ts'), "import { mount, text } from '@brydio/app';\nimport { validateManifest } from '@brydio/manifest';\nvoid mount(root => root.append(text({ text: String(validateManifest({}).ok) })));\n");
    writeFileSync(join(root, 'src', 'screens', 'light.ts'), "import { mount, text } from '@brydio/app';\nvoid mount(root => root.append(text({ text: 'Hi' })));\n");

    const result = await build(root, { checkSource: false });

    expect(result.ok).toBe(false);
    expect(result.problems.map(one => one.code)).toEqual(['runtime_too_large']);
    expect(result.problems[0]!.message).toMatch(/^The "home" screen carries \d+\.\d KB of Brydio's runtime, over the 30 KB a screen may carry\./);

    // Unminified, a debugging build, isn't held to it.
    const debugging = await build(root, { checkSource: false, minify: false });

    expect(debugging.problems.filter(one => one.code === 'runtime_too_large')).toEqual([]);
  }, 60_000);
});
