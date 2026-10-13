/**
 * The closed vocabularies and the total mappings between them, in ONE place
 * so that no second copy can drift (REQ-ORCH-083, REQ-MONITOR-301,
 * REQ-MONITOR-029, REQ-SESSION-076, REQ-SESSION-073, REQ-NOTIFY-048/049/050).
 *
 * Every function here is total over its input vocabulary. A token outside a
 * closed set is a DEFECT and yields `error` with a diagnostic rather than a
 * guessed success (REQ-EVENTS-026, REQ-SESSION-187).
 */

import { countNoun } from '@rotaris/kernel';
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

/** A plan in REQ-TOOLS-144's shape, as far as the completion constraint reads it. */
export interface PlanItems { readonly phases: readonly { readonly tasks: readonly { readonly id: string; readonly name: string; readonly state: string }[] }[] }

const terminalPlanState = (state: string): boolean => state === 'COMPLETED' || state === 'ABANDONED';

/** The ids of the plan's items that are not terminal (`openPlanItems`'s test): what a task's first take-up finds open. */
export function openPlanIds(plan: PlanItems | null): Set<string> {
  return new Set(plan === null ? [] : plan.phases.flatMap((phase) => phase.tasks).filter((task) => !terminalPlanState(task.state)).map((task) => task.id));
}

/**
 * REQ-ORCH-029 / REQ-ORCH-075: the items of the coordinator's own plan (REQ-TOOLS-144's states) that are not terminal —
 * `PENDING` and `IN_PROGRESS`, and any state outside the vocabulary (REQ-CHAT-088 shows it open); `COMPLETED` and
 * `ABANDONED` are terminal — less the items in `excused`. The coordinator "does not report the run successful while a todo
 * item is non-terminal", and REQ-ORCH-069 (1) and REQ-ORCH-082 read success off the planner's tasks alone, so an iteration
 * whose root answers with one of these open does not mark its planner task complete (`Run.iterate`: REQ-ORCH-075's
 * re-queue). `excused` is what was already open when the task was first taken up (OQ-203; `Task.planExcused`, kept with the
 * task in the stored todo): an item a given-up task or an earlier run left open is not held against a task REQ-ORCH-067
 * confines to its own work, and one the task's own earlier iteration left open always is. The repair of
 * `docs/defects/fixed/the-run-records-success-while-the-coordinators-own-plan-holds-a-pending-item.md` (live-run finding G5).
 */
export function openPlanItems(plan: PlanItems | null, excused: ReadonlySet<string> = new Set()): string[] {
  if (plan === null) return [];
  return plan.phases.flatMap((phase) => phase.tasks).filter((task) => !terminalPlanState(task.state) && !excused.has(task.id)).map((task) => task.name);
}

/** REQ-ORCH-067's iteration summary for a task returned to the queue because the coordinator's plan was left open. */
export function planNotDoneSummary(open: readonly string[]): string {
  return `the coordinator answered with ${countNoun(open.length, 'item')} of its plan not done: ${open.join('; ')}`;
}

/**
 * REQ-ORCH-075's continuation marker: what the same task's next fresh root is told after its task when its last iteration
 * declared success with items of its plan open — how many, naming up to the first five, and to continue from its plan and
 * not end its turn until every remaining item is complete or recorded in its true state (REQ-ORCH-029). It is a part of
 * that iteration's first message alone, never appended to the task's text, so markers do not pile up across re-queues
 * (REQ-ORCH-076). No background child is enumerated: an iteration's children are settled when it closes (REQ-ORCH-052).
 *
 * `PD-ORCH-015` (OQ-225, extending REQ-ORCH-075): `heldAnswer`, the answer that iteration wrote and the person was shown
 * (`Task.heldAnswer`, already cut to `HELD_ANSWER_LIMIT`), follows the marker labelled as such, so a root whose work is
 * done records it rather than redoing it (live-run finding P1).
 */
export function planCarryText(open: readonly string[], heldAnswer: string | null = null): string {
  const marker = `The previous iteration on this task declared success with ${countNoun(open.length, 'item')} of your plan not complete, so the task is not complete:\n${planItemsBlock(open)}`;
  if (heldAnswer === null || heldAnswer.trim() === '') return marker;
  return `${marker}\n\nYour previous iteration answered as follows, and the person was shown it:\n${heldAnswer}\n\nWhere it shows an item done, record that item COMPLETED with the todo tool rather than doing the work again.`;
}

/** `PD-ORCH-015`: how much of a held iteration's answer is kept with its task and carried to the task's next fresh root. */
export const HELD_ANSWER_LIMIT = 6_000;

/**
 * REQ-ORCH-078 under `PD-ORCH-015` (OQ-225): the correction sent into the root's own conversation — at least once, up to
 * the larger of 1 and the validation-retry setting — when it answers succeeded with items of its plan open, before
 * REQ-ORCH-075's re-queue, which follows once they are spent. The same items and instruction as the continuation marker,
 * said of the answer the root just gave; `answered`, whether a turn of this execution wrote an answer, adds that the person
 * has been shown it. Every correction asks for each item's true state, ABANDONED among them, and neither the work nor the
 * answer again (live-run finding P1).
 */
export function planCorrectionText(open: readonly string[], answered = false): string {
  return `${answered ? 'Your answer has been shown to the person. ' : ''}You declared success with ${countNoun(open.length, 'item')} of your plan not complete, so the task is not complete:\n${planItemsBlock(open)}\n${PLAN_TRUE_STATE}`;
}

/** `PD-ORCH-015`: what a correction asks of the root, in its own conversation, about the items it left open. */
const PLAN_TRUE_STATE = 'Record each item\'s true state with the todo tool: COMPLETED where the work is done, ABANDONED where you will not do it. Do not redo work that is done, and do not repeat your answer.';

/** `PD-ORCH-015`: the `system` row that says a task was not marked complete for its open plan — re-queued or given up on. */
export function planHeldRowText(iteration: number, open: readonly string[], givenUp: boolean): string {
  return `Iteration ${iteration}: ${planNotDoneSummary(open)}. ${givenUp ? 'The task was given up on at the retry limit.' : 'The task was not marked complete and was returned to the queue.'}`;
}

/**
 * OQ-213 as ruled under the owner's delegation (R-072), building REQ-ORCH-029's "work spanning more than one step is
 * accompanied by a todo list it keeps current": what the coordinating entry role reads when the call that would start its
 * task's second work item is refused because it keeps no todo list of its own for the task. The call was not run; the remedy
 * is one `todo` call away, and the same call then runs as it was asked. PD-TOOLS-006 revision 6 (OQ-220) adds what the list
 * is for at a delegation: once it is written, a delegation to a persona that writes workspace files names the item it serves,
 * by the id the `todo` result gives. It said, until 2026-10-07: "… one item per step with only the step you are on
 * IN_PROGRESS, then make this call again." `PD-TOOLS-008` revision 2 and `PD-TOOLS-006` revision 7 (OQ-249) count only the
 * items the agent works on itself and mark a delegated item at admission, so the list is one item per piece of work, the
 * delegated ones PENDING. It said, until OQ-249's build: "Write one with the todo tool, one item per step with only the step you
 * are on IN_PROGRESS; its result gives each item's id. Then make this call again, and on a delegate call to a persona that
 * writes workspace files give todo_item: the id of the item it serves."
 */
export const TODO_LIST_OWED_TEXT = 'This call was not run: this task now spans more than one step and you keep no todo list for it (REQ-ORCH-029). Write one with the todo tool, one item per piece of work, with only an item you work on yourself IN_PROGRESS and the items you will delegate PENDING; its result gives each item\'s id. Then make this call again, and on a delegate call give todo_item: the id of the item it serves, which the call marks IN_PROGRESS.';

/** The open items named (up to the first five, REQ-ORCH-075) and the instruction to continue from the plan. */
function planItemsBlock(open: readonly string[]): string {
  const shown = open.slice(0, 5);
  const more = open.length - shown.length;
  return `${shown.map((name) => `- ${name}`).join('\n')}${more > 0 ? `\n(and ${more} more)` : ''}\nContinue from your plan, and do not end your turn until every remaining item is complete or recorded in its true state.`;
}

export type SummarySeverity = 'information' | 'warning' | 'error';
export interface RunSummary {
  readonly status: 'paused' | 'completed' | 'failed';
  readonly severity: SummarySeverity;
  readonly message: string;
}

/**
 * REQ-ORCH-082: five arms, in order, first match. The wording is the implementation's; the arms are not.
 *
 * Rule 1's words fit every rest a person asks for — a pause, a stop and the explicit cancel all record `user_cancelled`
 * (PD-ORCH-005 clause 21) — and name none of them, as the rule requires: "a person stopped it" was read beside a paused
 * session's own "Run paused" row as a stop (`a-paused-runs-notice-says-a-person-stopped-it.md`, R-067). Which rest it
 * was, and what a continue resumes, are the transcript row's and the Continue action's to say (OQ-118).
 */
export function summarise(s: { stopReason: string | null; completed: number; abandoned: number; lastFailure: string | null }): RunSummary {
  if (s.stopReason === 'user_cancelled') return { status: 'paused', severity: 'warning', message: "The run came to rest at the user's request." };
  if (s.completed === 0 && s.abandoned === 0) return { status: 'completed', severity: 'information', message: `The run ended without resolving any task (${s.stopReason ?? 'no stop reason recorded'}).` };
  if (s.abandoned === 0) return { status: 'completed', severity: 'information', message: 'The run completed.' };
  if (s.completed === 0) return { status: 'failed', severity: 'error', message: s.lastFailure ? `The run failed: ${s.lastFailure}` : `The run failed: ${countNoun(s.abandoned, 'task')} abandoned.` };
  return { status: 'completed', severity: 'warning', message: `The run completed with failures: ${s.completed} completed, ${s.abandoned} abandoned.` };
}

export function isStopReason(s: string): s is StopReason {
  return STOP_REASON_SET.has(s);
}
