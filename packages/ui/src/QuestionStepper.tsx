import { useEffect, useId, useRef, useState } from 'react';
import { stepsPhrase, type QuestionAnswer, type QuestionAnswers, type QuestionPrompt } from '@rotaris/contracts';

/**
 * REQ-CHAT-097..103 — the desktop question stepper. Structure from
 * `docs/spec/03-conversation-composer-transcript.md` §17; craft from `docs/design/` by token name, except the two
 * figures the requirement states itself (the 520×420 minimum and the 28 px pills), which are written as the numbers
 * it states.
 *
 * It shares the trailer/modal machinery with the permission approval (REQ-CHAT-103) — one `trailerRows` computes
 * both trailers, one `openTrailer` opens both — and differs from it exactly where the requirement says: the first
 * approval **auto-opens** its dialog while a question waits for a click, and each carries its own failed-delivery
 * sentence. **ADR-0019 governs approvals only and says nothing about structured questions**, so the approval path
 * here is a precedent followed, not a record complied with.
 *
 * Two rules run through the whole component and are the reason for its shape:
 *
 *   - **REQ-CHAT-102: a success outcome is never reported unless a waiting tool call received the answers.** The
 *     modal therefore reports nothing on Submit until the delivery has answered, and a delivery that failed leaves
 *     it open with the requirement's sentence. `onSubmit` resolving `{delivered: false}` is not an error path to be
 *     tidied away; it is the requirement.
 *   - **REQ-CHAT-101: closing emits cancellation exactly once.** Every dismissal route funnels through `close`,
 *     which is guarded by a ref rather than by state, because two dismissals can be dispatched inside one React
 *     batch (Escape and the window's own close) and state would not have settled between them.
 */
export interface QuestionStepperProps {
  readonly prompt: QuestionPrompt;
  /** REQ-CHAT-101/102: every step's answer in one payload; `delivered` false when no waiting call received it. */
  readonly onSubmit: (answers: QuestionAnswers) => Promise<{ delivered: boolean }>;
  /** REQ-CHAT-101/102: cancellation forwarded to the waiting tool. Called at most once by this component. */
  readonly onCancel: () => void;
  /** The surface's own bookkeeping: the modal is gone. Never a decision (REQ-CHAT-098). */
  readonly onClose: () => void;
}

/** REQ-CHAT-102's exact sentence for a delivery that found no waiting call. */
export const QUESTION_DELIVERY_FAILED = 'Could not deliver answers. The waiting agent is no longer available.';
/** REQ-CHAT-100's exact placeholder. */
export const FREEFORM_PLACEHOLDER = 'Or type your own answer…';

/** REQ-CHAT-100: whitespace-only text does not count as an answer. */
export function hasAnswer(a: QuestionAnswer | undefined): boolean {
  if (!a) return false;
  if (a.selected_option !== null && a.selected_option !== '') return true;
  return a.freeform_text !== null && a.freeform_text.trim() !== '';
}

export function QuestionStepper({ prompt, onSubmit, onCancel, onClose }: QuestionStepperProps) {
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<QuestionAnswers>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /** REQ-CHAT-101: exactly once, whatever route dismissed the modal — held in a ref for the reason above. */
  const decided = useRef(false);
  const surface = useRef<HTMLDivElement>(null);

  const steps = prompt.steps;
  const step = steps[index];
  const last = index === steps.length - 1;
  const current = step ? answers[step.id] : undefined;
  const answered = hasAnswer(current);

  const close = (cancel: boolean) => {
    if (decided.current) return;
    decided.current = true;
    if (cancel) onCancel();
    onClose();
  };

  // REQ-CHAT-098: if the pending state clears while this modal is open — answered elsewhere, cancelled, run
  // stopped — the surface unmounts it, and unmounting MUST NOT emit a second decision. Marking the decision taken
  // on unmount is what makes that structural: nothing later in the teardown can reach `onCancel`.
  useEffect(() => () => { decided.current = true; }, []);

  useEffect(() => { surface.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return;
      e.preventDefault();
      e.stopPropagation();
      // REQ-CHAT-101: Escape cancels the whole prompt on the FIRST step and otherwise moves one step back.
      if (index === 0) close(true);
      else setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, busy]);

  useEffect(() => {
    // REQ-CHAT-101: closing the window releases the waiting call immediately rather than leaving it to the timeout.
    const onUnload = () => { if (!decided.current) { decided.current = true; onCancel(); } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAnswer = (id: string, value: QuestionAnswer) => {
    setFailed(false);
    setAnswers((a) => ({ ...a, [id]: value }));
  };
  /** REQ-CHAT-100: single-select; clicking the selected card deselects it; selecting clears any freeform text. */
  const chooseOption = (label: string) => {
    if (!step) return;
    const already = answers[step.id]?.selected_option === label;
    setAnswer(step.id, already
      ? { selected_option: null, freeform_text: answers[step.id]?.freeform_text ?? null }
      : { selected_option: label, freeform_text: null });
  };

  const submit = async () => {
    if (busy || !answered) return;
    setBusy(true);
    setFailed(false);
    // REQ-CHAT-095: one entry per step, so a step the user skipped renders "(no answer)" rather than vanishing.
    const payload: QuestionAnswers = {};
    for (const s of steps) payload[s.id] = answers[s.id] ?? { selected_option: null, freeform_text: null };
    const r = await onSubmit(payload);
    if (r.delivered) { decided.current = true; onClose(); return; }
    // REQ-CHAT-102: nothing is reported as done; the modal stays open and says why.
    setBusy(false);
    setFailed(true);
  };

  if (!step) return null;
  const freeform = step.allow_freeform && (current?.selected_option ?? null) === null;
  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        ref={surface}
        tabIndex={-1}
        className="dialog question-stepper"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="question-stepper"
        data-request={prompt.request_id}
        data-session={prompt.session_id}
        data-step={index + 1}
        data-steps={steps.length}
      >
        <h2 id={titleId} className="dialog-title">Agent Questions</h2>
        {/* REQ-CHAT-099: numbered circular pills — active accent-filled, completed success-filled, inactive neutral. */}
        <ol className="question-stepper__pills" aria-label={`Step ${index + 1} of ${stepsPhrase(steps.length)}`} data-testid="question-pills">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className="question-stepper__pill"
              data-state={i === index ? 'active' : i < index ? 'done' : 'todo'}
              aria-current={i === index ? 'step' : undefined}
            >{i + 1}</li>
          ))}
        </ol>
        <p className="question-stepper__title" data-testid="question-step-title">{step.title}</p>
        {step.description !== '' && <p className="dialog-body question-stepper__description" data-testid="question-step-description">{step.description}</p>}
        {step.options.length > 0 && (
          <div className="question-stepper__options" role="radiogroup" aria-label={step.title} data-testid="question-options">
            {step.options.map((o) => {
              const selected = (current?.selected_option ?? null) === o.label;
              return (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`question-stepper__option${selected ? ' is-selected' : ''}`}
                  data-selected={selected ? 'true' : 'false'}
                  disabled={busy}
                  onClick={() => chooseOption(o.label)}
                >
                  <span className="question-stepper__option-label">{o.label}</span>
                  {o.description !== '' && <span className="question-stepper__option-description">{o.description}</span>}
                </button>
              );
            })}
          </div>
        )}
        {/* REQ-CHAT-100: visible only where the step allows freeform AND no option is selected. */}
        {freeform && (
          <textarea
            className="input question-stepper__freeform"
            aria-label={`A free answer for: ${step.title}`}
            data-testid="question-freeform"
            placeholder={FREEFORM_PLACEHOLDER}
            value={current?.freeform_text ?? ''}
            disabled={busy}
            onChange={(e) => setAnswer(step.id, { selected_option: null, freeform_text: e.target.value })}
          />
        )}
        {failed && <p className="question-stepper__status" role="alert" data-testid="question-failure">{QUESTION_DELIVERY_FAILED}</p>}
        <div className="dialog-actions question-stepper__actions">
          <button type="button" className="btn btn-ghost" data-testid="question-cancel" disabled={busy} onClick={() => close(true)}>Cancel</button>
          {/* REQ-CHAT-101: Back is disabled on the first step and preserves answers already entered. `data-disabled`
              rides beside the real `disabled` because a proof's probe reads `data-*` attributes; the control's own
              state is the DOM property, and the attribute mirrors it rather than standing in for it. */}
          <button type="button" className="btn btn-secondary" data-testid="question-back" data-disabled={String(index === 0 || busy)} disabled={index === 0 || busy} onClick={() => setIndex((i) => Math.max(0, i - 1))}>Back</button>
          {/* REQ-CHAT-101: Next is HIDDEN on the last step; Submit APPEARS only there; both gated on an answer. */}
          {!last && <button type="button" className="btn btn-primary" data-testid="question-next" data-disabled={String(!answered || busy)} disabled={!answered || busy} onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}>Next</button>}
          {last && <button type="button" className="btn btn-primary" data-testid="question-submit" data-disabled={String(!answered || busy)} disabled={!answered || busy} onClick={() => { void submit(); }}>{busy ? 'Submitting…' : 'Submit'}</button>}
        </div>
      </div>
    </div>
  );
}
