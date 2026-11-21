import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderChoice, ProviderDialogPayload, ProviderSignInPrompt, ProviderSignInResult } from '@rotaris/contracts';
import { OAUTH_INSTRUCTION, SignInPromptView, signInKindOf, useSignInPrompt } from './sign-in-prompt.js';
import { Button as DesignButton, Card as DesignCard, Input as DesignInput, Select as DesignSelect } from './design-system/index.js';

/**
 * REQ-PROVIDER-116/117 — the provider authentication window (ADR-0048, its own modal window like the
 * approval and pause dialogs): in add mode a selector of "OpenAI-compatible endpoint (custom URL)" plus every
 * built-in provider not yet authenticated; custom mode collects a label, an endpoint URL and a masked key, each
 * required with its own "<field> is required." error; API-key flows show the fixed instruction and a password
 * input; the confirm button is "Authenticate" ("Add endpoint" for a custom instance), busy text as specified.
 * REQ-PROVIDER-052's replacement confirmation (default No) and REQ-PROVIDER-097's zero-model recovery
 * (retry at most twice, choose a different provider, abandon; editing by hand is owed) are asked in place.
 * A device-code or browser provider (REQ-PROVIDER-096/116) starts its own flow on "Authenticate": main opens the system
 * browser and this window shows the prompt it reads back — "Open <link> and enter code <code>." or the browser sentence
 * followed by the link — until the flow has its one outcome; Cancel ends the pending wait early.
 * Structure from the specification; language from the design system (`.dialog`, `.btn-*`, `.input`).
 */
export interface ProviderDialogProps {
  readonly payload: ProviderDialogPayload;
  readonly onSubmit: (req: { providerId: string; label: string; baseUrl: string; apiKey: string; replace: boolean; allowEmpty: boolean }) => Promise<ProviderSignInResult | { outcome: 'error'; message: string }>;
  /** REQ-PROVIDER-096: the provider's own flow; it answers once the user has finished at the provider, or cancelled. */
  readonly onAuthenticate?: (req: { providerId: string; reauthenticate: boolean; allowEmpty: boolean }) => Promise<ProviderSignInResult | { outcome: 'error'; message: string }>;
  /** The prompt the pending flow shows, or null while it has none yet. */
  readonly onPrompt?: () => Promise<ProviderSignInPrompt | null>;
  /** REQ-PROVIDER-116: ends a pending device or callback wait early. */
  readonly onCancelSignIn?: () => void;
  readonly onOpenLink?: (url: string) => void;
  readonly onClose: () => void;
}


export const KEY_INSTRUCTION = 'Enter the provider API key. It will be validated with the provider\'s model catalog endpoint before it is saved.';
export { OAUTH_INSTRUCTION, PKCE_PROMPT } from './sign-in-prompt.js';
export const BUSY_AUTH = 'Authenticating and checking provider health…';
export const BUSY_ADD = 'Validating endpoint and discovering models…';

export function ProviderDialog({ payload, onSubmit, onAuthenticate, onPrompt, onCancelSignIn, onOpenLink, onClose }: ProviderDialogProps) {
  const fixed = payload.mode !== 'add';
  const initial = useMemo(() => (fixed ? payload.choices.find((c) => c.id === payload.providerId) ?? null : payload.choices.find((c) => c.custom) ?? payload.choices[0] ?? null), [fixed, payload]);
  const [choice, setChoice] = useState<ProviderChoice | null>(initial);
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState(initial?.defaultBaseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ label?: string; baseUrl?: string; apiKey?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string } | null>(null);
  const [noModels, setNoModels] = useState<{ retries: number } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  const [waiting, setWaiting] = useState(false);
  const local = choice !== null && signInKindOf(choice) === 'local';
  const interactive = choice !== null && choice.available && signInKindOf(choice) !== 'key';
  // REQ-PROVIDER-116: while the provider's flow waits for the user, the prompt main holds is read back and shown.
  const prompt = useSignInPrompt(waiting, onPrompt);

  const cancel = (): void => {
    if (waiting) onCancelSignIn?.();
    onClose();
  };

  const name = choice ? (choice.custom ? (label.trim() || 'endpoint') : choice.displayName) : '';
  const title = payload.mode === 'reauthenticate' ? `Re-authenticate ${payload.displayName ?? name}` : payload.mode === 'authenticate' ? `Authenticate ${payload.displayName ?? name}` : choice?.custom ? 'Add provider' : `Authenticate ${name}`;
  useEffect(() => { document.title = title; }, [title]);
  useEffect(() => { keyInput.current?.focus(); }, [choice]);

  const pick = (id: string) => {
    const c = payload.choices.find((x) => x.id === id) ?? null;
    setChoice(c);
    setBaseUrl(c?.defaultBaseUrl ?? '');
    setFieldErrors({});
    setError(null);
  };

  const submit = async (opts: { replace?: boolean; allowEmpty?: boolean } = {}) => {
    if (!choice || busy) return;
    if (!choice.available) { setError(choice.unavailabilityReason ?? 'This provider is not available.'); return; }
    if (signInKindOf(choice) !== 'key') {
      if (!onAuthenticate) { setError(`${choice.displayName} signs in with "${choice.methodLabel}", which this window cannot start.`); return; }
      setBusy(true);
      setWaiting(true);
      setError(null);
      const r = await onAuthenticate({ providerId: choice.id, reauthenticate: payload.mode === 'reauthenticate', allowEmpty: opts.allowEmpty ?? false });
      setBusy(false);
      setWaiting(false);
      if (r.outcome === 'signed-in') { setDone(r.message); return; }
      if (r.outcome === 'no-models') { setNoModels((n) => ({ retries: n?.retries ?? 0 })); return; }
      if (r.outcome === 'cancelled') { onClose(); return; }
      if (r.outcome === 'needs-confirmation') { setError(r.message); return; }
      setError(r.message);
      return;
    }
    const errs: { label?: string; baseUrl?: string; apiKey?: string } = {};
    if (choice.custom && label.trim() === '') errs.label = 'Label is required.';
    if (choice.custom && baseUrl.trim() === '') errs.baseUrl = 'Endpoint URL is required.';
    if (apiKey.trim() === '') errs.apiKey = 'API key is required.';
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setError(null);
    setConfirm(null);
    const r = await onSubmit({ providerId: choice.id, label: label.trim(), baseUrl: baseUrl.trim(), apiKey, replace: opts.replace ?? false, allowEmpty: opts.allowEmpty ?? false });
    setBusy(false);
    if (r.outcome === 'signed-in') { setDone(r.message); setApiKey(''); return; }
    if (r.outcome === 'needs-confirmation') { setConfirm({ message: r.message }); return; }
    if (r.outcome === 'no-models') { setNoModels((n) => ({ retries: n?.retries ?? 0 })); return; }
    if (r.outcome === 'cancelled') { onClose(); return; }
    setError(r.message);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); if (waiting) onCancelSignIn?.(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onCancelSignIn, waiting]);

  if (done !== null) {
    return (
      <div className="pause provider-dialog" role="dialog" aria-labelledby="provider-title">
        <h1 id="provider-title" className="dialog-title">{title}</h1>
        <p className="dialog-body" role="status" data-outcome="signed-in">{done}</p>
        <p className="text-secondary">Model slots were assigned from the discovered catalog; review them under Settings → Models.</p>
        <div className="dialog-actions"><DesignButton type="button" className="btn btn-primary" autoFocus onClick={onClose}>Done</DesignButton></div>
      </div>
    );
  }

  return (
    <div className="pause provider-dialog" role="dialog" aria-modal="true" aria-labelledby="provider-title">
      <h1 id="provider-title" className="dialog-title">{title}</h1>
      {!fixed && (
        <label className="provider-dialog__field">
          <span className="text-secondary">Provider</span>
          <DesignSelect id="provider-choice" className="input select" value={choice?.id ?? ''} disabled={busy} onChange={(e) => pick(e.currentTarget.value)} aria-label="Provider">
            {payload.choices.map((c) => <option key={c.id} value={c.id} disabled={!c.available}>{c.displayName}{c.available ? '' : ` — ${c.unavailabilityReason ?? 'coming soon'}`}</option>)}
          </DesignSelect>
        </label>
      )}
      {choice && <p className="text-secondary provider-dialog__hint" data-hint>{choice.hint}</p>}
      {choice && choice.custom && (<>
        <label className="provider-dialog__field">
          <span className="text-secondary">Endpoint label</span>
          <DesignInput id="provider-label" className="input" value={label} disabled={busy} onChange={(e) => setLabel(e.currentTarget.value)} aria-invalid={fieldErrors.label ? true : undefined} placeholder="OpenRouter" />
          {fieldErrors.label && <span className="composer__error" role="alert">{fieldErrors.label}</span>}
        </label>
        <label className="provider-dialog__field">
          <span className="text-secondary">Endpoint URL</span>
          <DesignInput id="provider-url" className="input mono" value={baseUrl} disabled={busy} onChange={(e) => setBaseUrl(e.currentTarget.value)} aria-invalid={fieldErrors.baseUrl ? true : undefined} />
          {fieldErrors.baseUrl && <span className="composer__error" role="alert">{fieldErrors.baseUrl}</span>}
        </label>
      </>)}
      {choice && !choice.available && <p className="composer__error" role="alert" data-unavailable>{choice.unavailabilityReason ?? 'This provider is not available.'}</p>}
      {choice && choice.available && choice.method === 'api-key' && !local && (
        <label className="provider-dialog__field">
          <span className="text-secondary">{KEY_INSTRUCTION}</span>
          <DesignInput id="provider-key" ref={keyInput} className="input mono" type="password" autoComplete="off" value={apiKey} disabled={busy} onChange={(e) => setApiKey(e.currentTarget.value)} aria-label="API key" aria-invalid={fieldErrors.apiKey ? true : undefined} />
          {fieldErrors.apiKey && <span className="composer__error" role="alert">{fieldErrors.apiKey}</span>}
        </label>
      )}
      {interactive && !prompt && <p className="text-secondary" data-instruction={local ? 'local' : 'flow'}>{local ? choice.localInstruction : OAUTH_INSTRUCTION}</p>}
      {interactive && prompt && <SignInPromptView prompt={prompt} onOpenLink={onOpenLink} />}
      {confirm && (
        <DesignCard className="card provider-dialog__confirm" role="alertdialog" aria-label="Confirm replacement">
          <p className="card-body">{confirm.message}</p>
          <div className="dialog-actions">
            <DesignButton type="button" className="btn btn-secondary" autoFocus onClick={() => setConfirm(null)}>No</DesignButton>
            <DesignButton type="button" className="btn btn-danger" onClick={() => { void submit({ replace: true }); }}>Yes, replace</DesignButton>
          </div>
        </DesignCard>
      )}
      {noModels && (
        <DesignCard className="card provider-dialog__confirm" role="alertdialog" aria-label="No models discovered">
          <p className="card-body">Discovery succeeded but returned no models. Continue anyway, retry discovery{noModels.retries >= 2 ? ' (the retry limit was reached)' : ''}, choose a different provider, or abandon.</p>
          <div className="dialog-actions">
            <DesignButton type="button" className="btn btn-secondary" onClick={() => { setNoModels(null); void submit({ replace: true, allowEmpty: true }); }}>Continue anyway</DesignButton>
            <DesignButton type="button" className="btn btn-secondary" disabled={noModels.retries >= 2} onClick={() => { setNoModels({ retries: noModels.retries + 1 }); void submit({ replace: true }); }}>Retry discovery</DesignButton>
            {!fixed && <DesignButton type="button" className="btn btn-secondary" onClick={() => { setNoModels(null); setError(null); }}>Choose a different provider</DesignButton>}
            <DesignButton type="button" className="btn btn-ghost" autoFocus onClick={onClose}>Abandon</DesignButton>
          </div>
        </DesignCard>
      )}
      {busy && <p className="text-secondary" role="status" data-busy>{choice?.custom ? BUSY_ADD : BUSY_AUTH}</p>}
      {error && <p className="composer__error" role="alert" data-outcome="failed">{error}</p>}
      <div className="dialog-actions">
        <DesignButton type="button" className="btn btn-primary" disabled={busy || !choice || !choice.available} onClick={() => { void submit(); }} data-action="authenticate">{choice?.custom ? 'Add endpoint' : 'Authenticate'}</DesignButton>
        <DesignButton type="button" className="btn btn-secondary" disabled={busy && !waiting} onClick={cancel} title="Escape" data-action="cancel">Cancel</DesignButton>
      </div>
    </div>
  );
}
