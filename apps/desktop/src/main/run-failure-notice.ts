import { presentationStatus } from '@rotaris/contracts';
import type { ReportInput } from './notices.js';
import type { FallbackOutcome } from './auth-fallback.js';
import { classifyRunFailure, isQuotaFailure, type RunFailureClass } from './failure-class.js';

/**
 * REQ-NOTIFY-060/063/064/065, REQ-NOTIFY-030/031/032 — what main publishes when a run ends, decided here and nowhere else.
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
 * PD-SHELL-001 revision 3 (OQ-292, ruled 2026-10-14 under R-072): "Open the session" names the session AND the workspace the
 * run host recorded it under, so a press in any window reaches that workspace and focuses the session there. With no recorded
 * workspace the notice carries no action, rather than one that guesses a window.
 */
function openTheSession(sessionId: string, workspace: string | undefined): Pick<ReportInput, 'action'> {
  return workspace === undefined || workspace === '' ? {} : { action: { label: 'Open the session', action: { kind: 'focus-session', sessionId, workspace } } };
}

/**
 * REQ-NOTIFY-032: a run other than the focused one failed. Severity `warning` (REQ-NOTIFY-065 does not reach it), persistent,
 * naming the session, the failure text exactly as the run reported it as copyable detail, and the action focusing that
 * session in its own workspace (`workspace`, PD-SHELL-001 revision 3). It is the only notice the failure raises while the
 * session is not focused; the class's own notice, and its recovery, arrive when the session is focused (REQ-NOTIFY-030).
 */
export function unfocusedFailureNotice(sessionId: string, failure: string, workspace: string | undefined): ReportInput {
  return {
    severity: 'warning', title: `Session ${sessionId} failed`,
    message: 'The session on screen is unaffected. Open the failed session to see its recovery.',
    detail: failure, persistent: true, ...openTheSession(sessionId, workspace), sessionId,
  };
}

/**
 * REQ-NOTIFY-031 (with REQ-MONITOR-202): a run other than the focused one reached a state that is not a failure. Persistent,
 * naming the session and the state it reached — in the normalised vocabulary (REQ-NOTIFY-048/049), never a raw status —
 * at `success` where that state is `completed` and `info` for every other, stating that the session on screen is
 * unaffected and that the finished one can be opened for review, and focusing it. Scoped to the session, so it survives
 * an unrelated run's start (REQ-NOTIFY-029) and reads as unread (REQ-NOTIFY-028).
 */
export function unfocusedEndingNotice(sessionId: string, executionStatus: string, workspace: string | undefined): ReportInput {
  const state = presentationStatus(executionStatus);
  return {
    severity: state === 'completed' ? 'success' : 'info', title: `Session ${sessionId} ${state}`,
    message: 'The session on screen is unaffected. Open the finished session to review it.',
    persistent: true, ...openTheSession(sessionId, workspace), sessionId,
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
 *   ended otherwise on a provider limit (a cancelled quota wait, REQ-NOTIFY-093), REQ-NOTIFY-063's notice with `quota`, the
 *   limit's text, so a session not on screen can hold that notice for its focus (`RunFailurePublisher.endedOtherwise`).
 */
export type RunEndingPublication =
  | { readonly kind: 'reported' }
  | { readonly kind: 'failure'; readonly failureClass: RunFailureClass; readonly failure: string }
  | { readonly kind: 'notice'; readonly notice: ReportInput; readonly quota?: string };

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
  if (result.error !== null && isQuotaFailure(result.error)) return { kind: 'notice', notice: quotaFailureNotice(sessionId, result.error), quota: result.error };
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
  /**
   * REQ-NOTIFY-070 (the 401 note's part A, `auth-fallback.ts`): the authentication class's automatic half, asked first —
   * `restarted` (the fallback pinned, its acknowledgement raised and the prompt of REQ-NOTIFY-071 open: nothing more is
   * published), `dialog` (a second failure, or a first with no usable fallback: REQ-NOTIFY-072), `generic` (REQ-NOTIFY-069's
   * preconditions, or a restart that could not begin) or `stale` (a run of the session is active again: nothing).
   */
  readonly fallBack: (sessionId: string, failure: string) => Promise<FallbackOutcome>;
  /** The authentication class's recovery dialog: opens it over the session's window, or answers why it did not. */
  readonly recoverAuthentication: (sessionId: string, failure: string) => Promise<AuthenticationRecoveryOutcome>;
  /** REQ-NOTIFY-079: the recovery dialog opened — every non-modal re-authentication prompt open is closed. */
  readonly closePrompts: () => void;
  /**
   * REQ-NOTIFY-058/029: a run of the session started — the standing notice is cleared where it is unscoped or scoped to that
   * session (`NoticeStore.clearForRunStart`). Called for REQ-NOTIFY-070's restart, which is a run of the session starting.
   */
  readonly clearForRunStart: (sessionId: string) => void;
  readonly log: (message: string) => void;
}

/**
 * REQ-NOTIFY-060/064 with REQ-NOTIFY-030/032 — the focus gate over a failed run's class publication. A failure of a session
 * on screen publishes its class at once: the authentication class tries the session's automatic fallback first
 * (REQ-NOTIFY-070) and, where that is not the first failure's or no usable fallback exists, opens the recovery dialog beside
 * its own notice (REQ-NOTIFY-072) — or, where REQ-NOTIFY-069's preconditions fail or the restart cannot begin, falls to the
 * generic notice; every other class raises its notice. A failure of a
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

  /**
   * A FAILED run of `sessionId`, its class fixed now (REQ-NOTIFY-032: the classification still runs while unfocused).
   * `workspace` is the root the run host recorded the session under (`run.result`'s `workspaceRoot`, PD-SHELL-001 revision 3).
   */
  async failed(sessionId: string, failureClass: RunFailureClass, failure: string, workspace?: string): Promise<void> {
    this.held.delete(sessionId);
    if (!this.deps.isFocused(sessionId)) {
      this.held.set(sessionId, { failureClass, failure });
      this.deps.report(unfocusedFailureNotice(sessionId, failure, workspace));
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

  /**
   * REQ-NOTIFY-031: a run of `sessionId` ended otherwise than failed, `notice` the one `runEndingPublication` decided. A
   * session on screen raises it; a session not on screen raises REQ-NOTIFY-031's notice naming it in its place, and nothing
   * changes the focus.
   *
   * REQ-NOTIFY-093: where the run ended on a provider limit (`quota`, the limit's text — a cancelled quota wait), a session
   * not on screen also holds the `quota` class, so focusing it publishes REQ-NOTIFY-063's notice and its model-settings
   * action (REQ-NOTIFY-030), exactly as a held failure class arrives under REQ-NOTIFY-032; a later ending supersedes it
   * (`ended`). The notice slot holds one notice, so the two about this ending are never on screen at once. Until
   * 2026-10-02 nothing was held, and the limit reached the user only as a plain ending
   * (docs/defects/fixed/a-background-run-ended-on-a-provider-limit-loses-its-quota-notice.md).
   */
  endedOtherwise(sessionId: string, notice: ReportInput, executionStatus: string, quota?: string, workspace?: string): void {
    if (this.deps.isFocused(sessionId)) { this.deps.report(notice); return; }
    this.deps.log(`run ending: session ${sessionId} is not focused; REQ-NOTIFY-031's notice is raised in place of its own${quota === undefined ? '' : ', and REQ-NOTIFY-063\'s waits for the focus'}`);
    if (quota !== undefined) this.held.set(sessionId, { failureClass: 'quota', failure: quota });
    this.deps.report(unfocusedEndingNotice(sessionId, executionStatus, workspace));
  }

  /** Whether a class publication is held for the session (verification and logs). */
  holds(sessionId: string): boolean {
    return this.held.has(sessionId);
  }

  private async publish(sessionId: string, failureClass: RunFailureClass, failure: string): Promise<void> {
    if (failureClass !== 'authentication') { this.deps.report(classFailureNotice(sessionId, failureClass, failure)); return; }
    // REQ-NOTIFY-070 ahead of REQ-NOTIFY-072: the session's first failure restarts on its fallback where it can; the dialog
    // takes the rest.
    const automatic = await this.deps.fallBack(sessionId, failure);
    if (automatic.kind === 'restarted') {
      // REQ-NOTIFY-058: the restart is a run of the session starting, so it clears the session's notice — REQ-NOTIFY-032's
      // warning, where the failure was held while the session was not on screen — and the acknowledgement and the prompt of
      // REQ-NOTIFY-070/071 are the failure's only report. Until 2026-10-06 the warning stayed beside the prompt: two notices
      // about one failure (docs/defects/fixed/a-run-that-fails-before-its-window-subscribes-raises-the-background-failure-warning-about-the-session-on-screen.md).
      this.deps.clearForRunStart(sessionId);
      return;
    }
    if (automatic.kind === 'stale') { this.deps.log(`authentication recovery: nothing to recover for session ${sessionId} (${automatic.reason})`); return; }
    if (automatic.kind === 'generic') {
      this.deps.log(`authentication recovery: session ${sessionId} takes the generic failure notice (${automatic.reason})`);
      this.deps.report(genericFailureNotice(sessionId, failure));
      return;
    }
    const r = await this.deps.recoverAuthentication(sessionId, failure);
    if (r.opened) {
      // REQ-NOTIFY-079: at most one authentication dialog is visible — the modal one closes every non-modal prompt.
      this.deps.closePrompts();
      this.deps.report(authenticationFailureNotice(sessionId, failure));
      return;
    }
    if (r.stale === true) { this.deps.log(`authentication recovery: nothing to recover for session ${sessionId} (${r.reason})`); return; }
    this.deps.log(`authentication recovery: no dialog for session ${sessionId} (${r.reason}); the generic failure notice is raised`);
    this.deps.report(genericFailureNotice(sessionId, failure));
  }
}
