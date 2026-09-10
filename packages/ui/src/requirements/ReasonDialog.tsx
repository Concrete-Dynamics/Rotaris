import { useEffect, useId, useState } from 'react';

/**
 * Part AK2 — the one text a move needs from the person before the engine will take it: a hold's reason and a
 * send-back's instructions (REQ-TRACE-389, 423). The design system's dialog contract (title, body, Cancel as the
 * default, one confirm), with a single field; an empty text is refused in the dialog with the stated sentence
 * rather than sent for the engine to refuse, so nothing is written and the person keeps what they typed
 * (REQ-TRACE-498 "what the user typed is kept").
 */
export interface ReasonDialogProps {
  readonly title: string;
  readonly prompt: string;
  readonly consequence?: string | undefined;
  readonly refusal: string;
  readonly confirmLabel: string;
  readonly onConfirm: (text: string) => void;
  readonly onCancel: () => void;
}

export function ReasonDialog({ title, prompt, consequence, refusal, confirmLabel, onConfirm, onCancel }: ReasonDialogProps) {
  const titleId = useId();
  const fieldId = useId();
  const [text, setText] = useState('');
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const submit = () => { if (text.trim() === '') { setRefused(true); return; } onConfirm(text); };
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="dialog req-reason" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="req-reason-dialog">
        <h2 id={titleId} className="dialog-title">{title}</h2>
        <p className="dialog-body">{prompt}</p>
        {consequence && <p className="dialog-body req-reason__consequence">{consequence}</p>}
        <div className="field">
          <label className="field-label" htmlFor={fieldId}>{title}</label>
          <textarea id={fieldId} className="input" rows={4} autoFocus value={text} onChange={(event) => { setText(event.currentTarget.value); setRefused(false); }} />
        </div>
        {refused && <p className="req-reason__refusal" role="alert">{refusal}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
