/**
 * How an app may look: its theme (`tasks/app-publishing` PB21) and the
 * `style` any element takes (PB22).
 *
 * A copy of Brydio's rule set, `apps/api/src/apps/manifest/app-look.ts`, which
 * is the one source: a publish and the registry read it there, the host
 * checks every node it draws with its own copy, and `brydio validate`, the
 * catalogue's checks (`@brydio/ui/validate`) and the fake host read this
 * one. `test/look.test.ts` holds
 * this copy to Brydio's answers, sentence for sentence, whenever a Brydio
 * checkout sits beside this repository, and to the recorded answers in
 * `contracts/brydio.json` otherwise. It imports nothing.
 */

/* ------------------------------------------------------------------ colours */

/** A name an app gives one of its colours: `ocean`, read as `app.ocean`. */
export const APP_COLOUR_NAME = /^[a-z][a-z0-9-]{0,31}$/;
/** The most named colours a theme may hold. */
export const MAX_APP_COLOURS = 24;
/** A plain colour: `#rgb` or `#rrggbb`. */
export const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
/** WCAG AA for body text. */
export const TEXT_CONTRAST = 4.5;

/**
 * Brydio's own colours an app may name in a style, each to the token it
 * reads. They follow light and dark by themselves.
 */
export const BRYDIO_COLOURS: Readonly<Record<string, string>> = {
  text: '--fg',
  'text-strong': '--fg-strong',
  'text-soft': '--fg-soft',
  'text-muted': '--fg-muted',
  'text-faint': '--fg-faint',
  surface: '--bg-surface',
  'surface-soft': '--bg-surface-soft',
  sunken: '--bg-sunken',
  elevated: '--bg-elevated',
  fill: '--bg-fill',
  selected: '--bg-selected',
  page: '--bg-page',
  line: '--line',
  'line-strong': '--line-strong',
  'line-faint': '--line-faint',
  brand: '--brand',
  'brand-text': '--brand-fg',
  'brand-on': '--brand-on',
  'brand-soft': '--brand-soft',
  'brand-line': '--brand-line',
  success: '--success',
  'success-text': '--success-fg',
  'success-soft': '--success-soft',
  warn: '--warn',
  'warn-text': '--warn-fg',
  'warn-soft': '--warn-soft',
  danger: '--danger',
  'danger-text': '--danger-fg',
  'danger-soft': '--danger-soft',
};

/**
 * What a check reads a Brydio colour as, to judge contrast on a screenshot.
 * Near enough to the tokens to judge by; never drawn.
 */
export const BRYDIO_COLOUR_CHECK_VALUES: Readonly<Record<'light' | 'dark', Readonly<Record<string, string>>>> = {
  light: {
    text: '#1f1f1f', 'text-strong': '#0f0f0f', 'text-soft': '#3d3d3d', 'text-muted': '#666666', 'text-faint': '#8a8a8a',
    surface: '#ffffff', 'surface-soft': '#fafafa', sunken: '#f5f5f5', elevated: '#ffffff', fill: '#f0f0f0', selected: '#ebebeb', page: '#ffffff',
    line: '#e5e5e5', 'line-strong': '#d4d4d4', 'line-faint': '#f0f0f0',
    brand: '#00746a', 'brand-text': '#00746a', 'brand-on': '#ffffff', 'brand-soft': '#eaf5f3', 'brand-line': '#b3ddd6',
    success: '#15803d', 'success-text': '#15803d', 'success-soft': '#ecfdf3',
    warn: '#b45309', 'warn-text': '#b45309', 'warn-soft': '#fffbeb',
    danger: '#c62828', 'danger-text': '#c62828', 'danger-soft': '#fef2f2',
  },
  dark: {
    text: '#ededed', 'text-strong': '#fafafa', 'text-soft': '#d4d4d4', 'text-muted': '#a3a3a3', 'text-faint': '#7a7a7a',
    surface: '#212121', 'surface-soft': '#262626', sunken: '#1a1a1a', elevated: '#2a2a2a', fill: '#2e2e2e', selected: '#333333', page: '#1c1c1c',
    line: '#333333', 'line-strong': '#404040', 'line-faint': '#2a2a2a',
    brand: '#00746a', 'brand-text': '#79c2b8', 'brand-on': '#ffffff', 'brand-soft': '#003e38', 'brand-line': '#00574f',
    success: '#22c55e', 'success-text': '#4ade80', 'success-soft': '#052e16',
    warn: '#f59e0b', 'warn-text': '#fbbf24', 'warn-soft': '#2b1d05',
    danger: '#ef4444', 'danger-text': '#f87171', 'danger-soft': '#2c0b0b',
  },
};

/** Where Brydio draws an app: the ground a screenshot check reads text against. */
export const GROUND = { light: '#ffffff', dark: '#212121' } as const;

/** A colour with a value for each theme. */
export interface ColourPair {
  light: string;
  dark: string;
}

/* -------------------------------------------------------------------- theme */

export const THEME_DENSITIES = ['compact', 'normal', 'roomy'] as const;
export const THEME_ROUNDINGS = ['none', 'small', 'normal', 'large', 'round'] as const;

export type ThemeDensity = (typeof THEME_DENSITIES)[number];
export type ThemeRounding = (typeof THEME_ROUNDINGS)[number];

/** How much each density scales Brydio's spacing and control heights. */
export const DENSITY_SCALE: Readonly<Record<ThemeDensity, number>> = { compact: 0.85, normal: 1, roomy: 1.15 };
/** How much each rounding scales Brydio's corner radii. */
export const ROUNDING_SCALE: Readonly<Record<ThemeRounding, number>> = { none: 0, small: 0.6, normal: 1, large: 1.4, round: 2 };

/** An app's theme, as the manifest gives it (PB21). */
export interface AppTheme {
  /** What the `brand` tone becomes inside the app. */
  accent?: ColourPair;
  /** Named colours, read as `app.<name>`. */
  colors?: Record<string, ColourPair>;
  rounding?: ThemeRounding;
  density?: ThemeDensity;
}

const THEME_KEYS = ['accent', 'colors', 'rounding', 'density'] as const;

/** Words people reach for that the theme refuses on purpose, with why. */
const THEME_REFUSED: Readonly<Record<string, string>> = {
  font: 'There is no font setting: every app uses Brydio’s own font.',
  fontFamily: 'There is no font setting: every app uses Brydio’s own font.',
  fonts: 'There is no font setting: every app uses Brydio’s own font.',
  colours: 'Named colours go in "colors".',
};

export type LookProblemCode =
  | 'theme_invalid'
  | 'theme_font'
  | 'theme_colour_pair'
  | 'theme_colour_format'
  | 'theme_colour_name'
  | 'theme_colours_too_many'
  | 'theme_density'
  | 'theme_rounding';

export type LookWarningCode = 'theme_contrast_low';

/** One thing wrong with a theme, named down to the field. */
export interface LookProblem {
  code: LookProblemCode | LookWarningCode;
  message: string;
  /** Inside the manifest: `theme.colors.ocean.dark`. */
  path: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Everything a publish refuses about a theme. Empty when it is fine. */
export function themeProblems(theme: unknown): LookProblem[] {
  if (theme === undefined) return [];
  if (!isRecord(theme)) return [{ code: 'theme_invalid', path: 'theme', message: 'The theme is a record: accent, colors, rounding, density.' }];

  const problems: LookProblem[] = [];

  for (const key of Object.keys(theme)) {
    if ((THEME_KEYS as readonly string[]).includes(key)) continue;

    const why = THEME_REFUSED[key];

    problems.push({
      code: why && key !== 'colours' ? 'theme_font' : 'theme_invalid',
      path: `theme.${key}`,
      message: why ?? `The theme has no setting called "${key}". It takes ${THEME_KEYS.join(', ')}.`,
    });
  }

  if (theme.accent !== undefined) problems.push(...pairProblems(theme.accent, 'theme.accent', 'The accent'));

  if (theme.colors !== undefined) {
    if (!isRecord(theme.colors)) {
      problems.push({ code: 'theme_invalid', path: 'theme.colors', message: 'Named colours are a record: { "ocean": { "light": "#0e7490", "dark": "#67e8f9" } }.' });
    } else {
      const names = Object.keys(theme.colors);

      if (names.length > MAX_APP_COLOURS) {
        problems.push({ code: 'theme_colours_too_many', path: 'theme.colors', message: `A theme holds at most ${MAX_APP_COLOURS} named colours.` });
      }

      for (const name of names) {
        if (!APP_COLOUR_NAME.test(name)) {
          problems.push({
            code: 'theme_colour_name',
            path: `theme.colors.${name}`,
            message: `"${name}" is not a colour name: lower-case letters, digits and dashes, starting with a letter, at most 32.`,
          });
          continue;
        }

        problems.push(...pairProblems(theme.colors[name], `theme.colors.${name}`, `The colour "${name}"`));
      }
    }
  }

  if (theme.density !== undefined && !(THEME_DENSITIES as readonly unknown[]).includes(theme.density)) {
    problems.push({ code: 'theme_density', path: 'theme.density', message: `The density is one of ${THEME_DENSITIES.join(', ')}.` });
  }

  if (theme.rounding !== undefined && !(THEME_ROUNDINGS as readonly unknown[]).includes(theme.rounding)) {
    problems.push({ code: 'theme_rounding', path: 'theme.rounding', message: `The rounding is one of ${THEME_ROUNDINGS.join(', ')}.` });
  }

  return problems;
}

function pairProblems(value: unknown, path: string, said: string): LookProblem[] {
  if (!isRecord(value) || value.light === undefined || value.dark === undefined) {
    return [{ code: 'theme_colour_pair', path, message: `${said} needs both a light and a dark value: { "light": "#…", "dark": "#…" }.` }];
  }

  const problems: LookProblem[] = [];

  for (const key of Object.keys(value)) {
    if (key !== 'light' && key !== 'dark') {
      problems.push({ code: 'theme_colour_pair', path: `${path}.${key}`, message: `${said} has only a light and a dark value.` });
    }
  }

  for (const mode of ['light', 'dark'] as const) {
    if (typeof value[mode] !== 'string' || !HEX_COLOUR.test(value[mode] as string)) {
      problems.push({ code: 'theme_colour_format', path: `${path}.${mode}`, message: `${said}'s ${mode} value is a colour like #0e7490.` });
    }
  }

  return problems;
}

/**
 * What a publish warns about a theme, and never refuses: a colour whose best
 * text, white or near-black, falls below WCAG AA on it.
 */
export function themeWarnings(theme: unknown): LookProblem[] {
  if (!isRecord(theme) || themeProblems(theme).length) return [];

  const warnings: LookProblem[] = [];
  const check = (pair: ColourPair, path: string, said: string) => {
    for (const mode of ['light', 'dark'] as const) {
      const ratio = contrastOf(onColour(pair[mode]), pair[mode]);

      if (ratio < TEXT_CONTRAST) {
        warnings.push({
          code: 'theme_contrast_low',
          path: `${path}.${mode}`,
          message: `Text on ${said} in ${mode} mode reads at ${ratio.toFixed(2)}:1, below the ${TEXT_CONTRAST}:1 WCAG AA asks for.`,
        });
      }
    }
  };
  const accent = theme.accent as ColourPair | undefined;

  if (accent) check(accent, 'theme.accent', 'the accent');

  for (const [name, pair] of Object.entries((theme.colors ?? {}) as Record<string, ColourPair>)) {
    check(pair, `theme.colors.${name}`, `"${name}"`);
  }

  return warnings;
}

/** The theme as code reads it after `themeProblems` found nothing. */
export function themeOf(manifest: unknown): AppTheme | null {
  const theme = isRecord(manifest) ? manifest.theme : undefined;

  return isRecord(theme) && themeProblems(theme).length === 0 ? (theme as AppTheme) : null;
}

/* ------------------------------------------------------------ colour maths */

/** `#abc` → `[170, 187, 204]`, or null. */
export function rgbOf(hex: string): [number, number, number] | null {
  if (!HEX_COLOUR.test(hex)) return null;

  const digits = hex.length === 4 ? [...hex.slice(1)].map(digit => digit + digit).join('') : hex.slice(1);

  return [0, 2, 4].map(at => parseInt(digits.slice(at, at + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;

    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast between two plain colours; 1 when either isn't one. */
export function contrastOf(a: string, b: string): number {
  const first = rgbOf(a);
  const second = rgbOf(b);

  if (!first || !second) return 1;

  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x) as [number, number];

  return (light + 0.05) / (dark + 0.05);
}

/** The text colour that reads best on a fill: white or near-black. */
export function onColour(fill: string): string {
  return contrastOf('#ffffff', fill) >= contrastOf('#111111', fill) ? '#ffffff' : '#111111';
}

/* -------------------------------------------------------------------- style */

/** How long a style may be, so a node can't carry a stylesheet. */
export const STYLE_MAX_KEYS = 48;
export const STYLE_MAX_BYTES = 4 * 1024;
/** The furthest a length may reach, in pixels. */
export const LENGTH_MAX = 10_000;
/** Brydio's spacing steps an app may name: `space.4`. */
export const SPACE_MAX = 16;
/** The highest layer inside an app's area. The area starts its own, so this is all an app needs. */
export const Z_INDEX_MAX = 10;

export const BRYDIO_RADII = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const;
export const BRYDIO_SHADOWS = ['xs', 'sm', 'md', 'lg'] as const;
export const TRANSITIONS = ['none', 'fast', 'base', 'slow'] as const;

type Rule =
  | { kind: 'size' }
  | { kind: 'space'; negative: boolean; sides: boolean }
  | { kind: 'offset' }
  | { kind: 'colour' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'number'; min: number; max: number; integer?: boolean }
  | { kind: 'border-width' }
  | { kind: 'radius' }
  | { kind: 'shadow' }
  | { kind: 'font-size' }
  | { kind: 'font-weight' }
  | { kind: 'line-height' }
  | { kind: 'flex' }
  | { kind: 'tracks' }
  | { kind: 'grid-line' }
  | { kind: 'position' }
  | { kind: 'z-index' }
  | { kind: 'image' }
  | { kind: 'transition' };

const ALIGN = ['start', 'end', 'center', 'stretch', 'baseline', 'flex-start', 'flex-end', 'normal'] as const;
const JUSTIFY = [...ALIGN, 'space-between', 'space-around', 'space-evenly'] as const;
const OVERFLOW = ['visible', 'hidden', 'clip', 'auto', 'scroll'] as const;

/** Every property a style may set (PB22), and what it takes. Nothing else is drawn. */
export const STYLE_PROPERTIES: Readonly<Record<string, Rule>> = {
  width: { kind: 'size' },
  height: { kind: 'size' },
  minWidth: { kind: 'size' },
  maxWidth: { kind: 'size' },
  minHeight: { kind: 'size' },
  maxHeight: { kind: 'size' },
  padding: { kind: 'space', negative: false, sides: true },
  paddingTop: { kind: 'space', negative: false, sides: false },
  paddingRight: { kind: 'space', negative: false, sides: false },
  paddingBottom: { kind: 'space', negative: false, sides: false },
  paddingLeft: { kind: 'space', negative: false, sides: false },
  paddingInline: { kind: 'space', negative: false, sides: false },
  paddingBlock: { kind: 'space', negative: false, sides: false },
  margin: { kind: 'space', negative: true, sides: true },
  marginTop: { kind: 'space', negative: true, sides: false },
  marginRight: { kind: 'space', negative: true, sides: false },
  marginBottom: { kind: 'space', negative: true, sides: false },
  marginLeft: { kind: 'space', negative: true, sides: false },
  marginInline: { kind: 'space', negative: true, sides: false },
  marginBlock: { kind: 'space', negative: true, sides: false },
  gap: { kind: 'space', negative: false, sides: false },
  rowGap: { kind: 'space', negative: false, sides: false },
  columnGap: { kind: 'space', negative: false, sides: false },
  background: { kind: 'colour' },
  color: { kind: 'colour' },
  borderColor: { kind: 'colour' },
  borderWidth: { kind: 'border-width' },
  borderStyle: { kind: 'enum', values: ['solid', 'dashed', 'dotted', 'none'] },
  borderRadius: { kind: 'radius' },
  boxShadow: { kind: 'shadow' },
  backgroundImage: { kind: 'image' },
  backgroundSize: { kind: 'enum', values: ['auto', 'cover', 'contain'] },
  backgroundPosition: { kind: 'enum', values: ['center', 'top', 'bottom', 'left', 'right'] },
  backgroundRepeat: { kind: 'enum', values: ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'] },
  fontSize: { kind: 'font-size' },
  fontWeight: { kind: 'font-weight' },
  lineHeight: { kind: 'line-height' },
  textAlign: { kind: 'enum', values: ['start', 'center', 'end', 'left', 'right', 'justify'] },
  opacity: { kind: 'number', min: 0, max: 1 },
  display: { kind: 'enum', values: ['flex', 'inline-flex', 'grid', 'inline-grid', 'block', 'inline-block', 'inline', 'none'] },
  flexDirection: { kind: 'enum', values: ['row', 'column', 'row-reverse', 'column-reverse'] },
  flexWrap: { kind: 'enum', values: ['nowrap', 'wrap', 'wrap-reverse'] },
  flex: { kind: 'flex' },
  flexGrow: { kind: 'number', min: 0, max: 12 },
  flexShrink: { kind: 'number', min: 0, max: 12 },
  flexBasis: { kind: 'size' },
  order: { kind: 'number', min: -100, max: 100, integer: true },
  alignItems: { kind: 'enum', values: ALIGN },
  alignSelf: { kind: 'enum', values: [...ALIGN, 'auto'] },
  alignContent: { kind: 'enum', values: JUSTIFY },
  justifyContent: { kind: 'enum', values: JUSTIFY },
  justifyItems: { kind: 'enum', values: ALIGN },
  justifySelf: { kind: 'enum', values: [...ALIGN, 'auto'] },
  gridTemplateColumns: { kind: 'tracks' },
  gridTemplateRows: { kind: 'tracks' },
  gridColumn: { kind: 'grid-line' },
  gridRow: { kind: 'grid-line' },
  position: { kind: 'position' },
  top: { kind: 'offset' },
  right: { kind: 'offset' },
  bottom: { kind: 'offset' },
  left: { kind: 'offset' },
  inset: { kind: 'offset' },
  zIndex: { kind: 'z-index' },
  overflow: { kind: 'enum', values: OVERFLOW },
  overflowX: { kind: 'enum', values: OVERFLOW },
  overflowY: { kind: 'enum', values: OVERFLOW },
  transition: { kind: 'transition' },
};

/** Properties people reach for that are refused on purpose, with the rule that refuses them. */
export const STYLE_REFUSED: Readonly<Record<string, string>> = {
  fontFamily: 'every app uses Brydio’s own font, so there is no font setting',
  font: 'every app uses Brydio’s own font, so there is no font setting',
  animation: 'animations that never stop aren’t allowed, and a style has no animation; use transition for a change of state',
  animationName: 'animations that never stop aren’t allowed, and a style has no animation; use transition for a change of state',
  animationIterationCount: 'animations that never stop aren’t allowed, and a style has no animation; use transition for a change of state',
  backgroundColor: 'the colour of a background is "background"',
  border: 'a border is borderWidth, borderStyle and borderColor, each on its own',
  transform: 'a transform could move an element out of where Brydio laid it; use margin or position inside the app’s area',
  filter: 'a filter is not on the list of properties a style may set',
  backdropFilter: 'a filter is not on the list of properties a style may set',
  clipPath: 'a clip path is not on the list of properties a style may set',
  mask: 'a mask could load an image from outside the app',
  content: 'there is no generated content in an app',
  cursor: 'Brydio chooses the pointer from what an element does',
  pointerEvents: 'Brydio decides what can be pressed',
  outline: 'Brydio draws the focus ring, so the outline is its own',
};

/** An address the app's file store gives a file: `…/files/apps/<instance>/<file>`. */
const APP_FILE_ADDRESS = /^(?:https?:\/\/[^/\s]+)?(?:\/[\w.-]+)*\/files\/apps\/[\w-]{1,128}\/[\w-]{1,128}$/;
const VIEWPORT_UNIT = /^-?\d+(\.\d+)?(vw|vh|vmin|vmax|dvh|dvw|svh|svw|lvh|lvw)$/;
const LENGTH = /^(-?\d+(?:\.\d+)?)(px|rem|em|%)$/;
const SPACE = /^(-?)space\.(\d{1,2})$/;
const SIZE_WORDS = ['auto', 'fit-content', 'min-content', 'max-content'];

/** What a style looks like when it is fine, for the sentences that refuse one. */
const LENGTH_SAID = 'a length: a number of pixels, "12px", "1.5rem", "50%" or a spacing step like "space.4"';

function lengthRefusal(value: unknown, options: { negative: boolean; words?: readonly string[] }): string | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > LENGTH_MAX) return `must be at most ${LENGTH_MAX} pixels`;
    if (value < 0 && !options.negative) return 'can’t be less than 0';

    return null;
  }
  if (typeof value !== 'string') return `must be ${LENGTH_SAID}`;
  if (options.words?.includes(value)) return null;
  if (VIEWPORT_UNIT.test(value)) return 'can’t use viewport units, which measure Brydio’s window, not the app’s area; use % or pixels';
  if (/url\(/i.test(value)) return 'can’t hold url()';

  const space = SPACE.exec(value);

  if (space) {
    if (Number(space[2]) > SPACE_MAX) return `names a spacing step from space.0 to space.${SPACE_MAX}`;
    if (space[1] && !options.negative) return 'can’t be less than 0';

    return null;
  }

  const length = LENGTH.exec(value);

  if (!length) return `must be ${LENGTH_SAID}`;

  const amount = Number(length[1]);
  const unit = length[2];

  if (amount < 0 && !options.negative) return 'can’t be less than 0';
  if (unit === '%' && Math.abs(amount) > 100) return 'can be at most 100%';
  if ((unit === 'rem' || unit === 'em') && Math.abs(amount) > 500) return 'can be at most 500rem';
  if (unit === 'px' && Math.abs(amount) > LENGTH_MAX) return `must be at most ${LENGTH_MAX} pixels`;

  return null;
}

/**
 * Why a colour can't be drawn, or null. A colour is one of Brydio's
 * (`brydio.text`), one of the app's (`app.ocean`), `transparent`,
 * `currentColor`, or a plain pair `{ light, dark }`. `colours`, when given,
 * are the app's own names, so a name it never declared is refused too.
 */
export function colourRefusal(value: unknown, colours?: ReadonlySet<string>): string | null {
  if (value === 'transparent' || value === 'currentColor') return null;

  if (typeof value === 'string') {
    if (value.startsWith('brydio.')) {
      return Object.prototype.hasOwnProperty.call(BRYDIO_COLOURS, value.slice(7))
        ? null
        : `names a Brydio colour that doesn’t exist; Brydio’s colours are ${Object.keys(BRYDIO_COLOURS).map(name => `brydio.${name}`).join(', ')}`;
    }
    if (value.startsWith('app.')) {
      const name = value.slice(4);

      if (!APP_COLOUR_NAME.test(name)) return 'names an app colour, like app.ocean';
      if (colours && !colours.has(name)) return `names "${name}", which the app’s theme doesn’t declare`;

      return null;
    }
    if (HEX_COLOUR.test(value)) return 'is a plain colour with no dark-mode value; give both: { "light": "…", "dark": "…" }';
    if (/url\(/i.test(value)) return 'can’t hold url()';

    return 'must be a Brydio colour (brydio.text), one of the app’s (app.ocean), or { "light": "#…", "dark": "#…" }';
  }

  if (isRecord(value)) {
    const keys = Object.keys(value);

    if (keys.some(key => key !== 'light' && key !== 'dark') || value.light === undefined || value.dark === undefined) {
      return 'a plain colour needs both a light and a dark value, and nothing else';
    }
    for (const mode of ['light', 'dark'] as const) {
      if (typeof value[mode] !== 'string' || !HEX_COLOUR.test(value[mode] as string)) return `${mode} value must be a colour like #0e7490`;
    }

    return null;
  }

  return 'must be a Brydio colour (brydio.text), one of the app’s (app.ocean), or { "light": "#…", "dark": "#…" }';
}

const TRACK = String.raw`(?:-?\d+(?:\.\d+)?(?:px|rem|em|%)|\d+(?:\.\d+)?fr|auto|min-content|max-content|space\.\d{1,2})`;
const MINMAX = String.raw`minmax\(\s*${TRACK}\s*,\s*${TRACK}\s*\)`;
const ONE = `(?:${TRACK}|${MINMAX})`;
const REPEAT = String.raw`repeat\(\s*(?:\d{1,2}|auto-fill|auto-fit)\s*,\s*${ONE}(?:\s+${ONE}){0,3}\s*\)`;
const TRACKS = new RegExp(`^(?:${ONE}|${REPEAT})(?:\\s+(?:${ONE}|${REPEAT})){0,23}$`);
const GRID_LINE = /^(?:auto|span \d{1,2}|-?\d{1,2})(?:\s*\/\s*(?:auto|span \d{1,2}|-?\d{1,2}))?$/;

function ruleRefusal(rule: Rule, value: unknown, colours?: ReadonlySet<string>): string | null {
  switch (rule.kind) {
    case 'size':
      return lengthRefusal(value, { negative: false, words: SIZE_WORDS });
    case 'space': {
      if (rule.sides && typeof value === 'string' && value.trim().includes(' ')) {
        const parts = value.trim().split(/\s+/);

        if (parts.length > 4) return 'takes at most four lengths, one for each side';

        for (const part of parts) {
          const refused = lengthRefusal(part, { negative: rule.negative, words: rule.negative ? ['auto'] : [] });

          if (refused) return refused;
        }

        return null;
      }

      return lengthRefusal(value, { negative: rule.negative, words: rule.negative ? ['auto'] : [] });
    }
    case 'offset':
      return lengthRefusal(value, { negative: true, words: ['auto'] });
    case 'colour':
      return colourRefusal(value, colours);
    case 'enum':
      return typeof value === 'string' && rule.values.includes(value) ? null : `must be one of ${rule.values.join(', ')}`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && value >= rule.min && value <= rule.max && (!rule.integer || Number.isInteger(value))
        ? null
        : `must be a ${rule.integer ? 'whole ' : ''}number from ${rule.min} to ${rule.max}`;
    case 'border-width':
      if (typeof value === 'number') return value >= 0 && value <= 16 ? null : 'must be from 0 to 16 pixels';

      return typeof value === 'string' && /^(?:\d{1,2}(?:\.\d+)?)px$/.test(value) && Number.parseFloat(value) <= 16 ? null : 'must be from 0 to 16 pixels';
    case 'radius':
      if (value === 'full') return null;
      if (typeof value === 'string' && value.startsWith('radius.')) {
        return (BRYDIO_RADII as readonly string[]).includes(value.slice(7)) ? null : `names one of Brydio’s radii: ${BRYDIO_RADII.map(name => `radius.${name}`).join(', ')}`;
      }

      return lengthRefusal(value, { negative: false });
    case 'shadow':
      if (value === 'none') return null;

      return typeof value === 'string' && value.startsWith('shadow.') && (BRYDIO_SHADOWS as readonly string[]).includes(value.slice(7))
        ? null
        : `must be none or one of Brydio’s shadows: ${BRYDIO_SHADOWS.map(name => `shadow.${name}`).join(', ')}`;
    case 'font-size': {
      const pixels = typeof value === 'number' ? value : typeof value === 'string' ? pixelsOf(value) : null;

      return pixels !== null && pixels >= 10 && pixels <= 64 ? null : 'must be from 10 to 64 pixels ("14px" or "0.875rem")';
    }
    case 'font-weight':
      return [400, 500, 600, 700, '400', '500', '600', '700'].includes(value as never) ? null : 'must be 400, 500, 600 or 700';
    case 'line-height':
      if (typeof value === 'number') return value >= 0.8 && value <= 3 ? null : 'as a plain number is from 0.8 to 3';

      return lengthRefusal(value, { negative: false });
    case 'flex':
      if (value === 'none' || value === 'auto') return null;

      return typeof value === 'number' && value >= 0 && value <= 12 ? null : 'must be none, auto, or a number from 0 to 12';
    case 'tracks':
      return typeof value === 'string' && value.length <= 400 && TRACKS.test(value.trim())
        ? null
        : 'must be a list of tracks: lengths, fr, auto, minmax() or repeat(), like "repeat(3, 1fr)"';
    case 'grid-line':
      return typeof value === 'string' && GRID_LINE.test(value.trim()) ? null : 'must be like "span 2" or "1 / 3"';
    case 'position':
      if (value === 'fixed' || value === 'sticky') {
        return 'can’t be fixed or sticky: an app draws only inside its own area, so position is relative to that area (static, relative or absolute)';
      }

      return value === 'static' || value === 'relative' || value === 'absolute' ? null : 'must be static, relative or absolute';
    case 'z-index':
      if (typeof value === 'number' && Number.isInteger(value) && value > Z_INDEX_MAX) {
        return `can be at most ${Z_INDEX_MAX}: the app’s area is its own layer, and nothing inside it can reach above it`;
      }

      return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? null : `must be a whole number from 0 to ${Z_INDEX_MAX}`;
    case 'image':
      if (
        isRecord(value) &&
        Object.keys(value).length === 1 &&
        typeof value.file === 'string' &&
        value.file.length <= 512
      ) {
        // Only an address the app's file store gave it; the host draws it
        // only when that store is Brydio's own and the file is this
        // instance's, so nothing is ever loaded from outside.
        return APP_FILE_ADDRESS.test(value.file)
          ? null
          : 'names a file by the address the app’s file store gave it';
      }

      return 'can only be one of the app’s own uploaded files: { "file": "<its address>" }; url() and outside images aren’t allowed';
    case 'transition':
      return typeof value === 'string' && (TRANSITIONS as readonly string[]).includes(value) ? null : `must be one of ${TRANSITIONS.join(', ')}`;
  }
}

/** `14px` → 14, `0.875rem` → 14; anything else null. */
function pixelsOf(value: string): number | null {
  const length = LENGTH.exec(value);

  if (!length) return null;
  if (length[2] === 'px') return Number(length[1]);
  if (length[2] === 'rem' || length[2] === 'em') return Number(length[1]) * 16;

  return null;
}

/**
 * Why a node's `style` can't be drawn, or null when it can (PB22). The
 * sentence names the property and the rule: "style position can’t be fixed
 * or sticky: …".
 */
export function styleRefusal(style: unknown, colours?: ReadonlySet<string>): string | null {
  if (!isRecord(style)) return 'style must be a record of properties, like { "padding": "space.4" }.';

  const keys = Object.keys(style);

  if (keys.length > STYLE_MAX_KEYS) return `style can set at most ${STYLE_MAX_KEYS} properties.`;
  if (JSON.stringify(style).length > STYLE_MAX_BYTES) return 'style must be at most 4 KB.';

  for (const key of keys) {
    const value = style[key];

    if (value === undefined) continue;

    const refused = STYLE_REFUSED[key];

    if (refused) return `style ${key} isn’t allowed: ${refused}.`;

    const rule = STYLE_PROPERTIES[key];

    if (!rule) return `style ${key} isn’t allowed: it is not on the list of properties a style may set.`;

    const why = ruleRefusal(rule, value, colours);

    if (why) return `style ${key} ${why}.`;
  }

  return null;
}

/** The app colour names a theme declares, for `colourRefusal`. */
export function colourNamesOf(theme: AppTheme | null | undefined): Set<string> {
  return new Set(Object.keys(theme?.colors ?? {}));
}

/** The app colour a tone names (`app.ocean` → `ocean`), or null when it names a Brydio tone. */
export const appColourOfTone = (tone: unknown): string | null =>
  typeof tone === 'string' && tone.startsWith('app.') && APP_COLOUR_NAME.test(tone.slice(4)) ? tone.slice(4) : null;

/* ----------------------------------------------------------------- drawing */

export type Mode = 'light' | 'dark';

/**
 * The plain colour a value is in this mode, for a check: an app colour or a
 * pair to its hex, a Brydio colour to the value checks read it as, otherwise
 * null.
 */
export function checkColourOf(value: unknown, mode: Mode, theme: AppTheme | null | undefined): string | null {
  if (isRecord(value) && typeof value[mode] === 'string') return value[mode] as string;
  if (typeof value !== 'string') return null;
  if (value.startsWith('app.')) return theme?.colors?.[value.slice(4)]?.[mode] ?? null;
  if (value.startsWith('brydio.')) return BRYDIO_COLOUR_CHECK_VALUES[mode][value.slice(7)] ?? null;

  return null;
}

/** The CSS a colour is drawn with in this mode. */
export function cssColourOf(value: unknown, mode: Mode): string | null {
  if (value === 'transparent' || value === 'currentColor') return value;
  if (isRecord(value) && typeof value[mode] === 'string' && HEX_COLOUR.test(value[mode] as string)) return value[mode] as string;
  if (typeof value !== 'string') return null;
  if (value.startsWith('app.') && APP_COLOUR_NAME.test(value.slice(4))) return `var(--app-color-${value.slice(4)}, currentColor)`;
  if (value.startsWith('brydio.')) {
    const token = BRYDIO_COLOURS[value.slice(7)];

    return token ? `var(${token})` : null;
  }

  return null;
}

function cssLength(value: unknown): string {
  if (typeof value === 'number') return value === 0 ? '0' : `${value}px`;

  const text = String(value);
  const space = SPACE.exec(text);

  if (space) return `calc(var(--spacing, 0.25rem) * ${space[1] ? '-' : ''}${space[2]})`;

  return text;
}

const kebab = (key: string) => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

/**
 * A checked style as CSS declarations, for this mode. Only what passed
 * `styleRefusal` is ever given here; anything it can't read is left out.
 * `backgroundImage` is the host's to draw, since only it can read the file.
 */
export function styleToCss(style: Record<string, unknown>, mode: Mode): Record<string, string> {
  const css: Record<string, string> = {};

  for (const [key, value] of Object.entries(style)) {
    const rule = STYLE_PROPERTIES[key];

    if (!rule || value === undefined) continue;

    const name = kebab(key);

    switch (rule.kind) {
      case 'size':
      case 'offset':
        css[name] = cssLength(value);
        break;
      case 'space':
        css[name] = typeof value === 'string' && value.trim().includes(' ') ? value.trim().split(/\s+/).map(cssLength).join(' ') : cssLength(value);
        break;
      case 'colour': {
        const colour = cssColourOf(value, mode);

        if (colour) css[key === 'background' ? 'background-color' : name] = colour;
        break;
      }
      case 'border-width':
        css[name] = cssLength(typeof value === 'string' ? value : Number(value));
        break;
      case 'radius':
        css[name] = value === 'full' ? '9999px' : typeof value === 'string' && value.startsWith('radius.') ? `var(--radius-${value.slice(7)})` : cssLength(value);
        break;
      case 'shadow':
        css[name] = value === 'none' ? 'none' : `var(--shadow-${String(value).slice(7)})`;
        break;
      case 'font-size':
      case 'line-height':
        css[name] = typeof value === 'number' && rule.kind === 'line-height' ? String(value) : cssLength(value);
        break;
      case 'transition':
        css[name] =
          value === 'none'
            ? 'none'
            : `background-color var(--dur-${value}) var(--ease-out), color var(--dur-${value}) var(--ease-out), border-color var(--dur-${value}) var(--ease-out), opacity var(--dur-${value}) var(--ease-out), box-shadow var(--dur-${value}) var(--ease-out)`;
        break;
      case 'image':
        break;
      default:
        css[name] = String(value);
    }
  }

  return css;
}

/**
 * The CSS variables an app's area carries for its theme in this mode: its
 * colours as `--app-color-<name>`, the accent as Brydio's brand tokens (so
 * the `brand` tone is the app's), and the rounding and density as scales of
 * Brydio's own radii and spacing.
 */
export function themeVariables(theme: AppTheme | null | undefined, mode: Mode): Record<string, string> {
  const vars: Record<string, string> = {};

  if (!theme) return vars;

  for (const [name, pair] of Object.entries(theme.colors ?? {})) vars[`--app-color-${name}`] = pair[mode];

  if (theme.accent) {
    const accent = theme.accent[mode];
    const on = onColour(accent);

    Object.assign(vars, {
      '--brand': accent,
      '--brand-hover': `color-mix(in oklab, ${accent} 88%, ${mode === 'dark' ? 'white' : 'black'})`,
      '--brand-active': `color-mix(in oklab, ${accent} 78%, ${mode === 'dark' ? 'white' : 'black'})`,
      '--brand-fg': accent,
      '--brand-on': on,
      '--brand-soft': `color-mix(in oklab, ${accent} ${mode === 'dark' ? 22 : 12}%, transparent)`,
      '--brand-soft-hover': `color-mix(in oklab, ${accent} ${mode === 'dark' ? 30 : 18}%, transparent)`,
      '--brand-line': `color-mix(in oklab, ${accent} 45%, transparent)`,
      '--brand-ring': `color-mix(in oklab, ${accent} 24%, transparent)`,
      '--primary': accent,
      '--primary-foreground': on,
      '--ring': accent,
      '--focus-ring': `color-mix(in oklab, ${accent} 62%, transparent)`,
      '--app-color-accent': accent,
    });
  }

  if (theme.rounding && theme.rounding !== 'normal') {
    const scale = ROUNDING_SCALE[theme.rounding];
    const base: Record<string, number> = { '': 0.625, xs: 0.375, sm: 0.5, md: 0.625, lg: 0.75, xl: 1, '2xl': 1.25, '3xl': 1.75 };

    for (const [step, rem] of Object.entries(base)) vars[step ? `--radius-${step}` : '--radius'] = `${+(rem * scale).toFixed(4)}rem`;
  }

  if (theme.density && theme.density !== 'normal') {
    const scale = DENSITY_SCALE[theme.density];

    Object.assign(vars, {
      '--spacing': `${+(0.25 * scale).toFixed(4)}rem`,
      '--control-h-sm': `${Math.round(28 * scale)}px`,
      '--control-h': `${Math.round(32 * scale)}px`,
      '--control-h-lg': `${Math.round(36 * scale)}px`,
      '--list-row-h': `${Math.round(48 * scale)}px`,
    });
  }

  return vars;
}

/* ------------------------------------------------------------- catalogue */

/**
 * Whether a setting may name one of the app's colours as well as its own
 * values (PB21): a `tone` that offers Brydio's `brand`.
 */
export const takesAppColour = (name: string, values: readonly string[]): boolean =>
  name === 'tone' && values.includes('brand');

/** What a tone that names an app colour is told when it isn't one. */
export const appColourSaid = 'or one of the app’s colours (app.<name>)';

/**
 * Why a `bry-canvas`'s shapes can't be drawn, or null (PB24). Their shape is
 * the catalogue's to check; this is their colours, which are names only —
 * Brydio's or the app's — so a canvas follows light and dark.
 */
export function canvasRefusal(ops: unknown, colours?: ReadonlySet<string>): string | null {
  if (!Array.isArray(ops)) return null;

  for (const [index, op] of ops.entries()) {
    if (!isRecord(op)) continue;

    for (const field of ['fill', 'stroke'] as const) {
      const value = op[field];

      if (value === undefined) continue;
      if (typeof value === 'string' && (value.startsWith('brydio.') || value.startsWith('app.') || value === 'transparent')) {
        const why = colourRefusal(value, colours);

        if (!why) continue;

        return `bry-canvas ops[${index}].${field} ${why}.`;
      }

      return `bry-canvas ops[${index}].${field} must name a colour, Brydio’s (brydio.text) or the app’s (app.ocean); give a plain colour a name in the theme.`;
    }
  }

  return null;
}
