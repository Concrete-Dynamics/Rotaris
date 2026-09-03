/**
 * The closed vocabularies and the total mappings between them, in ONE place
 * so that no second copy can drift (REQ-ORCH-083, REQ-MONITOR-301,
 * REQ-MONITOR-029, REQ-SESSION-076, REQ-SESSION-073, REQ-NOTIFY-048/049/050).
 *
 * Every function here is total over its input vocabulary. A token outside a
 * closed set is a DEFECT and yields `error` with a diagnostic rather than a
 * guessed success (REQ-EVENTS-026, REQ-SESSION-187).
 */

import {
  ACTIVE_STATUSES, EXECUTION_STATUSES, STOP_REASONS, TERMINAL_RESULTS, isActiveStatus, isBusy, presentationStatus,
  type ExecutionStatus, type PresentationStatus, type StopReason, type TerminalResult,
} from '@rotaris/contracts';

export { ACTIVE_STATUSES, EXECUTION_STATUSES, STOP_REASONS, TERMINAL_RESULTS, isActiveStatus, isBusy, presentationStatus };
export type { ExecutionStatus, PresentationStatus, StopReason, TerminalResult };
const STOP_REASON_SET: ReadonlySet<string> = new Set(STOP_REASONS);

/** REQ-MONITOR-030 / REQ-MONITOR-301: stop reason → terminal result. Total; an unknown token is a defect → `error`. */
export function classifyStop(reason: string): { result: TerminalResult; diagnostic?: string } {
  switch (reason as StopReason) {
    case 'tasks_complete':
    case 'no_pending_tasks':
      return { result: 'completed' };
    case 'user_cancelled':
    case 'application_shutdown':
    case 'message_limit_reached':
      return { result: 'interrupted' };
    case 'iteration_limit_reached':
    case 'time_limit_reached':
      return { result: 'max_iterations' };
    case 'repetition_detected':
    case 'agent_session_aborted':
      return { result: 'failed' };
    default:
      return { result: 'error', diagnostic: `stop reason outside the closed set of REQ-MONITOR-301: ${JSON.stringify(reason)}` };
  }
}

/** REQ-SESSION-076: execution status → terminal result, where no progress record exists. Total. */
export function resultFromStatus(status: string): { result: TerminalResult; diagnostic?: string } {
  switch (status as ExecutionStatus) {
    case 'completed':
      return { result: 'completed' };
    case 'failed':
      return { result: 'failed' };
    case 'paused':
    case 'paused_message_limit':
    case 'stopped':
    case 'interrupted':
      return { result: 'interrupted' };
    default:
      return { result: 'error', diagnostic: `the run ended without a terminal status (execution_status ${JSON.stringify(status)})` };
  }
}

/** REQ-MONITOR-029: terminal result → the status persisted. `max_iterations` persists `stopped`, never a status of its own. */
export function statusForResult(result: TerminalResult): ExecutionStatus {
  switch (result) {
    case 'interrupted':
      return 'paused';
    case 'failed':
    case 'error':
      return 'failed';
    case 'max_iterations':
      return 'stopped';
    case 'completed':
      return 'completed';
  }
}

export interface StopInputs {
  readonly allTasksComplete: boolean;
  readonly pendingTasks: number;
  readonly iterationsCompleted: number;
  readonly iterationLimit: number;
  readonly elapsedMs: number;
  readonly timeLimitMs: number | null;
}

/** REQ-ORCH-069: evaluated BETWEEN iterations, first match wins. `null` means keep going. */
export function stopCondition(s: StopInputs): StopReason | null {
  if (s.allTasksComplete) return 'tasks_complete';
  if (s.iterationsCompleted >= s.iterationLimit) return 'iteration_limit_reached';
  if (s.timeLimitMs !== null && s.elapsedMs >= s.timeLimitMs) return 'time_limit_reached';
  if (s.pendingTasks === 0) return 'no_pending_tasks';
  return null;
}

export type SummarySeverity = 'information' | 'warning' | 'error';
export interface RunSummary {
  readonly status: 'paused' | 'completed' | 'failed';
  readonly severity: SummarySeverity;
  readonly message: string;
}

/** REQ-ORCH-082: five arms, in order, first match. The wording is the implementation's; the arms are not. */
export function summarise(s: { stopReason: string | null; completed: number; abandoned: number; lastFailure: string | null }): RunSummary {
  if (s.stopReason === 'user_cancelled') return { status: 'paused', severity: 'warning', message: 'The run came to rest because a person stopped it.' };
  if (s.completed === 0 && s.abandoned === 0) return { status: 'completed', severity: 'information', message: `The run ended without resolving any task (${s.stopReason ?? 'no stop reason recorded'}).` };
  if (s.abandoned === 0) return { status: 'completed', severity: 'information', message: 'The run completed.' };
  if (s.completed === 0) return { status: 'failed', severity: 'error', message: s.lastFailure ? `The run failed: ${s.lastFailure}` : `The run failed: ${s.abandoned} task(s) abandoned.` };
  return { status: 'completed', severity: 'warning', message: `The run completed with failures: ${s.completed} completed, ${s.abandoned} abandoned.` };
}

export function isStopReason(s: string): s is StopReason {
  return STOP_REASON_SET.has(s);
}
