import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import { CloudServerStore } from '../cloud-server.js';
import type { StoredCredential } from '../credentials/store.js';
import { authenticateCloud, CLOUD_DEFAULT_API_BASE, CLOUD_DEFAULT_ISSUER, discoverCloud, refreshCloud, resolveCloudServer, revokeCloud } from './cloud.js';
import { pkceChallenge, type FlowDeps, type SignInPrompt } from './oauth.js';

/** PD-PROVIDER-004; REQ-PROVIDER-037..041. */
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ISSUER = 'http://auth.localhost/realms/rotaris-dev';
const discovery = { issuer: ISSUER, authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`, token_endpoint: `${ISSUER}/protocol/openid-connect/token`, revocation_endpoint: `${ISSUER}/protocol/openid-connect/revoke` };
const SERVER = { apiBase: 'http://api.localhost/v1', issuer: ISSUER };

describe('the server in force (PD-PROVIDER-004 clause 3)', () => {
  it('takes the environment over the stored choice over the production default, each half on its own', () => {
    expect(resolveCloudServer(null, {})).toEqual({ ok: true, value: { apiBase: CLOUD_DEFAULT_API_BASE, issuer: CLOUD_DEFAULT_ISSUER } });
    expect(resolveCloudServer({ apiBase: 'http://api.localhost/v1/', issuer: null }, {})).toEqual({ ok: true, value: { apiBase: 'http://api.localhost/v1', issuer: CLOUD_DEFAULT_ISSUER } });
    expect(resolveCloudServer({ apiBase: 'http://stored/v1', issuer: 'http://stored/realms/x/' }, { ROTARIS_OIDC_ISSUER: `${ISSUER}/`, ROTARIS_API_BASE_URL: '  ' })).toEqual({ ok: true, value: { apiBase: 'http://stored/v1', issuer: ISSUER } });
  });
  it('refuses a malformed value instead of falling back to production', () => {
    expect(resolveCloudServer({ apiBase: 'not a url', issuer: null }, {}).ok).toBe(false);
    expect(resolveCloudServer(null, { ROTARIS_OIDC_ISSUER: 'auth.example' }).ok).toBe(false);
    expect(resolveCloudServer({ apiBase: 'ftp://x/v1', issuer: null }, {}).ok).toBe(false);
  });
});

describe('the stored choice', () => {
  let dir: string;
  const clock = new FakeClock();
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-cloud-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const store = (): CloudServerStore => new CloudServerStore({ path: join(dir, 'cfg', 'rotaris-cloud-server.json'), timers: clock, warn: () => undefined });

  it('round-trips, stores a half equal to the default as absent, and restores production on empty', async () => {
    const s = store();
    expect(s.read()).toBeNull();
    expect(await s.write({ apiBase: 'http://api.localhost/v1/', issuer: CLOUD_DEFAULT_ISSUER })).toEqual({ ok: true, value: { apiBase: 'http://api.localhost/v1', issuer: null } });
    expect(JSON.parse(readFileSync(join(dir, 'cfg', 'rotaris-cloud-server.json'), 'utf8'))).toEqual({ api_base: 'http://api.localhost/v1' });
    expect(s.read()).toEqual({ apiBase: 'http://api.localhost/v1', issuer: null });
    await s.write({ apiBase: '', issuer: null });
    expect(s.read()).toEqual({ apiBase: null, issuer: null });
  });
  it('refuses a malformed URL and writes nothing', async () => {
    const s = store();
    const r = await s.write({ apiBase: 'nope', issuer: null });
    expect(r.ok).toBe(false);
    expect(s.read()).toBeNull();
  });
  it('ignores a file it cannot read', () => {
    const s = store();
    writeFileSync(join(dir, 'x.json'), '{');
    const bad = new CloudServerStore({ path: join(dir, 'x.json'), timers: clock, warn: () => undefined });
    expect(bad.read()).toBeNull();
    expect(s.read()).toBeNull();
  });
});

describe('Rotaris Cloud OIDC (REQ-PROVIDER-037..041)', () => {
  /** The prompt is recorded, then handed to `onPrompt` (the user's browser, here). */
  const deps = (fetch: FlowDeps['fetch'], onPrompt: (p: SignInPrompt) => void = () => undefined, clock = new FakeClock(0, 1_000_000_000_000)): FlowDeps & { prompts: SignInPrompt[] } => {
    const prompts: SignInPrompt[] = [];
    return { fetch, timers: clock, prompt: (p) => { prompts.push(p); onPrompt(p); }, warn: () => undefined, prompts };
  };
  const approve = (p: SignInPrompt): void => {
    if (p.kind !== 'browser') return;
    const a = new URL(p.url); const b = new URL(a.searchParams.get('redirect_uri')!);
    expect(b.pathname).toBe('/callback');
    void fetch(`http://127.0.0.1:${b.port}${b.pathname}?code=abc&state=${a.searchParams.get('state')}`);
  };

  it('discovers the endpoints and refuses a document naming another issuer or omitting an endpoint (038)', async () => {
    expect(await discoverCloud(deps(async () => json(discovery)), ISSUER)).toEqual({ ok: true, value: { authorization: discovery.authorization_endpoint, token: discovery.token_endpoint, revocation: discovery.revocation_endpoint } });
    expect(await discoverCloud(deps(async () => json({ ...discovery, issuer: 'http://evil/realms/x' })), ISSUER)).toEqual({ ok: false, error: 'OIDC discovery issuer did not match configured issuer' });
    expect(await discoverCloud(deps(async () => json({ ...discovery, revocation_endpoint: undefined })), ISSUER)).toEqual({ ok: false, error: 'OIDC discovery omitted a required endpoint' });
    expect(await discoverCloud(deps(async () => json({}, 404)), ISSUER)).toEqual({ ok: false, error: 'OIDC discovery HTTP 404' });
    const unreachable = await discoverCloud(deps(async () => { throw new Error('ECONNREFUSED'); }), ISSUER);
    expect(unreachable.ok === false && unreachable.error).toContain(`at ${ISSUER}`);
  });

  it('runs the whole flow on an ephemeral loopback port and records the server in the credential (037, 039, 040)', async () => {
    let exchanged: URLSearchParams | null = null;
    const d = deps(async (url, init) => {
      if (url === `${ISSUER}/.well-known/openid-configuration`) return json(discovery);
      expect(url).toBe(discovery.token_endpoint);
      exchanged = new URLSearchParams(init?.body as string);
      return json({ access_token: 'at', refresh_token: 'rt', expires_in: 60 });
    }, approve);
    const r = await authenticateCloud(d, () => 1_000_000_000, SERVER);
    expect(r).toEqual({ ok: true, value: { access_token: 'at', refresh_token: 'rt', expires_at: 1_000_000_060, account_id: null, extra: { issuer: ISSUER, token_endpoint: discovery.token_endpoint, revocation_endpoint: discovery.revocation_endpoint, api_base: SERVER.apiBase } } });
    const auth = new URL((d.prompts[0] as { url: string }).url);
    expect(auth.origin + auth.pathname).toBe(discovery.authorization_endpoint);
    expect(auth.searchParams.get('client_id')).toBe('rotaris-ai');
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    const sent = exchanged as URLSearchParams | null;
    expect(sent?.get('client_secret')).toBeNull();
    expect(sent?.get('client_id')).toBe('rotaris-ai');
    expect(pkceChallenge(sent?.get('code_verifier') ?? '')).toBe(auth.searchParams.get('code_challenge'));
  });

  it('defaults the lifetime to 900 seconds and names a refused exchange', async () => {
    const answer = (token: Response) => async (url: string) => (url.endsWith('openid-configuration') ? json(discovery) : token);
    const a = deps(answer(json({ access_token: 'at' })), approve);
    const ok = await authenticateCloud(a, () => 100, SERVER);
    expect(ok.ok && ok.value.expires_at).toBe(1000);
    const b = deps(answer(json({}, 400)), approve);
    expect(await authenticateCloud(b, () => 100, SERVER)).toEqual({ ok: false, error: 'Token exchange HTTP 400' });
  });

  const stored: StoredCredential = { access_token: 'old', refresh_token: 'rt', expires_at: 1, account_id: null, extra: { issuer: ISSUER, token_endpoint: discovery.token_endpoint, revocation_endpoint: discovery.revocation_endpoint, api_base: SERVER.apiBase } };

  it('refreshes against the recorded endpoint with no secret and keeps the refresh token when none returns (040)', async () => {
    let body: URLSearchParams | null = null;
    const r = await refreshCloud(deps(async (url, init) => { expect(url).toBe(discovery.token_endpoint); body = new URLSearchParams(init?.body as string); return json({ access_token: 'new', expires_in: 30 }); }), stored, () => 500);
    expect(r).toEqual({ ok: true, value: { ...stored, access_token: 'new', expires_at: 530 } });
    const sent = body as URLSearchParams | null;
    expect(sent?.get('grant_type')).toBe('refresh_token');
    expect(sent?.get('client_secret')).toBeNull();
  });
  it('refuses a credential without its endpoints and names a refused refresh (040)', async () => {
    const never = deps(async () => { throw new Error('no request expected'); });
    expect(await refreshCloud(never, { ...stored, extra: {} }, () => 0)).toEqual({ ok: false, error: 'Stored OIDC token endpoint is missing' });
    expect(await refreshCloud(never, { ...stored, extra: { token_endpoint: 'x' } }, () => 0)).toEqual({ ok: false, error: 'Stored OIDC metadata is incomplete' });
    expect(await refreshCloud(deps(async () => json({}, 400)), stored, () => 0)).toEqual({ ok: false, error: 'Token refresh failed: HTTP 400' });
  });
  it('revokes the refresh token best effort and never throws (041)', async () => {
    let body: URLSearchParams | null = null;
    await revokeCloud({ fetch: async (url, init) => { expect(url).toBe(discovery.revocation_endpoint); body = new URLSearchParams(init?.body as string); return new Response('', { status: 200 }); } }, stored, () => undefined);
    const sent = body as URLSearchParams | null;
    expect(sent?.get('token')).toBe('rt');
    expect(sent?.get('token_type_hint')).toBe('refresh_token');
    const debug: string[] = [];
    await revokeCloud({ fetch: async () => { throw new Error('down'); } }, stored, (m) => debug.push(m));
    expect(debug).toHaveLength(1);
  });
});
