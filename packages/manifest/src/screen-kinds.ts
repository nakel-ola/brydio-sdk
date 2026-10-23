/**
 * The two kinds of screen (`tasks/app-publishing` PB27). A copy of Brydio's
 * `apps/api/src/apps/manifest/screen-kinds.ts`.
 *
 * A **tree screen** is the app's elements, drawn by Brydio (PB21 to PB24). A
 * **frame screen** is the app's own HTML and CSS, drawn in a sandboxed frame
 * on an origin that holds only app code. The manifest says which, per screen:
 * `{ "kind": "frame", "entry": "screens/settings.html" }`. Left out, a screen
 * is a tree screen, so every manifest from before keeps its meaning.
 */

export const SCREEN_KINDS = ['tree', 'frame'] as const;

export type ScreenKind = (typeof SCREEN_KINDS)[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Which kind one of the manifest's screens is; `tree` when it says nothing. */
export function screenKindOf(manifest: unknown, screen: string): ScreenKind {
  const screens = isRecord(manifest) && isRecord(manifest.screens) ? manifest.screens : {};
  const declared = Object.prototype.hasOwnProperty.call(screens, screen) ? screens[screen] : undefined;

  return isRecord(declared) && declared.kind === 'frame' ? 'frame' : 'tree';
}

/** The manifest's screens of one kind, by name. */
export function screensOfKind(manifest: unknown, kind: ScreenKind): string[] {
  const screens = isRecord(manifest) && isRecord(manifest.screens) ? manifest.screens : {};

  return Object.keys(screens).filter(screen => screenKindOf(manifest, screen) === kind);
}

/** Every frame screen's page, by its path inside the bundle. */
export function framePagesOf(manifest: unknown): Set<string> {
  const screens = isRecord(manifest) && isRecord(manifest.screens) ? manifest.screens : {};

  return new Set(
    screensOfKind(manifest, 'frame')
      .map(screen => (screens[screen] as { entry?: unknown }).entry)
      .filter((entry): entry is string => typeof entry === 'string')
  );
}
