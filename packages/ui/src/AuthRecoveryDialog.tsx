import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthRecoveryPayload, AuthRecoveryResult } from '@rotaris/contracts';
import { Button as DesignButton } from './design-system/index.js';
import { modelLabel, providerErrorText, recoveryModel, recoveryModelList, recoveryTitle } from './auth-recovery.js';

/**
 * REQ-NOTIFY-072..075, REQ-NOTIFY-079/080, REQ-MONITOR-147 (the 401 note's part C) — the authentication recovery dialog,
 * painted inside its own modal window 560 px wide (ADR-0048: window-modal, like the pause and provider dialogs; main fixes
 * the width). Its title names the model that failed, or the active model where that is unknown; it reproduces the provider's
 * error collapsed and truncated in the failure text colour; its first path lists models from other providers ahead of the
 * rest, each with its provider, and Retry — disabled while the list is empty — pins the chosen one and restarts the run.
 * Cancel (Escape) closes it and does nothing else: the run stays failed and its notice stays on screen.
 *
 * Structure from the specification; craft from the design material's dialogs (the provider auth and question-stepper
 * modals: a title, a body line, single-select option cards, the actions last) and the design system's controls.
 */
export interface AuthRecoveryDialogProps {
  readonly payload: AuthRecoveryPayload;
  readonly onRetry: (modelKey: string) => Promise<AuthRecoveryResult>;
  readonly onCancel: () => void;
}

export const NO_OTHER_MODEL = 'No other configured model can be chosen: add a model on another provider under Settings → Models, or cancel.';

export function AuthRecoveryDialog({ payload, onRetry, onCancel }: AuthRecoveryDialogProps) {
  const title = recoveryTitle(payload);
  const model = recoveryModel(payload);
  const list = useMemo(() => recoveryModelList(payload.models, model), [payload.models, model]);
  const [chosen, setChosen] = useState<string | null>(list[0]?.key ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { document.title = title; }, [title]);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const retry = async () => {
    if (busy || chosen === null) return;
    setBusy(true);
    setError(null);
    const r = await onRetry(chosen);
    if (!r.ok) { setError(r.message); setBusy(false); }
  };

  return (
    <div className="pause auth-recovery" role="alertdialog" aria-modal="true" aria-labelledby="auth-recovery-title" aria-describedby="auth-recovery-body" data-testid="auth-recovery">
      <h1 id="auth-recovery-title" className="dialog-title" data-testid="auth-recovery-title">{title}</h1>
      <p id="auth-recovery-body" className="dialog-body">
        {model === null ? 'The provider refused the credentials.' : <>{model.providerName} refused the credentials for <span className="mono">{model.model}</span>.</>} The session and the draft were kept.
      </p>
      <p className="auth-recovery__error mono" data-testid="auth-recovery-error">{providerErrorText(payload.error)}</p>
      <section className="auth-recovery__path" aria-labelledby="auth-recovery-models">
        <h2 id="auth-recovery-models" className="auth-recovery__heading">Retry with a different model</h2>
        {list.length === 0
          ? <p className="text-secondary" data-testid="auth-recovery-empty">{NO_OTHER_MODEL}</p>
          : (
            <div className="auth-recovery__options" role="radiogroup" aria-labelledby="auth-recovery-models" data-testid="auth-recovery-models">
              {list.map((m, index) => {
                const selected = chosen === m.key;
                return (
                  <DesignButton
                    key={m.key}
                    ref={index === 0 ? first : undefined}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`auth-recovery__option${selected ? ' is-selected' : ''}`}
                    data-value={m.key}
                    data-provider={m.provider}
                    disabled={busy}
                    onClick={() => setChosen(m.key)}
                  >
                    <span className="auth-recovery__option-label">{modelLabel(m)}</span>
                  </DesignButton>
                );
              })}
            </div>
          )}
      </section>
      {busy && <p className="text-secondary" role="status" data-busy>Restarting the run…</p>}
      {error && <p className="composer__error" role="alert" data-testid="auth-recovery-failure">{error}</p>}
      <div className="dialog-actions">
        <DesignButton type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel} title="Escape" data-action="cancel">Cancel</DesignButton>
        <DesignButton type="button" className="btn btn-primary" disabled={busy || list.length === 0 || chosen === null} onClick={() => { void retry(); }} data-action="retry">Retry</DesignButton>
      </div>
    </div>
  );
}
