import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import type { ApprovalPayload, ImageAttachment, QuestionPrompt, TranscriptRow } from '@rotaris/contracts';
import {
  LIVE_REFRESH_MS, PAGE_OLDER_THRESHOLD, POOL_CAPACITY, TAIL_EPSILON, capacityFor, countUiObjects, countWidgets,
} from './constants.js';
import { createMeasurementCache, createRenderCache, identityOf, measureKey, reuseKey, sourceTextOf, type TranscriptCacheStats } from './cache.js';
import { CAP_DEFAULTS, isLive, rowKey, type DisplayCaps } from './project.js';
import { createProjector } from './projector.js';
import {
  beginMeasuring, bindRange, buildOffsets, captureAnchor, commitTable, createMeasureLedger, markMeasured, measureAtCommit, newUpdatesLabel, remeasuredSince,
  observeAgain, readHeight, restoreAnchor, reuseOffsets, slotRef, updateShape, visibleRange, type Anchor,
} from './pool.js';
import { isOwnScroll } from './scroll.js';
import { countLabel, indexAll, step as stepMatch, type Match } from './search.js';
import { Row, TranscriptSurfaceProvider, isReasoningRow, rowMenuEntries, type RowMenuRequest, type TranscriptSurface } from './Row.js';
import { RowContextMenu, copyRowEntry, moveCurrentRow, type Acknowledger } from '../TranscriptSurface.js';
import { useTerminalHost } from '../terminal/host.js'; // Part AL2 — the renderer's terminal host, read for the two terminal fields of the surface
import type { DisplayRow, RowRenderProps, TrailerRow } from './types.js';
import { Button as DesignButton, EmptyState as DesignEmptyState, Input as DesignInput } from '../design-system/index.js';

/**
 * ADR-0045's **fixed-capacity recycled row pool**, and ADR-0046's **step 5 — present**.
 *
 * The transcript is a scroll container holding a CONSTANT number of absolutely positioned row slots, allocated at
 * window construction and never added to or removed from. Scrolling and content changes REBIND slots to displayed
 * rows and mutate their contents in place; a slot showing nothing is EMPTIED rather than unmounted. The slot index
 * is the framework key, never the row identity — the whole point of the recycler is that the framework must not
 * unmount and remount as the visible set moves — and that is why a row may hold no state of its own: a rebind
 * would carry one row's state onto another.
 *
 * `ToolRow`'s `useState(open)` in `TranscriptRows.tsx` is the existing instance of that bug. Expansion state lives
 * here, in a map keyed by stable identity (REQ-CHAT-059), and reaches a row as a prop.
 */
export interface TranscriptPaneProps {
  readonly rows: readonly TranscriptRow[];
  readonly running: boolean;
  readonly groupTools: boolean;
  readonly caps?: DisplayCaps | undefined;
  readonly pendingQuestions: readonly QuestionPrompt[];
  readonly pendingApprovals: readonly ApprovalPayload[];
  /**
   * Part AC — REQ-CHAT-098 / REQ-CHAT-103: the trailer row is already a control (`Row.tsx`) and this is the one
   * handler behind it, for BOTH trailers — a question row opens the stepper, an approval row raises its dialog.
   * Absent leaves the row drawn and inert, which is what it was until this part.
   */
  readonly onOpenTrailer?: ((trailer: TrailerRow) => void) | undefined;
  readonly questionAgent?: string | undefined;
  /**
   * PD-CHAT-005: how deep a named agent sits in the delegation tree, for the row's indentation. The view above
   * holds the tree (REQ-MONITOR-036/037); the pane holds none and asks. Absent leaves every row at depth 0.
   */
  readonly agentDepth?: ((name: string, persona: string) => number) | undefined;
  /** REQ-CHAT-165: fetch the next older span. Resolves false when the load FAILED, which a reader must be able to tell from having reached the oldest row. */
  readonly onPageOlder?: ((beforeIndex: number) => Promise<boolean>) | undefined;
  /** REQ-CHAT-165: the first recorded row is among those held, so there is nothing older to fetch. */
  readonly reachedOldest?: boolean | undefined;
  /** REQ-CHAT-074: closing the search panel refocuses the composer. */
  readonly onFocusComposer?: (() => void) | undefined;
  /** REQ-CHAT-167 (`display/showReasoning`) and REQ-CHAT-067 (`display/autoCollapseTools`), both default OFF. */
  readonly showReasoning?: boolean | undefined;
  readonly autoCollapseTools?: boolean | undefined;
  /** REQ-CHAT-076: `http(s)` opens in the system browser; absent leaves a link inert (ADR-0051). */
  readonly onOpenLink?: ((href: string) => void) | undefined;
  readonly onReadAttachment?: ((attachment: ImageAttachment) => Promise<string | null>) | undefined;
  /** REQ-CHAT-075: a copy or an open is acknowledged when it works and REPORTED when it does not (ADR-0049). */
  readonly onAcknowledge?: Acknowledger | undefined;
  /** REQ-CHAT-063: the instant live rows are drawn against; the pane's own tick advances it. */
  readonly nowMs?: number | undefined;
  /** Part AA's `Row` is the default. A caller overrides it only to draw a fixture (the proofs do). */
  readonly renderRow?: ((p: RowRenderProps) => ReactElement) | undefined;
}

export interface TranscriptCounts {
  readonly widgets: number;
  readonly uiObjects: number;
  readonly slots: number;
  readonly bound: number;
  readonly displayed: number;
  readonly render: TranscriptCacheStats;
  readonly measurement: TranscriptCacheStats;
}

/** REQ-CHAT-073's empty state. Its second clause — "and the Clear action MUST be disabled" — has nothing to be
 * true of in this build: section 14, transcript clearing, is out of the plan, `clearTranscript` answers false and
 * no Clear action exists anywhere in the product. The requirement is therefore met in one clause of two, and this
 * is recorded rather than reported as met whole (ADR-0046's first-execution note carries it). */
const EMPTY_TITLE = 'No transcript yet';
const EMPTY_BODY = 'Describe the outcome you want. Rotaris will show agent activity and results here.';

export function TranscriptPane(props: TranscriptPaneProps): ReactElement {
  const {
    rows, running, groupTools, caps = CAP_DEFAULTS, pendingQuestions, pendingApprovals, questionAgent, agentDepth,
    onPageOlder, reachedOldest = false, onFocusComposer, renderRow = Row, onOpenTrailer,
    showReasoning = false, autoCollapseTools = false, onOpenLink, onReadAttachment, onAcknowledge, nowMs = 0,
  } = props;

  const scroller = useRef<HTMLDivElement | null>(null);
  /**
   * A programmatic scroll must not change the follow state (REQ-CHAT-070): only reader-caused movement may.
   *
   * FALSIFIED 2026-09-22, kept beside its replacement: this was `programmatic = useRef(false)`, a flag set
   * before the pane scrolled itself and cleared by **the next scroll event, whoever caused it**. A scroll
   * event carries no origin, so a reader's scroll arriving between the pin and the pin's own event was
   * consumed as the pane's: the follow was never released and the pane pinned again on its next render.
   * For a wheel gesture that is one swallowed event out of many, which is why it was never reported as a
   * product complaint; it is decisive for anything that scrolls ONCE and expects it to hold, and the
   * capture seam's `releaseProbe` had to nudge repeatedly to get past it.
   *
   * What the pane actually knows is not "I scrolled" but **where I scrolled to**, so that is what it keeps.
   * An event whose `scrollTop` is the position the pane last set is the pane's own; any other position is
   * the reader's, whatever order the events arrive in. The value is read back AFTER the assignment because
   * the browser clamps it, and it is armed only when the assignment actually moved the element — setting
   * `scrollTop` to what it already holds fires no event, and an armed position with no event behind it
   * would swallow the reader's next scroll to that same place.
   */
  const expectedTop = useRef<number | null>(null);
  const scrollSelf = (el: HTMLElement, top: number): void => {
    const before = el.scrollTop;
    el.scrollTop = top;
    if (el.scrollTop !== before) expectedTop.current = el.scrollTop;
  };
  const pendingAnchor = useRef<Anchor | null>(null);
  const previousDisplay = useRef<readonly DisplayRow[]>([]);
  const previousTable = useRef(buildOffsets([]));

  // REQ-CHAT-058's two bounded caches, and the slot nodes, held as VALUES rather than as refs so that reading a
  // measurement while laying out is an ordinary read of state rather than a ref read during render.
  //
  // The ledger hears which row identities the measurement pass re-measured (and which entries the bounds evicted), so the
  // offset table below re-reads those rows and no others (`reuseOffsets`, REQ-CHAT-055); it also holds the last table
  // React committed, the one the next is built against — as a value, like the caches.
  const [ledger] = useState(createMeasureLedger);
  const [measurements] = useState(() => createMeasurementCache((key) => markMeasured(ledger, identityOf(key))));
  /**
   * The last height each row IDENTITY measured, whatever its content was at the time. It is the fallback between
   * an exact measurement and an estimate, and it exists for the two cases where an exact one cannot arrive in
   * time: a row whose key changes on every streamed chunk, and a live row that has only just begun.
   *
   * A row that grew by one token is within a line of the height it had a moment ago; an estimate recomputed from
   * scratch is not. Falling back to the estimate on every chunk is what made the rows below a streaming message
   * jump twice per chunk — estimate, paint, observe, paint — and made two producing agents flicker against each
   * other (docs/defects/live-rows-are-never-measured.md).
   */
  const [lastByIdentity] = useState(() => createMeasurementCache((identity) => markMeasured(ledger, identity)));
  const [renderings] = useState(createRenderCache<ReactElement>);
  const [attachmentBodies, setAttachmentBodies] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    if (!onReadAttachment) return;
    for (const attachment of rows.flatMap((row) => row.attachments ?? [])) {
      if (!attachment.available || attachmentBodies.has(attachment.digest)) continue;
      void onReadAttachment(attachment).then((url) => { if (url !== null) setAttachmentBodies((current) => new Map(current).set(attachment.digest, url)); });
    }
  }, [rows, onReadAttachment, attachmentBodies]);
  const [slotNodes] = useState(() => new Map<number, HTMLDivElement>());
  /** The measurement key each slot was last observed under (`observeAgain`), and the measurement pass's observer. */
  const [observedKeys] = useState(() => new Map<number, string>());
  const observerRef = useRef<ResizeObserver | null>(null);
  /** Each slot's ref callback, one per slot for the pane's life (`slotRef`). */
  const [slotRefs] = useState(() => new Map<number, (node: HTMLDivElement | null) => void>());
  /**
   * ADR-0045: the span of rows the pool bound at the last commit, and the span the measurement observer's synchronous render
   * is held to (`bindRange`) — set inside the delivery, released by an ordinary update after it.
   */
  const committedRange = useRef<{ first: number; last: number }>({ first: 0, last: -1 });
  const [heldRange, setHeldRange] = useState<{ first: number; last: number } | null>(null);

  /**
   * REQ-CHAT-059 / REQ-CHAT-167: what the READER set by hand, keyed by stable identity. It is deliberately not
   * the effective set: `display/showReasoning` supplies a DEFAULT, and a row the reader has opened or closed
   * keeps the state the reader gave it, overriding the preference for that row (REQ-CHAT-167's last sentence).
   */
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [following, setFollowing] = useState(true);
  /** REQ-CHAT-072: how many displayed rows there were when the reader stopped following; null while following. */
  const [seenCount, setSeenCount] = useState<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState({ height: 600, width: 800 });
  const [capacity, setCapacity] = useState(POOL_CAPACITY);
  const [tick, setTick] = useState(0);
  /** REQ-CHAT-063: the instant live rows are drawn against, read in the tick effect and NEVER during render. */
  const [ticked, setTicked] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(0);
  /**
   * REQ-CHAT-074: showing a match DISABLES tail-follow, selects the row and scrolls it to centre. Turning follow
   * off belongs in the handler and not in the effect that scrolls, because the reader's action is what causes it —
   * and because while follow is on, the pin below runs on every update and would drag the match straight back off
   * screen. The first execution measured exactly that: the count read "1 of 1" and the transcript stayed pinned to
   * the tail with the matched row never bound to a slot.
   */
  const showMatch = (next: number): void => { setCurrent(next); setFollowing(false); };
  const [paging, setPaging] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [measuredVersion, setMeasuredVersion] = useState(0);
  /** REQ-CHAT-075: ONE context menu per surface, held here so that no row holds an open/closed flag. */
  const [menu, setMenu] = useState<RowMenuRequest | null>(null);

  /**
   * The effective expansion, folded from the reader's overrides and the preference default.
   *
   * It is computed from `rows` rather than from the projection, which would be circular — step 4 reads the
   * expansion (REQ-CHAT-061: an expanded row shows its untruncated value whatever REQ-CHAT-166's caps say) and
   * the default reads the projection. The cycle breaks because `defaultExpanded` is true for **reasoning rows
   * only**, and a reasoning row is never folded into a group, so its display key equals `rowKey(row)` and is
   * knowable before step 4 runs. **If `defaultExpanded` ever answers true for a shape step 4 can create, this
   * shortcut stops being sound and the projection has to hand back its own keys.**
   *
   * PD-CHAT-004 folds reasoning rows into the activity line and so came within one rule of breaking exactly
   * that. It does not, and deliberately: a reasoning row enters a run **only while `display/showReasoning` is
   * off** (`runnable` in `project.ts`), and `defaultExpanded` answers true only while it is on. The two are the
   * same switch read from opposite sides, so no row is ever both folded and defaulted open. The condition this
   * note states is met by that rule and by nothing else — change one and this shortcut has to go.
   *
   * Built once per change of what it reads, not once per render: it is one of the projector's keys below, and a
   * fresh set on every render would make every render a projection (the R-048 measurement round). It reads the rows
   * ONLY while `display/showReasoning` is on; off — the default — an increment leaves it the same set, which is what
   * lets the projector take the bounded form for the rows alone having changed. (The first form of this memo depended
   * on the rows unconditionally, and the bounded form was never taken in the built app: measured, not read.)
   */
  const reasoningRows = showReasoning ? rows : null;
  const expanded = useMemo((): ReadonlySet<string> => {
    const set = new Set<string>();
    for (const [key, open] of overrides) if (open) set.add(key);
    if (reasoningRows !== null) {
      for (const r of reasoningRows) {
        if (!isReasoningRow(r)) continue;
        const key = rowKey(r);
        if (overrides.get(key) !== false) set.add(key);
      }
    }
    return set;
  }, [overrides, reasoningRows]);

  // ---- ADR-0046 step 4 ------------------------------------------------------------------------------------
  // Through the projector, so the three or four renders one increment causes — its own, the measurement pass's, the
  // pin's scroll event, a whole-session update's — project the resident window ONCE rather than each time. The R-048
  // measurement round traced the append cost at depth to exactly those repeated projections (`projector.ts`).
  const [projector] = useState(createProjector);
  /** REQ-CHAT-057 / REQ-CHAT-067: `places` is the two facts a row cannot know about itself, once per projection. */
  const { display, places } = projector.project({ rows, running, groupTools, showReasoning, caps, expanded, pendingQuestions, pendingApprovals, questionAgent });

  /**
   * The services and preferences every row in THIS pane shares (Part AA's `TranscriptSurface`). One value per
   * surface and never per row: rebinding a slot cannot carry one row's value to another because there is only
   * one value, which is the reason a context is safe here at all while row state is not.
   *
   * `memberExpanded` / `toggleMember` are how a group's MEMBER is opened. `RowRenderProps` carries one
   * `expanded` for the whole `DisplayRow`, so a group cannot express its members' states through it — the
   * second gap in the seam, found when the two halves met. The map is the same one, keyed by the member's own
   * display key — `rowKey(member)`, the identity step 4 holds REQ-CHAT-166's caps against. Toggling the member
   * therefore opens the card AND lifts the caps in the same gesture — which never collides with its group's:
   * `project.ts` keys a group `group:<first member's key>`.
   */
  // Part AL2 — REQ-SHELL-079 / REQ-CHAT-063/076: the live preview and the click that requests the pop-out come from the
  // renderer's terminal host (`terminal/host.tsx`), a context and not a prop, so this pane's props and the view above it
  // do not change for the terminal's sake; with no host mounted a row keeps its one-line `⤷` preview, as before.
  const terminalHost = useTerminalHost();
  /** REQ-CHAT-167: a row the reader toggles keeps the state the reader gave it, overriding the preference. */
  const toggle = useCallback((key: string, openNow: boolean): void => {
    setOverrides((held) => {
      const next = new Map(held);
      next.set(key, !openNow);
      return next;
    });
  }, []);
  /**
   * One value per surface, and one value per CHANGE of what it carries: a context value rebuilt on every render
   * re-renders every row that reads it — every bound slot, on each of the three or four renders an increment
   * causes — although the rendering cache had handed the slot the very element it held. The R-048 measurement round
   * traced the append cost at depth to script, and this was part of it: a transcript with a full viewport of rows
   * paid a viewport of row renders per render for nothing a row could see change.
   */
  const live = nowMs === 0 ? ticked : nowMs;
  const surface: TranscriptSurface = useMemo(() => ({
    showReasoning, autoCollapseTools, runActive: running, nowMs: live,
    openLink: onOpenLink, openMenu: (request) => setMenu(request), openTrailer: onOpenTrailer,
    openTerminal: terminalHost ? (streamId) => terminalHost.open(streamId) : undefined,
    terminalPreview: terminalHost ? (streamId) => terminalHost.streams.previewOf(streamId) : undefined,
    attachmentUrl: (attachment) => attachmentBodies.get(attachment.digest) ?? null,
    memberExpanded: (key) => expanded.has(key),
    toggleMember: (key) => toggle(key, expanded.has(key)),
    agentDepth,
  }), [showReasoning, autoCollapseTools, running, live, onOpenLink, onOpenTrailer, terminalHost, attachmentBodies, expanded, toggle, agentDepth]);

  // ---- REQ-CHAT-058: heights, measured rather than assumed -------------------------------------------------
  // `measuredVersion` is read so the table is rebuilt once the observer has recorded a real height; a `peek` is a
  // pure read that moves no recency and counts no hit, which is what makes it safe to do while laying out.
  // The expansion state rides to `estimateHeight` because a collapsed thinking row draws only its one-line
  // summary (REQ-CHAT-167 / REQ-CHAT-062) and is never measured while live — the estimate is all it has.
  // Three answers in order of how much they are worth: what this exact content measured; what this row last
  // measured under any content; what a width-aware estimate says. A LIVE row reaches the first of those now —
  // it never used to, because the measurement key was the rendering-reuse key, which refuses one.
  //
  // Rebuilt when the displayed rows, the width, the expansion or a measurement change — not on every render. At a
  // thousand rows the pass is a thousand lookups and, for every row never yet on screen, an estimate; run three or
  // four times an increment it was part of the script the R-048 measurement round traced the append cost to. The
  // measurement cache is mutated in place by the observer and `measuredVersion` is the signal that it has, which is
  // why the version is a dependency though nothing here reads its value.
  //
  // And rebuilt only where it changed (`reuseOffsets`): a row that is the same object at the same position, and whose
  // identity the measurement pass has not re-measured since the committed table was built, keeps its height and its
  // offset. Rebuilt whole, the pass was still a thousand lookups and estimates two or three times an increment — the
  // largest single term of the loaded side's extra script in V8's CPU profile of the built app (2026-09-29, the defect
  // note's "CPU profile" section): about 0.3 ms an increment at 1,200 rows, and nothing on an empty transcript.
  const table = useMemo(() => reuseOffsets(
    ledger.committed,
    { display, width: viewport.width, expanded, stamp: ledger.stamp },
    ledger.marked.size === 0 ? null : (identity, since) => remeasuredSince(ledger, identity, since),
    // The row's block start rides to the estimate because the first row of a block is drawn 12 px below the row
    // above rather than 4 px (PD-CHAT-003): a new row at the tail is positioned by its estimate until its first
    // measurement, and an estimate short of what it draws puts it through the row beneath it for those frames
    // (docs/defects/fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md).
    (d, at) => readHeight(d, at, viewport.width, expanded, places, measurements, lastByIdentity),
  ),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `measuredVersion` is the observer's "the cache changed" signal
  [display, places, expanded, viewport.width, measurements, lastByIdentity, ledger, measuredVersion]);
  // The table the next one is built against is the one React committed; the ledger's marks it has read are forgotten.
  useLayoutEffect(() => { commitTable(ledger, table); }, [table, ledger]);

  // ---- REQ-CHAT-074: the match set, indexed against DISPLAYED rows -----------------------------------------
  const matches: Match[] = searchOpen && query !== '' ? indexAll(display, query) : [];
  const activeMatch = matches[current] ?? null;

  // ADR-0045: a measurement delivery's synchronous render binds the span the pool last committed (`bindRange`), so it moves
  // rows and rebinds no slot inside the delivery; the span is released by an ordinary render after the frame.
  const needed = visibleRange(table, scrollTop, viewport.height, display.length, capacity);
  const range = bindRange(heldRange, needed, display.length, capacity);
  useLayoutEffect(() => { committedRange.current = range; });
  const bind = (slot: number): DisplayRow | null => {
    const at = range.first + slot;
    return at <= range.last ? display[at] ?? null : null;
  };

  const unseen = following || seenCount === null ? 0 : Math.max(0, display.length - seenCount);

  // ---- REQ-CHAT-070: following the tail -------------------------------------------------------------------
  const onScroll = (): void => {
    const el = scroller.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    // A scroll the application performed — pinning to the bottom, restoring an anchor, jumping to a search match —
    // leaves the state unchanged; only movement the reader causes may change it. The two are told apart by
    // POSITION rather than by a flag, so a reader's scroll that lands between the pane's own and its event is
    // read as the reader's: it is at a different offset, which is the whole of what makes it theirs.
    const expected = expectedTop.current;
    expectedTop.current = null;
    if (isOwnScroll(expected, el.scrollTop)) return;
    // The reader has moved for themselves, so an anchor being held across a settle is no longer theirs.
    pendingAnchor.current = null;
    const atMax = el.scrollHeight - el.clientHeight - el.scrollTop <= TAIL_EPSILON;
    setFollowing(atMax);
    setSeenCount(atMax ? null : (held) => (held === null ? display.length : held));
    // REQ-CHAT-165: scrolling toward the top loads the next older span, off the interface thread.
    if (el.scrollTop < PAGE_OLDER_THRESHOLD && !reachedOldest && paging !== 'loading' && onPageOlder && rows.length > 0) {
      setPaging('loading');
      void onPageOlder(rows[0]!.index).then((ok) => setPaging(ok ? 'idle' : 'failed')).catch(() => setPaging('failed'));
    }
  };

  /**
   * The measurement pass and the viewport, both driven by a ResizeObserver rather than by an effect body: an
   * observer callback is where a measurement legitimately becomes state, and observing a node delivers its first
   * size immediately, so no separate initial pass is needed.
   */
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const onViewport = new ResizeObserver(() => {
      setViewport({ height: el.clientHeight, width: el.clientWidth });
      // ADR-0045's ONE growth branch, in the product's own rendering path and not conditioned on being measured.
      setCapacity(capacityFor(el.clientHeight));
    });
    onViewport.observe(el);
    return () => onViewport.disconnect();
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      let changed = false;
      // One stamp per delivery: every identity this delivery re-measures — and every entry a bound evicts meanwhile, which
      // the caches report themselves — is marked with it, and the offset table re-reads exactly those rows.
      beginMeasuring(ledger);
      for (const entry of entries) {
        const key = (entry.target as HTMLElement).dataset['measure'];
        const height = entry.contentRect.height;
        if (key === undefined || key === '' || height <= 0) continue;
        const identity = identityOf(key);
        const held = measurements.peek(key);
        if (held === undefined || Math.abs(held - height) > 0.5) { measurements.set(key, height, 0); markMeasured(ledger, identity); changed = true; }
        // The same reading, filed under the row's identity, so the next content this row carries starts from
        // what it actually drew rather than from an estimate.
        const previous = lastByIdentity.peek(identity);
        if (previous === undefined || Math.abs(previous - height) > 0.5) { lastByIdentity.set(identity, height, 0); markMeasured(ledger, identity); changed = true; }
      }
      // ADR-0045 (heights are measured), for a size that changes under an UNCHANGED key — a native `<details>` opened on a
      // user row's image attachment, the image it reveals loading, a row's block start changing its top margin — where no
      // commit runs and `measureAtCommit` has nothing to read. The delivery comes after layout and before the paint, so the
      // render it asks for is rendered HERE, synchronously, and the frame is painted with the row beneath placed below what
      // the row draws. **Falsified 2026-10-01, kept beside its replacement: `if (changed) setMeasuredVersion((v) => v + 1)`.**
      // That is a default-lane update, rendered after the frame was painted, so the row that grew was drawn through the row
      // beneath it for that frame
      // (docs/defects/fixed/a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md).
      //
      // The render is held to the span of rows the pool last committed (`bindRange`): slots are bound by position, and a
      // corrected height above the viewport moved the span, so the delivery's render rebound every slot and changed its
      // size at the depth just delivered, which the browser defers and reports as "ResizeObserver loop completed with
      // undelivered notifications" — at the end of `transcript-proof`'s append runs, after the first repair
      // (docs/defects/fixed/the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md). The
      // span is released by an ordinary update, rendered after this frame, outside any delivery, which rebinds what the
      // delivery held back.
      if (changed) {
        const held = committedRange.current;
        flushSync(() => { setHeldRange(held); setMeasuredVersion((v) => v + 1); });
        setHeldRange(null);
      }
    });
    observedKeys.clear();
    for (const [slot, node] of slotNodes) { observer.observe(node); observedKeys.set(slot, node.dataset['measure'] ?? ''); }
    observerRef.current = observer;
    return () => { observer.disconnect(); if (observerRef.current === observer) observerRef.current = null; };
    // Re-observing on every displayed change keeps a slot rebound BY THAT CHANGE measured under its new key.
    // **Falsified 2026-09-30, kept beside its replacement: "re-observing on every displayed change is what keeps a
    // rebound slot measured under its NEW key".** A scroll rebinds slots without changing what is displayed, and an
    // observer delivers a size only when it CHANGES: a slot rebound to a row that draws the height the row it held drew
    // delivered nothing, and the new row stayed at its estimate on screen until the next displayed change. The layout
    // effect below observes such a slot again, which delivers its size whatever it was.
    //
    // ONE observer for the pane's life: every dependency is an identity held in state, so this runs at mount and never
    // again. **Until 2026-10-01 `display` and `capacity` were dependencies too, and the observer was disconnected and made
    // again, observing every slot afresh, on each displayed change.** React flushes a pending passive effect before its
    // next render, and that render could be the delivery's own `flushSync` above: a displayed change was committed, the
    // delivery came in the same frame, and this effect disconnected the very observer delivering and observed every slot
    // again at the depth just delivered. The browser defers such observations to the next frame and reports "ResizeObserver
    // loop completed with undelivered notifications" (docs/defects/fixed/the-observers-synchronous-render-can-leave-a-resize-observer-loop-notification.md).
    // A slot that a displayed change rebinds, or that a capacity growth adds, is observed by the layout effect below.
  }, [measurements, lastByIdentity, ledger, slotNodes, observedKeys]);

  // ADR-0045 (heights are measured): every commit, a slot bound under a measurement key it was not observed under is
  // observed again, so the row it now holds is measured rather than left at its estimate
  // (docs/defects/fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md).
  // It walks the pool's slots, not the transcript's rows, so its cost is bounded by the viewport (REQ-CHAT-055).
  useLayoutEffect(() => {
    const observer = observerRef.current;
    if (observer === null) return;
    for (const [slot, node] of slotNodes) {
      if (!observeAgain(observedKeys, slot, node.dataset['measure'] ?? '')) continue;
      observer.unobserve(node);
      observer.observe(node);
    }
  });

  // ADR-0045 (heights are measured) at the commit, before the browser paints it: a bound row with no measurement of what it
  // draws now — first bound, or its content changed — is read here, and when it draws other than the height that placed
  // it the pane renders again inside this commit (`measureAtCommit`). The observer's delivery comes after layout and its
  // render a frame later, so a row that GREW was painted through the row beneath it for that frame
  // (docs/defects/fixed/a-row-that-grows-is-drawn-through-the-row-beneath-it-until-it-is-measured-again.md). It reads layout
  // only for slots whose key is unmeasured, and walks the pool's slots, not the transcript's rows (REQ-CHAT-055).
  // The slot has no padding or border, so its border box is the content box the observer reports. It runs after EVERY
  // commit, as the re-observing effect does, because any render may bind a slot to a row or change what a row draws; it
  // renders again only when a bound row draws other than what placed it, so the chain ends once every bound key is measured.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every commit, by design: see above
  useLayoutEffect(() => {
    let unmeasured = false;
    for (const node of slotNodes.values()) {
      const key = node.dataset['measure'] ?? '';
      if (key !== '' && measurements.peek(key) === undefined) { unmeasured = true; break; }
    }
    if (!unmeasured) return;
    const bound = [...slotNodes.values()].map((node) => ({ key: node.dataset['measure'] ?? '', read: () => node.getBoundingClientRect().height }));
    // The render this asks for is the point: it is the measure-before-paint a layout effect exists for, and it happens
    // only when a bound row was placed by a height it does not draw.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measured layout, before the paint
    if (measureAtCommit(ledger, bound, measurements, lastByIdentity)) setMeasuredVersion((v) => v + 1);
  });

  /** REQ-CHAT-053 / REQ-CHAT-071 / REQ-CHAT-072: what an update does to the reader's position. */
  useLayoutEffect(() => {
    const el = scroller.current;
    const before = previousDisplay.current;
    const beforeTable = previousTable.current;
    // REQ-CHAT-053: which of the four shapes this was. Only a shape matching none of them may reset the view, and
    // even a reset restores by REQ-CHAT-071's anchor rather than by re-applying a stored pixel offset.
    const shape = updateShape(before, display);
    if (el && !following && pendingAnchor.current === null) pendingAnchor.current = captureAnchor(before, beforeTable, el.scrollTop);
    previousDisplay.current = display;
    previousTable.current = table;
    if (!el) return;
    if (following) {
      scrollSelf(el, el.scrollHeight);
      pendingAnchor.current = null;
      return;
    }
    // Each of the four shapes leaves the reader's position and every row's expansion state exactly as set: the
    // expansion map is keyed by identity and is untouched here, and the position is restored by anchor. A shape
    // matching none of the four is the only one permitted to reset, and REQ-CHAT-053 requires even that reset to
    // restore by REQ-CHAT-071's anchor — which is why the same restoration runs whatever the shape was, and why
    // the shape is recorded on the element rather than branched on.
    //
    // **The anchor is HELD until the geometry settles, and released only by the reader.** REQ-CHAT-071 says
    // "restore that anchor AFTER GEOMETRY SETTLES", and a row that has just arrived carries an ESTIMATED height
    // until the measurement pass reaches it: restoring once, on arrival, restores against estimates, and the
    // content then shifts under the reader by the whole estimation error as the real heights land. The first
    // execution measured exactly that - fifty rows paged in above the viewport moved the reader 360 px, of which
    // about 260 px was estimate against measurement. This effect re-runs whenever the measured total changes, so
    // the held anchor is re-applied until it stops moving, and `onScroll` drops it the moment the reader scrolls.
    const restored = restoreAnchor(display, table, pendingAnchor.current);
    if (restored !== null && Math.abs(restored - el.scrollTop) > 0.5) scrollSelf(el, restored);
    el.dataset['shape'] = shape;
    if (restored === null) pendingAnchor.current = null;
    // `table` was once rebuilt every render, so depending on the object itself re-pinned the tail continuously; it is
    // now rebuilt once per change of rows, width, expansion or a measurement, and its total height is still the only
    // part of it this effect reacts to. (The first execution measured the continuous re-pin: see ADR-0046.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, table.total, following]);

  /** REQ-CHAT-063: while any row is live, refresh at 1000 ms; when none is, nothing repaints on a timer at all. */
  const anyLive = display.some(isLive);
  useEffect(() => {
    if (!anyLive) return;
    // The first read is on the first interval rather than synchronously in the effect body: a live row's
    // elapsed time is drawn from `row.startedAt` until the clock first ticks, so nothing shows a wrong figure
    // meanwhile, and a synchronous setState here would cascade a render on every mount.
    const handle = setInterval(() => { setTick((t) => t + 1); setTicked(Date.now()); }, LIVE_REFRESH_MS);
    return () => clearInterval(handle);
  }, [anyLive]);

  /** REQ-CHAT-002 / REQ-CHAT-074: Ctrl+F opens the panel — this closes Part W's Ctrl+F owe. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** REQ-CHAT-074: showing a match disables tail-follow, selects the row and scrolls it to centre. */
  const matchAt = activeMatch?.at ?? null;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || matchAt === null) return;
    const top = previousTable.current.offsets[matchAt] ?? 0;
    scrollSelf(el, Math.max(0, top - el.clientHeight / 2));
    // Jumping to a match is the application deliberately MOVING the reader, so any anchor held across a settle is
    // stale and is dropped; the next update captures a fresh one at the centred position. Without this the held
    // anchor pulled the transcript straight back off the match — the same failure the pin had, one layer down.
    pendingAnchor.current = null;
  }, [matchAt]);

  const empty = display.length === 0;
  /**
   * REQ-CHAT-058: a retained rendering is reused only while identity, content, the width it was laid out for and
   * expansion state are ALL unchanged — `reuseKey` is that predicate, and it returns null for a LIVE row, which is
   * therefore redrawn on every repaint so its elapsed time keeps advancing. The 1000 ms tick causes the repaint;
   * nothing else changes on it, so no scroll position moves and no row that is not live reflows.
   */
  const paint = (d: DisplayRow, at: number): ReactElement => {
    const open = expanded.has(d.key);
    const match = activeMatch !== null && activeMatch.key === d.key ? activeMatch.range : null;
    // REQ-CHAT-057's attribution and REQ-CHAT-067's "most recent pair" are facts about a row's NEIGHBOURS, which
    // `RowRenderProps` cannot carry — the seam's one gap, found when the two halves met. `placements` computes
    // both once per projection and the reuse key carries the result, so a row whose place changed is redrawn.
    const place = places[at];
    const key = reuseKey(d, viewport.width, open, match, place);
    if (key !== null) {
      const held = renderings.get(key);
      if (held !== undefined) return held;
    }
    // `createElement` and NOT `renderRow(props)`. Calling a component as a plain function runs its hooks in the
    // CALLER's render — this component's — which is outside the provider this component renders, so every row
    // read the inert default surface: `runActive` false, both preferences off, no link opener and no menu. Neither
    // half could see it apart: Part Z's placeholder read no context, and Part AA's plain list rendered `<Row/>` as
    // an element inside the provider. It is the defect the merge of the two found.
    const element = createElement(renderRow, { display: d, expanded: open, onToggle: () => toggle(d.key, open), match, place });
    if (key !== null) renderings.set(key, element, sourceTextOf(d).length);
    return element;
  };

  return (
    <div
      className="transcript__pane" data-testid="transcript-pane" data-tick={tick}
      onKeyDown={(e) => {
        // REQ-CHAT-077 / REQ-CHAT-075: arrows, Page and Home/End move the current row; Ctrl+C copies it. The
        // pool binds a WINDOW of rows to slots, so moving past the bound span has to scroll before it can
        // select — which the plain list Part AA wrote it against never had to do.
        if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
          const key = (e.currentTarget.querySelector('.row--current') as HTMLElement | null)?.dataset['rowKey'];
          const d = display.find((x) => x.key === key);
          if (d !== undefined) { void copyRowEntry(rowMenuEntries(d)[0]!, onAcknowledge); e.preventDefault(); }
          return;
        }
        // Scoped to the POOL, not the pane: `moveCurrentRow` looks one container deep (`:scope > * > .row`), and
        // in the pool a row sits inside its slot inside the pool inside the scroller. Part AA wrote it against a
        // plain list where the rows are its own children.
        const pool = e.currentTarget.querySelector<HTMLElement>('.transcript__pool');
        if (pool !== null && moveCurrentRow(pool, e.key)) e.preventDefault();
      }}
    >
      {searchOpen && (
        <div className="transcript__search" role="search" aria-label="Search transcript">
          <DesignInput
            className="input transcript__search-input" autoFocus placeholder="Search transcript…" aria-label="Search transcript"
            data-testid="transcript-search-input" value={query}
            onChange={(e) => { setQuery(e.currentTarget.value); showMatch(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); showMatch(stepMatch(current, matches.length, 1)); }
              if (e.key === 'Escape') { e.preventDefault(); setSearchOpen(false); onFocusComposer?.(); }
            }}
          />
          <span className="transcript__search-count" data-testid="transcript-search-count">{countLabel(matches.length, current)}</span>
          <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="transcript-search-prev" onClick={() => showMatch(stepMatch(current, matches.length, -1))}>Previous</DesignButton>
          <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="transcript-search-next" onClick={() => showMatch(stepMatch(current, matches.length, 1))}>Next</DesignButton>
          <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="transcript-search-close" onClick={() => { setSearchOpen(false); onFocusComposer?.(); }}>Close</DesignButton>
        </div>
      )}
      {unseen > 0 && (
        <DesignButton type="button" className="btn btn-secondary btn-compact transcript__new" data-testid="transcript-new-updates"
          onClick={() => { setFollowing(true); setSeenCount(null); }}>{newUpdatesLabel(unseen)}</DesignButton>
      )}
      <div
        ref={scroller}
        className={`transcript__scroll${following ? ' is-following' : ''}`}
        data-testid="transcript-scroll"
        data-following={following ? '1' : '0'}
        data-displayed={display.length}
        data-slots={capacity}
        data-bound={range.last - range.first + 1}
        data-paging={paging}
        data-measured={measuredVersion}
        data-cache={`${renderings.stats.entries}/${renderings.stats.characters}/${renderings.stats.hits}/${renderings.stats.misses}`}
        // Verification only, like `data-cache`: how many projections this pane has run, and how many took the bounded form.
        data-projections={`${projector.projections}/${projector.incrementals}`}
        // REQ-CHAT-070: the description states which of the two states is current, and never describes both alike.
        aria-description={following
          ? 'Following new output as it arrives.'
          : 'Not following; new output is arriving out of view.'}
        onScroll={onScroll}
      >
        {empty && (
          <DesignEmptyState className="empty-state" data-testid="transcript-empty">
            <span className="empty-state-title">{EMPTY_TITLE}</span>
            <span className="empty-state-hint">{EMPTY_BODY}</span>
          </DesignEmptyState>
        )}
        {/*
          * The pool is rendered whether or not the transcript has any rows — "emptied rather than unmounted"
          * applies to the pool as a whole as much as to one slot, and it is what makes ADR-0045's element-count
          * invariance hold across 0 rows as well as across 1200. REQ-CHAT-073's empty state is drawn OVER an
          * intact pool of empty slots rather than instead of one.
          */}
        <TranscriptSurfaceProvider value={surface}>
        <div className="transcript__pool" style={{ height: `${table.total}px` }}>
            {paging === 'failed' && (
              <div className="transcript__page-error" role="status" data-testid="transcript-page-failed">Older messages could not be loaded. Scroll up to try again.</div>
            )}
            {reachedOldest && (
              <div className="transcript__oldest" data-testid="transcript-oldest">This is the start of the conversation.</div>
            )}
            {Array.from({ length: capacity }, (_, slot) => {
              const d = bind(slot);
              const at = range.first + slot;
              // Every bound slot is measured, live or settled: REQ-CHAT-058 says heights are measured rather
              // than assumed, and a row in the DOM that carries no key is assumed.
              const measured = d === null ? '' : measureKey(d, viewport.width, expanded.has(d.key), null);
              return (
                <div
                  key={slot}
                  ref={slotRef(slotRefs, slot, slotNodes, observedKeys, (node) => observerRef.current?.unobserve(node))}
                  className={`transcript__slot slot${d === null ? ' slot--empty' : ''}`}
                  data-slot={slot}
                  data-measure={measured}
                  data-bound={d === null ? '' : d.key}
                  style={{ transform: `translateY(${d === null ? 0 : table.offsets[at] ?? 0}px)`, visibility: d === null ? 'hidden' : 'visible' }}
                >
                  {d === null ? null : paint(d, range.first + slot)}
                </div>
            );
          })}
        </div>
        {menu && <RowContextMenu request={menu} acknowledge={onAcknowledge} onClose={() => setMenu(null)} />}
        </TranscriptSurfaceProvider>
      </div>
    </div>
  );
}

/**
 * Verification only, and named so. ADR-0045 owes the benchmark a **definition** of `widgets` and `ui_objects`
 * rather than a behaviour; this is that definition made readable from outside the process, so the transcript proof
 * and, later, ADR-0053's harness both read one rule instead of restating it. No surface behaves differently
 * because it exists.
 */
export function readTranscriptCounts(): TranscriptCounts {
  const scroll = document.querySelector('[data-testid="transcript-scroll"]');
  const slots = document.querySelectorAll('.transcript__slot');
  let bound = 0;
  for (const slot of slots) if ((slot as HTMLElement).dataset['bound'] !== '') bound += 1;
  const zero: TranscriptCacheStats = { entries: 0, characters: 0, hits: 0, misses: 0, evictions: 0 };
  const cache = (scroll as HTMLElement | null)?.dataset['cache']?.split('/').map(Number) ?? [];
  return {
    widgets: countWidgets(document), uiObjects: countUiObjects(document), slots: slots.length, bound,
    displayed: Number((scroll as HTMLElement | null)?.dataset['displayed'] ?? 0),
    render: cache.length === 4 ? { entries: cache[0]!, characters: cache[1]!, hits: cache[2]!, misses: cache[3]!, evictions: 0 } : zero,
    measurement: zero,
  };
}

export { rowKey };
