/// <reference lib="dom" />
import { css, html, nothing, type TemplateResult } from '../base.ts';
import { BUTTON_ICONS, ENTITY_STATUSES, MARKS, PRIORITIES, STATE_GROUPS } from '../../catalogue.ts';
import { drawAs, settingOf } from '../define.ts';
import { keptOf, type El } from './catalogue-b-shared.ts';
import {
  closeOnLeave,
  face,
  faces,
  focusActive,
  fullTime,
  GROUP_LABEL,
  icon,
  isPastDay,
  labelTag,
  localeOf,
  optionMark,
  PLAN,
  popOf,
  popupKeys,
  pressedItself,
  pressKey,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  priorityMark,
  quickAddLine,
  records,
  ring,
  rowMenu,
  shortDate,
  stateMark,
  strings,
  TONE_DOT,
  TONE_INK,
  TONE_NAMES,
  TONE_TAG,
  timeAgo,
  type Pop,
  type StateGroup,
  type Tone,
} from './plan-shared.ts';
import { FOCUS, pick, str, TYPE } from './tokens.ts';

/**
 * Plan fidelity: the planning elements, as Brydio's React catalogue draws
 * them (`packages/app/src/apps/catalogue/draw/{glyph,property,quick-add,
 * work-card,page-header,entity-row,filter-menu}.tsx`). Each raises the same
 * events with the same details; a picker Brydio draws with the kit's command
 * list is a popup list here, with the same keyboard as `bry-menu`'s.
 */

const as = (element: unknown) => element as El;

// ---------------------------------------------------------------------------

drawAs(
  'bry-glyph',
  element => {
    const tone = pick(TONE_NAMES, element.tone);
    const size = element.size === 'md' ? 'md' : 'sm';
    const label = str(element.label);
    const mark =
      element.kind === 'priority'
        ? priorityMark(pick(PRIORITIES, element.priority) ?? 'none', tone, size)
        : stateMark(pick(STATE_GROUPS, element.group) ?? 'unstarted', tone, size);

    // With a label it is a picture a screen reader names; without, decoration.
    return html`<span class="glyph" role=${label ? 'img' : nothing} aria-label=${label || nothing} aria-hidden=${label ? nothing : 'true'}>${mark}</span>`;
  },
  [
    css`
      :host {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
      }
      .glyph {
        display: inline-flex;
        align-items: center;
      }
    `,
  ],
);

// ---------------------------------------------------------------------------

interface Option {
  value: string;
  label: string;
  tone?: Tone;
  group?: StateGroup;
  mark?: string;
}

const optionsOf = (value: unknown): Option[] =>
  records(value).map(option => ({
    value: str(option.value),
    label: str(option.label),
    tone: pick(TONE_NAMES, option.tone),
    group: pick(STATE_GROUPS, option.group),
    mark: pick(MARKS, option.mark),
  }));

const DISPLAYS = ['badge', 'icon', 'dot', 'pill', 'button'] as const;

/** One row of a property's picker. `kind` says whether it chooses one or ticks many. */
interface PickRow {
  key: string;
  label: string;
  heading?: string;
  lead?: unknown;
  chosen?: boolean;
  multi?: boolean;
  danger?: boolean;
  act: () => void;
}

drawAs(
  'bry-property',
  element => {
    const host = as(element);
    const pop = popOf(host, 'picker');
    const kind = str(element.kind);
    const display = pick(DISPLAYS, element.display) ?? (kind === 'priority' ? 'icon' : 'badge');
    const label = str(element.label);
    const placeholder = str(element.placeholder);
    const options = optionsOf(element.options);
    const value = str(element.value);
    const values = strings(element.values);
    const max = typeof element.max === 'number' ? element.max : kind === 'labels' ? 2 : 3;
    const disabled = element.disabled === true;
    const clearable = element.clearable === true;

    const close = (refocus = true) => {
      pop.open = false;
      pop.active = -1;
      pop.query = '';
      host.requestUpdate();
      if (refocus) queueMicrotask(() => (host.shadowRoot?.querySelector('.chip') as HTMLElement | null)?.focus());
    };
    const change = (detail: { value: string } | { values: string[] }) => host.emit('change', detail);
    const choose = (next: string) => {
      close();
      if (next !== value) change({ value: next });
    };
    const toggle = (one: string) => change({ values: values.includes(one) ? values.filter(v => v !== one) : [...values, one] });

    let face_: TemplateResult;
    let said: string;
    let muted = false;
    let rows: PickRow[] = [];

    if (kind === 'state') {
      const chosen = options.find(option => option.value === value);

      said = chosen?.label ?? (placeholder || 'No state');
      muted = !chosen;
      face_ =
        display === 'dot'
          ? html`<span class="dot lg" style="background: ${chosen ? TONE_DOT[chosen.tone ?? 'neutral'] : 'var(--line-strong)'}"></span><span class="said wide">${said}</span>`
          : html`${chosen?.mark ? optionMark(chosen.mark, chosen.tone) : stateMark(chosen?.group ?? 'unstarted', chosen?.tone)}${display === 'icon'
              ? nothing
              : html`<span class="said ${display === 'pill' ? 'strong' : ''}">${said}</span>`}`;

      for (const group of STATE_GROUPS) {
        const inGroup = options.filter(option => (option.group ?? 'unstarted') === group);

        inGroup.forEach((option, index) =>
          rows.push({
            key: option.value,
            label: option.label,
            heading: index === 0 ? GROUP_LABEL[group] : undefined,
            lead: option.mark ? optionMark(option.mark, option.tone) : stateMark(group, option.tone),
            chosen: option.value === value,
            act: () => choose(option.value),
          }),
        );
      }
    } else if (kind === 'priority') {
      const chosen = pick(PRIORITIES, value) ?? 'none';

      said = PRIORITY_LABEL[chosen];
      face_ = html`${priorityMark(chosen)}${display === 'icon' ? nothing : html`<span class="said">${said}</span>`}`;
      rows = PRIORITIES.map(one => ({ key: one, label: PRIORITY_LABEL[one], lead: priorityMark(one), chosen: one === chosen, act: () => choose(one) }));
    } else if (kind === 'members') {
      const people = values.map(id => ({ id, name: options.find(option => option.value === id)?.label ?? id }));
      const others = options.filter(option => !values.includes(option.value));

      said = people.length ? people.map(person => person.name).join(', ') : placeholder || 'Assign';
      muted = people.length === 0;
      face_ = people.length
        ? faces(people, max)
        : html`${display === 'pill' ? nothing : icon('userAdd', 14)}${display === 'icon' ? nothing : html`<span>${said}</span>`}`;
      rows = [
        ...people.map((person, index) => ({
          key: person.id,
          label: person.name,
          heading: index === 0 ? 'Assigned' : undefined,
          lead: face(person.id, person.name, 'xs'),
          chosen: true,
          multi: true,
          act: () => toggle(person.id),
        })),
        ...others.map((option, index) => ({
          key: option.value,
          label: option.label,
          heading: index === 0 ? (people.length ? 'Add more' : 'Members') : undefined,
          lead: face(option.value, option.label, 'xs'),
          chosen: false,
          multi: true,
          act: () => toggle(option.value),
        })),
        ...(people.length
          ? [{ key: '__clear', label: 'Clear all', danger: true, act: () => (close(), change({ values: [] })) }]
          : []),
      ];
    } else if (kind === 'labels') {
      const chosen = options.filter(option => values.includes(option.value));
      const shown = chosen.slice(0, max);
      const more = chosen.length - shown.length;

      said = chosen.length ? chosen.map(option => option.label).join(', ') : placeholder || 'Label';
      muted = chosen.length === 0;
      face_ = chosen.length
        ? html`<span class="tags">${shown.map(option => labelTag(option.label, option.tone))}${more > 0 ? html`<span class="tag">+${more}</span>` : nothing}</span>`
        : html`${icon('tag', 14)}${display === 'icon' ? nothing : html`<span>${said}</span>`}`;
      rows = options.map((option, index) => ({
        key: option.value,
        label: option.label,
        heading: index === 0 ? 'Labels' : undefined,
        lead: html`<span class="dot lg" style="background: ${TONE_DOT[option.tone ?? 'neutral']}"></span>`,
        chosen: values.includes(option.value),
        multi: true,
        act: () => toggle(option.value),
      }));
    } else if (kind === 'date') {
      const shown = shortDate(value, localeOf(host));
      const overdue = element.due === true && Boolean(shown) && isPastDay(value);

      said = shown || placeholder || 'Due date';
      muted = !shown;
      face_ = html`<span style="display: inline-flex; color: ${overdue ? 'var(--danger-fg)' : 'var(--fg-muted)'}">${icon('calendar', 14)}</span>${display === 'icon'
          ? nothing
          : html`<span class=${overdue ? 'overdue' : ''}>${said}</span>`}${overdue ? html`<span class="unseen">, overdue</span>` : nothing}`;
    } else {
      const chosen = options.find(option => option.value === value);

      said = chosen?.label ?? (placeholder || 'None');
      muted = !chosen;
      face_ = html`<span class="said wide">${said}</span>`;
      rows = [
        ...(clearable && value ? [{ key: '__none', label: placeholder || 'None', act: () => choose('') }] : []),
        ...options.map(option => ({
          key: option.value,
          label: option.label,
          lead: option.tone ? html`<span class="dot lg" style="background: ${TONE_DOT[option.tone]}"></span>` : nothing,
          chosen: option.value === value,
          act: () => choose(option.value),
        })),
      ];
    }

    const name = `${label}: ${said}`;
    const chip = `chip d-${display} ${muted ? 'muted' : ''}`;

    if (disabled) return html`<span class=${chip} role="img" aria-label=${name}>${face_}</span>`;

    const searchable = kind === 'members' || kind === 'labels' || kind === 'choice' || (kind === 'state' && options.length > 8);
    const query = pop.query.trim().toLowerCase();
    const shownRows = query ? rows.filter(row => row.key.startsWith('__') || row.label.toLowerCase().includes(query)) : rows;
    const open = () => {
      pop.open = true;
      pop.query = '';
      pop.active = Math.max(0, rows.findIndex(row => row.chosen));
      host.requestUpdate();
      if (kind === 'date') queueMicrotask(() => (host.shadowRoot?.querySelector('.popup input') as HTMLElement | null)?.focus());
      else if (searchable) queueMicrotask(() => (host.shadowRoot?.querySelector('.popup .search') as HTMLElement | null)?.focus());
      else focusActive(host);
    };

    const picker =
      kind === 'date'
        ? html`<div class="popup start date" role="dialog" aria-label=${label}>
            <input
              type="date"
              aria-label=${label}
              .value=${value}
              @change=${(event: Event) => choose((event.currentTarget as HTMLInputElement).value)}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                close();
              }}
            />
            ${clearable && value ? html`<button type="button" class="clear" @click=${() => choose('')}>Clear date</button>` : nothing}
          </div>`
        : html`<div class="popup start ${kind === 'priority' ? 'narrow' : ''}">
            ${searchable
              ? html`<input
                  class="search"
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="list"
                  aria-label=${`${label}…`}
                  placeholder=${`${label}…`}
                  .value=${pop.query}
                  @input=${(event: Event) => {
                    pop.query = (event.currentTarget as HTMLInputElement).value;
                    pop.active = 0;
                    host.requestUpdate();
                  }}
                />`
              : nothing}
            <div id="list" role="listbox" aria-label=${label} aria-multiselectable=${kind === 'members' || kind === 'labels' ? 'true' : nothing}>
              ${shownRows.length === 0 ? html`<p class="empty">Nothing matches</p>` : nothing}
              ${shownRows.map(
                (row, index) => html`${row.heading && !query ? html`<p class="group-heading" role="presentation">${row.heading}</p>` : nothing}
                  <div
                    role="option"
                    tabindex="-1"
                    data-value=${row.key}
                    data-tone=${row.danger ? 'danger' : nothing}
                    data-active=${index === pop.active ? '' : nothing}
                    aria-selected=${row.chosen === undefined ? nothing : String(row.chosen)}
                    @click=${(event: Event) => {
                      event.stopPropagation();
                      row.act();
                    }}
                    @mousemove=${() => {
                      if (pop.active === index) return;
                      pop.active = index;
                      host.requestUpdate();
                    }}
                  >
                    ${row.multi && kind === 'labels' ? html`<span class="box ${row.chosen ? 'on' : ''}" aria-hidden="true">${row.chosen ? icon('check', 10) : nothing}</span>` : nothing}
                    ${row.lead ?? nothing}<span class="item-label">${row.label}</span>
                    ${row.multi && kind === 'members' && row.chosen ? html`<span class="tick">${icon('close', 12)}</span>` : nothing}
                    ${!row.multi && row.chosen !== undefined ? html`<span class="tick" style="opacity: ${row.chosen ? 1 : 0}">${icon('check', 14)}</span>` : nothing}
                  </div>`,
              )}
            </div>
          </div>`;

    return html`<div
      class="anchor"
      data-kind=${kind}
      data-open=${pop.open ? '' : nothing}
      @keydown=${popupKeys(host, pop, shownRows, index => shownRows[index]?.act(), close)}
      @focusout=${closeOnLeave(host, pop, close)}
    >
      <button
        type="button"
        class=${chip}
        aria-label=${name}
        title=${name}
        aria-haspopup=${kind === 'date' ? 'dialog' : 'listbox'}
        aria-expanded=${pop.open ? 'true' : 'false'}
        @click=${(event: Event) => {
          event.stopPropagation();
          pop.open ? close() : open();
        }}
      >
        ${face_}
      </button>
      ${pop.open ? picker : nothing}
    </div>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: inline-flex;
        flex-shrink: 0;
        min-width: 0;
      }
      .anchor {
        position: relative;
        display: inline-flex;
        min-width: 0;
      }
      .chip {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        border: 0;
        background: transparent;
        font: inherit;
        font-size: 0.75rem;
        color: var(--fg);
        cursor: pointer;
        transition: background-color var(--dur-fast);
      }
      .chip.muted {
        color: var(--fg-muted);
      }
      button.chip:hover {
        background: var(--layer-hover);
      }
      .chip.d-badge {
        gap: 0.25rem;
        border-radius: var(--radius-md);
        padding: 0.125rem 0.375rem;
      }
      .chip.d-icon {
        width: 1.25rem;
        height: 1.25rem;
        justify-content: center;
        border-radius: var(--radius-md);
      }
      .chip.d-dot {
        gap: 0.375rem;
        border-radius: var(--radius-md);
        padding: 0.125rem 0.375rem;
      }
      .chip.d-pill {
        max-width: 14rem;
        min-width: 0;
        gap: 0.375rem;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 9999px;
        padding: 0.25rem 0.625rem;
      }
      .anchor[data-open] .chip.d-pill {
        background: var(--layer-selected);
      }
      .chip.d-button {
        height: 1.75rem;
        gap: 0.375rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        background: var(--bg-surface);
        padding: 0 0.625rem;
      }
      .said {
        max-width: 5rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--fg-muted);
      }
      .said.wide {
        max-width: 7.5rem;
      }
      .said.strong {
        max-width: none;
        color: var(--fg);
      }
      .overdue {
        color: var(--danger-fg);
      }
      .tags {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.25rem;
      }
      .popup {
        width: 14rem;
      }
      .popup.narrow {
        width: 11rem;
      }
      .popup.date {
        width: auto;
        padding: 0.75rem;
      }
      .popup.date input {
        height: var(--field-h);
        border: 1px solid var(--line-input);
        border-radius: var(--field-radius);
        background: var(--bg-surface);
        padding: 0 var(--field-px);
        font: inherit;
        font-size: 0.8125rem;
        color: var(--fg);
      }
      .clear {
        display: block;
        width: 100%;
        margin-top: 0.5rem;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        padding: 0.375rem 0.5rem;
        font: inherit;
        font-size: 0.8125rem;
        color: var(--fg-muted);
        text-align: start;
        cursor: pointer;
      }
      .clear:hover {
        background: var(--layer-hover);
      }
      .empty {
        margin: 0;
        padding: 0.75rem 0.5rem;
        font-size: 0.75rem;
        color: var(--fg-muted);
        text-align: center;
      }
      .box {
        display: inline-flex;
        width: 0.875rem;
        height: 0.875rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--line);
        border-radius: var(--radius-xs);
      }
      .box.on {
        border-color: var(--brand);
        background: var(--brand);
        color: var(--brand-on);
      }
    `,
  ],
);

// ---------------------------------------------------------------------------

drawAs(
  'bry-quick-add',
  element => {
    const host = as(element);
    const variant = element.variant === 'card' || element.variant === 'link' ? element.variant : 'row';
    const open = element.open === true;

    host.toggleAttribute('data-open', open);

    return quickAddLine(host, {
      variant,
      trigger: str(element.trigger),
      placeholder: str(element.placeholder),
      hint: str(element.hint),
      open,
      busy: element.busy === true,
      value: str(element.value),
      onOpen: () => host.emit('open'),
      onSubmit: value => host.emit('submit', { value }),
      onCancel: () => host.emit('cancel'),
    });
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
        min-width: 0;
      }
    `,
  ],
);

// ---------------------------------------------------------------------------

const LABELS_SHOWN = 2;

drawAs(
  'bry-work-card',
  element => {
    const host = as(element);

    if (element.loading === true) return html`<div role="status" aria-label="Loading"><div class="bone block"></div></div>`;

    const locale = localeOf(host);
    const title = str(element.title);
    const identifier = str(element.identifier);
    const priority = pick(PRIORITIES, element.priority);
    const labels = records(element.labels).map(one => ({ label: str(one.label), tone: pick(TONE_NAMES, one.tone) }));
    const people = records(element.assignees).map(one => ({ id: str(one.id), name: str(one.name) }));
    const due = str(element.due);
    const dueShown = shortDate(due, locale);
    const overdue = Boolean(dueShown) && isPastDay(due);
    const more = labels.length - LABELS_SHOWN;
    const project = str(element.project);
    const description = str(element.description);
    const progress =
      element.progress && typeof element.progress === 'object' ? (element.progress as { done?: unknown; total?: unknown }) : null;
    const done = typeof progress?.done === 'number' ? progress.done : 0;
    const total = typeof progress?.total === 'number' ? progress.total : 0;
    const updated = str(settingOf(host, 'updated'));
    const ago = timeAgo(updated, locale);
    // With `lead`, the first child sits on top in place of the priority mark; the rest are the foot's pickers.
    const lead = element.lead === true;
    const kids = Array.from(host.children);
    const pickers = lead ? kids.length > 1 : kids.length > 0;

    kids.forEach((kid, index) => {
      if (lead && index === 0) kid.setAttribute('slot', 'lead');
      else if (kid.getAttribute('slot') === 'lead') kid.removeAttribute('slot');
    });

    return html`<article
      class="card"
      aria-label=${[identifier, title].filter(Boolean).join(': ')}
      @click=${(event: Event) => {
        if (pressedItself(event, host)) host.emit('press');
      }}
    >
      <div class="top">
        <div class="lead">
          ${lead ? html`<slot name="lead"></slot>` : priority ? priorityMark(priority) : nothing}
          ${identifier ? html`<p class="identifier truncate">${identifier}</p>` : nothing}
        </div>
        ${rowMenu(host, element.menu, `Options for ${identifier || title}`)}
      </div>
      <p class="title">${title}</p>
      ${description ? html`<p class="description truncate">${description}</p>` : nothing}
      ${project || labels.length > 0
        ? html`<div class="chips">
            ${project ? html`<span class="chip">${icon('project', 12)}<span class="truncate">${project}</span></span>` : nothing}
            ${labels
              .slice(0, LABELS_SHOWN)
              .map(one => html`<span class="chip"><span class="dot" style="background: ${TONE_DOT[one.tone ?? 'neutral']}"></span><span class="truncate">${one.label}</span></span>`)}
            ${more > 0 ? html`<span class="more">+${more}</span>` : nothing}
          </div>`
        : nothing}
      <div class="foot">
        <div class="pickers">
          <slot></slot>
          ${pickers ? nothing : people.length > 0 ? faces(people) : nothing}
          ${!pickers && dueShown
            ? html`<span class="due ${overdue ? 'overdue' : ''}">${icon('calendar', 12)}${overdue ? html`<span class="unseen">Overdue: </span>` : nothing}${dueShown}</span>`
            : nothing}
        </div>
        <div class="end">
          ${total > 0 ? html`<span class="progress">${ring((done / total) * 100, 14)}${done}/${total}</span>` : nothing}
          ${ago ? html`<time class="ago" datetime=${updated} title=${fullTime(updated, locale)}>${ago}</time>` : nothing}
        </div>
      </div>
    </article>`;
  },
  [
    TYPE,
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
        min-width: 0;
        height: 100%;
      }
      .card {
        display: flex;
        height: 100%;
        min-width: 0;
        flex-direction: column;
        border: 0.5px solid var(--line);
        border-radius: var(--radius-lg);
        background: var(--bg-surface);
        padding: 0.75rem 0.625rem;
        box-shadow: var(--shadow-xs);
        cursor: pointer;
        user-select: none;
        transition: border-color var(--dur-fast);
      }
      .card:hover {
        border-color: var(--line-strong);
      }
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .lead {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.375rem;
      }
      p {
        margin: 0;
      }
      .identifier {
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .trigger.more {
        opacity: 0;
      }
      .title {
        display: -webkit-box;
        margin-top: 0.25rem;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        font-size: 0.875rem;
        line-height: 1.375;
        font-weight: 500;
        color: var(--fg);
      }
      .description {
        margin-top: 0.25rem;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.375rem;
        margin-top: 0.375rem;
      }
      .chip {
        display: inline-flex;
        max-width: 10rem;
        align-items: center;
        gap: 0.25rem;
        border-radius: 9999px;
        background: var(--layer-hover);
        padding: 0.125rem 0.375rem;
        font-size: 0.625rem;
        color: var(--fg-muted);
      }
      .more {
        font-size: 0.625rem;
        color: var(--fg-muted);
      }
      .foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-top: auto;
        padding-top: 0.5rem;
      }
      .pickers {
        display: flex;
        min-width: 0;
        flex: 1;
        align-items: center;
        gap: 0.375rem;
      }
      .end {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.5rem;
        margin-inline-start: auto;
      }
      .progress {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
        color: var(--fg-muted);
      }
      .ago {
        font-size: 0.625rem;
        color: var(--fg-muted);
      }
      .due {
        display: inline-flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .due.overdue {
        color: var(--danger-fg);
      }
      .block {
        height: 8rem;
        border-radius: var(--radius-xl);
      }
    `,
  ],
);

// ---------------------------------------------------------------------------

/** A badge in a header: a thin outline in its tone. */
const OUTLINE: Record<Tone, string> = {
  neutral: 'border-color: var(--line); color: var(--fg-muted)',
  brand: 'border-color: var(--brand-line); color: var(--brand-fg)',
  success: 'border-color: var(--success-line); color: var(--success-fg)',
  warn: 'border-color: var(--warn-line); color: var(--warn-fg)',
  danger: 'border-color: var(--danger-line); color: var(--danger-fg)',
};

drawAs(
  'bry-page-header',
  element => {
    const host = as(element);
    const title = str(element.title);
    const subtitle = str(element.subtitle);
    const glyph = pick(BUTTON_ICONS, element.icon);
    const crumbs = records(element.crumbs);
    const badges = records(element.badges);
    const tabs = records(element.tabs);
    const tab = str(element.tab);
    const count = typeof element.count === 'number' ? element.count : null;

    return html`<header class=${subtitle ? 'tall' : element.size === 'md' ? 'md' : 'sm'}>
      <div class="start">
        ${element.back === true
          ? html`<button type="button" class="square" aria-label="Back" @click=${() => host.emit('back')}>${icon('back', 16)}</button>`
          : nothing}
        ${crumbs.length > 0
          ? html`<nav aria-label="Breadcrumb" class="crumbs">
              ${crumbs.map(crumb => {
                const label = str(crumb.label);

                return html`<button type="button" class="crumb" @click=${() => host.emit('crumb', { id: str(crumb.id) })}>
                    ${crumb.initial === true ? html`<span class="initial" aria-hidden="true">${Array.from(label)[0]?.toUpperCase()}</span>` : nothing}
                    ${icon(pick(BUTTON_ICONS, crumb.icon), 14)}<span class="truncate crumb-label">${label}</span>
                  </button>
                  <span class="chevron" aria-hidden="true">${icon('chevronRight', 14)}</span>`;
              })}
            </nav>`
          : nothing}
        <div class="titles">
          <div class="line">
            <span class="title-icon">${icon(glyph, crumbs.length ? 14 : 16)}</span>
            <h1 class="truncate">${title}</h1>
            ${badges.map(badge => html`<span class="badge" style=${OUTLINE[pick(TONE_NAMES, badge.tone) ?? 'neutral']}>${str(badge.text)}</span>`)}
            ${count !== null ? html`<span class="count">${count}</span>` : nothing}
          </div>
          ${subtitle ? html`<p class="subtitle truncate">${subtitle}</p>` : nothing}
        </div>
      </div>
      ${tabs.length > 0
        ? html`<nav aria-label=${`${title} sections`} class="tabs">
            ${tabs.map(one => {
              const id = str(one.id);
              const current = id === tab;

              return html`<button
                type="button"
                class="tab ${current ? 'current' : ''}"
                data-tab=${id}
                aria-current=${current ? 'page' : nothing}
                @click=${() => host.emit('tab', { id })}
              >
                ${icon(pick(BUTTON_ICONS, one.icon), 14)}${str(one.label)}${typeof one.count === 'number' && one.count > 0
                  ? html`<span class="tab-count">${one.count}</span>`
                  : nothing}
              </button>`;
            })}
          </nav>`
        : nothing}
      <div class="actions"><slot></slot></div>
    </header>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
        min-width: 0;
        flex-shrink: 0;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        border-bottom: 1px solid var(--line);
        padding: 0 1rem;
      }
      header.sm {
        height: 2.75rem;
      }
      header.md {
        height: 3rem;
      }
      header.tall {
        padding-block: 0.625rem;
      }
      .start {
        display: flex;
        min-width: 0;
        flex: 1;
        align-items: center;
        gap: 0.375rem;
      }
      button {
        font: inherit;
        cursor: pointer;
      }
      .square {
        display: inline-flex;
        width: 1.5rem;
        height: 1.5rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        margin-inline-end: 0.25rem;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--fg-muted);
      }
      .square:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
      .crumbs {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.375rem;
      }
      .crumb {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.375rem;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        padding: 0;
        font-size: 0.875rem;
        color: var(--fg-muted);
      }
      .crumb:hover {
        color: var(--fg);
      }
      .crumb-label {
        max-width: 7.5rem;
      }
      .initial {
        display: inline-flex;
        width: 1.25rem;
        height: 1.25rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-xs);
        background: var(--layer-hover);
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--fg);
      }
      .chevron {
        display: inline-flex;
        color: var(--fg-muted);
        opacity: 0.4;
      }
      .titles {
        display: flex;
        min-width: 0;
        flex-direction: column;
      }
      .line {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.375rem;
      }
      .title-icon {
        display: inline-flex;
        color: var(--fg-muted);
      }
      .title-icon:empty {
        display: none;
      }
      h1 {
        margin: 0;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--fg);
      }
      .badge {
        flex-shrink: 0;
        border: 1px solid;
        border-radius: var(--radius-md);
        padding: 0.125rem 0.375rem;
        font-size: 0.6875rem;
      }
      .count {
        flex-shrink: 0;
        border-radius: 9999px;
        background: var(--layer-hover);
        padding: 0.125rem 0.375rem;
        font-size: 0.75rem;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        color: var(--fg-muted);
      }
      .subtitle {
        margin: 0;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .tabs {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.25rem;
      }
      .tab {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        padding: 0.375rem 0.75rem;
        font-size: 0.875rem;
        color: var(--fg-muted);
      }
      .tab:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
      .tab.current {
        background: var(--layer-selected);
        font-weight: 500;
        color: var(--fg);
      }
      .tab-count {
        border-radius: 9999px;
        background: var(--layer-hover);
        padding: 0 0.375rem;
        font-size: 0.625rem;
        font-variant-numeric: tabular-nums;
        color: var(--fg-muted);
      }
      .actions {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.375rem;
      }
    `,
  ],
);

// ---------------------------------------------------------------------------

type Status = (typeof ENTITY_STATUSES)[number];

/** Each status's mark and colour, as Brydio draws a cycle, a module and an inbox request. */
const STATUS: Record<Status, { mark: (tone: Tone) => TemplateResult; tone: Tone }> = {
  draft: { mark: tone => stateMark('unstarted', tone, 'md'), tone: 'neutral' },
  upcoming: { mark: tone => tinted(tone, 'play'), tone: 'brand' },
  active: { mark: tone => stateMark('started', tone, 'md'), tone: 'danger' },
  completed: { mark: tone => stateMark('completed', tone, 'md'), tone: 'success' },
  cancelled: { mark: tone => stateMark('cancelled', tone, 'md'), tone: 'neutral' },
  backlog: { mark: tone => stateMark('backlog', tone, 'md'), tone: 'neutral' },
  planned: { mark: tone => stateMark('unstarted', tone, 'md'), tone: 'neutral' },
  started: { mark: tone => stateMark('started', tone, 'md'), tone: 'brand' },
  paused: { mark: tone => tinted(tone, 'pause'), tone: 'warn' },
  pending: { mark: tone => tinted(tone, 'history'), tone: 'warn' },
  accepted: { mark: tone => tinted(tone, 'check'), tone: 'success' },
  declined: { mark: tone => tinted(tone, 'close'), tone: 'danger' },
  snoozed: { mark: tone => tinted(tone, 'history'), tone: 'brand' },
  duplicate: { mark: tone => tinted(tone, 'copy'), tone: 'neutral' },
};

function tinted(tone: Tone, name: string): TemplateResult {
  return html`<span class="status-icon" style="color: ${TONE_INK[tone]}">${icon(name, 16)}</span>`;
}

/** A status badge: an outlined, tinted pill. */
const STATUS_BADGE: Record<Tone, string> = {
  neutral: 'border-color: var(--line); background: var(--layer-hover); color: var(--fg-muted)',
  brand: 'border-color: var(--brand-line); background: var(--brand-soft); color: var(--brand-fg)',
  success: 'border-color: var(--success-line); background: var(--success-soft); color: var(--success-fg)',
  warn: 'border-color: var(--warn-line); background: var(--warn-soft); color: var(--warn-fg)',
  danger: 'border-color: var(--danger-line); background: var(--danger-soft); color: var(--danger-fg)',
};

drawAs(
  'bry-entity-row',
  element => {
    const host = as(element);

    if (element.loading === true) {
      return html`<div role="status" aria-label="Loading" class="skeleton"><div class="bone dot-bone"></div><div class="bone line-bone"></div></div>`;
    }

    const status = pick(ENTITY_STATUSES, element.status);
    const look = status ? STATUS[status] : null;
    const tone: Tone = pick(TONE_NAMES, element.tone) ?? look?.tone ?? 'neutral';
    const leading = pick(['status', 'ring', 'tile', 'none'] as const, element.leading) ?? (status ? 'status' : 'none');
    const title = str(element.title);
    const statusLabel = str(element.statusLabel);
    const metrics = records(element.metrics);
    const rail = element.rail && typeof element.rail === 'object' && !Array.isArray(element.rail) ? (element.rail as Record<string, unknown>) : null;
    const pressable = element.pressable === true;
    const expandable = element.expandable === true;
    const expanded = expandable && element.expanded === true;
    const ringValue = typeof element.ring === 'number' ? element.ring : 0;
    const press = () => host.emit('press');
    const lit = element.highlighted === true || element.selected === true;

    const row = html`<div class="row ${lit ? 'lit' : ''}">
      <div class="line">
        <div
          class="main ${pressable ? 'pressable' : ''}"
          role=${pressable ? 'button' : nothing}
          tabindex=${pressable ? '0' : nothing}
          aria-label=${pressable ? title : nothing}
          aria-current=${element.selected === true ? 'true' : nothing}
          @click=${pressable ? (event: Event) => pressedItself(event, host) && press() : nothing}
          @keydown=${pressable ? pressKey(press) : nothing}
        >
          ${leading === 'status' && look ? look.mark(tone) : nothing}
          ${leading === 'ring' ? ring(ringValue, 28, true) : nothing}
          ${leading === 'tile' ? html`<span class="tile" aria-hidden="true">${icon(pick(BUTTON_ICONS, element.icon) ?? 'layers', 16)}</span>` : nothing}
          <div class="text">
            <div class="title-line">
              <p class="title truncate">${title}</p>
              ${str(element.dateRange) ? html`<span class="range">${str(element.dateRange)}</span>` : nothing}
            </div>
            ${str(element.meta) ? html`<p class="small truncate">${str(element.meta)}</p>` : nothing}
            ${str(element.description) ? html`<p class="small truncate description">${str(element.description)}</p>` : nothing}
          </div>
          ${statusLabel || metrics.length > 0
            ? html`<div class="facts">
                ${statusLabel ? html`<span class="status-badge" style=${STATUS_BADGE[tone]}>${statusLabel}</span>` : nothing}
                ${metrics.map(
                  metric => html`<div class="metric">
                    ${typeof metric.ring === 'number' ? ring(metric.ring) : html`<span class="dot" style="background: var(--line-strong)"></span>`}
                    <span class="metric-text"><span class="metric-value">${str(metric.value)}</span><span class="small">${str(metric.label)}</span></span>
                  </div>`,
                )}
              </div>`
            : nothing}
        </div>
        <div class="tools">
          ${rowMenu(host, element.menu, `Options for ${title}`)}
          ${expandable
            ? html`<button
                type="button"
                class="expand ${expanded ? 'open' : ''}"
                aria-expanded=${expanded ? 'true' : 'false'}
                aria-label=${expanded ? `Hide ${title}` : `Show ${title}`}
                @click=${() => host.emit('toggle', { expanded: !expanded })}
              >
                ${icon('chevronDown', 16)}
              </button>`
            : nothing}
        </div>
      </div>
      ${expanded ? html`<div class="children"><slot></slot></div>` : nothing}
    </div>`;

    if (!rail) return row;

    return html`<div class="railed">
      <div class="rail" aria-hidden="true">
        <div class="rail-line"></div>
        <div class="rail-date">
          <div>${str(rail.month)}</div>
          <div>${str(rail.day)}</div>
        </div>
        <span class="rail-dot ${rail.active === true ? 'active' : ''}"></span>
      </div>
      ${row}
    </div>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .row {
        border-bottom: 1px solid var(--line);
        border-radius: var(--radius-2xl, 1rem);
        padding: 0.5rem 0;
      }
      :host(:last-child) .row {
        border-bottom: 0;
      }
      .row.lit {
        background: var(--layer-selected);
      }
      .line {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0 0.75rem;
      }
      .main {
        display: flex;
        min-width: 0;
        min-height: 3.5rem;
        flex: 1;
        align-items: center;
        gap: 0.75rem;
        border-radius: var(--radius-xl);
        padding: 0.5rem;
        outline: none;
      }
      .main.pressable {
        cursor: pointer;
        transition: background-color var(--dur-fast);
      }
      .main.pressable:hover {
        background: var(--layer-hover);
      }
      .status-icon {
        display: inline-flex;
        flex-shrink: 0;
      }
      .tile {
        display: inline-flex;
        width: 2rem;
        height: 2rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        color: var(--fg-muted);
      }
      .text {
        min-width: 0;
        flex: 1;
      }
      .title-line {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 0.5rem;
      }
      p {
        margin: 0;
      }
      .title {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--fg);
      }
      .range {
        flex-shrink: 0;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .small {
        margin-top: 0.25rem;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .description {
        max-width: 36rem;
      }
      .facts {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 1rem;
        font-size: 0.75rem;
      }
      .status-badge {
        border: 1px solid;
        border-radius: var(--radius-md);
        padding: 0.125rem 0.5rem;
        font-size: 0.6875rem;
      }
      .metric {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        white-space: nowrap;
      }
      .metric-text {
        display: flex;
        align-items: baseline;
        gap: 0.375rem;
      }
      .metric-text .small {
        margin: 0;
      }
      .metric-value {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--fg);
      }
      @media (max-width: 639px) {
        .range,
        .facts {
          display: none;
        }
      }
      @media (max-width: 767px) {
        .description {
          display: none;
        }
      }
      .tools {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        align-self: center;
      }
      .tools .trigger.more {
        width: 2rem;
        height: 2rem;
        border-radius: var(--radius-lg);
        opacity: 0;
      }
      :host(:hover) .tools .trigger.more,
      :host(:focus-within) .tools .trigger.more {
        opacity: 1;
      }
      .expand {
        display: inline-flex;
        width: 2rem;
        height: 2rem;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: var(--radius-lg);
        background: transparent;
        color: var(--fg-muted);
        cursor: pointer;
      }
      .expand:hover {
        background: var(--layer-hover);
      }
      .expand .icon {
        transition: transform var(--dur-fast);
      }
      .expand.open .icon {
        transform: rotate(180deg);
      }
      .children {
        border-top: 1px solid var(--line);
        padding: 1rem 0.75rem;
      }
      .railed {
        display: grid;
        grid-template-columns: 5.5rem 1fr;
      }
      .rail {
        position: relative;
        min-height: 100%;
      }
      .rail-line {
        position: absolute;
        top: 0;
        bottom: 0;
        inset-inline-start: 3.65rem;
        width: 1px;
        background: var(--line);
      }
      .rail-date {
        position: relative;
        padding-block-start: 1.75rem;
        padding-inline: 0.75rem 2.25rem;
        text-align: end;
        font-size: 0.6875rem;
        line-height: 1rem;
        color: var(--fg-muted);
      }
      .rail-dot {
        position: absolute;
        top: 2.25rem;
        inset-inline-start: 3.3rem;
        width: 0.875rem;
        height: 0.875rem;
        border: 2px solid var(--bg-surface);
        border-radius: 9999px;
        background: var(--line-strong);
      }
      .rail-dot.active {
        background: var(--danger);
        box-shadow: 0 0 0 4px var(--danger-soft);
      }
      .skeleton {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
      }
      .dot-bone {
        width: 2rem;
        height: 2rem;
        border-radius: 9999px;
      }
      .line-bone {
        height: 0.75rem;
        flex: 1;
      }
    `,
  ],
);

// ---------------------------------------------------------------------------

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '3d', label: 'Last 3 days' },
  { value: '7d', label: 'Last 7 days' },
] as const;

drawAs(
  'bry-filter-menu',
  element => {
    const host = as(element);
    const pop: Pop = popOf(host, 'filter');
    const facets = records(element.facets);
    const chosen = new Map(records(element.values).map(one => [str(one.facet), strings(one.values)]));
    // How many facets are in force, as the button says it: "2 filters".
    const count = [...chosen.values()].filter(values => values.length > 0).length;
    const label = str(element.label) || 'Filter';
    const facet = pop.view ? facets.find(one => str(one.id) === pop.view) : undefined;
    const range = keptOf(host, () => ({ from: '', to: '' }) as Record<string, unknown>);

    const close = (refocus = true) => {
      pop.open = false;
      pop.view = '';
      pop.query = '';
      pop.active = -1;
      host.requestUpdate();
      if (refocus) queueMicrotask(() => (host.shadowRoot?.querySelector('.trigger-button') as HTMLElement | null)?.focus());
    };
    const show = (view: string, active: number) => {
      pop.view = view;
      pop.query = '';
      pop.active = active;
      range.from = '';
      range.to = '';
      host.requestUpdate();
      focusActive(host);
    };

    // The facets, or one facet's options behind a row that goes back.
    type Row = { label: string; act: () => void; back?: boolean; facet?: Record<string, unknown>; option?: Record<string, unknown>; on?: boolean; plain?: boolean };
    let rows: Row[];

    if (facet) {
      const id = str(facet.id);
      const values = chosen.get(id) ?? [];
      const change = (next: string[]) => host.emit('change', { facet: id, values: next });
      const back: Row = { label: str(facet.label), back: true, act: () => show('', facets.indexOf(facet)) };

      if (facet.kind === 'dates') {
        const now = values[0] ?? '';

        rows = [
          back,
          ...DATE_PRESETS.map(preset => ({
            label: preset.label,
            on: now === preset.value,
            option: { value: preset.value, label: preset.label },
            act: () => change(now === preset.value ? [] : [preset.value]),
          })),
          ...(now ? [{ label: 'Clear', plain: true, act: () => change([]) }] : []),
        ];
      } else {
        const query = pop.query.trim().toLowerCase();

        rows = [
          back,
          ...records(facet.options)
            .filter(option => !query || str(option.label).toLowerCase().includes(query))
            .map(option => {
              const value = str(option.value);
              const on = values.includes(value);

              return { label: str(option.label), option, on, act: () => change(on ? values.filter(one => one !== value) : [...values, value]) };
            }),
        ];
      }
    } else {
      rows = [
        ...facets.map(one => ({ label: str(one.label), facet: one, act: () => show(str(one.id), 1) })),
        ...(count > 0 ? [{ label: 'Reset all filters', plain: true, act: () => (host.emit('reset'), close()) }] : []),
      ];
    }

    const keys = popupKeys(host, pop, rows, index => rows[index]?.act(), close);
    const dateFacet = facet?.kind === 'dates' ? facet : undefined;
    const pickRange = () => {
      const from = str(range.from);
      const to = str(range.to);

      if (!dateFacet || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return;

      const [start, end] = [from, to].sort();

      host.emit('change', { facet: str(dateFacet.id), values: [`${start}..${end}`] });
    };
    const span = dateFacet ? /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec((chosen.get(str(dateFacet.id)) ?? [])[0] ?? '') : null;

    return html`<div
      class="anchor"
      data-open=${pop.open ? '' : nothing}
      @keydown=${(event: KeyboardEvent) => {
        // The arrows across: into a facet, and back out of it.
        if (pop.open && pop.active >= 0) {
          const row = rows[pop.active];
          const inward = getComputedStyle(host).direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
          const outward = inward === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';
          const inField = (event.composedPath()[0] as Element | undefined)?.tagName === 'INPUT';

          if (event.key === inward && row?.facet && !facet) {
            event.preventDefault();
            return row.act();
          }
          if (((event.key === outward && !inField) || event.key === 'Escape') && facet) {
            event.preventDefault();
            event.stopPropagation();
            return rows[0]!.act();
          }
        }
        keys(event);
      }}
      @focusout=${closeOnLeave(host, pop, close)}
    >
      <button
        type="button"
        class="trigger-button ${count ? 'active' : ''}"
        aria-haspopup="menu"
        aria-expanded=${pop.open ? 'true' : 'false'}
        @click=${() => {
          if (pop.open) return close();
          pop.open = true;
          pop.view = '';
          pop.active = 0;
          host.requestUpdate();
          focusActive(host);
        }}
        @keydown=${(event: KeyboardEvent) => {
          if (pop.open || event.key !== 'ArrowDown') return;
          event.preventDefault();
          pop.open = true;
          pop.active = 0;
          host.requestUpdate();
          focusActive(host);
        }}
      >
        ${icon('filter', 16)}${count > 0 ? `${count} ${count === 1 ? 'filter' : 'filters'}` : label}
      </button>
      ${pop.open
        ? html`<div class="popup start ${dateFacet ? 'dates' : ''}" role="menu" aria-label=${facet ? str(facet.label) : label}>
            ${!facet && facets.length === 0 ? html`<p class="empty">Nothing to filter by</p>` : nothing}
            ${rows.map((row, index) => {
              const active = index === pop.active;
              const hover = () => {
                if (pop.active === index) return;
                pop.active = index;
                host.requestUpdate();
              };

              if (row.back) {
                return html`<button type="button" role="menuitem" tabindex="-1" class="back" data-active=${active ? '' : nothing} @click=${row.act} @mousemove=${hover}>
                    <span class="flip">${icon('chevronRight', 14)}</span><span class="item-label">${row.label}</span>
                  </button>
                  <div class="separator" role="separator"></div>
                  ${facet?.search === true
                    ? html`<input
                        class="search"
                        type="text"
                        aria-label=${`Search ${str(facet.label)}`}
                        placeholder="Search…"
                        .value=${pop.query}
                        @input=${(event: Event) => {
                          pop.query = (event.currentTarget as HTMLInputElement).value;
                          pop.active = 1;
                          host.requestUpdate();
                        }}
                      />`
                    : nothing}
                  ${facet && facet.kind !== 'dates' && rows.length === 1 ? html`<p class="empty">${pop.query ? 'No matches' : 'Nothing to filter by'}</p>` : nothing}`;
              }
              if (row.plain) {
                return html`${!facet ? html`<div class="separator" role="separator"></div>` : nothing}<button
                    type="button"
                    role="menuitem"
                    tabindex="-1"
                    class="plain"
                    data-active=${active ? '' : nothing}
                    @click=${row.act}
                    @mousemove=${hover}
                  >
                    ${row.label}
                  </button>`;
              }
              if (row.facet) {
                const id = str(row.facet.id);
                const ticked = (chosen.get(id) ?? []).length;

                return html`<button
                  type="button"
                  role="menuitem"
                  tabindex="-1"
                  aria-haspopup="menu"
                  data-facet=${id}
                  data-active=${active ? '' : nothing}
                  @click=${row.act}
                  @mousemove=${hover}
                >
                  <span class="muted">${icon(pick(BUTTON_ICONS, row.facet.icon), 16)}</span><span class="item-label">${row.label}</span>
                  ${ticked > 0 ? html`<span class="ticked">${ticked}</span>` : nothing}${icon('chevronRight', 14)}
                </button>`;
              }

              const option = row.option!;
              const tone = pick(TONE_NAMES, option.tone);

              return html`<button
                type="button"
                role="menuitemcheckbox"
                tabindex="-1"
                aria-checked=${row.on ? 'true' : 'false'}
                data-option=${str(option.value)}
                data-active=${active ? '' : nothing}
                @click=${row.act}
                @mousemove=${hover}
              >
                <span class="box ${row.on ? 'on' : ''}" aria-hidden="true">${row.on ? icon('check', 10) : nothing}</span>
                ${str(option.mark) ? optionMark(str(option.mark), tone, str(option.label), str(option.value)) : nothing}
                <span class="item-label">${row.label}</span>
                ${typeof option.count === 'number' ? html`<span class="ticked">${option.count}</span>` : nothing}
              </button>`;
            })}
            ${dateFacet
              ? html`<div class="separator" role="separator"></div>
                  <div class="range" role="group" aria-label="Or pick a range">
                    <p class="range-caption">Or pick a range</p>
                    <label>From <input type="date" .value=${str(range.from) || span?.[1] || ''} @change=${(event: Event) => {
                      range.from = (event.currentTarget as HTMLInputElement).value;
                      pickRange();
                    }} /></label>
                    <label>To <input type="date" .value=${str(range.to) || span?.[2] || ''} @change=${(event: Event) => {
                      range.to = (event.currentTarget as HTMLInputElement).value;
                      if (!range.from && span) range.from = span[1];
                      pickRange();
                    }} /></label>
                  </div>`
              : nothing}
          </div>`
        : nothing}
    </div>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: inline-flex;
        flex-shrink: 0;
      }
      .anchor {
        position: relative;
        display: inline-flex;
      }
      .trigger-button {
        display: flex;
        height: 2rem;
        flex-shrink: 0;
        align-items: center;
        gap: 0.375rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: transparent;
        padding: 0 0.625rem;
        font: inherit;
        font-size: 0.875rem;
        color: var(--fg-muted);
        cursor: pointer;
        transition: background-color var(--dur-fast);
      }
      .trigger-button:hover {
        background: var(--layer-hover);
      }
      .trigger-button.active {
        color: var(--fg);
      }
      .anchor[data-open] .trigger-button {
        background: var(--layer-selected);
      }
      .count {
        border-radius: 9999px;
        background: var(--layer-hover);
        padding: 0 0.375rem;
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
      }
      .popup {
        width: 14rem;
      }
      .popup [role='menuitem'],
      .popup [role='menuitemcheckbox'] {
        font-size: 0.8125rem;
      }
      .muted,
      .ticked {
        display: inline-flex;
        color: var(--fg-muted);
      }
      .ticked {
        font-size: 0.75rem;
        font-variant-numeric: tabular-nums;
      }
      .back {
        font-weight: 500;
      }
      .plain {
        color: var(--fg-muted);
      }
      .popup.dates {
        width: 16rem;
      }
      .range {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        padding: 0.25rem 0.5rem 0.5rem;
        font-size: 0.75rem;
        color: var(--fg-muted);
      }
      .range-caption {
        margin: 0;
      }
      .range label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .range input {
        height: 1.75rem;
        border: 1px solid var(--line-input);
        border-radius: var(--radius-md);
        background: var(--bg-surface);
        padding: 0 0.375rem;
        font: inherit;
        color: var(--fg);
      }
      .flip {
        display: inline-flex;
        transform: scaleX(-1);
      }
      :host(:dir(rtl)) .flip {
        transform: none;
      }
      .empty {
        margin: 0;
        padding: 0.375rem 0.5rem;
        font-size: 0.8125rem;
        color: var(--fg-muted);
      }
      .box {
        display: inline-flex;
        width: 0.875rem;
        height: 0.875rem;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--line);
        border-radius: var(--radius-xs);
      }
      .box.on {
        border-color: var(--brand);
        background: var(--brand);
        color: var(--brand-on);
      }
    `,
  ],
);

// ---------------------------------------------------------------------------

drawAs(
  'bry-filter-chip',
  element => {
    const host = as(element);
    const label = str(element.label);
    const said = str(element.text);
    const marks = records(element.marks).slice(0, 4);

    return html`<span class="chip">
      <button type="button" class="press" @click=${() => host.emit('press')}>
        ${icon(pick(BUTTON_ICONS, element.icon), 14)}<span class="name">${label}</span>
        ${marks.length > 0
          ? html`<span class="marks">${marks.map((mark, index) =>
              optionMark(str(mark.mark), pick(TONE_NAMES, mark.tone), str(mark.name), str(mark.name) || String(index)),
            )}</span>`
          : nothing}
        ${said ? html`<span class="said truncate">${said}</span>` : nothing}
      </button>
      <button type="button" class="remove" aria-label=${`Remove ${label} filter`} @click=${() => host.emit('remove')}>${icon('close', 12)}</button>
    </span>`;
  },
  [
    FOCUS,
    PLAN,
    css`
      :host {
        display: inline-flex;
        flex-shrink: 0;
      }
      .chip {
        display: inline-flex;
        height: 1.75rem;
        align-items: stretch;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: var(--radius-md);
        background: var(--bg-surface);
        font-size: 0.75rem;
      }
      button {
        display: flex;
        align-items: center;
        border: 0;
        background: transparent;
        font: inherit;
        color: var(--fg-muted);
        cursor: pointer;
      }
      button:hover {
        background: var(--layer-hover);
        color: var(--fg);
      }
      .press {
        min-width: 0;
        gap: 0.375rem;
        padding: 0 0.375rem 0 0.5rem;
      }
      .name {
        flex-shrink: 0;
      }
      .marks {
        display: flex;
        align-items: center;
      }
      .marks > * + * {
        margin-inline-start: -0.25rem;
      }
      .said {
        max-width: 10rem;
        color: var(--fg);
      }
      .remove {
        border-inline-start: 1px solid var(--line);
        padding: 0 0.375rem;
      }
    `,
  ],
);
