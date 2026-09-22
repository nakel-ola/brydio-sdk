import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ELEMENT_NAMES } from '../src/catalogue.ts';

/**
 * Every catalogue element has a drawing in the web build (A6-F06-S01).
 *
 * The registration keeps pace with the catalogue by itself: `defineCatalogue`
 * walks `CATALOGUE`, so a new element becomes a custom element, takes its
 * settings and announces its events with nobody doing anything. The **drawing**
 * does not. `drawAs` fills a map that `render` reads, and where the map has
 * nothing the element falls back to `<slot></slot>`, or to nothing at all where
 * the element holds no children — silently, with no warning anywhere.
 *
 * So the existing "every element is a custom element of the same name" test
 * passes for an element that draws nothing, and the element is real, typed and
 * blank. This is the case that test cannot see.
 *
 * It is read from the source rather than from the map, because the map is
 * private to `define.ts` and reading it would mean widening that file's
 * exports for a test. Two halves, because either alone can be true while the
 * element still draws nothing: an element must be named in a draw file, **and**
 * that draw file must be one `web/index.ts` imports.
 */

const web = join(import.meta.dir, '../src/web');

/** The `./draw/<name>.ts` files `web/index.ts` imports for their side effects. */
function imported(): string[] {
  const index = readFileSync(join(web, 'index.ts'), 'utf8');

  return [...index.matchAll(/^import '\.\/draw\/([\w.-]+\.ts)';$/gm)].map(match => match[1]!);
}

/** The elements a draw file draws, in the order it draws them. */
const drawnBy = (file: string) =>
  [...readFileSync(join(web, 'draw', file), 'utf8').matchAll(/\bdrawAs\(\s*'([\w-]+)'/g)].map(match => match[1]!);

/** A draw file with no `drawAs` at all is a helper (tokens, shared pieces), not a drawing. */
const drawFiles = () => readdirSync(join(web, 'draw')).filter(name => name.endsWith('.ts') && drawnBy(name).length > 0);

describe('the web build draws every catalogue element (A6-F06-S01)', () => {
  test('every element is drawn, and nothing is drawn that is not an element', () => {
    const drawn = imported().flatMap(drawnBy);

    expect(new Set(drawn).size, 'two drawings for one element; the later one wins').toBe(drawn.length);
    expect([...drawn].sort()).toEqual([...ELEMENT_NAMES].sort());
  });

  test('every draw file is imported, so its drawings are registered', () => {
    expect(drawFiles().sort()).toEqual(imported().sort());
  });
});
