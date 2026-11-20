import { err, ok, type Result } from '@rotaris/kernel';
import type { StoredCredential } from '../credentials/store.js';
import { openLoopback } from './loopback.js';
import { boundedFetch, errorText, formBody, oauthState, pkceChallenge, pkceVerifier, unverifiedJwtClaims, type FlowDeps } from './oauth.js';

/**
 * REQ-PROVIDER-028..034, 036 — OpenAI Codex: authorization code with PKCE against the issuer, the answer taken on the
 * loopback listener (ports 1455 then 1457 and never another, path `/auth/callback`), the code exchanged at
 * `<issuer>/oauth/token`, the account id read from the id token's claims and then the access token's (unverified —
 * ADR-0030 consequence 4). The identifiers below are build data the specification fixes.
 */
export const CODEX_ISSUER = 'https://auth.openai.com';
export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_SCOPES = 'openid profile email offline_access api.connectors.read api.connectors.invoke';
export const CODEX_PORTS: readonly number[] = Object.freeze([1455, 1457]);
export const CODEX_CALLBACK_PATH = '/auth/callback';
export const CODEX_ORIGINATOR = 'codex_cli_rs';
export const CODEX_PROMPT_MESSAGE = 'Sign in with ChatGPT to authenticate Codex.';
export const CODEX_DEFAULT_LIFETIME_S = 3600;
const TOKEN_TIMEOUT_MS = 30_000;

export function codexAuthorizationUrl(redirectUri: string, challenge: string, state: string, issuer: string = CODEX_ISSUER): string {
  const q = new URLSearchParams({
    response_type: 'code', client_id: CODEX_CLIENT_ID, redirect_uri: redirectUri, scope: CODEX_SCOPES,
    code_challenge: challenge, code_challenge_method: 'S256', id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true',
    state, originator: CODEX_ORIGINATOR,
  });
  return `${issuer}/oauth/authorize?${q.toString()}`;
}

/** REQ-PROVIDER-032: the first present of a top-level claim, the claim inside the auth object, the first organization. */
export function codexAccountId(idToken: string | null | undefined, accessToken: string | null | undefined): string | null {
  for (const token of [idToken, accessToken]) {
    const claims = unverifiedJwtClaims(token);
    if (!claims) continue;
    const top = claims['chatgpt_account_id'];
    if (typeof top === 'string' && top.length > 0) return top;
    const auth = claims['https://api.openai.com/auth'];
    if (auth !== null && typeof auth === 'object') {
      const nested = (auth as Record<string, unknown>)['chatgpt_account_id'];
      if (typeof nested === 'string' && nested.length > 0) return nested;
    }
    const orgs = claims['organizations'];
    if (Array.isArray(orgs) && orgs.length > 0) {
      const first: unknown = orgs[0];
      if (typeof first === 'string' && first.length > 0) return first;
      if (first !== null && typeof first === 'object' && typeof (first as Record<string, unknown>)['id'] === 'string') return (first as Record<string, string>)['id'] ?? null;
    }
  }
  return null;
}

interface TokenResponse { readonly access_token: string; readonly refresh_token: string | null; readonly id_token: string | null; readonly expires_in: number; readonly scope: string | null }

function readTokenResponse(payload: unknown): TokenResponse | null {
  if (payload === null || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p['access_token'] !== 'string' || p['access_token'].length === 0) return null;
  const lifetime = p['expires_in'];
  return {
    access_token: p['access_token'],
    refresh_token: typeof p['refresh_token'] === 'string' && p['refresh_token'].length > 0 ? p['refresh_token'] : null,
    id_token: typeof p['id_token'] === 'string' && p['id_token'].length > 0 ? p['id_token'] : null,
    expires_in: typeof lifetime === 'number' && Number.isFinite(lifetime) && lifetime > 0 ? lifetime : CODEX_DEFAULT_LIFETIME_S,
    scope: typeof p['scope'] === 'string' && p['scope'].length > 0 ? p['scope'] : null,
  };
}

function credentialOf(t: TokenResponse, nowSeconds: number, previous: StoredCredential | null): StoredCredential {
  const extra: Record<string, string> = { ...(previous?.extra ?? {}), auth_mode: 'chatgpt', requested_scopes: CODEX_SCOPES };
  if (t.scope !== null) extra['scope'] = t.scope;
  // The id token is what the on-demand API-key exchange (owed) trades; it is kept with the credential it belongs to.
  if (t.id_token !== null) extra['id_token'] = t.id_token;
  return {
    access_token: t.access_token,
    // REQ-PROVIDER-033: a refresh that returns no refresh token keeps the previous one.
    refresh_token: t.refresh_token ?? previous?.refresh_token ?? '',
    expires_at: Math.floor(nowSeconds + t.expires_in),
    account_id: codexAccountId(t.id_token ?? previous?.extra['id_token'], t.access_token),
    extra,
  };
}

/** REQ-PROVIDER-028..032: the whole interactive flow. The listener is closed before this returns, however it ends. */
export async function authenticateCodex(deps: FlowDeps, nowSeconds: () => number, issuer: string = CODEX_ISSUER, ports: readonly number[] = CODEX_PORTS): Promise<Result<StoredCredential, string>> {
  const state = oauthState();
  const verifier = pkceVerifier();
  const listener = await openLoopback({ ports, path: CODEX_CALLBACK_PATH, state, timers: deps.timers, warn: deps.warn });
  if (!listener.ok) return listener;
  let code: Result<string, string>;
  try {
    deps.prompt({ kind: 'browser', url: codexAuthorizationUrl(listener.value.redirectUri, pkceChallenge(verifier), state, issuer), message: CODEX_PROMPT_MESSAGE });
    code = await listener.value.wait(deps.signal);
  } finally {
    // REQ-PROVIDER-031: awaited, so the port is free before the sign-in call returns.
    await listener.value.close();
  }
  if (!code.ok) return code;
  let response: Response;
  try {
    response = await boundedFetch(deps, `${issuer}/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: formBody({ grant_type: 'authorization_code', code: code.value, redirect_uri: listener.value.redirectUri, client_id: CODEX_CLIENT_ID, code_verifier: verifier }),
    }, TOKEN_TIMEOUT_MS);
  } catch (cause) {
    return err(`Token exchange failed: ${errorText(cause)}`);
  }
  if (response.status !== 200) return err(`Token exchange HTTP ${response.status}`);
  const tokens = readTokenResponse(await response.json().catch(() => null));
  if (!tokens) return err('Token exchange returned no access token');
  return ok(credentialOf(tokens, nowSeconds(), null));
}

/** REQ-PROVIDER-033. */
export async function refreshCodex(deps: Pick<FlowDeps, 'fetch' | 'signal'>, stored: StoredCredential, nowSeconds: () => number, issuer: string = CODEX_ISSUER): Promise<Result<StoredCredential, string>> {
  if (stored.refresh_token.length === 0) return err('Stored token cannot be refreshed; re-authentication required');
  let response: Response;
  try {
    response = await boundedFetch(deps, `${issuer}/oauth/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: formBody({ grant_type: 'refresh_token', refresh_token: stored.refresh_token, client_id: CODEX_CLIENT_ID }),
    }, TOKEN_TIMEOUT_MS);
  } catch (cause) {
    return err(`Refresh request failed: ${errorText(cause)}`);
  }
  if (response.status !== 200) return err(`Token refresh failed: HTTP ${response.status}`);
  const tokens = readTokenResponse(await response.json().catch(() => null));
  if (!tokens) return err('Token refresh failed: the response carried no access token');
  return ok(credentialOf(tokens, nowSeconds(), stored));
}
