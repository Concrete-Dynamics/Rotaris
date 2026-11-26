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
 * REQ-MCP-126 (REWORK 9, 2026-11-25): whether this persisted status is a PARK — the product's three "waits for its
 * user" states (`paused`, `paused_message_limit`, `awaiting_plan_decision`), as opposed to the six ACTIVE ones that
 * mean a run is in flight. A park is HELD like any other holding state; what it additionally rules out is the
 * ABSENCE release. A session parked at the desktop is not stale and may be CONTINUED on the same iteration, so the
 * surface's reconcile must not read a parked session's absence or staleness as proof that its run can never resume.
 */
export function isParkedStatus(status: string): boolean {
  return RUN_HOLDING_STATUSES.has(status) && !isBusy(status);
}

/**
 * REQ-ORCH-083 / REQ-NOTIFY-049: the persisted statuses that are TERMINAL — the run is over and nothing follows it. `idle` and `interrupted` are deliberately NOT here. `idle` is published BEFORE a continuation of the SAME
 * session (a plan approve/revise and a message-limit continue/double write it before the relaunch), so reading it as an
 * end frees the surface's one-run slot while the continuation runs unobserved (BLOCKER 3, 2026-11-25). `interrupted` is
 * the crash-repair status of a session whose owning process died; it is at rest, but it is not a run-result the surface
 * may treat as a definite end, and the surfaces that DO need it (a repaired session presents as not busy) read it
 * through `presentationStatus`/`isBusy`, not through this predicate.
 */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'failed', 'stopped']);

/**
 * REQ-MCP-126 (BLOCKER C, BLOCKER 3 and REWORK 9, 2026-11-25): whether the run behind this persisted status has
 * DEFINITELY ENDED — the one question the surface's slot asks of the product state, and asked in the conservative
 * direction: the slot is freed only on a definite signal, because the cost of holding is a surface that refuses further
 * starts for a while and the cost of freeing early is TWO running runs (REQ-MCP-126).
 *
 * - A TERMINAL status (completed, failed, stopped) has ended, and no continuation follows it. This is the ONLY arm.
 * - A BUSY status (starting, running, background, waiting, pausing, cancelling) has not ended.
 * - A PARK (`paused`, `paused_message_limit`, `awaiting_plan_decision`) has NOT ended: it waits for its user, and — as
 *   REWORK 9 settled — the same iteration may be CONTINUED, so no park is ever a definite end however it is written.
 * - Anything else — `idle`, `interrupted` — is likewise NOT a definite end: a relaunch of the same session may follow.
 *
 * The run's own terminal `run.result`, the run host's exit, or an authoritative ABSENCE (the session gone from the
 * listing, or STALE — busy with nothing running it) after a failed terminal write are what end such a run; the last two
 * only while the run is not parked (`isParkedStatus`).
 *
 * REWORK 9 (2026-11-25) REMOVED the arm that read a park as an end when a stop reason accompanied it. A normal desktop
 * Pause writes `paused` + `user_cancelled` and ALSO emits a `run.result`; a desktop Continue then resumes the SAME open
 * iteration. No product field separates that resumable pause from the plan-gate cancel (both write `paused`/
 * `user_cancelled`), so reading the plainer one as an end released the slot while the run was continued — a SECOND
 * external start was admitted and two runs ran at once (REQ-MCP-126). The liveness cost of holding (a desktop-paused run
 * that is never continued holds the slot until the application ends) is covered by REQ-MCP-126's "refused, never queued".
 */
export function runHasEnded(status: string): boolean {
  if (isBusy(status)) return false;
  return TERMINAL_STATUSES.has(status);
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
