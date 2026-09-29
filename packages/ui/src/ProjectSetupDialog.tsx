import { useEffect, useId, useRef, useState } from 'react';
import { EMPTY_RUN_REPORT, type InitRunReport, type InitStepResult, type InitTaskReport, type InitializationStateView } from '@rotaris/contracts';
import { Button as DesignButton } from './design-system/index.js';

/**
 * ADR-0064 — the project setup dialog (REQ-WORKSPACE-106..110).
 *
 * **Non-modal, and window-level.** REQ-WORKSPACE-106 says the rest of the application stays
 * navigable, so there is no backdrop that swallows clicks and no `aria-modal`: it is a panel the
 * window owns, which the composer gate of REQ-WORKSPACE-112 then makes consequential without making
 * it a trap. Exactly one thing is blocked while it is unanswered — sending a prompt — and the
 * dialog's own text says so.
 *
 * **Every exit path is a decision** (REQ-WORKSPACE-107): Escape and the close control both resolve
 * as a *skip*, because leaving the question open would let the composer gate stand forever with
 * nothing on screen explaining it. The one exception is the prompt disappearing underneath an
 * auto-opened, unanswered dialog — that closes without recording anything, since the user never
 * answered and the question no longer exists. A dialog the user opened on purpose is never
 * auto-closed.
 *
 * **Craft**: `docs/design/mockup` draws no setup surface (README §3.2), so this is the adopted
 * language as the neighbouring dialogs already apply it — `dialog`, `dialog-title`, `dialog-body`,
 * `dialog-actions`, the `mono` block the failure surfaces use. No colour and no size is written here,
 * and no state is carried by colour alone (REQ-SHELL-149): every status is a word.
 */
export const SETUP_TITLE = 'Set up this project';
export const SETUP_HEADLINE = 'Set up this project?';
export const SETUP_HEADLINE_EMPTY = 'Nothing to set up';
export const SETUP_INTRO_EMPTY = 'This workspace has no setup task left to run.';
export const SETUP_SKIP_LABEL = 'Skip for now';
export const SETUP_SKIP_DESCRIPTION = 'Defer these tasks. You can run them later from Settings › Project.';
export const SETUP_RUN_LABEL = 'Initialize project';
export const SETUP_RUN_DESCRIPTION = 'Run every listed task now. Each one reports its own result below.';
export const SETUP_RUNNING_REASON = 'Setup is running. It reports each step as it finishes.';
export const SETUP_LOG_SEED = 'Setup started. Each step appears here as it finishes.';
export const SETUP_RUNNING_STATUS = 'Setting up this project. This can take a few minutes.';
export const SETUP_DONE_HEADLINE = 'Project setup finished';
export const SETUP_DONE_STATUS = 'Setup finished. The results are listed above.';
export const SETUP_ERROR_HEADLINE = 'Project setup did not finish';
export const SETUP_RETRY_LABEL = 'Retry initialization';
export const SETUP_RETRY_DESCRIPTION = 'Run the tasks that failed again. Nothing was recorded, so none of them are skipped.';

/** REQ-WORKSPACE-106: "{n} one-time setup task(s) can run in this workspace…" */
export function setupIntro(count: number): string {
  if (count === 0) return SETUP_INTRO_EMPTY;
  return `${count} one-time setup task${count === 1 ? '' : 's'} can run in this workspace. They run once; you can skip them and start any time from Settings › Project.`;
}

/** REQ-WORKSPACE-106: the live status word per task card. A word, never a colour (REQ-SHELL-149). */
export type SetupTaskWord = 'Pending' | 'Running' | 'Done' | 'Skipped' | 'Failed';
export function taskWord(id: string, report: InitRunReport): SetupTaskWord {
  const done = report.tasks.find((t) => t.id === id);
  if (done) return done.status === 'success' ? 'Done' : done.status === 'skipped' ? 'Skipped' : 'Failed';
  if (report.current === id) return 'Running';
  return 'Pending';
}

/** REQ-WORKSPACE-108's four glyphs. The glyph is decoration; the status word beside it carries the state. */
export function stepGlyph(status: string): string {
  if (status === 'succeeded' || status === 'success') return '✓';
  if (status.includes('skip')) return '–';
  if (status === 'failed' || status === 'failure') return '✕';
  return '•';
}

function stepLine(step: InitStepResult): string {
  return `  ${stepGlyph(step.status)} ${step.name} — ${step.status}${step.detail === '' ? '' : `: ${step.detail}`}`;
}

function taskOutcomeLine(task: InitTaskReport): string {
  const glyph = task.status === 'success' ? '✓' : task.status === 'skipped' ? '–' : '✕';
  const text = task.status === 'failure' ? task.error : task.summary;
  return `  ${glyph} ${task.label}: ${text}`;
}

/**
 * REQ-WORKSPACE-108: "▶ {label}" per task, then each step indented, then the task-outcome line —
 * and REQ-WORKSPACE-109: a step appears the moment it finishes, so the task in flight contributes
 * its heading and whatever steps it has reported, with no outcome line yet.
 */
export function setupLog(report: InitRunReport): string {
  const lines: string[] = [SETUP_LOG_SEED];
  for (const task of report.tasks) {
    lines.push(`▶ ${task.label}`);
    for (const step of task.steps) lines.push(stepLine(step));
    lines.push(taskOutcomeLine(task));
  }
  if (report.current !== null) {
    lines.push(`▶ ${report.currentLabel}`);
    for (const step of report.currentSteps) lines.push(stepLine(step));
  }
  return lines.join('\n');
}

export type SetupDialogState = 'prompt' | 'running' | 'done' | 'error';

/** REQ-WORKSPACE-106: four states, and the one the report and the run put it in. */
/**
 * REQ-WORKSPACE-106's four states.
 *
 * `stillPending` is not a convenience: **a run that reported every task it attempted is not the same as
 * everything the dialog offered being resolved.** On a fresh workspace the background task starts at open
 * and the consent prompt is raised in the same resolution (REQ-WORKSPACE-083), so the background run
 * finishes while the consent task is still unanswered — and taken from the report alone the dialog
 * headlined "Project setup finished" over a card reading "Pending" and offered only Close, which would
 * have closed an owed decision with no decision (REQ-WORKSPACE-107). Found by the screenshot, not by the
 * DOM assertions beside it, which were all green on the same frame.
 */
export function setupDialogState(report: InitRunReport, stillPending = 0): SetupDialogState {
  if (report.running) return 'running';
  if (report.outcome === null) return 'prompt';
  // A cancelled run did not finish, and REQ-WORKSPACE-093 says cancelling leaves a task in exactly the
  // retryable condition a failure would — so it takes the error state, not the one headlined "finished".
  if (report.outcome !== 'reported' || report.tasks.some((t) => t.status === 'failure')) return 'error';
  return stillPending > 0 ? 'prompt' : 'done';
}

/**
 * The run report the dialog draws. A run the resolution started for background tasks is not the dialog's: nothing
 * renders its progress live (REQ-WORKSPACE-103), and a failed one reaches a banner, not this dialog. Until the user
 * presses Initialize, the dialog draws no report at all for it and stays in its prompt state, where Escape and "Skip
 * for now" are live (REQ-WORKSPACE-107). Pressing Initialize while it runs starts nothing and flips the dialog to its
 * in-progress state (REQ-WORKSPACE-110), and from then on the dialog draws that run as its own (`adopted`).
 * Taking the report whatever its run, the dialog switched to "running" under the user's own Escape, and in the other
 * order it ignored Escape, so no decision was recorded
 * (`docs/defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md`).
 */
export function dialogReport(state: InitializationStateView, adopted: boolean): InitRunReport {
  return state.backgroundRun && !adopted ? EMPTY_RUN_REPORT : state.report;
}

/**
 * REQ-WORKSPACE-105: the setup prompt is due when a consent-requiring task is pending and no run is in progress. As
 * built under OQ-110, the run meant is one the user started. A background run starts "regardless of whether a prompt is
 * also due" (REQ-WORKSPACE-083) and answers nothing, so it neither withdraws the prompt nor lifts the composer gate of
 * REQ-WORKSPACE-112. The window's auto-open and the composer gate both read this one answer.
 */
export function setupPromptDue(state: InitializationStateView | null): boolean {
  if (state === null) return false;
  return state.view.consentPending.length > 0 && !(state.view.running && !state.backgroundRun);
}

export interface ProjectSetupDialogProps {
  readonly state: InitializationStateView;
  /** Whether the window opened this by itself; a manually opened dialog is never auto-closed (REQ-WORKSPACE-107). */
  readonly auto: boolean;
  readonly onInitialize: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
  readonly onSkip: (ids: readonly string[]) => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
  readonly onClose: () => void;
}

export function ProjectSetupDialog({ state, auto, onInitialize, onSkip, onClose }: ProjectSetupDialogProps) {
  const titleId = useId();
  const [message, setMessage] = useState<string | null>(null);
  const resolved = useRef(false);
  // REQ-WORKSPACE-110: set by pressing Initialize, which is what makes a live background run this dialog's to draw.
  const [adopted, setAdopted] = useState(false);
  const { view, labels } = state;
  const report = dialogReport(state, adopted);
  // REQ-WORKSPACE-108: the error state REOPENS the decision, so closing now records a skip again.
  const listed = view.pending.length > 0 ? view.pending : [...view.skipped];
  const stillPending = listed.filter((id) => taskWord(id, report) === 'Pending').length;
  const dialogState = setupDialogState(report, stillPending);
  const running = dialogState === 'running';
  const offered = dialogState === 'error' ? report.tasks.filter((t) => t.status === 'failure').map((t) => t.id) : listed;

  /** REQ-WORKSPACE-107: dismissing resolves as a skip — every exit path yields an explicit decision. */
  const dismiss = async (): Promise<void> => {
    if (running || resolved.current) return;
    resolved.current = true;
    const r = await onSkip(offered);
    if (!r.ok) { resolved.current = false; setMessage(r.message); return; }
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !running) { event.preventDefault(); void dismiss(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // REQ-WORKSPACE-107: the underlying prompt disappearing closes an AUTO-opened, unanswered dialog
  // without recording a skip. A dialog the user opened is left exactly where it is.
  useEffect(() => {
    if (auto && !running && dialogState === 'prompt' && view.consentPending.length === 0 && view.pending.length === 0) onClose();
  }, [auto, running, dialogState, view.consentPending.length, view.pending.length, onClose]);

  const initialize = async (): Promise<void> => {
    setMessage(null);
    // REQ-WORKSPACE-110: with a background run live, Initialize starts nothing and the dialog shows that run from now on.
    // With none live, the run it starts is the user's own and is drawn without adopting anything.
    if (state.view.running && state.backgroundRun) setAdopted(true);
    const r = await onInitialize();
    if (!r.ok) setMessage(r.message);
  };

  const headline = dialogState === 'done' ? SETUP_DONE_HEADLINE
    : dialogState === 'error' ? SETUP_ERROR_HEADLINE
      : stillPending === 0 ? SETUP_HEADLINE_EMPTY : SETUP_HEADLINE;

  return (
    <section className="dialog project-setup" role="dialog" aria-labelledby={titleId} data-testid="project-setup-dialog" data-setup-state={dialogState}>
      <h2 id={titleId} className="dialog-title" data-testid="project-setup-title">{SETUP_TITLE}</h2>
      <p className="dialog-body" data-testid="project-setup-headline"><strong>{headline}</strong></p>
      {dialogState === 'prompt' ? <p className="dialog-body" data-testid="project-setup-intro">{setupIntro(stillPending)}</p> : null}

      <ul className="project-setup__tasks" aria-label="Setup tasks" data-testid="project-setup-tasks">
        {listed.map((id) => (
          <li key={id} className="card project-setup__task" data-setup-task={id} data-setup-word={taskWord(id, report)}>
            <div className="project-setup__task-head">
              <span className="project-setup__task-label">{labels[id] ?? id}</span>
              <span className="text-secondary" data-setup-task-word>{taskWord(id, report)}</span>
            </div>
            <p className="text-secondary" data-setup-task-description>{state.descriptions[id] ?? ''}</p>
          </li>
        ))}
      </ul>

      {running || report.tasks.length > 0 ? (
        <pre className="settings__raw mono" aria-label="Setup progress" data-testid="project-setup-log">{setupLog(report)}</pre>
      ) : null}

      {running ? <p role="status" className="text-secondary" aria-busy="true" data-testid="project-setup-status">{SETUP_RUNNING_STATUS}</p> : null}
      {dialogState === 'done' ? <p role="status" className="text-secondary" data-testid="project-setup-status">{SETUP_DONE_STATUS}</p> : null}
      {dialogState === 'error' ? <p role="alert" className="composer__error" data-testid="project-setup-failure">{report.error !== '' ? report.error : report.tasks.filter((t) => t.status === 'failure').map((t) => t.error).join(' ')}</p> : null}
      {message !== null ? <p role="alert" className="composer__error" data-testid="project-setup-refused">{message}</p> : null}

      <div className="dialog-actions">
        {dialogState === 'done' ? (
          <DesignButton type="button" className="btn btn-primary" onClick={onClose} data-action="setup-close">Close</DesignButton>
        ) : (
          <>
            <DesignButton type="button" className="btn btn-secondary" disabled={running} title={running ? SETUP_RUNNING_REASON : SETUP_SKIP_DESCRIPTION} onClick={() => { void dismiss(); }} data-action="setup-skip">{SETUP_SKIP_LABEL}</DesignButton>
            <DesignButton type="button" className="btn btn-primary" disabled={running} title={running ? SETUP_RUNNING_REASON : dialogState === 'error' ? SETUP_RETRY_DESCRIPTION : SETUP_RUN_DESCRIPTION} onClick={() => { void initialize(); }} data-action="setup-run">
              {running ? 'Initializing…' : dialogState === 'error' ? SETUP_RETRY_LABEL : SETUP_RUN_LABEL}
            </DesignButton>
          </>
        )}
      </div>
      <p className="text-tertiary settings__hint" data-testid="project-setup-hint">
        {running ? SETUP_RUNNING_REASON : dialogState === 'error' ? SETUP_RETRY_DESCRIPTION : `${SETUP_SKIP_LABEL}: ${SETUP_SKIP_DESCRIPTION} ${SETUP_RUN_LABEL}: ${SETUP_RUN_DESCRIPTION}`}
      </p>
    </section>
  );
}
