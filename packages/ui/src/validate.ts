/**
 * `@brydio/ui/validate`: the catalogue itself, and the checks that read it.
 *
 * Apart from the package's main entry so that a screen's runtime never
 * carries the table (A5-F03-S01). Its readers all run before a person sees
 * anything: `brydio validate` and the editor plugin as the app is written,
 * the fake host as its tests run, and Brydio itself when it draws.
 */

export * from './catalogue.ts';
export * from './checks.ts';
