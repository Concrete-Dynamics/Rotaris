import { useEffect, useRef, useState } from 'react';
import type { ApprovalOption, ApprovalPayload } from '@rotaris/contracts';

/**
 * REQ-TOOLS-063 — the desktop approval prompt, painted inside its own modal window (ADR-0019's
 * asynchronous form; ADR-0048): the headline `Allow <agent> to run <tool>?`, the requester line, a
 * read-only monospace detail box holding the redacted command facet or the argument summary, the
 * fine-print `Matched rule: <rule_id>` with the reason, and exactly three buttons — Deny (danger),
 * Approve for this session (secondary), Approve once (primary). No default action: Enter activates no
 * button; initial focus is on Deny; Escape answers Deny. An undeliverable answer leaves the dialog open
 * with the three buttons disabled and a status line. The structure is the specification's; the language
 * is the design system's (`.dialog`, `.btn-*`, tokens).
 */

/**
 * REQ-CHAT-103's exact sentence for a decision that found no waiting call.
 *
 * The falsified wording, kept beside its replacement (found by Part AC, 2026-09-07): this read "The answer could
 * not be delivered: no run is waiting for this request any more." REQ-TOOLS-063, which this dialog was built to,
 * asks only for "a status line saying the answer could not be delivered" and leaves the wording open, so nothing in
 * that requirement could catch it — but REQ-CHAT-103, which pairs the approval trailer with the question stepper,
 * FIXES the sentence in quotation marks, and the two must be read together because they describe one machinery.
 */
export const APPROVAL_DELIVERY_FAILED = 'Could not deliver the decision. The waiting agent is no longer available.';

export interface ApprovalDialogProps {
  readonly payload: ApprovalPayload;
  readonly othersWaiting: number;
  readonly onAnswer: (option: ApprovalOption) => Promise<{ delivered: boolean }>;
}

export function ApprovalDialog({ payload, othersWaiting, onAnswer }: ApprovalDialogProps) {
  const [busy, setBusy] = useState(false);
  const [undeliverable, setUndeliverable] = useState(false);
  const deny = useRef<HTMLButtonElement>(null);
  const agent = payload.agent_id || payload.persona;
  const detail = payload.command !== '' ? payload.command : payload.argument_summary !== '' ? payload.argument_summary : 'No arguments were reported for this call.';
  const detailKind = payload.command !== '' ? 'command' : 'arguments';

  useEffect(() => { deny.current?.focus(); }, []);

  const answer = async (option: ApprovalOption) => {
    if (busy || undeliverable) return;
    setBusy(true);
    const r = await onAnswer(option);
    if (!r.delivered) { setUndeliverable(true); setBusy(false); }
  };

  useEffect(() => {
    // Escape answers Deny; Enter activates nothing (no default action).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); void answer('deny'); }
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, undeliverable]);

  const disabled = busy || undeliverable;
  return (
    <div className="approval" role="dialog" aria-modal="true" aria-labelledby="approval-title" aria-describedby="approval-detail">
      <div className="dialog approval__dialog">
        <h1 id="approval-title" className="dialog-title">Allow {agent} to run {payload.tool_name}?</h1>
        <p className="dialog-body approval__requester">Requested by {agent} ({payload.persona} persona).</p>
        <pre
          id="approval-detail"
          className="approval__detail mono"
          tabIndex={0}
          aria-label={detailKind === 'command' ? 'The command to run' : 'The call arguments'}
          aria-description={detailKind === 'command' ? 'The command line, with credentials masked.' : 'The call arguments, with credentials masked.'}
        >{detail}</pre>
        <p className="approval__rule text-secondary">
          <span className="mono">Matched rule: {payload.rule_id}</span>
          <br />
          {payload.reason}
        </p>
        {othersWaiting > 0 && <p className="approval__queue text-secondary">{othersWaiting} other request{othersWaiting === 1 ? '' : 's'} waiting.</p>}
        {undeliverable && <p className="approval__status" role="status" data-testid="approval-failure">{APPROVAL_DELIVERY_FAILED}</p>}
        <div className="dialog-actions approval__actions">
          <button ref={deny} type="button" className="btn btn-danger" disabled={disabled} onClick={() => { void answer('deny'); }}>Deny</button>
          <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => { void answer('session'); }}>Approve for this session</button>
          <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => { void answer('once'); }}>Approve once</button>
        </div>
      </div>
    </div>
  );
}
