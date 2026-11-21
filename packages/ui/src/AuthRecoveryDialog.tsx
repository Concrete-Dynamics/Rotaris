import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthRecoveryPayload, AuthRecoveryResult } from '@rotaris/contracts';
import { Button as DesignButton, Input as DesignInput } from './design-system/index.js';
import { canSaveKey, modelLabel, providerErrorText, radioStep, recoveryModel, recoveryModelList, recoveryTitle } from './auth-recovery.js';
import { EXCLUDED_MODEL_HINT } from './model-options.js';
import { InPlaceSignIn, type InPlaceSignInHost } from './sign-in-prompt.js';

/**
 * REQ-NOTIFY-072..077, REQ-NOTIFY-079/080, REQ-MONITOR-147 (the 401 note's parts C and D) — the authentication recovery dialog,
 * painted inside its own modal window 560 px wide (ADR-0048: window-modal, like the pause and provider dialogs; main fixes
 * the width). Its title names the model that failed, or the active model where that is unknown; it reproduces the provider's
 * error collapsed and truncated in the failure text colour; its first path lists models from other providers ahead of the
 * rest, each with its provider, and Retry — disabled while the list is empty — pins the chosen one and restarts the run.
 * Its second path re-authenticates the provider that failed (REQ-NOTIFY-076): for a key-based provider a masked key field
 * with Save and retry, enabled only while the field is non-blank; for a device-code or browser provider, and the tool
 * installed on the machine, that provider's own sign-in started in place — the prompt main holds, a control that ends
 * the wait — and the control confirming it has been completed, which restarts the run; for one whose key the model
 * configuration carries, the sentence saying so. No path directs the user to a shell, a terminal or a separate program.
 * Cancel (Escape) closes it and does nothing else: the run stays failed and its notice stays on screen.
 *
 * Structure from the specification; craft from the design material's dialogs (the provider auth and question-stepper
 * modals: a title, a body line, single-select option cards, the actions last) and the design system's controls.
 */
export interface AuthRecoveryDialogProps {
  readonly payload: AuthRecoveryPayload;
  readonly onRetry: (modelKey: string) => Promise<AuthRecoveryResult>;
  readonly onReauthenticate: (apiKey: string) => Promise<AuthRecoveryResult>;
  /** REQ-NOTIFY-076: the confirming control of a provider signed in to by its own flow. */
  readonly onConfirm?: (() => Promise<AuthRecoveryResult>) | undefined;
  /** The in-place sign-in's commands; absent, an `interactive` provider shows its sentence alone. */
  readonly signIn?: InPlaceSignInHost | undefined;
  readonly onCancel: () => void;
}

export const CONFIRM_AND_RETRY_LABEL = 'Signed in — retry';
export const NO_OTHER_MODEL = 'No other configured model can be chosen: add a model on another provider under Settings → Models, or cancel.';

export function AuthRecoveryDialog({ payload, onRetry, onReauthenticate, onConfirm, signIn, onCancel }: AuthRecoveryDialogProps) {
  const title = recoveryTitle(payload);
  const model = recoveryModel(payload);
  const list = useMemo(() => recoveryModelList(payload.models, model), [payload.models, model]);
  const [chosen, setChosen] = useState<string | null>(list[0]?.key ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const options = useRef(new Map<string, HTMLButtonElement>());
  // The radio group's keyboard (`radioStep`): the arrow keys, Home and End move the choice and the focus with it.
  const onOptionsKey = (e: { key: string; preventDefault: () => void }) => {
    const next = radioStep(list.map((m) => m.key), chosen, e.key);
    if (next === null || busy) return;
    e.preventDefault();
    setChosen(next);
    options.current.get(next)?.focus();
  };
  useEffect(() => { document.title = title; }, [title]);
  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); if (signingIn) signIn?.onCancelSignIn(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel, signingIn, signIn]);

  const retry = async () => {
    if (busy || chosen === null) return;
    setBusy(true);
    setError(null);
    const r = await onRetry(chosen);
    if (!r.ok) { setError(r.message); setBusy(false); }
  };

  const reauthenticate = async () => {
    if (busy || !canSaveKey(apiKey)) return;
    setBusy(true);
    setError(null);
    const r = await onReauthenticate(apiKey);
    if (!r.ok) { setError(r.message); setBusy(false); }
  };

  const confirm = async () => {
    if (busy || !onConfirm) return;
    setBusy(true);
    setError(null);
    const r = await onConfirm();
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
            <div className="auth-recovery__options" role="radiogroup" aria-labelledby="auth-recovery-models" data-testid="auth-recovery-models" onKeyDown={onOptionsKey}>
              {list.map((m, index) => {
                const selected = chosen === m.key;
                return (
                  <DesignButton
                    key={m.key}
                    ref={(el: HTMLButtonElement | null) => {
                      if (el === null) options.current.delete(m.key); else options.current.set(m.key, el);
                      if (index === 0) first.current = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    className={`auth-recovery__option${selected ? ' is-selected' : ''}`}
                    data-value={m.key}
                    data-provider={m.provider}
                    // A hinted option is named by its label alone and described by its hint, as a select row is, so its name
                    // is never the label and the reason run together.
                    aria-labelledby={m.excluded === true ? `auth-recovery-option-${index}-label` : undefined}
                    aria-describedby={m.excluded === true ? `auth-recovery-option-${index}-hint` : undefined}
                    disabled={busy}
                    onClick={() => setChosen(m.key)}
                  >
                    <span className="auth-recovery__option-label" id={m.excluded === true ? `auth-recovery-option-${index}-label` : undefined}>{modelLabel(m)}</span>
                    {/* REQ-MONITOR-194: a pair the session holds out of quota is listed with the reason and stays choosable;
                      * choosing it clears the exclusion (`Sessions.restartAfterAuthFailure`). */}
                    {m.excluded === true && <span className="auth-recovery__option-hint" id={`auth-recovery-option-${index}-hint`} data-testid="auth-recovery-excluded">{EXCLUDED_MODEL_HINT}</span>}
                  </DesignButton>
                );
              })}
            </div>
          )}
      </section>
      <section className="auth-recovery__path" aria-labelledby="auth-recovery-reauth" data-testid="auth-recovery-reauth" data-method={payload.reauth.method}>
        <h2 id="auth-recovery-reauth" className="auth-recovery__heading">Re-authenticate {payload.reauth.providerName}</h2>
        <p className="text-secondary" data-testid="auth-recovery-reauth-message">{payload.reauth.message}</p>
        {payload.reauth.method === 'api-key' && (
          <div className="auth-recovery__key">
            <DesignInput id="auth-recovery-key" className="input mono" type="password" autoComplete="off" value={apiKey} disabled={busy} onChange={(e) => setApiKey(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void reauthenticate(); } }} aria-label={`New API key for ${payload.reauth.providerName}`} data-testid="auth-recovery-key" />
            <DesignButton type="button" className="btn btn-secondary" disabled={busy || !canSaveKey(apiKey)} onClick={() => { void reauthenticate(); }} data-action="save-and-retry">Save and retry</DesignButton>
          </div>
        )}
        {payload.reauth.method === 'interactive' && signIn !== undefined && onConfirm !== undefined && (
          <div className="auth-recovery__sign-in">
            <InPlaceSignIn providerName={payload.reauth.providerName} host={signIn} disabled={busy} onBusy={setSigningIn} onSignedIn={() => { void confirm(); }} />
            {!signingIn && <DesignButton type="button" className="btn btn-secondary" disabled={busy} title={`Restart the run on the same model, once ${payload.reauth.providerName} is signed in.`} onClick={() => { void confirm(); }} data-action="confirm-and-retry">{CONFIRM_AND_RETRY_LABEL}</DesignButton>}
          </div>
        )}
      </section>
      {busy && <p className="text-secondary" role="status" data-busy>Restarting the run…</p>}
      {error && <p className="composer__error" role="alert" data-testid="auth-recovery-failure">{error}</p>}
      <div className="dialog-actions">
        <DesignButton type="button" className="btn btn-secondary" disabled={busy} onClick={() => { if (signingIn) signIn?.onCancelSignIn(); onCancel(); }} title="Escape" data-action="cancel">Cancel</DesignButton>
        <DesignButton type="button" className="btn btn-primary" disabled={busy || signingIn || list.length === 0 || chosen === null} onClick={() => { void retry(); }} data-action="retry">Retry</DesignButton>
      </div>
    </div>
  );
}
