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

/**
 * REQ-TRACE-482/476: whether an accepted act is followed by a kick of the coordinator. A run-starting move always is (the
 * coordinator then starts whatever the scheduler offers, and reports the reason when nothing began for this card); an act
 * that lands a card in `ready` without starting a run — a `reject` from review, chiefly — is too when the queue schedules
 * automatically, since "the system itself picks up the next candidate" and nothing else would until a person acted or a
 * run ended (defect note `an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md`).
 */
export function dispatchesAfter(action: BoardAction, target: ColumnToken | undefined, landed: ColumnToken, automatic: boolean): boolean {
  return moveStartsRun(action, target) || (automatic && landed === 'ready');
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
/**
 * REQ-TRACE-515, over REQ-TRACE-022/026: a document whose `req-id` is not an identifier is REJECTED and
 * contributes nothing, so a store
 * of nothing but rejected documents yields no cards at all. Reading the card count alone then printed
 * `EMPTY_STORE_SENTENCE` over it, and a store that will not parse read exactly like a store nobody has written to —
 * while the projection was carrying the engine's own errors the whole time (REQ-TRACE-231: never a blank pane, and
 * never a wrong one). The sentence names the condition; the errors themselves are the engine's words, unaltered.
 */
export const UNPARSED_STORE_SENTENCE = 'The requirement source is configured, but nothing in it could be read: every document was rejected.';
export const UNPARSED_STORE_HOW = 'Each rejection is listed below as the engine reported it. Correct the documents it names and re-evaluate; until then the board has nothing to show.';
/**
 * REQ-TRACE-380 with REQ-TRACE-515: which stated state the body shows is decided here, as a pure function of the projection, rather
 * than by a chain of conditions inside the drawn tree — `source` for no configured source, `unparsed` for a store
 * that yielded errors and no cards, `store` for one that is genuinely empty, and `null` when there is a board.
 */
/**
 * REQ-TRACE-515's part clause — the same defect in its quieter form: a store that parses in PART yields a board, and the documents the engine
 * rejected contribute nothing to it (REQ-TRACE-026). Saying nothing there would leave a requirement missing from
 * the board with no way to tell. The count is stated, and the engine's errors are listed beside it.
 */
export const rejectedDocumentsSentence = (n: number): string =>
  `${n} document${n === 1 ? '' : 's'} in the requirement source ${n === 1 ? 'was' : 'were'} rejected and ${n === 1 ? 'is' : 'are'} not on the board.`;
export function bodyStateOf(board: Pick<BoardProjection, 'source' | 'cards' | 'parseErrors'>): 'source' | 'unparsed' | 'store' | null {
  if (board.source.kind === 'none') return 'source';
  if (board.cards.length > 0) return null;
  return board.parseErrors.length > 0 ? 'unparsed' : 'store';
}
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

// ---- the second dimension (REQ-TRACE-237/239/300; defect AK2-3) ----

/**
 * Defect `AK2-3`. REQ-TRACE-239 says the work of displaying a board "SHALL be bounded by what is on screen rather
 * than by how many requirements the store holds", and REQ-TRACE-358 is the mechanism for it. The first build read
 * that in ONE dimension: a column realised only the cards its own vertical viewport exposed. But REQ-TRACE-237 makes
 * the COLUMNS area scroll sideways, and at REQ-TRACE-300's supported bound of a hundred populated columns the work
 * of building a hundred column subtrees in the single commit that switches the grouping axis was itself over the
 * budget — 150 to 180 ms of interface thread, measured five times, with 48 card widgets standing. Bounding the cards
 * was necessary and not sufficient; so the board now realises COLUMNS the way a column realises cards.
 *
 * What REQ-TRACE-300 forbids is truncating, hiding or refusing a column on account of how many there are, so an
 * unrealised column is not removed: it keeps a sized placeholder of exactly its own box, holding its label key, its
 * count and nothing else. Its width, its place in the row, its share of the horizontal scroll range and every other
 * column's position are therefore unchanged (REQ-TRACE-237/238/335), and the moment it enters the area's viewport it
 * is built with its heading, its cards and its accessible description. A FOLDED column is never virtualised: a rail
 * holds no card widgets already (REQ-TRACE-311) and its accessible name is what REQ-TRACE-320 asks a reader to find.
 *
 * The margin is HALF a column, and that figure is measured rather than assumed. REQ-TRACE-360 fixes the vertical
 * margin at five cards; nothing fixes a horizontal one, and a full column of margin was the first guess, by analogy.
 * Measured at 1264 px it builds a sixth column whose cards are the sixth of the widgets an axis switch pays for, to
 * cover a wheel notch of about a hundred points that the band re-decides within the frame anyway. Half a column
 * still covers the notch and does not pay for the column.
 */
export const COLUMN_OVERSCAN_PX = COLUMN_MIN / 2;
/** The design's `--rt-space-3`, used ONLY to size the first band before any box has been laid out; every later band is read off the laid-out boxes. */
export const COLUMN_GAP = 12;

/** How many columns to build before anything has been measured: what the window could show, plus one column of margin either side. */
export function initialColumnBandEnd(viewportWidth: number): number {
  return Math.ceil(Math.max(0, viewportWidth) / (COLUMN_MIN + COLUMN_GAP)) + 2;
}

/** A laid-out box's horizontal extent. Named for the columns because `ui`'s barrel already exports a `Span` of the markdown renderer's. */
export interface ColumnSpan { readonly left: number; readonly right: number }

/**
 * The columns lying within the area's own viewport, extended by one column of margin on either side, as a contiguous
 * band of indices. Boxes are supplied by the caller (every column is in the document, realised or placeholder, so the
 * geometry is exact and a rail's narrower box needs no arithmetic of its own). An area with no laid-out width yields
 * the first column alone rather than all of them, so a board measured before layout does not build a hundred columns.
 */
export function visibleColumnBand(items: readonly ColumnSpan[], area: ColumnSpan, margin = COLUMN_OVERSCAN_PX): { readonly start: number; readonly end: number } {
  if (items.length === 0) return { start: 0, end: 0 };
  let start = -1;
  let end = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    if (item.right >= area.left - margin && item.left <= area.right + margin) {
      if (start === -1) start = i;
      end = i + 1;
    }
  }
  return start === -1 ? { start: 0, end: 1 } : { start, end };
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
  /**
   * REQ-TRACE-239: the instant (`performance.now()`) that figure began — the engine's answer. A long task that ended
   * before it is not the work of putting the board on screen: the view's own first mount, which runs before the board
   * is even asked for, is one (finacc3, 2026-10-07: a 423 ms mount task, 210 ms of it lazy compilation, against a
   * 32 ms paint).
   */
  readonly paintFrom: number | null;
  /**
   * REQ-TRACE-424/426: each read of the review pane's payload, in order — `open` from the pane's opening, `reload` from
   * the decision notice's one action — and when it was asked. A diagnosis for requirements-proof's L12 stage, whose
   * one red showed a refusal payload under the notice of the user's own accept, which only a second read can draw.
   */
  readonly reviewReads: readonly { readonly via: 'open' | 'reload'; readonly at: number }[];
  /** REQ-TRACE-367: the same cost for the last post-debounce filter recomputation. */
  readonly filterMs: number | null;
  /** REQ-TRACE-363: a search pause is outstanding. */
  readonly populating: boolean;
  readonly cards: number;
  readonly columns: number;
  /** REQ-TRACE-364: force a named card to be realised; false for an unknown or empty identifier. */
  readonly reveal: (id: ReqId) => boolean;
  /**
   * Part R2 — REQ-TRACE-369/375: which of the five panes this board has BUILT, and when each was built. A key that
   * has never been opened reports `installed: false` and `openedAt: null`, and asking builds nothing; a key opened
   * twice keeps its first `openedAt`, which is what "constructed on first use and reused after" looks like from
   * outside. `openPane` is the one on screen, if any.
   */
  readonly panes: readonly { readonly key: string; readonly installed: boolean; readonly openedAt: number | null }[];
  readonly openPane: string | null;
  /** Part R2 — REQ-TRACE-322/327: the graph in view, or null while no centre has been chosen (REQ-TRACE-333). */
  readonly graph: { readonly centre: ReqId; readonly depth: number; readonly nodes: number; readonly edges: number; readonly unexpanded: number } | null;
}

/** REQ-TRACE-296: an axis value the engine would compute — re-exported for the column's accessible description. */
export { columnLabel };
