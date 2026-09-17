/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { str, TYPE } from './tokens.ts';

/**
 * Input, textarea, checkbox and switch, as Brydio's React catalogue draws them
 * (`packages/app/src/apps/catalogue/draw/{input,textarea,toggle,field}.tsx`).
 *
 * A control holds what the person typed or ticked, so nothing waits on the
 * app, and the app's `value` or `checked` wins only when it changes: an app
 * that clears a field after saving sends `""`, and the field clears.
 *
 * Inside a `bry-label`, a control is named by the label's text. A `<label for>`
 * can't point into another element's shadow root, so the name travels as
 * `aria-label`.
 */

type Element = HTMLElement & Record<string, unknown> & { emit(name: string, detail?: unknown): boolean };

/** What each control last heard from the app, and what the person has made of it since. */
const held = new WeakMap<object, { seen: unknown; draft: unknown }>();

function draftOf<T>(element: Element, sent: T): { draft: T; set: (next: T) => void } {
  let state = held.get(element);

  if (!state || state.seen !== sent) {
    state = { seen: sent, draft: sent };
    held.set(element, state);
  }

  const current = state;

  return { draft: current.draft as T, set: next => void (current.draft = next) };
}

/** The control's accessible name: its own `label`, or the `bry-label` around it. */
function nameOf(element: Element): string | undefined {
  const own = str(element.label);

  if (own) return own;

  const around = element.closest('bry-label') as (HTMLElement & { text?: unknown }) | null;

  return str(around?.text) || undefined;
}

const FIELD = css`
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
  .error {
    color: var(--danger-fg);
  }
  input[type='text'],
  input[type='email'],
  input[type='url'],
  input[type='search'],
  textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--line-input);
    border-radius: var(--field-radius);
    background: var(--bg-surface);
    padding: 0 var(--field-px);
    font: inherit;
    font-size: 0.8125rem;
    color: var(--fg);
    outline: none;
    transition:
      border-color var(--dur-fast) var(--ease-out),
      box-shadow var(--dur-fast) var(--ease-out);
  }
  input {
    height: var(--field-h);
  }
  textarea {
    min-height: 4rem;
    padding-block: 0.375rem;
    resize: vertical;
    field-sizing: content;
  }
  ::placeholder {
    color: var(--fg-placeholder);
  }
  ::selection {
    background: var(--brand);
    color: var(--brand-on);
  }
  input:focus-visible,
  textarea:focus-visible {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-ring);
  }
  input:disabled,
  textarea:disabled {
    pointer-events: none;
    cursor: not-allowed;
    background: var(--bg-fill);
    color: var(--fg-muted);
  }
  [aria-invalid='true'] {
    border-color: var(--danger) !important;
  }
  [aria-invalid='true']:focus-visible {
    box-shadow: 0 0 0 3px var(--danger-soft);
  }
`;

const error = (element: Element) => {
  const message = str(element.error);

  return message ? html`<p id="error" class="type-caption error">${message}</p>` : nothing;
};

const KINDS = ['text', 'email', 'url', 'search'] as const;

drawAs(
  'bry-input',
  element => {
    const { draft, set } = draftOf(element as Element, str(element.value));
    const invalid = Boolean(str(element.error));
    const kind = (KINDS as readonly unknown[]).includes(element.kind) ? (element.kind as string) : 'text';

    return html`<div class="field">
      <input
        type=${kind}
        .value=${draft}
        placeholder=${str(element.placeholder) || nothing}
        aria-label=${nameOf(element as Element) ?? nothing}
        maxlength=${typeof element.maxLength === 'number' ? element.maxLength : nothing}
        ?required=${element.required === true}
        ?disabled=${element.disabled === true}
        aria-invalid=${invalid ? 'true' : nothing}
        aria-describedby=${invalid ? 'error' : nothing}
        @input=${(event: Event) => {
          const value = (event.currentTarget as HTMLInputElement).value;

          set(value);
          element.emit('change', { value });
        }}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key !== 'Enter' || event.isComposing) return;
          event.preventDefault();
          element.emit('submit', { value: (event.currentTarget as HTMLInputElement).value });
        }}
      />
      ${error(element as Element)}
    </div>`;
  },
  [TYPE, FIELD],
);

drawAs(
  'bry-textarea',
  element => {
    const { draft, set } = draftOf(element as Element, str(element.value));
    const invalid = Boolean(str(element.error));

    return html`<div class="field">
      <textarea
        .value=${draft}
        placeholder=${str(element.placeholder) || nothing}
        aria-label=${nameOf(element as Element) ?? nothing}
        maxlength=${typeof element.maxLength === 'number' ? element.maxLength : nothing}
        ?required=${element.required === true}
        ?disabled=${element.disabled === true}
        aria-invalid=${invalid ? 'true' : nothing}
        aria-describedby=${invalid ? 'error' : nothing}
        @input=${(event: Event) => {
          const value = (event.currentTarget as HTMLTextAreaElement).value;

          set(value);
          element.emit('change', { value });
        }}
      ></textarea>
      ${error(element as Element)}
    </div>`;
  },
  [TYPE, FIELD],
);

const TOGGLE = css`
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  label {
    cursor: pointer;
  }
  .check {
    appearance: none;
    display: grid;
    place-content: center;
    margin: 0;
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    border: 1px solid var(--line-input);
    border-radius: var(--radius-xs);
    background: transparent;
    cursor: pointer;
    outline: none;
  }
  .check:checked {
    border-color: var(--primary);
    background: var(--primary);
  }
  .check:checked::after {
    content: '';
    width: 0.3rem;
    height: 0.55rem;
    margin-top: -0.1rem;
    border: solid var(--primary-foreground);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }
  .switch {
    display: inline-flex;
    align-items: center;
    width: 2rem;
    height: 1.15rem;
    flex-shrink: 0;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 9999px;
    background: var(--input);
    cursor: pointer;
    outline: none;
    transition: background-color var(--dur-fast);
  }
  .switch[aria-checked='true'] {
    background: var(--primary);
  }
  .thumb {
    display: block;
    width: 1rem;
    height: 1rem;
    border-radius: 9999px;
    background: var(--background);
    transition: transform var(--dur-fast);
  }
  .switch[aria-checked='true'] .thumb {
    transform: translateX(calc(100% - 2px));
  }
  :host(:dir(rtl)) .switch[aria-checked='true'] .thumb {
    transform: translateX(calc(-100% + 2px));
  }
  .check:focus-visible,
  .switch:focus-visible {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--brand-ring);
  }
  .check:disabled,
  .switch:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

drawAs(
  'bry-checkbox',
  element => {
    const { draft, set } = draftOf(element as Element, element.checked === true);
    const invalid = Boolean(str(element.error));

    return html`<div class="field">
      <div class="toggle">
        <input
          id="control"
          class="check"
          type="checkbox"
          .checked=${draft}
          ?disabled=${element.disabled === true}
          aria-invalid=${invalid ? 'true' : nothing}
          aria-describedby=${invalid ? 'error' : nothing}
          @change=${(event: Event) => {
            const checked = (event.currentTarget as HTMLInputElement).checked;

            set(checked);
            element.emit('change', { checked });
          }}
        />
        <label for="control" class="type-ui">${str(element.label)}</label>
      </div>
      ${error(element as Element)}
    </div>`;
  },
  [TYPE, FIELD, TOGGLE],
);

drawAs(
  'bry-switch',
  element => {
    const { draft, set } = draftOf(element as Element, element.checked === true);
    const invalid = Boolean(str(element.error));
    const flip = () => {
      if (element.disabled === true) return;

      set(!draft);
      element.emit('change', { checked: !draft });
      (element as unknown as { requestUpdate(): void }).requestUpdate();
    };

    return html`<div class="field">
      <div class="toggle">
        <button
          id="control"
          class="switch"
          type="button"
          role="switch"
          aria-checked=${draft ? 'true' : 'false'}
          aria-labelledby="name"
          ?disabled=${element.disabled === true}
          aria-invalid=${invalid ? 'true' : nothing}
          aria-describedby=${invalid ? 'error' : nothing}
          @click=${flip}
        >
          <span class="thumb"></span>
        </button>
        <label id="name" class="type-ui" @click=${flip}>${str(element.label)}</label>
      </div>
      ${error(element as Element)}
    </div>`;
  },
  [TYPE, FIELD, TOGGLE],
);
