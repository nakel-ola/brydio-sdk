import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `docs/publish-checklist.md` and the code say the same (A8-F04-S03): every
 * problem code the command line or `@brydio/manifest` can report has a row,
 * and every row the command line is said to run names a code that exists.
 * Rows only Brydio's publish route runs ("no" under validate) are exempt
 * from the second half.
 */

const packages = join(import.meta.dir, '..', '..');
const doc = readFileSync(join(packages, '..', 'docs', 'publish-checklist.md'), 'utf8');

/** Every code in the source: `code: 'x'`, a `| 'x'` union member, a `FieldTypeInvalid('x', …)`, a printed `[x]`. */
function codesInSource(): Set<string> {
  const codes = new Set<string>();
  const patterns = [
    /code: '([a-z]+(?:_[a-z]+)+)'/g,
    /\| '([a-z]+(?:_[a-z]+)+)'/g,
    /FieldTypeInvalid\(\s*'([a-z]+(?:_[a-z]+)+)'/g,
    /\[([a-z]+(?:_[a-z]+)+)\]`/g,
  ];

  for (const dir of ['cli/src', 'manifest/src']) {
    for (const file of readdirSync(join(packages, dir))) {
      // A `kind:` union (a schema change's kind) is a name inside a problem, not a code.
      const text = readFileSync(join(packages, dir, file), 'utf8')
        .split('\n')
        .filter(line => !line.includes('kind: '))
        .join('\n');

      for (const pattern of patterns) for (const [, code] of text.matchAll(pattern)) codes.add(code!);
    }
  }

  return codes;
}

/**
 * What the SDK actually refuses with, by code.
 *
 * A problem carries its sentence as `message:` or `why:` in the same object
 * as its `code:`, or as the second argument to `new …Invalid(code, why)`.
 * The reach from `code:` to the sentence is bounded and stops at the next
 * `code:`, so a problem with a severity and a source position between the two
 * is still read and two problems in a row are never crossed.
 */
function sentencesInSource(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (code: string, sentence: string) =>
    found.set(code, [...(found.get(code) ?? []), sentence]);
  const written = String.raw`(\`(?:[^\`\\]|\\.)*\`|'(?:[^'\\]|\\.)*')`;
  const patterns = [
    ...['message', 'why'].map(
      key =>
        new RegExp(
          String.raw`code: '([a-z]+(?:_[a-z]+)+)',((?:(?!code: ')[\s\S]){0,400}?)${key}:\s*${written}`,
          'g'
        )
    ),
    new RegExp(String.raw`new [A-Z]\w*\(\s*'([a-z]+(?:_[a-z]+)+)',\s*${written}`, 'g'),
  ];

  for (const dir of ['cli/src', 'manifest/src']) {
    for (const file of readdirSync(join(packages, dir))) {
      const source = readFileSync(join(packages, dir, file), 'utf8');

      // The sentence is the last group each pattern captures.
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) add(match[1]!, match[match.length - 1]!);
      }
    }
  }

  return found;
}

/**
 * The words of a sentence that are the same every time: what is left once
 * every `${…}` is taken out. A name, a number or a list differs from app to
 * app and the page writes it `<like this>`, so only the fixed words can be
 * held to each other. Nesting is counted rather than matched, because a value
 * can itself be `${values.map(one => `"${one}"`).join(', ')}`.
 *
 * Fragments under twelve characters are dropped: `": "` between two names
 * appears in every row and would prove nothing.
 */
function fixedWords(literal: string): string[] {
  const body = literal.slice(1, -1);
  const words: string[] = [];
  let current = '';

  for (let at = 0; at < body.length; at += 1) {
    if (body[at] === '$' && body[at + 1] === '{') {
      let depth = 1;

      for (at += 2; at < body.length && depth > 0; at += 1) {
        if (body[at] === '{') depth += 1;
        else if (body[at] === '}') depth -= 1;
      }

      at -= 1;
      words.push(current);
      current = '';
      continue;
    }

    current += body[at];
  }

  words.push(current);

  return words
    .map(word => word.replace(/\\'/g, "'").replace(/\\`/g, '`').replace(/\s+/g, ' ').trim())
    .filter(word => word.length >= 12);
}

/** Each table row's codes (the backticked names in its first cell), and whether validate runs it. */
function rowsInDoc(): { codes: string[]; validate: string }[] {
  return doc
    .split('\n')
    .filter(line => line.startsWith('| `'))
    .map(line => {
      const [first = '', , validate = ''] = line.slice(1).split(' | ');

      return { codes: [...first.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map(match => match[1]!), validate: validate.trim() };
    });
}

/** What the page says a code is refused with: the "Refused with" cell, or cells. */
function refusalsInDoc(): Map<string, string> {
  const said = new Map<string, string>();

  for (const line of doc.split('\n')) {
    if (!line.startsWith('| `')) continue;

    const [first = '', refusal = ''] = line.slice(1).split(' | ');

    for (const [, code] of first.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
      said.set(code!, `${said.get(code!) ?? ''} ${refusal}`.replace(/`/g, '').replace(/\s+/g, ' '));
    }
  }

  return said;
}

describe('the publish checklist', () => {
  test('has a row for every code the SDK reports', () => {
    const documented = new Set(rowsInDoc().flatMap(row => row.codes));

    expect([...codesInSource()].filter(code => !documented.has(code)).sort()).toEqual([]);
  });

  test('names no code the SDK does not have, apart from the publish route’s own', () => {
    const source = codesInSource();
    const claimed = rowsInDoc().filter(row => !row.validate.startsWith('no'));

    expect(claimed.flatMap(row => row.codes).filter(code => !source.has(code)).sort()).toEqual([]);
    expect(claimed.length).toBeGreaterThan(50);
  });

  /**
   * The half that codes alone cannot hold. A page that lists the right codes
   * beside the wrong sentences is worse than no page: the words are what a
   * person reads in the terminal and then looks up here, and they can drift
   * apart silently while every other test on this file stays green.
   *
   * Where a code is refused with more than one sentence, the page is held to
   * one of them rather than all: several rows quote the sentence a builder
   * meets most often, on purpose.
   */
  test('says the sentences the SDK really refuses with, not only the right codes', () => {
    const said = refusalsInDoc();
    const drifted: string[] = [];
    let compared = 0;

    for (const [code, sentences] of [...sentencesInSource()].sort()) {
      const refusal = said.get(code);
      const written = [...new Set(sentences)].map(fixedWords).filter(words => words.length);

      if (!refusal || !written.length) continue;

      compared += 1;

      if (!written.some(words => words.every(word => refusal.includes(word)))) {
        drifted.push(
          `${code}\n  the SDK says: ${written.map(words => words.join(' … ')).join('\n                ')}\n  the page says: ${refusal.trim()}`
        );
      }
    }

    expect(drifted.join('\n\n')).toBe('');
    // Without this, a change to how a problem is written in the source could
    // leave nothing being compared and the test would still pass.
    expect(compared).toBeGreaterThan(50);
  });

  test('is linked from the README', () => {
    expect(readFileSync(join(packages, '..', 'README.md'), 'utf8')).toContain('(docs/publish-checklist.md)');
  });

  test('is named by validate\'s help, so the list of checks is one command away', async () => {
    const { main } = await import('../src/main.ts');
    const printed: string[] = [];

    await main(['help'], line => void printed.push(line));

    const help = printed.join('\n');

    expect(help).toContain('brydio validate');
    expect(help).toContain('docs/publish-checklist.md');
  });
});
