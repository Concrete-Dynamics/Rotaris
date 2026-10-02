import { useId, useState } from 'react';
import type { ReauthPrompt as ReauthPromptState, ReauthSubmitResult } from '@rotaris/contracts';
import { Button as DesignButton, Input as DesignInput } from './design-system/index.js';

/**
 * REQ-NOTIFY-071 / REQ-NOTIFY-078 (the 401 note's part B) — the non-modal re-authentication prompt, opened by main after
 * a first authentication failure was recovered on the fallback (REQ-NOTIFY-070).
 *
 * **Non-modal, window-level (ADR-0048).** A panel the window owns, mounted beside the shell like the project setup dialog:
 * no backdrop, no `aria-modal`, no focus trap, so the composer and every view stay usable while the run continues on
 * the fallback beside it. It leaves only by its own two answers — the dismissal, which keeps the fallback, and a
 * submission main accepted — or when main closes it.
 *
 * **Craft** (`pnpm mockup`, "Provider auth modal", read for craft only): `dialog-title`, `dialog-body`, the provider's
 * words in an inset block on the ground with the hairline border, a caption in the tertiary ink, `dialog-actions` with the
 * secondary answer first. No colour and no size is written here; every state is a word (REQ-SHELL-149).
 */
export const REAUTH_KEEP_LABEL = 'Keep the fallback';
export const REAUTH_SUBMIT_LABEL = 'Re-authenticate';
export const REAUTH_KEY_LABEL = 'API key';
export const REAUTH_KEY_HINT = 'Leave it empty if the provider was re-authenticated elsewhere, in Settings › Models for instance.';
export const REAUTH_ERROR_LABEL = 'The provider answered';

const pair = (p: { readonly provider: string; readonly model: string }): string => `${p.provider}/${p.model}`;

/** REQ-NOTIFY-071's words, pure so a test holds every one of them. */
export function reauthCopy(prompt: ReauthPromptState): { readonly title: string; readonly body: string; readonly method: string | null } {
  return {
    title: `Re-authenticate ${prompt.provider.name}`,
    body: `${pair(prompt.primary)} could not authenticate. The run continues on the fallback model ${pair(prompt.fallback)}; re-authenticating switches back to ${pair(prompt.primary)} from the next iteration.`,
    method: prompt.method === 'unavailable'
      ? prompt.unavailableReason ?? `${prompt.provider.name} cannot be re-authenticated from here in this build.`
      : prompt.method === 'none' ? `This application holds no credential for ${prompt.provider.name}; its key comes from the model configuration. Re-authenticate it there, then switch back here.` : null,
  };
}

export interface ReauthPromptProps {
  readonly prompt: ReauthPromptState;
  readonly onSubmit: (apiKey: string) => Promise<ReauthSubmitResult>;
  readonly onDismiss: () => Promise<void>;
}

export function ReauthPrompt({ prompt, onSubmit, onDismiss }: ReauthPromptProps) {
  const titleId = useId();
  const bodyId = useId();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const copy = reauthCopy(prompt);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    const r = await onSubmit(apiKey);
    setBusy(false);
    if (r.ok) setApiKey('');
    else setMessage(r.message);
  };

  return (
    <section className="dialog reauth-prompt" role="dialog" aria-labelledby={titleId} aria-describedby={bodyId} data-testid="reauth-prompt" data-session={prompt.sessionId} data-method={prompt.method}>
      <h2 id={titleId} className="dialog-title" data-testid="reauth-title">{copy.title}</h2>
      <p id={bodyId} className="dialog-body" data-testid="reauth-body">{copy.body}</p>
      <div className="reauth-prompt__error">
        <span className="reauth-prompt__caption">{REAUTH_ERROR_LABEL}</span>
        <p className="reauth-prompt__quote mono" data-testid="reauth-error">{prompt.error}</p>
      </div>
      {prompt.method === 'api-key' ? (
        <>
          <DesignInput label={REAUTH_KEY_LABEL} className="input mono" type="password" autoComplete="off" value={apiKey} disabled={busy} onChange={(e) => setApiKey(e.currentTarget.value)} data-testid="reauth-key" />
          <p className="reauth-prompt__caption">{REAUTH_KEY_HINT}</p>
        </>
      ) : (
        <p className="reauth-prompt__caption" data-testid="reauth-method">{copy.method}</p>
      )}
      {message !== null ? <p role="alert" className="composer__error" data-testid="reauth-refused">{message}</p> : null}
      <div className="dialog-actions">
        <DesignButton type="button" className="btn btn-secondary" disabled={busy} title={`Close this and keep running on ${pair(prompt.fallback)}.`} onClick={() => { void onDismiss(); }} data-action="reauth-keep">{REAUTH_KEEP_LABEL}</DesignButton>
        <DesignButton type="button" className="btn btn-primary" disabled={busy} title={`Switch back to ${pair(prompt.primary)}${prompt.method === 'api-key' ? ', saving the key typed above' : ''}.`} onClick={() => { void submit(); }} data-action="reauth-submit">{busy ? 'Re-authenticating…' : REAUTH_SUBMIT_LABEL}</DesignButton>
      </div>
    </section>
  );
}
