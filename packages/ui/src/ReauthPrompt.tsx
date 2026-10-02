import { useId, useState } from 'react';
import type { ReauthPrompt as ReauthPromptState, ReauthSubmitResult } from '@rotaris/contracts';
import { Button as DesignButton, Input as DesignInput } from './design-system/index.js';

/**
 * REQ-NOTIFY-071 / REQ-NOTIFY-078 (the 401 note's part B) — the non-modal re-authentication prompt, opened by main after
 * a first authentication failure was recovered on the fallback (REQ-NOTIFY-070).
 *
 * **Non-modal, window-level (ADR-0048), and laid out in flow.** The window holds the prompts (`useReauthPrompt` in the
 * renderer root) and the Workspace view draws the followed session's in its own row of the view's grid, between the run
 * header and the transcript (`WorkspaceView`'s `reauthPrompt` slot, OQ-180's reading of "beside the continuing run"). It
 * takes its height from the transcript and overlays nothing: no backdrop, no `aria-modal`, no focus trap, and no control
 * of the window or the view is ever under it, at any window size. Its two earlier placements overlaid controls — fixed at
 * the window's corner (the title bar's, the notice's) and then absolute in the rail-and-view region (the run header's
 * switches, the composer's submit at REQ-SHELL-022's minimum) — and are recorded in ADR-0048's report-back. It leaves
 * only by its own two answers — the dismissal, which keeps the fallback, and a submission main accepted — or when main
 * closes it.
 *
 * **At the minimum window size** the transcript keeps REQ-CHAT-010's floor and the prompt takes what is left, which with
 * a notice standing is less than it needs: the card then scrolls, and its answers — the key field and the two buttons, on
 * one wrapping row — are pinned to its floor as the plan gate pins its three, so they never scroll away. The key's hint
 * sits with the provider's words above them and describes the field (`aria-describedby`). **Beside an expanded plan gate**
 * the transcript is not drawn and the prompt does not take what is left: it yields to the gate, which the run is stopped
 * on, drawn as a bar — its title and its answers — by `shell.css` alone (whole, sized first, it once left the gate's three
 * answers unreachable); its words stay in the document and are drawn again when the gate is collapsed or answered.
 *
 * **Craft** (`pnpm mockup`, "Provider auth modal", read for craft only): `dialog-title`, `dialog-body`, the provider's
 * words in an inset block on the ground with the hairline border, a caption in the tertiary ink, `dialog-actions` with the
 * secondary answer first. Drawn in flow, the card takes the plan gate's in-view craft (the surface, the hairline border,
 * the medium radius, a three-hairline leading edge) with the leading edge in the warning ink, since the run is degraded to
 * its fallback. No colour and no size is written here; every state is a word (REQ-SHELL-149).
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

/**
 * REQ-NOTIFY-030 — "changing the focused session moves every recovery affordance with it". A window holds the open prompts
 * by session (channel 13 carries each one's opening and closing, `reauth.read` the ones open when the window mounts) and
 * draws only the one for the session it follows: another session's prompt is never drawn over the focused one, and comes
 * back when its session is focused again.
 */
export type ReauthPrompts = ReadonlyMap<string, ReauthPromptState>;

/** One publish applied: the session's prompt opened (or replaced), or closed on `null`. */
export function applyReauthPublish(prompts: ReauthPrompts, sessionId: string, prompt: ReauthPromptState | null): ReauthPrompts {
  const next = new Map(prompts);
  if (prompt === null) next.delete(sessionId); else next.set(sessionId, prompt);
  return next;
}

/** The prompts read at mount, merged under any publish that already reached the window (the publish is newer). */
export function seedReauthPrompts(prompts: ReauthPrompts, read: readonly ReauthPromptState[]): ReauthPrompts {
  const next = new Map(read.map((p) => [p.sessionId, p] as const));
  for (const [sessionId, prompt] of prompts) next.set(sessionId, prompt);
  return next;
}

/** The prompt this window draws: the followed session's, or none while it follows no session or one with none open. */
export function reauthPromptFor(prompts: ReauthPrompts, followedSessionId: string | null): ReauthPromptState | null {
  return followedSessionId === null ? null : prompts.get(followedSessionId) ?? null;
}

export interface ReauthPromptProps {
  readonly prompt: ReauthPromptState;
  readonly onSubmit: (apiKey: string) => Promise<ReauthSubmitResult>;
  readonly onDismiss: () => Promise<void>;
}

export function ReauthPrompt({ prompt, onSubmit, onDismiss }: ReauthPromptProps) {
  const titleId = useId();
  const bodyId = useId();
  const hintId = useId();
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
    <section className="reauth-prompt" role="dialog" aria-labelledby={titleId} aria-describedby={bodyId} data-testid="reauth-prompt" data-session={prompt.sessionId} data-method={prompt.method}>
      <div className="reauth-prompt__head">
        <h2 id={titleId} className="dialog-title" data-testid="reauth-title">{copy.title}</h2>
        <p id={bodyId} className="dialog-body" data-testid="reauth-body">{copy.body}</p>
      </div>
      <div className="reauth-prompt__detail">
        <div className="reauth-prompt__error">
          <span className="reauth-prompt__caption">{REAUTH_ERROR_LABEL}</span>
          <p className="reauth-prompt__quote mono" data-testid="reauth-error">{prompt.error}</p>
        </div>
        {prompt.method === 'api-key'
          ? <p id={hintId} className="reauth-prompt__caption" data-testid="reauth-key-hint">{REAUTH_KEY_HINT}</p>
          : <p className="reauth-prompt__caption" data-testid="reauth-method">{copy.method}</p>}
      </div>
      <div className="reauth-prompt__answer">
        {prompt.method === 'api-key' ? (
          <DesignInput label={REAUTH_KEY_LABEL} className="input mono" type="password" autoComplete="off" aria-describedby={hintId} value={apiKey} disabled={busy} onChange={(e) => setApiKey(e.currentTarget.value)} data-testid="reauth-key" />
        ) : null}
        <div className="dialog-actions">
          <DesignButton type="button" className="btn btn-secondary" disabled={busy} title={`Close this and keep running on ${pair(prompt.fallback)}.`} onClick={() => { void onDismiss(); }} data-action="reauth-keep">{REAUTH_KEEP_LABEL}</DesignButton>
          <DesignButton type="button" className="btn btn-primary" disabled={busy} title={`Switch back to ${pair(prompt.primary)}${prompt.method === 'api-key' ? ', saving the key typed above' : ''}.`} onClick={() => { void submit(); }} data-action="reauth-submit">{busy ? 'Re-authenticating…' : REAUTH_SUBMIT_LABEL}</DesignButton>
        </div>
        {message !== null ? <p role="alert" className="composer__error reauth-prompt__refused" data-testid="reauth-refused">{message}</p> : null}
      </div>
    </section>
  );
}
