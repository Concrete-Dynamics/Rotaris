/**
 * The closed status vocabularies every process reads, in ONE place so no
 * second copy can drift: REQ-SESSION-073 (persisted execution status),
 * REQ-SESSION-055 (the six active values), REQ-ORCH-083 (terminal result),
 * REQ-MONITOR-301 (stop reasons), REQ-NOTIFY-048/049/050 (presentation).
 *
 * The mappings between them that a RUN performs live in the engine; what a
 * SURFACE needs — is this busy, how does it present — lives here so the
 * renderer never renders a raw persisted string (REQ-MONITOR-025).
 */
export const EXECUTION_STATUSES = [
  'idle', 'running', 'background', 'waiting', 'paused', 'paused_message_limit', 'awaiting_plan_decision',
  'completed', 'failed', 'stopped', 'interrupted', 'starting', 'pausing', 'cancelling',
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/** REQ-SESSION-055: exactly six assert a run in progress. Exact, case-sensitive. */
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set(['starting', 'running', 'background', 'waiting', 'pausing', 'cancelling']);
export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

/** REQ-ORCH-083: the closed terminal run-result set. */
export const TERMINAL_RESULTS = ['completed', 'failed', 'max_iterations', 'interrupted', 'error'] as const;
export type TerminalResult = (typeof TERMINAL_RESULTS)[number];

/** REQ-MONITOR-301: the closed stop-reason set. */
export const STOP_REASONS = [
  'tasks_complete', 'no_pending_tasks', 'user_cancelled', 'application_shutdown', 'message_limit_reached',
  'iteration_limit_reached', 'time_limit_reached', 'repetition_detected', 'agent_session_aborted',
] as const;
export type StopReason = (typeof STOP_REASONS)[number];

/** REQ-NOTIFY-048: the nine presentation states; `cancelled` is withdrawn. */
export const PRESENTATION_STATUSES = ['cancelling', 'completed', 'failed', 'idle', 'paused', 'pausing', 'running', 'starting', 'stopped'] as const;
export type PresentationStatus = (typeof PRESENTATION_STATUSES)[number];

/** REQ-NOTIFY-049: every persisted value has an arm; a value this build does not know presents as idle. */
export function presentationStatus(persisted: string): PresentationStatus {
  switch (persisted as ExecutionStatus) {
    case 'idle': case 'running': case 'paused': case 'completed': case 'failed': case 'stopped': case 'starting': case 'pausing': case 'cancelling':
      return persisted as PresentationStatus;
    case 'background':
    case 'waiting':
      return 'running';
    case 'paused_message_limit':
    case 'awaiting_plan_decision':
      return 'paused';
    // REQ-NOTIFY-049: a repaired session's `interrupted` is at rest, not resumable — REQ-NOTIFY-160.
    case 'interrupted':
      return 'idle';
    default:
      return 'idle';
  }
}

/** REQ-NOTIFY-050: busy while starting, running, pausing or cancelling. */
export function isBusy(persisted: string): boolean {
  const p = presentationStatus(persisted);
  return p === 'starting' || p === 'running' || p === 'pausing' || p === 'cancelling';
}

/**
 * REQ-SESSION-055 / REQ-ORCH-085/153 (read by REQ-MCP-126): the persisted statuses that mean the product still holds a
 * run — the six active ones, plus the three parks (`paused`, `paused_message_limit`, `awaiting_plan_decision`) where a
 * run waits for its user at the desktop rather than having ended.
 */
export const RUN_HOLDING_STATUSES: ReadonlySet<string> = new Set([
  ...ACTIVE_STATUSES, 'paused', 'paused_message_limit', 'awaiting_plan_decision',
]);
export function runIsHeld(status: string): boolean {
  return RUN_HOLDING_STATUSES.has(status);
}

/**
 * REQ-MCP-126 (BLOCKER C, 2026-11-25): whether the run behind this persisted status has ENDED — the one question the
 * surface's slot asks of the product state. A busy status has not ended. A status outside the holding set (completed,
 * failed, stopped, idle, interrupted) has ended. A PARK has ended exactly when a stop reason accompanies it: a park with
 * no reason waits for its user (the run holds), while a park with a reason was cancelled at the desktop and the run is
 * over (`paused` + `user_cancelled`, which is what a plan-gate or message-limit cancel writes).
 */
export function runHasEnded(status: string, stopReason: string | null): boolean {
  if (isBusy(status)) return false;
  if (!runIsHeld(status)) return true;
  return stopReason !== null;
}

/** REQ-NOTIFY-048: one label per member; no two share one; none empty. Wording is the implementation's. */
export const STATUS_LABELS: Readonly<Record<PresentationStatus, string>> = {
  idle: 'Idle',
  starting: 'Starting',
  running: 'Running',
  pausing: 'Pausing',
  paused: 'Paused',
  cancelling: 'Cancelling',
  completed: 'Completed',
  failed: 'Failed',
  stopped: 'Stopped',
};
