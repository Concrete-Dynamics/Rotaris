import type { BoardAction, PaneKey } from '@rotaris/contracts';
import type { DecisionResult } from './panes/presentation.js';

/**
 * Part R2 — the pure half of hosting Part AP's five panes on the board (spec 08 §Review Surface, §Blockers,
 * §Editing and Creating Requirements, §Delivery Queue; REQ-TRACE-369/370/375, 422, 463, 472, 498). The panes
 * themselves were built, exported and unit-tested by Part AP and mounted nowhere — ADR-0041's second execution note
 * says so in as many words — so what this file holds is what the HOST has to say: the titles, the consequence each
 * review decision states before it is taken, and the sentences a launch and a dispatch leave behind.
 *
 * Nothing here reads a store, a clock or the DOM; the sentences are data so a proof can read them back by name.
 */

/** REQ-TRACE-375's five keys, titled. The key namespace is closed in `contracts`; this only names them. */
export const PANE_TITLE: Readonly<Record<PaneKey, string>> = Object.freeze({
  review: 'Review delivery',
  queue: 'Delivery queue',
  editor: 'Edit requirement',
  create: 'New requirement',
  blockers: 'Blockers',
});

export const QUEUE_CONTROL_LABEL = 'Queue';
export const CREATE_CONTROL_LABEL = 'New requirement';
export const GRAPH_CONTROL_LABEL = 'Graph';
export const REVIEW_CONTROL_LABEL = 'Review';
export const BLOCKERS_CONTROL_LABEL = 'Blockers';
export const EDIT_CONTROL_LABEL = 'Edit';

/**
 * REQ-TRACE-422: each of the six decisions states what it does to the branch and to the worktree BEFORE it is taken.
 * The words are the board's, not the engine's — the engine states the consequence of a COLUMN move (REQ-TRACE-391,
 * `Reachability.consequence`) and says nothing about branches, which is the half a reviewer is deciding about here.
 */
export function consequenceForDecision(action: BoardAction, id: string): string {
  switch (action) {
    case 'accept': return `Accepting records ${id} as delivered. The unit's branch and worktree are left exactly as they are: nothing is merged, nothing is deleted, and the completion conditions are checked first — accepting with a condition unmet is refused and the condition is named.`;
    case 'rerun': return `Re-running starts a fresh execution unit for ${id} in a new worktree on a new branch. The previous unit's branch and worktree are kept, so nothing already done is lost.`;
    case 'send-back': return `Sending back returns ${id} to the agent with your instructions placed into the context of the next run. A new unit is started; the previous unit's branch and worktree are kept.`;
    case 'edit': return `Editing opens the requirement's own source document for ${id}. The work already done keeps its branch and worktree, and the edit is recorded against the requirement.`;
    case 'reject': return `Rejecting the integration leaves every unit branch and worktree intact — nothing is deleted and nothing is merged — and returns ${id} for another pass.`;
    case 'keep-worktree': return `Keeping the worktree leaves the unit's branch and directory on disk so the work can be continued by hand. Nothing is merged and no further run is started for ${id}.`;
    default: return `${id}: this decision states no consequence of its own for the branch or the worktree.`;
  }
}

/** REQ-TRACE-472: declining the disclosure causes nothing whatsoever to happen, and the surface says so rather than leaving silence. */
export function launchAbandoned(id: string): string {
  return `Nothing was started for ${id} and nothing was written: the launch was abandoned before the first action that would have started a run.`;
}
export const LAUNCH_ABANDONED = launchAbandoned;

/**
 * REQ-TRACE-472: where a decision would start a run, the disclosure comes first and the decision is NOT taken yet.
 * The surface that asked is told exactly that, in the shape of a refusal, because nothing has been recorded.
 */
export function disclosurePending(id: string): string {
  return `Nothing has been recorded for ${id} yet: a run started from the board receives raised permissions, so the launch states them first. The disclosure is on screen; accepting it takes this decision, and abandoning it leaves everything as it stands.`;
}
export const DISCLOSURE_PENDING = disclosurePending;

/**
 * REQ-TRACE-472 with REQ-TRACE-426: a launch held behind its disclosure. `result` is what the surface that asked is
 * answered at once — nothing recorded yet — carrying the outcome still to come; the host settles it with the act's
 * own result when the disclosure is accepted, or with the abandonment when it is abandoned. It settles once: a
 * second settlement is ignored, so a launch abandoned by being replaced cannot later read as taken.
 */
export interface HeldLaunch {
  readonly result: DecisionResult;
  settle(outcome: DecisionResult): void;
  abandon(): void;
}
export function heldLaunch(id: string): HeldLaunch {
  let resolve: (outcome: DecisionResult) => void = () => undefined;
  let settled = false;
  const afterDisclosure = new Promise<DecisionResult>((r) => { resolve = r; });
  const settle = (outcome: DecisionResult): void => { if (settled) return; settled = true; resolve(outcome); };
  return {
    result: { ok: false, reason: DISCLOSURE_PENDING(id), afterDisclosure },
    settle,
    abandon: () => settle({ ok: false, reason: LAUNCH_ABANDONED(id) }),
  };
}

/** REQ-TRACE-463: where the act succeeded but nothing was dispatched, the reason is reported on the action's result rather than dropped. */
export function dispatchNothingStarted(id: string, reason: string): string {
  return `${id} moved, and no run began: ${reason}`;
}
export const DISPATCH_NOTHING_STARTED = dispatchNothingStarted;

/**
 * REQ-TRACE-498's source row: the read-only sentence names the source and offers opening the artifact — never a
 * disabled field. The editor pane takes it as a value; this is the host's wording for the board's own case.
 */
export function readOnlyEditorRefusal(id: string, path: string): string {
  return `The requirement source is read-only for this account, so ${id} cannot be written here. Its document is ${path}; open it in the editor of your choice to change it, then re-evaluate the board.`;
}

/** REQ-TRACE-370: a pane a caller attached first is never displaced, and the host says which of the five it has built. */
export function installedPanesSentence(keys: readonly PaneKey[], installed: (key: PaneKey) => boolean): string {
  const built = keys.filter((k) => installed(k));
  return built.length === 0
    ? 'No pane has been opened yet, so none is built: asking builds nothing.'
    : `Built panes: ${built.map((k) => PANE_TITLE[k]).join(', ')}. Each was constructed the first time it was needed and is reused after.`;
}

/** The draft the create pane hands back, narrowed to what `requirements.source.write` carries in its one `document` string. */
export interface CreateDocument { readonly title: string; readonly prose: string; readonly kind: 'product' | 'technical'; readonly derivedFrom?: readonly string[]; readonly epic?: string; readonly priority?: string }
