import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import { claudeCodeModels, claudeCodeStatus, CLAUDE_CODE_TOKEN_IS_API_KEY, CLAUDE_CODE_TOKEN_REQUIRED, CLAUDE_CODE_TOKEN_SHAPE, validateSubscriptionToken } from './claude-code.js';
import { authenticateCodex, codexAccountId, codexAuthorizationUrl, CODEX_CLIENT_ID, CODEX_SCOPES, refreshCodex } from './codex.js';
import { authenticateCopilot, copilotDeviceFlow, copilotSessionExchange, copilotStatus, refreshCopilot, COPILOT_CANNOT_REFRESH } from './copilot.js';
import { AUTHENTICATION_TIMED_OUT, openLoopback } from './loopback.js';
import { CANCELLED_BY_USER, pkceChallenge, pkceVerifier, unverifiedJwtClaims, type FlowDeps, type SignInPrompt } from './oauth.js';

const jwt = (claims: Record<string, unknown>): string => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Advances the fake clock until `p` settles, yielding to the event loop between steps so real sockets and fetches make progress. */
async function drive<T>(clock: FakeClock, p: Promise<T>, stepMs = 4_000): Promise<T> {
  let settled = false;
  void p.finally(() => { settled = true; });
  for (let i = 0; i < 400 && !settled; i += 1) {
    await new Promise((r) => setImmediate(r));
    clock.advance(stepMs);
  }
  return p;
}

type TestDeps = Omit<FlowDeps, 'prompt'> & { prompt: (p: SignInPrompt) => void; prompts: SignInPrompt[]; warnings: string[] };
function deps(clock: FakeClock, fetch: FlowDeps['fetch'], over: Partial<FlowDeps> = {}): TestDeps {
  const prompts: SignInPrompt[] = [];
  const warnings: string[] = [];
  return { fetch, timers: clock, prompt: (p) => prompts.push(p), warn: (m) => warnings.push(m), prompts, warnings, ...over };
}

describe('PKCE material and the unverified claim read (REQ-PROVIDER-028, ADR-0030 c.4)', () => {
  it('draws a 43-character verifier from the unreserved set and an S256 challenge of it', () => {
    const v = pkceVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-._~]{43}$/);
    // RFC 7636 appendix B.
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('reads claims without verifying, and answers null for anything that is not a token', () => {
    expect(unverifiedJwtClaims(jwt({ a: 1 }))).toEqual({ a: 1 });
    expect(unverifiedJwtClaims('nonsense')).toBeNull();
    expect(unverifiedJwtClaims(null)).toBeNull();
  });
});

describe('the loopback listener (REQ-PROVIDER-029..031)', () => {
  const open = (clock: FakeClock, warn: (m: string) => void = () => undefined, ports: readonly number[] = []) => openLoopback({ ports, path: '/auth/callback', state: 'S', timers: clock, warn });

  it('answers 404 off the callback path, refuses a state mismatch as forgery, and yields the code on the real callback', async () => {
    const clock = new FakeClock();
    const warnings: string[] = [];
    const l = await open(clock, (m) => warnings.push(m));
    if (!l.ok) throw new Error(l.error);
    const base = `http://127.0.0.1:${l.value.port}`;
    const waiting = l.value.wait();
    expect((await fetch(`${base}/elsewhere`)).status).toBe(404);
    const forged = await fetch(`${base}/auth/callback?code=x&state=other`);
    expect(await forged.text()).toContain('No code received.');
    expect(warnings.join(' ')).toMatch(/forgery/);
    const missing = await fetch(`${base}/auth/callback?state=S`);
    expect(await missing.text()).toContain('No code received.');
    const good = await fetch(`${base}/auth/callback?code=the-code&state=S`);
    expect(await good.text()).toContain('Success!');
    expect(await waiting).toEqual({ ok: true, value: 'the-code' });
    await l.value.close();
  });

  it('fails with the provider\'s error description, renders the failure page', async () => {
    const clock = new FakeClock();
    const l = await open(clock);
    if (!l.ok) throw new Error(l.error);
    const waiting = l.value.wait();
    const page = await fetch(`http://127.0.0.1:${l.value.port}/auth/callback?error=access_denied&error_description=The%20user%20said%20no`);
    expect(await page.text()).toContain('Authentication Failed');
    expect(await waiting).toEqual({ ok: false, error: 'The user said no' });
    await l.value.close();
  });

  it('ends a cancelled wait at once and a silent one at 300 seconds, and releases the port before it returns', async () => {
    const clock = new FakeClock();
    const first = await open(clock);
    if (!first.ok) throw new Error(first.error);
    const port = first.value.port;
    const abort = new AbortController();
    const cancelled = first.value.wait(abort.signal);
    abort.abort();
    expect(await cancelled).toEqual({ ok: false, error: CANCELLED_BY_USER });
    await first.value.close();
    // REQ-PROVIDER-031: a sign-in started immediately afterwards binds the same port.
    const second = await open(clock, () => undefined, [port]);
    if (!second.ok) throw new Error(second.error);
    expect(second.value.port).toBe(port);
    const timed = second.value.wait();
    clock.advance(299_999);
    await new Promise((r) => setImmediate(r));
    clock.advance(1);
    expect(await timed).toEqual({ ok: false, error: AUTHENTICATION_TIMED_OUT });
    await second.value.close();
    expect(clock.pendingCount()).toBe(0);
  });

  it('tries the declared ports in order, never another, and names them when every one is busy', async () => {
    const clock = new FakeClock();
    const squat = (): Promise<{ port: number; close: () => Promise<void> }> => new Promise((resolve) => {
      const s = createServer();
      s.listen(0, '127.0.0.1', () => resolve({ port: (s.address() as { port: number }).port, close: () => new Promise((r) => s.close(() => r())) }));
    });
    const a = await squat();
    const b = await squat();
    const busy = await open(clock, () => undefined, [a.port, b.port]);
    expect(busy.ok).toBe(false);
    if (!busy.ok) { expect(busy.error).toContain(`${a.port}, ${b.port}`); expect(busy.error).toMatch(/must be free/); }
    await b.close();
    const second = await open(clock, () => undefined, [a.port, b.port]);
    if (!second.ok) throw new Error(second.error);
    expect(second.value.port).toBe(b.port);
    await second.value.close();
    await a.close();
  });
});

describe('OpenAI Codex (REQ-PROVIDER-028..034)', () => {
  it('builds the authorization address the requirement fixes', () => {
    const u = new URL(codexAuthorizationUrl('http://localhost:1455/auth/callback', 'CH', 'ST'));
    expect(`${u.origin}${u.pathname}`).toBe('https://auth.openai.com/oauth/authorize');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      response_type: 'code', client_id: CODEX_CLIENT_ID, redirect_uri: 'http://localhost:1455/auth/callback', scope: CODEX_SCOPES,
      code_challenge: 'CH', code_challenge_method: 'S256', id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', state: 'ST', originator: 'codex_cli_rs',
    });
  });

  it('takes the account id from the id token first, then the access token, by the three claims in order', () => {
    expect(codexAccountId(jwt({ chatgpt_account_id: 'top' }), jwt({ chatgpt_account_id: 'access' }))).toBe('top');
    expect(codexAccountId(jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'nested' } }), null)).toBe('nested');
    expect(codexAccountId(jwt({ organizations: [{ id: 'org-1' }] }), null)).toBe('org-1');
    expect(codexAccountId(jwt({}), jwt({ chatgpt_account_id: 'access' }))).toBe('access');
    expect(codexAccountId(jwt({}), 'opaque')).toBeNull();
  });

  it('runs the whole flow: prompt, callback, exchange with the verifier, the credential and its extras', async () => {
    const clock = new FakeClock(0, 1_000_000_000_000);
    let exchanged: URLSearchParams | null = null;
    const d = deps(clock, async (url, init) => {
      expect(url).toBe('https://auth.openai.com/oauth/token');
      exchanged = new URLSearchParams((init?.body as string));
      return json({ access_token: 'at', refresh_token: 'rt', id_token: jwt({ chatgpt_account_id: 'acct' }), expires_in: 120, scope: 'openid' });
    });
    d.prompt = (p) => {
      d.prompts.push(p);
      if (p.kind !== 'browser') return;
      const auth = new URL(p.url);
      const back = new URL(auth.searchParams.get('redirect_uri')!);
      // The listener binds 127.0.0.1; the redirect names localhost, as the identity service expects.
      void fetch(`http://127.0.0.1:${back.port}${back.pathname}?code=abc&state=${auth.searchParams.get('state')}`);
    };
    const r = await authenticateCodex(d, () => 1_000_000_000, undefined, []);
    expect(r).toEqual({ ok: true, value: { access_token: 'at', refresh_token: 'rt', expires_at: 1_000_000_120, account_id: 'acct', extra: { auth_mode: 'chatgpt', requested_scopes: CODEX_SCOPES, scope: 'openid', id_token: expect.any(String) } } });
    expect(d.prompts[0]).toMatchObject({ kind: 'browser', message: 'Sign in with ChatGPT to authenticate Codex.' });
    const sent = exchanged as URLSearchParams | null;
    expect(sent?.get('grant_type')).toBe('authorization_code');
    expect(sent?.get('code')).toBe('abc');
    expect(pkceChallenge(sent?.get('code_verifier') ?? '')).toBe(new URL((d.prompts[0] as { url: string }).url).searchParams.get('code_challenge'));
    expect(clock.pendingCount()).toBe(0);
  });

  it('reports a refused exchange by its status, defaults the lifetime to 3600 seconds, and cancels a pending wait', async () => {
    const clock = new FakeClock();
    const callBack = (d: TestDeps) => (p: SignInPrompt): void => {
      d.prompts.push(p);
      if (p.kind !== 'browser') return;
      const auth = new URL(p.url);
      void fetch(`http://127.0.0.1:${new URL(auth.searchParams.get('redirect_uri')!).port}/auth/callback?code=abc&state=${auth.searchParams.get('state')}`);
    };
    const refused = deps(clock, async () => new Response('no', { status: 403 }));
    refused.prompt = callBack(refused);
    expect(await authenticateCodex(refused, () => 0, undefined, [])).toEqual({ ok: false, error: 'Token exchange HTTP 403' });
    const bare = deps(clock, async () => json({ access_token: 'at' }));
    bare.prompt = callBack(bare);
    const r = await authenticateCodex(bare, () => 100, undefined, []);
    expect(r.ok && r.value.expires_at).toBe(3700);
    expect(r.ok && r.value.account_id).toBeNull();
    const abort = new AbortController();
    const cancelled = deps(clock, async () => json({}), { signal: abort.signal });
    cancelled.prompt = () => abort.abort();
    expect(await authenticateCodex(cancelled, () => 0, undefined, [])).toEqual({ ok: false, error: CANCELLED_BY_USER });
  });

  it('refreshes: keeps the previous refresh token when none comes back, re-derives the account id, names a refusal', async () => {
    const stored = { access_token: 'old', refresh_token: 'rt-1', expires_at: 5, account_id: 'old-acct', extra: { auth_mode: 'chatgpt' } };
    const r = await refreshCodex({ fetch: async (_u, init) => { expect(new URLSearchParams((init?.body as string)).get('grant_type')).toBe('refresh_token'); return json({ access_token: jwt({ chatgpt_account_id: 'new-acct' }), expires_in: 60 }); } }, stored, () => 1000);
    expect(r.ok && r.value).toMatchObject({ refresh_token: 'rt-1', expires_at: 1060, account_id: 'new-acct' });
    expect(await refreshCodex({ fetch: async () => new Response('', { status: 401 }) }, stored, () => 0)).toEqual({ ok: false, error: 'Token refresh failed: HTTP 401' });
    expect(await refreshCodex({ fetch: async () => { throw new Error('offline'); } }, stored, () => 0)).toEqual({ ok: false, error: 'Refresh request failed: offline' });
  });
});

describe('GitHub Copilot (REQ-PROVIDER-020..027)', () => {
  const device = { device_code: 'DC', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 600 };

  it('shows the prompt, polls at interval + 3 seconds through pending and slow_down, and trades the ghu_ token for the bearer', async () => {
    const clock = new FakeClock();
    const polls: number[] = [];
    const answers: unknown[] = [{ error: 'authorization_pending' }, { error: 'slow_down', interval: 10 }, { error: 'slow_down' }, { access_token: 'ghu_durable' }];
    const d = deps(clock, async (url, init) => {
      const headers = new Headers(init?.headers);
      if (url === 'https://github.com/login/device/code') {
        expect(new URLSearchParams((init?.body as string)).has('scope')).toBe(false);
        expect(headers.get('user-agent')).toBe('GithubCopilot/0.28.0');
        expect(headers.get('editor-version')).toBe('vscode/1.99.1');
        return json(device);
      }
      if (url === 'https://github.com/login/oauth/access_token') { polls.push(clock.now()); return json(answers.shift()); }
      expect(url).toBe('https://api.github.com/copilot_internal/v2/token');
      expect(headers.get('authorization')).toBe('token ghu_durable');
      return json({ token: 'bearer-1', expires_at: 2_000_000_000, endpoints: { api: 'https://api.business.githubcopilot.com/' }, sku: 'business' });
    });
    const r = await drive(clock, authenticateCopilot(d), 1_000);
    expect(d.prompts).toEqual([{ kind: 'device-code', verificationUri: device.verification_uri, userCode: 'ABCD-1234', intervalSeconds: 5, expiresInSeconds: 600 }]);
    // 5+3, 5+3, then the server's 10 (+3), then 10+5 (+3).
    expect(polls.map((t, i) => t - (polls[i - 1] ?? 0))).toEqual([8_000, 8_000, 13_000, 18_000]);
    expect(r).toEqual({ ok: true, value: { access_token: 'bearer-1', refresh_token: 'ghu_durable', expires_at: 2_000_000_000, account_id: null, extra: { api_base: 'https://api.business.githubcopilot.com', sku: 'business' } } });
  });

  it('defaults the code lifetime to 900 seconds, rejects a token that is not ghu_, fails on any other error and on a refused poll', async () => {
    const clock = new FakeClock();
    const flow = (answer: unknown, status = 200) => deps(clock, async (url) => (url.endsWith('/device/code') ? json({ ...device, expires_in: undefined }) : json(answer, status)));
    const wrong = flow({ access_token: 'gho_user' });
    const r = await drive(clock, copilotDeviceFlow(wrong));
    expect(wrong.prompts[0]).toMatchObject({ expiresInSeconds: 900 });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toContain('"gho_"'); expect(r.error).toMatch(/not a GitHub App/); }
    expect(await drive(clock, copilotDeviceFlow(flow({ error: 'access_denied' })))).toEqual({ ok: false, error: 'access_denied' });
    expect(await drive(clock, copilotDeviceFlow(flow({}, 503)))).toEqual({ ok: false, error: 'Token poll HTTP 503' });
  });

  it('aborts a pending poll wait on cancellation without waiting it out', async () => {
    const clock = new FakeClock();
    const abort = new AbortController();
    const d = deps(clock, async () => json(device), { signal: abort.signal });
    const flow = copilotDeviceFlow(d);
    await new Promise((r) => setImmediate(r));
    abort.abort();
    expect(await flow).toEqual({ ok: false, error: CANCELLED_BY_USER });
    expect(clock.pendingCount()).toBe(0);
  });

  it('classifies the session exchange: 401 and 404 are authorization failures, anything else transient', async () => {
    expect(await copilotSessionExchange({ fetch: async () => new Response('', { status: 404 }) }, 'ghu_x')).toMatchObject({ ok: false, error: { kind: 'authorization' } });
    expect(await copilotSessionExchange({ fetch: async () => new Response('', { status: 401 }) }, 'ghu_x')).toMatchObject({ ok: false, error: { kind: 'authorization' } });
    expect(await copilotSessionExchange({ fetch: async () => new Response('', { status: 500 }) }, 'ghu_x')).toMatchObject({ ok: false, error: { kind: 'transient' } });
    expect(await copilotSessionExchange({ fetch: async () => new Response('<html>', { status: 200 }) }, 'ghu_x')).toMatchObject({ ok: false, error: { kind: 'transient' } });
  });

  it('classifies status and refreshes through the stored ghu_ token only', async () => {
    const c = (over: object) => ({ access_token: 'b', refresh_token: 'ghu_x', expires_at: 1000, account_id: null, extra: {}, ...over });
    expect(copilotStatus(null, 0)).toBe('unauthenticated');
    expect(copilotStatus(c({ access_token: '' }), 0)).toBe('unauthenticated');
    expect(copilotStatus(c({ refresh_token: 'gho_x' }), 0)).toBe('unauthenticated');
    expect(copilotStatus(c({ expires_at: 0 }), 0)).toBe('expired');
    expect(copilotStatus(c({}), 940)).toBe('expired');
    expect(copilotStatus(c({}), 939)).toBe('authenticated');
    expect(await refreshCopilot({ fetch: async () => json({}) }, c({ refresh_token: '' }))).toEqual({ ok: false, error: COPILOT_CANNOT_REFRESH });
    const r = await refreshCopilot({ fetch: async () => json({ token: 'b2', expires_at: 5000 }) }, c({ extra: { api_base: 'https://tenant', sku: 'pro' } }));
    expect(r.ok && r.value).toMatchObject({ access_token: 'b2', refresh_token: 'ghu_x', expires_at: 5000, extra: { api_base: 'https://tenant', sku: 'pro' } });
  });
});

describe('Claude Code subscription token (REQ-PROVIDER-045, 047)', () => {
  it('validates the pasted token and classifies status by the same validation', () => {
    expect(validateSubscriptionToken('  ')).toEqual({ ok: false, error: CLAUDE_CODE_TOKEN_REQUIRED });
    expect(validateSubscriptionToken('sk-ant-api03-x')).toEqual({ ok: false, error: CLAUDE_CODE_TOKEN_IS_API_KEY });
    expect(validateSubscriptionToken('sk-other')).toEqual({ ok: false, error: CLAUDE_CODE_TOKEN_SHAPE });
    expect(validateSubscriptionToken(' sk-ant-oat01-abc ')).toEqual({ ok: true, value: 'sk-ant-oat01-abc' });
    expect(validateSubscriptionToken('sk-ant-oat01-ü').ok).toBe(false);
    expect(claudeCodeStatus({ access_token: 'sk-ant-oat01-abc', refresh_token: '', expires_at: 0, account_id: null, extra: {} })).toBe('authenticated');
    expect(claudeCodeStatus({ access_token: 'sk-ant-api03-x', refresh_token: '', expires_at: 0, account_id: null, extra: {} })).toBe('unauthenticated');
    expect(claudeCodeStatus(null)).toBe('unauthenticated');
  });
  it('offers exactly the three aliases, offline', () => {
    expect(claudeCodeModels().map((m) => [m.qualifiedId, m.displayName])).toEqual([['claude-code/opus', 'Claude Opus (subscription)'], ['claude-code/sonnet', 'Claude Sonnet (subscription)'], ['claude-code/haiku', 'Claude Haiku (subscription)']]);
  });
});
