import { CATALOGUE, FORBIDDEN_PROPS, checkEvent, checkProp, eventOfHandler, isElementName, type ElementName, type ElementSpec } from '@brydio/ui';
import { posix } from 'node:path';
import ts from 'typescript';

import type { Problem } from './project.ts';

/**
 * What `brydio validate` can see wrong in a screen's source without running it
 * (A5-F03-S02): an element Brydio does not have, a setting an element does
 * not take or a value it does not allow, a setting it cannot be drawn
 * without, children inside an element that holds none, a style or a class,
 * and reaching for a page, a network, storage or another worker that the
 * worker does not have.
 *
 * The source is parsed with TypeScript's own parser, so a `<` in a generic, a
 * JSX-looking string or a comment is never mistaken for an element, and a
 * name is only a global when nothing in the file declares it. The checks
 * speak up only when they are sure: a setting whose value is worked out at
 * run time is not guessed at, and an element named through a variable is not
 * followed. What slips past is refused by the runtime at the line that made
 * it, and by the host after that; this is the earliest of the three.
 *
 * Every refusal about an element or a setting uses `@brydio/ui`'s sentence,
 * which is the host's, so the terminal, the runtime and `tree/refused` read
 * the same.
 */

export type SourceProblemCode =
  | 'source_syntax'
  | 'element_unknown'
  | 'prop_unknown'
  | 'prop_value_invalid'
  | 'prop_required'
  | 'event_unknown'
  | 'style_forbidden'
  | 'children_not_allowed'
  | 'dom_global'
  | 'network_global'
  | 'storage_global'
  | 'worker_global'
  | 'eval_forbidden'
  | 'import_not_allowed';

interface Refused {
  code: SourceProblemCode;
  why: string;
}

const PAGE: Refused = { code: 'dom_global', why: 'A screen has no page: it runs in a worker and draws only with the catalogue.' };
const NETWORK: Refused = { code: 'network_global', why: 'A screen has no network; call the app’s tools instead.' };
const STORAGE: Refused = { code: 'storage_global', why: 'A screen has no storage; keep records in the app’s collections.' };
const WORKERS: Refused = { code: 'worker_global', why: 'A screen is one module in one worker; there is nothing else to start or load.' };

/** Globals a screen cannot use: what a page has and a worker lacks, and what Brydio's prelude takes away. */
export const FORBIDDEN_GLOBALS: Readonly<Record<string, Refused>> = {
  document: PAGE,
  window: PAGE,
  localStorage: STORAGE,
  sessionStorage: STORAGE,
  indexedDB: STORAGE,
  caches: STORAGE,
  fetch: NETWORK,
  XMLHttpRequest: NETWORK,
  WebSocket: NETWORK,
  WebSocketStream: NETWORK,
  EventSource: NETWORK,
  WebTransport: NETWORK,
  Worker: WORKERS,
  SharedWorker: WORKERS,
  BroadcastChannel: WORKERS,
  importScripts: WORKERS,
};

/** `navigator.<name>` that the prelude takes away. */
const NAVIGATOR: Readonly<Record<string, Refused>> = { storage: STORAGE, sendBeacon: NETWORK };

/** What the global object is called in a worker, and on a page. */
const GLOBAL_OBJECTS = new Set(['self', 'globalThis', 'window']);

/** Attributes Preact reads itself and never sends to the host. */
const FRAMEWORK_ATTRIBUTES = new Set(['key', 'ref', 'children']);

/** The plain factories `@brydio/app` exports, by the element each makes. */
const FACTORIES: Readonly<Record<string, ElementName>> = {
  stack: 'bry-stack',
  heading: 'bry-heading',
  text: 'bry-text',
  button: 'bry-button',
  card: 'bry-card',
  input: 'bry-input',
  textarea: 'bry-textarea',
  select: 'bry-select',
  label: 'bry-label',
  grid: 'bry-grid',
  badge: 'bry-badge',
  avatar: 'bry-avatar',
  listRow: 'bry-list-row',
  emptyState: 'bry-empty-state',
  skeleton: 'bry-skeleton',
  table: 'bry-table',
  virtualList: 'bry-virtual-list',
  dialog: 'bry-dialog',
  menu: 'bry-menu',
  date: 'bry-date',
  split: 'bry-split',
  checkbox: 'bry-checkbox',
  switchElement: 'bry-switch',
  board: 'bry-board',
  boardColumn: 'bry-board-column',
  markdown: 'bry-markdown',
  diff: 'bry-diff',
};

/** Modules whose `h` and `createElement` take an element's name first. */
const ELEMENT_MAKERS = new Set(['@brydio/app', 'preact']);

/**
 * Where a screen may import from (A8-F04-S01): the SDK's own packages, the
 * parts of Preact its adapter is built on, and the app's own files. Nothing
 * else, so an app can lean on no private door and no package the SDK has not
 * vouched for; what it needs from anywhere else goes in the SDK first.
 */
const ALLOWED_PACKAGES = /^(@brydio\/[a-z0-9-]+(\/.*)?|preact|preact\/(hooks|jsx-runtime|jsx-dev-runtime))$/;

/** Why an import specifier is refused in a screen written at `file` (relative to the app's root), or null. */
export function importRefusal(file: string, specifier: string): string | null {
  if (specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..') {
    const inside = posix.normalize(posix.join(posix.dirname(file.split('\\').join('/')), specifier));

    return inside === '..' || inside.startsWith('../') || posix.isAbsolute(inside)
      ? `import "${specifier}" reaches outside the app's folder. A screen imports only its own files, @brydio packages and Preact.`
      : null;
  }

  if (ALLOWED_PACKAGES.test(specifier)) return null;

  if (specifier.startsWith('/') || /^[A-Za-z]:[\\/]/.test(specifier) || /^[a-z][a-z0-9+.-]*:/i.test(specifier)) {
    return `import "${specifier}" names a place, not the app's own file. A screen imports only its own files, @brydio packages and Preact.`;
  }

  return `import "${specifier}": a screen imports only its own files, @brydio packages and Preact. Anything else it needs belongs in the SDK.`;
}

const scriptKindOf = (file: string): ts.ScriptKind =>
  file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') || file.endsWith('.mts') ? ts.ScriptKind.TS : ts.ScriptKind.JSX;

/** A value the screen will send, when it is written out; `undefined` when it is worked out at run time. */
type Literal = { value: unknown } | undefined;

export function literalsOf(expression: ts.Expression | undefined): Literal[] {
  if (!expression) return [undefined];

  const node = unwrap(expression);

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{ value: node.text }];
  if (ts.isNumericLiteral(node)) return [{ value: Number(node.text) }];
  if (node.kind === ts.SyntaxKind.TrueKeyword) return [{ value: true }];
  if (node.kind === ts.SyntaxKind.FalseKeyword) return [{ value: false }];
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return [{ value: -Number(node.operand.text) }];
  }
  // `tone={done ? 'muted' : 'loud'}`: either branch is a value the screen can send.
  if (ts.isConditionalExpression(node)) return [...literalsOf(node.whenTrue), ...literalsOf(node.whenFalse)];

  return [undefined];
}

/** The expression inside parentheses and type assertions, which change nothing at run time. */
export function unwrap(node: ts.Expression): ts.Expression {
  let at = node;

  while (ts.isParenthesizedExpression(at) || ts.isAsExpression(at) || ts.isSatisfiesExpression(at) || ts.isNonNullExpression(at)) {
    at = at.expression;
  }

  return at;
}

const isWrittenString = (node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

/** Every name the file declares anywhere. A local `fetch` is the app's own, not the worker's. */
function declaredNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const addBinding = (name: ts.BindingName) => {
    if (ts.isIdentifier(name)) names.add(name.text);
    else for (const element of name.elements) if (!ts.isOmittedExpression(element)) addBinding(element.name);
  };
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) addBinding(node.name);
    else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) {
      names.add(node.name.text);
    } else if (ts.isImportClause(node) && node.name) names.add(node.name.text);
    else if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || ts.isImportEqualsDeclaration(node)) names.add(node.name.text);
    else if ((ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) && ts.isIdentifier(node.name)) names.add(node.name.text);

    ts.forEachChild(node, visit);
  };

  visit(source);

  return names;
}

/** Whether an identifier is read as a value when the code runs, rather than being a key, a declaration's name or a type. */
function isValueReference(node: ts.Identifier): boolean {
  const parent = node.parent;

  if (ts.isPropertyAccessExpression(parent)) return parent.expression === node;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessor(parent) ||
      ts.isSetAccessor(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === node
  ) {
    return false;
  }
  if (
    ts.isQualifiedName(parent) ||
    ts.isJsxAttribute(parent) ||
    ts.isLabeledStatement(parent) ||
    ts.isBreakOrContinueStatement(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent)
  ) {
    return false;
  }

  // Anything inside a type is never run.
  for (let at: ts.Node = parent; !ts.isSourceFile(at); at = at.parent) {
    if (ts.isTypeNode(at) && !ts.isExpressionWithTypeArguments(at)) return false;
    if (ts.isInterfaceDeclaration(at) || ts.isTypeAliasDeclaration(at)) return false;
    if (ts.isStatement(at)) break;
  }

  return true;
}

/** A property's settings, as the element checks read them. */
interface Setting {
  name: string;
  values: Literal[];
  at: ts.Node;
}

/** The settings written in an object literal, and whether that is all of them. */
function settingsOf(object: ts.ObjectLiteralExpression): { settings: Setting[]; complete: boolean } {
  const settings: Setting[] = [];
  let complete = true;

  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      const inner = unwrap(property.expression);

      if (ts.isObjectLiteralExpression(inner)) {
        const nested = settingsOf(inner);

        settings.push(...nested.settings);
        complete &&= nested.complete;
      } else {
        complete = false;
      }

      continue;
    }

    const key = property.name;
    const name = key && (ts.isIdentifier(key) || ts.isStringLiteral(key) || ts.isNumericLiteral(key)) ? key.text : null;

    if (name === null || !key) {
      complete = false;
      continue;
    }

    settings.push({ name, values: ts.isPropertyAssignment(property) ? literalsOf(property.initializer) : [undefined], at: key });
  }

  return { settings, complete };
}

export function checkSource(file: string, text: string): Problem[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindOf(file));
  const problems: Problem[] = [];
  const place = (position: number) => {
    const { line, character } = source.getLineAndCharacterOfPosition(position);

    return { line: line + 1, column: character + 1 };
  };
  const push = (code: SourceProblemCode, message: string, at: ts.Node) =>
    problems.push({ code, severity: 'error', file, ...place(at.getStart(source)), message });

  // A file that does not parse says only that: anything more would be a guess.
  const syntax = (source as unknown as { parseDiagnostics?: ts.DiagnosticWithLocation[] }).parseDiagnostics ?? [];

  if (syntax.length) {
    return syntax.slice(0, 5).map(diagnostic => ({
      code: 'source_syntax',
      severity: 'error',
      file,
      ...place(diagnostic.start),
      message: `This does not parse: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
    }));
  }

  const declared = declaredNames(source);
  // `h` and `createElement` from `@brydio/app` or Preact, and the plain
  // factories from `@brydio/app`, by the names this file imports them as. A
  // function of the app's own that happens to be called `text` is left alone.
  const makers = new Set<string>();
  const factories = new Map<string, ElementName>();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const from = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;

    if (!bindings || !ts.isNamedImports(bindings)) continue;

    for (const specifier of bindings.elements) {
      const imported = (specifier.propertyName ?? specifier.name).text;

      if (ELEMENT_MAKERS.has(from) && (imported === 'h' || imported === 'createElement')) makers.add(specifier.name.text);
      if (from === '@brydio/app' && FACTORIES[imported]) factories.set(specifier.name.text, FACTORIES[imported]);
    }
  }

  const checkSetting = (element: ElementName, { name, values, at }: Setting) => {
    if (FRAMEWORK_ATTRIBUTES.has(name)) return;

    const event = eventOfHandler(name);

    if (event !== null) {
      const refused = checkEvent(element, event);

      if (refused) push('event_unknown', refused, at);

      return;
    }

    if (!Object.prototype.hasOwnProperty.call(CATALOGUE[element].props, name)) {
      push(Object.prototype.hasOwnProperty.call(FORBIDDEN_PROPS, name) ? 'style_forbidden' : 'prop_unknown', checkProp(element, name, undefined)!, at);

      return;
    }

    for (const literal of values) {
      const refused = literal && checkProp(element, name, literal.value);

      if (refused) {
        push('prop_value_invalid', refused, at);

        return;
      }
    }
  };

  const checkRequired = (element: ElementName, written: Setting[], at: ts.Node) => {
    for (const required of (CATALOGUE[element] as ElementSpec).required ?? []) {
      if (!written.some(setting => setting.name === required)) push('prop_required', `${element} needs a ${required}.`, at);
    }
  };

  const isKnownElement = (name: string, at: ts.Node): name is ElementName => {
    if (isElementName(name)) return true;

    push('element_unknown', `Brydio has no element called "${name}". A screen draws with ${Object.keys(CATALOGUE).join(', ')}.`, at);

    return false;
  };

  const checkJsx = (opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement, children: readonly ts.JsxChild[]) => {
    const tag = opening.tagName;

    // `<Board />` and `<ui.Row />` are components, which draw with elements themselves.
    if (!ts.isIdentifier(tag) || !/^[a-z]/.test(tag.text)) {
      if (ts.isJsxNamespacedName(tag)) push('element_unknown', `Brydio has no element called "${tag.getText(source)}".`, tag);

      return;
    }

    const name = tag.text;

    if (!isKnownElement(name, tag)) return;

    const written: Setting[] = [];
    let complete = true;

    for (const attribute of opening.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        const inner = unwrap(attribute.expression);

        if (ts.isObjectLiteralExpression(inner)) {
          const spread = settingsOf(inner);

          written.push(...spread.settings);
          complete &&= spread.complete;
        } else {
          // Whatever is spread may carry anything; the runtime checks it.
          complete = false;
        }

        continue;
      }

      const initializer = attribute.initializer;

      written.push({
        name: attribute.name.getText(source),
        values: !initializer
          ? [{ value: true }]
          : ts.isStringLiteral(initializer)
            ? [{ value: initializer.text }]
            : ts.isJsxExpression(initializer)
              ? literalsOf(initializer.expression)
              : [undefined],
        at: attribute.name,
      });
    }

    written.forEach(setting => checkSetting(name, setting));

    if (complete) checkRequired(name, written, tag);

    if (!CATALOGUE[name].children) {
      const held = children.find(child =>
        ts.isJsxText(child) ? child.text.trim() !== '' : ts.isJsxExpression(child) ? child.expression !== undefined : true,
      );

      if (held) {
        const words = name === 'bry-button' ? ' Give it its words as label="…".' : 'text' in CATALOGUE[name].props ? ' Give it its words as text="…".' : '';

        push('children_not_allowed', `${name} can’t hold other nodes.${words}`, held);
      }
    }
  };

  const checkFactory = (element: ElementName, argument: ts.Expression | undefined, at: ts.Node) => {
    const attributes = argument && unwrap(argument);

    if (!attributes || attributes.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(attributes) && attributes.text === 'undefined')) {
      checkRequired(element, [], at);

      return;
    }

    if (!ts.isObjectLiteralExpression(attributes)) return;

    const { settings, complete } = settingsOf(attributes);

    settings.forEach(setting => checkSetting(element, setting));

    if (complete) checkRequired(element, settings, at);
  };

  const checkImport = (specifier: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral) => {
    const refused = importRefusal(file, specifier.text);

    if (refused) push('import_not_allowed', refused, specifier);
  };

  const checkCall = (call: ts.CallExpression) => {
    const callee = unwrap(call.expression);
    const [first, second] = call.arguments;

    if (ts.isIdentifier(callee) && makers.has(callee.text) && first) {
      const tag = unwrap(first);

      if (isWrittenString(tag) && tag.text !== '#text' && isKnownElement(tag.text, tag)) checkFactory(tag.text, second, tag);

      return;
    }

    if (ts.isIdentifier(callee) && factories.has(callee.text)) {
      checkFactory(factories.get(callee.text)!, first, callee);

      return;
    }

    if (ts.isIdentifier(callee) && callee.text === 'eval' && !declared.has('eval')) {
      push('eval_forbidden', 'eval is refused in a Brydio app’s worker; write the code out.', callee);
    }

    // `import('https://…')`: a worker can import only its own bundle's files.
    if (callee.kind === ts.SyntaxKind.ImportKeyword && first) {
      const target = unwrap(first);

      if (isWrittenString(target) && /^(https?:|\/\/)/i.test(target.text)) {
        push('network_global', `import("${target.text}"): a screen can load nothing from elsewhere; build it into the bundle.`, target);
      } else if (isWrittenString(target)) {
        checkImport(target);
      }
    }

    // `require('x')`, which Bun's bundler would follow like an import.
    if (ts.isIdentifier(callee) && callee.text === 'require' && !declared.has('require') && first && isWrittenString(unwrap(first))) {
      checkImport(unwrap(first) as ts.StringLiteral);
    }
  };

  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      checkImport(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
      checkImport(node.moduleReference.expression);
    }

    if (ts.isJsxElement(node)) {
      checkJsx(node.openingElement, node.children);
    } else if (ts.isJsxSelfClosingElement(node)) {
      checkJsx(node, []);
    } else if (ts.isCallExpression(node)) {
      checkCall(node);
    } else if (ts.isNewExpression(node)) {
      const callee = unwrap(node.expression);

      if (ts.isIdentifier(callee) && callee.text === 'Function' && !declared.has('Function')) {
        push('eval_forbidden', 'new Function is refused in a Brydio app’s worker; write the code out.', callee);
      }
    } else if (ts.isIdentifier(node)) {
      const refused = FORBIDDEN_GLOBALS[node.text];

      // `self.fetch` is reported at the property access, so `self` itself passes.
      if (refused && Object.prototype.hasOwnProperty.call(FORBIDDEN_GLOBALS, node.text) && !declared.has(node.text) && isValueReference(node)) {
        push(refused.code, `${node.text}: ${refused.why}`, node);
      }
    } else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const object = unwrap(node.expression);
      const property = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : isWrittenString(node.argumentExpression)
          ? node.argumentExpression.text
          : null;

      if (property !== null && ts.isIdentifier(object) && !declared.has(object.text)) {
        const refused = GLOBAL_OBJECTS.has(object.text)
          ? Object.prototype.hasOwnProperty.call(FORBIDDEN_GLOBALS, property) && FORBIDDEN_GLOBALS[property]
          : object.text === 'navigator' && Object.prototype.hasOwnProperty.call(NAVIGATOR, property) && NAVIGATOR[property];

        if (refused) push(refused.code, `${object.text}.${property}: ${refused.why}`, node);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return dedupe(problems);
}

/** One problem per place and code: `window.fetch` found as `window` and as `.fetch` is still one mistake per code. */
function dedupe(problems: Problem[]): Problem[] {
  const seen = new Set<string>();

  return problems.filter(problem => {
    const key = `${problem.line}:${problem.column}:${problem.code}`;

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}
