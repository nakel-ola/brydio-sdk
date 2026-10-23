import { describe, expect, test } from 'bun:test';

import { brydioAnswers, inBrydio } from '../../../test-support/contracts.ts';

import * as look from '../src/look.ts';
import { validateManifest } from '../src/index.ts';
import { ISSUES_MANIFEST } from './issues-manifest.fixture.ts';
import { COLOUR_CORPUS, OPS_CORPUS, STYLE_CORPUS, THEME_CORPUS } from './look-corpus.ts';

/**
 * PB21 and PB22: the SDK's copy of Brydio's look rules answers as Brydio's
 * one source does (`apps/api/src/apps/manifest/app-look.ts`), sentence for
 * sentence, so `brydio validate`, the registry and the host check a style
 * and a theme the same way.
 */

const SOURCE = 'apps/api/src/apps/manifest/app-look.ts';
const names = new Set(['ocean', 'sand']);

type Look = typeof look;

/** Every answer one copy of the rules gives over the corpus. */
function answers(rules: Look) {
  return {
    styles: STYLE_CORPUS.map(style => ({
      refused: rules.styleRefusal(style),
      named: rules.styleRefusal(style, names),
      css: rules.styleRefusal(style) === null ? [rules.styleToCss(style as Record<string, unknown>, 'light'), rules.styleToCss(style as Record<string, unknown>, 'dark')] : null,
    })),
    themes: THEME_CORPUS.map(theme => ({
      problems: rules.themeProblems(theme),
      warnings: rules.themeWarnings(theme),
      variables: [rules.themeVariables(rules.themeOf({ theme }), 'light'), rules.themeVariables(rules.themeOf({ theme }), 'dark')],
    })),
    colours: COLOUR_CORPUS.map(colour => ({
      refused: rules.colourRefusal(colour, names),
      tone: rules.appColourOfTone(colour),
      css: [rules.cssColourOf(colour, 'light'), rules.cssColourOf(colour, 'dark')],
    })),
    canvases: OPS_CORPUS.map(ops => rules.canvasRefusal(ops)),
    lists: { properties: Object.keys(rules.STYLE_PROPERTIES), refused: rules.STYLE_REFUSED, colours: rules.BRYDIO_COLOURS },
  };
}

const brydio = await brydioAnswers('look', [SOURCE], async () => answers((await import(inBrydio(SOURCE))) as Look));

describe('the look rules are Brydio’s', () => {
  test('answer every style, theme, colour and canvas the way Brydio does', () => {
    expect(JSON.parse(JSON.stringify(answers(look)))).toEqual(brydio);
  });
});

describe('a theme in the manifest (PB21)', () => {
  test('is read with its own codes, and takes no font', () => {
    const codes = (theme: unknown) => validateManifest({ ...ISSUES_MANIFEST, theme }).problems.map(problem => [problem.code, problem.path]);

    expect(codes({ accent: { light: '#0e7490', dark: '#67e8f9' }, rounding: 'large', density: 'roomy' })).toEqual([]);
    expect(codes({ accent: '#0e7490', fontFamily: 'Inter' })).toEqual([
      ['theme_font', 'theme.fontFamily'],
      ['theme_colour_pair', 'theme.accent'],
    ]);
  });
});
