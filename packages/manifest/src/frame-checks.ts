import type { BundleFiles } from './bundle.ts';
import { framePagesOf } from './screen-kinds.ts';

/**
 * What a publish warns about in a frame screen's own files (PB27), and never
 * refuses: a password field, and a font of its own. A copy of Brydio's
 * `frameWarnings` (`apps/api/src/apps/publishing/frame-checks.ts`), in its
 * words, so `brydio validate` says what the registry will.
 */

export interface FrameWarning {
  code: 'frame_password_field' | 'frame_font';
  message: string;
  at: string;
}

const text = (bytes: Uint8Array | undefined) => (bytes ? new TextDecoder().decode(bytes) : '');

const PASSWORD_IN_PAGE = /<input\b[^>]*\btype\s*=\s*["']?password\b/i;
const PASSWORD_IN_SCRIPT = /\btype\s*[:=]\s*["']password["']|setAttribute\(\s*["']type["']\s*,\s*["']password["']\)/;
const FONT_FACE = /@font-face\b/i;

export function frameWarnings(manifest: Record<string, unknown>, files: BundleFiles): FrameWarning[] {
  const pages = framePagesOf(manifest);
  const screens = (manifest.screens ?? {}) as Record<string, { entry?: string }>;
  const warnings: FrameWarning[] = [];

  for (const [screen, declared] of Object.entries(screens)) {
    const entry = declared?.entry;

    if (typeof entry !== 'string' || !pages.has(entry)) continue;

    const folder = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
    const scripts = [...files.keys()].filter(path => path !== entry && path.startsWith(folder) && !path.slice(folder.length).includes('/') && /\.m?js$/.test(path));
    const password = PASSWORD_IN_PAGE.test(text(files.get(entry))) ? entry : scripts.find(path => PASSWORD_IN_SCRIPT.test(text(files.get(path))));

    if (password) {
      warnings.push({
        code: 'frame_password_field',
        at: password,
        message: `The "${screen}" frame screen has a password field (${password}). An app never asks for a Brydio password or sign-in; a reviewer will ask why it is there.`,
      });
    }
  }

  for (const path of [...files.keys()].filter(one => one.endsWith('.css') || pages.has(one))) {
    if (FONT_FACE.test(text(files.get(path)))) {
      warnings.push({
        code: 'frame_font',
        at: path,
        message: `${path} declares a font of its own. A frame screen loads no fonts; every app uses Brydio's own, so this one is never shown.`,
      });
    }
  }

  return warnings;
}
