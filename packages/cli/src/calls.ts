import ts from 'typescript';

import { literalsOf, unwrap } from './source-checks.ts';

/**
 * What a screen asks of Brydio, as far as its source says it plainly
 * (A8-F04-S03): the tools it calls, the collections it reads and the host
 * grants it uses. `grant-checks.ts` holds these against the manifest.
 *
 * Only names written out count: `tools.call('list_issues')`, or either branch
 * of `done ? 'a' : 'b'`. A name worked out at run time is not guessed at, and
 * the runtime refuses it, with `GrantError`, where it is called.
 */

export interface ScreenCall {
  kind: 'tool' | 'collection' | 'host';
  name: string;
  line: number;
  column: number;
  /**
   * False where the call only looks like one: `router.navigate()` might be
   * the app's own. Enough to say a grant is used, not to refuse its absence.
   */
  sure: boolean;
  /** For a collection: whether it reads one record (`get`) or a page (`list`). */
  verb?: 'get' | 'list';
}

type Target = { kind: 'tool' } | { kind: 'collection'; verb: 'get' | 'list' };

/** `@brydio/app`'s functions whose first argument names a tool or a collection, by what it names. */
const IMPORTED: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, Target>>>>>> = {
  '@brydio/app': {
    tools: { call: { kind: 'tool' }, result: { kind: 'tool' } },
    data: { get: { kind: 'collection', verb: 'get' }, list: { kind: 'collection', verb: 'list' } },
  },
};

/** The bridge's own methods, reached through `useBridge()` or `defaultBridge()`. */
const METHODS: Readonly<Record<string, Target>> = {
  callTool: { kind: 'tool' },
  callToolResult: { kind: 'tool' },
  getDocument: { kind: 'collection', verb: 'get' },
  listDocuments: { kind: 'collection', verb: 'list' },
};

const scriptKindOf = (file: string): ts.ScriptKind =>
  file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') || file.endsWith('.mts') ? ts.ScriptKind.TS : ts.ScriptKind.JSX;

export function callsOf(file: string, text: string): ScreenCall[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindOf(file));
  const calls: ScreenCall[] = [];
  // Local name → the `@brydio/app` object it is (`tools`, `data`).
  const objects = new Map<string, Readonly<Record<string, Target>>>();
  const listHooks = new Set<string>();
  const navigates = new Set<string>();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const from = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;

    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const specifier of bindings.elements) {
      const imported = (specifier.propertyName ?? specifier.name).text;
      const local = specifier.name.text;

      if (IMPORTED[from]?.[imported]) objects.set(local, IMPORTED[from][imported]!);
      if (from === '@brydio/app/preact' && imported === 'useList') listHooks.add(local);
      if (from === '@brydio/app' && imported === 'navigate') navigates.add(local);
    }
  }

  const add = (kind: ScreenCall['kind'], name: string, at: ts.Node, sure = true, verb?: 'get' | 'list') => {
    const { line, character } = source.getLineAndCharacterOfPosition(at.getStart(source));

    calls.push({ kind, name, line: line + 1, column: character + 1, sure, ...(verb ? { verb } : {}) });
  };
  const named = (target: Target, argument: ts.Expression | undefined, at: ts.Node) => {
    for (const literal of literalsOf(argument)) {
      if (literal && typeof literal.value === 'string') {
        add(target.kind, literal.value, argument ?? at, true, target.kind === 'collection' ? target.verb : undefined);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const [first] = node.arguments;

      if (ts.isIdentifier(callee)) {
        if (listHooks.has(callee.text)) named({ kind: 'collection', verb: 'list' }, first, callee);
        if (navigates.has(callee.text)) add('host', 'navigate', callee);
      } else if (ts.isPropertyAccessExpression(callee)) {
        const method = callee.name.text;
        const object = unwrap(callee.expression);
        const target = ts.isIdentifier(object) ? objects.get(object.text)?.[method] : undefined;

        if (target) named(target, first, callee);
        else if (METHODS[method]) named(METHODS[method], first, callee);
        else if (method === 'navigate') add('host', 'navigate', callee, false);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return calls;
}
