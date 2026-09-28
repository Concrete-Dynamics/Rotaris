import { useEffect, useId, useState } from 'react';
import type { AgentRecord } from '@rotaris/contracts';
import { cancelConfirmation } from './agents.js';
import { Button as DesignButton } from './design-system/index.js';

/**
 * The design system's confirmation contract (docs/design/system, feedback): a title, a body, optional facts as a
 * list, Cancel as the DEFAULT (focused, and Escape), and one confirm — destructive when the action discards work.
 * REQ-GIT-117 relies on every dismissal path resolving to "do not delete", so closing by any route calls `onCancel`.
 */
export interface ConfirmDialogProps {
  readonly title: string;
  readonly body: string;
  readonly lines?: readonly string[] | undefined;
  readonly confirmLabel: string;
  readonly cancelLabel?: string | undefined;
  readonly destructive?: boolean | undefined;
  readonly busy?: boolean | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly testId?: string | undefined;
}

export function ConfirmDialog({ title, body, lines = [], confirmLabel, cancelLabel = 'Cancel', destructive = false, busy = false, onConfirm, onCancel, testId }: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);
  // WAI-ARIA's dialog pattern: focus goes back to the control that opened the dialog when it closes, by any route. The
  // opener is read on the first render, before `autoFocus` moves focus into the dialog at commit.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  useEffect(() => () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); }, [opener]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <div className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} data-testid={testId}>
        <h2 id={titleId} className="dialog-title">{title}</h2>
        <p id={bodyId} className="dialog-body confirm-dialog__body">{body}</p>
        {lines.length > 0 && <ul className="dialog-body confirm-dialog__lines">{lines.map((line) => <li key={line}>{line}</li>)}</ul>}
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" autoFocus disabled={busy} onClick={onCancel}>{cancelLabel}</DesignButton>
          <DesignButton type="button" className={destructive ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy} onClick={onConfirm}>{busy ? `${confirmLabel}…` : confirmLabel}</DesignButton>
        </div>
      </div>
    </div>
  );
}

/**
 * REQ-MONITOR-126/128 and PD-ORCH-005 clause 16 (OQ-74): one agent's cancel confirmation, as the Workspace and a persona
 * window draw it. Every label comes from `cancelConfirmation` — a paused child is dismissed with "Keep it paused", a live
 * agent with "Keep running" — and the props take no label of their own, so a call site cannot override it.
 */
export interface AgentCancelConfirmProps {
  readonly agent: { readonly id: string; readonly name: string };
  readonly agents: readonly AgentRecord[];
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly testId?: string | undefined;
}

export function AgentCancelConfirm({ agent, agents, onConfirm, onCancel, testId }: AgentCancelConfirmProps) {
  return <ConfirmDialog {...cancelConfirmation(agent, agents)} destructive testId={testId} onCancel={onCancel} onConfirm={onConfirm} />;
}
