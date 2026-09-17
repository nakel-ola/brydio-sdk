import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Brydio's answers for the SDK's parity tests, live or recorded.
 *
 * Much of the SDK is a copy of Brydio: the catalogue, the manifest schema,
 * the grants, the limits, the prelude, the tree store. Each copy has a test
 * that asks Brydio the same questions and expects the same answers. With
 * Brydio's checkout beside this one (`../brydio`, or `BRYDIO_DIR`), the
 * answers are worked out from it there and then. Without it, as in this
 * repository's own CI, they come from `contracts/brydio.json`, so the tests
 * still check something rather than skipping.
 *
 * The file is kept honest from the other side: whenever Brydio is present,
 * a test whose live answers differ from the recorded ones fails, saying to
 * run `bun run contracts:record`, which writes them again (with Brydio's
 * commit) for review in the diff.
 */

const ROOT = resolve(import.meta.dir, '..');

/** Brydio's checkout, where the live answers come from. */
export const BRYDIO = process.env.BRYDIO_DIR ?? join(ROOT, '..', 'brydio');

/** The recorded answers. */
export const CONTRACTS_FILE = join(ROOT, 'contracts', 'brydio.json');

/** Set by `bun run contracts:record`: write the live answers instead of comparing them. */
const RECORDING = process.env.BRYDIO_RECORD === '1';

interface Recorded {
  /** The Brydio commit the answers were last recorded from, and whether its tree had changes. */
  brydio: { commit: string; dirty: boolean } | null;
  contracts: Record<string, unknown>;
}

function read(): Recorded {
  return existsSync(CONTRACTS_FILE)
    ? (JSON.parse(readFileSync(CONTRACTS_FILE, 'utf8')) as Recorded)
    : { brydio: null, contracts: {} };
}

function brydioCommit(): { commit: string; dirty: boolean } {
  const git = (...args: string[]) => Bun.spawnSync(['git', '-C', BRYDIO, ...args]).stdout.toString().trim();

  return { commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain', '--', 'apps/api/src/apps', 'packages/app/src/apps').length > 0 };
}

/** Whether every file a contract is worked out from is in Brydio's checkout. */
export function brydioHas(files: readonly string[]): boolean {
  return files.every(file => existsSync(join(BRYDIO, file)));
}

/** A path inside Brydio's checkout. */
export const inBrydio = (file: string): string => join(BRYDIO, file);

/**
 * Brydio's answers for one named contract.
 *
 * `needs` are the Brydio files `compute` reads or imports, relative to its
 * checkout. When all of them are there, the answers are computed live and
 * held to the recorded ones (or recorded, under `contracts:record`).
 * Otherwise the recorded answers are used. Answers go through JSON, so
 * `compute` returns plain data.
 */
export async function brydioAnswers<T>(name: string, needs: readonly string[], compute: () => T | Promise<T>): Promise<T> {
  const recorded = read();

  if (!brydioHas(needs)) {
    if (!(name in recorded.contracts)) {
      throw new Error(`No recorded answers for "${name}" in contracts/brydio.json, and Brydio's checkout isn't at ${BRYDIO}.`);
    }

    return recorded.contracts[name] as T;
  }

  const live = JSON.parse(JSON.stringify(await compute())) as T;

  if (RECORDING) {
    const next = read();

    next.contracts[name] = live;
    next.brydio = brydioCommit();
    next.contracts = Object.fromEntries(Object.entries(next.contracts).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(CONTRACTS_FILE, `${JSON.stringify(next, null, 2)}\n`);

    return live;
  }

  if (JSON.stringify(recorded.contracts[name]) !== JSON.stringify(live)) {
    throw new Error(
      `contracts/brydio.json is out of date for "${name}": Brydio's answers have changed. Run bun run contracts:record and review the diff.`,
    );
  }

  return live;
}
