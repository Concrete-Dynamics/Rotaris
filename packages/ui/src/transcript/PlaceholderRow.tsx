import { rowRole, rowTime, toolOutcome } from '../TranscriptRows.js';
import { groupSummary } from './project.js';
import type { RowRenderProps } from './types.js';

/**
 * **A placeholder, and it says so.** Part AA owns `transcript/Row.tsx` — the Markdown body, the 52/112 px columns,
 * the four tool outcomes, the reasoning summary, the group header's colour, the delegation header, the stalled
 * indicator and the copy routing. Part Z builds the pool that binds slots to displayed rows, and needs *something*
 * in a slot for its own proof to measure; this is that something, and it is deliberately thin.
 *
 * **The merge of Part AA replaces exactly one line**: `TranscriptPane`'s `renderRow` default becomes AA's `Row`,
 * and this file is deleted. Nothing else in Part Z refers to it.
 *
 * It observes the one rule the seam makes non-negotiable: it is a PURE function of its props and holds no state of
 * its own, because the pool empties and rebinds slots and state inside a row would survive the rebind.
 */
export function PlaceholderRow({ display, expanded, onToggle, match }: RowRenderProps) {
  if (display.shape === 'trailer') {
    const t = display.trailer;
    return (
      <article className={`row row--${t.sort}`} data-request-id={t.requestId} data-shape="trailer">
        <header className="row__head"><span className="row__role">{t.role}</span></header>
        <div className="row__body">{t.text}</div>
      </article>
    );
  }
  if (display.shape === 'group') {
    const summary = groupSummary(display.family, display.counts);
    return (
      <article className="row row--group" data-shape="group" data-family={display.family} data-members={display.members.length}>
        <button type="button" className="tool__header mono" aria-expanded={expanded} aria-description={summary} onClick={onToggle}>
          <span className="tool__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          <span className="tool__name">{summary}</span>
        </button>
      </article>
    );
  }
  const row = display.row;
  const outcome = toolOutcome(row);
  const expandable = (row.input !== undefined && row.input !== '') || (row.output !== undefined && row.output !== '');
  return (
    <article className={`row row--${row.kind}${row.settled ? '' : ' row--streaming'}`} data-shape="row" data-index={row.index} data-settled={row.settled} data-agent={row.name} data-match={match === null ? undefined : `${match.start}-${match.end}`} data-stalled={row.stalledSince === undefined ? undefined : '1'}>
      <header className="row__head">
        <span className="row__role">{rowRole(row)}</span>
        <time className="row__time mono" dateTime={row.at}>{row.ts || rowTime(row.at)}</time>
      </header>
      {row.kind === 'tool' || row.kind === 'verifier' ? (
        <button type="button" className={`tool__header mono${expandable ? '' : ' tool__header--static'}`} onClick={onToggle} aria-expanded={expandable ? expanded : undefined} disabled={!expandable}>
          <span className="tool__chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          <span className="tool__name">{row.body}</span>
          {outcome.text !== '' && <span className={`tool__outcome tool__outcome--${outcome.state}`}>{outcome.text}</span>}
        </button>
      ) : (
        <div className={`row__body${row.kind === 'diff' ? ' mono row__body--diff' : ''}`}>{row.body}</div>
      )}
      {expanded && expandable && (
        <div className="tool__card">
          {row.input !== undefined && row.input !== '' && (<><div className="tool__caption">INPUT</div><pre className="tool__pre mono">{row.input}</pre></>)}
          {row.output !== undefined && row.output !== '' && (<><div className="tool__caption">OUTPUT</div><pre className="tool__pre mono">{row.output}</pre></>)}
        </div>
      )}
    </article>
  );
}
