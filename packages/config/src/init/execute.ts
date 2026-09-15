import type { InitRunReport, InitTaskReport, WorkspaceClassificationValue } from '@rotaris/contracts';
import { MARKER_WRITE_FAILED, MARKER_WRITE_FAILED_SUMMARY } from '@rotaris/contracts';
import type { InitializationTask, StepResult, TaskResult } from './registry.js';
import { applyRecord, recordPatch, type InitializationState, type RecordedOutcome } from './state.js';
import type { PlainMap } from '../merge.js';

/**
 * ADR-0064 — one execution (REQ-WORKSPACE-084, REQ-WORKSPACE-085, REQ-WORKSPACE-086,
 * REQ-WORKSPACE-109).
 *
 * The rule that shapes the whole file is REQ-WORKSPACE-085's: **the marker has exactly one writer,
 * and a task never records its own outcome.** So a task's runner returns a result and this module
 * decides what that means for the file; nothing a task can do reaches the document. The second rule
 * is REQ-WORKSPACE-084's: **no single task can cut the execution short** — a failure does not stop
 * the ones after it, which is why the loop has no early return and the outcomes accumulate.
 *
 * Recording happens per task rather than once at the end. REQ-WORKSPACE-085 speaks of "a task that
 * ran successfully but whose marker write fails", which only exists if the write is attached to a
 * task; and REQ-WORKSPACE-084 says a task that fails has nothing recorded while the ones around it
 * are still attempted, which a single end-of-run write would get wrong in the crash case — three
 * successes then a power loss would leave all three owed again.
 */
export interface MarkerWriter {
  /** Commits the `initialization:` patch to the workspace file. The refusal text reaches the user verbatim. */
  (patch: PlainMap): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
}

export interface ExecuteDeps {
  readonly workspaceRoot: string;
  readonly nowIso: () => string;
  readonly write: MarkerWriter;
  readonly signal: AbortSignal;
  readonly log: (message: string) => void;
  /** Published after every change, which is what makes REQ-WORKSPACE-109's live progress live. */
  readonly publish: (report: InitRunReport) => void;
  /**
   * The persisted state as it stands **now**, read immediately before each recording.
   *
   * Found by ADR-0064's first execution in the built app. A run holds its starting state to compute each
   * patch from, and the patch replaces both lists wholesale (REQ-CONFIG-050) — so anything written to
   * `initialization:` *while* the run was in flight was erased by the run's next recording. It is
   * reachable in the shipped product, not only in a contrived test: a fresh workspace starts its
   * background task at open and may raise the setup prompt in the same moment (REQ-WORKSPACE-083), and
   * answering that prompt with Skip writes to the same section seconds before the task finishes. Absent,
   * the run's in-memory state is used, which is the old behaviour and is correct when nothing else writes.
   */
  readonly reread?: (() => InitializationState) | undefined;
}

/** REQ-WORKSPACE-084: a task that ends without reporting one of the three outcomes is a failure, and says what went wrong. */
const NO_OUTCOME = (label: string, cause: string): string => `${label} ended without reporting an outcome: ${cause}`;

export interface ExecutionResult {
  readonly report: InitRunReport;
  readonly state: InitializationState;
}

function reportOf(task: InitializationTask, result: TaskResult, steps: readonly StepResult[]): InitTaskReport {
  return { id: task.id, label: task.label, status: result.status, steps: [...steps], error: result.error, retryable: result.retryable, summary: result.summary };
}

export async function executeTasks(tasks: readonly InitializationTask[], startState: InitializationState, deps: ExecuteDeps): Promise<ExecutionResult> {
  let state = startState;
  const done: InitTaskReport[] = [];
  let current: InitializationTask | null = null;
  let live: StepResult[] = [];
  /** REQ-WORKSPACE-109: the announcement, each finished step, and then the outcome — published as each happens. */
  const publish = (): void => {
    deps.publish({
      running: true,
      current: current === null ? null : current.id,
      currentLabel: current === null ? '' : current.label,
      currentSteps: [...live],
      tasks: [...done],
      outcome: null,
      error: '',
    });
  };

  for (const task of tasks) {
    // REQ-WORKSPACE-109: once cancellation is requested, a task that has not yet started never begins.
    if (deps.signal.aborted) break;
    current = task;
    live = [];
    publish();
    let result: TaskResult;
    try {
      result = await task.run({ workspaceRoot: deps.workspaceRoot, signal: deps.signal, onStep: (step) => { live.push(step); publish(); } });
    } catch (cause) {
      result = { status: 'failure', steps: [...live], classification: null, error: NO_OUTCOME(task.label, String(cause)), retryable: true, summary: `${task.label} did not finish. It can be run again.` };
    }
    const steps = result.steps.length > 0 ? result.steps : live;

    if (result.status === 'failure') {
      // REQ-WORKSPACE-084: nothing is recorded, so the task stays pending and can be run again later.
      done.push(reportOf(task, result, steps));
      current = null;
      publish();
      continue;
    }

    const outcome: RecordedOutcome = { id: task.id, outcome: result.status === 'success' ? 'completed' : 'skipped' };
    const now = deps.nowIso();
    // Re-read first: another writer may have touched the section since this run began (see `reread`).
    state = deps.reread?.() ?? state;
    const written = await deps.write(recordPatch(state, [outcome], result.classification, now));
    if (!written.ok) {
      // REQ-WORKSPACE-085: a success whose marker write failed is a RETRYABLE FAILURE, never a success.
      deps.log(`initialization: the marker write for '${task.id}' failed (${written.reason})`);
      done.push(reportOf(task, { ...result, status: 'failure', error: MARKER_WRITE_FAILED(task.label, written.reason), retryable: true, summary: MARKER_WRITE_FAILED_SUMMARY(task.label) }, steps));
      current = null;
      publish();
      continue;
    }
    state = applyRecord(state, [outcome], result.classification, now);
    done.push(reportOf(task, result, steps));
    current = null;
    publish();
  }

  const outcome: InitRunReport['outcome'] = deps.signal.aborted ? 'cancelled' : 'reported';
  const report: InitRunReport = { running: false, current: null, currentLabel: '', currentSteps: [], tasks: done, outcome, error: '' };
  deps.publish(report);
  return { report, state };
}

/**
 * REQ-WORKSPACE-084: an execution that finds no runnable task nevertheless stamps `last_run` on a
 * never-initialized workspace, so that running nothing leaves it initialized rather than eligible to
 * prompt again. REQ-WORKSPACE-083 says the same thing from the other side for the silent case.
 *
 * REQ-WORKSPACE-079: that stamp on its own is the whole record; no id moves and the classification
 * already held is left standing.
 */
export async function stampOnly(state: InitializationState, classification: WorkspaceClassificationValue | null, deps: Pick<ExecuteDeps, 'nowIso' | 'write' | 'log'>): Promise<InitializationState> {
  const now = deps.nowIso();
  const written = await deps.write(recordPatch(state, [], classification, now));
  if (!written.ok) {
    deps.log(`initialization: the marker stamp failed (${written.reason})`);
    return state;
  }
  return applyRecord(state, [], classification, now);
}

/**
 * REQ-WORKSPACE-086: skipping records every given pending task id as skipped, and **stamps the marker
 * even when the id list is empty** — after any skip the workspace has left the never-initialized
 * state, so the prompt cannot return on the next open.
 */
export async function recordSkip(state: InitializationState, ids: readonly string[], deps: Pick<ExecuteDeps, 'nowIso' | 'write'>): Promise<{ readonly ok: true; readonly state: InitializationState } | { readonly ok: false; readonly reason: string }> {
  const now = deps.nowIso();
  const outcomes: RecordedOutcome[] = ids.map((id) => ({ id, outcome: 'skipped' }));
  const written = await deps.write(recordPatch(state, outcomes, null, now));
  return written.ok ? { ok: true, state: applyRecord(state, outcomes, null, now) } : { ok: false, reason: written.reason };
}
