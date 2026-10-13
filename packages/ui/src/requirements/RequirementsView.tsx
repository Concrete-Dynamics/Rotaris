import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BlockerPayload, BoardAction, BoardCard, BoardProjection, ColumnToken, DeliveryColumn, DeliveryQueue, EpicCard, LaunchPreview, PaneKey, Reachability, Refusal, ReqId, RequirementDetail, RequirementsChanged, ReviewPayload, TransitionOutcome } from '@rotaris/contracts';
import { COLUMN_TOKENS, DELIVERY_COLUMNS, HEALTH_TOKENS } from '@rotaris/contracts';
import { AXES, AXIS_DRAGGABLE, EMPTY_AXIS_SENTENCE, EMPTY_COLUMN_SENTENCE, EMPTY_FILTER, SORT_ORDERS, absoluteMoment, axisOf, columnLabel, columnsFor, describeFilter, distribute, emptinessFolds, filterActive, filterCards, foldDecision, parseFolds, relativeAge, serializeFolds, sortCards, sortOrderOf, type BoardFilter, type GroupingAxis, type SortOrder } from '@rotaris/ui-core';
import { ConfirmDialog } from '../ConfirmDialog.js';
import { formatChord, type KeyboardPlatform } from '../commands/registry.js';
import { BlockedStrip } from './BlockedStrip.js';
import { RequirementCard } from './Card.js';
import { Column } from './Column.js';
import { DetailPanel } from './DetailPanel.js';
import { EpicCardView } from './EpicCardView.js';
import { EvidencePane, evidenceOpenerSelector } from './EvidencePane.js';
import { MoveControl } from './MoveControl.js';
import { ReasonDialog } from './ReasonDialog.js';
import { ANALYSIS_OFF_SENTENCE, ANALYSIS_ON_SENTENCE, AWAITING_JUDGEMENT_NONE, BLOCKED_COLUMN_DESCRIPTION, BLOCKED_COLUMN_LABEL, BOARD_TITLE, CARD_HEIGHT_ESTIMATE, CLOCK_TICK_MS, CLOSED_DROPDOWN_WIDTH, CONFIRM_ACTIONS, EMPTY_SOURCE_HOW, EMPTY_SOURCE_TITLE, EMPTY_SOURCE_WHAT, EMPTY_STORE_SENTENCE, EVALUATING_LABEL, FILTER_CLEAR, FILTER_HIDE, FILTER_NOTHING, FILTER_SHOW, OPEN_DROPDOWN_WIDTH, PROJECTION_UNAVAILABLE, READING_LABEL, REEVALUATE_DESCRIPTION, REEVALUATE_LABEL, SEARCH_DEBOUNCE_MS, SUBSCRIPTION_SENTENCE, UNPARSED_STORE_HOW, UNPARSED_STORE_SENTENCE, bodyStateOf, dispatchesAfter, dragRefusedOnAxisSentence, rejectedDocumentsSentence, dropTargetOptions, evaluatedSentence, inFlightLabelFor, initialColumnBandEnd, mergeAffected, moveActionFor, moveControlState, moveStartsRun, payloadFieldFor, promptWithdrawnSentence, pruneUserFolds, visibleColumnBand, type BoardObservable } from './model.js';
// Part R2 — the five panes Part AP built and nothing hosted, the elevation's disclosure, and the relationship graph.
import { GRAPH_DEPTH_DEFAULT, buildGraph, clampDepth } from './graph.js';
import { GraphPane } from './GraphPane.js';
import { BlockersPane } from './panes/BlockersPane.js';
import { CreatePane, EditorPane, type CreateDraft } from './panes/EditorPane.js';
import { LaunchDisclosure } from './panes/LaunchDisclosure.js';
import { QueuePane } from './panes/QueuePane.js';
import { ReviewPane } from './panes/ReviewPane.js';
import { reviewReads as createReviewReads } from './panes/review-reads.js';
import { createPaneRegistry } from './panes/registry.js';
import { disclosureFor, rereadWhenTaken, type DecisionResult } from './panes/presentation.js';
// Defect R2-3: `PANE_TITLE` belongs in this list. It was dropped from it while the pane host's own chrome did not yet
// exist, then used by that chrome — and a bundler does not resolve identifiers, so the renderer built cleanly and threw
// `PANE_TITLE is not defined` the first time a pane opened, which React answers by unmounting the whole tree.
import { consequenceForDecision, DISPATCH_NOTHING_STARTED, heldLaunch, LAUNCH_ABANDONED, PANE_TITLE, QUEUE_CONTROL_LABEL, readOnlyEditorRefusal, type HeldLaunch } from './panes-host.js';
import { Button as DesignButton, Checkbox as DesignCheckbox, EmptyState as DesignEmptyState, Input as DesignInput, Select as DesignSelect } from '../design-system/index.js';

/**
 * Part AK2 — the Requirements view (spec 08 §Board Surface onwards; REQ-SHELL-023's fourth primary view; ADR-0041's
 * second execution). The board draws ONE immutable projection per generation, read through the host and never
 * assembled locally (REQ-TRACE-378/379): the host is the bridge, and every value on screen is the engine's, already
 * translated by `ui-core`'s pure display mapping (REQ-TRACE-380). The board holds the display state the
 * specification says a person owns — the filter, the sort order, the axis, the blocked-column setting (global) and
 * the folds (per workspace), REQ-TRACE-301 — reads them once before the first paint and writes each on change,
 * never on read: a value written back unchanged would be a write produced by opening (REQ-TRACE-408).
 *
 * Live refresh (REQ-TRACE-334/374): the host's subscription is channel 10; a change that names the requirements it
 * affects replaces ONLY those cards (`mergeAffected`), so a memoised card that was not named keeps its element and
 * does not repaint; selection, each column's scroll offset and an open detail survive because none of them is a
 * property of the projection (REQ-TRACE-335). A failed read keeps the last good board and states the error
 * (REQ-TRACE-338/498). The write path is one: `host.act` with an action from the closed set, attributed by main to
 * the user, and no card comes to rest anywhere the engine did not put it (REQ-TRACE-387/388/399) — an optimistic
 * label is shown for the round trip and the resting state is the next projection's.
 *
 * The clock is the host's (REQ-TRACE-250) and is READ ONCE per board arrival and once a minute after, never per
 * render, so a card whose inputs did not change is not repainted by the passage of time between two updates.
 *
 * Structure from the specification; craft from the mockup's `REQUIREMENTS` screen (the 48 px header row with the
 * title and a mono count, the kicker-headed columns, the cards, the folded rail, the detail aside). The mockup's
 * Kanban / List / Graph tabs are design, not structure, and are not drawn.
 */
export type HostResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };
export type ActOutcome = { readonly ok: true; readonly value: TransitionOutcome } | { readonly ok: false; readonly error: Refusal };
// Part R2 — the four answers the panes' commands come back as. Each is the service's own reply shape, narrowed here
// so the view never invents a field: a refusal is `{ok: false, error: {reason}}` exactly as `requirements.act`'s is.
export type QueueChange = { readonly automatic?: boolean; readonly concurrency?: number; readonly stop?: true; readonly start?: true; readonly hold?: ReqId; readonly release?: ReqId; readonly disclosure?: 'accepted' | 'suppressed' | 'off' };
export type SourceWriteOutcome = { readonly ok: true; readonly value: { readonly id: ReqId; readonly path: string } } | { readonly ok: false; readonly error: Refusal };
export type LocationPreviewOutcome =
  | { readonly ok: true; readonly value: { readonly id: ReqId; readonly location: string; readonly confirmSourceWrites: boolean; readonly storeDir: string; readonly epics: readonly { readonly id: ReqId; readonly title: string }[] } }
  | { readonly ok: false; readonly error: Refusal };
export interface DispatchOutcome { readonly started: readonly { readonly id: ReqId; readonly unit: string; readonly sessionId: string }[]; readonly abandoned: readonly { readonly id: ReqId; readonly unit: string; readonly reason: string }[] }
/**
 * What the one write path answers a pane that asked for a decision: taken, or not taken with the reason
 * (REQ-TRACE-423/432) — and, for a decision held behind the launch's disclosure, the outcome still to come
 * (REQ-TRACE-472; `DecisionResult`).
 */
export type PerformResult = DecisionResult;
export type BoardPreferenceKey = 'requirements/filter/text' | 'requirements/filter/epic' | 'requirements/filter/source' | 'requirements/filter/lifecycle' | 'requirements/filter/health' | 'requirements/filter/priority' | 'requirements/sort' | 'requirements/blocked_column' | 'requirements/axis' | 'workspaces/{workspace}/requirementColumnFolds';
export interface BoardPreferences { readonly filter: BoardFilter; readonly sort: string; readonly axis: string; readonly blockedColumn: boolean; readonly folds: string }

/** The surrounding application, faked in tests: the bridge's commands, the channel-10 subscription, the preference store, the clock and the chord in force. */
export interface RequirementsHost {
  readonly workspace: string;
  readBoard(): Promise<HostResult<BoardProjection>>;
  readDetail(id: ReqId): Promise<HostResult<RequirementDetail>>;
  refresh(): Promise<HostResult<{ readonly generation: number }>>;
  reachable(id: ReqId, from: ColumnToken, to: ColumnToken): Promise<HostResult<Reachability>>;
  act(id: ReqId, action: BoardAction, target: ColumnToken | undefined, payload: Readonly<Record<string, string>> | undefined): Promise<HostResult<ActOutcome>>;
  // Part R2 — what hosting Part AP's panes and its run coordinator needs (spec 08 §Review Surface, §Blockers,
  // §Editing and Creating Requirements, §Delivery Queue, §Runs Started from the Board). Every one is a command the
  // seam already carries; the board sends them and composes nothing (REQ-TRACE-378).
  readReview(id: ReqId): Promise<HostResult<ReviewPayload>>;
  readBlocker(id: ReqId): Promise<HostResult<BlockerPayload>>;
  setQueue(change: QueueChange): Promise<HostResult<DeliveryQueue>>;
  writeSource(request: { readonly id?: ReqId; readonly document: string }): Promise<HostResult<SourceWriteOutcome>>;
  previewLocation(epic: ReqId | undefined): Promise<HostResult<LocationPreviewOutcome>>;
  /** REQ-TRACE-472: main's coordinator answers what the run receives and where it is confined; a preview provisions nothing. */
  launchPreview(id: ReqId, action: BoardAction): Promise<HostResult<LaunchPreview>>;
  /** REQ-TRACE-463/478: the coordinator claims and starts whatever the scheduler offers now. */
  dispatchRuns(): Promise<HostResult<DispatchOutcome>>;
  /** REQ-TRACE-472: a plain acceptance, which suppresses the disclosure for the remainder of this launch (main holds it). */
  acceptDisclosure(): Promise<HostResult<unknown>>;
  /** REQ-TRACE-472: accepting permanently suppresses the disclosure in later launches. */
  suppressDisclosure(): Promise<HostResult<unknown>>;
  onChanged(listener: (change: RequirementsChanged) => void): () => void;
  readPreferences(): Promise<BoardPreferences>;
  writePreference(key: BoardPreferenceKey, value: string): void;
  /** REQ-TRACE-250: the clock is injected; the board reads none of its own. */
  now(): string;
  readonly localOffsetMinutes: number;
  /** REQ-TRACE-390: the chord actually in force for the move control, as the registry has it. */
  readonly chord: string;
  readonly platform: KeyboardPlatform;
  /** REQ-TRACE-266/269: a navigation request the application carries out; absent, the control is not offered (372). */
  readonly openSession?: ((sessionId: string) => void) | undefined;
}

interface Latest {
  board: BoardProjection | null;
  axis: GroupingAxis;
  chord: string;
  inFlight: ReadonlyMap<ReqId, string>;
  detailId: ReqId | null;
  decisions: Readonly<Record<string, boolean>>;
  columnKeys: readonly string[];
  members: ReadonlyMap<string, readonly BoardCard[]>;
  confirm: PendingConfirm | null;
  cards: readonly BoardCard[];
  epics: readonly EpicCard[];
}
interface PendingConfirm { readonly id: ReqId; readonly action: BoardAction; readonly from: ColumnToken; readonly to: ColumnToken; readonly consequence: string; readonly payload?: Readonly<Record<string, string>> }
interface PendingReason { readonly id: ReqId; readonly action: BoardAction; readonly from: ColumnToken; readonly to: ColumnToken; readonly field: string; readonly title: string; readonly prompt: string; readonly refusal: string; readonly consequence: string | undefined; readonly confirm: boolean }
interface DragState { readonly id: ReqId; readonly from: ColumnToken; readonly answers: ReadonlyMap<ColumnToken, Reachability>; readonly hover: string | null }
/** The engine's answers for ONE selection of one generation; a stale key reads as no answers, so no effect has to clear them (REQ-TRACE-394). */
interface Answers { readonly key: string; readonly map: ReadonlyMap<DeliveryColumn, Reachability> }

const LIFECYCLES = ['draft', 'approved', 'deprecated'] as const;
const PRIORITIES = ['Critical', 'High', 'Normal', 'Low'] as const;
const NO_CARDS: readonly BoardCard[] = Object.freeze([]);
const NO_EPICS: readonly EpicCard[] = Object.freeze([]);
const NO_LINES: readonly string[] = Object.freeze([]);
const NO_ANSWERS: ReadonlyMap<DeliveryColumn, Reachability> = new Map();

function withEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> { const next = new Map(map); next.set(key, value); return next; }
function withoutEntry<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> { if (!map.has(key)) return map; const next = new Map(map); next.delete(key); return next; }
function sentenceCase(action: BoardAction): string { const s = action.replaceAll('-', ' '); return `${s[0]!.toUpperCase()}${s.slice(1)}`; }

declare global { interface Window { __rotarisBoard?: BoardObservable } }

export function RequirementsView({ host }: { readonly host: RequirementsHost }) {
  const [board, setBoard] = useState<BoardProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(true);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<BoardFilter>(EMPTY_FILTER);
  const [typed, setTyped] = useState('');
  const [sort, setSort] = useState<SortOrder>('priority');
  const [axis, setAxis] = useState<GroupingAxis>('delivery');
  const [blockedColumn, setBlockedColumn] = useState(true);
  const [decisions, setDecisions] = useState<Readonly<Record<string, boolean>>>({});
  const [filtersShown, setFiltersShown] = useState(false);
  const [selected, setSelected] = useState<ReqId | null>(null);
  const [detailId, setDetailId] = useState<ReqId | null>(null);
  const [detail, setDetail] = useState<RequirementDetail | null>(null);
  const [evidenceId, setEvidenceId] = useState<ReqId | null>(null);
  const [feedback, setFeedback] = useState<ReadonlyMap<ReqId, readonly string[]>>(new Map());
  const [inFlight, setInFlight] = useState<ReadonlyMap<ReqId, string>>(new Map());
  const [answers, setAnswers] = useState<Answers>({ key: '', map: NO_ANSWERS });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [reason, setReason] = useState<PendingReason | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ readonly column: string; readonly index: number; readonly id: ReqId } | null>(null);
  // ---- Part R2: the panes, the launch disclosure and the graph ----
  const [pane, setPane] = useState<PaneKey | null>(null);
  const [paneTarget, setPaneTarget] = useState<ReqId | null>(null);
  const [review, setReview] = useState<ReviewPayload | 'reading' | null>(null);
  const [reviewError, setReviewError] = useState<string | undefined>(undefined);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [blockerPayload, setBlockerPayload] = useState<BlockerPayload | null>(null);
  /** REQ-TRACE-472: the launch whose disclosure is on screen. Nothing has been sent while this stands; abandoning sends nothing at all. */
  const [launch, setLaunch] = useState<{ readonly id: ReqId; readonly action: BoardAction; readonly from: ColumnToken; readonly to: ColumnToken; readonly payload: Readonly<Record<string, string>> | undefined; readonly preview: LaunchPreview; readonly via: 'act' | 'queue'; readonly sendTarget: ColumnToken | undefined } | null>(null);
  /**
   * REQ-TRACE-472 with REQ-TRACE-426: the outcome owed to whoever asked for the launch now on screen. The disclosure
   * is answered here, not where the action was asked for, so the asker is told what it came to — the act's result
   * once accepted, the abandonment otherwise — rather than being left with "nothing has been recorded".
   */
  const held = useRef<HeldLaunch | null>(null);
  /** REQ-TRACE-322/323: the graph's centre, and its depth — held here and deliberately NOT persisted (the graph opens at the default every time). */
  const [graphCentre, setGraphCentre] = useState<ReqId | null>(null);
  const [graphDepth, setGraphDepth] = useState(GRAPH_DEPTH_DEFAULT);
  const [realised, setRealised] = useState<ReadonlyMap<string, number>>(new Map());
  /** REQ-TRACE-360/361 (defect AK2-3): the best card height this board has actually measured, so a column built later starts from it instead of the built-in estimate. */
  const [cardEstimate, setCardEstimate] = useState(CARD_HEIGHT_ESTIMATE);
  const [paintMs, setPaintMs] = useState<number | null>(null);
  const [paintFrom, setPaintFrom] = useState<number | null>(null);
  /**
   * Defect AK2-3: the columns the area's own viewport exposes, as a contiguous band of indices into `columnKeys`.
   * Every other column is a sized placeholder (REQ-TRACE-237/239/300 — see `visibleColumnBand`). Before anything is
   * laid out the band is what the window could show plus a column of margin, so the first commit is bounded too.
   */
  const [columnBand, setColumnBand] = useState(() => ({ start: 0, end: initialColumnBandEnd(typeof window === 'undefined' ? 1280 : window.innerWidth) }));
  /** REQ-TRACE-300/484: a column the keyboard has traversed to, focused once the band has realised it. */
  const [columnFocus, setColumnFocus] = useState<string | null>(null);
  const [filterMs, setFilterMs] = useState<number | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [now, setNow] = useState(() => host.now());
  /** What the next committed layout is measured against: the projection's arrival (REQ-TRACE-239) or the debounce firing (REQ-TRACE-367). */
  const measure = useRef<{ readonly kind: 'paint' | 'filter'; readonly at: number } | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const filterToggleRef = useRef<HTMLButtonElement | null>(null);
  const columnsRef = useRef<HTMLDivElement | null>(null);
  /** The last value read from or written to each preference key, so a state that merely arrived from the store is not written back (REQ-TRACE-408). */
  const stored = useRef<Partial<Record<BoardPreferenceKey, string>>>({});
  const chord = formatChord(host.chord, host.platform);
  const latest = useRef<Latest>({ board: null, axis: 'delivery', chord, inFlight, detailId: null, decisions: {}, columnKeys: [], members: new Map(), confirm: null, cards: NO_CARDS, epics: NO_EPICS });

  const persist = useCallback((key: BoardPreferenceKey, value: string) => {
    if (stored.current[key] === value) return;
    stored.current[key] = value;
    host.writePreference(key, value);
  }, [host]);

  // ---- reading: the preferences and the board arrive together, so the first paint is right (REQ-TRACE-321) ----
  useEffect(() => {
    let live = true;
    void Promise.all([host.readPreferences(), host.readBoard()]).then(([p, b]) => {
      if (!live) return;
      stored.current = {
        'requirements/filter/text': p.filter.text, 'requirements/filter/epic': p.filter.epic, 'requirements/filter/source': p.filter.source, 'requirements/filter/lifecycle': p.filter.lifecycle, 'requirements/filter/health': p.filter.health, 'requirements/filter/priority': p.filter.priority,
        'requirements/sort': p.sort, 'requirements/axis': p.axis, 'requirements/blocked_column': p.blockedColumn ? 'true' : 'false', 'workspaces/{workspace}/requirementColumnFolds': p.folds,
      };
      setFilter(p.filter);
      setTyped(p.filter.text);
      setSort(sortOrderOf(p.sort));
      setAxis(axisOf(p.axis));
      setBlockedColumn(p.blockedColumn);
      setDecisions(parseFolds(p.folds));
      if (filterActive(p.filter)) setFiltersShown(true);
      measure.current = { kind: 'paint', at: performance.now() };
      setNow(host.now());
      if (b.ok) { setBoard(b.value); setError(null); } else setError(b.reason);
      setReading(false);
    });
    return () => { live = false; };
  }, [host]);

  // REQ-TRACE-250: the injected clock, read once a minute so relative ages move without repainting on every render.
  useEffect(() => {
    const t = setInterval(() => setNow(host.now()), CLOCK_TICK_MS);
    return () => clearInterval(t);
  }, [host]);

  // ---- REQ-TRACE-239 / 367: the interface-thread cost, measured from the trigger to the committed and laid-out DOM ----
  useLayoutEffect(() => {
    const m = measure.current;
    if (m === null) return;
    measure.current = null;
    void columnsRef.current?.scrollWidth; // force layout so the figure includes it
    const elapsed = performance.now() - m.at;
    if (m.kind === 'paint') { if (board !== null) { setPaintMs(elapsed); setPaintFrom(m.at); setReady(true); } }
    else setFilterMs(elapsed);
  }, [board, filter]);

  /**
   * Defect AK2-3: which columns the area's viewport exposes, read off the laid-out boxes — every column is in the
   * document, realised or placeholder, so this is exact and needs no arithmetic over widths, gaps or rails. Once per
   * frame on a horizontal scroll or a resize, and once after any commit that could have moved a column.
   */
  const measureBand = useCallback(() => {
    const el = columnsRef.current;
    if (el === null) return;
    const area = el.getBoundingClientRect();
    if (area.width <= 0) return; // not laid out yet; the band that is already set stands
    const items = [...el.querySelectorAll<HTMLElement>(':scope > [data-column]')];
    if (items.length === 0) return;
    const next = visibleColumnBand(items.map((i) => i.getBoundingClientRect()), area);
    setColumnBand((p) => (p.start === next.start && p.end === next.end ? p : next));
  }, []);
  const bandFrame = useRef<number | null>(null);
  const scheduleBand = useCallback(() => {
    if (bandFrame.current !== null) return;
    bandFrame.current = requestAnimationFrame(() => { bandFrame.current = null; measureBand(); });
  }, [measureBand]);
  useEffect(() => {
    const el = columnsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(scheduleBand);
    ro.observe(el);
    return () => { ro.disconnect(); if (bandFrame.current !== null) { cancelAnimationFrame(bandFrame.current); bandFrame.current = null; } };
  }, [scheduleBand, board]);

  const refreshDetail = useCallback((id: ReqId) => {
    void host.readDetail(id).then((r) => { if (r.ok && latest.current.detailId === id) setDetail(r.value); });
  }, [host]);

  /**
   * Every board that arrives after the first comes through here: the affected-only merge (REQ-TRACE-374), the open
   * detail refreshed where it stands (REQ-TRACE-335), and a confirmation withdrawn when its requirement left the
   * state the action was offered from (REQ-TRACE-506) — decided against the ARRIVING value, in the event that
   * brought it, so nothing is written for a requirement the board no longer holds in that state.
   */
  const adoptBoard = useCallback((next: BoardProjection, affected: readonly ReqId[] | null) => {
    measure.current = { kind: 'paint', at: performance.now() };
    setNow(host.now());
    setBoard((prev) => mergeAffected(prev, next, affected));
    setError(null);
    const c = latest.current.confirm;
    if (c !== null) {
      const card = next.cards.find((x) => x.id === c.id);
      if (card === undefined || card.column !== c.from) { setConfirm(null); setNotice(promptWithdrawnSentence(c.id, c.action, c.from)); }
    }
    const d = latest.current.detailId;
    if (d !== null) refreshDetail(d);
  }, [host, refreshDetail]);

  // ---- REQ-TRACE-334/374/507: live refresh over channel 10 ----
  useEffect(() => host.onChanged((change) => {
    void host.readBoard().then((r) => {
      if (!r.ok) { setError(r.reason); return; }
      adoptBoard(r.value, change.affected);
    });
  }), [host, adoptBoard]);

  // ---- REQ-TRACE-363: the search box applies after 150 ms without a keystroke; the other five dimensions apply at once ----
  const populating = typed !== filter.text;
  useEffect(() => {
    if (!populating) return;
    const t = setTimeout(() => { measure.current = { kind: 'filter', at: performance.now() }; setFilter((f) => ({ ...f, text: typed })); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [typed, populating]);

  // ---- persistence (REQ-TRACE-301): each global key written on change, and only on change ----
  useEffect(() => { persist('requirements/filter/text', filter.text); persist('requirements/filter/epic', filter.epic); persist('requirements/filter/source', filter.source); persist('requirements/filter/lifecycle', filter.lifecycle); persist('requirements/filter/health', filter.health); persist('requirements/filter/priority', filter.priority); }, [persist, filter]);
  useEffect(() => { persist('requirements/sort', sort); }, [persist, sort]);
  useEffect(() => { persist('requirements/axis', axis); }, [persist, axis]);
  useEffect(() => { persist('requirements/blocked_column', blockedColumn ? 'true' : 'false'); }, [persist, blockedColumn]);

  // ---- the display model (REQ-TRACE-235/293..299) ----
  const cards = useMemo(() => board?.cards ?? NO_CARDS, [board]);
  const epics = useMemo(() => board?.epics ?? NO_EPICS, [board]);
  const epicIds = useMemo(() => new Set(epics.map((e) => e.id)), [epics]);
  const filtered = useMemo(() => filterCards(cards, filter, epics), [cards, filter, epics]);
  // REQ-TRACE-496, cited here because this is the call that meets its first two clauses: `distribute` walks the
  // delivery axis in `DELIVERY_COLUMNS`' own order — a constant of the contract, never derived from the data, so an
  // empty column keeps its place — and for a CLOSED vocabulary emits every value while an open one (epic, source)
  // emits only the values present, with the unset bucket last. The sort within a column is `sortCards` below.
  const distribution = useMemo(() => distribute(axis, filtered, epics, blockedColumn), [axis, filtered, epics, blockedColumn]);
  const columnKeys = useMemo(() => [...distribution.keys()], [distribution]);
  const members = useMemo(() => { const m = new Map<string, readonly BoardCard[]>(); for (const k of columnKeys) m.set(k, sortCards(distribution.get(k) ?? [], sort)); return m; }, [columnKeys, distribution, sort]);
  const foldEmpty = useMemo(() => emptinessFolds(cards), [cards]);
  const projectSupplied = axis === 'epic' || axis === 'source';
  const sources = useMemo(() => [...new Set(cards.map((c) => c.sourceKey))].filter((s) => s !== '').sort(), [cards]);
  /** REQ-TRACE-316: every project-supplied column the board COULD have, on either open axis, so a decision is pruned only when its column is gone from the store and not merely off the current axis. */
  const openKeys = useMemo(() => [...columnsFor('epic', cards, epics), ...columnsFor('source', cards, epics)], [cards, epics]);
  const selectedCard = selected === null ? undefined : cards.find((c) => c.id === selected);
  const selectedId = selectedCard === undefined || epicIds.has(selectedCard.id) ? null : selectedCard.id;
  const selectedColumn = selectedCard?.column ?? null;
  const generation = board?.generation ?? 0;
  const answersKey = selectedId === null ? '' : `${selectedId}@${selectedColumn}@${generation}`;
  const answersFor = answers.key !== '' && answers.key === answersKey ? answers.map : NO_ANSWERS;
  /** REQ-TRACE-366: only a realised column holds card widgets, so only the band contributes (defect AK2-3). */
  const realisedTotal = useMemo(() => { let n = 0; for (let i = columnBand.start; i < Math.min(columnBand.end, columnKeys.length); i += 1) n += realised.get(columnKeys[i]!) ?? 0; return n; }, [realised, columnKeys, columnBand]);

  useLayoutEffect(() => { latest.current = { board, axis, chord, inFlight, detailId, decisions, columnKeys, members, confirm, cards, epics }; });
  // Defect AK2-3: anything that can move a column's box — the axis, the membership, a fold, the blocked column, a
  // drag widening the rails — re-decides the band before the frame paints.
  useLayoutEffect(() => { measureBand(); }, [measureBand, columnKeys, members, decisions, blockedColumn, drag]);

  // ---- folds (REQ-TRACE-303..316) ----
  const onFold = useCallback((key: string, fold: boolean) => {
    const s = latest.current;
    const next = pruneUserFolds({ ...s.decisions, [key]: fold }, s.axis, openKeys);
    setDecisions(next);
    persist('workspaces/{workspace}/requirementColumnFolds', serializeFolds(next));
  }, [persist, openKeys]);

  /**
   * REQ-TRACE-364: the ONE operation that forces a named card to be realised — the column is unfolded if a fold
   * hides it, scrolled to the card, and only the band around it is realised; nothing for an unknown or empty id.
   * The blocked strip's navigation uses it (REQ-TRACE-240) and so does any caller through the observable state.
   */
  const revealCard = useCallback((id: ReqId): boolean => {
    if (id === '') return false;
    const s = latest.current;
    for (const k of s.columnKeys) {
      const index = (s.members.get(k) ?? []).findIndex((c) => c.id === id);
      if (index === -1) continue;
      if (s.decisions[k] === true) onFold(k, false);
      setSelected(id);
      setReveal({ column: k, index, id });
      return true;
    }
    return false;
  }, [onFold]);
  useEffect(() => {
    if (reveal === null) return;
    // Defect AK2-3: the card's column may be a placeholder. Bring it into the area's viewport and let the band
    // realise it; this effect re-runs on the band and then focuses the card.
    const el = columnsRef.current?.querySelector<HTMLElement>(`:scope > [data-column="${CSS.escape(reveal.column)}"]`) ?? null;
    if (el !== null && el.dataset['offscreen'] === 'true') { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; }
    const t = requestAnimationFrame(() => { document.querySelector<HTMLElement>(`[data-req-card="${CSS.escape(reveal.id)}"]`)?.focus(); setReveal(null); });
    return () => cancelAnimationFrame(t);
  }, [reveal, columnBand]);
  // REQ-TRACE-300/484: keyboard traversal reaches a column that is not realised — it is scrolled into view and takes
  // the focus in the update that realises it, so a hundred columns are traversable and none is unreachable.
  useEffect(() => {
    if (columnFocus === null) return;
    const el = columnsRef.current?.querySelector<HTMLElement>(`:scope > [data-column="${CSS.escape(columnFocus)}"]`) ?? null;
    if (el === null) { setColumnFocus(null); return; }
    const target = el.querySelector<HTMLElement>('[data-req-card]') ?? el.querySelector<HTMLElement>('[data-testid="req-heading"]') ?? (el.dataset['testid'] === 'req-rail' ? el : null);
    if (target === null) return; // still a placeholder; the band update re-runs this effect
    target.focus();
    setColumnFocus(null);
  }, [columnFocus, columnBand]);

  // ---- REQ-TRACE-366: the observable state a caller or the proof waits on ----
  // Part R2: it is published at the END of this component now, because it reports the pane registry and the graph as
  // well, and both are declared below. One observable, one publisher — a second would be a second truth.

  // ---- REQ-TRACE-390..394: the engine's answers for the selected requirement, per delivery target, asked per selection and generation ----
  useEffect(() => {
    if (selectedId === null || selectedColumn === null) return;
    let live = true;
    const key = answersKey;
    void (async () => {
      const next = new Map<DeliveryColumn, Reachability>();
      for (const to of DELIVERY_COLUMNS) {
        if (to === selectedColumn) continue;
        const r = await host.reachable(selectedId, selectedColumn, to);
        if (!live) return;
        if (r.ok) next.set(to, r.value);
      }
      return next;
    })().then((next) => { if (live && next !== undefined) setAnswers({ key, map: next }); });
    return () => { live = false; };
  }, [host, selectedId, selectedColumn, answersKey]);

  // ---- feedback (REQ-TRACE-397): persists until dismissed or resolved ----
  const addFeedback = useCallback((id: ReqId, lines: readonly string[]) => { setFeedback((f) => withEntry(f, id, lines)); }, []);
  const clearFeedback = useCallback((id: ReqId) => { setFeedback((f) => withoutEntry(f, id)); }, []);

  // ---- the one write path (REQ-TRACE-382/387/388) ----
  // Part R2: `to` is the column the board SAYS the action moves to (the sentences, the disclosure gate); `sendTarget`
  // is what travels to the engine, and a review decision sends none — `reject`, `edit` and `keep-worktree` have a
  // resting place the transition function decides and the board does not name (REQ-TRACE-385's table names moves).
  const perform = useCallback(async (id: ReqId, action: BoardAction, from: ColumnToken, to: ColumnToken, payload: Readonly<Record<string, string>> | undefined, sendTarget: ColumnToken | undefined = to): Promise<PerformResult> => {
    let effective = payload;
    // Part R2 — REQ-TRACE-472: the FIRST action within a launch that would result in a run starting declares what
    // permissions the run receives and where it is confined, BEFORE anything is written. Main's coordinator answers
    // it (it owns the two preferences); a launch already carrying a disclosure — the dialog's own accept, or a
    // release from the queue — passes straight through rather than asking twice.
    if (moveStartsRun(action, to) && effective?.['disclosure'] === undefined) {
      const p = await host.launchPreview(id, action);
      if (!p.ok) {
        // The elevation may never happen undisclosed, so a release whose disclosure cannot even be read is refused
        // and nothing is written. `resume` is the exception the specification itself names: REQ-TRACE-463 forbids a
        // failure on the run side from stopping a blocker clearing, so it proceeds and the queue states the reason.
        if (action !== 'resume') { addFeedback(id, [`The launch of ${id} could not be disclosed, so nothing was started and nothing was written: ${p.reason}`]); return { ok: false, reason: p.reason }; }
      } else if (disclosureFor(p.value).show) {
        held.current?.abandon();
        const h = heldLaunch(id);
        held.current = h;
        setLaunch({ id, action, from, to, payload, preview: p.value, via: 'act', sendTarget });
        return h.result;
      } else if (p.value.disclosure !== 'unattended') {
        // `accepted` (earlier in this launch), `suppressed` and `off` are disclosures too — the run's permissions are
        // settled and the service records which.
        effective = { ...(effective ?? {}), disclosure: p.value.disclosure };
      }
    }
    setInFlight((m) => withEntry(m, id, inFlightLabelFor(action)));
    const r = await host.act(id, action, sendTarget, effective);
    setInFlight((m) => withoutEntry(m, id));
    if (!r.ok) { addFeedback(id, [r.reason]); return { ok: false, reason: r.reason }; }
    if (!r.value.ok) {
      const refusal = r.value.error;
      // REQ-TRACE-397: the engine's words, each unmet condition on its own line, and what the source can reach.
      addFeedback(id, [refusal.reason, ...(refusal.reachable && refusal.reachable.length > 0 ? [`From ${columnLabel(from)} it can reach: ${refusal.reachable.map((c) => columnLabel(c)).join(', ')}.`] : [])]);
      return { ok: false, reason: refusal.reason };
    }
    clearFeedback(id);
    // Part R2 — REQ-TRACE-463/478: the move is recorded; the coordinator then starts whatever the scheduler offers
    // now, and where nothing began for THIS requirement the reason is reported on the action's result rather than
    // dropped. The service puts its own stall sentence on the outcome; the coordinator's abandonment carries one too.
    if (moveStartsRun(action, to)) {
      const stall = (r.value.value as TransitionOutcome & { readonly dispatch?: string }).dispatch;
      const d = await host.dispatchRuns();
      const reason = d.ok ? (d.value.started.some((s) => s.id === id) ? undefined : d.value.abandoned.find((a) => a.id === id)?.reason ?? stall) : d.reason;
      if (reason !== undefined) addFeedback(id, [DISPATCH_NOTHING_STARTED(id, reason)]);
    } else if (dispatchesAfter(action, to, r.value.value.to, latest.current.board?.queue.automatic === true)) {
      // REQ-TRACE-482: a card the act rested in `ready` under automatic scheduling is the system's to pick up now; the
      // queue states any reason it is deferred, so nothing is said on the card for it.
      void host.dispatchRuns();
    }
    const again = await host.readBoard();
    if (again.ok) adoptBoard(again.value, [id]);
    return { ok: true };
  }, [host, addFeedback, clearFeedback, adoptBoard]);

  const requestMove = useCallback(async (id: ReqId, to: ColumnToken) => {
    const s = latest.current;
    const card = s.board?.cards.find((c) => c.id === id);
    if (card === undefined) return;
    const from = card.column;
    const action = moveActionFor(from, to);
    if (action === undefined) { addFeedback(id, [`No board action moves ${id} from ${columnLabel(from)} to ${columnLabel(to)}; nothing was asked of the engine.`]); return; }
    if (s.inFlight.has(id)) { addFeedback(id, [`${id} already has an action in flight (${s.inFlight.get(id)}); a second action is refused and nothing was written.`]); return; }
    const r = await host.reachable(id, from, to);
    if (!r.ok) { addFeedback(id, [r.reason]); return; }
    if (!r.value.reachable) { addFeedback(id, [r.value.reason ?? 'The engine refused the move and gave no reason.']); return; }
    const need = payloadFieldFor(action);
    if (need !== undefined) { setReason({ id, action, from, to, ...need, consequence: r.value.consequence, confirm: r.value.confirm || CONFIRM_ACTIONS.has(action) }); return; }
    if (r.value.confirm || CONFIRM_ACTIONS.has(action)) { setConfirm({ id, action, from, to, consequence: r.value.consequence ?? '' }); return; }
    await perform(id, action, from, to, undefined);
  }, [host, addFeedback, perform]);

  // ---- selection, opening, evidence (REQ-TRACE-255, 271, 265, 487) ----
  const select = useCallback((id: ReqId) => setSelected(id), []);
  const open = useCallback((id: ReqId) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelected(id); setDetailId(id); setDetail(null);
    void host.readDetail(id).then((r) => { if (r.ok && latest.current.detailId === id) setDetail(r.value); });
  }, [host]);
  const closeDetail = useCallback(() => { setDetailId(null); setDetail(null); const el = openerRef.current; openerRef.current = null; requestAnimationFrame(() => el?.focus()); }, []);
  const openEvidence = useCallback((id: ReqId) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelected(id); setEvidenceId(id);
    if (latest.current.detailId !== id) { setDetail(null); void host.readDetail(id).then((r) => { if (r.ok) setDetail(r.value); }); }
  }, [host]);
  const closeEvidence = useCallback(() => {
    const id = evidenceId;
    setEvidenceId(null);
    const el = openerRef.current ?? (id === null ? null : document.querySelector<HTMLElement>(evidenceOpenerSelector(id)));
    openerRef.current = null;
    requestAnimationFrame(() => el?.focus());
  }, [evidenceId]);

  // ---- drag (REQ-TRACE-297, 317..319, 393..398) ----
  const onDragStart = useCallback((id: ReqId) => {
    const s = latest.current;
    const card = s.board?.cards.find((c) => c.id === id);
    if (card === undefined) return;
    setSelected(id);
    setDrag({ id, from: card.column, answers: new Map(), hover: null });
    for (const to of COLUMN_TOKENS) {
      if (to === card.column) continue;
      void host.reachable(id, card.column, to).then((r) => { if (r.ok) setDrag((d) => (d !== null && d.id === id ? { ...d, answers: withEntry(d.answers, to, r.value) } : d)); });
    }
  }, [host]);
  const onDragEnd = useCallback(() => setDrag(null), []);
  const onDragRefused = useCallback((id: ReqId) => { const s = latest.current; addFeedback(id, [dragRefusedOnAxisSentence(s.axis, s.chord)]); }, [addFeedback]);
  const onDragHover = useCallback((key: string, hovering: boolean) => setDrag((d) => (d === null ? d : { ...d, hover: hovering ? key : d.hover === key ? null : d.hover })), []);
  const onDrop = useCallback((key: string, id: ReqId) => { setDrag(null); void requestMove(id, key as ColumnToken); }, [requestMove]);

  // ---- keyboard traversal among cards and columns (REQ-TRACE-484) ----
  const onKeyNavigate = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    const key = event.key;
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'ArrowLeft' && key !== 'ArrowRight') return;
    const current = event.currentTarget;
    const column = current.closest<HTMLElement>('[data-testid="req-column"]');
    if (!column) return;
    event.preventDefault();
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      const cardsHere = [...column.querySelectorAll<HTMLElement>('[data-req-card]')];
      const i = cardsHere.indexOf(current);
      const next = cardsHere[key === 'ArrowDown' ? i + 1 : i - 1];
      next?.focus();
      return;
    }
    // Defect AK2-3: the neighbour may be a placeholder, so traversal walks the columns the BOARD has — every one of
    // them is a direct child of the area, realised or not — and where the neighbour is not built it is brought into
    // the viewport and takes the focus in the update that builds it.
    const all = [...(columnsRef.current?.querySelectorAll<HTMLElement>(':scope > [data-column]') ?? [])];
    const i = all.indexOf(column);
    const target = all[key === 'ArrowRight' ? i + 1 : i - 1];
    if (!target) return;
    const focusable = target.querySelector<HTMLElement>('[data-req-card]') ?? target.querySelector<HTMLElement>('[data-testid="req-heading"]') ?? (target.dataset['testid'] === 'req-rail' ? target : null);
    if (focusable !== null) { focusable.focus(); return; }
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    setColumnFocus(target.dataset['column'] ?? null);
  }, []);

  const reevaluate = useCallback(() => {
    setEvaluating(true);
    void host.refresh().then((r) => { setEvaluating(false); if (!r.ok) setError(r.reason); });
  }, [host]);
  const filterToEpic = useCallback((id: ReqId) => setFilter((f) => ({ ...f, epic: id })), []);

  // ---- Part R2: Part AP's five panes hosted, the launch's disclosure, the graph (REQ-TRACE-322..333, 369..375, 472) ----
  /**
   * REQ-TRACE-369/370/375: ONE registry per window and per workspace. A pane is built the first time it is needed and
   * reused after; asking whether a key is installed builds nothing; a workspace change discards every pane, which is
   * what rebuilding the registry on `host.workspace` means. The value held is the pane's own mount record, so "built
   * once and reused" is observable from outside (`window.__rotarisBoard.panes`) rather than merely asserted, and
   * REQ-TRACE-370's rule that a pane attached first is never displaced is `open`'s own contract, never bypassed here.
   */
  // The registry is carried WITH the workspace it belongs to, so that its identity is visibly tied to that workspace
  // rather than tied by a dependency array a reader has to trust (and that the lint rule cannot see the point of).
  const paneSet = useMemo(() => ({ workspace: host.workspace, registry: createPaneRegistry<{ readonly openedAt: number }>() }), [host.workspace]);
  const panes = paneSet.registry;
  const [paneBuilds, setPaneBuilds] = useState(0);
  const paneOpener = useRef<HTMLElement | null>(null);
  /** REQ-TRACE-425/426: which read of the review is outstanding and which one the pane shows (`panes/review-reads.ts`). */
  const [reviewLedger] = useState(createReviewReads);
  const [reviewSeq, setReviewSeq] = useState(0);
  const paneTargetNow = useRef<ReqId | null>(null);
  /** The pane on screen, read where a landed read decides whether the review pane still shows its requirement. */
  const paneNow = useRef<PaneKey | null>(null);
  const loadReviewNow = useRef<(id: ReqId, via: 'open' | 'reload') => void>(() => undefined);
  const [confirmWrites, setConfirmWrites] = useState(false);

  /** REQ-TRACE-425: the surface states that it is reading, keeps responding, and REFUSES a second read rather than starting one. */
  const reviewReads = useRef<{ readonly via: 'open' | 'reload'; readonly at: number }[]>([]);
  const loadReview = useCallback((id: ReqId, via: 'open' | 'reload') => {
    reviewReads.current = [...reviewReads.current, { via, at: Math.round(performance.now()) }];
    const asked = reviewLedger.ask(id);
    if ('busy' in asked) { setReviewBusy(true); return; }
    // The read's own number: the pane's decision notice belongs to the payload of one read and no later one (L12).
    setReviewSeq(asked.start);
    setReviewBusy(false); setReview('reading'); setReviewError(undefined);
    void host.readReview(id).then((r) => {
      // A read the pane no longer shows the requirement of — closed, or opened on another while this one was outstanding
      // and the other's read refused (REQ-TRACE-425) — is never drawn under another identifier.
      const verdict = reviewLedger.land(asked.start, paneTargetNow.current);
      // The read refused while this one was outstanding, for the requirement the pane was retargeted to, starts now (fin36).
      const owed = paneNow.current === 'review' ? reviewLedger.owed(paneTargetNow.current) : null;
      if (verdict === 'discard') { setReviewBusy(false); setReview(null); if (owed !== null) loadReviewNow.current(owed, 'open'); return; }
      if (r.ok) { setReview(r.value); setReviewError(undefined); } else { setReview(null); setReviewError(r.reason); }
    });
  }, [host, reviewLedger]);

  // The owed read starts through the latest `loadReview`, which cannot name itself in its own body.
  useEffect(() => { loadReviewNow.current = loadReview; }, [loadReview]);

  const openPane = useCallback((key: PaneKey, id: ReqId | null) => {
    paneOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panes.open(key, () => ({ openedAt: Date.now() }));
    setPaneBuilds((n) => n + 1);
    setPane(key);
    setPaneTarget(id);
    paneTargetNow.current = id;
    paneNow.current = key;
    if (key === 'review' && id !== null) loadReview(id, 'open');
    if (key === 'blockers' && id !== null) { setBlockerPayload(null); void host.readBlocker(id).then((r) => { if (r.ok) setBlockerPayload(r.value); }); }
    // REQ-TRACE-436: whether a source write is confirmed first is the workspace's own configuration, and the service
    // reports it with the location preview; the editor asks before it can need the answer.
    if (key === 'editor' || key === 'create') void host.previewLocation(undefined).then((r) => { if (r.ok && r.value.ok) setConfirmWrites(r.value.value.confirmSourceWrites); });
  }, [panes, host, loadReview]);
  const closePane = useCallback(() => {
    setPane(null); setPaneTarget(null); paneTargetNow.current = null; paneNow.current = null;
    const el = paneOpener.current; paneOpener.current = null;
    requestAnimationFrame(() => el?.focus());
  }, []);

  /** REQ-TRACE-422: the six decisions travel the board's ONE write path; only accept, send-back and re-run name a target. */
  const DECISION_TARGET: Partial<Record<BoardAction, ColumnToken>> = useMemo(() => ({ accept: 'done', 'send-back': 'ready', rerun: 'ready' }), []);
  const decide = useCallback(async (action: BoardAction, payload?: Readonly<Record<string, string>>): Promise<PerformResult> => {
    const id = paneTarget;
    if (id === null) return { ok: false, reason: 'No requirement is open in this pane, so no decision can be taken.' };
    const card = latest.current.cards.find((c) => c.id === id);
    const from: ColumnToken = card?.column ?? 'review';
    const target = DECISION_TARGET[action];
    // REQ-TRACE-426: the pane keeps the payload the decision was made against, says it is out of date, and offers the
    // reload as its one action — the host does not re-read on its own. It did until 2026-09-29 (live-run finding L12),
    // and the re-read answered REQ-TRACE-424's refusal for a card the accept had just moved to `done`, drawn above a
    // notice calling that refusal out of date.
    return perform(id, action, from, target ?? from, payload, target);
  }, [paneTarget, perform, DECISION_TARGET]);

  /** REQ-TRACE-453/454: an answer carries only the chosen option; `resume` is the path that returns the card to where it was held from. */
  const answerBlocker = useCallback(async (option: string): Promise<PerformResult> => {
    const id = paneTarget;
    if (id === null) return { ok: false, reason: 'No requirement is open in this pane.' };
    const card = latest.current.cards.find((c) => c.id === id);
    const back = blockerPayload?.returnTo ?? card?.returnTo ?? 'backlog';
    const r = option === 'resume'
      ? await perform(id, 'resume', 'blocked', back === 'running' ? 'ready' : back, undefined)
      : await perform(id, 'answer-blocker', card?.column ?? 'blocked', card?.column ?? 'blocked', { option }, undefined);
    // REQ-TRACE-453/472: a resume into `ready` is held behind the launch's disclosure and is taken only when that is
    // accepted; the blocker is re-read then, not only when the first answer is already `ok`.
    void rereadWhenTaken(r, () => { void host.readBlocker(id).then((b) => { if (b.ok) setBlockerPayload(b.value); }); });
    return r;
  }, [paneTarget, blockerPayload, perform, host]);

  /** REQ-TRACE-479/480: the queue's four controls, each answered by the service; a release is also the scheduler's cue. */
  const queueSet = useCallback(async (change: QueueChange): Promise<PerformResult> => {
    const r = await host.setQueue(change);
    if (!r.ok) return { ok: false, reason: r.reason };
    const again = await host.readBoard();
    if (again.ok) adoptBoard(again.value, null);
    if (change.release !== undefined || change.start === true || change.automatic === true || change.concurrency !== undefined) void host.dispatchRuns();
    return { ok: true };
  }, [host, adoptBoard]);

  /** REQ-TRACE-472 from the queue: the same disclosure, answered by a release rather than by a move. */
  const discloseFromQueue = useCallback(async (id: ReqId) => {
    const p = await host.launchPreview(id, 'release');
    if (!p.ok) { setNotice(`The launch of ${id} could not be disclosed, so nothing was started: ${p.reason}`); return; }
    const d = disclosureFor(p.value);
    if (d.show) { setLaunch({ id, action: 'release', from: 'ready', to: 'ready', payload: undefined, preview: p.value, via: 'queue', sendTarget: undefined }); return; }
    await queueSet({ release: id, ...(p.value.disclosure === 'unattended' ? {} : { disclosure: d.payload }) });
  }, [host, queueSet]);

  const acceptLaunch = useCallback(async (always: boolean) => {
    const l = launch;
    if (l === null) return;
    setLaunch(null);
    // REQ-TRACE-472: accepting suppresses the disclosure for the rest of THIS launch, which main holds for the launch
    // (`accept`); accepting permanently suppresses it in later launches too, which is main's preference to write, not
    // the board's. Main is told before the act, so the next card's preview, and the service's standing value, read it.
    if (always) void host.suppressDisclosure();
    else await host.acceptDisclosure();
    const disclosure = always ? 'suppressed' : 'accepted';
    if (l.via === 'queue') { await queueSet({ release: l.id, disclosure }); return; }
    const h = held.current;
    held.current = null;
    const r = await perform(l.id, l.action, l.from, l.to, { ...(l.payload ?? {}), disclosure }, l.sendTarget);
    h?.settle(r);
  }, [launch, host, perform, queueSet]);
  /** REQ-TRACE-472: abandoning sends NOTHING — no act, no release, no preference — and the card says so. */
  const abandonLaunch = useCallback(() => {
    const l = launch;
    setLaunch(null);
    held.current?.abandon();
    held.current = null;
    if (l !== null) addFeedback(l.id, [LAUNCH_ABANDONED(l.id)]);
  }, [launch, addFeedback]);

  /** REQ-TRACE-434/439: the edit is composed by the service from the title and the description; the pane reports what it answered. */
  const saveEdit = useCallback(async (draft: { readonly id: ReqId; readonly title: string; readonly description: string }) => {
    const r = await host.writeSource({ id: draft.id, document: JSON.stringify({ title: draft.title, prose: draft.description }) });
    if (!r.ok) return { ok: false as const, reason: r.reason };
    if (!r.value.ok) return { ok: false as const, reason: r.value.error.reason };
    const again = await host.readBoard();
    if (again.ok) adoptBoard(again.value, null);
    return { ok: true as const };
  }, [host, adoptBoard]);
  const createRequirement = useCallback(async (draft: CreateDraft) => {
    const document = JSON.stringify({ title: draft.title, prose: draft.prose, kind: draft.kind, derivedFrom: draft.derivedFrom, ...(draft.epic === undefined ? {} : { epic: draft.epic }), ...(draft.priority === undefined ? {} : { priority: draft.priority }) });
    const r = await host.writeSource({ document });
    if (!r.ok) return { ok: false as const, reason: r.reason };
    if (!r.value.ok) return { ok: false as const, reason: r.value.error.reason };
    const again = await host.readBoard();
    if (again.ok) adoptBoard(again.value, null);
    return { ok: true as const, id: r.value.value.id, path: r.value.value.path };
  }, [host, adoptBoard]);
  /** REQ-TRACE-443/498: the location the write produces, or the inability reported — never a path invented here. */
  const previewCreateLocation = useCallback(async (epic: ReqId | undefined) => {
    const r = await host.previewLocation(epic);
    if (!r.ok) return { ok: false as const, reason: r.reason };
    if (!r.value.ok) return { ok: false as const, reason: r.value.error.reason };
    return { ok: true as const, id: r.value.value.id, location: r.value.value.location, confirmSourceWrites: r.value.value.confirmSourceWrites };
  }, [host]);

  /** REQ-TRACE-322/329: the graph is centred on a requirement whose DETAIL is the source of its relations, so centring reads it. */
  const openGraph = useCallback((id: ReqId) => {
    if (latest.current.detailId !== id) open(id);
    setGraphCentre(id);
    setGraphDepth(GRAPH_DEPTH_DEFAULT);
  }, [open]);
  const graphModel = useMemo(
    () => (graphCentre === null ? null : buildGraph(graphCentre, detailId === graphCentre ? detail : null, cards, epics, graphDepth)),
    [graphCentre, detailId, detail, cards, epics, graphDepth],
  );

  // ---- REQ-TRACE-366: the observable state a caller or the proof waits on (Part AK2; Part R2 adds the panes and the graph) ----
  useEffect(() => {
    window.__rotarisBoard = {
      generation, ready, pending: Math.max(0, filtered.length - realisedTotal), realised: realisedTotal, paintMs, paintFrom, filterMs, populating,
      cards: filtered.length, columns: columnKeys.length, reveal: revealCard,
      panes: panes.keys.map((key) => ({ key, installed: panes.installed(key), openedAt: panes.peek(key)?.openedAt ?? null })),
      openPane: pane,
      graph: graphModel === null ? null : { centre: graphModel.centre, depth: graphModel.depth, nodes: graphModel.nodes.length, edges: graphModel.edges.length, unexpanded: graphModel.unexpanded.length },
      get reviewReads() { return reviewReads.current; },
    };
  }, [generation, ready, filtered.length, realisedTotal, paintMs, paintFrom, filterMs, populating, columnKeys.length, revealCard, panes, paneBuilds, pane, graphModel]);

  const renderCard = useCallback((card: BoardCard): ReactNode => {
    const epic = epicIds.has(card.id) ? epics.find((e) => e.id === card.id) : undefined;
    if (epic !== undefined) return <EpicCardView card={card} epic={epic} cards={cards} selected={selected === card.id} onSelect={select} onOpen={open} onFilterToEpic={filterToEpic} onKeyNavigate={onKeyNavigate} />;
    return (
      <RequirementCard
        card={card} now={now} localOffsetMinutes={host.localOffsetMinutes}
        selected={selected === card.id}
        draggable={AXIS_DRAGGABLE[axis]}
        inFlightLabel={inFlight.get(card.id) ?? card.inFlight?.label}
        feedback={feedback.get(card.id) ?? NO_LINES}
        onSelect={select} onOpen={open} onOpenEvidence={openEvidence} onDismissFeedback={clearFeedback}
        onDragStart={onDragStart} onDragRefused={onDragRefused} onDragEnd={onDragEnd} onKeyNavigate={onKeyNavigate}
      />
    );
  }, [epicIds, epics, cards, selected, select, open, filterToEpic, onKeyNavigate, now, host.localOffsetMinutes, axis, inFlight, feedback, openEvidence, clearFeedback, onDragStart, onDragRefused, onDragEnd]);

  const onRealised = useCallback((key: string, n: number) => setRealised((m) => (m.get(key) === n ? m : withEntry(m, key, n))), []);
  /** REQ-TRACE-361 (defect AK2-3): a card is the same widget in every column, so a mean measured in one is the estimate the next column is built from. */
  const onMeasured = useCallback((mean: number) => setCardEstimate((e) => (Math.abs(mean - e) > 4 ? mean : e)), []);

  const moveState = moveControlState(selectedId === null ? undefined : selectedCard, answersFor, chord);
  const dropOptions = dropTargetOptions(answersFor);
  const filterSentence = describeFilter(filter);
  const evaluated = board === null ? '' : relativeAge(board.producedAt, now);
  const detailCard = detailId === null ? undefined : cards.find((c) => c.id === detailId);
  /** Part R2: the requirement a per-requirement pane was opened against — the editor writes into ITS source document. */
  const paneCard = paneTarget === null ? undefined : cards.find((c) => c.id === paneTarget);
  const evidenceCard = evidenceId === null ? undefined : cards.find((c) => c.id === evidenceId);

  // ---- REQ-TRACE-231 / 379: the stated states before a board exists ----
  const body = (() => {
    if (board === null) {
      if (reading) return <p className="req-status" role="status" data-testid="req-reading">{READING_LABEL}</p>;
      return <DesignEmptyState className="empty-state req-empty" data-testid="req-error" role="alert"><span className="empty-state-title">{PROJECTION_UNAVAILABLE}</span><span className="empty-state-hint">{error ?? 'No reason was given.'} No board is assembled locally in its place.</span></DesignEmptyState>;
    }
    // REQ-TRACE-380: which of the stated states holds is the model's decision, taken over the whole projection
    // rather than by a chain of conditions here; this reads it and draws it.
    const stated = bodyStateOf(board);
    const dir = board.source.kind === 'store' ? board.source.dir : '';
    const errorList = (
      <ul className="req-empty__errors">{board.parseErrors.map((e, i) => <li key={`${e.path}-${i}`} className="mono">{e.path}{e.line === undefined ? '' : `:${e.line}`} — {e.message}</li>)}</ul>
    );
    if (stated === 'source') {
      return (
        <DesignEmptyState className="empty-state req-empty" data-testid="req-empty-source">
          <span className="empty-state-title">{EMPTY_SOURCE_TITLE}</span>
          <span className="empty-state-hint">{EMPTY_SOURCE_WHAT}</span>
          <span className="empty-state-hint">{EMPTY_SOURCE_HOW}</span>
          {board.parseErrors.length > 0 && errorList}
        </DesignEmptyState>
      );
    }
    // REQ-TRACE-515, minted for defect 81 after the first live drive of this board: a configured store whose every
    // document was rejected (REQ-TRACE-022/026) has no cards, and the card count alone read that as a store nobody
    // had written to. The engine's errors were on the projection the whole time; they are what this state says.
    if (stated === 'unparsed') {
      return (
        <DesignEmptyState className="empty-state req-empty" data-testid="req-empty-unparsed" role="alert">
          <span className="empty-state-title">{UNPARSED_STORE_SENTENCE}</span>
          <span className="empty-state-hint">Source: <span className="mono">{dir}</span>. {UNPARSED_STORE_HOW}</span>
          {errorList}
        </DesignEmptyState>
      );
    }
    if (stated === 'store') {
      return <DesignEmptyState className="empty-state req-empty" data-testid="req-empty-store"><span className="empty-state-title">{EMPTY_STORE_SENTENCE}</span><span className="empty-state-hint">Source: <span className="mono">{dir}</span>. {EMPTY_SOURCE_HOW}</span></DesignEmptyState>;
    }
    // Part R2 — REQ-TRACE-322: the graph is a PRESENTATION of this board centred on one requirement, not a grouping
    // axis (an axis has no centre), so it takes the body while the header keeps the board's own state; the columns
    // come back exactly as they were when it is closed, because nothing about them was touched.
    if (graphModel !== null) {
      return <GraphPane model={graphModel} depth={graphDepth} onDepth={(d) => setGraphDepth(clampDepth(d))} onCentre={openGraph} onClose={() => setGraphCentre(null)} />;
    }
    return (
      <div ref={columnsRef} className="req-columns" data-testid="req-columns" data-axis={axis} data-dragging={drag !== null} onScroll={scheduleBand}>
        {filtered.length === 0 && <p className="req-status" role="status" data-testid="req-filter-nothing">{FILTER_NOTHING} <DesignButton type="button" className="btn btn-link" onClick={() => { setFilter(EMPTY_FILTER); setTyped(''); }}>{FILTER_CLEAR}</DesignButton></p>}
        {columnKeys.map((key, index) => {
          const list = members.get(key) ?? [];
          const label = columnLabel(key, projectSupplied);
          const fold = foldDecision(decisions[key], foldEmpty, list.length) && !(drag !== null && drag.hover === key);
          const emptySentence = axis === 'delivery' ? (EMPTY_COLUMN_SENTENCE[key as ColumnToken] ?? EMPTY_AXIS_SENTENCE) : EMPTY_AXIS_SENTENCE;
          const droppable = drag !== null && AXIS_DRAGGABLE[axis] && key !== drag.from;
          // Defect AK2-3 (REQ-TRACE-239 read in both dimensions): an OPEN column outside the area's own viewport is
          // not built. It keeps a placeholder of exactly its own box — its width, its place in the row, its share of
          // the horizontal scroll range, its key and its count — so nothing is truncated, hidden or refused on
          // account of how many columns there are (REQ-TRACE-300), and it is built the moment it comes into view. A
          // FOLDED column is always built: a rail holds no card widgets already (REQ-TRACE-311) and its accessible
          // name is what REQ-TRACE-320 asks a reader to find.
          if (!fold && (index < columnBand.start || index >= columnBand.end)) {
            return <div key={key} className="req-column req-column--offscreen" data-testid="req-column" data-column={key} data-count={list.length} data-realised={0} data-offscreen="true" aria-hidden="true" />;
          }
          return (
            <Column
              key={key} colKey={key} label={label} count={list.length} members={list} folded={fold} emptySentence={emptySentence}
              deliveryWord={axis === 'delivery' ? `Delivery state ${key}` : `${axis} ${key}`}
              drag={drag === null ? null : { id: drag.id, answer: drag.answers.get(key as ColumnToken), droppable }}
              revealIndex={reveal !== null && reveal.column === key ? reveal.index : null}
              estimateHint={cardEstimate} onMeasured={onMeasured}
              onFold={onFold} onDrop={onDrop} onDragHover={onDragHover} onRealised={onRealised} renderCard={renderCard}
            />
          );
        })}
      </div>
    );
  })();

  return (
    <div className="req" data-testid="requirements" data-generation={generation} data-ready={ready} data-paint-ms={paintMs === null ? '' : Math.round(paintMs)} data-filter-ms={filterMs === null ? '' : Math.round(filterMs)}>
      <header className="req-header" data-testid="req-header">
        <div className="req-header__row">
          <h1 className="display req-header__title">{BOARD_TITLE}</h1>
          <span className="req-header__count mono" data-testid="req-total" title={`${filtered.length} of ${cards.length} requirements shown`}>{filtered.length}{filtered.length !== cards.length ? ` / ${cards.length}` : ''}</span>
          <span className="req-header__spacer" />
          <span className="req-header__evaluated card-meta" data-testid="req-evaluated" title={board === null ? undefined : absoluteMoment(board.producedAt, host.localOffsetMinutes)}>{evaluatedSentence(evaluated)}</span>
          {/* REQ-TRACE-342/491: the ONE plain re-evaluation control, the primary action, 32 points high. */}
          <DesignButton type="button" className="btn btn-primary req-header__primary" data-testid="req-reevaluate" onClick={reevaluate} disabled={evaluating} aria-description={REEVALUATE_DESCRIPTION} title={REEVALUATE_DESCRIPTION}>{evaluating ? EVALUATING_LABEL : REEVALUATE_LABEL}</DesignButton>
        </div>
        <div className="req-header__row req-header__controls">
          <label className="req-header__field"><span className="field-label">Group by</span>
            <DesignSelect className="input select req-header__select" data-testid="req-axis" value={axis} onChange={(e) => setAxis(axisOf(e.currentTarget.value))} aria-label="Grouping axis" style={{ width: CLOSED_DROPDOWN_WIDTH }}>{AXES.map((a) => <option key={a} value={a}>{columnLabel(a)}</option>)}</DesignSelect></label>
          <label className="req-header__field"><span className="field-label">Sort</span>
            <DesignSelect className="input select req-header__select" data-testid="req-sort" value={sort} onChange={(e) => setSort(sortOrderOf(e.currentTarget.value))} aria-label="Sort order" style={{ width: CLOSED_DROPDOWN_WIDTH }}>{SORT_ORDERS.map((s) => <option key={s} value={s}>{s === 'priority' ? 'Priority, then identifier' : s === 'identifier' ? 'Identifier' : 'Health, then identifier'}</option>)}</DesignSelect></label>
          <DesignCheckbox className="check req-header__field req-header__check" title={BLOCKED_COLUMN_DESCRIPTION} data-testid="req-blocked-column" checked={blockedColumn} onChange={(e) => setBlockedColumn(e.currentTarget.checked)} aria-description={BLOCKED_COLUMN_DESCRIPTION} label={BLOCKED_COLUMN_LABEL} />
          {/* REQ-TRACE-488: the toggle's accessible name alternates; hiding removes the controls from the tab sequence and returns focus here. */}
          <DesignButton ref={filterToggleRef} type="button" className="btn btn-secondary btn-compact" data-testid="req-filter-toggle" aria-expanded={filtersShown} onClick={() => { setFiltersShown((v) => !v); if (filtersShown) requestAnimationFrame(() => filterToggleRef.current?.focus()); }}>{filtersShown ? FILTER_HIDE : FILTER_SHOW}</DesignButton>
          {/* Part R2 — the two board-level panes of REQ-TRACE-375 reachable from the board itself; every other pane is
              opened against ONE requirement and is therefore reached from its detail. Both are 24 high, as
              REQ-TRACE-491 fixes every header control but the one primary. */}
          <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-queue-open" onClick={() => openPane('queue', null)} aria-label={`${QUEUE_CONTROL_LABEL}: the scheduler's order, its reasons and its four controls`}>{QUEUE_CONTROL_LABEL}</DesignButton>
          <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-create-open" onClick={() => openPane('create', null)} disabled={board === null || board.source.kind === 'none'} aria-label="New requirement, written into the project's own source">New requirement</DesignButton>
          <span className="req-header__filter card-meta" data-testid="req-filter-summary" data-active={filterActive(filter)} data-populating={populating}>{filterSentence}</span>
          {filterActive(filter) && <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="req-filter-clear" onClick={() => { setFilter(EMPTY_FILTER); setTyped(''); }}>{FILTER_CLEAR}</DesignButton>}
        </div>
        <div className="req-header__row req-header__move">
          <MoveControl state={moveState} options={dropOptions} onMove={(to) => { if (selected !== null) void requestMove(selected, to); }} />
        </div>
        {filtersShown && (
          // Defect AK2-1 (ADR-0041's second execution): the five selects below once read `e.currentTarget.value` INSIDE the
          // deferred `setFilter` updater, where `currentTarget` is already null — the first filter chosen threw and React
          // tore the whole window down. The value is read in the handler and the updater closes over it.
          <div className="req-header__row req-header__filters" data-testid="req-filters">
            <label className="req-header__field"><span className="field-label">Text</span><DesignInput className="input" type="search" data-testid="req-filter-text" aria-label="Filter by text" placeholder="Identifier or title…" value={typed} onChange={(e) => setTyped(e.currentTarget.value)} style={{ width: OPEN_DROPDOWN_WIDTH + 30 }} /></label>
            <label className="req-header__field"><span className="field-label">Epic</span><DesignSelect className="input select" data-testid="req-filter-epic" aria-label="Filter by epic" value={filter.epic} onChange={(e) => { const v = e.currentTarget.value; setFilter((f) => ({ ...f, epic: v })); }} style={{ width: OPEN_DROPDOWN_WIDTH }}><option value="">Any</option>{epics.map((e) => <option key={e.id} value={e.id} title={e.title}>{e.id}</option>)}</DesignSelect></label>
            <label className="req-header__field"><span className="field-label">Source</span><DesignSelect className="input select" data-testid="req-filter-source" aria-label="Filter by source" value={filter.source} onChange={(e) => { const v = e.currentTarget.value; setFilter((f) => ({ ...f, source: v })); }} style={{ width: OPEN_DROPDOWN_WIDTH }}><option value="">Any</option>{sources.map((s) => <option key={s} value={s} title={s}>{s}</option>)}</DesignSelect></label>
            <label className="req-header__field"><span className="field-label">Lifecycle</span><DesignSelect className="input select" data-testid="req-filter-lifecycle" aria-label="Filter by lifecycle" value={filter.lifecycle} onChange={(e) => { const v = e.currentTarget.value; setFilter((f) => ({ ...f, lifecycle: v })); }} style={{ width: CLOSED_DROPDOWN_WIDTH }}><option value="">Any</option>{LIFECYCLES.map((l) => <option key={l} value={l}>{l}</option>)}</DesignSelect></label>
            <label className="req-header__field"><span className="field-label">Health</span><DesignSelect className="input select" data-testid="req-filter-health" aria-label="Filter by health" value={filter.health} onChange={(e) => { const v = e.currentTarget.value; setFilter((f) => ({ ...f, health: v })); }} style={{ width: CLOSED_DROPDOWN_WIDTH }}><option value="">Any</option>{HEALTH_TOKENS.map((h) => <option key={h} value={h}>{h}</option>)}</DesignSelect></label>
            <label className="req-header__field"><span className="field-label">Priority</span><DesignSelect className="input select" data-testid="req-filter-priority" aria-label="Filter by priority" value={filter.priority} onChange={(e) => { const v = e.currentTarget.value; setFilter((f) => ({ ...f, priority: v })); }} style={{ width: CLOSED_DROPDOWN_WIDTH }}><option value="">Any</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</DesignSelect></label>
          </div>
        )}
        <p className="req-header__analysis card-meta" data-testid="req-analysis">{board?.analysisEnabled ? ANALYSIS_ON_SENTENCE : ANALYSIS_OFF_SENTENCE} {AWAITING_JUDGEMENT_NONE}</p>
        {/* REQ-TRACE-515's part clause, defect 81's quieter half: a store that parses in part draws a board, and the
            rejected documents are on no card. The count and the engine's own errors are stated here, in the alert
            the board already uses. */}
        {board !== null && board.cards.length > 0 && board.parseErrors.length > 0 && (
          <ul className="req-detail__findings" data-testid="req-parse-errors">
            <li className="req-alert req-alert--failure"><span className="req-alert__glyph" aria-hidden="true">✕</span>{rejectedDocumentsSentence(board.parseErrors.length)}</li>
            {board.parseErrors.map((e, i) => <li key={`${e.path}-${i}`} className="req-alert req-alert--failure"><span className="req-alert__glyph" aria-hidden="true">✕</span><span className="mono">{e.path}{e.line === undefined ? '' : `:${e.line}`}</span> {e.message}</li>)}
          </ul>
        )}
        {error !== null && board !== null && <p className="req-status req-status--error" role="alert" data-testid="req-error-inline">{PROJECTION_UNAVAILABLE}: {error} The last good board stays on screen. <DesignButton type="button" className="btn btn-link" onClick={reevaluate}>{REEVALUATE_LABEL}</DesignButton></p>}
        {notice !== null && <p className="req-status" role="status" data-testid="req-notice">{notice} <DesignButton type="button" className="btn btn-link" onClick={() => setNotice(null)}>Dismiss</DesignButton></p>}
      </header>
      {board !== null && <BlockedStrip blocked={board.blocked} onResume={(id) => { const c = board.cards.find((x) => x.id === id); if (c) void requestMove(id, c.returnTo ?? 'backlog'); }} onNavigate={revealCard} onFilterToBlocked={() => setFilter((f) => ({ ...f, health: 'blocked' }))} />}
      <div className="req-body">
        {body}
        {detailCard !== undefined && board !== null && (
          <DetailPanel
            card={detailCard} detail={detail} board={board} now={now} localOffsetMinutes={host.localOffsetMinutes}
            onClose={closeDetail} onNavigate={open} onOpenEvidence={openEvidence} onOpenSession={host.openSession}
            onOpenPane={(key) => openPane(key, detailCard.id)} onOpenGraph={openGraph}
          />
        )}
        {/* Part R2 — the pane host: one of REQ-TRACE-375's five keys at a time, each built on first use and reused.
            REQ-TRACE-376: every pane shares ONE stack with the board — this element is the board body's only absolute
            child, so a pane covers the columns rather than living in a window or a layer of its own, and nothing in
            the area clips at REQ-SHELL-022's 1000 × 680 (asserted by `requirements-proof`'s `minimum` stage, which
            opens the queue pane at that size and measures the host's box against the viewport). */}
        {pane !== null && board !== null && (
          <div className="req-pane-host" data-testid="req-pane-host" data-pane={pane}>
            {/* The host's own chrome. Three of the five panes carry a Close control of their own and the queue does
                not; a surface with no way back is not a surface, so the way back belongs to whoever opened it.
                Defect R2-7: this bar drew as an unstyled block until the gate measured it, and it named the pane a
                line above the pane's own heading. All five panes draw their own `<h2 class="req-pane__title">`, so
                the host names nothing: the pane's identity travels on the Close control's accessible name, which is
                where a person who has arrived by keyboard actually meets it. */}
            <div className="req-pane-host__bar">
              <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="req-pane-close" onClick={closePane} aria-label={`Close ${PANE_TITLE[pane]} and return to the board`}>Close</DesignButton>
            </div>
            {pane === 'review' && (
              <ReviewPane
                id={paneTarget ?? ''} payload={review} readSeq={reviewSeq} error={reviewError} busy={reviewBusy}
                consequenceOf={(action) => consequenceForDecision(action, paneTarget ?? '')}
                onDecision={decide}
                onReload={() => { if (paneTarget !== null) loadReview(paneTarget, 'reload'); }}
                onNavigate={(link) => {
                  // REQ-TRACE-417/475: the session and the version-control view are the application's to open; a
                  // difference view is neither this board's nor offered here, so it is stated rather than left inert.
                  if (link.kind === 'session' || (link.kind === 'git' && link.sessionId !== undefined)) { const s = link.kind === 'session' ? link.sessionId : link.sessionId!; if (host.openSession !== undefined) { host.openSession(s); return; } }
                  setNotice(link.kind === 'diff' ? `This build opens no difference view, so ${link.path} is named rather than opened; the branch and worktree above locate it.` : 'No session identifier accompanies that link, so there is nothing to bring into focus.');
                }}
                onClose={closePane}
              />
            )}
            {pane === 'queue' && (
              <QueuePane
                queue={board.queue} cards={cards} onSet={queueSet}
                onDisclose={(id) => { void discloseFromQueue(id); }}
                onOpenSession={(sessionId) => { if (host.openSession !== undefined) host.openSession(sessionId); else setNotice('No session opener is offered on this surface.'); }}
              />
            )}
            {pane === 'blockers' && <BlockersPane payload={blockerPayload} onAnswer={answerBlocker} onNavigate={(id) => { closePane(); open(id); }} onOpenRun={(sessionId) => { if (host.openSession !== undefined) host.openSession(sessionId); }} onClose={closePane} />}
            {pane === 'editor' && paneCard !== undefined && (
              <EditorPane
                id={paneCard.id} title={paneCard.title} description={detailId === paneCard.id ? detail?.prose ?? '' : ''}
                version={null} confirmWrites={confirmWrites}
                readOnly={board.source.kind === 'store' && board.source.writable ? null : { sentence: readOnlyEditorRefusal(paneCard.id, paneCard.sourcePath), artifact: paneCard.sourcePath }}
                onSave={saveEdit}
                onOpenArtifact={(artifact) => setNotice(`This build opens no file for editing, so ${artifact} is named rather than opened; edit it there and re-evaluate the board.`)}
                onLeave={closePane}
              />
            )}
            {pane === 'create' && (
              <CreatePane
                sources={board.source.kind === 'store' ? [{ key: board.source.dir, label: board.source.dir, canCreate: board.source.canCreate }] : []}
                epics={epics.map((e) => ({ id: e.id, title: e.title }))}
                origins={cards.map((c) => c.id)}
                previewLocation={previewCreateLocation} onCreate={createRequirement} onLeave={closePane}
              />
            )}
          </div>
        )}
      </div>
      <p className="req-foot card-meta" data-testid="req-subscription">{SUBSCRIPTION_SENTENCE}</p>
      {evidenceCard !== undefined && <EvidencePane card={evidenceCard} detail={detail} onClose={closeEvidence} onOpenSession={host.openSession} />}
      {/* Part R2 — REQ-TRACE-472: the elevation's disclosure, raised by the FIRST action of a launch that would start
          a run and before anything at all has been sent. Abandoning it sends nothing; accepting sends the act (or the
          queue's release) carrying the acceptance, and accepting permanently also asks main to suppress it for later. */}
      {launch !== null && <LaunchDisclosure preview={launch.preview} onAccept={(always) => { void acceptLaunch(always); }} onAbandon={abandonLaunch} />}
      {confirm !== null && (
        <ConfirmDialog
          title={`${sentenceCase(confirm.action)} ${confirm.id}?`}
          body={confirm.consequence}
          lines={[`${confirm.id} moves from ${columnLabel(confirm.from)} to ${columnLabel(confirm.to)}.`]}
          confirmLabel={sentenceCase(confirm.action)}
          testId="req-confirm"
          onConfirm={() => { const c = confirm; setConfirm(null); void perform(c.id, c.action, c.from, c.to, c.payload); }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {reason !== null && (
        <ReasonDialog
          title={reason.title} prompt={reason.prompt} consequence={reason.consequence} refusal={reason.refusal}
          confirmLabel={sentenceCase(reason.action)}
          onConfirm={(text) => { const r = reason; setReason(null); const payload = { [r.field]: text }; if (r.confirm) setConfirm({ id: r.id, action: r.action, from: r.from, to: r.to, consequence: r.consequence ?? '', payload }); else void perform(r.id, r.action, r.from, r.to, payload); }}
          onCancel={() => setReason(null)}
        />
      )}
    </div>
  );
}
