import { useId, useState } from 'react';
import type { BlockerPayload } from '@rotaris/contracts';
import { PATH_LABELS, blockerPresentation, followAnswer, nothingHolds, type AnswerPath, type DecisionResult } from './presentation.js';
import { Button as DesignButton } from '../../design-system/index.js';

/**
 * Part AP — the blockers pane (spec 08 §Blockers, REQ-TRACE-445..454). The presentation is a function of the blocker
 * value alone (`blockerPresentation`), so the same blocker reads identically here, on the card and in the detail; the
 * four answer paths carry named controls and the precedence the engine's fields decide (REQ-TRACE-448/449); a conflict
 * presents both requirements side by side (REQ-TRACE-450); an answer carries only the chosen option and the engine's
 * refusal is quoted (REQ-TRACE-453/454); no blocker is a positive statement, never an empty pane (REQ-TRACE-447). A
 * resume into `ready` starts a run, so it waits on the launch's disclosure (REQ-TRACE-472): the pane follows it there,
 * says it is waiting as a status with the answers held, and once it is accepted says nothing was refused.
 */
export interface BlockersPaneProps {
  readonly payload: BlockerPayload | null;
  /** The board's one write path; an answer that starts a run comes back held behind the disclosure (REQ-TRACE-472). */
  readonly onAnswer: (option: string) => Promise<DecisionResult>;
  readonly onNavigate: (id: string) => void;
  readonly onOpenRun: (sessionId: string) => void;
  readonly onClose: () => void;
}

export function BlockersPane(p: BlockersPaneProps) {
  const headingId = useId();
  const [refusal, setRefusal] = useState<string | null>(null);
  /** REQ-TRACE-472: the answer is waiting on the launch's disclosure: nothing has been recorded yet, and nothing was refused. */
  const [waiting, setWaiting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pres = p.payload === null ? null : blockerPresentation(p.payload);
  const answer = async (option: string) => {
    setBusy(true);
    const first = await p.onAnswer(option);
    // The answers stay held until the disclosure has been answered; the host re-reads the blocker once it is taken.
    await followAnswer(first, (s) => { setWaiting(s.waiting); setRefusal(s.refusal); });
    setBusy(false);
  };
  if (p.payload === null) return <div className="req-pane req-pane--blockers" role="region" aria-labelledby={headingId}><h2 id={headingId} className="req-pane__title">Blockers</h2><p className="req-pane__lead">Select a requirement to see what is holding it.</p></div>;
  if (pres === null) {
    return (
      <div className="req-pane req-pane--blockers" role="region" aria-labelledby={headingId} data-testid="req-pane-blockers">
        <h2 id={headingId} className="req-pane__title">{p.payload.id}</h2>
        <p className="req-pane__lead" data-testid="req-pane-blockers-none">{nothingHolds(p.payload.id)}</p>
        <div className="dialog-actions"><DesignButton type="button" className="btn btn-secondary" onClick={p.onClose}>Close</DesignButton></div>
      </div>
    );
  }
  const control = (path: AnswerPath) => {
    switch (path) {
      case 'choose': return null; // the options below are the choose path's controls
      case 'navigate': return pres.blockingIds.map((id) => <DesignButton key={id} type="button" className="btn btn-secondary" onClick={() => p.onNavigate(id)} aria-label={`${PATH_LABELS.navigate} ${id}`}>{PATH_LABELS.navigate}: {id}</DesignButton>);
      case 'inspect': return <DesignButton key="inspect" type="button" className="btn btn-secondary" disabled={pres.runSessionId === null} onClick={() => { if (pres.runSessionId !== null) p.onOpenRun(pres.runSessionId); }} aria-label={PATH_LABELS.inspect}>{PATH_LABELS.inspect}</DesignButton>;
      case 'resume': return <DesignButton key="resume" type="button" className="btn btn-primary" disabled={busy} onClick={() => { void answer('resume'); }} aria-label={PATH_LABELS.resume}>{PATH_LABELS.resume}{pres.returnTo === null ? '' : ` (returns to ${pres.returnTo === 'running' ? 'ready' : pres.returnTo})`}</DesignButton>;
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
          {pres.options.map((o) => <DesignButton key={o.key} type="button" className="btn btn-secondary" disabled={busy} onClick={() => { void answer(o.key); }} title={o.consequence ?? undefined} aria-description={o.consequence ?? undefined}>{o.label}{o.consequence === null ? '' : ` — ${o.consequence}`}</DesignButton>)}
        </div>
      )}
      <div className="req-pane__paths" data-testid="req-pane-blockers-paths">{pres.paths.map((path) => control(path))}</div>
      {waiting !== null && <p className="req-pane__notice" role="status" data-testid="req-pane-blockers-waiting">{waiting}</p>}
      {refusal !== null && <p className="req-pane__notice req-pane__notice--error" role="alert" data-testid="req-pane-blockers-refused">{refusal}</p>}
      <div className="dialog-actions"><DesignButton type="button" className="btn btn-secondary" onClick={p.onClose}>Close</DesignButton></div>
    </div>
  );
}
