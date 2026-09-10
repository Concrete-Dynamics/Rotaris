import type { BoardAction, BoardCard, BoardProjection, ColumnToken, DeliveryColumn, EpicCard, Reachability, ReqId } from '@rotaris/contracts';
import { DELIVERY_COLUMNS, HEALTH_TOKENS } from '@rotaris/contracts';
import { AXIS_OPEN, UNSET_BUCKET, columnLabel, pruneFolds, type GroupingAxis } from '@rotaris/ui-core';

/**
 * Part AK2 — the board's own pure model (spec 08; ADR-0041's second execution). Everything here is a function of
 * its arguments: the sentences the board prints, the naming table of REQ-TRACE-385, the affected-only merge of
 * REQ-TRACE-374, the geometry the specification fixes and the virtualisation arithmetic. Nothing reads the DOM, the
 * clock or a store; `ui-core`'s display mapping (`requirements/display.ts`, Part AK) does the projection-to-display
 * work and this file adds only what a drawn board needs on top of it.
 */

// ---- the drag payload (REQ-TRACE-396) ----

/** A private application-specific transfer type, never plain text, so nothing dragged from elsewhere can be misread as a requirement. */
export const PRIVATE_TRANSFER_TYPE = 'application/x-rotaris-requirement';

// ---- the move table (REQ-TRACE-385/386) and the confirmation set (REQ-TRACE-383) ----

/**
 * REQ-TRACE-385: the moves a USER may make, as a naming table — which action a (source, target) pair MEANS. It is not
 * a permission table: whether the move is offered is decided by asking the engine (`requirements.reachable`,
 * REQ-TRACE-394), and the board holds no table of what is permitted. A pair this table does not name yields no
 * action, which is "not the same as the engine refusing it". The two overriding rules come first.
 */
export function moveActionFor(from: ColumnToken | '', to: ColumnToken | ''): BoardAction | undefined {
  // REQ-TRACE-385: an empty source or target, or an equal pair, names nothing — the empty case is typed in so the
  // sentence is checkable rather than unreachable.
  if (from === '' || to === '' || from === to) return undefined;
  if (to === 'blocked') return 'hold';
  if (from === 'blocked') return 'resume';
  if ((from === 'backlog' || from === 'needs-update') && to === 'ready') return 'release';
  if (from === 'ready' && to === 'backlog') return 'return';
  if (from === 'review' && to === 'done') return 'accept';
  if (from === 'review' && to === 'ready') return 'send-back';
  return undefined;
}

/** REQ-TRACE-386: the ONE place that decides whether an action starts agent work; the target arrives already resolved. */
export function moveStartsRun(action: BoardAction, target: ColumnToken | undefined): boolean {
  if (action === 'release' || action === 'rerun' || action === 'send-back') return true;
  if (action === 'resume') return target === 'ready';
  return false;
}

/** REQ-TRACE-383: the six that require a stated consequence before they happen (REQ-TRACE-389). */
export const CONFIRM_ACTIONS: ReadonlySet<BoardAction> = new Set<BoardAction>(['release', 'rerun', 'send-back', 'accept', 'accept-proposal', 'accept-change-work']);

/** The payload a move needs from the person before the engine will take it: `hold` a reason, `send-back` the instructions (REQ-TRACE-389/423). */
export function payloadFieldFor(action: BoardAction): { readonly field: string; readonly title: string; readonly prompt: string; readonly refusal: string } | undefined {
  if (action === 'hold') return { field: 'reason', title: 'Hold this requirement', prompt: 'State why the requirement is blocked. The reason is recorded with the hold and shown on the card until the block clears.', refusal: 'A hold needs a stated reason; nothing was written.' };
  if (action === 'send-back') return { field: 'instructions', title: 'Send the agent back', prompt: 'What you write here is placed into the context given to the following run. Submitting nothing would repeat the previous run unaltered, so an empty instruction is refused.', refusal: 'The instruction is what the next run will receive; submitting nothing would repeat the previous run unaltered, so it is refused.' };
  return undefined;
}

/** REQ-TRACE-388: the per-action progress label naming what is happening, shown while the engine has not yet agreed. The service's projection carries the same words while the action is in flight there; this is the board's optimistic copy for the round trip. */
export function inFlightLabelFor(action: BoardAction): string {
  switch (action) {
    case 'release': return 'Releasing…';
    case 'return': return 'Returning…';
    case 'accept': return 'Accepting…';
    case 'rerun': return 'Re-running…';
    case 'send-back': return 'Sending back…';
    case 'reject': return 'Rejecting…';
    case 'hold': return 'Holding…';
    case 'resume': return 'Resuming…';
    case 'answer-blocker': return 'Answering the blocker…';
    case 'edit': return 'Saving the edit…';
    case 'create': return 'Creating…';
    case 'accept-proposal': return 'Accepting the proposal…';
    case 'accept-change-work': return 'Accepting the change-work…';
    case 'keep-worktree': return 'Keeping the worktree…';
  }
}

// ---- sentences (REQ-TRACE-231, 291, 336, 341..346, 390..392, 397, 507) ----

export const BOARD_TITLE = 'Requirements';
/** REQ-TRACE-231: never a blank pane — what a requirement source is and how one is configured. */
export const EMPTY_SOURCE_TITLE = 'No requirement source';
export const EMPTY_SOURCE_WHAT = 'A requirement source is a directory of Markdown documents, one requirement per document (or several per document under their own headings), each opening with a frontmatter block that declares its identifier, its lifecycle and its title.';
export const EMPTY_SOURCE_HOW = 'Configure one by placing a `rotaris-traceability.json` at the repository root whose `layout.requirements_dir` names that directory (the default is `docs/requirements`), then re-evaluate. The board reads the source through the traceability engine and never keeps a copy of it.';
export const EMPTY_STORE_SENTENCE = 'The requirement source is configured but holds no requirement documents yet.';
/** REQ-TRACE-342: ONE plain re-evaluation control, in exactly these words. */
export const REEVALUATE_LABEL = 'Re-evaluate';
export const REEVALUATE_DESCRIPTION = 'Re-reads the sources and the delivery store and applies the propagation rules. Consults no model and measures nothing; cards a rule moves will move.';
export const EVALUATING_LABEL = 'Re-evaluating…';
/** REQ-TRACE-346: the pass reports whether analysis is enabled; the board states the fact and deduces nothing. */
export const ANALYSIS_OFF_SENTENCE = 'Change analysis is switched off for this workspace (requirements.change.analyze_changes), as the pass reports; no analysis runs on refresh and nothing is put on offer.';
export const ANALYSIS_ON_SENTENCE = 'Change analysis is enabled for this workspace; a refresh that might reach a model announces itself for its duration and can be stopped. No such refresh exists in this build.';
/** REQ-TRACE-345: what the pass left unjudged, by identifier. This build's pass judges nothing, so the list is what it reports: none. */
export const AWAITING_JUDGEMENT_NONE = 'Awaiting judgement: none — this pass records no analyses, so no requirement is waiting on one.';
/** REQ-TRACE-507: the subscription is supervised where a failure can be observed; channel 10 reports none, and the board says so rather than guessing. */
export const SUBSCRIPTION_SENTENCE = 'Live refresh follows the engine over channel 10; the channel reports no failure of its own, so a stopped watcher cannot be told from a quiet one here. Re-evaluate is always the route to a current board.';
export const PROJECTION_UNAVAILABLE = 'The board could not be read';
export const READING_LABEL = 'Reading the board…';
/** REQ-TRACE-397: a refusal persists and can be acted on — the dismiss control's name. */
export const DISMISS_FEEDBACK = 'Dismiss this reason';
/** REQ-TRACE-255: selection is stated in a word, with an explanation. */
export const SELECTED_WORD = 'Selected';
export const SELECTED_EXPLANATION = "the board's controls act on this requirement";
export const FILTER_SHOW = 'Show filters';
export const FILTER_HIDE = 'Hide filters';
export const FILTER_CLEAR = 'Clear filter';
export const FILTER_NOTHING = 'No requirement matches the filter.';
export const BLOCKED_COLUMN_LABEL = 'Blocked column';
export const BLOCKED_COLUMN_DESCRIPTION = 'Whether blocked cards also gather into a column of their own; the delivery model is untouched either way.';
export const MOVE_CONTROL_NAME = 'Move requirement';

/** REQ-TRACE-390/391: the prompt when nothing is selected names the chord actually in force. */
export function nothingSelectedSentence(chord: string): string {
  return `Select a requirement on the board to move it (${chord} focuses this control).`;
}
/** REQ-TRACE-297: a drag on a non-delivery axis is refused in words, never silently. */
export function dragRefusedOnAxisSentence(axis: GroupingAxis, chord: string): string {
  return `Dragging moves a requirement between delivery states, and on the ${axis} axis the columns are not delivery states, so nothing can be dragged here. Use the move control (${chord}) or group by delivery.`;
}
/** REQ-TRACE-391: the reachable sentence names the requirement, its source column, the target and the consequence, in the sentence itself. */
export function moveReachableSentence(id: ReqId, from: ColumnToken, to: ColumnToken, consequence: string | undefined): string {
  return `Move ${id} from ${columnLabel(from)} to ${columnLabel(to)}. ${consequence ?? ''}`.trim();
}
/** REQ-TRACE-391: the refused sentence, then the engine's own words unchanged. */
export function moveRefusedSentence(id: ReqId, from: ColumnToken, to: ColumnToken, reason: string): string {
  return `${id} cannot move from ${columnLabel(from)} to ${columnLabel(to)}: ${reason}`;
}
/** REQ-TRACE-506: a prompt withdrawn because its requirement left the state the action was offered from. */
export function promptWithdrawnSentence(id: ReqId, action: BoardAction, from: ColumnToken): string {
  return `${id} is no longer in ${columnLabel(from)}, the state ${action.replaceAll('-', ' ')} was offered for; nothing was done. Invoke the action again against the requirement as it now stands.`;
}
/** REQ-TRACE-336: when the board last evaluated. */
export function evaluatedSentence(age: string): string {
  return age === '' ? 'Not evaluated yet' : `Evaluated ${age}`;
}
/** REQ-TRACE-234: the heading's accessible name states the label, the count and the fold action (REQ-TRACE-320). */
export function headingAccessibleName(label: string, count: number): string {
  return `${label} · ${count}, fold column`;
}
export function railAccessibleName(label: string, count: number): string {
  return `Unfold ${label} · ${count}`;
}

// ---- the move control (REQ-TRACE-390..392) ----

export type MoveControlState =
  | { readonly kind: 'none'; readonly sentence: string }
  | { readonly kind: 'reachable'; readonly id: ReqId; readonly from: ColumnToken; readonly to: DeliveryColumn; readonly consequence: string | undefined; readonly confirm: boolean; readonly glyph: string; readonly sentence: string }
  | { readonly kind: 'refused'; readonly id: ReqId; readonly from: ColumnToken; readonly to: ColumnToken; readonly reason: string; readonly glyph: string; readonly sentence: string };

/**
 * REQ-TRACE-390/391: the control aims at the FIRST delivery state the engine reports as reachable — read off the
 * engine's own enumeration (`reachableFromSource`, in the engine's order) rather than chosen here — and states one
 * column. `answers` holds the engine's answer per delivery target for the selected requirement; a target the engine
 * did not answer yet is treated as absent.
 */
export function moveControlState(selected: BoardCard | undefined, answers: ReadonlyMap<DeliveryColumn, Reachability>, chord: string): MoveControlState {
  if (selected === undefined) return { kind: 'none', sentence: nothingSelectedSentence(chord) };
  const first = [...answers.values()][0];
  if (first === undefined) return { kind: 'none', sentence: `Asking the engine what ${selected.id} can reach…` };
  const target = first.reachableFromSource[0];
  if (target !== undefined) {
    const a = answers.get(target);
    if (a !== undefined && a.reachable) return { kind: 'reachable', id: selected.id, from: selected.column, to: target, consequence: a.consequence, confirm: a.confirm, glyph: a.glyph, sentence: moveReachableSentence(selected.id, selected.column, target, a.consequence) };
  }
  // Nothing reachable: the first refused answer carries the engine's enumeration of what the source column can reach.
  const refusedTo = [...answers.keys()][0] ?? 'ready';
  const reason = first.reason ?? 'the engine gave no reason.';
  return { kind: 'refused', id: selected.id, from: selected.column, to: refusedTo, reason, glyph: first.glyph, sentence: moveRefusedSentence(selected.id, selected.column, refusedTo, reason) };
}

/** REQ-TRACE-393: one drop-target option per delivery column, from the engine's answers. */
export interface DropTargetOption { readonly target: DeliveryColumn; readonly label: string; readonly reachable: boolean; readonly consequence?: string; readonly confirm?: boolean; readonly reason?: string; readonly glyph: string }
export function dropTargetOptions(answers: ReadonlyMap<DeliveryColumn, Reachability>): readonly DropTargetOption[] {
  return DELIVERY_COLUMNS.map((target) => {
    const a = answers.get(target);
    if (a === undefined) return { target, label: columnLabel(target), reachable: false, reason: 'Not answered yet.', glyph: '…' };
    return a.reachable
      ? { target, label: columnLabel(target), reachable: true, ...(a.consequence === undefined ? {} : { consequence: a.consequence }), confirm: a.confirm, glyph: a.glyph }
      : { target, label: columnLabel(target), reachable: false, reason: a.reason ?? '', glyph: a.glyph };
  });
}

// ---- the affected-only merge (REQ-TRACE-374) ----

/**
 * A state update that names the requirements it affects changes ONLY those cards: every other card keeps its
 * identity (so a memoised widget does not repaint), and the rest of the projection — epics, queue, blocked, the
 * generation — is the new value's. Where nothing is named the whole value is taken, which comes to the same board.
 */
export function mergeAffected(previous: BoardProjection | null, next: BoardProjection, affected: readonly ReqId[] | null): BoardProjection {
  if (previous === null || affected === null) return next;
  const touched = new Set(affected);
  const before = new Map<ReqId, BoardCard>();
  for (const c of previous.cards) before.set(c.id, c);
  const cards = next.cards.map((c) => {
    const old = before.get(c.id);
    return old !== undefined && !touched.has(c.id) ? old : c;
  });
  return { ...next, cards };
}

// ---- geometry the specification fixes (REQ-TRACE-238, 310, 318, 490, 491) ----

export const COLUMN_MIN = 276;
export const COLUMN_MAX = 340;
export const COLUMN_MARGIN = 10;
export const RAIL_CHARS = 8;
export const RAIL_MARGIN = 4;
export const RAIL_HEADING_LINES = 2;
export const RAIL_DRAG_EXTRA_LINES = 1.5;
export const CLOSED_DROPDOWN_WIDTH = 240;
export const OPEN_DROPDOWN_WIDTH = 150;
export const PRIMARY_CONTROL_HEIGHT = 32;
export const OTHER_CONTROL_HEIGHT = 24;

// ---- virtualisation (REQ-TRACE-358..367) ----

export const OVERSCAN_CARDS = 5;
export const RELEASED_POOL_CAP = 20;
export const CARD_HEIGHT_ESTIMATE = 128;
export const SEARCH_DEBOUNCE_MS = 150;
/** REQ-TRACE-250: the injected clock is re-read once a minute — relative ages move at minute resolution and a card is not repainted by the clock between updates. */
export const CLOCK_TICK_MS = 60_000;

/** The realised band: the cards within the viewport at the tracked scroll position, extended by the margin on both sides, contiguous from the top. */
export function realisedBand(scrollTop: number, viewportHeight: number, itemHeight: number, count: number, overscan = OVERSCAN_CARDS): { readonly start: number; readonly end: number } {
  if (count === 0 || itemHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / itemHeight);
  const visible = Math.ceil(Math.max(0, viewportHeight) / itemHeight) + 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visible + overscan);
  return { start, end: Math.max(start, end) };
}

// ---- folds (REQ-TRACE-303..316) ----

const CLOSED_FOLD_KEYS: ReadonlySet<string> = new Set<string>([...DELIVERY_COLUMNS, 'blocked', ...HEALTH_TOKENS, 'draft', 'approved', 'deprecated', 'critical', 'high', 'normal', 'low', 'none', UNSET_BUCKET]);

/**
 * REQ-TRACE-316: prune only PROJECT-SUPPLIED keys (epic and source column keys) to the columns the board still has;
 * a decision recorded against a closed vocabulary's column is retained even while that column is absent — the
 * blocked column, withdrawn by its display preference, comes back carrying the decision the user last made. The
 * open-axis half is `ui-core`'s `pruneFolds`; this split is what keeps a `backlog` decision alive while the board is
 * grouped by epic.
 */
export function pruneUserFolds(decisions: Readonly<Record<string, boolean>>, axis: GroupingAxis, present: readonly string[]): Readonly<Record<string, boolean>> {
  if (!AXIS_OPEN[axis]) return decisions;
  const closed: Record<string, boolean> = {};
  const open: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(decisions)) { if (CLOSED_FOLD_KEYS.has(k)) closed[k] = v; else open[k] = v; }
  return { ...closed, ...pruneFolds(open, axis, present) };
}

// ---- alerts (REQ-TRACE-247) ----

export type AlertSeverity = 'failure' | 'stopped' | 'attention';
/** The three-value glyph set: failure, stopped and attention read alike in colour, so each carries a glyph as well. */
export const ALERT_GLYPH: Readonly<Record<AlertSeverity, string>> = Object.freeze({ failure: '✕', stopped: '■', attention: '▲' });
export function alertSeverity(alert: string): AlertSeverity {
  if (alert.startsWith('Verification failing') || alert.startsWith('Delivery record unreadable') || alert.startsWith('Delivery record unsupported')) return 'failure';
  if (alert.startsWith('Blocked')) return 'stopped';
  return 'attention';
}

// ---- epics (REQ-TRACE-282) ----

export interface EpicSummary { readonly children: number; readonly distribution: readonly { readonly column: ColumnToken; readonly count: number }[]; readonly tracedOf: number; readonly tracedTotal: number; readonly running: number; readonly blockers: number }
/** The five counts, over the epic's own children: the distribution across delivery states, the traced proportion over the NON-deprecated population (the same as the progress total), runs executing, blockers standing. */
export function epicSummary(epic: EpicCard, cards: readonly BoardCard[]): EpicSummary {
  const byId = new Map<ReqId, BoardCard>();
  for (const c of cards) byId.set(c.id, c);
  const children = epic.children.map((id) => byId.get(id)).filter((c): c is BoardCard => c !== undefined);
  const counted = children.filter((c) => c.lifecycle !== 'deprecated');
  const distribution: { column: ColumnToken; count: number }[] = [];
  for (const column of [...DELIVERY_COLUMNS, 'blocked'] as const) {
    const count = children.filter((c) => c.column === column).length;
    if (count > 0) distribution.push({ column, count });
  }
  return {
    children: epic.children.length,
    distribution,
    tracedOf: counted.filter((c) => c.evidence.implementationTrace !== undefined).length,
    tracedTotal: counted.length,
    running: children.filter((c) => c.column === 'running').length,
    blockers: children.filter((c) => c.blocker !== undefined).length,
  };
}
export function epicSummaryLine(s: EpicSummary): string {
  const spread = s.distribution.length === 0 ? 'no children on the board' : s.distribution.map((d) => `${d.count} ${columnLabel(d.column).toLowerCase()}`).join(', ');
  return `${s.children} ${s.children === 1 ? 'child' : 'children'} · ${spread} · ${s.tracedOf} of ${s.tracedTotal} traced · ${s.running} running · ${s.blockers} ${s.blockers === 1 ? 'blocker' : 'blockers'}`;
}

// ---- the observable state the proof and any caller reads (REQ-TRACE-366) ----

export interface BoardObservable {
  readonly generation: number;
  /** REQ-TRACE-366: the readiness flag and the pending count a caller waits on. */
  readonly ready: boolean;
  readonly pending: number;
  readonly realised: number;
  /** REQ-TRACE-239: the interface-thread cost of the last board put on screen, from the projection's arrival to the committed and laid-out DOM. */
  readonly paintMs: number | null;
  /** REQ-TRACE-367: the same cost for the last post-debounce filter recomputation. */
  readonly filterMs: number | null;
  /** REQ-TRACE-363: a search pause is outstanding. */
  readonly populating: boolean;
  readonly cards: number;
  readonly columns: number;
  /** REQ-TRACE-364: force a named card to be realised; false for an unknown or empty identifier. */
  readonly reveal: (id: ReqId) => boolean;
}

/** REQ-TRACE-296: an axis value the engine would compute — re-exported for the column's accessible description. */
export { columnLabel };
