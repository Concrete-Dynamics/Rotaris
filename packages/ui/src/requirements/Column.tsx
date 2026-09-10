import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { BoardCard, Reachability, ReqId } from '@rotaris/contracts';
import { CARD_HEIGHT_ESTIMATE, PRIVATE_TRANSFER_TYPE, headingAccessibleName, railAccessibleName, realisedBand } from './model.js';

/**
 * Part AK2 — one column of the board, open or folded (REQ-TRACE-232..238, 303..321, 358..367).
 *
 * Open: a heading that is a CONTROL (clicking folds it; its accessible name states the label, the count and the
 * fold action — REQ-TRACE-307/320), `<Label> · <count>` (234), the specific empty sentence when it holds nothing
 * (236), and a vertically scrolling list that realises card widgets ONLY for the band lying within its own viewport
 * plus five cards of margin above and below (358/360), sizing the scroll range from an estimate until real
 * measurements exist and adopting them once they do (360/361). Widgets are React elements keyed by position, so
 * scrolling repaints a bounded set rather than allocating one per member; the reconciler holds no pool of released
 * widgets to cap at twenty (REQ-TRACE-360's second half) — the bound that requirement protects, the realised count,
 * is what `onRealised` reports and the proof measures.
 *
 * Off screen: the columns area scrolls horizontally (REQ-TRACE-237), so "the cards lying within its own scroll
 * viewport" has a second dimension — a column whose box lies outside the area's visible width plus one column of
 * margin keeps its heading, its count and its full scroll-range spacer (so its scroll offset survives, REQ-TRACE-335)
 * and realises NO card. Defect AK2-2 (ADR-0041's second execution): with vertical virtualisation alone, grouping a
 * 1,500-requirement store by epic realised every one of a hundred columns' bands in one commit — about 1,300 card
 * widgets and a 1.7 s long task — for four columns in view. Visibility is decided in a layout effect against the
 * container the view passes in, before the first paint, and re-decided on every horizontal scroll and resize.
 *
 * Folded: a narrow rail 8 characters of its own font wide, margin 4 (310), text upright and never rotated (309),
 * the heading wrapping onto at most two lines then eliding with the whole text on its tooltip and accessible name,
 * the count, and — where the column is empty — the very same sentence on the tooltip and description (308). It is
 * a button: focusable, unfolds from the keyboard (320). During a drag every rail states its own answer in the
 * engine's words with a glyph, grows by a line and a half and takes an open column's minimum width, all in the
 * update that begins the drag and surrendered in the one that ends it, unanimated (318/319); a dragged card that
 * hovers a rail opens it (317).
 */
export interface ColumnProps {
  readonly colKey: string;
  readonly label: string;
  readonly count: number;
  readonly members: readonly BoardCard[];
  readonly folded: boolean;
  readonly emptySentence: string;
  readonly deliveryWord: string;
  /** A drag is in progress; on the delivery axis this column's answer, else undefined. */
  readonly drag: { readonly id: ReqId; readonly answer: Reachability | undefined; readonly droppable: boolean } | null;
  readonly revealIndex: number | null;
  /** The horizontally scrolling columns area, against which this column decides whether it is on screen. */
  readonly container: RefObject<HTMLDivElement | null>;
  /** Bumped by the view on every horizontal scroll and resize of the area, so the decision is re-taken. */
  readonly revision: number;
  readonly onFold: (key: string, folded: boolean) => void;
  readonly onDrop: (key: string, id: ReqId) => void;
  readonly onDragHover: (key: string, hovering: boolean) => void;
  readonly onRealised: (key: string, realised: number) => void;
  readonly renderCard: (card: BoardCard, index: number) => ReactNode;
}

/** One open column of margin on either side of the visible width, so a wheel notch lands on realised cards (REQ-TRACE-360's spirit, sideways). */
const HORIZONTAL_MARGIN = 340;

/**
 * Defect AK2-2, third reading. The two halves above bounded what a column REALISES; neither bounded how often a
 * column RE-RENDERS. Every visible column reports its realised count to the view, and the view holds that count in
 * state, so on an axis switch each of the columns in view caused a parent render that re-rendered all one hundred
 * columns — hundreds of column renders, each re-running its layout effects against a 28 820 px row, for six columns
 * of actual change. Memoised, a parent render whose bookkeeping did not change THIS column now costs it nothing.
 * Every prop is either a primitive compared by value, a stable callback, a ref, or null while no drag is running.
 */
export const Column = memo(function Column({ colKey, label, count, members, folded, emptySentence, deliveryWord, drag, revealIndex, container, revision, onFold, onDrop, onDragHover, onRealised, renderCard }: ColumnProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const railRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLButtonElement | null>(null);
  const hadFocus = useRef(false);
  const wasFolded = useRef(folded);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(640);
  const [estimate, setEstimate] = useState(CARD_HEIGHT_ESTIMATE);
  const adoptedFor = useRef<readonly BoardCard[] | null>(null);
  const band = folded || !visible ? { start: 0, end: 0 } : realisedBand(scrollTop, viewport, estimate, members.length);

  // Defect AK2-2: on screen means within the columns area's visible width (plus the margin); decided before paint.
  useLayoutEffect(() => {
    const el = rootRef.current;
    const area = container.current;
    if (!el || !area || folded) return;
    const a = area.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const v = r.right >= a.left - HORIZONTAL_MARGIN && r.left <= a.right + HORIZONTAL_MARGIN;
    setVisible((p) => (p === v ? p : v));
  }, [container, revision, folded, members.length]);

  // REQ-TRACE-320: folding a column that holds the focus moves it to the rail; unfolding from the rail lands on the heading.
  useLayoutEffect(() => {
    if (folded !== wasFolded.current) {
      wasFolded.current = folded;
      if (hadFocus.current) { if (folded) railRef.current?.focus(); else headingRef.current?.focus(); }
    }
  }, [folded]);

  // The viewport's real height, read after layout so the band is right on the first paint (REQ-TRACE-360).
  // Defect AK2-2, second half: an OFF-SCREEN column reads no geometry and observes nothing. Bounding the realised
  // cards was not enough — at REQ-TRACE-300's hundred populated columns the per-column work itself was the cost, and
  // a viewport read plus a ResizeObserver registration on every one of a hundred lists is a hundred of each in the
  // commit that switches axis. The column keeps its spacer either way, so its scroll offset still survives
  // (REQ-TRACE-335); it simply costs nothing to be off screen. Both effects re-run when `visible` turns true, which
  // is the frame the column scrolls into view, and the band is right before that frame paints.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || folded || !visible) return;
    if (el.clientHeight > 0) setViewport((v) => (el.clientHeight === v ? v : el.clientHeight));
  }, [folded, visible]);
  useEffect(() => {
    const el = listRef.current;
    if (!el || folded || !visible || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (el.clientHeight > 0) setViewport(el.clientHeight); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [folded, visible]);

  // REQ-TRACE-361: the estimate stands until at least one card has genuinely completed layout; then the measured mean is adopted, once per membership.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || folded || band.end <= band.start || adoptedFor.current === members) return;
    const nodes = el.querySelectorAll<HTMLElement>('[data-req-card]');
    if (nodes.length === 0) return;
    let total = 0;
    for (const n of nodes) total += n.offsetHeight + 8; // the list's gap rides with the card
    const mean = total / nodes.length;
    adoptedFor.current = members;
    if (mean > 0) setEstimate((e) => (Math.abs(mean - e) > 4 ? mean : e));
  }, [members, folded, band.start, band.end]);

  useEffect(() => { onRealised(colKey, folded ? 0 : band.end - band.start); }, [colKey, folded, band.start, band.end, onRealised]);

  // REQ-TRACE-364: revealing a named card scrolls the column to it and realises its band only.
  useLayoutEffect(() => {
    if (revealIndex === null || folded) return;
    const el = listRef.current;
    if (!el) return;
    const top = revealIndex * estimate;
    if (top < el.scrollTop || top + estimate > el.scrollTop + el.clientHeight) { el.scrollTop = Math.max(0, top - estimate); setScrollTop(el.scrollTop); }
  }, [revealIndex, folded, estimate]);

  const dragState: 'idle' | 'reachable' | 'refused' = drag === null || !drag.droppable ? 'idle' : drag.answer?.reachable ? 'reachable' : 'refused';
  const dragSentence = drag === null || !drag.droppable ? '' : drag.answer === undefined ? 'Asking the engine…' : drag.answer.reachable ? `${drag.answer.glyph} ${drag.answer.consequence ?? 'Reachable.'}` : `${drag.answer.glyph} ${drag.answer.reason ?? 'Refused.'}`;

  if (folded) {
    const railTitle = count === 0 ? `${label} · ${count}. ${emptySentence}` : `${label} · ${count}`;
    return (
      <button
        ref={railRef}
        type="button"
        className={`req-rail${drag !== null && drag.droppable ? ' is-dragging' : ''}`}
        data-testid="req-rail"
        data-column={colKey}
        data-drag={dragState}
        aria-label={railAccessibleName(label, count)}
        aria-description={drag !== null && drag.droppable ? dragSentence : railTitle}
        title={drag !== null && drag.droppable ? `${railTitle} — ${dragSentence}` : railTitle}
        onClick={() => onFold(colKey, false)}
        onFocus={() => { hadFocus.current = true; }}
        onBlur={() => { hadFocus.current = false; }}
        onDragEnter={(event) => { if (drag !== null && [...event.dataTransfer.types].includes(PRIVATE_TRANSFER_TYPE)) { event.preventDefault(); onDragHover(colKey, true); } }}
        onDragOver={(event) => { if (drag !== null && [...event.dataTransfer.types].includes(PRIVATE_TRANSFER_TYPE)) event.preventDefault(); }}
      >
        <span className="req-rail__glyph" aria-hidden="true">{dragState === 'idle' ? '›' : drag?.answer?.glyph ?? '…'}</span>
        <span className="req-rail__heading">{label}</span>
        <span className="req-rail__count mono">{count}</span>
        {drag !== null && drag.droppable && <span className="req-rail__hint">{dragSentence}</span>}
      </button>
    );
  }

  const realised = members.slice(band.start, band.end);
  return (
    <section
      ref={rootRef}
      className={`req-column${drag !== null && drag.droppable ? ` is-drop-${dragState}` : ''}`}
      data-testid="req-column"
      data-column={colKey}
      data-count={count}
      data-realised={realised.length}
      data-visible={visible}
      aria-label={`${label} column`}
      aria-description={`${deliveryWord}. ${count} ${count === 1 ? 'requirement' : 'requirements'}.${count === 0 ? ` ${emptySentence}` : ''}`}
      onFocusCapture={() => { hadFocus.current = true; }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hadFocus.current = false; }}
      onDragOver={(event) => {
        if (drag === null || !drag.droppable || ![...event.dataTransfer.types].includes(PRIVATE_TRANSFER_TYPE)) return;
        event.preventDefault();
        // A refused target still takes the drop so the refusal can be shown in words on the card (REQ-TRACE-397/398).
        event.dataTransfer.dropEffect = 'move';
      }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragHover(colKey, false); }}
      onDrop={(event) => {
        if (drag === null || !drag.droppable) return;
        const id = event.dataTransfer.getData(PRIVATE_TRANSFER_TYPE);
        if (id === '') return; // REQ-TRACE-396: only the private type is accepted; plain text from elsewhere is ignored.
        event.preventDefault();
        onDrop(colKey, id);
      }}
    >
      <button
        ref={headingRef}
        type="button"
        className="req-column__heading"
        data-testid="req-heading"
        aria-label={headingAccessibleName(label, count)}
        title={`${label} · ${count} — fold this column`}
        onClick={() => onFold(colKey, true)}
      >
        <span className="card-kicker req-column__label">{label}</span>
        <span className="req-column__count mono" data-testid="req-count">{count}</span>
        <span className="req-column__header-text visually-hidden">{`${label} · ${count}`}</span>
      </button>
      {drag !== null && drag.droppable && (
        <p className={`req-column__drag req-column__drag--${dragState}`} data-testid="req-drag-answer" role="status">{dragSentence}</p>
      )}
      <div ref={listRef} className="req-column__list" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} data-testid="req-list">
        {count === 0
          ? <p className="req-column__empty" data-testid="req-empty-column">{emptySentence}</p>
          : (<>
            {band.start > 0 && <div className="req-column__spacer" style={{ height: band.start * estimate }} aria-hidden="true" />}
            {realised.map((card, i) => <div key={band.start + i} className="req-column__slot" data-index={band.start + i}>{renderCard(card, band.start + i)}</div>)}
            {band.end < members.length && <div className="req-column__spacer" style={{ height: (members.length - band.end) * estimate }} aria-hidden="true" />}
          </>)}
      </div>
    </section>
  );
});
