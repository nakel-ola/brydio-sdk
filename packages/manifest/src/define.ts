/**
 * A manifest written in TypeScript, checked as it is written (A5-F01-S03).
 *
 * `.brydio/app.json` is what Brydio reads, and `validate` checks it. An app
 * that also keeps its manifest in code (to share its collections' schemas
 * with its screens, say) gets one more check at type level: a placement that
 * names a screen the manifest doesn't declare doesn't compile.
 *
 * ```ts
 * export const manifest = defineManifest({
 *   name: 'issues',
 *   version: '0.1.0',
 *   screens: { board: { entry: 'screens/board.js' } },
 *   placements: [{ kind: 'project-tab', screen: 'bord' }],   // error: "bord" is not a screen
 * });
 * ```
 */

/** The parts of a manifest this check reads. Everything else passes through as written. */
export interface ManifestShape {
  name: string;
  version: string;
  screens?: Readonly<Record<string, { readonly entry: string }>>;
  placements?: readonly { readonly kind: string; readonly screen: string; readonly label?: string; readonly icon?: string }[];
  [field: string]: unknown;
}

/** The screen names a manifest declares. */
export type ScreenNameOf<M> = M extends { readonly screens: infer S } ? Extract<keyof S, string> : never;

/** A manifest whose every placement names one of its own screens. */
export type WithDeclaredScreens<M> = M extends { readonly placements: readonly unknown[] }
  ? Omit<M, 'placements'> & {
      readonly placements: readonly { readonly kind: string; readonly screen: ScreenNameOf<M>; readonly label?: string; readonly icon?: string }[];
    }
  : M;

/** Returns the manifest as written, with its literal types, once its placements check. */
export function defineManifest<const M extends ManifestShape>(manifest: M & WithDeclaredScreens<M>): M {
  return manifest;
}
