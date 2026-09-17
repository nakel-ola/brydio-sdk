import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';

/**
 * The web components can only make pairings the kit's own contrast check
 * already gates (A6-F06-S01, TC003).
 *
 * The kit measures its ratios from `tokens.css` in both themes
 * (`packages/ui/scripts/check-contrast.mjs`). These elements pass that same
 * check by construction rather than by a second measurement: they name no
 * colour of their own, only tokens that file declares, and every ink they put
 * on a fill is a pairing the kit gates. A literal colour here would be a
 * colour nobody measured.
 */

const TOKENS = 'packages/ui/src/styles/tokens.css';
const GATES = 'packages/ui/scripts/check-contrast.mjs';

const web = join(import.meta.dir, '../src/web');

/** Every source file of the build. */
function sources(dir: string): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) return sources(path);

    return entry.name.endsWith('.ts') ? [{ path: path.slice(path.indexOf('src')), text: readFileSync(path, 'utf8') }] : [];
  });
}

/** What the build's own copy of the token file declares. */
function declaredTokens(): Set<string> {
  const css = readFileSync(join(import.meta.dir, '../src/web/tokens.css'), 'utf8');

  return new Set([...css.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map(found => found[1]!));
}

describe('the colours the web build may use (A6-F06-S01)', () => {
  test('names no colour of its own: only tokens the stylesheet declares', () => {
    // Ink and fill only: a literal in a `var(--x, …)` fallback is what shows
    // when a token is missing altogether, and a shadow's colour carries no text.
    const literal = /^\s*(?:color|background|background-color|border-color)\s*:.*(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\()/;
    const named = new Set<string>();
    const offending: string[] = [];

    for (const { path, text } of sources(web)) {
      // The token file is the declaration itself, not a user of it.
      if (path.endsWith('tokens.css')) continue;

      for (const line of text.split('\n')) {
        if (literal.test(line)) offending.push(`${path}: ${line.trim()}`);
      }
      for (const found of text.matchAll(/var\((--[a-z0-9-]+)/g)) named.add(found[1]!);
    }

    expect(offending).toEqual([]);

    // Every token it names is one the stylesheet declares, so nothing it draws
    // with is a colour the kit never measured.
    const declared = declaredTokens();

    expect([...named].filter(token => !declared.has(token) && !token.startsWith('--bry-')).sort()).toEqual([]);
  });

  test('puts ink on a fill only where the kit gates that pairing', async () => {
    const gates = await brydioAnswers('contrast-gates', [GATES, TOKENS], () => {
      const script = readFileSync(inBrydio(GATES), 'utf8');

      return [...script.matchAll(/\["(--[a-z0-9-]+)", "(--[a-z0-9-]+)", [\d.]+, "[^"]*"\]/g)].map(found => `${found[1]} on ${found[2]}`);
    });

    // The status tints and their inks, which badge and text put together.
    const used = ['--success-fg on --success-soft', '--warn-fg on --warn-soft', '--danger-fg on --danger-soft', '--brand-fg on --brand-soft'];
    const gated = new Set(gates);

    // Each is gated against the ground the tint is mixed from, which is what
    // `check-contrast.mjs` resolves a `color-mix` to.
    expect(used.every(pair => gated.has(pair.replace(/-soft$/, '')) || gated.has(pair.replace(/ on --([a-z]+)-soft$/, ' on --bg-app')))).toBe(true);

    // And the two solid fills the build uses.
    expect(gated.has('--brand-on on --brand')).toBe(true);
    expect(gated.has('--fg-on-solid on --danger')).toBe(true);
  });
});
