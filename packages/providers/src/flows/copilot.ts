import { err, ok, type Result } from '@rotaris/kernel';
import type { CredentialStatus, StoredCredential } from '../credentials/store.js';
import { boundedFetch, cancellableWait, CANCELLED_BY_USER, errorText, formBody, type FlowDeps } from './oauth.js';

/**
 * REQ-PROVIDER-020..027 — GitHub Copilot: the OAuth device flow (RFC 8628) yields a durable GitHub App user token
 * (`ghu_`), which is traded at once for a short-lived bearer scoped to Copilot's model API. The bearer is the access
 * token; the `ghu_` token is the refresh token; the tenant API base and the SKU are extras. The identifiers below are
 * build data the specification fixes.
 */
export const COPILOT_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const COPILOT_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const COPILOT_SESSION_URL = 'https://api.github.com/copilot_internal/v2/token';
export const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
export const COPILOT_USER_AGENT = 'GithubCopilot/0.28.0';
export const COPILOT_EDITOR_VERSION = 'vscode/1.99.1';
export const COPILOT_PLUGIN_VERSION = 'copilot-chat/0.28.0';
export const COPILOT_DEFAULT_CODE_LIFETIME_S = 900;
export const COPILOT_EXPIRY_MARGIN_S = 60;
export const COPILOT_CANNOT_REFRESH = 'Stored token cannot be refreshed; re-authentication required';
const DEVICE_TIMEOUT_MS = 30_000;
const SESSION_TIMEOUT_MS = 15_000;
const POLL_SLACK_S = 3;

/** REQ-PROVIDER-021. */
const DEVICE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  Accept: 'application/json', 'User-Agent': COPILOT_USER_AGENT, 'Editor-Version': COPILOT_EDITOR_VERSION, 'Editor-Plugin-Version': COPILOT_PLUGIN_VERSION,
});

/** REQ-PROVIDER-070: the editor identity every call to Copilot's model API carries — discovery and dispatch alike. */
export const COPILOT_API_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Copilot-Integration-Id': 'vscode-chat', 'Editor-Version': COPILOT_EDITOR_VERSION, 'Editor-Plugin-Version': COPILOT_PLUGIN_VERSION,
  'OpenAI-Intent': 'conversation-panel', 'User-Agent': COPILOT_USER_AGENT, Accept: 'application/json',
});

/** REQ-PROVIDER-027. */
export function copilotStatus(c: StoredCredential | null, nowSeconds: number): CredentialStatus {
  if (c === null || c.access_token.length === 0) return 'unauthenticated';
  if (c.refresh_token.length > 0 && !c.refresh_token.startsWith('ghu_')) return 'unauthenticated';
  if (c.expires_at <= 0) return 'expired';
  if (nowSeconds >= c.expires_at - COPILOT_EXPIRY_MARGIN_S) return 'expired';
  return 'authenticated';
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  const body: unknown = await response.json().catch(() => null);
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** REQ-PROVIDER-020..024: the device flow, to the `ghu_` token. */
export async function copilotDeviceFlow(deps: FlowDeps): Promise<Result<string, string>> {
  let started: Response;
  try {
    started = await boundedFetch(deps, COPILOT_DEVICE_CODE_URL, { method: 'POST', headers: { ...DEVICE_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }, body: formBody({ client_id: COPILOT_CLIENT_ID }) }, DEVICE_TIMEOUT_MS);
  } catch (cause) {
    return err(deps.signal?.aborted ? CANCELLED_BY_USER : `Device code request failed: ${errorText(cause)}`);
  }
  if (started.status !== 200) return err(`Device code HTTP ${started.status}`);
  const device = await readJson(started);
  const deviceCode = device?.['device_code'];
  const userCode = device?.['user_code'];
  const verificationUri = device?.['verification_uri'];
  if (typeof deviceCode !== 'string' || typeof userCode !== 'string' || typeof verificationUri !== 'string') return err('Device code response was incomplete');
  let interval = typeof device?.['interval'] === 'number' && device['interval'] > 0 ? device['interval'] : 5;
  const lifetime = typeof device?.['expires_in'] === 'number' && device['expires_in'] > 0 ? device['expires_in'] : COPILOT_DEFAULT_CODE_LIFETIME_S;
  deps.prompt({ kind: 'device-code', verificationUri, userCode, intervalSeconds: interval, expiresInSeconds: lifetime });

  let waited = 0;
  for (;;) {
    // REQ-PROVIDER-023: `interval + 3.0` seconds per cycle.
    const cycle = interval + POLL_SLACK_S;
    if (!(await cancellableWait(deps.timers, cycle * 1000, deps.signal))) return err(CANCELLED_BY_USER);
    waited += cycle;
    let polled: Response;
    try {
      polled = await boundedFetch(deps, COPILOT_ACCESS_TOKEN_URL, {
        method: 'POST', headers: { ...DEVICE_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody({ client_id: COPILOT_CLIENT_ID, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
      }, DEVICE_TIMEOUT_MS);
    } catch (cause) {
      return err(deps.signal?.aborted ? CANCELLED_BY_USER : `Token poll failed: ${errorText(cause)}`);
    }
    if (polled.status !== 200) return err(`Token poll HTTP ${polled.status}`);
    const answer = await readJson(polled);
    const token = answer?.['access_token'];
    if (typeof token === 'string' && token.length > 0) {
      // REQ-PROVIDER-024: only a GitHub App user token will do.
      if (!token.startsWith('ghu_')) return err(`The device flow returned a token with the prefix "${token.slice(0, 4)}" where a GitHub App user token (ghu_) was expected; the client id is probably not a GitHub App.`);
      return ok(token);
    }
    const code = answer?.['error'];
    if (code === 'authorization_pending') { if (waited >= lifetime) return err('expired_token'); continue; }
    if (code === 'slow_down') {
      const next = answer?.['interval'];
      interval = typeof next === 'number' && Number.isInteger(next) && next > 0 ? next : interval + 5;
      continue;
    }
    return err(typeof code === 'string' && code.length > 0 ? code : 'The device flow returned neither a token nor an error');
  }
}

export type SessionFailure = { readonly kind: 'authorization' | 'transient'; readonly detail: string };

/** REQ-PROVIDER-025: the `ghu_` token traded for the bearer, its expiry, the tenant API base and the SKU. */
export async function copilotSessionExchange(deps: Pick<FlowDeps, 'fetch' | 'signal'>, ghuToken: string): Promise<Result<StoredCredential, SessionFailure>> {
  let response: Response;
  try {
    response = await boundedFetch(deps, COPILOT_SESSION_URL, { method: 'GET', headers: { ...DEVICE_HEADERS, Authorization: `token ${ghuToken}` } }, SESSION_TIMEOUT_MS);
  } catch (cause) {
    return err({ kind: 'transient', detail: errorText(cause) });
  }
  if (response.status === 401 || response.status === 404) return err({ kind: 'authorization', detail: `HTTP ${response.status} — the account has no Copilot entitlement, or the token is not a GitHub App user token` });
  if (response.status !== 200) return err({ kind: 'transient', detail: `HTTP ${response.status}` });
  const body = await readJson(response);
  if (!body) return err({ kind: 'transient', detail: 'the response was not JSON' });
  const bearer = body['token'];
  const expiry = body['expires_at'];
  if (typeof bearer !== 'string' || bearer.length === 0 || typeof expiry !== 'number' || !Number.isFinite(expiry)) return err({ kind: 'transient', detail: 'the response carried no bearer or no expiry' });
  const extra: Record<string, string> = {};
  const endpoints = body['endpoints'];
  const api = endpoints !== null && typeof endpoints === 'object' ? (endpoints as Record<string, unknown>)['api'] : null;
  if (typeof api === 'string' && api.length > 0) extra['api_base'] = api.replace(/\/+$/, '');
  if (typeof body['sku'] === 'string' && body['sku'].length > 0) extra['sku'] = body['sku'];
  // REQ-PROVIDER-026: bearer, durable token, the response's own expiry, the extras.
  return ok({ access_token: bearer, refresh_token: ghuToken, expires_at: Math.floor(expiry), account_id: null, extra });
}

/** REQ-PROVIDER-020..026: the whole interactive flow. */
export async function authenticateCopilot(deps: FlowDeps): Promise<Result<StoredCredential, string>> {
  const ghu = await copilotDeviceFlow(deps);
  if (!ghu.ok) return ghu;
  const session = await copilotSessionExchange(deps, ghu.value);
  return session.ok ? session : err(`Copilot session exchange failed: ${session.error.detail}`);
}

/** REQ-PROVIDER-027: the non-interactive refresh — the stored `ghu_` token back through the session exchange. */
export async function refreshCopilot(deps: Pick<FlowDeps, 'fetch' | 'signal'>, stored: StoredCredential): Promise<Result<StoredCredential, string>> {
  if (!stored.refresh_token.startsWith('ghu_')) return err(COPILOT_CANNOT_REFRESH);
  const session = await copilotSessionExchange(deps, stored.refresh_token);
  if (!session.ok) return err(`Copilot session exchange failed: ${session.error.detail}`);
  return ok({ ...session.value, extra: { ...stored.extra, ...session.value.extra } });
}
