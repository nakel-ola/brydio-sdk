import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build, create, CreateRefused, SDK_ROOT, test as runTests, validate } from '../src/index.ts';

const made: string[] = [];

afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

function place(): string {
  const into = mkdtempSync(join(tmpdir(), 'brydio-create-'));

  made.push(into);

  return into;
}

const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

describe('brydio create', () => {
  test('copies the template into a folder named for the app, renamed, and linked to this SDK', async () => {
    const into = place();
    const installed: string[] = [];
    const lines: string[] = [];
    const dir = await create('team-issues', {
      into,
      template: 'plain',
      out: line => void lines.push(line),
      install: folder => (installed.push(folder), true),
    });

    expect(dir).toBe(join(into, 'team-issues'));
    expect(installed).toEqual([dir]);
    expect(json(join(dir, '.brydio/app.json'))).toMatchObject({
      name: 'team-issues',
      version: '0.1.0',
      displayName: 'Team issues',
      placements: [{ kind: 'project-tab', screen: 'home', label: 'Team issues' }],
    });

    const pkg = json(join(dir, 'package.json'));

    expect(pkg.name).toBe('team-issues');
    expect(pkg.dependencies['@brydio/app']).toBe(`file:${join(SDK_ROOT, 'packages/app')}`);
    expect(pkg.overrides['@brydio/ui']).toBe(`file:${join(SDK_ROOT, 'packages/ui')}`);
    expect(json(join(dir, 'tsconfig.json')).extends).toBeUndefined();
    expect(json(join(dir, 'tsconfig.json')).compilerOptions.strict).toBe(true);
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toStartWith('# Team issues\n');
    expect(existsSync(join(dir, 'node_modules'))).toBe(false);
    expect(existsSync(join(dir, 'dist'))).toBe(false);
    expect(existsSync(join(dir, 'src/screens/home.ts'))).toBe(true);
    expect(lines.join('\n')).toContain('bun run dev');
  });

  test('asks Preact or plain when not told', async () => {
    const into = place();
    const asked: string[] = [];
    const dir = await create('checklist', {
      into,
      out: () => {},
      ask: async question => (asked.push(question), '1'),
      install: false,
    });

    expect(asked).toEqual(['Template (1-2): ']);
    expect(existsSync(join(dir, 'src/screens/home.tsx'))).toBe(true);
    await expect(create('other', { into, out: () => {}, ask: async () => 'vue', install: false })).rejects.toThrow(
      'That is not one of the templates.',
    );
  });

  test('refuses a name Brydio would refuse, and a folder that already has files', async () => {
    const into = place();

    for (const name of ['Team Issues', 'team_issues', '-issues', '']) {
      await expect(create(name, { into, template: 'plain', install: false, out: () => {} })).rejects.toBeInstanceOf(CreateRefused);
    }

    mkdirSync(join(into, 'taken'));
    writeFileSync(join(into, 'taken', 'notes.txt'), 'mine');

    await expect(create('taken', { into, template: 'plain', install: false, out: () => {} })).rejects.toThrow('already has files');
    expect(readFileSync(join(into, 'taken', 'notes.txt'), 'utf8')).toBe('mine');
  });

  test.each(['preact', 'plain'] as const)(
    'makes a %s app that installs, builds, validates and passes its own tests with no edits',
    async template => {
      // A5-F06-S01: the result runs with no edits. A real install, from this SDK.
      const into = place();
      const dir = await create(`fresh-${template}`, { into, template, out: () => {} });
      const built = await build(dir);

      expect(built.problems.filter(problem => problem.severity === 'error')).toEqual([]);
      expect(built.ok).toBe(true);
      expect(validate(dir).problems).toEqual([]);
      expect(await runTests(dir, { out: () => {} })).toBe(0);
    },
    120_000,
  );
});
