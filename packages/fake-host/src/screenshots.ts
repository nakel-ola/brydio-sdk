import { readProject } from '@brydio/cli';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FakeHost, type HostContext } from './host.ts';
import type { Fixtures } from './tools.ts';

/**
 * Pictures of every screen, for publishing (A5-F04-S04).
 *
 * Each screen the manifest declares runs in the headless fake host with the
 * app's sample data, at a narrow and a wide width, in light and in dark. What
 * is kept is the tree Brydio would draw once the screen has settled, not
 * pixels: the pixels have to be Brydio's own kit, which draws these trees on
 * the app's listing and install screen. A screen that stops, has a node
 * refused, throws or draws nothing is a problem naming the screen, the width
 * and the theme, and publishing stops rather than keeping a blank picture.
 */

export const SCREENSHOT_WIDTHS = { narrow: 400, wide: 1200 } as const;
export const SCREENSHOT_THEMES = ['light', 'dark'] as const;
/** Brydio's limits on what a publish carries (Hodler, 16 Sep). */
export const SCREENSHOT_TREE_BYTES = 512 * 1024;
export const SCREENSHOT_TOTAL_BYTES = 4 * 1024 * 1024;
/** Where an app keeps the records its pictures are taken with. */
export const SAMPLES_PATH = '.brydio/samples.json';

export type ScreenshotWidth = keyof typeof SCREENSHOT_WIDTHS;
export type ScreenshotTheme = (typeof SCREENSHOT_THEMES)[number];

/** A node as `tree/mount` carries it. */
export interface ScreenshotNode {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  text?: string;
  children?: string[];
}

export interface Screenshot {
  screen: string;
  width: ScreenshotWidth;
  theme: ScreenshotTheme;
  tree: { root: string; nodes: ScreenshotNode[] };
}

export interface ScreenshotProblem {
  screen: string;
  width?: ScreenshotWidth;
  theme?: ScreenshotTheme;
  message: string;
}

export interface ScreenshotOptions {
  /** Records to take the pictures with. `.brydio/samples.json` unless given. */
  samples?: Fixtures;
  /** How long a screen may take to mount and settle. */
  timeout?: number;
  /** Only these screens. Every declared one unless given. */
  screens?: string[];
}

/** The app's sample records: `{ "collections": { "issues": [ … ] } }`, or none. */
export function readSamples(root: string): Fixtures {
  const path = join(root, SAMPLES_PATH);

  if (!existsSync(path)) return {};

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { collections?: unknown };

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.collections !== 'object' || !parsed.collections) {
    throw new Error(`${SAMPLES_PATH} must be { "collections": { "<collection>": [records] } }.`);
  }

  return parsed.collections as Fixtures;
}

/** Renders every declared screen of a built app. `dist/` must be fresh. */
export async function renderScreenshots(root: string, options: ScreenshotOptions = {}): Promise<{ screenshots: Screenshot[]; problems: ScreenshotProblem[] }> {
  const project = readProject(root);
  const screenshots: Screenshot[] = [];
  const problems: ScreenshotProblem[] = [];

  if (!project.manifest) return { screenshots, problems: [{ screen: '*', message: 'The manifest is not one Brydio accepts.' }] };

  const manifest = project.manifest;
  let samples: Fixtures;

  try {
    samples = options.samples ?? readSamples(project.root);
  } catch (error) {
    return { screenshots, problems: [{ screen: '*', message: error instanceof Error ? error.message : String(error) }] };
  }

  let total = 0;

  for (const [screen, declared] of Object.entries(manifest.screens ?? {})) {
    if (options.screens && !options.screens.includes(screen)) continue;

    const placement = (manifest.placements ?? []).find(one => one.screen === screen);

    for (const width of Object.keys(SCREENSHOT_WIDTHS) as ScreenshotWidth[]) {
      for (const theme of SCREENSHOT_THEMES) {
        const context: Partial<HostContext> = {
          theme,
          size: { width: SCREENSHOT_WIDTHS[width], height: 800 },
          ...(placement ? { placement: { id: 'placement_1', kind: placement.kind, ...(placement.kind.startsWith('project') ? { projectId: 'project_1' } : {}) } } : {}),
        };
        const fail = (message: string) => problems.push({ screen, width, theme, message });
        let host: FakeHost | null = null;

        try {
          host = FakeHost.start({ entry: join(project.root, 'dist', declared.entry), manifest, fixtures: samples, context });
          await host.mounted(options.timeout ?? 5_000);
          await host.idle(25, options.timeout ?? 5_000);

          if (host.refusals.length) {
            fail(`Brydio refused part of it: ${host.refusals[0]!.reason}`);
            continue;
          }

          if (host.errors.length) {
            fail(`It threw: ${host.errors[0]}`);
            continue;
          }

          const tree = snapshot(host);

          if (!tree || tree.nodes.length < 2) {
            fail('It drew nothing.');
            continue;
          }

          const bytes = JSON.stringify(tree).length;

          if (bytes > SCREENSHOT_TREE_BYTES) {
            fail(`Its tree is ${Math.round(bytes / 1024)} KB, over the ${SCREENSHOT_TREE_BYTES / 1024} KB a picture may be.`);
            continue;
          }

          total += bytes;
          screenshots.push({ screen, width, theme, tree });
        } catch (error) {
          const why = error instanceof Error ? error.message : String(error);

          // The first line says what happened; a stack trace belongs in the app's own tests.
          fail((host?.stopped && !why.includes(`stopped (${host.stopped})`) ? `It stopped (${host.stopped}). ${why}` : why).split('\n')[0]!);
        } finally {
          host?.stop();
        }
      }
    }
  }

  if (total > SCREENSHOT_TOTAL_BYTES) {
    problems.push({ screen: '*', message: `The pictures come to ${Math.round(total / 1024)} KB, over the ${SCREENSHOT_TOTAL_BYTES / 1024 / 1024} MB one publish may carry.` });
  }

  return { screenshots, problems };
}

/** The screen's tree as `tree/mount` would carry it, parent before child. */
function snapshot(host: FakeHost): Screenshot['tree'] | null {
  const root = host.tree.root;

  if (!root) return null;

  const nodes: ScreenshotNode[] = [];
  const walk = (id: string) => {
    const node = host.tree.get(id);

    if (!node) return;

    nodes.push(
      node.type === '#text'
        ? { id: node.id, type: node.type, text: node.text }
        : { id: node.id, type: node.type, ...(Object.keys(node.props).length ? { props: { ...node.props } } : {}), children: [...node.children] },
    );
    node.children.forEach(walk);
  };

  walk(root);

  return { root, nodes };
}

/** A problem as a line: "board, wide, dark: It drew nothing." */
export const describeScreenshotProblem = (problem: ScreenshotProblem): string =>
  `${[problem.screen, problem.width, problem.theme].filter(Boolean).join(', ')}: ${problem.message}`;
