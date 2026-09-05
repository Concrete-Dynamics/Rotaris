import { useEffect, useId } from 'react';

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
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
      <div className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} data-testid={testId}>
        <h2 id={titleId} className="dialog-title">{title}</h2>
        <p className="dialog-body confirm-dialog__body">{body}</p>
        {lines.length > 0 && <ul className="dialog-body confirm-dialog__lines">{lines.map((line) => <li key={line}>{line}</li>)}</ul>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" autoFocus disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={destructive ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy} onClick={onConfirm}>{busy ? `${confirmLabel}…` : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
