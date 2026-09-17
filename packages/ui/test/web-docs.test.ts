import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the web-component build is written about (A6-F06-S03).
 *
 * It is for HTML views and nothing else. A reader who meets it anywhere in
 * these docs should meet it under that heading, with the sentence saying app
 * screens don't use it — otherwise the next person writing an app reaches for
 * the wrong build, which is the whole reason the box is here.
 */

const root = join(import.meta.dir, '../../..');
const NAME = '@brydio/ui/web';

const docs = () => [
  { path: 'README.md', text: readFileSync(join(root, 'README.md'), 'utf8') },
  ...readdirSync(join(root, 'docs'))
    .filter(name => name.endsWith('.md'))
    .map(name => ({ path: `docs/${name}`, text: readFileSync(join(root, 'docs', name), 'utf8') })),
];

describe('the web build in the SDK’s docs (A6-F06-S03)', () => {
  test('is listed for HTML views, and said not to be for app screens', () => {
    const readme = readFileSync(join(root, 'packages/ui/README.md'), 'utf8');

    expect(readme).toContain('For HTML views only');
    expect(readme).toMatch(/App screens don.t use this/);

    const top = docs().find(one => one.path === 'README.md')!.text;

    expect(top).toContain('### For HTML views');
    expect(top).toContain('It is not for app screens');
  });

  test('is never offered as a way to write an app screen', () => {
    // A doc may name it for what it is — `docs/support.md` says it carries no
    // promise until it ships — but no line may hold it out as something a
    // screen is written with, which is the mistake this box guards against.
    const offering = docs()
      .filter(one => one.path !== 'README.md')
      .flatMap(one =>
        one.text
          .split('\n')
          .filter(line => (line.includes(NAME) || /web[- ]component/i.test(line)) && /\bscreens?\b/i.test(line))
          .map(line => `${one.path}: ${line.trim()}`),
      );

    expect(offering).toEqual([]);
  });
});
