/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { str, TYPE } from './tokens.ts';

/**
 * `bry-diff`: a pull request's changes, as the kit draws them
 * (`packages/ui/src/components/diff.tsx`).
 *
 * The parsing is the kit's, line for line: hunks from unified diff text, then
 * paired into rows so removals sit beside the additions after them. Side by
 * side where the element itself is wide enough, one column where it isn't.
 * Pressing a line number chooses that line and Shift extends the run, on one
 * side of one file; either says `select { file, side, start, end }`. Opening a
 * file that has no patch yet says `expand { file }` — nothing here fetches.
 */

type Element = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean; requestUpdate(): void };

/** Past this much diff text in all, every file starts closed: the list first. */
export const DIFF_OPEN_UNDER = 20_000;

export type DiffSide = 'old' | 'new';

export interface DiffLine {
  kind: 'context' | 'add' | 'remove';
  old?: number;
  new?: number;
  text: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  previous?: string;
  status?: 'added' | 'modified' | 'removed' | 'renamed';
  patch?: string;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

/**
 * The hunks in unified diff text. File headers (`diff --git`, `index`, `---`,
 * `+++`) are skipped, and so is "\ No newline at end of file". A line before
 * the first hunk header isn't part of any hunk and is left out.
 */
export function parseUnifiedDiff(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let old = 0;
  let next = 0;

  for (const raw of text.split('\n')) {
    const header = HUNK.exec(raw);

    if (header) {
      old = Number(header[1]);
      next = Number(header[3]);
      current = { header: raw, lines: [] };
      hunks.push(current);
      continue;
    }

    if (!current || raw.startsWith('\\')) continue;

    const mark = raw[0];
    const body = raw.slice(1);

    if (mark === '+') current.lines.push({ kind: 'add', new: next++, text: body });
    else if (mark === '-') current.lines.push({ kind: 'remove', old: old++, text: body });
    // A context line always starts with a space; an empty line is the text's own end.
    else if (mark === ' ') current.lines.push({ kind: 'context', old: old++, new: next++, text: body });
  }

  return hunks;
}

export interface SplitRow {
  left?: DiffLine;
  right?: DiffLine;
}

/** Hunk lines paired for side by side: a run of removals beside the additions after it. */
export function splitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.kind === 'context') {
      rows.push({ left: line, right: line });
      index += 1;
      continue;
    }

    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];

    while (lines[index]?.kind === 'remove') removed.push(lines[index++]!);
    while (lines[index]?.kind === 'add') added.push(lines[index++]!);

    for (let row = 0; row < Math.max(removed.length, added.length); row += 1) {
      rows.push({ left: removed[row], right: added[row] });
    }
  }

  return rows;
}

/** Whether every file opens at once: all of them sent, and not much text in all. */
export const opensAll = (files: readonly DiffFile[]): boolean =>
  files.reduce((sum, file) => sum + (file.patch?.length ?? 0), 0) <= DIFF_OPEN_UNDER &&
  files.every(file => file.patch !== undefined);

const STATUS: Record<NonNullable<DiffFile['status']>, string> = {
  added: 'Added',
  modified: 'Changed',
  removed: 'Removed',
  renamed: 'Renamed',
};

interface Chosen {
  file: string;
  side: DiffSide;
  start: number;
  end: number;
}

const held = new WeakMap<object, { open: Set<string>; seen: string; selection: Chosen | null; anchor: { side: DiffSide; line: number } | null }>();

const list = (value: unknown): DiffFile[] => (Array.isArray(value) ? (value as DiffFile[]) : []);

drawAs(
  'bry-diff',
  element => {
    const diff = element as Element;
    const files = list(element.files);
    const key = files.map(file => `${file.path}:${file.patch === undefined ? 0 : file.patch.length}`).join('|');
    let state = held.get(diff);

    if (!state) {
      state = { open: new Set(), seen: '', selection: null, anchor: null };
      held.set(diff, state);
    }
    if (state.seen !== key) {
      // Which files are open is decided again whenever the set of files or
      // their patches changes, as the kit decides it when it first draws.
      state.seen = key;
      if (opensAll(files)) for (const file of files) state.open.add(file.path);
    }

    const current = state;

    if (element.loading === true) {
      return html`<div class="loading" role="status" aria-label="Loading"><div class="bone"></div><div class="bone"></div></div>`;
    }
    if (files.length === 0) {
      return html`<div class="empty"><p>${str(element.empty) || 'No changes.'}</p></div>`;
    }

    const toggle = (file: DiffFile) => {
      if (current.open.has(file.path)) current.open.delete(file.path);
      else {
        current.open.add(file.path);
        // The app sends the text when the person opens a file it hasn't sent.
        if (file.patch === undefined) diff.emit('expand', { file: file.path });
      }

      diff.requestUpdate();
    };
    const choose = (file: string, side: DiffSide, line: number, extend: boolean) => {
      const from = extend && current.anchor?.side === side ? current.anchor.line : line;

      if (!extend || current.anchor?.side !== side) current.anchor = { side, line };

      current.selection = { file, side, start: Math.min(from, line), end: Math.max(from, line) };
      diff.emit('select', current.selection);
      diff.requestUpdate();
    };
    const isChosen = (file: string, side: DiffSide, line?: number) =>
      line !== undefined &&
      current.selection?.file === file &&
      current.selection.side === side &&
      line >= current.selection.start &&
      line <= current.selection.end;

    const number = (file: DiffFile, side: DiffSide, line: DiffLine | undefined) => {
      const at = side === 'old' ? line?.old : line?.new;

      return html`<button
        type="button"
        class="number ${isChosen(file.path, side, at) ? 'chosen' : ''}"
        ?disabled=${at === undefined}
        aria-label=${at === undefined ? nothing : `${side === 'old' ? 'Before' : 'After'}, line ${at}`}
        @click=${(event: MouseEvent) => at !== undefined && choose(file.path, side, at, event.shiftKey)}
      >
        ${at ?? ''}
      </button>`;
    };
    const cell = (line: DiffLine | undefined) =>
      html`<code class="text ${line ? line.kind : 'none'}">${line ? line.text : ''}</code>`;

    return html`<div class="diff" aria-label=${str(element.label) || nothing}>
      ${files.map(file => {
        const open = current.open.has(file.path);
        const hunks = open && file.patch !== undefined ? parseUnifiedDiff(file.patch) : [];

        return html`<section class="file" data-file=${file.path}>
          <button type="button" class="head" aria-expanded=${open ? 'true' : 'false'} @click=${() => toggle(file)}>
            <span class="path">${file.path}</span>
            ${file.previous ? html`<span class="was">was ${file.previous}</span>` : nothing}
            ${file.status ? html`<span class="status" data-status=${file.status}>${STATUS[file.status]}</span>` : nothing}
          </button>
          ${open
            ? file.patch === undefined
              ? html`<p class="waiting">Loading the changes…</p>`
              : hunks.map(
                  hunk => html`<div class="hunk">
                    <p class="header"><code>${hunk.header}</code></p>
                    ${splitRows(hunk.lines).map(
                      row => html`<div class="row">
                        ${number(file, 'old', row.left)}${cell(row.left)}${number(file, 'new', row.right)}${cell(row.right)}
                      </div>`,
                    )}
                  </div>`,
                )
            : nothing}
        </section>`;
      })}
    </div>`;
  },
  [
    TYPE,
    css`
      :host {
        display: block;
        min-width: 0;
        container-type: inline-size;
      }
      .diff {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.5rem;
      }
      .file {
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        overflow: hidden;
      }
      .head {
        display: flex;
        width: 100%;
        align-items: center;
        gap: 0.5rem;
        border: 0;
        background: var(--bg-sunken);
        padding: 0.5rem 0.75rem;
        font: inherit;
        font-size: 0.8125rem;
        color: var(--fg-strong);
        text-align: start;
        cursor: pointer;
      }
      .head:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 3px var(--brand-ring);
      }
      .path {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .was,
      .status {
        font-size: 0.6875rem;
        color: var(--fg-muted);
      }
      .status {
        margin-inline-start: auto;
        border-radius: 9999px;
        background: var(--bg-fill);
        padding: 0.05rem 0.5rem;
      }
      [data-status='added'] {
        background: var(--success-soft);
        color: var(--success-fg);
      }
      [data-status='removed'] {
        background: var(--danger-soft);
        color: var(--danger-fg);
      }
      .waiting,
      .header {
        margin: 0;
        padding: 0.375rem 0.75rem;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .header code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      /* One column of changes, until the element itself has room for two. */
      .row {
        display: grid;
        grid-template-columns: 3rem 1fr;
        align-items: baseline;
      }
      .row > :nth-child(3),
      .row > :nth-child(4) {
        display: none;
      }
      @container (min-width: 60rem) {
        .row {
          grid-template-columns: 3rem 1fr 3rem 1fr;
        }
        .row > :nth-child(3),
        .row > :nth-child(4) {
          display: block;
        }
      }
      .number {
        border: 0;
        background: none;
        padding: 0 0.5rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.6875rem;
        color: var(--fg-faint);
        text-align: end;
        cursor: pointer;
        user-select: none;
      }
      .number:disabled {
        cursor: default;
      }
      .number.chosen {
        background: var(--brand-soft);
        color: var(--brand-fg);
      }
      .number:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 2px var(--brand-ring);
      }
      .text {
        display: block;
        overflow-x: auto;
        padding: 0 0.5rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.75rem;
        white-space: pre;
      }
      .add {
        background: var(--success-soft);
      }
      .remove {
        background: var(--danger-soft);
      }
      .none {
        background: var(--bg-sunken);
      }
      .loading {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .bone {
        height: 6rem;
        border-radius: var(--radius-xl);
        background: var(--layer-hover);
        animation: pulse 2s ease-in-out infinite;
      }
      @keyframes pulse {
        50% {
          opacity: 0.5;
        }
      }
      .empty {
        border: 1px dashed var(--line);
        border-radius: var(--radius-xl);
        padding: 2.5rem 1.5rem;
        text-align: center;
      }
      .empty p {
        margin: 0;
        font-size: 0.9375rem;
        font-weight: 500;
        color: var(--fg-strong);
      }
    `,
  ],
);
