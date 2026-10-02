import type { BlockerPayload, BoardAction, DeliveryQueue, DisclosureState, LaunchPreview, QueueEntry, ReviewElementKey, ReviewPayload, ReviewSide } from '@rotaris/contracts';
import { REVIEW_DECISIONS, REVIEW_ELEMENTS } from '@rotaris/contracts';
import { blockerWording } from '@rotaris/ui-core';

/**
 * Part AP — the pure presentation the five panes render from (REQ-TRACE-380's rule applied to the panes: every input
 * supplied, nothing read). The review's twelve elements in REQ-TRACE-420's order with their own empty messages
 * (REQ-TRACE-421 reads the same words out), the claim/measurement split's two heading constants and attributions
 * (REQ-TRACE-419), the blocker's presentation as a function of the blocker value alone (REQ-TRACE-447/449/450/452),
 * the queue's wording (REQ-TRACE-482) and the disclosure's text (REQ-TRACE-472/474, 468).
 */

// ---- the review (REQ-TRACE-417..426) ----

/** REQ-TRACE-419: the two heading constants, used for the headings, every row's accessible name and the sweep. */
export const CLAIM_HEADING = 'What the agent claimed';
export const MEASUREMENT_HEADING = 'What the system measured';
export const WORK_HEADING = 'The work';
export const CLAIM_ATTRIBUTION = "These are the agent's own words; nothing here was measured.";
export const MEASUREMENT_ATTRIBUTION = "This was run by the system; nothing here is the agent's word.";

export interface ReviewElement {
  readonly key: ReviewElementKey;
  readonly side: ReviewSide;
  readonly label: string;
  /** The lines shown; empty ⇒ `empty` is shown instead (and read out, REQ-TRACE-421). */
  readonly lines: readonly string[];
  readonly empty: string;
  /** REQ-TRACE-417: a modified file opens as a difference view; the branch and the worktree navigate to the version-control view. */
  readonly links?: readonly { readonly label: string; readonly target: ReviewLink }[];
}
export type ReviewLink = { readonly kind: 'diff'; readonly path: string } | { readonly kind: 'git'; readonly sessionId?: string } | { readonly kind: 'session'; readonly sessionId: string };

const LABELS: Readonly<Record<ReviewElementKey, [ReviewSide, string, string]>> = Object.freeze({
  'agent-summary': ['claim', 'Agent summary', 'The agent wrote no summary.'],
  'reported-risks': ['claim', 'Reported risks', 'The agent flagged no risks.'],
  'completion-claim': ['claim', 'Completion claim', 'No completion claim was recorded.'],
  'checks-run': ['measurement', 'Checks run', 'No check was run for this requirement.'],
  'verification': ['measurement', 'Verification', 'No verification has been recorded.'],
  'changed-files': ['measurement', 'Changed files', 'The work modified no file.'],
  'traceability-changes': ['measurement', 'Traceability changes', 'The work produced no traceability change.'],
  'unmet-conditions': ['measurement', 'Unmet completion conditions', 'Every completion condition holds.'],
  'specification-version': ['work', 'Specification version', 'No snapshot was recorded for this run.'],
  'execution-units': ['work', 'Execution units', 'No execution unit was recorded.'],
  'branch-and-worktree': ['work', 'Branch and worktree', 'No branch or worktree holds the work.'],
  'proposals': ['work', 'Technical requirements this run proposes', 'The run put forward no proposals.'],
});

const short = (hash: string | null): string => (hash === null ? '—' : hash.slice(0, 8));

/** REQ-TRACE-420: the twelve elements in their fixed order, each carrying its own empty message; the three "always states something" elements always carry a line. */
export function reviewElements(p: ReviewPayload): readonly ReviewElement[] {
  const lines = (key: ReviewElementKey): { lines: string[]; links?: ReviewElement['links'] } => {
    switch (key) {
      case 'agent-summary': return { lines: p.claim.summary === null || p.claim.summary.trim() === '' ? [] : p.claim.summary.split(/\r?\n/) };
      case 'reported-risks': return { lines: [...p.claim.risks] };
      case 'completion-claim': return { lines: [p.claim.completion.statement] };
      case 'checks-run': return { lines: p.measurement.checks.map((c) => `${c.name}: ${c.outcome}`) };
      case 'verification': return { lines: [p.measurement.verification] };
      case 'changed-files': return { lines: p.measurement.changedFiles.map((f) => `${f.path}${f.added === null && f.removed === null ? '' : ` +${f.added ?? '?'} −${f.removed ?? '?'}`}`), links: p.measurement.changedFiles.map((f) => ({ label: `Open ${f.path} as a difference`, target: { kind: 'diff' as const, path: f.path } })) };
      case 'traceability-changes': return { lines: [...p.measurement.traceabilityChanges] };
      case 'unmet-conditions': return { lines: [...p.measurement.unmetConditions] };
      case 'specification-version': {
        const s = p.work.specification;
        return { lines: [s.snapshotHash === null ? 'No snapshot was recorded for this run; the current version is ' + short(s.currentHash) + '.' : `Snapshot ${short(s.snapshotHash)}${s.snapshotAt === null ? '' : ` taken ${s.snapshotAt}`}; current ${short(s.currentHash)}${s.diverged ? ' — the requirement changed since the snapshot the work was taken against.' : ' — unchanged since the snapshot.'}`] };
      }
      case 'execution-units': return { lines: p.work.units.map((u) => `${u.unit}: ${u.status}${u.outcome ? ` — ${u.outcome}` : ''}${u.sessionId ? ` (session ${u.sessionId})` : ''}`), links: p.work.units.filter((u) => u.sessionId !== undefined).map((u) => ({ label: `Open the session of ${u.unit}`, target: { kind: 'session' as const, sessionId: u.sessionId! } })) };
      case 'branch-and-worktree': return { lines: [...(p.work.branch === null ? [] : [`Branch ${p.work.branch}`]), ...(p.work.worktree === null ? [] : [`Worktree ${p.work.worktree}`])], links: p.work.branch === null && p.work.worktree === null ? [] : [{ label: 'Open in the version-control view', target: { kind: 'git' as const } }] };
      case 'proposals': return { lines: p.work.proposalsState === 'unreadable' ? ['The proposals file could not be read; the run is taken as having put forward no proposals.'] : p.work.proposals.map((x) => `${x.title} — derived from ${x.derivedFrom} (unit ${x.unit}): ${x.description}`) };
    }
  };
  return REVIEW_ELEMENTS.map((key) => {
    const [side, label, empty] = LABELS[key];
    const l = lines(key);
    return { key, side, label, lines: l.lines, empty, ...(l.links === undefined || l.links.length === 0 ? {} : { links: l.links }) };
  });
}
/** REQ-TRACE-421: what is read out equals what is on screen — the element's lines, or its empty message. */
export function reviewElementDescription(e: ReviewElement): string {
  return e.lines.length === 0 ? e.empty : e.lines.join(' ');
}
/** REQ-TRACE-422: the six decisions in their fixed order with their labels (REQ-TRACE-382's rule: hyphens to spaces, a sentence). */
export function reviewDecisions(): readonly { readonly action: BoardAction; readonly label: string }[] {
  return REVIEW_DECISIONS.map((action) => ({ action, label: actionLabel(action) }));
}
export function actionLabel(action: BoardAction): string {
  const words = action.replace(/-/g, ' ');
  return words[0]!.toUpperCase() + words.slice(1);
}
/** REQ-TRACE-426: the one action the post-decision notice offers. */
export const RELOAD_REVIEW = 'Reload the review';
/** REQ-TRACE-426: the notice once a decision is recorded — the payload on screen is the one it was taken against. */
export function decidedNotice(label: string, id: string): string {
  return `${label} recorded for ${id}. The review you were reading is out of date.`;
}

/**
 * What a decision came to, as the board's one write path answers it (REQ-TRACE-422/423). A decision that would start
 * a run — re-run, send-back — is held behind the launch's disclosure (REQ-TRACE-472): its first answer is that nothing
 * has been recorded YET, and `afterDisclosure` carries the rest — the act's own result once the disclosure is
 * accepted, or the abandonment. Without it the pane kept that first answer as a refusal after the decision had been
 * taken (`docs/defects/fixed/a-review-decision-taken-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`).
 */
export type DecisionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string; readonly afterDisclosure?: Promise<DecisionResult> };

/**
 * Follows a decision to its outcome. While the disclosure stands the pane is told the decision is waiting on it (the
 * sentence is the host's: nothing has been recorded yet); the outcome returned is what the disclosure came to.
 */
export async function followDecision(first: DecisionResult, onWaiting: (sentence: string) => void): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  let r = first;
  while (!r.ok && r.afterDisclosure !== undefined) {
    onWaiting(r.reason);
    r = await r.afterDisclosure;
  }
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}
/**
 * What the blockers pane says about an answer: the sentence it is waiting on, or the refusal it quotes; never both.
 * `waiting` is a status (nothing was refused), `refusal` the alert (REQ-TRACE-454).
 */
export interface AnswerState { readonly waiting: string | null; readonly refusal: string | null }
/**
 * REQ-TRACE-453/454 with REQ-TRACE-472: the blockers pane's answer followed to what it came to. A resume that returns
 * the card to `ready` starts a run, so its first answer is the host's "nothing has been recorded yet", held behind the
 * disclosure. The pane is told it is WAITING while the disclosure stands; once the disclosure is accepted the answer
 * was taken and nothing is said; an abandonment, or a refusal, is quoted. Until 2026-10-02 the pane drew the first
 * answer as its refusal and kept it after the resume was taken
 * (`docs/defects/fixed/a-blocker-resumed-through-the-disclosure-leaves-the-pane-saying-nothing-was-recorded.md`).
 */
export async function followAnswer(first: DecisionResult, onState: (state: AnswerState) => void): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  const r = await followDecision(first, (sentence) => onState({ waiting: sentence, refusal: null }));
  onState({ waiting: null, refusal: r.ok ? null : r.reason });
  return r;
}
/**
 * REQ-TRACE-453/447: the host re-reads the blocker once the answer was TAKEN, which for a resume held behind the
 * disclosure is when the disclosure is accepted, not when the first answer arrives. An abandoned or refused answer
 * changed nothing, so nothing is re-read.
 */
export async function rereadWhenTaken(first: DecisionResult, reread: () => void): Promise<void> {
  const r = await followDecision(first, () => undefined);
  if (r.ok) reread();
}
/** REQ-TRACE-425's two sentences. */
export const REVIEW_READING = 'Reading the review…';
export const REVIEW_BUSY = 'A review is already being read; wait for it before asking again.';

// ---- blockers (REQ-TRACE-445..454) ----

export type AnswerPath = 'choose' | 'navigate' | 'resume' | 'inspect';
export interface BlockerPresentation {
  readonly heading: string;
  readonly lead: string;
  readonly reason: string;
  readonly options: readonly { readonly key: string; readonly label: string; readonly consequence: string | null }[];
  readonly blockingIds: readonly string[];
  readonly paths: readonly AnswerPath[];
  readonly navigable: boolean;
  readonly sideBySide: boolean;
  readonly runSessionId: string | null;
  readonly returnTo: string | null;
}
/** REQ-TRACE-448: the four named controls. */
export const PATH_LABELS: Readonly<Record<AnswerPath, string>> = Object.freeze({ choose: 'Choose', navigate: 'Go to the blocking requirement', resume: 'Clear the blocker', inspect: 'Open the run that failed' });
/** REQ-TRACE-447's positive statement where nothing holds the requirement. */
export const nothingHolds = (id: string): string => `Nothing is holding ${id}.`;
/** REQ-TRACE-452: the presentation is a function of the blocker value alone; option labels, reasons and consequences are the engine's, a missing label title-cased from its key. */
export function blockerPresentation(p: BlockerPayload): BlockerPresentation | null {
  const b = p.blocker;
  if (b === null) return null;
  const w = blockerWording(b.kind);
  return {
    heading: w.heading, lead: w.lead, reason: b.reason,
    options: b.options.map((o) => ({ key: o.key, label: o.label ?? o.key.split(/[-_\s]+/).filter(Boolean).map((x) => x[0]!.toUpperCase() + x.slice(1)).join(' '), consequence: o.consequence ?? null })),
    blockingIds: b.blockingIds, paths: p.answerPaths, navigable: b.blockingIds.length > 0, sideBySide: b.kind === 'conflict', runSessionId: b.runSessionId, returnTo: p.returnTo,
  };
}

// ---- the queue (REQ-TRACE-478..483) ----

/** REQ-TRACE-482's explicit wording, stated before the control is used and after. */
export const QUEUE_WORDING = Object.freeze({
  automaticOn: 'Automatic scheduling is on: the system itself picks up the next candidate as capacity becomes available.',
  automaticOff: 'Automatic scheduling is off: nothing begins until you release it.',
  stop: 'Stopping prevents anything new from beginning; work already dispatched continues and completes as usual.',
  stopped: 'The queue is stopped: nothing new begins until it is started again, while work already dispatched continues and completes as usual.',
  empty: 'Nothing is queued and nothing is executing. Release a requirement from the board, or let a blocked one return to the released state, to put something here.',
  concurrency: 'Units that may run at once. The ceiling of 64 is this control\'s; the engine enforces whatever the workspace configuration says.',
});
/** REQ-TRACE-481: the widget's own ceiling. */
export const CONCURRENCY_CEILING = 64;
export function clampConcurrency(n: number): number {
  return Math.min(CONCURRENCY_CEILING, Math.max(1, Math.floor(Number.isFinite(n) ? n : 1)));
}
export interface QueueRow { readonly entry: QueueEntry; readonly state: string; readonly reason: string | null; readonly waitingOnPerson: boolean; readonly sessionId?: string; readonly undisclosed: boolean }
/** REQ-TRACE-478: the scheduler's order untouched; REQ-TRACE-466's statement joined from the cards; an undisclosed launch is the one deferral the user can answer here. */
export function queueRows(queue: DeliveryQueue, cards: readonly { readonly id: string; readonly run?: { readonly sessionId?: string; readonly waitingOnPerson: boolean } }[]): readonly QueueRow[] {
  return queue.entries.map((entry) => {
    const card = cards.find((c) => c.id === entry.id);
    const reason = entry.reason ?? null;
    return { entry, state: entry.state === 'executing' ? 'Executing' : entry.state === 'next' ? 'Next' : 'Deferred', reason, waitingOnPerson: card?.run?.waitingOnPerson ?? false, ...(card?.run?.sessionId === undefined ? {} : { sessionId: card.run.sessionId }), undisclosed: reason !== null && /have not been disclosed/.test(reason) };
  });
}
/** REQ-TRACE-466's announced form: the run to be opened and, where known, the unit. */
export function waitingStatement(id: string, unit: string | undefined, sessionId: string | undefined): string {
  return `${id}${unit ? ` (unit ${unit})` : ''} is waiting on a person${sessionId ? ` in session ${sessionId}` : ''}; open the session to answer.`;
}

// ---- the disclosure (REQ-TRACE-470..474, 467/468) ----

/** REQ-TRACE-472/474: the dialog is shown only when due; the other three states carry their payload silently. */
export function disclosureFor(preview: LaunchPreview): { readonly show: boolean; readonly payload: DisclosureState } {
  switch (preview.disclosure) {
    case 'due': return { show: true, payload: 'accepted' };
    case 'suppressed': return { show: false, payload: 'suppressed' };
    case 'off': return { show: false, payload: 'off' };
    case 'unattended': return { show: false, payload: 'suppressed' };
  }
}
/** REQ-TRACE-468: an unlimited wait is rendered as one, never as the number zero. */
export function approvalWaitSentence(w: LaunchPreview['approvalWait']): string {
  return w.unlimited ? 'An approval or a question waits without limit; stopping the run releases it.' : `An approval or a question waits at most ${w.seconds} seconds before it is denied (runtime.approval_timeout_seconds).`;
}
/** REQ-TRACE-472: what the run receives, the worktree it is confined to, and when it begins — the lines the dialog states before anything happens. */
export function disclosureLines(preview: LaunchPreview): readonly string[] {
  const permissions = preview.permissions === 'permissive'
    ? 'This run receives the permissive permission preset for its own duration: no tool stops for approval. Every other run keeps the permissions its configuration specifies.'
    : 'This run receives the workspace\'s own permission mode; the elevation is switched off in settings.';
  const where = `It is confined to the worktree ${preview.worktreePath} on branch ${preview.branch} (unit ${preview.unit}).`;
  const when = preview.repository.ok ? (preview.startsNow ? 'It begins as soon as you accept.' : `It is queued: ${preview.deferredReason ?? 'the scheduler decides when it begins.'}`) : preview.repository.reason;
  return [permissions, where, approvalWaitSentence(preview.approvalWait), when];
}
export const DISCLOSURE_TITLE = 'Before this run starts';
export const DISCLOSURE_ACCEPT = 'Start the run';
export const DISCLOSURE_ACCEPT_ALWAYS = 'Start, and do not show this again';
export const DISCLOSURE_ABANDON = 'Abandon';
