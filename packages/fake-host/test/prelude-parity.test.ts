import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The fake host's prelude is a copy of Brydio's (contracts §11), so an app
 * meets the same walls in its tests as in a workspace. This reads Brydio's
 * `frame-page.ts` from its checkout and holds the copy to it: every name it
 * takes away as a call or as a read, and `navigator.storage`.
 */

const brydio = process.env.BRYDIO_DIR ?? join(import.meta.dir, '..', '..', '..', '..', 'brydio');
const framePage = join(brydio, 'apps/api/src/apps/frame/frame-page.ts');

/** What a prelude's source takes away: its `calls` and `reads` lists, and whether it takes `navigator.storage`. */
function walls(source: string) {
  const list = (name: string) => {
    const found = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(source);

    if (!found) throw new Error(`No ${name} list in the prelude.`);

    return [...found[1]!.matchAll(/'([A-Za-z]+)'/g)].map(match => match[1]!).sort();
  };

  return { calls: list('calls'), reads: list('reads'), storage: /replace\(scope\.navigator, 'storage', true\)/.test(source) };
}

describe.skipIf(!existsSync(framePage))("the fake host's prelude", () => {
  test("takes away exactly what Brydio's does", () => {
    const ours = walls(readFileSync(join(import.meta.dir, '..', 'src', 'prelude.ts'), 'utf8'));
    const brydios = walls(readFileSync(framePage, 'utf8'));

    expect(ours).toEqual(brydios);
    expect(ours.calls).toContain('fetch');
    expect(ours.reads).toContain('indexedDB');
  });
});
