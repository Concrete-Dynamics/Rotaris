import { useEffect, useId, useRef, useState } from 'react';
import { stepsPhrase, type QuestionAnswer, type QuestionAnswers, type QuestionPrompt, type QuestionStep } from '@rotaris/contracts';
import { Button as DesignButton, TextArea as DesignTextArea } from './design-system/index.js';

/**
 * PD-CHAT-002 (superseding REQ-CHAT-098/099, narrowing REQ-CHAT-101/103, extending REQ-CHAT-061/097/100/102):
 * Structured questions present an auto-opened, all-in-one form docked at the bottom of the transcript tail above the
 * composer, plus a rendered summary for settled rows in the transcript history.
 *
 * Invariant rules:
 *   - REQ-CHAT-102: a success outcome is never reported unless a waiting tool call received the answers. The
 *     form stays open with the requirement's sentence if delivery failed.
 *   - REQ-CHAT-101: closing emits cancellation exactly once. Guarded by a ref against race conditions.
 *   - REQ-CHAT-100: options are single-select cards; clicking the selected card deselects it; selecting an option
 *     clears freeform text; freeform editor is visible only when allowed and no option is selected.
 */
export interface QuestionFormProps {
  readonly prompt: QuestionPrompt;
  /** REQ-CHAT-101/102: every step's answer in one payload; `delivered` false when no waiting call received it. */
  readonly onSubmit: (answers: QuestionAnswers) => Promise<{ delivered: boolean }>;
  /** REQ-CHAT-101/102: cancellation forwarded to the waiting tool. Called at most once by this component. */
  readonly onCancel: () => void;
  /** Optional surface bookkeeping: the form is dismissed. Never a decision (REQ-CHAT-098). */
  readonly onClose?: (() => void) | undefined;
}

export type QuestionStepperProps = QuestionFormProps;

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

/**
 * PD-CHAT-002: All-in-one scrollable form docked at the bottom of the transcript.
 * Displays all steps concurrently, enables Submit once all steps have answers, and handles Escape/close cancellations.
 */
export function QuestionForm({ prompt, onSubmit, onCancel, onClose }: QuestionFormProps) {
  const titleId = useId();
  const [answers, setAnswers] = useState<QuestionAnswers>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  /** REQ-CHAT-101: exactly once, whatever route dismissed the form — held in a ref. */
  const decided = useRef(false);
  const surface = useRef<HTMLDivElement>(null);

  const steps = prompt.steps;
  const allAnswered = steps.length > 0 && steps.every((s) => hasAnswer(answers[s.id]));

  const close = (cancel: boolean) => {
    if (decided.current) return;
    decided.current = true;
    if (cancel) onCancel();
    onClose?.();
  };

  useEffect(() => () => { decided.current = true; }, []);

  useEffect(() => { surface.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  useEffect(() => {
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
  const chooseOption = (stepId: string, label: string) => {
    const current = answers[stepId];
    const already = current?.selected_option === label;
    setAnswer(stepId, already
      ? { selected_option: null, freeform_text: current?.freeform_text ?? null }
      : { selected_option: label, freeform_text: null });
  };

  const submit = async () => {
    if (busy || !allAnswered) return;
    setBusy(true);
    setFailed(false);
    // REQ-CHAT-095: one entry per step in the payload.
    const payload: QuestionAnswers = {};
    for (const s of steps) payload[s.id] = answers[s.id] ?? { selected_option: null, freeform_text: null };
    const r = await onSubmit(payload);
    if (r.delivered) { decided.current = true; onClose?.(); return; }
    // REQ-CHAT-102: modal/form stays open showing delivery failure sentence.
    setBusy(false);
    setFailed(true);
  };

  return (
    <div
      ref={surface}
      tabIndex={-1}
      className="question-form"
      role="region"
      aria-label="Agent Questions"
      aria-labelledby={titleId}
      data-testid="question-stepper"
      data-request={prompt.request_id}
      data-session={prompt.session_id}
      data-step="1"
      data-steps={steps.length}
    >
      <div className="question-form__header">
        <div className="question-form__title-row">
          <span className="question-form__role-badge mono">{prompt.persona || prompt.agent_id || 'orchestrator'}</span>
          <h2 id={titleId} className="question-form__title">
            {prompt.persona ? `${prompt.persona} has questions` : 'Agent Questions'} · {stepsPhrase(steps.length)}
          </h2>
        </div>
        {/* REQ-CHAT-099 pills retained as overall progress indicator */}
        <ol className="question-form__pills" aria-label={`Question steps (${stepsPhrase(steps.length)})`} data-testid="question-pills">
          {steps.map((s, i) => {
            const isDone = hasAnswer(answers[s.id]);
            return (
              <li
                key={s.id}
                className="question-form__pill"
                data-state={isDone ? 'done' : 'active'}
                title={`${i + 1}. ${s.title}`}
              >
                {i + 1}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="question-form__hint text-secondary">
        All answers are returned to the waiting agent in one submission.
      </p>

      {/* PD-CHAT-002: All-in-one scrollable steps container */}
      <div className="question-form__steps" data-testid="question-steps">
        {steps.map((s, index) => {
          const current = answers[s.id];
          const freeform = s.allow_freeform && (current?.selected_option ?? null) === null;
          return (
            <div key={s.id} className="question-form__step" data-step-index={index + 1}>
              <div className="question-form__step-heading">
                <span className="question-form__step-num mono">{index + 1}</span>
                <span className="question-form__step-title" data-testid="question-step-title">{s.title}</span>
              </div>
              {s.description !== '' && (
                <p className="question-form__step-description text-secondary" data-testid="question-step-description">{s.description}</p>
              )}
              {s.options.length > 0 && (
                <div className="question-form__options" role="radiogroup" aria-label={s.title} data-testid="question-options">
                  {s.options.map((o) => {
                    const selected = (current?.selected_option ?? null) === o.label;
                    return (
                      <DesignButton
                        key={o.label}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`question-form__option${selected ? ' is-selected' : ''}`}
                        data-selected={selected ? 'true' : 'false'}
                        disabled={busy}
                        onClick={() => chooseOption(s.id, o.label)}
                      >
                        <span className="question-form__option-label">{o.label}</span>
                        {o.description !== '' && <span className="question-form__option-description">{o.description}</span>}
                      </DesignButton>
                    );
                  })}
                </div>
              )}
              {freeform && (
                <DesignTextArea
                  className="input question-form__freeform"
                  aria-label={`A free answer for: ${s.title}`}
                  data-testid="question-freeform"
                  placeholder={FREEFORM_PLACEHOLDER}
                  value={current?.freeform_text ?? ''}
                  disabled={busy}
                  onChange={(e) => setAnswer(s.id, { selected_option: null, freeform_text: e.target.value })}
                />
              )}
            </div>
          );
        })}
      </div>

      {failed && <p className="question-form__status" role="alert" data-testid="question-failure">{QUESTION_DELIVERY_FAILED}</p>}
      <div className="question-form__actions">
        <DesignButton type="button" className="btn btn-ghost" data-testid="question-cancel" disabled={busy} onClick={() => close(true)}>Cancel</DesignButton>
        <DesignButton
          type="button"
          className="btn btn-primary"
          data-testid="question-submit"
          data-disabled={String(!allAnswered || busy)}
          disabled={!allAnswered || busy}
          onClick={() => { void submit(); }}
        >
          {busy ? 'Submitting…' : 'Submit answers'}
        </DesignButton>
      </div>
    </div>
  );
}

/** Backward compatibility alias for QuestionForm */
export const QuestionStepper = QuestionForm;

export interface QuestionSummaryCardProps {
  readonly input?: string | undefined;
  readonly output?: string | undefined;
  readonly blockedReason?: string | undefined;
}

export interface ParsedAnswers {
  readonly kind: 'answers' | 'cancelled' | 'timed_out' | 'other';
  readonly answers: Record<string, string>;
  readonly rawText: string;
}

/**
 * REQ-CHAT-095: parses the model-visible result text to extract structured answers map or outcome state.
 */
export function parseAnswersText(output: string | undefined): ParsedAnswers {
  if (!output) return { kind: 'other', answers: {}, rawText: '' };
  const trimmed = output.trim();
  if (trimmed === 'Questions were cancelled.') {
    return { kind: 'cancelled', answers: {}, rawText: trimmed };
  }
  if (trimmed.startsWith('User did not respond')) {
    return { kind: 'timed_out', answers: {}, rawText: trimmed };
  }
  const answers: Record<string, string> = {};
  let inAnswersSection = false;
  for (const line of trimmed.split('\n')) {
    if (line.trim() === '## User Answers') {
      inAnswersSection = true;
      continue;
    }
    if (inAnswersSection) {
      const match = /^- \*\*([^*]+)\*\*:\s*(.*)$/.exec(line.trim());
      if (match && match[1]) {
        answers[match[1]] = match[2] ?? '';
      }
    }
  }
  if (Object.keys(answers).length > 0) {
    return { kind: 'answers', answers, rawText: trimmed };
  }
  return { kind: 'other', answers: {}, rawText: trimmed };
}

function parseSteps(input: string | undefined): QuestionStep[] | null {
  if (!input) return null;
  try {
    const data = JSON.parse(input) as { steps?: QuestionStep[] };
    if (Array.isArray(data.steps) && data.steps.length > 0) return data.steps;
    return null;
  } catch {
    return null;
  }
}

/**
 * PD-CHAT-002: Rendered read-only summary for historical ask_questions tool rows in transcript history.
 * Displays step titles and corresponding answers, with an explicit toggle to inspect raw untruncated JSON.
 */
export function QuestionSummaryCard({ input, output, blockedReason }: QuestionSummaryCardProps) {
  const [viewMode, setViewMode] = useState<'summary' | 'json'>('summary');
  const steps = parseSteps(input);
  const parsedOutput = parseAnswersText(output);

  return (
    <div className="tool__card question-summary" data-testid="question-summary">
      <div className="question-summary__header">
        <div className="question-summary__meta">
          <span className="question-summary__title mono">Structured Questions ({steps ? stepsPhrase(steps.length) : 'raw'})</span>
          {parsedOutput.kind === 'cancelled' && (
            <span className="question-summary__badge question-summary__badge--cancelled">Cancelled</span>
          )}
          {parsedOutput.kind === 'timed_out' && (
            <span className="question-summary__badge question-summary__badge--timeout">Timed Out</span>
          )}
          {parsedOutput.kind === 'answers' && (
            <span className="question-summary__badge question-summary__badge--answered">Answered</span>
          )}
        </div>
        {steps !== null && (
          <div className="question-summary__toggle" role="tablist" aria-label="Question display format">
            <DesignButton
              type="button"
              className={`btn btn-ghost btn-compact${viewMode === 'summary' ? ' is-active' : ''}`}
              data-testid="question-view-summary"
              onClick={() => setViewMode('summary')}
            >
              Summary
            </DesignButton>
            <DesignButton
              type="button"
              className={`btn btn-ghost btn-compact${viewMode === 'json' ? ' is-active' : ''}`}
              data-testid="question-view-json"
              onClick={() => setViewMode('json')}
            >
              Raw JSON
            </DesignButton>
          </div>
        )}
      </div>

      {viewMode === 'summary' && steps !== null ? (
        <div className="question-summary__body" data-testid="question-summary-body">
          {steps.map((s, i) => {
            const answerVal = parsedOutput.answers[s.id];
            const hasVal = Boolean(answerVal && answerVal !== '(no answer)');
            return (
              <div key={s.id} className="question-summary__item">
                <div className="question-summary__item-header">
                  <span className="question-summary__num mono">{i + 1}</span>
                  <span className="question-summary__item-title">{s.title}</span>
                </div>
                {s.description !== '' && (
                  <div className="question-summary__item-desc text-secondary">{s.description}</div>
                )}
                <div className="question-summary__answer">
                  {hasVal ? (
                    <span className="question-summary__answer-val">✓ {answerVal}</span>
                  ) : (
                    <span className="question-summary__answer-none text-secondary">
                      {parsedOutput.kind === 'cancelled' ? '(cancelled)' : parsedOutput.kind === 'timed_out' ? '(timed out)' : '(no answer)'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="question-summary__raw" data-testid="question-summary-raw">
          {input !== undefined && input !== '' && (
            <>
              <div className="tool__caption">INPUT</div>
              <pre className="tool__pre mono" data-testid="tool-input">{input}</pre>
            </>
          )}
          {output !== undefined && output !== '' && (
            <>
              <div className="tool__caption">OUTPUT</div>
              <pre className="tool__pre mono" data-testid="tool-output">{output}</pre>
            </>
          )}
        </div>
      )}
      {blockedReason && <div className="tool__blocked">{blockedReason}</div>}
    </div>
  );
}
