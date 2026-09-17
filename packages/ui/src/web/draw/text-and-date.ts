/// <reference lib="dom" />
import { css, html, nothing, type TemplateResult } from '../base.ts';
import { drawAs } from '../define.ts';
import { FOCUS, str, TYPE } from './tokens.ts';

/**
 * `bry-date` and `bry-markdown`, as Brydio's React catalogue draws them
 * (`packages/app/src/apps/catalogue/draw/{date,markdown}.tsx`).
 *
 * The markdown is built as templates, never as a string of HTML, so anything
 * that looks like markup in an app's text is shown as the characters it is —
 * the same rule the shell's renderer keeps. A link is https (or mailto) only
 * and asks before it opens. A picture is not loaded at all here: the shell
 * allows one from Brydio's own file store, which an HTML view has no way to
 * ask about, so its description is shown instead.
 */

type Element = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean; requestUpdate(): void };

/** How much of a long text is shown before "Show more". Brydio's `MARKDOWN_SHOWN`. */
export const MARKDOWN_SHOWN = 4_000;

drawAs(
  'bry-date',
  element => {
    const invalid = Boolean(str(element.error));

    return html`<div class="field">
      <input
        type="date"
        .value=${str(element.value)}
        min=${str(element.min) || nothing}
        max=${str(element.max) || nothing}
        aria-label=${str(element.label) || nothing}
        placeholder=${str(element.placeholder) || nothing}
        ?disabled=${element.disabled === true}
        aria-invalid=${invalid ? 'true' : nothing}
        aria-describedby=${invalid ? 'error' : nothing}
        @change=${(event: Event) => element.emit('change', { value: (event.currentTarget as HTMLInputElement).value })}
      />
      ${invalid ? html`<p id="error" class="type-caption error">${str(element.error)}</p>` : nothing}
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .field {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.25rem;
      }
      /* The person's own format: a date field is written by the browser in their locale. */
      input {
        width: 100%;
        height: var(--field-h);
        border: 1px solid var(--line-input);
        border-radius: var(--field-radius);
        background: var(--bg-surface);
        padding: 0 var(--field-px);
        font: inherit;
        font-size: 0.8125rem;
        color: var(--fg);
        outline: none;
      }
      input:focus-visible {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-ring);
      }
      input:disabled {
        pointer-events: none;
        background: var(--bg-fill);
        color: var(--fg-muted);
      }
      [aria-invalid='true'] {
        border-color: var(--danger);
      }
      .error {
        color: var(--danger-fg);
      }
    `,
  ],
);

/** As much of a long text as is shown at first, cut at a paragraph where there is one. */
export function cutMarkdown(text: string, limit = MARKDOWN_SHOWN): { shown: string; more: boolean } {
  if (text.length <= limit) return { shown: text, more: false };

  const paragraph = text.lastIndexOf('\n\n', limit);

  return { shown: text.slice(0, paragraph > limit / 2 ? paragraph : limit), more: true };
}

/** Whether a link may be offered at all: the shell's rule, https and mailto. */
export function isSafeLink(href: string): boolean {
  try {
    const url = new URL(href, 'https://brydio.invalid');

    return url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/** A link's host, for asking about it. */
function hostOf(href: string): string {
  try {
    return new URL(href).host || href;
    } catch {
    return href;
  }
}

interface Span {
  text: string;
  code?: boolean;
  strong?: boolean;
  emphasis?: boolean;
  href?: string;
}

/**
 * One line's spans: code first, then links, then bold and italic. Everything
 * else, including anything that looks like a tag, stays text.
 */
export function spansOf(line: string): Span[] {
  const spans: Span[] = [];
  const pattern = /`([^`]+)`|!?\[([^\]]*)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
  let at = 0;
  let found: RegExpExecArray | null;

  while ((found = pattern.exec(line)) !== null) {
    if (found.index > at) spans.push({ text: line.slice(at, found.index) });

    const [whole, code, label, href, strongStars, strongLines, emStar, emLine] = found;

    if (code !== undefined) spans.push({ text: code, code: true });
    else if (label !== undefined && href !== undefined) {
      // A picture is never fetched here; its description is the text.
      if (whole.startsWith('!')) spans.push({ text: label });
      else if (isSafeLink(href)) spans.push({ text: label || href, href });
      else spans.push({ text: label || href });
    } else if (strongStars ?? strongLines) spans.push({ text: (strongStars ?? strongLines)!, strong: true });
    else if (emStar ?? emLine) spans.push({ text: (emStar ?? emLine)!, emphasis: true });

    at = found.index + whole.length;
  }

  if (at < line.length) spans.push({ text: line.slice(at) });

  return spans;
}

type Block =
  | { kind: 'heading'; level: number; line: string }
  | { kind: 'paragraph'; line: string }
  | { kind: 'quote'; line: string }
  | { kind: 'code'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'rule' };

/** The blocks a text is made of: the shell's subset, and nothing else. */
export function blocksOf(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const endParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', line: paragraph.join(' ') });
    paragraph = [];
  };

  for (let at = 0; at < lines.length; at++) {
    const line = lines[at]!;
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);

    if (line.startsWith('```')) {
      endParagraph();

      const code: string[] = [];

      while (++at < lines.length && !lines[at]!.startsWith('```')) code.push(lines[at]!);
      blocks.push({ kind: 'code', text: code.join('\n') });
    } else if (heading) {
      endParagraph();
      blocks.push({ kind: 'heading', level: heading[1]!.length, line: heading[2]! });
    } else if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      endParagraph();
      blocks.push({ kind: 'rule' });
    } else if (line.startsWith('> ')) {
      endParagraph();
      blocks.push({ kind: 'quote', line: line.slice(2) });
    } else if (item) {
      endParagraph();

      const ordered = /\d/.test(item[1]!);
      const items = [item[2]!];

      while (at + 1 < lines.length) {
        const next = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[at + 1]!);

        if (!next || /\d/.test(next[1]!) !== ordered) break;

        items.push(next[2]!);
        at += 1;
      }

      blocks.push({ kind: 'list', ordered, items });
    } else if (line.trim() === '') endParagraph();
    else paragraph.push(line);
  }

  endParagraph();

  return blocks;
}

/** What the person is being asked about before anything opens. */
const asking = new WeakMap<object, { link: string | null; open: boolean }>();

function drawSpans(spans: Span[], ask: (href: string) => void): TemplateResult[] {
  return spans.map(span => {
    if (span.href) {
      return html`<a
        href=${span.href}
        @click=${(event: MouseEvent) => {
          event.preventDefault();
          ask(span.href!);
        }}
        >${span.text}</a
      >`;
    }
    if (span.code) return html`<code>${span.text}</code>`;
    if (span.strong) return html`<strong>${span.text}</strong>`;
    if (span.emphasis) return html`<em>${span.text}</em>`;

    return html`${span.text}`;
  });
}

drawAs(
  'bry-markdown',
  element => {
    let state = asking.get(element);

    if (!state) {
      state = { link: null, open: element.expanded === true };
      asking.set(element, state);
    }

    const held = state;
    const text = str(element.text);
    const { shown, more } = held.open ? { shown: text, more: false } : cutMarkdown(text);
    const ask = (href: string) => {
      held.link = href;
      element.requestUpdate();
    };
    const spans = (line: string) => drawSpans(spansOf(line), ask);

    return html`<div class="markdown">
      ${blocksOf(shown).map(block => {
        switch (block.kind) {
          case 'heading':
            return block.level <= 2
              ? html`<h3 class="type-heading">${spans(block.line)}</h3>`
              : html`<h4 class="type-subheading">${spans(block.line)}</h4>`;
          case 'quote':
            return html`<blockquote>${spans(block.line)}</blockquote>`;
          case 'code':
            return html`<pre><code>${block.text}</code></pre>`;
          case 'rule':
            return html`<hr />`;
          case 'list':
            return block.ordered
              ? html`<ol>
                  ${block.items.map(item => html`<li>${spans(item)}</li>`)}
                </ol>`
              : html`<ul>
                  ${block.items.map(item => html`<li>${spans(item)}</li>`)}
                </ul>`;
          default:
            return html`<p class="type-body">${spans(block.line)}</p>`;
        }
      })}
      ${more
        ? html`<button
            type="button"
            class="more"
            @click=${() => {
              held.open = true;
              element.requestUpdate();
            }}
          >
            Show more
          </button>`
        : nothing}
      ${held.link
        ? html`<div class="strip" role="alert">
            <span class="where">
              <span class="host">Open ${hostOf(held.link)}?</span>
              <span class="url">${held.link}</span>
            </span>
            <button
              type="button"
              class="more"
              @click=${() => {
                held.link = null;
                element.requestUpdate();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              class="open"
              @click=${() => {
                const link = held.link!;

                held.link = null;
                element.requestUpdate();
                window.open(link, '_blank', 'noopener,noreferrer');
              }}
            >
              Open
            </button>
          </div>`
        : nothing}
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .markdown {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 0.5rem;
      }
      h3,
      h4,
      p,
      ul,
      ol,
      blockquote,
      pre {
        margin: 0;
      }
      ul,
      ol {
        padding-inline-start: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.875rem;
        line-height: 1.375rem;
        color: var(--fg-soft);
      }
      blockquote {
        border-inline-start: 2px solid var(--line);
        padding-inline-start: 0.75rem;
        color: var(--fg-muted);
      }
      code {
        border-radius: var(--radius-xs);
        background: var(--bg-fill);
        padding: 0.05rem 0.25rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.8125rem;
      }
      pre {
        overflow-x: auto;
        border-radius: var(--radius-lg);
        background: var(--bg-sunken);
        padding: 0.75rem;
      }
      pre code {
        background: none;
        padding: 0;
      }
      hr {
        border: 0;
        border-top: 1px solid var(--line);
        margin: 0;
      }
      a {
        color: var(--brand-fg);
        text-underline-offset: 2px;
      }
      .more,
      .open {
        align-self: flex-start;
        height: var(--control-h-sm);
        padding: 0 0.625rem;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--fg-soft);
        font: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
      }
      .more:hover {
        background: var(--layer-hover);
      }
      .open {
        background: var(--brand);
        color: var(--brand-on);
      }
      .strip {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: var(--bg-sunken);
        padding: 0.5rem 0.75rem;
      }
      .where {
        display: block;
        min-width: 0;
        flex: 1;
      }
      .host {
        display: block;
        font-size: 0.75rem;
        color: var(--fg-strong);
      }
      .url {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.6875rem;
        color: var(--fg-muted);
      }
    `,
  ],
);
