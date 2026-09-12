import type { BoardCard } from '@rotaris/contracts';
import { NOTHING_OWED, evidenceSegments, evidenceSummary, type EvidenceSegment, type SegmentState } from '@rotaris/ui-core';
import { Button as DesignButton } from '../design-system/index.js';

/**
 * Part AK2 — the evidence indicator (REQ-TRACE-258..264): a ring divided into one segment per obligation the
 * requirement OWES, in the projection's fixed order (`implementation-trace`, `covering-test`, `verification`),
 * each coloured for its state from the theme's semantic status tokens and never a literal (REQ-TRACE-261, 248).
 * Segments start at twelve o'clock, an angular gap separates each from the next, none overlaps, together they close
 * the ring, and a clear margin is left inside the widget's edge so the focus ring never paints over a segment
 * (REQ-TRACE-263). Where nothing is owed the ring is drawn EMPTY — a dashed hairline, nothing that resembles a
 * satisfied one — with the stated reason (REQ-TRACE-260). It is its own tab stop and activatable (REQ-TRACE-264),
 * and its accessible description names every segment and its state (REQ-TRACE-261).
 *
 * The craft is the mockup's: a 16 px ring at the card head's right (`REQUIREMENTS` → Kanban card), the hole the
 * card's own surface. The fourth obligation kind cannot arrive: `evidenceSegments` is closed over the three.
 */
export interface EvidenceIndicatorProps {
  readonly card: BoardCard;
  readonly onOpen: (id: string) => void;
  readonly size?: number | undefined;
}

/** REQ-TRACE-261: segment colours are the theme's semantic status tokens, by state. */
export const SEGMENT_TOKEN: Readonly<Record<SegmentState, string>> = Object.freeze({ satisfied: 'var(--rt-ok)', stale: 'var(--rt-warn)', failed: 'var(--rt-fail)', missing: 'var(--rt-border-strong)' });

const GAP_DEGREES = 14;

/** The arc path of one segment: from `startDeg` clockwise for `sweepDeg`, degrees measured from twelve o'clock. */
export function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const toXY = (deg: number) => { const rad = ((deg - 90) * Math.PI) / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }; };
  const a = toXY(startDeg);
  const b = toXY(startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${a.x.toFixed(3)} ${a.y.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`;
}

/** The segments' angular layout: n equal sweeps with a gap between each, the first beginning at twelve o'clock. */
export function segmentArcs(count: number): readonly { readonly start: number; readonly sweep: number }[] {
  if (count === 0) return [];
  if (count === 1) return [{ start: GAP_DEGREES / 2, sweep: 360 - GAP_DEGREES }];
  const sweep = 360 / count - GAP_DEGREES;
  return Array.from({ length: count }, (_, i) => ({ start: i * (360 / count) + GAP_DEGREES / 2, sweep }));
}

export function EvidenceIndicator({ card, onOpen, size = 16 }: EvidenceIndicatorProps) {
  const segments: readonly EvidenceSegment[] = evidenceSegments(card);
  const summary = evidenceSummary(segments);
  const half = size / 2;
  // REQ-TRACE-263: the margin between the segments and the edge keeps the focus indication off the ring.
  const r = half - 2.5;
  const arcs = segmentArcs(segments.length);
  return (
    <DesignButton
      type="button"
      className="req-evidence"
      data-testid="req-evidence"
      data-segments={segments.map((s) => s.state).join(',')}
      aria-label={`Evidence of ${card.id}: ${summary}`}
      title={summary}
      onClick={(event) => { event.stopPropagation(); onOpen(card.id); }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
    >
      <svg className="req-evidence__ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        {segments.length === 0
          ? <circle cx={half} cy={half} r={r} fill="none" stroke="var(--rt-border)" strokeWidth="1.5" strokeDasharray="2 2" />
          : segments.map((s, i) => <path key={s.kind} d={arcPath(half, half, r, arcs[i]!.start, arcs[i]!.sweep)} fill="none" stroke={SEGMENT_TOKEN[s.state]} strokeWidth="3" strokeLinecap="butt" data-kind={s.kind} data-state={s.state} />)}
      </svg>
      <span className="visually-hidden">{segments.length === 0 ? NOTHING_OWED : summary}</span>
    </DesignButton>
  );
}
