import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  MAX_ID_CHARS,
  MAX_MESSAGE_BYTES,
  MAX_REFUSALS,
  MAX_TOAST_CHARS,
  READY_BUDGET_MS,
  START_BUDGET_MS,
  HOST_METHODS,
  WORKER_METHODS,
} from '../../app/src/protocol.ts';
import { bridgeDoc } from '../../../scripts/docs-bridge.ts';

/**
 * `docs/bridge.md` and the bridge say the same (A9-F03-S02).
 *
 * Two halves, and the second is the one that rots. **Every call a screen can
 * make has a section** — a call added to `@brydio/app` and not written up
 * fails here, so the page cannot quietly cover less than the bridge does.
 * **Every limit on the page is the number in the code**, read from the
 * constants rather than copied, because a documented limit that is wrong is
 * worse than an undocumented one: somebody builds to it.
 */

const root = join(import.meta.dir, '../../..');
const page = readFileSync(join(root, 'docs', 'bridge.md'), 'utf8');
const index = readFileSync(join(root, 'packages/app/src/index.ts'), 'utf8');
const bridge = readFileSync(join(root, 'packages/app/src/bridge.ts'), 'utf8');

/** Every function and object `@brydio/app` exports for a screen to call. */
function callsInSource(): string[] {
  const calls = new Set<string>();

  for (const [, name] of index.matchAll(/^export (?:async )?function (\w+)/gm)) calls.add(name!);

  // `host`, `tools` and `data` are objects; their methods are the calls.
  for (const [, object, body] of index.matchAll(/^export const (\w+) = \{([\s\S]*?)^\};/gm)) {
    for (const [, method] of body!.matchAll(/^ {2}(?:get )?(\w+)[(<]/gm)) calls.add(`${object}.${method}`);
  }

  // Not calls a screen makes: `collection` is a type helper, `mount` and
  // `render` are covered by their own pages in the template's README.
  calls.delete('collection');

  return [...calls].sort();
}

describe('the bridge reference', () => {
  test('is the generated page, to the character', () => {
    expect(page.trim()).toBe(bridgeDoc().trim());
  });

  test('has a protocol row for every method the worker and host send', () => {
    const methods = [...WORKER_METHODS, ...HOST_METHODS];
    const missing = methods.filter(method => !page.includes(`| \`${method}\` |`));

    expect(methods.length).toBeGreaterThan(30);
    expect(missing).toEqual([]);
  });

  test('has a section for every call a screen can make', () => {
    const calls = callsInSource();

    expect(calls.length).toBeGreaterThan(8);

    // A section of its own, or named in one: `host.context` and
    // `host.subscribe` share a heading, and each is written up under it.
    const undocumented = calls.filter(call => !page.includes(`\`${call}(`) && !page.includes(`\`${call}\``));

    expect(undocumented).toEqual([]);
  });

  test('names every error the bridge can throw, and what each one means', () => {
    const errors = [...bridge.matchAll(/^export class (\w+Error)/gm)].map(match => match[1]!);

    expect(errors.sort()).toEqual(['GrantError', 'HostError', 'TeardownError', 'ToolError']);

    for (const error of errors) expect(page, `${error} is not on the page`).toContain(`\`${error}\``);
  });

  test('quotes the limits the code actually sets', () => {
    // The numbers, wherever the page sets them: the wording is the writer's,
    // the values are the code's.
    expect(page).toContain(`${LIST_LIMIT_DEFAULT} by default, ${LIST_LIMIT_MAX} at most`);
    expect(page).toContain(`${MAX_MESSAGE_BYTES / 1024} KB`);
    expect(page).toContain(`| Refusals | **${MAX_REFUSALS}** |`);
    expect(page).toContain(`${READY_BUDGET_MS / 1000} s`);
    expect(page).toContain(`${START_BUDGET_MS / 1000} s`);
    expect(page).toContain(`${MAX_ID_CHARS} characters`);
    expect(page).toContain(`${MAX_TOAST_CHARS} characters`);
  });

  test('is named by the README, so a builder can find it', () => {
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain('(docs/bridge.md)');
  });
});
