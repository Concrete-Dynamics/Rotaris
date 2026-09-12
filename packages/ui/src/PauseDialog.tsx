import { useEffect, useRef, useState } from 'react';
import type { PausePayload, PauseResolution } from '@rotaris/contracts';
import { Button as DesignButton } from './design-system/index.js';

/**
 * REQ-ORCH-086 / REQ-SESSION-109: the message-limit pause, painted inside its own modal window (ADR-0048):
 * the count reached, the limit in force, the input and output tokens as separately identifiable figures,
 * and exactly three actions — Continue (default, Enter), Double the limit, Cancel the run (Escape). Every
 * action is a labelled button reachable from the keyboard at the minimum window size. Structure from the
 * specification; language from the design system.
 */
export interface PauseDialogProps {
  readonly payload: PausePayload;
  readonly onResolve: (action: PauseResolution) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

export function PauseDialog({ payload, onResolve }: PauseDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const resolve = async (action: PauseResolution) => {
    if (busy) return;
    setBusy(true);
    const r = await onResolve(action);
    if (!r.ok) { setError(r.reason); setBusy(false); }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); void resolve('continue'); }
      if (e.key === 'Escape') { e.preventDefault(); void resolve('cancel'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const limitText = payload.limit === null ? 'no limit recorded' : `${payload.limit}`;
  return (
    <div className="pause" role="alertdialog" aria-modal="true" aria-labelledby="pause-title" aria-describedby="pause-body">
      <h1 id="pause-title" className="dialog-title">Run paused at the message limit</h1>
      <p id="pause-body" className="dialog-body">
        The run reached <strong>{payload.count}</strong> message{payload.count === 1 ? '' : 's'} against a limit of <strong>{limitText}</strong>. Continue and the counter keeps accumulating; double the limit for this session only; or cancel the run.
      </p>
      <dl className="pause__figures mono" aria-label="Figures">
        <div><dt>Messages</dt><dd data-figure="count">{payload.count}</dd></div>
        <div><dt>Limit in force</dt><dd data-figure="limit">{limitText}</dd></div>
        <div><dt>Input tokens</dt><dd data-figure="input">{payload.tokens.input}</dd></div>
        <div><dt>Output tokens</dt><dd data-figure="output">{payload.tokens.output}</dd></div>
      </dl>
      {error && <p className="composer__error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <DesignButton ref={first} type="button" className="btn btn-primary" disabled={busy} onClick={() => { void resolve('continue'); }} title="Enter">Continue</DesignButton>
        <DesignButton type="button" className="btn btn-secondary" disabled={busy} onClick={() => { void resolve('double'); }}>Double the limit</DesignButton>
        <DesignButton type="button" className="btn btn-danger" disabled={busy} onClick={() => { void resolve('cancel'); }} title="Escape">Cancel the run</DesignButton>
      </div>
    </div>
  );
}
