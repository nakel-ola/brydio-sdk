import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

const ROOT = join(import.meta.dir, '../..');

function packageJson(): { scripts: Record<string, string>; devDependencies: Record<string, string> } {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
}

function wranglerConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8'));
}

test('checks generated references, the complete docs site, a clean build, and types without capture', () => {
  const check = packageJson().scripts['docs:check'];

  expect(check).toBe([
    'bun test',
    'packages/cli/test/elements-doc.test.ts',
    'packages/cli/test/bridge-doc.test.ts',
    'packages/manifest/test/manifest-doc.test.ts',
    'packages/cli/test/checklist-doc.test.ts',
    'docs-site/test',
    '&& bun run docs:build && bun run check-types',
  ].join(' '));
  expect(check).not.toContain('docs:images');
  expect(check).not.toContain('capture.ts');
});

test('pins an assets-only Wrangler deployment for the static build', () => {
  const config = wranglerConfig();

  expect(config).toEqual({
    '$schema': './node_modules/wrangler/config-schema.json',
    name: 'brydio-sdk-docs',
    compatibility_date: '2026-09-18',
    assets: { directory: 'docs-site/dist' },
  });
  expect(packageJson().devDependencies.wrangler).toBe('4.135.0');
  expect(packageJson().scripts['docs:deploy']).toBe('wrangler deploy');
});

test('links exact authoring and open deployment inputs from both documentation indexes', () => {
  const authoring = readFileSync(join(ROOT, 'docs-site', 'README.md'), 'utf8');
  const deployment = readFileSync(join(ROOT, 'docs-site', 'DEPLOYMENT.md'), 'utf8');
  const rootReadme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const docsIndex = readFileSync(join(ROOT, 'docs', 'README.md'), 'utf8');

  for (const command of [
    'bun run docs:build',
    'python3 -m http.server --directory docs-site/dist 8080',
    'bun run docs:images',
    'bun run docs:check',
  ]) expect(authoring).toContain(command);

  for (const input of [
    'Root directory: `/`',
    'Build command: `bun run docs:build`',
    'Deploy command: `bun run docs:deploy`',
    'Output directory: `docs-site/dist`',
    'Bun 1.3.11',
    '`DOCS_BASE_PATH`',
    'No secrets',
    'No network fetches',
    'No rewrites',
    'Domain, production URL, and deployment trigger are open.',
  ]) expect(deployment).toContain(input);

  expect(rootReadme).toContain('(docs-site/README.md)');
  expect(docsIndex).toContain('(../docs-site/README.md)');
});
