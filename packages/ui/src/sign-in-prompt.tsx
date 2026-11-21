import { useEffect, useState } from 'react';
import type { ProviderChoice, ProviderSignInPrompt, ProviderSignInResult } from '@rotaris/contracts';
import { Button as DesignButton } from './design-system/index.js';

/**
 * REQ-PROVIDER-096/116 — what an interactive sign-in shows while it waits for the user, shared by the two surfaces that
 * start one: the authentication window and the first-launch setup's model step (PD-WORKSPACE-010 clause 3: the same
 * sign-in, carried out in place). Main holds the prompt; the surface that asked reads it back and draws it here.
 */
export const OAUTH_INSTRUCTION = 'Start authentication. Rotaris will open or display the provider\'s official sign-in flow here.';
export const PKCE_PROMPT = "Your browser should have opened automatically. If it didn't, open this link to complete authentication:";
const PROMPT_POLL_MS = 400;

/** How a provider is signed in to, as a surface must offer it: a pasted key, the provider's own flow, or the tool installed on the machine. */
export type SignInKind = 'key' | 'flow' | 'local';
export function signInKindOf(choice: Pick<ProviderChoice, 'method' | 'localInstruction'>): SignInKind {
  if (choice.localInstruction !== undefined) return 'local';
  return choice.method === 'api-key' ? 'key' : 'flow';
}

/** The prompt of the sign-in this surface has pending, read back from main while `waiting`; null before there is one and after. */
export function useSignInPrompt(waiting: boolean, read: (() => Promise<ProviderSignInPrompt | null>) | undefined): ProviderSignInPrompt | null {
  const [prompt, setPrompt] = useState<ProviderSignInPrompt | null>(null);
  useEffect(() => {
    if (!waiting || !read) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async (): Promise<void> => {
      const p = await read().catch(() => null);
      if (!live) return;
      // Main's answer is the prompt, null included: a wait that has none yet shows none, whatever an earlier wait left.
      setPrompt(p);
      timer = setTimeout(() => { void poll(); }, PROMPT_POLL_MS);
    };
    void poll();
    return () => { live = false; if (timer !== null) clearTimeout(timer); };
  }, [waiting, read]);
  return waiting ? prompt : null;
}

/** REQ-PROVIDER-116: "Open <link> and enter code <code>." for a device code; the browser sentence followed by the link otherwise. */
export function SignInPromptView({ prompt, onOpenLink }: { readonly prompt: ProviderSignInPrompt; readonly onOpenLink?: ((url: string) => void) | undefined }) {
  if (prompt.kind === 'device-code') {
    return (
      <div className="provider-dialog__prompt" role="status" data-prompt="device-code">
        <p className="dialog-body">Open <a href={prompt.verificationUri} onClick={(e) => { e.preventDefault(); onOpenLink?.(prompt.verificationUri); }}>{prompt.verificationUri}</a> and enter code <strong className="mono" data-user-code>{prompt.userCode}</strong>.</p>
        <p className="text-secondary">The code stays valid for {Math.max(1, Math.round(prompt.expiresInSeconds / 60))} minutes; Rotaris checks every {prompt.intervalSeconds} seconds whether you have entered it.</p>
      </div>
    );
  }
  return (
    <div className="provider-dialog__prompt" role="status" data-prompt="browser">
      <p className="dialog-body">{prompt.message}</p>
      <p className="text-secondary">{PKCE_PROMPT}</p>
      <p className="provider-dialog__link"><a href={prompt.url} onClick={(e) => { e.preventDefault(); onOpenLink?.(prompt.url); }}>{prompt.url}</a></p>
    </div>
  );
}

/** What a surface hands the in-place sign-in: the authentication window's own three commands and the link opener. */
export interface InPlaceSignInHost {
  /** `provider.authenticate` for the provider, with re-authentication asked for; resolves when the flow has its one outcome. */
  readonly onAuthenticate: () => Promise<ProviderSignInResult | { readonly outcome: 'error'; readonly message: string }>;
  readonly onSignInPrompt: () => Promise<ProviderSignInPrompt | null>;
  readonly onCancelSignIn: () => void;
  readonly onOpenLink?: ((url: string) => void) | undefined;
}

export const IN_PLACE_SIGN_IN_CANCEL = 'Cancel sign-in';
export function inPlaceSignInLabel(providerName: string): string { return `Sign in to ${providerName}`; }

/**
 * REQ-NOTIFY-076 — a provider's own sign-in started in place by a recovery surface: one control that starts it, the
 * prompt main holds while it waits (the code to enter, or the page that opened), a control that ends the wait, and the
 * flow's own sentence when it fails. `onSignedIn` is the surface's confirmation, taken once the flow has signed in.
 */
export function InPlaceSignIn({ providerName, host, disabled, onSignedIn, onBusy }: { readonly providerName: string; readonly host: InPlaceSignInHost; readonly disabled?: boolean; readonly onSignedIn: () => void; readonly onBusy?: (busy: boolean) => void }) {
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const prompt = useSignInPrompt(waiting, host.onSignInPrompt);
  const start = async (): Promise<void> => {
    if (waiting || disabled) return;
    setWaiting(true);
    setMessage(null);
    onBusy?.(true);
    const outcome = await host.onAuthenticate().catch((cause: unknown) => ({ outcome: 'error' as const, message: String(cause) }));
    setWaiting(false);
    onBusy?.(false);
    if (outcome.outcome === 'signed-in') { onSignedIn(); return; }
    if (outcome.outcome === 'cancelled') return;
    setMessage(outcome.outcome === 'needs-confirmation' ? outcome.message : outcome.outcome === 'no-models' ? `${providerName} signed in, and its catalog lists no model.` : outcome.message);
  };
  return (
    <div className="sign-in-inline" data-sign-in-inline data-waiting={waiting ? '' : undefined}>
      {waiting && prompt !== null && <SignInPromptView prompt={prompt} onOpenLink={host.onOpenLink} />}
      {waiting && prompt === null && <p className="text-secondary" role="status">Starting the sign-in…</p>}
      {waiting
        ? <DesignButton type="button" className="btn btn-secondary" onClick={() => host.onCancelSignIn()} data-action="cancel-sign-in">{IN_PLACE_SIGN_IN_CANCEL}</DesignButton>
        : <DesignButton type="button" className="btn btn-secondary" disabled={disabled === true} onClick={() => { void start(); }} data-action="start-sign-in">{inPlaceSignInLabel(providerName)}</DesignButton>}
      {message !== null && <p className="composer__error" role="alert" data-sign-in-failure>{message}</p>}
    </div>
  );
}
