import type { BoardProjection, ReqId } from '@rotaris/contracts';
import { blockedHeading, blockedRows, columnLabel } from '@rotaris/ui-core';

/**
 * Part AK2 — the blocked summary (REQ-TRACE-240/241): above the columns scroll area, reachable without scrolling
 * any column. A heading with the TRUE total, one row per blocked requirement (at most twenty) labelled by identifier
 * and the engine's own reason without the word "blocked" the heading already said, every reason verbatim in the
 * accessible description, two controls per row in order — first the move that addresses the block (the return to
 * the state it came from, its only legal move), then navigation to the card — and, past twenty, one final row
 * stating how many were not listed that filters the board to the blocked requirements. Text and a glyph carry the
 * condition, never colour alone (REQ-TRACE-241). Rendered only when something is blocked.
 */
export interface BlockedStripProps {
  readonly blocked: BoardProjection['blocked'];
  readonly onResume: (id: ReqId) => void;
  readonly onNavigate: (id: ReqId) => void;
  readonly onFilterToBlocked: () => void;
}

export function BlockedStrip({ blocked, onResume, onNavigate, onFilterToBlocked }: BlockedStripProps) {
  if (blocked.length === 0) return null;
  const { rows, notListed } = blockedRows(blocked);
  const heading = blockedHeading(blocked.length);
  return (
    <section className="req-blocked" data-testid="req-blocked" aria-label={heading} aria-description={blocked.map((b) => `${b.id}: ${b.reason}`).join(' ')}>
      <h2 className="req-blocked__heading" data-testid="req-blocked-heading"><span className="req-alert__glyph" aria-hidden="true">■</span>{heading}</h2>
      <ul className="req-blocked__rows">
        {rows.map((row) => {
          const returnTo = blocked.find((b) => b.id === row.id)?.returnTo ?? 'backlog';
          return (
            <li key={row.id} className="req-blocked__row" data-testid="req-blocked-row" data-req={row.id}>
              <span className="req-blocked__id mono">{row.id}</span>
              <span className="req-blocked__reason">{row.reason}</span>
              <button type="button" className="btn btn-secondary btn-compact" onClick={() => onResume(row.id)} aria-label={`Resume ${row.id}: return it to ${columnLabel(returnTo)}`} title={`Return ${row.id} to ${columnLabel(returnTo)}, the state it was blocked out of`}>Resume to {columnLabel(returnTo)}</button>
              <button type="button" className="btn btn-ghost btn-compact" onClick={() => onNavigate(row.id)} aria-label={`Go to the card of ${row.id}`}>Go to card</button>
            </li>
          );
        })}
        {notListed > 0 && (
          <li className="req-blocked__row req-blocked__more">
            <button type="button" className="btn btn-ghost btn-compact" data-testid="req-blocked-more" onClick={onFilterToBlocked}>{notListed} more not listed — filter the board to the blocked requirements</button>
          </li>
        )}
      </ul>
    </section>
  );
}
