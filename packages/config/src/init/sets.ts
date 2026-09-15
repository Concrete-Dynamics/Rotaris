import type { InitializationView } from '@rotaris/contracts';
import { isApplicable, type InitializationTask, type TaskRegistry } from './registry.js';
import { isNeverInitialized, type InitializationState } from './state.js';

/**
 * ADR-0064 — the task sets (REQ-WORKSPACE-081, REQ-WORKSPACE-082) and the nine values the interface
 * works from (REQ-WORKSPACE-105).
 *
 * The five words are not synonyms and the differences all carry behaviour:
 *
 * - **applicable** — the predicate is satisfied, *whatever is recorded about the task*.
 * - **pending** — applicable and in neither persisted list.
 * - **runnable** — applicable and not in the completed list. A **skipped task stays runnable**, which
 *   is how a manual initialization offers it again (REQ-WORKSPACE-113) while reopening the workspace
 *   does not (REQ-WORKSPACE-081, last sentence).
 * - **background** — pending and requiring no consent. Starts by itself.
 * - **consent** — pending and requiring consent. Raises the prompt and gates the composer.
 *
 * An id a hand-edited file placed in **both** lists counts as completed, so it is neither pending nor
 * runnable — the safe direction, since the alternative re-runs work the file says finished.
 */
export interface TaskSets {
  readonly applicable: readonly InitializationTask[];
  readonly pending: readonly InitializationTask[];
  readonly runnable: readonly InitializationTask[];
  readonly background: readonly InitializationTask[];
  readonly consent: readonly InitializationTask[];
}

export async function deriveSets(registry: TaskRegistry, state: InitializationState, log: (message: string) => void): Promise<TaskSets> {
  const applicable: InitializationTask[] = [];
  for (const task of registry.all()) if (await isApplicable(task, log)) applicable.push(task);
  const completed = new Set(state.completed);
  const skipped = new Set(state.skipped);
  const pending = applicable.filter((t) => !completed.has(t.id) && !skipped.has(t.id));
  return {
    applicable,
    pending,
    runnable: applicable.filter((t) => !completed.has(t.id)),
    background: pending.filter((t) => t.requiresConsent !== true),
    consent: pending.filter((t) => t.requiresConsent === true),
  };
}

/** REQ-WORKSPACE-082: shown if and only if at least one consent-requiring task is pending — whether the workspace has ever been initialized plays no part. */
export function promptOwed(sets: TaskSets): boolean {
  return sets.consent.length > 0;
}

/**
 * REQ-WORKSPACE-105: **exactly** these nine values, and the interface works from nothing else.
 *
 * **The reading taken on `completed` and `skipped`, recorded because the requirement admits two.**
 * They cross as the persisted lists **filtered to currently applicable registered tasks**. The
 * alternative — the raw lists — makes two of REQ-WORKSPACE-114's six card states uncomputable from
 * these nine values: *deferred* asks whether "at least one **applicable** task is skipped" and
 * *empty* whether "no task is **applicable** to this workspace", and a raw skipped list holding an id
 * whose tool has since been unconfigured would win *deferred* over *empty* and offer the user
 * "Run them whenever you want" for a task that cannot run. REQ-WORKSPACE-089 settles the direction
 * for the other half: an id matching no registered task "simply resolves nothing", so it contributes
 * to no set. REQ-WORKSPACE-105's own sentence about such an id — that it is treated as requiring no
 * consent — stands as the fail-safe it reads as, and `labelFor` still displays any id as itself.
 */
export function viewOf(state: InitializationState, sets: TaskSets, running: boolean, lastError: string | null): InitializationView {
  const applicable = new Set(sets.applicable.map((t) => t.id));
  return {
    pending: sets.pending.map((t) => t.id),
    consentPending: sets.consent.map((t) => t.id),
    completed: state.completed.filter((id) => applicable.has(id)),
    skipped: state.skipped.filter((id) => applicable.has(id)),
    classification: state.classification,
    neverInitialized: isNeverInitialized(state),
    lastRun: state.lastRun,
    running,
    lastError,
  };
}

/** REQ-WORKSPACE-105: the prompt is due exactly when a consent-requiring task is pending and no run is in progress. */
export function promptDue(view: InitializationView): boolean {
  return view.consentPending.length > 0 && !view.running;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const id of b) if (!set.has(id)) return false;
  return set.size === new Set(b).size;
}

/**
 * REQ-WORKSPACE-105: two states are equal exactly when all nine are, the four id collections comparing
 * as **sets** — their order is the order outcomes happened to be recorded in and carries nothing a user
 * can see, so a state re-read in a different order is not a change and must not reopen a dialog the
 * user has already answered. The other five compare by value, two absent values being equal and an
 * absent value never equal to a present one.
 */
export function sameView(a: InitializationView, b: InitializationView): boolean {
  return sameSet(a.pending, b.pending)
    && sameSet(a.consentPending, b.consentPending)
    && sameSet(a.completed, b.completed)
    && sameSet(a.skipped, b.skipped)
    && a.classification === b.classification
    && a.neverInitialized === b.neverInitialized
    && a.lastRun === b.lastRun
    && a.running === b.running
    && a.lastError === b.lastError;
}
