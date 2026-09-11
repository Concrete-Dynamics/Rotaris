import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { BoardCard, Reachability, ReqId } from '@rotaris/contracts';
import { PRIVATE_TRANSFER_TYPE, headingAccessibleName, railAccessibleName, realisedBand } from './model.js';

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
 * viewport" has a second dimension. Defect AK2-2 (ADR-0041's second execution): with vertical virtualisation alone,
 * grouping a 1,500-requirement store by epic realised every one of a hundred columns' bands in one commit — about
 * 1,300 card widgets and a 1.7 s long task — for four columns in view. Three readings followed, each measured and
 * each insufficient: a column decided against the area's box whether it was on screen and realised no card if it was
 * not (151 ms), then an off-screen column read no geometry and registered no `ResizeObserver` (171 ms), then `Column`
 * was memoised so the realised-count bookkeeping of the columns in view stopped re-rendering all hundred (158 ms).
 * The cost that survived all three was building a hundred column subtrees at all. It is defect AK2-3 and it is
 * settled where it belongs — in the VIEW, which builds a `Column` only for the columns lying within the area's own
 * viewport and a sized placeholder for the rest (`visibleColumnBand` in `model.ts`). This component therefore has no
 * visibility of its own to decide any more: a `Column` that exists is on screen, and it realises its band.
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
  /**
   * REQ-TRACE-361: the board's best measured card height, for a column that has measured none of its own yet. The
   * requirement says a column keeps using its estimate until one of ITS cards has genuinely completed layout; it does
   * not say the estimate must be a constant. A card is the same widget in every column, so a mean already measured on
   * this board is a better estimate than the built-in one — and a materially better one: at the built-in 128 a column
   * of fifteen builds eleven cards, adopts the measured mean in the layout effect that follows and throws three away,
   * inside the same update. Five columns of that is fifty-five widgets built to keep forty (defect AK2-3).
   */
  readonly estimateHint: number;
  /** Reports a genuinely measured mean up, so the next column to be built starts from it. */
  readonly onMeasured: (estimate: number) => void;
  readonly onFold: (key: string, folded: boolean) => void;
  readonly onDrop: (key: string, id: ReqId) => void;
  readonly onDragHover: (key: string, hovering: boolean) => void;
  readonly onRealised: (key: string, realised: number) => void;
  readonly renderCard: (card: BoardCard, index: number) => ReactNode;
}

/**
 * Defect AK2-2, third reading, kept because it is right on its own terms. Bounding what a column REALISES did not
 * bound how often a column RE-RENDERS: every column reports its realised count to the view, and the view holds that
 * count in state, so each column in view caused a parent render that re-rendered every column then mounted.
 * Memoised, a parent render whose bookkeeping did not change THIS column costs it nothing. Every prop is either a
 * primitive compared by value, a stable callback, or null while no drag is running.
 */
export const Column = memo(function Column({ colKey, label, count, members, folded, emptySentence, deliveryWord, drag, revealIndex, estimateHint, onMeasured, onFold, onDrop, onDragHover, onRealised, renderCard }: ColumnProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLButtonElement | null>(null);
  const hadFocus = useRef(false);
  const wasFolded = useRef(folded);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(640);
  const [estimate, setEstimate] = useState(estimateHint);
  const adoptedFor = useRef<readonly BoardCard[] | null>(null);
  const band = folded ? { start: 0, end: 0 } : realisedBand(scrollTop, viewport, estimate, members.length);

  // REQ-TRACE-320: folding a column that holds the focus moves it to the rail; unfolding from the rail lands on the heading.
  useLayoutEffect(() => {
    if (folded !== wasFolded.current) {
      wasFolded.current = folded;
      if (hadFocus.current) { if (folded) railRef.current?.focus(); else headingRef.current?.focus(); }
    }
  }, [folded]);

  // The viewport's real height, read after layout so the band is right on the first paint (REQ-TRACE-360). Defect
  // AK2-2's second half guarded both of these on an off-screen column, because a viewport read plus a
  // `ResizeObserver` registration on every one of a hundred lists is a hundred of each in the commit that switches
  // axis. The guard was right and is now subsumed: under AK2-3 an off-screen column is not a `Column` at all, so
  // there is nothing left to guard, and a column that exists pays both once because it is on screen.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || folded) return;
    if (el.clientHeight > 0) setViewport((v) => (el.clientHeight === v ? v : el.clientHeight));
  }, [folded]);
  useEffect(() => {
    const el = listRef.current;
    if (!el || folded || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (el.clientHeight > 0) setViewport(el.clientHeight); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [folded]);

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
    if (mean > 0) { setEstimate((e) => (Math.abs(mean - e) > 4 ? mean : e)); onMeasured(mean); }
  }, [members, folded, band.start, band.end, onMeasured]);

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

  // REQ-TRACE-493, cited here because this is where it is met: the rail is a real `<button>` with its own accessible
  // name (`railAccessibleName`), so it is in the tab sequence and fully operable without a pointer, and the heading it
  // replaces carries `headingAccessibleName` below; the fold moves the focus to whichever of the two now exists, so no
  // fold operation strands it. `requirements-proof`'s `fold` stage reads both names and the rail's computed writing
  // mode off the built DOM — REQ-TRACE-497 forbids rotated text on a rail, and only a measurement can say it is absent.
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
      className={`req-column${drag !== null && drag.droppable ? ` is-drop-${dragState}` : ''}`}
      data-testid="req-column"
      data-column={colKey}
      data-count={count}
      data-realised={realised.length}
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
