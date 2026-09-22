/// <reference lib="dom" />
import { css, html, nothing } from '../base.ts';
import { drawAs } from '../define.ts';
import { draftOf, errorOf, FIELD_B, focusIn, keptOf, listOf, nameOf, QUIET, rtlOf, type El } from './catalogue-b-shared.ts';
import { nextActive } from './overlays.ts';
import { FOCUS, pick, str, TYPE } from './tokens.ts';

/**
 * ADR-A23 (catalogue-b): the controls, as Brydio's React catalogue draws them
 * on its kit (`packages/app/src/apps/catalogue/draw/*.tsx`): button group,
 * field, input group, one-time code, native select, radio group, slider,
 * toggle, toggle group, pagination and combobox.
 */

interface Choice {
  value: string;
  label: string;
  avatar?: string;
}

interface Toggle {
  value: string;
  label: string;
  icon?: string;
  hideLabel?: boolean;
  disabled?: boolean;
}

const invalidOf = (element: El) => Boolean(str(element.error));

drawAs(
  'bry-button-group',
  element => {
    const vertical = element.orientation === 'vertical';

    return html`<div role="group" aria-label=${str(element.label) || nothing} data-orientation=${vertical ? 'vertical' : 'horizontal'}>
      <slot></slot>
    </div>`;
  },
  [
    css`
      :host {
        display: inline-flex;
      }
      [role='group'] {
        display: inline-flex;
        align-items: stretch;
      }
      [data-orientation='vertical'] {
        flex-direction: column;
      }
    `,
  ],
);

drawAs(
  'bry-field',
  element => {
    const description = str(element.description);
    const horizontal = element.orientation === 'horizontal';

    return html`<div class="field ${horizontal ? 'horizontal' : 'vertical'}" data-invalid=${invalidOf(element as El) ? 'true' : nothing}>
      <span id="name" class="type-label">
        ${str(element.label)}${element.required === true ? html`<span class="required" aria-hidden="true">*</span>` : nothing}
      </span>
      <div class="control"><slot></slot></div>
      ${description ? html`<p id="description" class="type-caption">${description}</p>` : nothing}
      ${errorOf(element as El)}
    </div>`;
  },
  [
    TYPE,
    FIELD_B,
    css`
      .horizontal {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        column-gap: 0.75rem;
      }
      .horizontal #description,
      .horizontal .error {
        grid-column: 1 / -1;
      }
      .required {
        margin-inline-start: 0.125rem;
        color: var(--danger-fg);
      }
    `,
  ],
);

drawAs(
  'bry-input-group',
  element => {
    const { draft, set } = draftOf(element, 'value', str(element.value));
    const invalid = invalidOf(element as El);
    const kind = pick(['text', 'email', 'url', 'search'] as const, element.kind) ?? 'text';
    const action = str(element.action);
    const actionIcon = str(element.actionIcon);
    const icon = str(element.icon);

    return html`<div class="field">
      <div class="group box" role="group" aria-invalid=${invalid ? 'true' : nothing}>
        ${icon ? html`<span class="addon glyph" data-icon=${icon} aria-hidden="true"></span>` : nothing}
        ${str(element.prefix) ? html`<span class="addon type-ui">${str(element.prefix)}</span>` : nothing}
        <input
          type=${kind}
          .value=${draft}
          placeholder=${str(element.placeholder) || nothing}
          aria-label=${nameOf(element as El) ?? nothing}
          maxlength=${typeof element.maxLength === 'number' ? element.maxLength : nothing}
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
        ${str(element.suffix) ? html`<span class="addon type-ui">${str(element.suffix)}</span>` : nothing}
        ${action
          ? html`<button
              type="button"
              class="quiet action"
              data-icon=${actionIcon || nothing}
              aria-label=${actionIcon ? action : nothing}
              ?disabled=${element.disabled === true}
              @click=${() => element.emit('action', { value: draftOf(element, 'value', str(element.value)).draft })}
            >
              ${actionIcon ? html`<span class="glyph" aria-hidden="true"></span>` : action}
            </button>`
          : nothing}
      </div>
      ${errorOf(element as El)}
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    FIELD_B,
    QUIET,
    css`
      .group {
        display: flex;
        height: var(--field-h);
        align-items: center;
        gap: 0.25rem;
        padding-inline: var(--field-px) 0.25rem;
      }
      .group:focus-within {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-ring);
      }
      input {
        min-width: 0;
        flex: 1;
        height: 100%;
        border: 0;
        background: transparent;
        font: inherit;
        font-size: 0.8125rem;
        color: var(--fg);
        outline: none;
      }
      input:disabled {
        color: var(--fg-muted);
      }
      .addon {
        flex-shrink: 0;
        color: var(--fg-muted);
      }
      .glyph {
        display: inline-block;
        width: 1rem;
        height: 1rem;
        border-radius: var(--radius-xs);
        background: currentColor;
        opacity: 0.6;
      }
      .action {
        height: 1.5rem;
      }
    `,
  ],
);

drawAs(
  'bry-input-otp',
  element => {
    const length = typeof element.length === 'number' && element.length >= 4 && element.length <= 8 ? element.length : 6;
    const digits = element.pattern !== 'alphanumeric';
    const { draft, set } = draftOf(element, 'value', str(element.value).slice(0, length));
    const invalid = invalidOf(element as El);
    const boxes = Array.from({ length }, (_, at) => draft[at] ?? '');

    return html`<div class="field">
      <div class="otp">
        <input
          class="code"
          .value=${draft}
          inputmode=${digits ? 'numeric' : 'text'}
          autocomplete="one-time-code"
          maxlength=${length}
          aria-label=${nameOf(element as El) ?? nothing}
          ?disabled=${element.disabled === true}
          aria-invalid=${invalid ? 'true' : nothing}
          aria-describedby=${invalid ? 'error' : nothing}
          @input=${(event: Event) => {
            const input = event.currentTarget as HTMLInputElement;
            const value = input.value.replace(digits ? /\D/g : /[^a-z0-9]/gi, '').slice(0, length);

            input.value = value;
            set(value);
            element.emit('change', { value });
            if (value.length === length) element.emit('complete', { value });
            element.requestUpdate();
          }}
        />
        <div class="boxes" aria-hidden="true">
          ${boxes.map((char, at) => html`<span class="slot box" data-active=${at === Math.min(draft.length, length - 1) ? '' : nothing}>${char}</span>`)}
        </div>
      </div>
      ${errorOf(element as El)}
    </div>`;
  },
  [
    TYPE,
    FIELD_B,
    css`
      .otp {
        position: relative;
        display: inline-flex;
      }
      .code {
        position: absolute;
        inset: 0;
        z-index: 1;
        width: 100%;
        border: 0;
        background: transparent;
        color: transparent;
        caret-color: transparent;
        font: inherit;
        letter-spacing: 2.25rem;
        outline: none;
      }
      .boxes {
        display: flex;
        gap: 0.5rem;
      }
      .slot {
        display: flex;
        width: 2.25rem;
        height: var(--field-h);
        align-items: center;
        justify-content: center;
      }
      .code:focus-visible + .boxes [data-active] {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-ring);
      }
      .code:disabled + .boxes {
        opacity: 0.5;
      }
    `,
  ],
);

drawAs(
  'bry-native-select',
  element => {
    const options = listOf<Choice>(element.options);
    const value = str(element.value);
    const shown = options.some(choice => choice.value === value) ? value : '';
    const invalid = invalidOf(element as El);

    return html`<div class="field">
      <div class="wrap">
        <select
          class="box ${element.size === 'sm' ? 'sm' : 'md'}"
          .value=${shown}
          aria-label=${nameOf(element as El) ?? nothing}
          ?disabled=${element.disabled === true}
          aria-invalid=${invalid ? 'true' : nothing}
          aria-describedby=${invalid ? 'error' : nothing}
          @change=${(event: Event) => {
            const next = (event.currentTarget as HTMLSelectElement).value;
            const select = event.currentTarget as HTMLSelectElement;

            // What is shown stays the app's until it sends a new value.
            select.value = shown;
            if (next !== shown) element.emit('change', { value: next });
          }}
        >
          ${!shown ? html`<option value="" disabled ?selected=${!shown}>${str(element.placeholder)}</option>` : nothing}
          ${options.map(choice => html`<option value=${choice.value} ?selected=${choice.value === shown}>${choice.label}</option>`)}
        </select>
        <span class="chevron" aria-hidden="true"></span>
      </div>
      ${errorOf(element as El)}
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    FIELD_B,
    css`
      .wrap {
        position: relative;
      }
      select {
        width: 100%;
        appearance: none;
        padding-inline: var(--field-px) 2rem;
      }
      .md {
        height: var(--field-h);
      }
      .sm {
        height: var(--control-h-sm);
      }
      select:disabled {
        background: var(--bg-fill);
        color: var(--fg-muted);
      }
      .chevron {
        position: absolute;
        top: 50%;
        inset-inline-end: 0.75rem;
        width: 0.5rem;
        height: 0.5rem;
        border: solid var(--fg-muted);
        border-width: 0 1.5px 1.5px 0;
        transform: translateY(-70%) rotate(45deg);
        pointer-events: none;
      }
    `,
  ],
);

let groups = 0;

drawAs(
  'bry-radio-group',
  element => {
    const options = listOf<Choice>(element.options);
    const { draft, set } = draftOf(element, 'value', str(element.value));
    const invalid = invalidOf(element as El);
    const name = keptOf(element, () => ({ name: `bry-radio-${(groups += 1)}` })).name;

    return html`<div class="field">
      <div
        role="radiogroup"
        class=${element.orientation === 'horizontal' ? 'horizontal' : 'vertical'}
        aria-label=${nameOf(element as El) ?? nothing}
        aria-invalid=${invalid ? 'true' : nothing}
        aria-describedby=${invalid ? 'error' : nothing}
        aria-disabled=${element.disabled === true ? 'true' : nothing}
      >
        ${options.map(
          choice => html`<label class="choice type-ui">
            <input
              type="radio"
              name=${name}
              value=${choice.value}
              .checked=${choice.value === draft}
              ?disabled=${element.disabled === true}
              @change=${() => {
                set(choice.value);
                element.emit('change', { value: choice.value });
              }}
            />
            ${choice.label}
          </label>`,
        )}
      </div>
      ${errorOf(element as El)}
    </div>`;
  },
  [
    TYPE,
    FIELD_B,
    css`
      [role='radiogroup'] {
        display: flex;
        gap: 0.75rem;
      }
      .vertical {
        flex-direction: column;
      }
      .horizontal {
        flex-wrap: wrap;
      }
      .choice {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
      }
      input {
        margin: 0;
        width: 1rem;
        height: 1rem;
        accent-color: var(--brand);
      }
      input:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px var(--brand-ring);
        border-radius: 9999px;
      }
    `,
  ],
);

drawAs(
  'bry-slider',
  element => {
    const min = typeof element.min === 'number' ? element.min : 0;
    const max = typeof element.max === 'number' ? element.max : 100;
    const step = typeof element.step === 'number' ? element.step : 1;
    const { draft, set } = draftOf(element, 'value', typeof element.value === 'number' ? element.value : min);
    const invalid = invalidOf(element as El);

    return html`<div class="field">
      <input
        type="range"
        min=${min}
        max=${max}
        step=${step}
        .value=${String(draft)}
        aria-label=${nameOf(element as El) ?? nothing}
        ?disabled=${element.disabled === true}
        aria-invalid=${invalid ? 'true' : nothing}
        aria-describedby=${invalid ? 'error' : nothing}
        @input=${(event: Event) => {
          const value = Number((event.currentTarget as HTMLInputElement).value);

          set(value);
          element.emit('change', { value });
        }}
        @change=${(event: Event) => element.emit('commit', { value: Number((event.currentTarget as HTMLInputElement).value) })}
      />
      ${errorOf(element as El)}
    </div>`;
  },
  [
    TYPE,
    FIELD_B,
    css`
      input {
        width: 100%;
        margin: 0;
        accent-color: var(--brand);
      }
      input:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px var(--brand-ring);
        border-radius: 9999px;
      }
      input:disabled {
        opacity: 0.5;
      }
    `,
  ],
);

const TOGGLE_LOOK = css`
  .outline {
    border-color: var(--line-input);
  }
  .sm {
    height: var(--control-h-sm);
    min-width: var(--control-h-sm);
  }
  .glyph {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border-radius: var(--radius-xs);
    background: currentColor;
    opacity: 0.6;
  }
`;

drawAs(
  'bry-toggle',
  element => {
    const { draft, set } = draftOf(element, 'pressed', element.pressed === true);
    const label = str(element.label);
    const iconOnly = Boolean(str(element.icon)) && element.hideLabel === true;

    return html`<button
      type="button"
      class="quiet ${element.variant === 'outline' ? 'outline' : ''} ${element.size === 'sm' ? 'sm' : ''}"
      aria-pressed=${draft ? 'true' : 'false'}
      aria-label=${iconOnly ? label : nothing}
      title=${iconOnly ? label : nothing}
      data-icon=${str(element.icon) || nothing}
      ?disabled=${element.disabled === true}
      @click=${() => {
        set(!draft);
        element.emit('change', { pressed: !draft });
        element.requestUpdate();
      }}
    >
      ${str(element.icon) ? html`<span class="glyph" aria-hidden="true"></span>` : nothing}${iconOnly ? nothing : label}
    </button>`;
  },
  [FOCUS, FIELD_B, QUIET, TOGGLE_LOOK, css`:host { display: inline-flex; }`],
);

drawAs(
  'bry-toggle-group',
  element => {
    const items = listOf<Toggle>(element.items);
    const single = element.type !== 'multiple';
    const { draft, set } = draftOf(element, 'values', listOf<string>(element.values));
    const state = keptOf(element, () => ({ focus: -1 }));
    const usable = items.map((item, at) => (item.disabled === true || element.disabled === true ? -1 : at)).filter(at => at >= 0);
    // One toggle in the tab order: the one last reached, else the first pressed, else the first.
    const stop = usable.includes(state.focus) ? state.focus : (usable.find(at => draft.includes(items[at]!.value)) ?? usable[0] ?? -1);
    const press = (item: Toggle) => {
      const on = draft.includes(item.value);
      const values = single ? (on ? [] : [item.value]) : on ? draft.filter(value => value !== item.value) : [...draft, item.value];

      set(values);
      element.emit('change', { values });
      element.requestUpdate();
    };

    return html`<div
      role="group"
      aria-label=${str(element.label) || nothing}
      @keydown=${(event: KeyboardEvent) => {
        const rtl = rtlOf(element);
        const by = { ArrowRight: rtl ? -1 : 1, ArrowDown: 1, ArrowLeft: rtl ? 1 : -1, ArrowUp: -1 }[event.key];
        const at = usable.indexOf(stop);

        if (event.key === 'Home' || event.key === 'End') state.focus = event.key === 'Home' ? usable[0]! : usable[usable.length - 1]!;
        else if (by !== undefined && at !== -1) state.focus = usable[(at + by + usable.length) % usable.length]!;
        else return;

        event.preventDefault();
        element.requestUpdate();
        focusIn(element as El, `[data-value="${CSS.escape(items[state.focus]!.value)}"]`);
      }}
    >
      ${items.map((item, at) => {
        const on = draft.includes(item.value);
        const iconOnly = Boolean(item.icon) && item.hideLabel === true;

        return html`<button
          type="button"
          class="quiet ${element.variant === 'outline' ? 'outline' : ''} ${element.size === 'sm' ? 'sm' : ''}"
          data-value=${item.value}
          tabindex=${at === stop ? '0' : '-1'}
          aria-pressed=${on ? 'true' : 'false'}
          aria-label=${iconOnly ? item.label : nothing}
          ?disabled=${item.disabled === true || element.disabled === true}
          @focus=${() => void (state.focus = at)}
          @click=${() => press(item)}
        >
          ${item.icon ? html`<span class="glyph" aria-hidden="true"></span>` : nothing}${iconOnly ? nothing : item.label}
        </button>`;
      })}
    </div>`;
  },
  [
    FOCUS,
    FIELD_B,
    QUIET,
    TOGGLE_LOOK,
    css`
      :host {
        display: inline-flex;
      }
      [role='group'] {
        display: inline-flex;
        gap: 0.25rem;
      }
    `,
  ],
);

/** The page numbers a pagination shows: the ends, this page and its neighbours, and gaps between. */
export function pagesAround(page: number, count: number): (number | 'gap')[] {
  const wanted = new Set([1, count, page - 1, page, page + 1].filter(at => at >= 1 && at <= count));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];

  for (const at of sorted) {
    const last = out[out.length - 1];

    if (typeof last === 'number' && at - last > 1) out.push('gap');
    out.push(at);
  }

  return out;
}

drawAs(
  'bry-pagination',
  element => {
    const count = typeof element.count === 'number' && element.count >= 1 ? element.count : 1;
    const page = typeof element.page === 'number' ? Math.min(Math.max(1, element.page), count) : 1;
    const off = element.disabled === true;
    const go = (to: number) => element.emit('page', { page: to });

    return html`<nav aria-label=${str(element.label) || 'Pages'}>
      <ul>
        <li><button type="button" class="quiet" ?disabled=${off || page <= 1} @click=${() => go(page - 1)}>Previous</button></li>
        ${pagesAround(page, count).map(at =>
          at === 'gap'
            ? html`<li><span class="gap" aria-hidden="true">…</span></li>`
            : html`<li>
                <button
                  type="button"
                  class="quiet"
                  data-page=${at}
                  aria-current=${at === page ? 'page' : nothing}
                  ?disabled=${off}
                  @click=${() => at !== page && go(at)}
                >
                  ${at}
                </button>
              </li>`,
        )}
        <li><button type="button" class="quiet" ?disabled=${off || page >= count} @click=${() => go(page + 1)}>Next</button></li>
      </ul>
    </nav>`;
  },
  [
    FOCUS,
    FIELD_B,
    QUIET,
    css`
      ul {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.25rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .gap {
        display: inline-flex;
        width: var(--control-h);
        justify-content: center;
        color: var(--fg-muted);
      }
    `,
  ],
);

drawAs(
  'bry-combobox',
  element => {
    const options = listOf<Choice>(element.options);
    const value = str(element.value);
    const shown = options.find(choice => choice.value === value);
    const invalid = invalidOf(element as El);
    const state = keptOf(element, () => ({ open: false, query: '', active: 0 }));
    const matching = options.filter(choice => choice.label.toLowerCase().includes(state.query.toLowerCase()));
    const shut = () => {
      state.open = false;
      state.query = '';
      element.requestUpdate();
      focusIn(element as El, '[role=combobox]');
    };
    const choose = (choice: Choice | undefined) => {
      if (!choice) return;
      if (choice.value !== (shown?.value ?? '')) element.emit('change', { value: choice.value });
      shut();
    };
    const open = () => {
      if (element.disabled === true) return;

      state.open = true;
      state.active = Math.max(0, options.findIndex(choice => choice.value === shown?.value));
      element.requestUpdate();
      focusIn(element as El, 'input');
    };

    return html`<div class="field">
      <div class="anchor">
        <button
          type="button"
          role="combobox"
          class="box ${element.size === 'sm' ? 'sm' : 'md'}"
          aria-haspopup="listbox"
          aria-expanded=${state.open ? 'true' : 'false'}
          aria-label=${nameOf(element as El) ?? nothing}
          aria-invalid=${invalid ? 'true' : nothing}
          aria-describedby=${invalid ? 'error' : nothing}
          ?disabled=${element.disabled === true}
          @click=${() => (state.open ? shut() : open())}
          @keydown=${(event: KeyboardEvent) => {
            if (state.open || (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            open();
          }}
        >
          <span class=${shown ? 'value' : 'placeholder'}>${shown ? shown.label : str(element.placeholder)}</span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
        ${state.open
          ? html`<div
              class="popup"
              @focusout=${(event: FocusEvent) => {
                if (state.open && !element.shadowRoot?.contains(event.relatedTarget as Node)) {
                  state.open = false;
                  state.query = '';
                  element.requestUpdate();
                }
              }}
            >
              <input
                class="search"
                type="text"
                role="searchbox"
                .value=${state.query}
                placeholder=${str(element.search) || 'Search'}
                aria-label=${str(element.search) || 'Search'}
                aria-controls="choices"
                aria-activedescendant=${matching[state.active] ? `choice-${state.active}` : nothing}
                @input=${(event: Event) => {
                  state.query = (event.currentTarget as HTMLInputElement).value;
                  state.active = 0;
                  element.requestUpdate();
                }}
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key === ' ') return;

                  const answer = nextActive(event.key, matching, state.active, '');

                  if (answer === null) return;

                  event.preventDefault();
                  if (answer === 'close') return shut();
                  if (answer === 'choose') return choose(matching[state.active]);

                  state.active = answer.active;
                  element.requestUpdate();
                }}
              />
              <div id="choices" role="listbox" aria-label=${nameOf(element as El) ?? nothing}>
                ${matching.length === 0
                  ? html`<p class="empty type-ui" data-empty>${str(element.empty) || 'No results.'}</p>`
                  : matching.map(
                      (choice, at) => html`<div
                        id="choice-${at}"
                        role="option"
                        data-value=${choice.value}
                        data-active=${at === state.active ? '' : nothing}
                        aria-selected=${choice.value === shown?.value ? 'true' : 'false'}
                        @mousedown=${(event: Event) => event.preventDefault()}
                        @click=${() => choose(choice)}
                      >
                        ${choice.label}
                      </div>`,
                    )}
              </div>
            </div>`
          : nothing}
      </div>
      ${errorOf(element as El)}
    </div>`;
  },
  [
    TYPE,
    FOCUS,
    FIELD_B,
    css`
      .anchor {
        position: relative;
      }
      [role='combobox'] {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0 var(--field-px);
        cursor: pointer;
      }
      .md {
        height: var(--field-h);
      }
      .sm {
        height: var(--control-h-sm);
      }
      [role='combobox']:disabled {
        pointer-events: none;
        background: var(--bg-fill);
        color: var(--fg-muted);
      }
      .placeholder {
        color: var(--fg-placeholder);
      }
      .chevron {
        width: 0.5rem;
        height: 0.5rem;
        border: solid var(--fg-muted);
        border-width: 0 1.5px 1.5px 0;
        transform: translateY(-2px) rotate(45deg);
      }
      .popup {
        position: absolute;
        z-index: 50;
        inset-inline: 0;
        margin-top: 0.25rem;
        border: 1px solid var(--line);
        border-radius: var(--menu-radius);
        background: var(--popover);
        color: var(--popover-foreground);
        box-shadow: var(--shadow-pop);
      }
      .search {
        width: 100%;
        height: 2.25rem;
        border: 0;
        border-bottom: 1px solid var(--line);
        background: transparent;
        padding: 0 0.75rem;
        font: inherit;
        font-size: 0.8125rem;
        color: var(--fg);
        outline: none;
      }
      [role='listbox'] {
        max-height: 18rem;
        overflow-y: auto;
        padding: 0.25rem;
      }
      [role='option'] {
        border-radius: var(--menu-item-radius);
        padding: 0.375rem 0.5rem;
        font-size: 0.8125rem;
        cursor: pointer;
      }
      [role='option'][data-active] {
        background: var(--layer-hover);
      }
      .empty {
        padding: 1.5rem 0;
        text-align: center;
      }
    `,
  ],
);
