/**
 * Two things every app must have before it is published (owner decisions of
 * 22 September 2026), checked the same way by `brydio validate` and by
 * `POST /apps/publish`.
 *
 * - **A logo and an icon, each in colour and in one colour** (ADR-A20). The
 *   manifest names four image files, and a package missing any of them is
 *   refused.
 * - **Something for the assistant to call** (ADR-A19): generated tools from a
 *   collection, a custom tool, an MCP server or an integration.
 *
 * A copy of Brydio's `apps/api/src/apps/manifest/requirements.ts`, the
 * checks `POST /apps/publish` runs. Nothing here imports anything, so the
 * copy is the file: not even `node:zlib`, which a PNG is inflated with, since
 * a screen may bundle `@brydio/manifest` and a worker has none.
 * `test/requirements.test.ts` asks Brydio the same questions whenever a
 * checkout is beside this one.
 *
 * ## What "one colour" means
 *
 * The mono variant is drawn tinted by the theme, so it must be a shape and
 * nothing else: one colour on transparency.
 *
 * - An **SVG** is read for every colour it paints with: `fill`, `stroke`,
 *   `stop-color`, `flood-color` and `color`, as attributes and inside `style`.
 *   `none`, `transparent`, `inherit` and `currentColor` are not colours.
 *   A shape with no fill of its own paints in the default black, unless the
 *   root `<svg>` or a `<g>` sets one. More than one distinct colour is
 *   refused, and so is an embedded `<image>`, which could be anything.
 * - A **PNG** is decoded, and every pixel at least 1/16 opaque must be within
 *   32 of one colour on each channel, so anti-aliased edges of a black glyph
 *   (black at partial alpha) pass and a two-colour picture does not. A PNG
 *   with no transparent pixel at all is a solid block and is refused too.
 * - A **JPEG** has no transparency, and a **WebP** is not decoded here, so
 *   neither can be the one-colour variant. Both are fine in colour.
 *
 * ## Sizes
 *
 * - An **icon** is square: from 48 to 1,024 pixels across as a raster, and a
 *   square view box as an SVG.
 * - A **logo** may be wider than it is tall, never taller: from 48 to 1,024
 *   pixels tall, at most 2,048 wide, and at most four times as wide as it is
 *   tall. An SVG's view box is held to the same proportions.
 * - Every file is at most 512 KB.
 */

export const BRAND_LIMITS = {
  bytes: 512 * 1024,
  iconMinSide: 48,
  iconMaxSide: 1_024,
  logoMinHeight: 48,
  logoMaxHeight: 1_024,
  logoMaxWidth: 2_048,
  /** Width over height, at most. */
  logoMaxRatio: 4,
} as const;

/** The two images, and the two variants each one comes in. */
export const BRAND_FIELDS = [
  'logo.color',
  'logo.mono',
  'icon.color',
  'icon.mono',
] as const;

export type BrandField = (typeof BRAND_FIELDS)[number];

export type RequirementCode =
  | 'brand_logo_missing'
  | 'brand_icon_missing'
  | 'brand_path_invalid'
  | 'brand_file_missing'
  | 'brand_file_too_large'
  | 'brand_file_unreadable'
  | 'brand_icon_shape'
  | 'brand_logo_shape'
  | 'brand_mono_type'
  | 'brand_mono_colours'
  | 'app_has_no_tools';

export interface RequirementProblem {
  code: RequirementCode;
  message: string;
  /** The manifest field, like `icon.mono`. */
  path: string;
}

/** The files a check can see, by their path inside the package with no `./`. */
export type RequirementFiles = ReadonlyMap<string, Uint8Array>;

export type BrandImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';

/** A path the manifest wrote, as a bundle names the file: no `./`, forward slashes. */
export const brandFilePath = (declared: string): string => declared.replace(/^\.\//, '');

/**
 * Whether a declared brand path is one Brydio will follow: `./`-prefixed,
 * relative, inside the package, and a name a bundle can hold.
 */
export function isBrandPath(declared: unknown): declared is string {
  if (typeof declared !== 'string' || !declared.startsWith('./')) return false;

  const path = brandFilePath(declared);

  return (
    path.length > 0 &&
    path.length <= 200 &&
    /^[A-Za-z0-9._\-/]+$/.test(path) &&
    /\.(png|jpe?g|webp|svg)$/i.test(path) &&
    path.split('/').every(segment => segment.length > 0 && !segment.startsWith('.'))
  );
}

/**
 * The brand files a manifest names, by field, as bundle paths. Only fields
 * written in the two-variant shape; a legacy `icon: "./icon.png"` names none.
 */
export function brandPathsOf(manifest: unknown): Map<BrandField, string> {
  const found = new Map<BrandField, string>();

  if (!manifest || typeof manifest !== 'object') return found;

  for (const field of BRAND_FIELDS) {
    const [part, variant] = field.split('.') as ['logo' | 'icon', 'color' | 'mono'];
    const images = (manifest as Record<string, unknown>)[part];
    const declared =
      images && typeof images === 'object' && !Array.isArray(images)
        ? (images as Record<string, unknown>)[variant]
        : undefined;

    if (isBrandPath(declared)) found.set(field, brandFilePath(declared));
  }

  return found;
}

/**
 * Everything wrong with an app's logo and icon.
 *
 * `required` is off only where a package is read that is not being published
 * (an import of somebody's plugin with no screens): the images it does name
 * are still checked, and the ones it leaves out are not asked for.
 */
export function brandProblems(
  manifest: Record<string, unknown>,
  files: RequirementFiles,
  options: { required?: boolean } = {}
): RequirementProblem[] {
  const problems: RequirementProblem[] = [];
  const required = options.required !== false;

  for (const part of ['logo', 'icon'] as const) {
    const images = manifest[part];

    if (images === undefined || images === null) {
      if (!required) continue;

      problems.push(
        part === 'logo'
          ? {
              code: 'brand_logo_missing',
              path: 'logo',
              message:
                'An app needs a logo: set "logo" to { "color": "./…", "mono": "./…" }, one image in colour and one in a single colour.',
            }
          : {
              code: 'brand_icon_missing',
              path: 'icon',
              message:
                'An app needs an icon: set "icon" to { "color": "./…", "mono": "./…" }, one square image in colour and one in a single colour.',
            }
      );
      continue;
    }

    if (typeof images === 'string' && part === 'icon') {
      // The one image every app had before ADR-A20: still read, never enough.
      if (required) {
        problems.push({
          code: 'brand_icon_missing',
          path: 'icon',
          message:
            'An icon is now two images: set "icon" to { "color": "./…", "mono": "./…" } instead of one path.',
        });
      }
      continue;
    }

    if (typeof images !== 'object' || Array.isArray(images)) {
      problems.push({
        code: part === 'logo' ? 'brand_logo_missing' : 'brand_icon_missing',
        path: part,
        message: `"${part}" must be { "color": "./…", "mono": "./…" }.`,
      });
      continue;
    }

    for (const variant of ['color', 'mono'] as const) {
      const field = `${part}.${variant}` as BrandField;
      const declared = (images as Record<string, unknown>)[variant];

      if (!isBrandPath(declared)) {
        problems.push({
          code: 'brand_path_invalid',
          path: field,
          message: `${field} must be a path inside the package that starts with ./ and ends in .png, .jpg, .webp or .svg.`,
        });
        continue;
      }

      const bytes = files.get(brandFilePath(declared));

      if (!bytes) {
        problems.push({
          code: 'brand_file_missing',
          path: field,
          message: `${field} names ${declared}, which is not in the package.`,
        });
        continue;
      }

      problems.push(...imageProblems(field, bytes));
    }
  }

  return problems;
}

/** One brand file, judged for its size, its kind, its shape and, for mono, its colours. */
function imageProblems(field: BrandField, bytes: Uint8Array): RequirementProblem[] {
  if (bytes.byteLength > BRAND_LIMITS.bytes) {
    return [
      {
        code: 'brand_file_too_large',
        path: field,
        message: `${field} is ${Math.ceil(bytes.byteLength / 1024)} KB. A logo or icon file is at most 512 KB.`,
      },
    ];
  }

  const shape = brandShapeOf(bytes);

  if (!shape) {
    return [
      {
        code: 'brand_file_unreadable',
        path: field,
        message: `${field} is not a PNG, JPEG, WebP or SVG that Brydio can read.`,
      },
    ];
  }

  if (shape.type === 'image/svg+xml' && !svgIsInert(text(bytes))) {
    return [
      {
        code: 'brand_file_unreadable',
        path: field,
        message: `${field} carries a script, an event handler or a link to somewhere else, which a logo or icon cannot.`,
      },
    ];
  }

  const problems: RequirementProblem[] = [];
  const size = `${shape.width}×${shape.height}`;
  const svg = shape.type === 'image/svg+xml';

  if (field.startsWith('icon.')) {
    const square = svg
      ? Math.abs(shape.width - shape.height) <= shape.width / 100
      : shape.width === shape.height;
    const fits =
      svg ||
      (shape.width >= BRAND_LIMITS.iconMinSide &&
        shape.width <= BRAND_LIMITS.iconMaxSide);

    if (!square || !fits) {
      problems.push({
        code: 'brand_icon_shape',
        path: field,
        message: `${field} is ${size}. An icon is square, from 48 to 1024 pixels across.`,
      });
    }
  } else {
    const ratio = shape.width / shape.height;
    const proportioned = ratio >= 0.99 && ratio <= BRAND_LIMITS.logoMaxRatio;
    const fits =
      svg ||
      (shape.height >= BRAND_LIMITS.logoMinHeight &&
        shape.height <= BRAND_LIMITS.logoMaxHeight &&
        shape.width <= BRAND_LIMITS.logoMaxWidth);

    if (!proportioned || !fits) {
      problems.push({
        code: 'brand_logo_shape',
        path: field,
        message: `${field} is ${size}. A logo is 48 to 1024 pixels tall, at most 2048 wide, and from as wide as it is tall to four times as wide.`,
      });
    }
  }

  if (field.endsWith('.mono')) problems.push(...monoProblems(field, shape.type, bytes));

  return problems;
}

/** The one-colour variant: a PNG or an SVG that paints in one colour on transparency. */
function monoProblems(
  field: BrandField,
  type: BrandImageType,
  bytes: Uint8Array
): RequirementProblem[] {
  if (type === 'image/svg+xml') {
    const colours = svgColours(text(bytes));

    if (colours === null) {
      return [
        {
          code: 'brand_mono_colours',
          path: field,
          message: `${field} embeds an image, so it can't be read as one colour. A one-colour image paints in one colour, or in currentColor, on transparency.`,
        },
      ];
    }

    return colours.length > 1
      ? [
          {
            code: 'brand_mono_colours',
            path: field,
            message: `${field} paints in ${colours.length} colours (${colours.join(', ')}). A one-colour image paints in one colour, or in currentColor, on transparency.`,
          },
        ]
      : [];
  }

  if (type !== 'image/png') {
    return [
      {
        code: 'brand_mono_type',
        path: field,
        message: `${field} is a ${type === 'image/jpeg' ? 'JPEG' : 'WebP'}. A one-colour image is a PNG with transparency, or an SVG.`,
      },
    ];
  }

  const verdict = pngVerdict(bytes);

  if (verdict === 'unreadable') {
    return [
      {
        code: 'brand_file_unreadable',
        path: field,
        message: `${field} is not a PNG, JPEG, WebP or SVG that Brydio can read.`,
      },
    ];
  }

  if (verdict === 'opaque') {
    return [
      {
        code: 'brand_mono_colours',
        path: field,
        message: `${field} has no transparent pixels, so it would draw as a solid block. A one-colour image paints in one colour on transparency.`,
      },
    ];
  }

  if (verdict === 'colours') {
    return [
      {
        code: 'brand_mono_colours',
        path: field,
        message: `${field} has pixels of more than one colour. A one-colour image paints in one colour on transparency.`,
      },
    ];
  }

  return [];
}

/**
 * Whether the assistant has anything to call in this app (ADR-A19).
 *
 * `parts` counts what the package bundles beside the manifest: the servers in
 * its `servers.json` and the files in its `integrations/`. Where they can't
 * be seen (a published bundle holds only code), `requires` still counts.
 */
export function toolsProblem(
  manifest: Record<string, unknown>,
  parts: { servers?: number; integrations?: number } = {}
): RequirementProblem | null {
  const tools = (manifest.tools ?? {}) as { generated?: unknown; custom?: unknown };
  const data = manifest.data;
  const collections =
    data && typeof data === 'object' && !Array.isArray(data)
      ? Object.keys(data).length
      : 0;
  const generated = tools.generated !== false && collections > 0;
  const custom = Array.isArray(tools.custom) && tools.custom.length > 0;
  const requires = (manifest.requires ?? {}) as {
    servers?: unknown;
    integrations?: unknown;
  };
  const named = (list: unknown) => (Array.isArray(list) ? list.length : 0);
  const servers = (parts.servers ?? 0) + named(requires.servers);
  const integrations = (parts.integrations ?? 0) + named(requires.integrations);

  if (generated || custom || servers > 0 || integrations > 0) return null;

  return {
    code: 'app_has_no_tools',
    path: 'tools',
    message:
      'This app gives the assistant nothing to call. Keep a collection with generated tools, add a custom tool, or bundle an MCP server or an integration.',
  };
}

// ---------------------------------------------------------------------------
// Reading images, from their own bytes.

export interface BrandShape {
  type: BrandImageType;
  width: number;
  height: number;
}

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** What an image is and how big, from its bytes, or null for anything else. */
export function brandShapeOf(bytes: Uint8Array): BrandShape | null {
  return pngShape(bytes) ?? jpegShape(bytes) ?? webpShape(bytes) ?? svgShape(bytes);
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const view = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function pngShape(bytes: Uint8Array): BrandShape | null {
  if (bytes.length < 24 || PNG_MAGIC.some((byte, at) => bytes[at] !== byte)) return null;

  return {
    type: 'image/png',
    width: view(bytes).getUint32(16),
    height: view(bytes).getUint32(20),
  };
}

function jpegShape(bytes: Uint8Array): BrandShape | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const data = view(bytes);
  let at = 2;

  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;

    const marker = bytes[at + 1]!;
    const length = data.getUint16(at + 2);

    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        type: 'image/jpeg',
        height: data.getUint16(at + 5),
        width: data.getUint16(at + 7),
      };
    }

    at += 2 + length;
  }

  return null;
}

function webpShape(bytes: Uint8Array): BrandShape | null {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.slice(from, to));

  if (bytes.length < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') return null;

  const kind = ascii(12, 16);
  const data = view(bytes);

  if (kind === 'VP8X') {
    return {
      type: 'image/webp',
      width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
      height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
    };
  }

  if (kind === 'VP8 ') {
    return {
      type: 'image/webp',
      width: data.getUint16(26, true) & 0x3fff,
      height: data.getUint16(28, true) & 0x3fff,
    };
  }

  if (kind === 'VP8L') {
    const bits = data.getUint32(21, true);

    return {
      type: 'image/webp',
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }

  return null;
}

/** An SVG's view box, or its width and height, or square when it says neither. */
function svgShape(bytes: Uint8Array): BrandShape | null {
  const head = text(bytes.slice(0, 4096));

  if (!/<svg[\s>]/i.test(head)) return null;

  const box =
    /viewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(head);

  if (box)
    return { type: 'image/svg+xml', width: Number(box[1]), height: Number(box[2]) };

  const root = /<svg\b[^>]*>/i.exec(head)?.[0] ?? '';
  const width = /\swidth\s*=\s*["']?([\d.]+)/i.exec(root);
  const height = /\sheight\s*=\s*["']?([\d.]+)/i.exec(root);

  if (width && height)
    return { type: 'image/svg+xml', width: Number(width[1]), height: Number(height[1]) };

  return { type: 'image/svg+xml', width: 512, height: 512 };
}

/** No script, no event handler, no `javascript:` and no reference that leaves the file. */
export function svgIsInert(svg: string): boolean {
  return !(
    /<script\b/i.test(svg) ||
    /<foreignObject\b/i.test(svg) ||
    /\son[a-z-]+\s*=/i.test(svg) ||
    /(javascript|vbscript|data:text\/html):/i.test(svg) ||
    /(?:xlink:)?href\s*=\s*["']\s*(?!#)[^"']/i.test(svg) ||
    /url\(\s*['"]?\s*(?:https?:)?\/\//i.test(svg)
  );
}

const NOT_A_COLOUR = new Set([
  'none',
  'transparent',
  'inherit',
  'currentcolor',
  'initial',
  'unset',
  'context-fill',
  'context-stroke',
]);

const SHAPES =
  /<(path|rect|circle|ellipse|polygon|polyline|line|text|tspan|use)\b([^>]*)>/gi;

/**
 * Every distinct colour an SVG paints with, normalised, or null when it
 * embeds a raster whose colours can't be read from the markup.
 */
export function svgColours(svg: string): string[] | null {
  if (/<image\b/i.test(svg)) return null;

  const found = new Set<string>();
  const add = (value: string) => {
    const colour = normaliseColour(value);

    if (colour) found.add(colour);
  };

  for (const [, , value] of svg.matchAll(
    /\b(fill|stroke|stop-color|flood-color|lighting-color|color)\s*=\s*["']([^"']*)["']/gi
  )) {
    add(value!);
  }

  for (const [, value] of svg.matchAll(
    /(?:^|[;{\s"'])(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*:\s*([^;}"']+)/gi
  )) {
    add(value!);
  }

  // A shape that says nothing about its fill paints in black, unless
  // something around it says otherwise. Groups are not followed: any fill on
  // the root or on a group is taken to reach every shape.
  const inherited =
    /<(svg|g)\b[^>]*\bfill\s*[=:]/i.test(svg) ||
    /<style\b[^>]*>[\s\S]*\bfill\s*:/i.test(svg);

  if (!inherited) {
    for (const [, , attributes] of svg.matchAll(SHAPES)) {
      if (!/\bfill\s*[=:]/i.test(attributes!)) {
        found.add('#000000');
        break;
      }
    }
  }

  return [...found].sort();
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
};

/** A colour as `#rrggbb`, or null for a non-colour or a paint server reference. */
function normaliseColour(raw: string): string | null {
  const value = raw
    .trim()
    .toLowerCase()
    .replace(/\s*!important$/, '');

  if (
    !value ||
    NOT_A_COLOUR.has(value) ||
    value.startsWith('url(') ||
    value.startsWith('var(')
  )
    return null;

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/.exec(value);

  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;

  const long = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(value);

  if (long) return `#${long[1]}`;

  const rgb = /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/.exec(value);

  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]].map(one => Math.min(255, Number(one)).toString(16).padStart(2, '0')).join('')}`;
  }

  return NAMED[value] ?? value;
}

/**
 * What a PNG's pixels say about being one colour.
 *
 * Decodes the image (non-interlaced, every colour type and bit depth) and
 * compares every pixel at least 1/16 opaque with the most opaque one.
 */
export function pngVerdict(
  bytes: Uint8Array
): 'one' | 'colours' | 'opaque' | 'unreadable' {
  const pixels = decodePng(bytes);

  if (!pixels) return 'unreadable';

  const { rgba, width, height } = pixels;
  let reference = -1;
  let transparent = false;

  for (let at = 0; at < width * height; at += 1) {
    const alpha = rgba[at * 4 + 3]!;

    if (alpha < 255) transparent = true;
    if (reference < 0 || alpha > rgba[reference * 4 + 3]!) reference = at;
  }

  if (!transparent) return 'opaque';
  if (reference < 0 || rgba[reference * 4 + 3]! < 16) return 'one';

  const [r, g, b] = [
    rgba[reference * 4]!,
    rgba[reference * 4 + 1]!,
    rgba[reference * 4 + 2]!,
  ];

  for (let at = 0; at < width * height; at += 1) {
    if (rgba[at * 4 + 3]! < 16) continue;

    if (
      Math.abs(rgba[at * 4]! - r) > 32 ||
      Math.abs(rgba[at * 4 + 1]! - g) > 32 ||
      Math.abs(rgba[at * 4 + 2]! - b) > 32
    ) {
      return 'colours';
    }
  }

  return 'one';
}

/** A PNG's pixels as 8-bit RGBA, or null for one this can't read. */
function decodePng(
  bytes: Uint8Array
): { rgba: Uint8Array; width: number; height: number } | null {
  if (bytes.length < 33 || PNG_MAGIC.some((byte, at) => bytes[at] !== byte)) return null;

  const data = view(bytes);
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let alphas: Uint8Array | null = null;
  const chunks: Uint8Array[] = [];

  while (at + 8 <= bytes.length) {
    const length = data.getUint32(at);
    const kind = String.fromCharCode(...bytes.slice(at + 4, at + 8));
    const body = bytes.slice(at + 8, at + 8 + length);

    if (kind === 'IHDR') {
      width = data.getUint32(at + 8);
      height = data.getUint32(at + 12);
      depth = bytes[at + 16]!;
      colour = bytes[at + 17]!;
      interlace = bytes[at + 20]!;
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') alphas = body;
    else if (kind === 'IDAT') chunks.push(body);
    else if (kind === 'IEND') break;

    at += 12 + length;
  }

  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colour];

  if (
    !width ||
    !height ||
    !channels ||
    interlace !== 0 ||
    ![1, 2, 4, 8, 16].includes(depth)
  )
    return null;
  if (width * height > 4_194_304) return null;

  let raw: Uint8Array;

  try {
    const joined = new Uint8Array(chunks.reduce((sum, one) => sum + one.length, 0));
    let offset = 0;

    for (const one of chunks) {
      joined.set(one, offset);
      offset += one.length;
    }

    raw = inflate(joined);
  } catch {
    return null;
  }

  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const step = Math.max(1, bitsPerPixel >> 3);

  if (raw.length < (stride + 1) * height) return null;

  const lines = new Uint8Array(stride * height);
  let previous = new Uint8Array(stride);

  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)]!;
    const line = raw.slice(row * (stride + 1) + 1, (row + 1) * (stride + 1));

    for (let x = 0; x < stride; x += 1) {
      const left = x >= step ? line[x - step]! : 0;
      const up = previous[x]!;
      const corner = x >= step ? previous[x - step]! : 0;
      let add = 0;

      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];

        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      } else if (filter !== 0) return null;

      line[x] = (line[x]! + add) & 0xff;
    }

    lines.set(line, row * stride);
    previous = line;
  }

  const rgba = new Uint8Array(width * height * 4);
  const sample = (row: number, index: number): number => {
    const base = row * stride;

    if (depth === 8) return lines[base + index]!;
    if (depth === 16) return lines[base + index * 2]!;

    const bit = index * depth;

    return (lines[base + (bit >> 3)]! >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const scale = (value: number) =>
    depth >= 8 ? value : Math.round((value * 255) / ((1 << depth) - 1));

  for (let row = 0; row < height; row += 1) {
    for (let x = 0; x < width; x += 1) {
      const out = (row * width + x) * 4;
      let [r, g, b, a] = [0, 0, 0, 255];

      if (colour === 3) {
        const index = sample(row, x);

        if (!palette || index * 3 + 2 >= palette.length) return null;

        [r, g, b] = [
          palette[index * 3]!,
          palette[index * 3 + 1]!,
          palette[index * 3 + 2]!,
        ];
        a = alphas && index < alphas.length ? alphas[index]! : 255;
      } else if (colour === 0 || colour === 4) {
        const grey = colour === 0 ? sample(row, x) : sample(row, x * 2);

        r = g = b = scale(grey);
        a = colour === 4 ? scale(sample(row, x * 2 + 1)) : 255;

        if (colour === 0 && alphas && alphas.length >= 2) {
          // The one grey that is see-through, as the file writes it: two
          // bytes, of which a 16-bit sample keeps the high one here.
          const key =
            depth === 16
              ? alphas[0]!
              : ((alphas[0]! << 8) | alphas[1]!) & ((1 << depth) - 1);

          if (grey === key) a = 0;
        }
      } else {
        const base = x * channels;

        [r, g, b] = [sample(row, base), sample(row, base + 1), sample(row, base + 2)];
        a = colour === 6 ? sample(row, base + 3) : 255;

        if (
          colour === 2 &&
          alphas &&
          alphas.length >= 6 &&
          depth === 8 &&
          r === alphas[1] &&
          g === alphas[3] &&
          b === alphas[5]
        )
          a = 0;
      }

      rgba.set([r, g, b, a], out);
    }
  }

  return { rgba, width, height };
}

/**
 * `node:zlib`'s inflate, asked for when a PNG is read rather than imported
 * at the top: this file is bundled into screens with `@brydio/manifest`, and
 * a worker has no zlib to import. Where there is none, a PNG is unreadable.
 */
function inflate(data: Uint8Array): Uint8Array {
  const zlib = (
    globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
  ).process?.getBuiltinModule?.('node:zlib') as typeof import('node:zlib') | undefined;

  if (!zlib) throw new Error('There is no zlib here to read a PNG with.');

  return new Uint8Array(zlib.inflateSync(data));
}
