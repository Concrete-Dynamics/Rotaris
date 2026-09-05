import { useState } from 'react';
import type { TranscriptRow } from '@rotaris/contracts';
import { markMotionStart } from './motion.js';

/**
 * The ONE transcript row renderer (REQ-CHAT-011/046/047/050/060/061), shared by the Workspace transcript and the
 * persona windows' agent-scoped transcripts (REQ-SHELL-075 b, REQ-MONITOR-071): a `tool` row with its header,
 * outcome, preview and card; every other kind as an article with role, time and body. Moved out of
 * `WorkspaceView.tsx` in Part R so a second surface cannot draw a row differently.
 */
export function rowTime(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
/** REQ-CHAT-011/047: displayed role `you`; an agent row shows its persona; a system row is the product's; a tool row its agent. */
export function rowRole(row: Pick<TranscriptRow, 'kind' | 'persona' | 'name'>): string {
  if (row.kind === 'user') return 'you';
  if (row.kind === 'system') return 'rotaris';
  if (row.kind === 'diff') return 'edit';
  return row.persona ?? row.name ?? row.kind;
}
/** REQ-CHAT-060: `ok · 3.2s`, `failed`, `blocked · 0.0s`, a pulsing `◉ running…`; a value outside the four reads as failed. */
export function toolOutcome(row: Pick<TranscriptRow, 'toolStatus' | 'durationMs' | 'settled'>): { text: string; state: 'running' | 'ok' | 'failed' | 'blocked' | 'none' } {
  const s = row.toolStatus;
  if (s === undefined || s === '') return { text: '', state: 'none' };
  const secs = `${((row.durationMs ?? 0) / 1000).toFixed(1)}s`;
  if (s === 'running') return row.settled ? { text: '', state: 'none' } : { text: '◉ running…', state: 'running' };
  if (s === 'ok') return { text: `ok · ${secs}`, state: 'ok' };
  if (s === 'blocked') return { text: `blocked · ${secs}`, state: 'blocked' };
  return { text: 'failed', state: 'failed' };
}

export function ToolRow({ row }: { row: TranscriptRow }) {
  const [open, setOpen] = useState(false);
  const outcome = toolOutcome(row);
  const expandable = (row.input !== undefined && row.input !== '') || (row.output !== undefined && row.output !== '');
  const description = outcome.state === 'blocked' ? `Blocked: ${row.blockedReason ?? row.output ?? 'the call was not executed'}` : undefined;
  return (
    <article className={`row row--tool tool tool--${outcome.state}${row.settled ? '' : ' row--streaming'}`} data-index={row.index} data-settled={row.settled} data-call-key={row.callKey} data-agent={row.name}>
      <header className="row__head">
        <span className="row__role">{rowRole(row)}</span>
        <time className="row__time mono" dateTime={row.at}>{row.ts || rowTime(row.at)}</time>
      </header>
      <button
        type="button"
        className={`tool__header mono${expandable ? '' : ' tool__header--static'}`}
        onClick={() => { if (expandable) setOpen((o) => !o); }}
        aria-expanded={expandable ? open : undefined}
        aria-description={description}
        disabled={!expandable}
      >
        <span className="tool__chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="tool__name">{row.body}</span>
        {outcome.text && <span ref={(element) => { if (element && outcome.state === 'running') markMotionStart(element); }} className={`tool__outcome tool__outcome--${outcome.state}`}>{outcome.text}</span>}
      </button>
      {!open && expandable && <div className="tool__preview text-secondary mono">⤷ {(row.output ?? row.input ?? '').split('\n')[0]}</div>}
      {open && (
        <div className="tool__card">
          {row.input !== undefined && row.input !== '' && (<><div className="tool__caption">INPUT</div><pre className="tool__pre mono">{row.input}</pre></>)}
          {row.output !== undefined && row.output !== '' && (<><div className="tool__caption">OUTPUT</div><pre className="tool__pre mono">{row.output}</pre></>)}
          {outcome.state === 'blocked' && row.blockedReason && <div className="tool__blocked">{row.blockedReason}</div>}
        </div>
      )}
    </article>
  );
}

export function TranscriptRowView({ row }: { row: TranscriptRow }) {
  if (row.kind === 'tool') return <ToolRow row={row} />;
  return (
    <article className={`row row--${row.kind}${row.settled ? '' : ' row--streaming'}`} data-index={row.index} data-settled={row.settled} data-agent={row.name}>
      <header className="row__head">
        <span className="row__role">{rowRole(row)}</span>
        <time className="row__time mono" dateTime={row.at}>{row.ts || rowTime(row.at)}</time>
        {!row.settled && <span ref={(element) => { if (element) markMotionStart(element); }} className="row__streaming" aria-label="still being written">…</span>}
      </header>
      <div className={`row__body${row.kind === 'diff' ? ' mono row__body--diff' : ''}`}>{row.body}</div>
    </article>
  );
}

/** The rows of one surface, in index order, each drawn by the one renderer. */
export function TranscriptRows({ rows }: { rows: readonly TranscriptRow[] }) {
  return <>{rows.map((r) => <TranscriptRowView key={r.index} row={r} />)}</>;
}
