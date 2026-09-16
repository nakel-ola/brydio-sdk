/** The extensions a screen's source may have, in the order they are looked for. */
export const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const;

/**
 * Whether a file, by its path from the app's root, is one the source checks
 * read: under `src/`, a script, not a declaration and not a test. Tests run
 * in the fake host, not in a workspace; they may do what a screen may not.
 * The editor plugin asks the same question.
 */
export function isScreenSource(path: string): boolean {
  const normal = path.replace(/\\/g, '/');

  return (
    /^src\//.test(normal) &&
    SOURCE_EXTENSIONS.some(extension => normal.endsWith(extension)) &&
    !normal.endsWith('.d.ts') &&
    !/(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[jt]sx?$/.test(normal)
  );
}
