/**
 * Builds the editor plugin `tsserver` loads with `require`: `src/ts-plugin.ts`
 * and the checks it shares with `brydio validate`, as one CommonJS file.
 * TypeScript itself stays outside: the editor hands the plugin its own.
 *
 *   bun packages/cli/scripts/build-ts-plugin.ts          writes ts-plugin/plugin.cjs
 *   bun packages/cli/scripts/build-ts-plugin.ts --check  fails when it is out of date
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cli = join(import.meta.dir, '..');
const target = join(cli, 'ts-plugin', 'plugin.cjs');

export async function buildPlugin(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(cli, 'src', 'ts-plugin.ts')],
    target: 'node',
    format: 'cjs',
    external: ['typescript'],
  });

  if (!result.success) throw new Error(result.logs.map(String).join('\n'));

  return `// Built by scripts/build-ts-plugin.ts from src/ts-plugin.ts. Don't edit by hand.\n${await result.outputs[0]!.text()}`;
}

if (import.meta.main) {
  const code = await buildPlugin();

  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== code) {
      console.error('ts-plugin/plugin.cjs is out of date. Run: bun packages/cli/scripts/build-ts-plugin.ts');
      process.exit(1);
    }
  } else {
    writeFileSync(target, code);
  }
}
