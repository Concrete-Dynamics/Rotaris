import { useId, useState } from 'react';
import type { BoardCard, DeliveryQueue } from '@rotaris/contracts';
import { CONCURRENCY_CEILING, QUEUE_WORDING, clampConcurrency, queueRows, waitingStatement } from './presentation.js';
import { Button as DesignButton, Checkbox as DesignCheckbox, Input as DesignInput } from '../../design-system/index.js';

/**
 * Part AP — the queue pane (spec 08 §Delivery Queue, REQ-TRACE-478..483): the scheduler's entries in its order with
 * every deferral's reason quoted unaltered; the closed set of four controls — automatic on/off, the concurrency limit
 * capped at 64 by the widget alone, hold/release per requirement, stop (and start) — with REQ-TRACE-482's wording before
 * and after; the empty state with its hint; REQ-TRACE-466's statement and way in for a run waiting on a person.
 */
export interface QueuePaneProps {
  readonly queue: DeliveryQueue;
  readonly cards: readonly BoardCard[];
  readonly onSet: (change: { automatic?: boolean; concurrency?: number; stop?: true; start?: true; hold?: string; release?: string }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** REQ-TRACE-472: an undisclosed launch is started from here through the host's disclosure. */
  readonly onDisclose: (id: string) => void;
  /** REQ-TRACE-466: bring the session into focus. */
  readonly onOpenSession: (sessionId: string) => void;
}

export function QueuePane(p: QueuePaneProps) {
  const headingId = useId();
  const [concurrency, setConcurrency] = useState(String(p.queue.concurrency));
  const [refusal, setRefusal] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const rows = queueRows(p.queue, p.cards);
  const set = async (change: Parameters<QueuePaneProps['onSet']>[0], after?: string) => { const r = await p.onSet(change); setRefusal(r.ok ? null : r.reason); if (r.ok && after !== undefined) setSaid(after); };
  return (
    <div className="req-pane req-pane--queue" role="region" aria-labelledby={headingId} data-testid="req-pane-queue">
      <h2 id={headingId} className="req-pane__title">Delivery queue</h2>
      <div className="req-pane__controls" role="group" aria-label="Queue controls">
        <DesignCheckbox className="check req-pane__control" checked={p.queue.automatic} onChange={(e) => { void set({ automatic: e.target.checked }, e.target.checked ? QUEUE_WORDING.automaticOn : QUEUE_WORDING.automaticOff); }} aria-label="Automatic scheduling" label="Automatic scheduling" />
        <span className="req-pane__hint" data-testid="req-pane-queue-automatic">{p.queue.automatic ? QUEUE_WORDING.automaticOn : QUEUE_WORDING.automaticOff}</span>
        <label className="req-pane__control"><span>Concurrency</span><DesignInput className="input req-pane__number" type="number" min={1} max={CONCURRENCY_CEILING} value={concurrency} onChange={(e) => setConcurrency(e.target.value)} onBlur={() => { const n = clampConcurrency(Number(concurrency)); setConcurrency(String(n)); if (n !== p.queue.concurrency) void set({ concurrency: n }); }} aria-label="Concurrency limit" title={QUEUE_WORDING.concurrency} /></label>
        {p.queue.stopped
          ? <DesignButton type="button" className="btn btn-primary" onClick={() => { void set({ start: true }, 'The queue is started: the scheduler picks candidates up again.'); }} aria-label="Start the queue" title={QUEUE_WORDING.stopped}>Start</DesignButton>
          : <DesignButton type="button" className="btn btn-secondary" onClick={() => { void set({ stop: true }, QUEUE_WORDING.stopped); }} aria-label="Stop the queue" title={QUEUE_WORDING.stop}>Stop</DesignButton>}
        <span className="req-pane__hint" data-testid="req-pane-queue-stop">{p.queue.stopped ? QUEUE_WORDING.stopped : QUEUE_WORDING.stop}</span>
      </div>
      {said !== null && <p className="req-pane__status" role="status">{said}</p>}
      {refusal !== null && <p className="req-pane__notice req-pane__notice--error" role="alert">{refusal}</p>}
      {rows.length === 0 ? <p className="req-pane__empty" data-testid="req-pane-queue-empty">{QUEUE_WORDING.empty}</p> : (
        <ol className="req-pane__queue" aria-label="Queue entries in the scheduler's order">
          {rows.map((r) => (
            <li key={`${r.entry.id}/${r.entry.unit}`} className={`req-pane__queue-row req-pane__queue-row--${r.entry.state}`} data-testid="req-pane-queue-row" data-state={r.entry.state}>
              <span className={`tag ${r.entry.state === 'executing' ? 'tag-run' : r.entry.state === 'next' ? 'tag-accent' : 'tag-neutral'}`}>{r.state}</span>
              <span className="req-pane__mono">{r.entry.id}</span>
              <span className="req-pane__unit">{r.entry.unit}</span>
              {r.reason !== null && <span className="req-pane__reason" data-testid="req-pane-queue-reason">{r.reason}</span>}
              {r.waitingOnPerson && <DesignButton type="button" className="btn btn-link" onClick={() => { if (r.sessionId !== undefined) p.onOpenSession(r.sessionId); }} disabled={r.sessionId === undefined} data-testid="req-pane-queue-waiting">{waitingStatement(r.entry.id, r.entry.unit, r.sessionId)}</DesignButton>}
              {r.entry.state !== 'executing' && (r.undisclosed
                ? <DesignButton type="button" className="btn btn-primary btn-compact" onClick={() => p.onDisclose(r.entry.id)} aria-label={`Show the disclosure and start ${r.entry.id}`}>Disclose and start</DesignButton>
                : /held in the queue/.test(r.reason ?? '')
                  ? <DesignButton type="button" className="btn btn-secondary btn-compact" onClick={() => { void set({ release: r.entry.id }); }} aria-label={`Release ${r.entry.id}`}>Release</DesignButton>
                  : <><DesignButton type="button" className="btn btn-secondary btn-compact" onClick={() => { void set({ hold: r.entry.id }); }} aria-label={`Hold ${r.entry.id}`}>Hold</DesignButton>{r.entry.state === 'deferred' && <DesignButton type="button" className="btn btn-secondary btn-compact" onClick={() => { void set({ release: r.entry.id }); }} aria-label={`Release ${r.entry.id} now`}>Release now</DesignButton>}</>)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
