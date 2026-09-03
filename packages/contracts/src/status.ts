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
    case 'interrupted':
      return 'paused';
    default:
      return 'idle';
  }
}

/** REQ-NOTIFY-050: busy while starting, running, pausing or cancelling. */
export function isBusy(persisted: string): boolean {
  const p = presentationStatus(persisted);
  return p === 'starting' || p === 'running' || p === 'pausing' || p === 'cancelling';
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
