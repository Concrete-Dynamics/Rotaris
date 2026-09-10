import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BoardAction, BoardCard, BoardProjection, ColumnToken, DeliveryColumn, EpicCard, Reachability, Refusal, ReqId, RequirementDetail, RequirementsChanged, TransitionOutcome } from '@rotaris/contracts';
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
import { ANALYSIS_OFF_SENTENCE, ANALYSIS_ON_SENTENCE, AWAITING_JUDGEMENT_NONE, BLOCKED_COLUMN_DESCRIPTION, BLOCKED_COLUMN_LABEL, BOARD_TITLE, CLOCK_TICK_MS, CLOSED_DROPDOWN_WIDTH, CONFIRM_ACTIONS, EMPTY_SOURCE_HOW, EMPTY_SOURCE_TITLE, EMPTY_SOURCE_WHAT, EMPTY_STORE_SENTENCE, EVALUATING_LABEL, FILTER_CLEAR, FILTER_HIDE, FILTER_NOTHING, FILTER_SHOW, OPEN_DROPDOWN_WIDTH, PROJECTION_UNAVAILABLE, READING_LABEL, REEVALUATE_DESCRIPTION, REEVALUATE_LABEL, SEARCH_DEBOUNCE_MS, SUBSCRIPTION_SENTENCE, dragRefusedOnAxisSentence, dropTargetOptions, evaluatedSentence, inFlightLabelFor, mergeAffected, moveActionFor, moveControlState, payloadFieldFor, promptWithdrawnSentence, pruneUserFolds, type BoardObservable } from './model.js';

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
  const [realised, setRealised] = useState<ReadonlyMap<string, number>>(new Map());
  const [paintMs, setPaintMs] = useState<number | null>(null);
  /** Defect AK2-2: bumped on every horizontal scroll and resize of the columns area, so each column re-decides whether it is on screen. */
  const [areaRevision, setAreaRevision] = useState(0);
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
    if (m.kind === 'paint') { if (board !== null) { setPaintMs(elapsed); setReady(true); } }
    else setFilterMs(elapsed);
  }, [board, filter]);

  // Defect AK2-2: the columns area's horizontal scroll and its resize re-decide which columns are on screen, once per frame.
  const areaFrame = useRef<number | null>(null);
  const bumpArea = useCallback(() => {
    if (areaFrame.current !== null) return;
    areaFrame.current = requestAnimationFrame(() => { areaFrame.current = null; setAreaRevision((r) => r + 1); });
  }, []);
  useEffect(() => {
    const el = columnsRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(bumpArea);
    ro.observe(el);
    return () => { ro.disconnect(); if (areaFrame.current !== null) cancelAnimationFrame(areaFrame.current); };
  }, [bumpArea, board]);

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
  const realisedTotal = useMemo(() => { let n = 0; for (const k of columnKeys) n += realised.get(k) ?? 0; return n; }, [realised, columnKeys]);

  useLayoutEffect(() => { latest.current = { board, axis, chord, inFlight, detailId, decisions, columnKeys, members, confirm, cards, epics }; });

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
    const t = requestAnimationFrame(() => { document.querySelector<HTMLElement>(`[data-req-card="${reveal.id}"]`)?.focus(); setReveal(null); });
    return () => cancelAnimationFrame(t);
  }, [reveal]);

  // ---- REQ-TRACE-366: the observable state a caller or the proof waits on ----
  useEffect(() => {
    window.__rotarisBoard = { generation, ready, pending: Math.max(0, filtered.length - realisedTotal), realised: realisedTotal, paintMs, filterMs, populating, cards: filtered.length, columns: columnKeys.length, reveal: revealCard };
  }, [generation, ready, filtered.length, realisedTotal, paintMs, filterMs, populating, columnKeys.length, revealCard]);

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
  const perform = useCallback(async (id: ReqId, action: BoardAction, from: ColumnToken, to: ColumnToken, payload: Readonly<Record<string, string>> | undefined) => {
    setInFlight((m) => withEntry(m, id, inFlightLabelFor(action)));
    const r = await host.act(id, action, to, payload);
    setInFlight((m) => withoutEntry(m, id));
    if (!r.ok) { addFeedback(id, [r.reason]); return; }
    if (!r.value.ok) {
      const refusal = r.value.error;
      // REQ-TRACE-397: the engine's words, each unmet condition on its own line, and what the source can reach.
      addFeedback(id, [refusal.reason, ...(refusal.reachable && refusal.reachable.length > 0 ? [`From ${columnLabel(from)} it can reach: ${refusal.reachable.map((c) => columnLabel(c)).join(', ')}.`] : [])]);
      return;
    }
    clearFeedback(id);
    const again = await host.readBoard();
    if (again.ok) adoptBoard(again.value, [id]);
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
    const all = [...(columnsRef.current?.querySelectorAll<HTMLElement>('[data-testid="req-column"], [data-testid="req-rail"]') ?? [])];
    const i = all.indexOf(column);
    const target = all[key === 'ArrowRight' ? i + 1 : i - 1];
    if (!target) return;
    (target.querySelector<HTMLElement>('[data-req-card]') ?? target.querySelector<HTMLElement>('[data-testid="req-heading"]') ?? target).focus();
  }, []);

  const reevaluate = useCallback(() => {
    setEvaluating(true);
    void host.refresh().then((r) => { setEvaluating(false); if (!r.ok) setError(r.reason); });
  }, [host]);
  const filterToEpic = useCallback((id: ReqId) => setFilter((f) => ({ ...f, epic: id })), []);

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

  const moveState = moveControlState(selectedId === null ? undefined : selectedCard, answersFor, chord);
  const dropOptions = dropTargetOptions(answersFor);
  const filterSentence = describeFilter(filter);
  const evaluated = board === null ? '' : relativeAge(board.producedAt, now);
  const detailCard = detailId === null ? undefined : cards.find((c) => c.id === detailId);
  const evidenceCard = evidenceId === null ? undefined : cards.find((c) => c.id === evidenceId);

  // ---- REQ-TRACE-231 / 379: the stated states before a board exists ----
  const body = (() => {
    if (board === null) {
      if (reading) return <p className="req-status" role="status" data-testid="req-reading">{READING_LABEL}</p>;
      return <div className="empty-state req-empty" data-testid="req-error" role="alert"><span className="empty-state-title">{PROJECTION_UNAVAILABLE}</span><span className="empty-state-hint">{error ?? 'No reason was given.'} No board is assembled locally in its place.</span></div>;
    }
    if (board.source.kind === 'none') {
      return (
        <div className="empty-state req-empty" data-testid="req-empty-source">
          <span className="empty-state-title">{EMPTY_SOURCE_TITLE}</span>
          <span className="empty-state-hint">{EMPTY_SOURCE_WHAT}</span>
          <span className="empty-state-hint">{EMPTY_SOURCE_HOW}</span>
          {board.parseErrors.length > 0 && <ul className="req-empty__errors">{board.parseErrors.map((e, i) => <li key={`${e.path}-${i}`} className="mono">{e.path}{e.line === undefined ? '' : `:${e.line}`} — {e.message}</li>)}</ul>}
        </div>
      );
    }
    if (board.cards.length === 0) {
      return <div className="empty-state req-empty" data-testid="req-empty-store"><span className="empty-state-title">{EMPTY_STORE_SENTENCE}</span><span className="empty-state-hint">Source: <span className="mono">{board.source.dir}</span>. {EMPTY_SOURCE_HOW}</span></div>;
    }
    return (
      <div ref={columnsRef} className="req-columns" data-testid="req-columns" data-axis={axis} data-dragging={drag !== null} onScroll={bumpArea}>
        {filtered.length === 0 && <p className="req-status" role="status" data-testid="req-filter-nothing">{FILTER_NOTHING} <button type="button" className="btn btn-link" onClick={() => { setFilter(EMPTY_FILTER); setTyped(''); }}>{FILTER_CLEAR}</button></p>}
        {columnKeys.map((key) => {
          const list = members.get(key) ?? [];
          const label = columnLabel(key, projectSupplied);
          const fold = foldDecision(decisions[key], foldEmpty, list.length) && !(drag !== null && drag.hover === key);
          const emptySentence = axis === 'delivery' ? (EMPTY_COLUMN_SENTENCE[key as ColumnToken] ?? EMPTY_AXIS_SENTENCE) : EMPTY_AXIS_SENTENCE;
          const droppable = drag !== null && AXIS_DRAGGABLE[axis] && key !== drag.from;
          return (
            <Column
              key={key} colKey={key} label={label} count={list.length} members={list} folded={fold} emptySentence={emptySentence}
              deliveryWord={axis === 'delivery' ? `Delivery state ${key}` : `${axis} ${key}`}
              drag={drag === null ? null : { id: drag.id, answer: drag.answers.get(key as ColumnToken), droppable }}
              revealIndex={reveal !== null && reveal.column === key ? reveal.index : null}
              container={columnsRef} revision={areaRevision}
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
          <button type="button" className="btn btn-primary req-header__primary" data-testid="req-reevaluate" onClick={reevaluate} disabled={evaluating} aria-description={REEVALUATE_DESCRIPTION} title={REEVALUATE_DESCRIPTION}>{evaluating ? EVALUATING_LABEL : REEVALUATE_LABEL}</button>
        </div>
        <div className="req-header__row req-header__controls">
          <label className="req-header__field"><span className="field-label">Group by</span>
            <select className="input select req-header__select" data-testid="req-axis" value={axis} onChange={(e) => setAxis(axisOf(e.currentTarget.value))} aria-label="Grouping axis" style={{ width: CLOSED_DROPDOWN_WIDTH }}>{AXES.map((a) => <option key={a} value={a}>{columnLabel(a)}</option>)}</select></label>
          <label className="req-header__field"><span className="field-label">Sort</span>
            <select className="input select req-header__select" data-testid="req-sort" value={sort} onChange={(e) => setSort(sortOrderOf(e.currentTarget.value))} aria-label="Sort order" style={{ width: CLOSED_DROPDOWN_WIDTH }}>{SORT_ORDERS.map((s) => <option key={s} value={s}>{s === 'priority' ? 'Priority, then identifier' : s === 'identifier' ? 'Identifier' : 'Health, then identifier'}</option>)}</select></label>
          <label className="req-header__field req-header__check" title={BLOCKED_COLUMN_DESCRIPTION}><input type="checkbox" data-testid="req-blocked-column" checked={blockedColumn} onChange={(e) => setBlockedColumn(e.currentTarget.checked)} aria-description={BLOCKED_COLUMN_DESCRIPTION} /><span className="field-label">{BLOCKED_COLUMN_LABEL}</span></label>
          {/* REQ-TRACE-488: the toggle's accessible name alternates; hiding removes the controls from the tab sequence and returns focus here. */}
          <button ref={filterToggleRef} type="button" className="btn btn-secondary btn-compact" data-testid="req-filter-toggle" aria-expanded={filtersShown} onClick={() => { setFiltersShown((v) => !v); if (filtersShown) requestAnimationFrame(() => filterToggleRef.current?.focus()); }}>{filtersShown ? FILTER_HIDE : FILTER_SHOW}</button>
          <span className="req-header__filter card-meta" data-testid="req-filter-summary" data-active={filterActive(filter)} data-populating={populating}>{filterSentence}</span>
          {filterActive(filter) && <button type="button" className="btn btn-ghost btn-compact" data-testid="req-filter-clear" onClick={() => { setFilter(EMPTY_FILTER); setTyped(''); }}>{FILTER_CLEAR}</button>}
        </div>
        <div className="req-header__row req-header__move">
          <MoveControl state={moveState} options={dropOptions} onMove={(to) => { if (selected !== null) void requestMove(selected, to); }} />
        </div>
        {filtersShown && (
          // Defect AK2-1 (ADR-0041's second execution): the five selects below once read `e.currentTarget.value` INSIDE the
          // deferred `setFilter` updater, where `currentTarget` is already null — the first filter chosen threw and React
          // tore the whole window down. The value is read in the handler and the updater closes over it.
          <div className="req-header__row req-header__filters" data-testid="req-filters">
            <label className="req-header__field"><span className="field-label">Text</span><input className="input" type="search" data-testid="req-filter-text" aria-label="Filter by text" placeholder="Identifier or title…" value={typed} onChange={(e) => setTyped(e.currentTarget.value)} style={{ width: OPEN_DROPDOWN_WIDTH + 30 }} /></label>
            <label className="req-header__field"><span className="field-label">Epic</span><select className="input select" data-testid="req-filter-epic" aria-label="Filter by epic" value={filter.epic} onChange={(e) => { const v = e.currentTarget.value; setFilter((f) => ({ ...f, epic: v })); }} style={{ width: OPEN_DROPDOWN_WIDTH }}><option value="">Any</option>{epics.map((e) => <option key={e.id} value={e.id} title={e.title}>{e.id}</option>)}</select></label>
            <label className="req-header__field"><span className="field-label">Source</span><select className="input select" data-testid="req-filter-source" aria-label="Filter by source" value={filter.source} onChange={(e) => { const v = e.currentTarget.value; setFilter((f) => ({ ...f, source: v })); }} style={{ width: OPEN_DROPDOWN_WIDTH }}><option value="">Any</option>{sources.map((s) => <option key={s} value={s} title={s}>{s}</option>)}</select></label>
            <label className="req-header__field"><span className="field-label">Lifecycle</span><select className="input select" data-testid="req-filter-lifecycle" aria-label="Filter by lifecycle" value={filter.lifecycle} onChange={(e) => { const v = e.currentTarget.value; setFilter((f) => ({ ...f, lifecycle: v })); }} style={{ width: CLOSED_DROPDOWN_WIDTH }}><option value="">Any</option>{LIFECYCLES.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
            <label className="req-header__field"><span className="field-label">Health</span><select className="input select" data-testid="req-filter-health" aria-label="Filter by health" value={filter.health} onChange={(e) => { const v = e.currentTarget.value; setFilter((f) => ({ ...f, health: v })); }} style={{ width: CLOSED_DROPDOWN_WIDTH }}><option value="">Any</option>{HEALTH_TOKENS.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
            <label className="req-header__field"><span className="field-label">Priority</span><select className="input select" data-testid="req-filter-priority" aria-label="Filter by priority" value={filter.priority} onChange={(e) => { const v = e.currentTarget.value; setFilter((f) => ({ ...f, priority: v })); }} style={{ width: CLOSED_DROPDOWN_WIDTH }}><option value="">Any</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          </div>
        )}
        <p className="req-header__analysis card-meta" data-testid="req-analysis">{board?.analysisEnabled ? ANALYSIS_ON_SENTENCE : ANALYSIS_OFF_SENTENCE} {AWAITING_JUDGEMENT_NONE}</p>
        {error !== null && board !== null && <p className="req-status req-status--error" role="alert" data-testid="req-error-inline">{PROJECTION_UNAVAILABLE}: {error} The last good board stays on screen. <button type="button" className="btn btn-link" onClick={reevaluate}>{REEVALUATE_LABEL}</button></p>}
        {notice !== null && <p className="req-status" role="status" data-testid="req-notice">{notice} <button type="button" className="btn btn-link" onClick={() => setNotice(null)}>Dismiss</button></p>}
      </header>
      {board !== null && <BlockedStrip blocked={board.blocked} onResume={(id) => { const c = board.cards.find((x) => x.id === id); if (c) void requestMove(id, c.returnTo ?? 'backlog'); }} onNavigate={revealCard} onFilterToBlocked={() => setFilter((f) => ({ ...f, health: 'blocked' }))} />}
      <div className="req-body">
        {body}
        {detailCard !== undefined && board !== null && (
          <DetailPanel card={detailCard} detail={detail} board={board} now={now} localOffsetMinutes={host.localOffsetMinutes} onClose={closeDetail} onNavigate={open} onOpenEvidence={openEvidence} onOpenSession={host.openSession} />
        )}
      </div>
      <p className="req-foot card-meta" data-testid="req-subscription">{SUBSCRIPTION_SENTENCE}</p>
      {evidenceCard !== undefined && <EvidencePane card={evidenceCard} detail={detail} onClose={closeEvidence} onOpenSession={host.openSession} />}
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
