#!/usr/bin/env bun
/**
 * `bun run docs:elements`: writes `docs/elements.md` from the catalogue
 * itself (`tasks/apps` A9-F03-S02).
 *
 * Generated rather than written, so that an element or a setting added to
 * `@brydio/ui` cannot be missing from the reference — nobody has to remember.
 * `packages/cli/test/elements-doc.test.ts` builds the same text and fails
 * when the file on disk differs, which is A9-F03-TC002: the docs cannot fall
 * behind the types.
 *
 * What it cannot generate, it does not pretend to: an example of each element
 * and a picture of it in light and dark are the rest of that story, and they
 * need a docs site to live in.
 */

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { CATALOGUE, type ElementSpec, type PropSpec } from '../packages/ui/src/catalogue.ts';

const ROOT = resolve(import.meta.dir, '..');

/** What a setting takes, in a person's words rather than the type's. */
export function valuesOf(spec: PropSpec): string {
  switch (spec.kind) {
    case 'enum':
      return spec.values.map(value => `\`${value}\``).join(', ');
    case 'text':
      return `text, at most ${spec.max.toLocaleString('en-GB')} characters`;
    case 'boolean':
      return '`true` or `false`';
    case 'int':
      return `a whole number from ${spec.min} to ${spec.max}`;
    case 'options':
      return `at most ${spec.max.toLocaleString('en-GB')} \`{ value, label }\` choices`;
    case 'list':
      return `a list of at most ${spec.max.toLocaleString('en-GB')}: ${valuesOf(spec.of)}`;
    case 'shape':
      return `a record of ${Object.keys(spec.fields)
        .map(field => `\`${field}\``)
        .join(', ')}${spec.required?.length ? ` (needs ${spec.required.map(one => `\`${one}\``).join(', ')})` : ''}`;
  }
}

function sectionFor(name: string, spec: ElementSpec): string {
  const required = new Set(spec.required ?? []);
  const settings = Object.entries(spec.props);
  const lines = [`## \`${name}\``, ''];

  lines.push(
    spec.children ? 'Holds other elements or text.' : 'Holds nothing: it is drawn from its settings alone.',
    ''
  );

  if (settings.length) {
    lines.push('| Setting | Takes | Needed |', '|---|---|---|');

    for (const [setting, prop] of settings) {
      lines.push(`| \`${setting}\` | ${valuesOf(prop)} | ${required.has(setting) ? 'yes' : 'no'} |`);
    }
  } else {
    lines.push('No settings.');
  }

  lines.push(
    '',
    spec.events.length
      ? `Tells the app: ${spec.events.map(event => `\`${event}\``).join(', ')}.`
      : 'Tells the app nothing.',
    ''
  );

  return lines.join('\n');
}

/** The whole reference, as one string, so a test can build it without writing it. */
export function elementsDoc(): string {
  const names = Object.keys(CATALOGUE) as (keyof typeof CATALOGUE)[];

  return [
    '# The catalogue',
    '',
    'Every element an app may draw, with its settings and what each takes.',
    'A screen draws these and nothing else: there is no HTML, no styling and no',
    'colour of your own — Brydio draws them in its own theme, light and dark,',
    'so an app looks like the rest of the product without trying to.',
    '',
    '**This page is generated** from the catalogue itself by',
    '`bun run docs:elements`. Adding an element or a setting and not running it',
    'fails `packages/cli/test/elements-doc.test.ts`, so the reference cannot',
    'fall behind the code. Do not edit it by hand.',
    '',
    'A setting the element does not declare is refused, as is a value outside',
    'what it takes; `brydio validate` catches both before you publish, with the',
    'codes in [the publish checklist](publish-checklist.md).',
    '',
    'A toast is not an element: it is said, not placed. A screen shows one with',
    "`toast(text, tone)` from `@brydio/app`, which Brydio draws in its own",
    'toaster; see [the bridge](bridge.md).',
    '',
    `There are ${names.length} elements.`,
    '',
    names.map(name => `- [\`${name}\`](#${name.replace(/[^a-z-]/g, '')})`).join('\n'),
    '',
    ...names.map(name => sectionFor(name, CATALOGUE[name] as ElementSpec)),
  ].join('\n');
}

if (import.meta.main) {
  const path = join(ROOT, 'docs', 'elements.md');

  writeFileSync(path, `${elementsDoc().replace(/\n+$/, '')}\n`);
  console.log(`Wrote ${path}`);
}
