import type { CredentialStatus, StoredCredential } from '../credentials/store.js';
import type { DiscoveredModel } from '../discovery.js';

/**
 * PD-PROVIDER-002 (superseding REQ-PROVIDER-044 to 046, narrowing REQ-PROVIDER-008 and 049) — the Claude Code
 * subscription provider is the Claude Code tool the user installed and signed in to. This product asks that tool
 * whether it is signed in and starts it to answer a model call; it never reads, asks for, stores or passes on the
 * tool's credential. What the credential store holds for the provider is a MARKER that the user connected it here,
 * not a secret: signing out removes the marker and leaves the tool's own sign-in alone.
 */
export const CLAUDE_CODE_MARKER = 'claude-code-local-tool';
export const CLAUDE_CODE_METHOD_LABEL = 'Uses Claude Code signed in on this computer';
export const CLAUDE_CODE_INSTRUCTION = 'Rotaris will use the Claude Code tool installed and signed in on this computer. Nothing is pasted here, and Rotaris never sees or stores your Claude sign-in.';
export const CLAUDE_CODE_NOT_INSTALLED = 'Claude Code is not installed on this computer, or is not on the search path Rotaris was started with. Install Claude Code, sign in to it with your Claude subscription, then authenticate again.';
export const CLAUDE_CODE_NOT_SIGNED_IN = 'Claude Code is installed but not signed in. Open Claude Code, sign in with your Claude subscription, then authenticate again.';
export const CLAUDE_CODE_NOT_A_SUBSCRIPTION = 'Claude Code is signed in with an API key or a cloud provider, not with a Claude subscription, so runs would be billed there. Sign in to Claude Code with your Claude subscription, then authenticate again.';
export const CLAUDE_CODE_NO_KEY = 'Claude Code (subscription) takes no key: it uses the Claude Code tool signed in on this computer. Press Authenticate instead.';

/** What the local tool says about itself when asked (`claude auth status`); nothing in it is a credential. */
export interface LocalToolState {
  readonly installed: boolean;
  readonly signedIn: boolean;
  /** Signed in with a Claude subscription, as opposed to an API key or a cloud provider. */
  readonly subscription: boolean;
  /** The plan the tool reports (`pro`, `max`, …), when it reports one. */
  readonly plan: string | null;
}

/** Reads the tool's own status answer. Anything unreadable is "installed, not signed in". */
export function localToolStateOf(statusJson: string | null): LocalToolState {
  if (statusJson === null) return { installed: false, signedIn: false, subscription: false, plan: null };
  try {
    const v: unknown = JSON.parse(statusJson);
    if (v === null || typeof v !== 'object') throw new Error('not an object');
    const o = v as Record<string, unknown>;
    const plan = typeof o['subscriptionType'] === 'string' && o['subscriptionType'].length > 0 ? o['subscriptionType'] : null;
    return { installed: true, signedIn: o['loggedIn'] === true, subscription: o['loggedIn'] === true && o['authMethod'] === 'claude.ai', plan };
  } catch {
    return { installed: true, signedIn: false, subscription: false, plan: null };
  }
}

/** The sentence for a tool that cannot serve the subscription, or null when it can. */
export function localToolProblem(state: LocalToolState): string | null {
  if (!state.installed) return CLAUDE_CODE_NOT_INSTALLED;
  if (!state.signedIn) return CLAUDE_CODE_NOT_SIGNED_IN;
  if (!state.subscription) return CLAUDE_CODE_NOT_A_SUBSCRIPTION;
  return null;
}

/** Authenticated exactly when the user connected the provider here; the tool's own state is asked when it matters. */
export function claudeCodeStatus(c: StoredCredential | null): CredentialStatus {
  return c !== null && c.access_token === CLAUDE_CODE_MARKER ? 'authenticated' : 'unauthenticated';
}

/** REQ-PROVIDER-047: exactly three version-independent aliases; no network call. */
export function claudeCodeModels(): DiscoveredModel[] {
  return ([['opus', 'Claude Opus (subscription)'], ['sonnet', 'Claude Sonnet (subscription)'], ['haiku', 'Claude Haiku (subscription)']] as const)
    .map(([id, displayName]) => ({ id, qualifiedId: `claude-code/${id}`, displayName, capabilities: { accepts_image_input: true }, limits: { context_window: 200_000 }, pricing: {}, raw: { id } }));
}
