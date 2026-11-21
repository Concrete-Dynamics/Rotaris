import { useEffect, useState } from 'react';
import type { ProviderChoice, ProviderSignInPrompt } from '@rotaris/contracts';

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
