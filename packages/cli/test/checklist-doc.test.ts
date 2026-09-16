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
