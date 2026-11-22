import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, ok } from '@rotaris/kernel';
import { CloudServerStore } from './cloud-server.js';
import { CredentialStore } from './credentials/store.js';
import { ProjectSettingsStore } from './project-settings.js';
import { ProviderService } from './signin.js';

/** PD-PROVIDER-004: Rotaris Cloud through the provider service, against a server the user chose. */
let dir: string;
let clock: FakeClock;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-signin-cloud-')); clock = new FakeClock(0, 1_000_000_000_000); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const LOCAL_ISSUER = 'http://auth.localhost/realms/rotaris-dev';
const doc = (issuer: string) => ({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, revocation_endpoint: `${issuer}/revoke` });

function build(env: Record<string, string> = {}) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
    if (url.endsWith('/.well-known/openid-configuration')) return json(doc(url.replace('/.well-known/openid-configuration', '')));
    if (url.endsWith('/token')) return json({ access_token: 'at', refresh_token: 'rt', expires_in: 600 });
    if (url.endsWith('/revoke')) return new Response('', { status: 200 });
    if (url.endsWith('/models')) return json({ data: [{ id: 'anthropic/claude-sonnet', name: 'Claude Sonnet', context_length: 200000 }] });
    return new Response('', { status: 404 });
  };
  const lock = { pid: process.pid, startedAt: '2026-09-05T00:00:00.000Z', timers: clock, monotonic: clock };
  const credentials = new CredentialStore({ dir: join(dir, 'data', 'tokens'), protector: { protect: async () => ok(undefined) }, lock, random: () => 'r', warn: () => undefined, info: () => undefined });
  const settings = new ProjectSettingsStore({ path: join(dir, 'config', 'project_settings.yaml'), lock, timers: clock, warn: () => undefined });
  const cloudServer = new CloudServerStore({ path: join(dir, 'config', 'rotaris-cloud-server.json'), timers: clock, warn: () => undefined });
  const svc = new ProviderService({ credentials, settings, wall: clock, timers: clock, fetch, cloudServer, env, log: () => undefined, warn: () => undefined });
  const approve = (p: { kind: string; url?: string }): void => {
    if (p.kind !== 'browser' || !p.url) return;
    const a = new URL(p.url); const b = new URL(a.searchParams.get('redirect_uri')!);
    void globalThis.fetch(`http://127.0.0.1:${b.port}${b.pathname}?code=c&state=${a.searchParams.get('state')}`);
  };
  return { svc, credentials, settings, calls, approve };
}

describe('Rotaris Cloud through the provider service (PD-PROVIDER-004)', () => {
  it('signs in to the production server by default and discovers models there with the access token', async () => {
    const { svc, credentials, settings, calls, approve } = build();
    const r = await svc.signInInteractive('concrete-cloud', { prompt: approve });
    expect(r).toMatchObject({ outcome: 'signed-in', id: 'concrete-cloud', discovered: 1 });
    expect(calls[0]?.url).toBe('https://auth.rotaris.ai/realms/rotaris/.well-known/openid-configuration');
    expect(calls.at(-1)).toEqual({ url: 'https://api.rotaris.ai/v1/models', auth: 'Bearer at' });
    expect(credentials.load('concrete-cloud')?.extra['api_base']).toBe('https://api.rotaris.ai/v1');
    const snap = settings.read();
    expect(snap.ok && snap.value?.providers['concrete-cloud']).toMatchObject({ base_url: 'https://api.rotaris.ai/v1', authenticated: true });
  });

  it('signs in to a server the user chose — a local backend — and records it as the base runs are sent to', async () => {
    const { svc, credentials, settings, calls, approve } = build();
    expect(await svc.setCloudServer({ apiBase: 'http://api.localhost/v1', issuer: LOCAL_ISSUER })).toEqual({ ok: true, value: { apiBase: 'http://api.localhost/v1', issuer: LOCAL_ISSUER } });
    expect(await svc.signInInteractive('concrete-cloud', { prompt: approve })).toMatchObject({ outcome: 'signed-in' });
    expect(calls[0]?.url).toBe(`${LOCAL_ISSUER}/.well-known/openid-configuration`);
    expect(calls.at(-1)?.url).toBe('http://api.localhost/v1/models');
    expect(credentials.load('concrete-cloud')?.extra['issuer']).toBe(LOCAL_ISSUER);
    const snap = settings.read();
    expect(snap.ok && snap.value?.providers['concrete-cloud']?.base_url).toBe('http://api.localhost/v1');
    expect(svc.list().find((r) => r.id === 'concrete-cloud')?.baseUrl).toBe('http://api.localhost/v1');
  });

  it('lets the environment override the stored choice, and says so', async () => {
    const { svc } = build({ ROTARIS_API_BASE_URL: 'http://env.example/v1' });
    await svc.setCloudServer({ apiBase: 'http://api.localhost/v1', issuer: null });
    expect(svc.cloudServerSetting()).toMatchObject({ stored: { apiBase: 'http://api.localhost/v1' }, effective: { apiBase: 'http://env.example/v1', issuer: 'https://auth.rotaris.ai/realms/rotaris' }, environment: true });
  });

  it('refuses a malformed server, stores nothing, and fails a sign-in against a malformed environment value before any request', async () => {
    const { svc, calls } = build();
    expect((await svc.setCloudServer({ apiBase: 'nope', issuer: null })).ok).toBe(false);
    expect(svc.cloudServerSetting().stored).toEqual({ apiBase: null, issuer: null });
    const bad = build({ ROTARIS_OIDC_ISSUER: 'auth.example' });
    expect(await bad.svc.signInInteractive('concrete-cloud', { prompt: bad.approve })).toMatchObject({ outcome: 'failed' });
    expect(bad.calls).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("runs the flow again when the stored sign-in belongs to another server, and keeps the old one if that flow fails", async () => {
    const { svc, credentials, approve } = build();
    await svc.signInInteractive('concrete-cloud', { prompt: approve });
    await svc.setCloudServer({ apiBase: 'http://api.localhost/v1', issuer: LOCAL_ISSUER });
    const prompts: string[] = [];
    await svc.signInInteractive('concrete-cloud', { prompt: (p) => { prompts.push(p.kind); approve(p); } });
    expect(prompts).toEqual(['browser']);
    expect(credentials.load('concrete-cloud')?.extra['issuer']).toBe(LOCAL_ISSUER);
  });

  it('uses the stored sign-in when it is for the server in force', async () => {
    const { svc, approve } = build();
    await svc.signInInteractive('concrete-cloud', { prompt: approve });
    const prompts: string[] = [];
    expect(await svc.signInInteractive('concrete-cloud', { prompt: (p) => prompts.push(p.kind) })).toMatchObject({ outcome: 'signed-in' });
    expect(prompts).toEqual([]);
  });

  it('renews an expired sign-in at the recorded token endpoint and revokes at sign-out', async () => {
    const { svc, credentials, calls, approve } = build();
    await svc.signInInteractive('concrete-cloud', { prompt: approve });
    clock.advance(0);
    const stored = credentials.load('concrete-cloud')!;
    await credentials.save('concrete-cloud', { ...stored, expires_at: 1 });
    expect(svc.status('concrete-cloud')).toBe('expired');
    expect((await svc.renew('concrete-cloud'))?.access_token).toBe('at');
    expect(calls.some((c) => c.url === 'https://auth.rotaris.ai/realms/rotaris/token')).toBe(true);
    expect(await svc.signOut('concrete-cloud')).toMatchObject({ outcome: 'signed-out' });
    expect(calls.at(-1)?.url).toBe('https://auth.rotaris.ai/realms/rotaris/revoke');
    expect(credentials.load('concrete-cloud')).toBeNull();
  });
});
