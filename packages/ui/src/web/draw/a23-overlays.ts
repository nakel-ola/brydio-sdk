/// <reference lib="dom" />
import { css, html, nothing, type TemplateResult } from '../base.ts';
import { drawAs } from '../define.ts';
import { dialogSlot, ONE_DIALOG } from './overlays.ts';
import { FOCUS, str, TYPE } from './tokens.ts';

/**
 * ADR-A23 (catalogue-a): the shadcn overlays. The modals (an alert dialog, a
 * drawer, a sheet) share `bry-dialog`'s one slot and its rules: shown while
 * the app says `open`, closed by the person whatever the app declared, and a
 * second asking to open stays shut and says why. The anchored ones (a
 * popover, a hover card, a tooltip) open from their first child.
 */

type Element = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean; requestUpdate(): void };

/** What each modal has been told and what the person has done with it since. */
const modals = new WeakMap<object, { seen: boolean; dismissed: boolean }>();

/**
 * A modal's drawing, or nothing while it isn't shown. `body` gets the
 * function that dismisses it; the `<dialog>` it returns is shown as a modal
 * once it is on the page.
 */
function modal(element: Element, body: (dismiss: () => void) => TemplateResult): TemplateResult | typeof nothing {
  const wanted = element.open === true;
  let state = modals.get(element);

  if (!state) {
    state = { seen: wanted, dismissed: false };
    modals.set(element, state);
  }
  if (state.seen !== wanted) {
    state.seen = wanted;
    if (!wanted) {
      state.dismissed = false;
      dialogSlot.release(element);
    }
  }

  const asking = wanted && !state.dismissed;

  if (!asking) return nothing;
  if (!dialogSlot.claim(element)) {
    // Asked once per opening: a refused modal waits for the app to ask again.
    state.dismissed = true;
    queueMicrotask(() => element.emit('close', { refused: ONE_DIALOG }));

    return nothing;
  }

  const current = state;
  const dismiss = () => {
    if (current.dismissed) return;
    current.dismissed = true;
    dialogSlot.release(element);
    element.emit('close');
    element.requestUpdate();
  };

  queueMicrotask(() => {
    const dialog = element.shadowRoot?.querySelector('dialog');

    if (dialog && dialog.isConnected && !dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
  });

  return body(dismiss);
}

const MODAL = css`
  :host {
    display: contents;
  }
  dialog {
    padding: 0;
    border: 1px solid var(--line);
    background: var(--popover);
    color: var(--popover-foreground);
    box-shadow: var(--shadow-modal);
  }
  dialog::backdrop {
    background: var(--bg-overlay);
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .unseen {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  button {
    height: var(--control-h);
    padding: 0 0.75rem;
    border: 0;
    border-radius: var(--radius-lg);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
  }
  .ghost {
    background: transparent;
    color: var(--fg-soft);
  }
  .ghost:hover {
    background: var(--layer-hover);
  }
  .primary {
    background: var(--brand);
    color: var(--brand-on);
  }
  .danger {
    background: var(--danger);
    color: var(--fg-on-solid);
  }
  .close {
    position: absolute;
    top: 0.75rem;
    inset-inline-end: 0.75rem;
    width: var(--control-h-sm);
    height: var(--control-h-sm);
    padding: 0;
    background: transparent;
    color: var(--fg-muted);
  }
  .close:hover {
    background: var(--layer-hover);
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
`;

const heading = (element: Element) => {
  const title = str(element.title);
  const description = str(element.description);

  return html`<div class="head">
    <h2 id="title" class="type-heading">${title}</h2>
    <p id="description" class="type-body ${description ? '' : 'unseen'}">${description || title}</p>
  </div>`;
};

drawAs(
  'bry-alert-dialog',
  element =>
    modal(
      element,
      dismiss => html`<dialog
        role="alertdialog"
        aria-labelledby="title"
        aria-describedby="description"
        @cancel=${(event: Event) => {
          event.preventDefault();
          dismiss();
        }}
      >
        <div class="panel">
          ${heading(element)}
          <div class="foot">
            <button type="button" class="ghost" data-action="cancel" autofocus @click=${dismiss}>${str(element.cancel) || 'Cancel'}</button>
            <button
              type="button"
              class=${element.tone === 'danger' ? 'danger' : 'primary'}
              data-action="action"
              @click=${() => element.emit('action')}
            >
              ${str(element.action)}
            </button>
          </div>
        </div>
      </dialog>`,
    ),
  [
    TYPE,
    FOCUS,
    MODAL,
    css`
      dialog {
        margin: auto;
        max-width: min(32rem, calc(100vw - 2rem));
        border-radius: var(--radius-xl);
      }
      .panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.5rem;
      }
      .foot {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
    `,
  ],
);

/** A press on a modal's backdrop: the event lands on the `<dialog>` itself. */
const onBackdrop = (dismiss: () => void) => (event: MouseEvent) => {
  if (event.composedPath()[0] === event.currentTarget) dismiss();
};

drawAs(
  'bry-drawer',
  element =>
    modal(
      element,
      dismiss => html`<dialog
        aria-labelledby="title"
        aria-describedby="description"
        @cancel=${(event: Event) => {
          event.preventDefault();
          dismiss();
        }}
        @click=${onBackdrop(dismiss)}
      >
        <div class="grip" aria-hidden="true"></div>
        <div class="panel">
          ${heading(element)}
          <div class="content"><slot></slot></div>
        </div>
      </dialog>`,
    ),
  [
    TYPE,
    FOCUS,
    MODAL,
    css`
      dialog {
        width: 100%;
        max-width: 100%;
        max-height: 80vh;
        margin: auto 0 0;
        border-width: 1px 0 0;
        border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
      }
      .grip {
        width: 3rem;
        height: 0.375rem;
        margin: 0.75rem auto 0;
        border-radius: 9999px;
        background: var(--bg-fill);
      }
      .panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1rem 1rem 1.5rem;
      }
      .head {
        text-align: center;
      }
    `,
  ],
);

drawAs(
  'bry-sheet',
  element => {
    element.toggleAttribute('data-start', element.side === 'start');

    return modal(
      element,
      dismiss => html`<dialog
        aria-labelledby="title"
        aria-describedby="description"
        @cancel=${(event: Event) => {
          event.preventDefault();
          dismiss();
        }}
        @click=${onBackdrop(dismiss)}
      >
        <div class="panel">
          ${heading(element)}
          <div class="content"><slot></slot></div>
        </div>
        <button type="button" class="close" aria-label="Close" @click=${dismiss}>✕</button>
      </dialog>`,
    );
  },
  [
    TYPE,
    FOCUS,
    MODAL,
    css`
      dialog {
        width: min(24rem, 75vw);
        max-width: none;
        height: 100%;
        max-height: none;
        margin: 0 0 0 auto;
        border-width: 0 0 0 1px;
      }
      :host(:dir(rtl)) dialog,
      :host([data-start]) dialog {
        margin: 0 auto 0 0;
        border-width: 0 1px 0 0;
      }
      :host([data-start]:dir(rtl)) dialog {
        margin: 0 0 0 auto;
        border-width: 0 0 0 1px;
      }
      .panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.5rem 1rem;
      }
    `,
  ],
);

/** Whether each anchored overlay is open, and its timer. */
const anchored = new WeakMap<object, { open: boolean; seen: boolean; timer?: ReturnType<typeof setTimeout> }>();

function openState(element: Element) {
  const wanted = element.open === true;
  let state = anchored.get(element);

  if (!state) {
    state = { open: wanted, seen: wanted };
    anchored.set(element, state);
  }
  if (state.seen !== wanted) {
    state.seen = wanted;
    state.open = wanted;
  }

  const current = state;
  const set = (open: boolean, tell = true) => {
    clearTimeout(current.timer);
    if (current.open === open) return;
    current.open = open;
    if (tell) element.emit(open ? 'open' : 'close');
    element.requestUpdate();
  };
  const later = (open: boolean, ms: number, tell = true) => {
    clearTimeout(current.timer);
    current.timer = setTimeout(() => set(open, tell), ms);
  };

  return { state: current, set, later };
}

/** The first child is the anchor; the rest go in the default slot. */
function slotAnchor(element: Element): void {
  Array.from(element.children).forEach((child, index) => {
    if (index === 0) child.setAttribute('slot', 'anchor');
    else child.removeAttribute('slot');
  });
}

const FLOAT = css`
  :host {
    position: relative;
    display: inline-flex;
    min-width: 0;
  }
  .anchor {
    display: inline-flex;
    min-width: 0;
  }
  .float {
    position: absolute;
    z-index: 50;
    inset-inline-start: 0;
    top: 100%;
    margin-top: 0.25rem;
    border: 1px solid var(--line);
    border-radius: var(--menu-radius);
    background: var(--popover);
    color: var(--popover-foreground);
    box-shadow: var(--shadow-pop);
  }
  .float[data-side='top'] {
    top: auto;
    bottom: 100%;
    margin: 0 0 0.25rem;
  }
`;

drawAs(
  'bry-popover',
  element => {
    const { state, set } = openState(element);
    const title = str(element.title);

    slotAnchor(element);

    return html`<span
        class="anchor"
        aria-haspopup="dialog"
        aria-expanded=${state.open ? 'true' : 'false'}
        @click=${() => set(!state.open)}
      >
        <slot name="anchor"></slot>
      </span>
      <div
        class="float panel"
        role="dialog"
        aria-label=${title || nothing}
        data-side=${element.side === 'top' ? 'top' : 'bottom'}
        ?hidden=${!state.open}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key !== 'Escape') return;
          set(false);
          (element.querySelector('button, [tabindex]') as HTMLElement | null)?.focus();
        }}
      >
        ${title ? html`<p class="type-label">${title}</p>` : nothing}
        <slot></slot>
      </div>`;
  },
  [
    TYPE,
    FLOAT,
    css`
      .panel {
        display: flex;
        width: 18rem;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
      }
      [hidden] {
        display: none;
      }
    `,
  ],
);

drawAs(
  'bry-hover-card',
  element => {
    const { state, later } = openState(element);

    slotAnchor(element);

    return html`<span
        class="anchor"
        @mouseenter=${() => later(true, 300)}
        @mouseleave=${() => later(false, 150)}
        @focusin=${() => later(true, 300)}
        @focusout=${() => later(false, 150)}
      >
        <slot name="anchor"></slot>
      </span>
      <div class="float panel" data-side=${element.side === 'top' ? 'top' : 'bottom'} ?hidden=${!state.open}><slot></slot></div>`;
  },
  [
    FLOAT,
    css`
      .panel {
        display: flex;
        width: 16rem;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1rem;
      }
      [hidden] {
        display: none;
      }
    `,
  ],
);

drawAs(
  'bry-tooltip',
  element => {
    const { state, later, set } = openState(element);

    slotAnchor(element);

    // A tooltip raises nothing: whether it is seen is nobody's business.
    return html`<span
        class="anchor"
        aria-describedby="tip"
        @mouseenter=${() => later(true, 400, false)}
        @mouseleave=${() => set(false, false)}
        @focusin=${() => later(true, 400, false)}
        @focusout=${() => set(false, false)}
        @keydown=${(event: KeyboardEvent) => event.key === 'Escape' && set(false, false)}
      >
        <slot name="anchor"></slot>
      </span>
      <span id="tip" role="tooltip" class="tip" data-side=${element.side === 'bottom' ? 'bottom' : 'top'} ?hidden=${!state.open}>${str(element.text)}</span>`;
  },
  [
    css`
      :host {
        position: relative;
        display: inline-flex;
        min-width: 0;
      }
      .anchor {
        display: inline-flex;
        min-width: 0;
      }
      .tip {
        position: absolute;
        z-index: 50;
        bottom: 100%;
        inset-inline-start: 50%;
        translate: -50% 0;
        margin-bottom: 0.25rem;
        padding: 0.375rem 0.75rem;
        border-radius: var(--radius-md);
        background: var(--fg);
        color: var(--bg-canvas);
        font-size: 0.75rem;
        white-space: nowrap;
      }
      .tip[data-side='bottom'] {
        top: 100%;
        bottom: auto;
        margin: 0.25rem 0 0;
      }
      [hidden] {
        display: none;
      }
    `,
  ],
);
