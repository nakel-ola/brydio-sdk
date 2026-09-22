/// <reference lib="dom" />
import { css, html, nothing, type TemplateResult } from '../base.ts';
import { drawAs } from '../define.ts';
import { FIELD_B, keptOf, listOf, QUIET } from './catalogue-b-shared.ts';
import { FOCUS, str, TYPE } from './tokens.ts';

/**
 * ADR-A23 (catalogue-b): `bry-questionnaire`, questions asked one at a time,
 * as Brydio's React catalogue draws it from the kit's parts: a card with a
 * progress bar, the question as a fieldset's legend, a radio group,
 * checkboxes, a text area or a row of ratings, and Back and Next. shadcn has
 * no component of this name.
 */

type Answer = string | string[] | number;

interface Question {
  id: string;
  kind: 'single' | 'multiple' | 'text' | 'rating';
  prompt: string;
  description?: string;
  choices?: { value: string; label: string }[];
  required?: boolean;
  scale?: number;
  placeholder?: string;
}

/** Whether a question has an answer worth sending. */
export function answered(answer: Answer | undefined): boolean {
  if (answer === undefined) return false;
  if (Array.isArray(answer)) return answer.length > 0;
  if (typeof answer === 'string') return answer.trim() !== '';

  return true;
}

let forms = 0;

function control(question: Question, answer: Answer | undefined, give: (value: Answer) => void, name: string): TemplateResult {
  switch (question.kind) {
    case 'single':
      return html`<div role="radiogroup" aria-labelledby="prompt" class="choices">
        ${listOf<{ value: string; label: string }>(question.choices).map(
          choice => html`<label class="choice type-ui">
            <input type="radio" name=${name} value=${choice.value} .checked=${answer === choice.value} @change=${() => give(choice.value)} />
            ${choice.label}
          </label>`,
        )}
      </div>`;
    case 'multiple': {
      const picked = Array.isArray(answer) ? answer : [];

      return html`<div class="choices" role="group" aria-labelledby="prompt">
        ${listOf<{ value: string; label: string }>(question.choices).map(
          choice => html`<label class="choice type-ui">
            <input
              type="checkbox"
              value=${choice.value}
              .checked=${picked.includes(choice.value)}
              @change=${() => give(picked.includes(choice.value) ? picked.filter(value => value !== choice.value) : [...picked, choice.value])}
            />
            ${choice.label}
          </label>`,
        )}
      </div>`;
    }
    case 'text':
      return html`<textarea
        class="box"
        aria-labelledby="prompt"
        placeholder=${question.placeholder || nothing}
        .value=${typeof answer === 'string' ? answer : ''}
        @input=${(event: Event) => give((event.currentTarget as HTMLTextAreaElement).value)}
      ></textarea>`;
    case 'rating': {
      const scale = typeof question.scale === 'number' && question.scale >= 3 && question.scale <= 10 ? question.scale : 5;

      return html`<div role="radiogroup" aria-labelledby="prompt" class="rating">
        ${Array.from({ length: scale }, (_, at) => at + 1).map(
          value => html`<label class="rate">
            <input type="radio" name=${name} value=${value} .checked=${answer === value} @change=${() => give(value)} />
            <span>${value}</span>
          </label>`,
        )}
      </div>`;
    }
    default:
      return html``;
  }
}

drawAs(
  'bry-questionnaire',
  element => {
    const questions = listOf<Question>(element.questions).filter(question => question && typeof question.id === 'string');
    const state = keptOf(element, () => ({ index: 0, answers: {} as Record<string, Answer>, name: `bry-question-${(forms += 1)}` }));
    const index = Math.min(state.index, Math.max(0, questions.length - 1));
    const question = questions[index];
    const last = index === questions.length - 1;
    const ready = !question || question.required !== true || answered(state.answers[question.id]);
    const working = element.working === true;
    const error = str(element.error);
    const go = (to: number) => {
      state.index = to;
      element.emit('step', { index: to });
      element.requestUpdate();
      queueMicrotask(() => (element.shadowRoot?.querySelector('legend') as HTMLElement | null)?.focus());
    };

    if (!question) return html`<div class="card"><p class="type-ui">${str(element.title)}</p></div>`;

    return html`<form
      class="card"
      aria-label=${str(element.title) || nothing}
      @submit=${(event: Event) => {
        event.preventDefault();
        if (!ready || working) return;
        if (!last) return go(index + 1);

        element.emit('submit', { answers: { ...state.answers } });
      }}
    >
      ${str(element.title) ? html`<p class="type-subheading">${str(element.title)}</p>` : nothing}
      <div
        class="progress"
        role="progressbar"
        aria-label="Progress"
        aria-valuemin="1"
        aria-valuemax=${questions.length}
        aria-valuenow=${index + 1}
        aria-valuetext="Question ${index + 1} of ${questions.length}"
      >
        <div class="done" style="inline-size: ${((index + 1) / questions.length) * 100}%"></div>
      </div>
      <p class="type-caption">Question ${index + 1} of ${questions.length}</p>
      <fieldset>
        <legend id="prompt" class="type-label" tabindex="-1">
          ${question.prompt}${question.required === true ? html`<span class="required" aria-hidden="true">*</span>` : nothing}
        </legend>
        ${question.description ? html`<p class="type-caption">${question.description}</p>` : nothing}
        ${control(
          question,
          state.answers[question.id],
          value => {
            state.answers = { ...state.answers, [question.id]: value };
            element.emit('answer', { question: question.id, value });
            element.requestUpdate();
          },
          `${state.name}-${question.id}`,
        )}
      </fieldset>
      ${error ? html`<p id="error" class="type-caption error" role="alert">${error}</p>` : nothing}
      <div class="foot">
        <button type="button" class="quiet" data-step="back" ?disabled=${index === 0 || working} @click=${() => go(index - 1)}>Back</button>
        <button
          type="submit"
          class="next"
          data-step=${last ? 'submit' : 'next'}
          ?disabled=${!ready || working}
          aria-busy=${last && working ? 'true' : nothing}
          aria-describedby=${error ? 'error' : nothing}
        >
          ${last ? str(element.action) || 'Send' : 'Next'}
        </button>
      </div>
    </form>`;
  },
  [
    TYPE,
    FOCUS,
    FIELD_B,
    QUIET,
    css`
      :host {
        display: block;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 1rem;
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background: var(--card);
      }
      .progress {
        height: 0.375rem;
        overflow: hidden;
        border-radius: 9999px;
        background: var(--bg-fill);
      }
      .done {
        height: 100%;
        background: var(--brand);
        transition: inline-size var(--dur-fast);
      }
      fieldset {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
        border: 0;
      }
      legend {
        padding: 0;
        margin-bottom: 0.25rem;
      }
      .required {
        margin-inline-start: 0.125rem;
        color: var(--danger-fg);
      }
      .choices {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .choice {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
      }
      input {
        accent-color: var(--brand);
      }
      textarea {
        min-height: 4rem;
        padding: 0.375rem var(--field-px);
        resize: vertical;
        outline: none;
      }
      textarea:focus-visible {
        border-color: var(--brand);
        box-shadow: 0 0 0 3px var(--brand-ring);
      }
      .rating {
        display: flex;
        gap: 0.25rem;
      }
      .rate {
        position: relative;
      }
      .rate input {
        position: absolute;
        opacity: 0;
      }
      .rate span {
        display: inline-flex;
        width: var(--control-h);
        height: var(--control-h);
        align-items: center;
        justify-content: center;
        border: 1px solid var(--line-input);
        border-radius: var(--radius-md);
        font-size: 0.8125rem;
        cursor: pointer;
      }
      .rate input:checked + span {
        border-color: var(--brand);
        background: var(--brand);
        color: var(--brand-on);
      }
      .rate input:focus-visible + span {
        box-shadow: 0 0 0 3px var(--brand-ring);
      }
      .foot {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .next {
        height: var(--control-h);
        padding: 0 0.75rem;
        border: 0;
        border-radius: var(--radius-lg);
        background: var(--brand);
        color: var(--brand-on);
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
      }
      .next:disabled {
        pointer-events: none;
        opacity: 0.45;
      }
    `,
  ],
);

