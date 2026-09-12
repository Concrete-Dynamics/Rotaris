import { useId, useState } from 'react';
import type { BoardAction, ReviewPayload } from '@rotaris/contracts';
import { ConfirmDialog } from '../../ConfirmDialog.js';
import { CLAIM_ATTRIBUTION, CLAIM_HEADING, MEASUREMENT_ATTRIBUTION, MEASUREMENT_HEADING, RELOAD_REVIEW, REVIEW_BUSY, REVIEW_READING, WORK_HEADING, reviewDecisions, reviewElementDescription, reviewElements, type ReviewElement, type ReviewLink } from './presentation.js';
import { Button as DesignButton, Tag as DesignTag, TextArea as DesignTextArea } from '../../design-system/index.js';

/**
 * Part AP — the review pane (spec 08 §Review Surface, REQ-TRACE-417..426). Structure from the specification: the
 * twelve elements in REQ-TRACE-420's order across the claim, measurement and work sides, the two heading constants
 * with their attributions (REQ-TRACE-419), the six decisions as data in REQ-TRACE-422's order. Craft from the mockup's
 * `Review view` modal (docs/design/README.md §7): the identifier in the mono face beside the title, a state tag, kickers
 * naming sections, paths and hashes in the mono face, evidence as dot-led rows, a one-sentence footer beside the
 * decisions. Tokens by name (the Part AP section of `shell.css`); the pane draws no container the design does not draw.
 */
export type ReviewNavigate = (link: ReviewLink) => void;
export interface ReviewPaneProps {
  readonly id: string;
  /** `reading` while the read is outstanding (REQ-TRACE-425); a payload with `refusal` names why there is nothing to review (REQ-TRACE-424). */
  readonly payload: ReviewPayload | 'reading' | null;
  readonly error?: string | undefined;
  /** REQ-TRACE-422: the decision's consequence for the branch and the worktree, stated before it is taken; the engine's sentence. */
  readonly consequenceOf: (action: BoardAction) => string;
  /** The board's one write path; a refusal comes back in the engine's words (REQ-TRACE-423/432). */
  readonly onDecision: (action: BoardAction, payload?: Readonly<Record<string, string>>) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onReload: () => void;
  readonly onNavigate: ReviewNavigate;
  readonly onClose: () => void;
  /** REQ-TRACE-425: a second read asked for while one is outstanding is refused, not started — the host reports it here. */
  readonly busy?: boolean | undefined;
}

export function ReviewPane(p: ReviewPaneProps) {
  const titleId = useId();
  const [pending, setPending] = useState<BoardAction | null>(null);
  const [instructions, setInstructions] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [decided, setDecided] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const payload = p.payload === 'reading' || p.payload === null ? null : p.payload;
  const elements = payload === null || payload.refusal !== undefined ? [] : reviewElements(payload);
  const decide = async (action: BoardAction) => {
    setInFlight(true);
    const r = await p.onDecision(action, action === 'send-back' ? { instructions } : undefined);
    setInFlight(false);
    setPending(null);
    if (!r.ok) { setRefusal(r.reason); return; }
    setRefusal(null);
    // REQ-TRACE-426: any decision relocates the requirement; the payload is out of date, and the one action offered is the reload.
    setDecided(`${labelOf(action)} recorded for ${p.id}. The review you were reading is out of date.`);
  };
  const side = (name: string, heading: string, attribution: string | null) => {
    const own = elements.filter((e) => e.side === name);
    if (own.length === 0) return null;
    return (
      <section className="req-pane__side" aria-label={heading}>
        <h3 className="req-pane__kicker">{heading}</h3>
        {attribution !== null && <p className="req-pane__attribution">{attribution}</p>}
        {own.map((e) => <Element key={e.key} element={e} heading={heading} onNavigate={p.onNavigate} />)}
      </section>
    );
  };
  return (
    <div className="req-pane req-pane--review" role="region" aria-labelledby={titleId} data-testid="req-pane-review">
      <header className="req-pane__header">
        <span className="req-pane__id">{p.id}</span>
        <h2 id={titleId} className="req-pane__title">{payload?.title ?? 'Review'} — review delivery</h2>
        {payload !== null && <DesignTag className="tag tag-wait req-pane__state">{payload.column}</DesignTag>}
        <DesignButton type="button" className="btn btn-secondary req-pane__close" onClick={p.onClose} aria-label="Close the review">Close</DesignButton>
      </header>
      {p.payload === 'reading' && <p className="req-pane__status" role="status">{REVIEW_READING}</p>}
      {p.busy && <p className="req-pane__status" role="status">{REVIEW_BUSY}</p>}
      {p.error !== undefined && <p className="req-pane__notice req-pane__notice--error" role="alert">{p.error}</p>}
      {payload?.refusal !== undefined && <p className="req-pane__notice" role="status" data-testid="req-pane-review-refusal">{payload.refusal}</p>}
      {payload !== null && payload.refusal === undefined && (
        <>
          {/* REQ-TRACE-419: the top-of-surface sentence on a completion claim. */}
          <p className="req-pane__lead" data-testid="req-pane-review-completion">{payload.claim.completion.statement}</p>
          <div className="req-pane__sides">
            {side('claim', CLAIM_HEADING, CLAIM_ATTRIBUTION)}
            {side('measurement', MEASUREMENT_HEADING, MEASUREMENT_ATTRIBUTION)}
            {side('work', WORK_HEADING, null)}
          </div>
        </>
      )}
      {decided !== null ? (
        <div className="req-pane__notice" role="status" data-testid="req-pane-review-decided">
          <span>{decided}</span>
          <DesignButton type="button" className="btn btn-primary" onClick={() => { setDecided(null); p.onReload(); }}>{RELOAD_REVIEW}</DesignButton>
        </div>
      ) : payload !== null && payload.refusal === undefined && (
        <footer className="req-pane__decisions" data-testid="req-pane-review-decisions">
          <span className="req-pane__footnote">Each decision states what it does to the branch and the worktree before it is taken.</span>
          {reviewDecisions().map((d) => <DesignButton key={d.action} type="button" className={d.action === 'accept' ? 'btn btn-primary' : d.action === 'reject' ? 'btn btn-danger' : 'btn btn-secondary'} disabled={inFlight} onClick={() => setPending(d.action)} aria-label={`${d.label} ${p.id}`}>{d.label}</DesignButton>)}
        </footer>
      )}
      {refusal !== null && <p className="req-pane__notice req-pane__notice--error" role="alert" data-testid="req-pane-review-refused">{refusal}</p>}
      {pending !== null && pending !== 'send-back' && (
        <ConfirmDialog title={`${labelOf(pending)} ${p.id}`} body={p.consequenceOf(pending)} confirmLabel={labelOf(pending)} destructive={pending === 'reject'} busy={inFlight} onConfirm={() => { void decide(pending); }} onCancel={() => setPending(null)} testId="req-pane-review-confirm" />
      )}
      {pending === 'send-back' && (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog req-pane__dialog" role="dialog" aria-modal="true" aria-label={`Send ${p.id} back with instructions`}>
            <h2 className="dialog-title">Send the agent back</h2>
            <p className="dialog-body">{p.consequenceOf('send-back')}</p>
            <label className="field"><span className="field-label">Instructions for the next run</span>
              <DesignTextArea className="input req-pane__textarea" value={instructions} onChange={(e) => setInstructions(e.target.value)} aria-label="Instructions for the next run" placeholder="What the next run must do differently. Submitting nothing would repeat the previous run unaltered." /></label>
            <div className="dialog-actions">
              <DesignButton type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={inFlight}>Cancel</DesignButton>
              <DesignButton type="button" className="btn btn-primary" onClick={() => { void decide('send-back'); }} disabled={inFlight}>Send back</DesignButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function labelOf(action: BoardAction): string {
  return reviewDecisions().find((d) => d.action === action)?.label ?? action;
}

/** One element: its label, its lines or its own empty message, and an accessible description equal to what is shown (REQ-TRACE-421); every row's accessible name carries its heading (REQ-TRACE-419). */
function Element({ element, heading, onNavigate }: { element: ReviewElement; heading: string; onNavigate: ReviewNavigate }) {
  const description = reviewElementDescription(element);
  const descId = useId();
  return (
    <div className="req-pane__element" role="group" aria-label={`${heading}: ${element.label}`} aria-describedby={descId} aria-description={description} data-testid={`req-pane-review-${element.key}`}>
      <span className="req-pane__label">{element.label}</span>
      <div id={descId} className={element.lines.length === 0 ? 'req-pane__empty' : 'req-pane__lines'}>
        {element.lines.length === 0 ? element.empty : element.lines.map((line, i) => <span key={i} className={element.key === 'changed-files' || element.key === 'branch-and-worktree' || element.key === 'specification-version' ? 'req-pane__line req-pane__mono' : 'req-pane__line'}>{line}</span>)}
      </div>
      {element.links !== undefined && <div className="req-pane__links">{element.links.map((l) => <DesignButton key={l.label} type="button" className="btn btn-link" onClick={() => onNavigate(l.target)}>{l.label}</DesignButton>)}</div>}
    </div>
  );
}
