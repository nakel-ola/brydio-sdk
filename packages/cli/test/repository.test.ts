import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const repository = join(import.meta.dir, '..', '..', '..');

/** Every import specifier in a package's shipped source, with the file it is in. */
function importsUnder(folder: string): { file: string; from: string }[] {
  const found: { file: string; from: string }[] = [];

  for (const name of readdirSync(folder, { recursive: true }) as string[]) {
    if (!/\.(ts|tsx)$/.test(name)) continue;

    const file = join(folder, name);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      const specifier =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
            ? node.arguments[0]
            : undefined;

      if (specifier && ts.isStringLiteral(specifier)) found.push({ file, from: specifier.text });

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return found;
}

test('no package imports anything from Brydio’s own repository', () => {
  const sources = readdirSync(join(repository, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(repository, 'packages', entry.name, 'src'));
  // `lit` is `@brydio/ui`'s one dependency, for the web-component build (A6-F06); it is
  // imported in `src/web/base.ts` alone, which `packages/ui/test/web.test.ts` holds it to.
  const allowed = /^(node:|bun:|\.\.?\/|@brydio\/|preact(\/|$)|@prefresh\/core$|typescript$|zod$|lit(\/|$))/;
  const imports = sources.flatMap(importsUnder);

  expect(imports.length).toBeGreaterThan(20);
  expect(imports.filter(({ from }) => !allowed.test(from) || from.includes('brydio/') && !from.startsWith('@brydio/'))).toEqual([]);
  // A relative import never climbs out of its own package.
  expect(imports.filter(({ from }) => /^(\.\.\/){3,}/.test(from))).toEqual([]);
});
