import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DOCUMENT_LIMITS, FIELD_LIMITS, parseFieldType, validateManifest, valueProblem } from '../src/index.ts';

/**
 * The limits an author sees before publishing (A3-F01-S03): on the manifest's
 * documentation page, in `validate`'s messages, and in the types' comments.
 * The page's numbers are the constants', and the constants are Brydio's.
 */

const repository = join(import.meta.dir, '..', '..', '..');
const brydio = process.env.BRYDIO_DIR ?? join(repository, '..', 'brydio');
const page = readFileSync(join(repository, 'docs', 'manifest.md'), 'utf8');
const serverFields = join(brydio, 'apps/api/src/apps/manifest/field-types.ts');
const serverDocuments = join(brydio, 'apps/api/src/apps/data/document-query.ts');

/** `{ key: 20, bodyBytes: 256 * 1024 }` read from a `const NAME = { … } as const` in TypeScript source. */
function constantIn(source: string, name: string): Record<string, number> {
  const body = new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\} as const;`).exec(source)?.[1];

  if (!body) throw new Error(`${name} not found`);

  return Object.fromEntries(
    [...body.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').matchAll(/(\w+):\s*([\d_ *]+),/g)].map(([, key, value]) => [
      key!,
      value!
        .replaceAll('_', '')
        .split('*')
        .reduce((product, factor) => product * Number(factor.trim()), 1),
    ]),
  );
}

/** The documentation page's limit rows: `FIELD_LIMITS.collections` → 20. */
const documented = Object.fromEntries(
  [...page.matchAll(/^\| `((?:FIELD|DOCUMENT)_LIMITS\.\w+)` \| ([\d,]+) \|/gm)].map(([, key, value]) => [key!, Number(value!.replaceAll(',', ''))]),
);

describe('the limits on the manifest page', () => {
  test('are every field and record limit, with its value, and nothing else', () => {
    const constants = {
      ...Object.fromEntries(Object.entries(FIELD_LIMITS).map(([key, value]) => [`FIELD_LIMITS.${key}`, value])),
      ...Object.fromEntries(Object.entries(DOCUMENT_LIMITS).map(([key, value]) => [`DOCUMENT_LIMITS.${key}`, value])),
    };

    expect(documented).toEqual(constants);
  });

  test.skipIf(!existsSync(serverFields) || !existsSync(serverDocuments))("are Brydio's own", () => {
    expect(constantIn(readFileSync(serverFields, 'utf8'), 'FIELD_LIMITS')).toEqual({ ...FIELD_LIMITS });
    expect(constantIn(readFileSync(serverDocuments, 'utf8'), 'DOCUMENT_LIMITS')).toEqual({ ...DOCUMENT_LIMITS });
  });
});

describe("validate's messages say the limit", () => {
  const manifest = (data: Record<string, unknown>) => ({
    name: 'limits',
    version: '0.1.0',
    placements: [{ kind: 'project-tab', screen: 'home' }],
    screens: { home: { entry: 'screens/home.js' } },
    data,
  });
  const messages = (data: Record<string, unknown>) => validateManifest(manifest(data)).problems.map(problem => problem.message).join('\n');
  const long = 'a'.repeat(FIELD_LIMITS.nameChars + 1);

  test.each([
    ['collections', () => Object.fromEntries(Array.from({ length: FIELD_LIMITS.collections + 1 }, (_, i) => [`c${i}`, { schema: { title: 'string' } }])), FIELD_LIMITS.collections],
    ['fields', () => ({ items: { schema: Object.fromEntries(Array.from({ length: FIELD_LIMITS.fields + 1 }, (_, i) => [`f${i}`, 'string'])) } }), FIELD_LIMITS.fields],
    ['enumValues', () => ({ items: { schema: { status: Array.from({ length: FIELD_LIMITS.enumValues + 1 }, (_, i) => `v${i}`) } } }), FIELD_LIMITS.enumValues],
    ['enumValueChars', () => ({ items: { schema: { status: ['x'.repeat(FIELD_LIMITS.enumValueChars + 1)] } } }), FIELD_LIMITS.enumValueChars],
    ['nameChars (a collection)', () => ({ [long]: { schema: { title: 'string' } } }), FIELD_LIMITS.nameChars],
    ['nameChars (a label)', () => ({ items: { label: long, schema: { title: 'string' } } }), FIELD_LIMITS.nameChars],
    ['nameChars (a field)', () => ({ items: { schema: { [long]: 'string' } } }), FIELD_LIMITS.nameChars],
  ] as const)('%s', (_, data, limit) => {
    expect(messages(data())).toContain(`at most ${limit}`);
  });

  test("and a write's refusal names the field and the limit", () => {
    expect(valueProblem('title', parseFieldType('string'), 'x'.repeat(FIELD_LIMITS.stringChars + 1))).toBe('title is longer than 1,000 characters.');
    expect(valueProblem('body', parseFieldType('text'), 'x'.repeat(FIELD_LIMITS.textChars + 1))).toBe('body is longer than 100,000 characters.');
    expect(valueProblem('tags', parseFieldType('string[]'), Array.from({ length: FIELD_LIMITS.listEntries + 1 }, () => 'x'))).toBe(
      'tags may hold at most 100 entries.',
    );
  });
});
