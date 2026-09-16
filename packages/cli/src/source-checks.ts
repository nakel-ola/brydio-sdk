import { CATALOGUE, checkEvent, checkProp, eventOfHandler, isElementName, type ElementName } from '@brydio/ui';

import type { Problem } from './project.ts';

/**
 * What `brydio validate` can see wrong in a screen's source without running it
 * (A5-F03): an element Brydio does not have, a setting an element does not
 * take, a style or a class, and reaching for a page or a network the worker
 * does not have.
 *
 * Best effort, by reading the text. It will not follow a variable to find out
 * which element it names, and it can be fooled by a string that looks like
 * JSX. What it misses the runtime refuses at the line, and the host refuses
 * after that; this is only the earliest of the three.
 */

/** Names a worker does not have, or that Brydio's prelude takes away. */
const GLOBALS: [RegExp, string][] = [
  [/\b(document|window|localStorage|sessionStorage)\s*[.[]/g, 'A screen has no page: it runs in a worker and draws only with the catalogue.'],
  [/\b(indexedDB|caches)\b/g, 'A screen has no storage; keep records in the app’s collections.'],
  [/\bnavigator\s*\.\s*(storage|sendBeacon)\b/g, 'A screen has no storage and no network.'],
  [/\bfetch\s*\(/g, 'A screen has no network; call the app’s tools instead.'],
  [/\bnew\s+(XMLHttpRequest|WebSocket|EventSource|WebTransport|Worker|SharedWorker|BroadcastChannel)\b/g, 'A screen has no network and no other workers.'],
  [/\bimportScripts\s*\(/g, 'A screen is one module; there is nothing else to load.'],
];

/** Comments out, strings kept, lines kept: what the element checks read. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, match => match.replace(/[^\n]/g, ' '));
}

/** Comments and string contents out, lines kept: what the globals check reads. */
function withoutStrings(source: string): string {
  return withoutComments(source).replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, match => match.replace(/[^\n]/g, ' '));
}

const lineOf = (source: string, index: number): number => source.slice(0, index).split('\n').length;

/**
 * The attributes of one JSX opening tag, starting just after its name: each
 * name, and its value when that value is a plain literal.
 */
function attributesOf(source: string, from: number): { name: string; literal?: unknown; at: number }[] {
  const found: { name: string; literal?: unknown; at: number }[] = [];
  let depth = 0;

  for (let at = from; at < source.length; at++) {
    const char = source[at]!;

    if (char === '{') depth++;
    else if (char === '}') depth--;
    else if (depth === 0 && char === '>') break;
    else if (depth === 0 && (char === '"' || char === "'")) {
      at = source.indexOf(char, at + 1);
      if (at < 0) break;
    } else if (depth === 0 && /[A-Za-z_]/.test(char) && /[\s]/.test(source[at - 1] ?? '')) {
      const match = /^([A-Za-z_][\w-]*)(\s*=\s*("([^"]*)"|'([^']*)'|\{\s*(-?\d+(?:\.\d+)?|true|false)\s*\}))?/.exec(source.slice(at));

      if (!match) continue;

      const assigned = /^\s*=/.test(source.slice(at + match[1]!.length));
      const text = match[4] ?? match[5];
      const other = match[6];
      // A bare name is `true`; a name given an expression has no literal to check.
      const literal =
        text !== undefined ? text : other !== undefined ? (other === 'true' ? true : other === 'false' ? false : Number(other)) : assigned ? undefined : true;

      found.push({ name: match[1]!, at, ...(literal === undefined ? {} : { literal }) });
      at += (match[1]!.length) - 1;
    }
  }

  return found;
}

export function checkSource(file: string, source: string): Problem[] {
  const problems: Problem[] = [];
  const code = withoutComments(source);
  const push = (code: string, message: string, index: number, severity: Problem['severity'] = 'error') =>
    problems.push({ code, severity, file, line: lineOf(source, index), message });

  // JSX tags: `<div`, `<bry-stack`. A tag follows something that can come
  // before an expression, which keeps `useState<string>` out of it.
  for (const match of code.matchAll(/(^|[\s(){}[\]=?:,&|>])<([a-z][\w-]*)(?=[\s/>])/gm)) {
    const name = match[2]!;
    const index = match.index! + match[1]!.length;

    if (!isElementName(name)) {
      push('element_unknown', `Brydio has no element called "${name}". A screen draws with ${Object.keys(CATALOGUE).join(', ')}.`, index);
      continue;
    }

    for (const attribute of attributesOf(code, index + 1 + name.length)) {
      if (attribute.name === 'key' || attribute.name === 'children') continue;

      const event = eventOfHandler(attribute.name);

      if (event !== null) {
        const refused = checkEvent(name, event);

        if (refused) push('event_unknown', refused, attribute.at);
        continue;
      }

      const spec = (CATALOGUE[name as ElementName].props as Record<string, unknown>)[attribute.name];

      if (!spec) {
        const style = attribute.name === 'style' || attribute.name === 'className' || attribute.name === 'class';

        push(style ? 'style_forbidden' : 'prop_unknown', checkProp(name, attribute.name, undefined)!, attribute.at);
      } else if (attribute.literal !== undefined) {
        const refused = checkProp(name, attribute.name, attribute.literal);

        if (refused) push('prop_value_invalid', refused, attribute.at);
      }
    }
  }

  // Elements made without JSX: `h('div', …)`, `createElement('div', …)`.
  for (const match of code.matchAll(/\b(?:h|createElement)\(\s*(["'])([^"']+)\1/g)) {
    if (!isElementName(match[2]) && match[2] !== '#text') {
      push('element_unknown', `Brydio has no element called "${match[2]}".`, match.index!);
    }
  }

  // A style or class anywhere, including through a spread's object.
  for (const match of withoutStrings(source).matchAll(/\b(style|className)\s*[:=]/g)) {
    push('style_forbidden', 'There is no style or class in a Brydio app: Brydio draws every element in its own style.', match.index!);
  }

  const bare = withoutStrings(source);

  for (const [pattern, why] of GLOBALS) {
    for (const match of bare.matchAll(pattern)) push('dom_global', `${match[0].replace(/\s+/g, ' ').trim()}: ${why}`, match.index!);
  }

  return dedupe(problems);
}

/** One problem per line and code: a `style=` found twice over is one mistake. */
function dedupe(problems: Problem[]): Problem[] {
  const seen = new Set<string>();

  return problems.filter(problem => {
    const key = `${problem.line}:${problem.code}`;

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}
