import { err, ok, type Result } from '@rotaris/kernel';
import { headerValidKey, type CredentialStatus, type StoredCredential } from '../credentials/store.js';
import type { DiscoveredModel } from '../discovery.js';

/**
 * REQ-PROVIDER-045, 047 — the Claude Code subscription provider mints no token of its own: the user mints one with
 * the external tool and pastes it. Validation is local; model discovery is static and offline.
 */
export const CLAUDE_CODE_TOKEN_LABEL = 'Claude Code subscription token (sk-ant-oat...)';
export const CLAUDE_CODE_TOKEN_REQUIRED = "Subscription token is required. Run 'claude setup-token' to mint one.";
export const CLAUDE_CODE_TOKEN_IS_API_KEY = "This is an Anthropic API key (sk-ant-api...), which would bill the API rather than the subscription. Paste the subscription token minted by 'claude setup-token' instead.";
export const CLAUDE_CODE_TOKEN_SHAPE = "Expected a subscription OAuth token starting with 'sk-ant-oat' (minted by 'claude setup-token').";
export const CLAUDE_CODE_MINT_FIRST = "Claude Code (subscription) cannot sign in by itself: mint a subscription token with the Claude Code tool's 'claude setup-token' command, then paste it into this provider's sign-in.";

/** The numbered setup and where the token is kept, for the paste-token sign-in once it is offered. */
export const CLAUDE_CODE_INSTRUCTIONS: readonly string[] = Object.freeze([
  'Install the Claude Code tool and sign in to it.',
  "Run 'claude setup-token' in a terminal.",
  "Paste the 'sk-ant-oat' token it prints below.",
]);
export const CLAUDE_CODE_STORAGE_NOTE = 'The token is kept on this machine with owner-only file permissions and is never written to workspace files, logs or session snapshots.';

/** REQ-PROVIDER-045. */
export function validateSubscriptionToken(raw: string): Result<string, string> {
  const key = headerValidKey(raw);
  if (!key.ok) return key;
  if (key.value.length === 0) return err(CLAUDE_CODE_TOKEN_REQUIRED);
  if (key.value.startsWith('sk-ant-api')) return err(CLAUDE_CODE_TOKEN_IS_API_KEY);
  if (!key.value.startsWith('sk-ant-oat')) return err(CLAUDE_CODE_TOKEN_SHAPE);
  return ok(key.value);
}

/** REQ-PROVIDER-045: status reuses the validation — an invalid stored token reads unauthenticated. */
export function claudeCodeStatus(c: StoredCredential | null): CredentialStatus {
  return c !== null && validateSubscriptionToken(c.access_token).ok ? 'authenticated' : 'unauthenticated';
}

/** REQ-PROVIDER-047: exactly three version-independent aliases; no network call. */
export function claudeCodeModels(): DiscoveredModel[] {
  return ([['opus', 'Claude Opus (subscription)'], ['sonnet', 'Claude Sonnet (subscription)'], ['haiku', 'Claude Haiku (subscription)']] as const)
    .map(([id, displayName]) => ({ id, qualifiedId: `claude-code/${id}`, displayName, capabilities: {}, limits: {}, pricing: {}, raw: { id } }));
}
