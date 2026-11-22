import { err, ok, type Result } from '@rotaris/kernel';
import { normalizeBaseUrl } from '../catalogue.js';
import type { StoredCredential } from '../credentials/store.js';
import { openLoopback } from './loopback.js';
import { boundedFetch, errorText, formBody, oauthState, pkceChallenge, pkceVerifier, type FlowDeps } from './oauth.js';

/**
 * REQ-PROVIDER-037..041 under PD-PROVIDER-004 — Rotaris Cloud: OIDC authorization code with PKCE for the public client
 * `rotaris-ai`, against an issuer and an API base that are a CHOICE of server. The production pair is the default; a
 * development or a locally running backend is reached by naming its pair (the setting, or `ROTARIS_OIDC_ISSUER` and
 * `ROTARIS_API_BASE_URL`, which win). The answer is taken on an ephemeral loopback port at `/callback`; the endpoints are
 * discovered once and recorded in the credential's extras, so refresh and revocation need no discovery (REQ-PROVIDER-040).
 */
export const CLOUD_CLIENT_ID = 'rotaris-ai';
export const CLOUD_DEFAULT_ISSUER = 'https://auth.rotaris.ai/realms/rotaris';
export const CLOUD_DEFAULT_API_BASE = 'https://api.rotaris.ai/v1';
export const CLOUD_CALLBACK_PATH = '/callback';
export const CLOUD_SCOPES = 'openid';
export const CLOUD_DEFAULT_LIFETIME_S = 900;
export const CLOUD_PROMPT_MESSAGE = 'Sign in to Rotaris Cloud in your browser.';
export const ENV_ISSUER = 'ROTARIS_OIDC_ISSUER';
export const ENV_API_BASE = 'ROTARIS_API_BASE_URL';
const DISCOVERY_TIMEOUT_MS = 30_000;
const TOKEN_TIMEOUT_MS = 30_000;
const REVOKE_TIMEOUT_MS = 10_000;

/** The server a Rotaris Cloud sign-in talks to: where the models are served, and who vouches for the user. */
export interface CloudServer { readonly apiBase: string; readonly issuer: string }

/** What a user (or the environment) states of the server; an absent half takes the production default. */
export interface CloudServerChoice { readonly apiBase?: string | null; readonly issuer?: string | null }

export const ISSUER_SHAPE = 'Sign-in server URL must include a scheme and hostname.';
const trimSlashes = (s: string): string => s.trim().replace(/\/+$/, '');

export function normalizeIssuer(raw: string): Result<string, string> {
  const s = trimSlashes(raw);
  let parsed: URL;
  try { parsed = new URL(s); } catch { return err(ISSUER_SHAPE); }
  if (!/^https?:$/.test(parsed.protocol) || parsed.hostname.length === 0) return err(ISSUER_SHAPE);
  return ok(s);
}

/** An empty or whitespace string states nothing. */
const stated = (v: string | null | undefined): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);

/**
 * The effective server: the environment over the stored choice over the production default, each half on its own. A half
 * that is stated and malformed is an error, never silently replaced by the default — a typo must not send a sign-in to
 * production.
 */
export function resolveCloudServer(stored: CloudServerChoice | null, env: Readonly<Record<string, string | undefined>> = {}): Result<CloudServer, string> {
  const api = normalizeBaseUrl(stated(env[ENV_API_BASE]) ?? stated(stored?.apiBase) ?? CLOUD_DEFAULT_API_BASE);
  if (!api.ok) return err(api.error);
  const issuer = normalizeIssuer(stated(env[ENV_ISSUER]) ?? stated(stored?.issuer) ?? CLOUD_DEFAULT_ISSUER);
  if (!issuer.ok) return err(issuer.error);
  return ok({ apiBase: api.value, issuer: issuer.value });
}

export interface CloudEndpoints { readonly authorization: string; readonly token: string; readonly revocation: string }

/** REQ-PROVIDER-038. */
export async function discoverCloud(deps: Pick<FlowDeps, 'fetch' | 'signal'>, issuer: string): Promise<Result<CloudEndpoints, string>> {
  let response: Response;
  try {
    response = await boundedFetch(deps, `${issuer}/.well-known/openid-configuration`, { headers: { Accept: 'application/json' } }, DISCOVERY_TIMEOUT_MS);
  } catch (cause) {
    return err(`Could not reach the Rotaris Cloud sign-in server at ${issuer}: ${errorText(cause)}`);
  }
  if (response.status !== 200) return err(`OIDC discovery HTTP ${response.status}`);
  const doc: unknown = await response.json().catch(() => null);
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return err('OIDC discovery response is not JSON');
  const d = doc as Record<string, unknown>;
  if (typeof d['issuer'] !== 'string' || trimSlashes(d['issuer']) !== issuer) return err('OIDC discovery issuer did not match configured issuer');
  const [authorization, token, revocation] = [d['authorization_endpoint'], d['token_endpoint'], d['revocation_endpoint']];
  if (typeof authorization !== 'string' || typeof token !== 'string' || typeof revocation !== 'string' || !authorization || !token || !revocation) return err('OIDC discovery omitted a required endpoint');
  return ok({ authorization, token, revocation });
}

export function cloudAuthorizationUrl(endpoint: string, redirectUri: string, challenge: string, state: string): string {
  const q = new URLSearchParams({ response_type: 'code', client_id: CLOUD_CLIENT_ID, redirect_uri: redirectUri, scope: CLOUD_SCOPES, code_challenge: challenge, code_challenge_method: 'S256', state });
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}${q.toString()}`;
}

interface TokenResponse { readonly access_token: string; readonly refresh_token: string | null; readonly expires_in: number }

function readTokenResponse(payload: unknown): TokenResponse | null {
  if (payload === null || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p['access_token'] !== 'string' || p['access_token'].length === 0) return null;
  const lifetime = p['expires_in'];
  return {
    access_token: p['access_token'],
    refresh_token: typeof p['refresh_token'] === 'string' && p['refresh_token'].length > 0 ? p['refresh_token'] : null,
    expires_in: typeof lifetime === 'number' && Number.isFinite(lifetime) && lifetime > 0 ? lifetime : CLOUD_DEFAULT_LIFETIME_S,
  };
}

function credentialOf(t: TokenResponse, nowSeconds: number, server: CloudServer, endpoints: CloudEndpoints, previous: StoredCredential | null): StoredCredential {
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? previous?.refresh_token ?? '',
    expires_at: Math.floor(nowSeconds + t.expires_in),
    account_id: null,
    extra: { ...(previous?.extra ?? {}), issuer: server.issuer, token_endpoint: endpoints.token, revocation_endpoint: endpoints.revocation, api_base: server.apiBase },
  };
}

/** REQ-PROVIDER-037..040: the whole interactive flow. The listener is closed before this returns, however it ends. */
export async function authenticateCloud(deps: FlowDeps, nowSeconds: () => number, server: CloudServer): Promise<Result<StoredCredential, string>> {
  const endpoints = await discoverCloud(deps, server.issuer);
  if (!endpoints.ok) return endpoints;
  const state = oauthState();
  const verifier = pkceVerifier();
  const listener = await openLoopback({ ports: [], path: CLOUD_CALLBACK_PATH, state, timers: deps.timers, warn: deps.warn });
  if (!listener.ok) return listener;
  let code: Result<string, string>;
  try {
    deps.prompt({ kind: 'browser', url: cloudAuthorizationUrl(endpoints.value.authorization, listener.value.redirectUri, pkceChallenge(verifier), state), message: CLOUD_PROMPT_MESSAGE });
    code = await listener.value.wait(deps.signal);
  } finally {
    await listener.value.close();
  }
  if (!code.ok) return code;
  let response: Response;
  try {
    response = await boundedFetch(deps, endpoints.value.token, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: formBody({ grant_type: 'authorization_code', code: code.value, redirect_uri: listener.value.redirectUri, client_id: CLOUD_CLIENT_ID, code_verifier: verifier }),
    }, TOKEN_TIMEOUT_MS);
  } catch (cause) {
    return err(`Token exchange failed: ${errorText(cause)}`);
  }
  if (response.status !== 200) return err(`Token exchange HTTP ${response.status}`);
  const tokens = readTokenResponse(await response.json().catch(() => null));
  if (!tokens) return err('Token exchange returned no access token');
  return ok(credentialOf(tokens, nowSeconds(), server, endpoints.value, null));
}

/** REQ-PROVIDER-040: refresh against the endpoints the credential recorded; no discovery, no secret. */
export async function refreshCloud(deps: Pick<FlowDeps, 'fetch' | 'signal'>, stored: StoredCredential, nowSeconds: () => number): Promise<Result<StoredCredential, string>> {
  const { issuer, token_endpoint: tokenEndpoint, revocation_endpoint: revocation, api_base: apiBase } = stored.extra;
  if (!tokenEndpoint) return err('Stored OIDC token endpoint is missing');
  if (!issuer || !revocation || !apiBase) return err('Stored OIDC metadata is incomplete');
  if (stored.refresh_token.length === 0) return err('Rotaris Cloud sign-in has expired; sign in again.');
  let response: Response;
  try {
    response = await boundedFetch(deps, tokenEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: formBody({ grant_type: 'refresh_token', refresh_token: stored.refresh_token, client_id: CLOUD_CLIENT_ID }),
    }, TOKEN_TIMEOUT_MS);
  } catch (cause) {
    return err(`Refresh request failed: ${errorText(cause)}`);
  }
  if (response.status !== 200) return err(`Token refresh failed: HTTP ${response.status}`);
  const tokens = readTokenResponse(await response.json().catch(() => null));
  if (!tokens) return err('Token refresh failed: the response carried no access token');
  return ok(credentialOf(tokens, nowSeconds(), { issuer, apiBase }, { authorization: '', token: tokenEndpoint, revocation }, stored));
}

/** REQ-PROVIDER-041: best effort; a failure is reported to `debug` and never blocks the local sign-out. */
export async function revokeCloud(deps: Pick<FlowDeps, 'fetch'>, stored: StoredCredential, debug: (m: string) => void): Promise<void> {
  const endpoint = stored.extra['revocation_endpoint'];
  if (!endpoint || stored.refresh_token.length === 0) return;
  try {
    const r = await boundedFetch(deps, endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ token: stored.refresh_token, token_type_hint: 'refresh_token', client_id: CLOUD_CLIENT_ID }),
    }, REVOKE_TIMEOUT_MS);
    if (r.status >= 400) debug(`Rotaris Cloud revocation answered HTTP ${r.status}`);
  } catch (cause) {
    debug(`Rotaris Cloud revocation failed: ${errorText(cause)}`);
  }
}
