import type { ReportInput } from './notices.js';
import { classifyRunFailure, isQuotaFailure, type RunFailureClass } from './failure-class.js';

/**
 * REQ-NOTIFY-060/063/064/065, REQ-NOTIFY-030/032 — what main publishes when a run ends, decided here and nowhere else.
 * Pure: the run's result in, the notice (or the class to recover) out, so a test pins every word and action without an
 * Electron process. Main's run-result handler (`index.ts`) is the only caller; the focus gate is `RunFailurePublisher`.
 */

/** REQ-NOTIFY-064's title. */
export const RUN_FAILED = 'The run failed';
/** REQ-NOTIFY-064's statement: the session and the draft were kept. */
export const SESSION_AND_DRAFT_KEPT = 'The session and the draft were kept.';
/** The authentication class's title, raised beside the recovery dialog (REQ-NOTIFY-072/080). */
export const AUTHENTICATION_FAILED = 'Authentication failed';
/** REQ-NOTIFY-063's title (Part Q). */
export const PROVIDER_LIMIT_REACHED = 'The provider limit was reached; the session is preserved';

/** REQ-NOTIFY-064/061: the action returning to the workspace view (REQ-SHELL-023's `workspace`). */
const BACK_TO_WORKSPACE = { label: 'Back to the workspace', action: { kind: 'open-view', view: 'workspace' } } as const;
/** REQ-NOTIFY-063: the action opening the model settings. */
const OPEN_MODELS = { label: 'Open Models settings', action: { kind: 'open-settings', category: 'models' } } as const;

/**
 * REQ-NOTIFY-064 / REQ-NOTIFY-065: a failure matching no earlier class — severity `error`, persistent, the statement that
 * the run failed and that the session and the draft were kept, the failure text as copyable detail, and the action
 * returning to the workspace view. Scoped to the session that failed (REQ-NOTIFY-028/029: a run of another session
 * starting does not clear it).
 */
export function genericFailureNotice(sessionId: string, failure: string): ReportInput {
  return { severity: 'error', title: RUN_FAILED, message: SESSION_AND_DRAFT_KEPT, detail: failure, persistent: true, action: BACK_TO_WORKSPACE, sessionId };
}

/**
 * The authentication class's error notice, beside the recovery dialog: REQ-NOTIFY-064's shape under its own title, so it
 * stays on screen when the dialog is cancelled (REQ-NOTIFY-080) and names where the recovery is.
 */
export function authenticationFailureNotice(sessionId: string, failure: string): ReportInput {
  return { ...genericFailureNotice(sessionId, failure), title: AUTHENTICATION_FAILED, message: `${SESSION_AND_DRAFT_KEPT} Choose another model or re-authenticate in the recovery dialog.` };
}

/** REQ-NOTIFY-063/093 (Part Q): the provider limit was reached; another model, or a retry once the provider resets. */
export function quotaFailureNotice(sessionId: string, failure: string): ReportInput {
  return { severity: 'error', title: PROVIDER_LIMIT_REACHED, detail: `${failure}\n\nChoose another model, or retry once the provider resets.`, persistent: true, action: OPEN_MODELS, sessionId };
}

/**
 * REQ-NOTIFY-032: a run other than the focused one failed. Severity `warning` (REQ-NOTIFY-065 does not reach it), persistent,
 * naming the session, the failure text exactly as the run reported it as copyable detail, and the action focusing that
 * session. It is the only notice the failure raises while the session is not focused; the class's own notice, and its
 * recovery, arrive when the session is focused (REQ-NOTIFY-030).
 */
export function unfocusedFailureNotice(sessionId: string, failure: string): ReportInput {
  return {
    severity: 'warning', title: `Session ${sessionId} failed`,
    message: 'The session on screen is unaffected. Open the failed session to see its recovery.',
    detail: failure, persistent: true, action: { label: 'Open the session', action: { kind: 'focus-session', sessionId } }, sessionId,
  };
}

/** The fields of a run's result the decision reads (`RunResult`). */
export interface RunEnding {
  readonly error: string | null;
  readonly status: string;
  readonly execution_status: string;
  readonly summary: string;
  readonly severity: string;
  /** REQ-EVENTS-088: present where the run's terminal persistence could not be confirmed (already reported by the run host). */
  readonly persistence?: unknown;
}

/**
 * What a run's ending publishes.
 * - `reported`: REQ-EVENTS-088 — the run host already published the one failure notice; nothing more.
 * - `failure`: a FAILED run, its REQ-NOTIFY-060 class and failure text — published through the focus gate (REQ-NOTIFY-032).
 * - `notice`: any other ending — the outcome at the severity summarisation assigned (REQ-SESSION-186), or, for a run that
 *   ended otherwise on a provider limit (a cancelled quota wait, REQ-NOTIFY-093), REQ-NOTIFY-063's notice.
 */
export type RunEndingPublication =
  | { readonly kind: 'reported' }
  | { readonly kind: 'failure'; readonly failureClass: RunFailureClass; readonly failure: string }
  | { readonly kind: 'notice'; readonly notice: ReportInput };

/** Whether the result is a FAILED run — the runs REQ-NOTIFY-060 classifies. */
export function isFailedRun(result: Pick<RunEnding, 'status' | 'execution_status'>): boolean {
  return result.execution_status === 'failed' || result.status === 'failed' || result.status === 'error';
}

export function runEndingPublication(sessionId: string, result: RunEnding): RunEndingPublication {
  if (result.persistence !== undefined) return { kind: 'reported' };
  const severity = result.severity === 'error' ? 'error' : result.severity === 'warning' ? 'warning' : 'info';
  if (isFailedRun(result)) {
    // REQ-NOTIFY-064: a failed run with no failure text still takes the generic class — its summary is the detail.
    const failure = result.error ?? result.summary;
    return { kind: 'failure', failureClass: classifyRunFailure(result.error), failure };
  }
  if (result.error !== null && isQuotaFailure(result.error)) return { kind: 'notice', notice: quotaFailureNotice(sessionId, result.error) };
  return { kind: 'notice', notice: { severity, title: result.summary, ...(result.error === null ? {} : { detail: result.error }) } };
}

/** The class's own notice for a failure whose class needs no recovery surface (every class but authentication). */
export function classFailureNotice(sessionId: string, failureClass: Exclude<RunFailureClass, 'authentication'>, failure: string): ReportInput {
  return failureClass === 'quota' ? quotaFailureNotice(sessionId, failure) : genericFailureNotice(sessionId, failure);
}

/** How the authentication class's recovery went (`AuthRecovery.onAuthenticationFailure`). */
export type AuthenticationRecoveryOutcome =
  | { readonly opened: true }
  | { readonly opened: false; readonly reason: string; readonly stale?: boolean };

export interface RunFailurePublisherDeps {
  /** REQ-NOTIFY-030/032: whether a main window follows the session — the session is on screen. */
  readonly isFocused: (sessionId: string) => boolean;
  readonly report: (notice: ReportInput) => void;
  /** The authentication class's recovery: opens the dialog over the session's window, or answers why it did not. */
  readonly recoverAuthentication: (sessionId: string, failure: string) => Promise<AuthenticationRecoveryOutcome>;
  readonly log: (message: string) => void;
}

/**
 * REQ-NOTIFY-060/064 with REQ-NOTIFY-030/032 — the focus gate over a failed run's class publication. A failure of a session
 * on screen publishes its class at once: the authentication class opens the recovery dialog beside its own notice (or, where
 * REQ-NOTIFY-069's preconditions fail, falls to the generic notice); every other class raises its notice. A failure of a
 * session NOT on screen raises REQ-NOTIFY-032's warning and nothing else, and the class publication is held until a main
 * window follows that session — so no recovery dialog opens over another session's window, and two notices about one
 * failure are never on screen at once. A later ending of the same session replaces what was held.
 */
export class RunFailurePublisher {
  private readonly held = new Map<string, { readonly failureClass: RunFailureClass; readonly failure: string }>();
  constructor(private readonly deps: RunFailurePublisherDeps) {}

  /** A run of `sessionId` ended: whatever was held for the session is superseded by this ending. */
  ended(sessionId: string): void {
    if (this.held.delete(sessionId)) this.deps.log(`run failure: the held recovery for session ${sessionId} is superseded by a later ending`);
  }

  /** A FAILED run of `sessionId`, its class fixed now (REQ-NOTIFY-032: the classification still runs while unfocused). */
  async failed(sessionId: string, failureClass: RunFailureClass, failure: string): Promise<void> {
    this.held.delete(sessionId);
    if (!this.deps.isFocused(sessionId)) {
      this.held.set(sessionId, { failureClass, failure });
      this.deps.report(unfocusedFailureNotice(sessionId, failure));
      this.deps.log(`run failure: session ${sessionId} is not focused; REQ-NOTIFY-032's notice is raised and the ${failureClass} recovery waits for the focus`);
      return;
    }
    await this.publish(sessionId, failureClass, failure);
  }

  /** REQ-NOTIFY-030/032: a main window began following `sessionId` — its held class publication arrives now. */
  async focused(sessionId: string): Promise<void> {
    const held = this.held.get(sessionId);
    if (held === undefined) return;
    this.held.delete(sessionId);
    this.deps.log(`run failure: session ${sessionId} is focused; its ${held.failureClass} recovery is published`);
    await this.publish(sessionId, held.failureClass, held.failure);
  }

  /** Whether a class publication is held for the session (verification and logs). */
  holds(sessionId: string): boolean {
    return this.held.has(sessionId);
  }

  private async publish(sessionId: string, failureClass: RunFailureClass, failure: string): Promise<void> {
    if (failureClass !== 'authentication') { this.deps.report(classFailureNotice(sessionId, failureClass, failure)); return; }
    const r = await this.deps.recoverAuthentication(sessionId, failure);
    if (r.opened) { this.deps.report(authenticationFailureNotice(sessionId, failure)); return; }
    if (r.stale === true) { this.deps.log(`authentication recovery: nothing to recover for session ${sessionId} (${r.reason})`); return; }
    this.deps.log(`authentication recovery: no dialog for session ${sessionId} (${r.reason}); the generic failure notice is raised`);
    this.deps.report(genericFailureNotice(sessionId, failure));
  }
}
