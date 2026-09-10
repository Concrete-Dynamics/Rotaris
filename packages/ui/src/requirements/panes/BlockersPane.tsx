import { useId, useState } from 'react';
import type { BlockerPayload } from '@rotaris/contracts';
import { PATH_LABELS, blockerPresentation, nothingHolds, type AnswerPath } from './presentation.js';

/**
 * Part AP — the blockers pane (spec 08 §Blockers, REQ-TRACE-445..454). The presentation is a function of the blocker
 * value alone (`blockerPresentation`), so the same blocker reads identically here, on the card and in the detail; the
 * four answer paths carry named controls and the precedence the engine's fields decide (REQ-TRACE-448/449); a conflict
 * presents both requirements side by side (REQ-TRACE-450); an answer carries only the chosen option and the engine's
 * refusal is quoted (REQ-TRACE-453/454); no blocker is a positive statement, never an empty pane (REQ-TRACE-447).
 */
export interface BlockersPaneProps {
  readonly payload: BlockerPayload | null;
  readonly onAnswer: (option: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onNavigate: (id: string) => void;
  readonly onOpenRun: (sessionId: string) => void;
  readonly onClose: () => void;
}

export function BlockersPane(p: BlockersPaneProps) {
  const headingId = useId();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pres = p.payload === null ? null : blockerPresentation(p.payload);
  const answer = async (option: string) => { setBusy(true); const r = await p.onAnswer(option); setBusy(false); setRefusal(r.ok ? null : r.reason); };
  if (p.payload === null) return <div className="req-pane req-pane--blockers" role="region" aria-labelledby={headingId}><h2 id={headingId} className="req-pane__title">Blockers</h2><p className="req-pane__lead">Select a requirement to see what is holding it.</p></div>;
  if (pres === null) {
    return (
      <div className="req-pane req-pane--blockers" role="region" aria-labelledby={headingId} data-testid="req-pane-blockers">
        <h2 id={headingId} className="req-pane__title">{p.payload.id}</h2>
        <p className="req-pane__lead" data-testid="req-pane-blockers-none">{nothingHolds(p.payload.id)}</p>
        <div className="dialog-actions"><button type="button" className="btn btn-secondary" onClick={p.onClose}>Close</button></div>
      </div>
    );
  }
  const control = (path: AnswerPath) => {
    switch (path) {
      case 'choose': return null; // the options below are the choose path's controls
      case 'navigate': return pres.blockingIds.map((id) => <button key={id} type="button" className="btn btn-secondary" onClick={() => p.onNavigate(id)} aria-label={`${PATH_LABELS.navigate} ${id}`}>{PATH_LABELS.navigate}: {id}</button>);
      case 'inspect': return <button key="inspect" type="button" className="btn btn-secondary" disabled={pres.runSessionId === null} onClick={() => { if (pres.runSessionId !== null) p.onOpenRun(pres.runSessionId); }} aria-label={PATH_LABELS.inspect}>{PATH_LABELS.inspect}</button>;
      case 'resume': return <button key="resume" type="button" className="btn btn-primary" disabled={busy} onClick={() => { void answer('resume'); }} aria-label={PATH_LABELS.resume}>{PATH_LABELS.resume}{pres.returnTo === null ? '' : ` (returns to ${pres.returnTo === 'running' ? 'ready' : pres.returnTo})`}</button>;
    }
  };
  return (
    <div className="req-pane req-pane--blockers" role="region" aria-labelledby={headingId} data-testid="req-pane-blockers">
      <h2 id={headingId} className="req-pane__title">{p.payload.id}: {pres.heading}</h2>
      <p className="req-pane__lead">{pres.lead}</p>
      <p className="req-pane__reason" data-testid="req-pane-blockers-reason">{pres.reason}</p>
      {pres.sideBySide && (
        <div className="req-pane__side-by-side" data-testid="req-pane-blockers-conflict">
          <div className="req-pane__element"><span className="req-pane__label">This requirement</span><span className="req-pane__mono">{p.payload.id}</span></div>
          {pres.blockingIds.map((id) => <div key={id} className="req-pane__element"><span className="req-pane__label">Conflicts with</span><span className="req-pane__mono">{id}</span></div>)}
        </div>
      )}
      {pres.options.length > 0 && (
        <div className="req-pane__options" role="group" aria-label={PATH_LABELS.choose}>
          <span className="req-pane__kicker">{PATH_LABELS.choose}</span>
          {pres.options.map((o) => <button key={o.key} type="button" className="btn btn-secondary" disabled={busy} onClick={() => { void answer(o.key); }} title={o.consequence ?? undefined} aria-description={o.consequence ?? undefined}>{o.label}{o.consequence === null ? '' : ` — ${o.consequence}`}</button>)}
        </div>
      )}
      <div className="req-pane__paths" data-testid="req-pane-blockers-paths">{pres.paths.map((path) => control(path))}</div>
      {refusal !== null && <p className="req-pane__notice req-pane__notice--error" role="alert" data-testid="req-pane-blockers-refused">{refusal}</p>}
      <div className="dialog-actions"><button type="button" className="btn btn-secondary" onClick={p.onClose}>Close</button></div>
    </div>
  );
}
