import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { RELEASE, RELEASED, releaseBuild } from '../../../scripts/release-build.ts';

afterAll(() => rmSync(RELEASE, { recursive: true, force: true }));

describe('published package documentation', () => {
  test(
    'every release artifact includes a package README with a usage example',
    async () => {
      const built = await releaseBuild({ dry: true, out: () => {} });

      expect(Object.keys(built).sort()).toEqual(RELEASED.map(name => `@brydio/${name}`).sort());

      for (const [packageName, folder] of Object.entries(built)) {
        const path = join(folder, 'README.md');

        expect(existsSync(path), `${packageName} has no README in its release artifact`).toBe(true);

        const readme = readFileSync(path, 'utf8');

        expect(readme, packageName).toStartWith(`# ${packageName}\n`);
        expect(readme, packageName).toContain('```');
      }
    },
    120_000,
  );
});
