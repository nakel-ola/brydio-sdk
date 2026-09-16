import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type ts from 'typescript';

import { checkSource } from './source-checks.ts';
import { isScreenSource } from './screen-sources.ts';

/**
 * The source checks in the editor (A5-F03-S03): a TypeScript language
 * service plugin, so an unknown element, a setting it doesn't take, a value
 * outside its list, `document` or `fetch` is underlined as it is typed, in
 * any editor that runs `tsserver` (VS Code, Zed, WebStorm, Neovim's LSP).
 *
 * It calls `checkSource`, the function `brydio validate` calls, on the files
 * `validate` reads (`isScreenSource`), so a rule can't exist in one and not
 * the other. The words are the same too: the host's sentence, then the hint.
 *
 * Switched on in an app's tsconfig:
 *
 * ```json
 * { "compilerOptions": { "plugins": [{ "name": "@brydio/cli/ts-plugin" }] } }
 * ```
 *
 * `tsserver` runs in Node and loads plugins with `require`, so this ships
 * built as `ts-plugin/index.cjs`; `ts-plugin.test.ts` fails when that file is
 * older than this source.
 */

/** Where Brydio's diagnostics come from, and the code each carries in the editor. */
export const PLUGIN_SOURCE = 'brydio';
export const PLUGIN_CODE = 91_000;

/** The app a file belongs to: the nearest folder above it with a manifest. */
function appRootOf(file: string): string | null {
  for (let at = dirname(file); ; at = dirname(at)) {
    if (existsSync(join(at, '.brydio', 'app.json'))) return at;
    if (dirname(at) === at) return null;
  }
}

/** Brydio's diagnostics for one file, as the editor shows them. */
export function brydioDiagnostics(tsModule: typeof ts, file: ts.SourceFile, root = appRootOf(file.fileName)): ts.Diagnostic[] {
  if (!root || !isScreenSource(relative(root, file.fileName))) return [];

  return (
    checkSource(relative(root, file.fileName), file.text)
      // A file that doesn't parse is TypeScript's own error to show.
      .filter(problem => problem.code !== 'source_syntax')
      .map(problem => {
        const start = file.getPositionOfLineAndCharacter(Math.max(0, (problem.line ?? 1) - 1), Math.max(0, (problem.column ?? 1) - 1));
        const word = /^[\w$-]+/.exec(file.text.slice(start))?.[0] ?? '';

        return {
          file,
          start,
          length: Math.max(1, word.length),
          messageText: `${problem.message}${problem.hint ? ` ${problem.hint}` : ''} [${problem.code}]`,
          category: tsModule.DiagnosticCategory.Error,
          code: PLUGIN_CODE,
          source: PLUGIN_SOURCE,
        };
      })
  );
}

function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const tsModule = modules.typescript;

  return {
    create(info) {
      const service = info.languageService;
      const proxy = Object.create(null) as ts.LanguageService;

      for (const key of Object.keys(service) as (keyof ts.LanguageService)[]) {
        const member = service[key];

        (proxy as unknown as Record<string, unknown>)[key] = typeof member === 'function' ? (...args: unknown[]) => (member as (...a: unknown[]) => unknown).apply(service, args) : member;
      }

      proxy.getSemanticDiagnostics = fileName => {
        const prior = service.getSemanticDiagnostics(fileName);
        const file = service.getProgram()?.getSourceFile(fileName);

        if (!file) return prior;

        try {
          return [...prior, ...brydioDiagnostics(tsModule, file)];
        } catch (error) {
          info.project.projectService.logger.info(`brydio: ${error instanceof Error ? error.message : String(error)}`);

          return prior;
        }
      };

      return proxy;
    },
  };
}

export default init;
