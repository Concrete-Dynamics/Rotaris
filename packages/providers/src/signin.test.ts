import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, ok } from '@rotaris/kernel';
import { CredentialStore } from './credentials/store.js';
import { ProjectSettingsStore } from './project-settings.js';
import { ProviderService } from './signin.js';

let dir: string;
let clock: FakeClock;
let log: string[];
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-signin-')); clock = new FakeClock(); log = []; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const KEY = 'sk-or-v1-0123456789abcdef';
const OR = 'https://openrouter.ai/api/v1';
const catalogue = { data: [{ id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', context_length: 200000 }, { id: 'openai/gpt-4o', context_length: 128000 }, { id: 'openai/gpt-4o-mini' }] };

function fetchWith(handler: (url: string, headers: Headers) => Response | Promise<Response>) {
  return async (url: string, init?: RequestInit) => handler(url, new Headers(init?.headers));
}
const okCatalogue = fetchWith((_u, h) => new Response(h.get('authorization') === `Bearer ${KEY}` ? JSON.stringify(catalogue) : '{}', { status: h.get('authorization') === `Bearer ${KEY}` ? 200 : 401 }));

function service(fetch = okCatalogue) {
  const lock = { pid: process.pid, startedAt: '2026-09-05T00:00:00.000Z', timers: clock, monotonic: clock };
  const credentials = new CredentialStore({ dir: join(dir, 'data', 'tokens'), protector: { protect: async () => ok(undefined) }, lock, random: () => 'r', warn: (m) => log.push(`warn:${m}`), info: (m) => log.push(`info:${m}`) });
  const settings = new ProjectSettingsStore({ path: join(dir, 'config', 'project_settings.yaml'), lock, timers: clock, warn: (m) => log.push(`warn:${m}`) });
  const svc = new ProviderService({ credentials, settings, wall: clock, fetch, log: (m) => log.push(`log:${m}`), warn: (m) => log.push(`warn:${m}`) });
  return { svc, credentials, settings };
}

describe('the API-key sign-in for an OpenAI-compatible instance (ADR-0030; REQ-PROVIDER-051..054/133)', () => {
  it('validates, discovers, persists the credential only after discovery, writes the snapshot with picks, reports the outcome', async () => {
    const { svc, credentials, settings } = service();
    const r = await svc.addInstance({ label: 'OpenRouter', baseUrl: `${OR}/`, apiKey: ` ${KEY} ` });
    expect(r).toMatchObject({ outcome: 'signed-in', id: 'openai-compatible--openrouter', discovered: 3, message: 'Added OpenRouter; discovered 3 model(s).' });
    const cred = credentials.load('openai-compatible--openrouter')!;
    expect(cred.access_token).toBe(KEY);
    expect(cred.expires_at).toBe(0);
    expect(cred.extra).toEqual({ provider_family: 'openai-compatible', api_base: OR });
    const snap = settings.read();
    expect(snap.ok && snap.value?.providers['openai-compatible--openrouter']).toMatchObject({ display_name: 'OpenRouter', family: 'openai-compatible', base_url: OR, authenticated: true });
    const rec = snap.ok ? snap.value!.providers['openai-compatible--openrouter']! : null;
    expect(rec!.small_model).toBe('openai-compatible--openrouter/anthropic/claude-haiku-4.5');
    expect(rec!.large_model).toBe('openai-compatible--openrouter/openai/gpt-4o');
    expect(rec!.models.map((m) => m.id)).toEqual(['openai-compatible--openrouter/anthropic/claude-haiku-4.5', 'openai-compatible--openrouter/openai/gpt-4o-mini', 'openai-compatible--openrouter/openai/gpt-4o']);
    expect(readFileSync(settings.path, 'utf8')).not.toContain(KEY);
    expect(svc.status('openai-compatible--openrouter')).toBe('authenticated');
    expect(svc.method('openai-compatible--openrouter')).toBe('api-key');
  });
  it('a bad key is never stored: discovery 401 ends in failure with the key redacted and the last error recorded', async () => {
    const { svc, credentials } = service();
    const r = await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: 'sk-or-wrong' });
    expect(r).toMatchObject({ outcome: 'failed', message: 'Authentication failed for OpenRouter: 401' });
    expect(credentials.exists('openai-compatible--openrouter')).toBe(false);
    expect(svc.lastError('openai-compatible--openrouter')).toBe('Authentication failed for OpenRouter: 401');
    const r2 = await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: 'sk-or-wrong' });
    expect(JSON.stringify(r2)).not.toContain('sk-or-wrong');
  });
  it('zero models is not an error but a choice; continuing anyway persists', async () => {
    const empty = fetchWith(() => new Response('{"data":[]}', { status: 200 }));
    const { svc, credentials } = service(empty);
    expect(await svc.addInstance({ label: 'Empty', baseUrl: OR, apiKey: KEY })).toMatchObject({ outcome: 'no-models', message: 'no models discovered.' });
    expect(credentials.exists('openai-compatible--empty')).toBe(false);
    expect(await svc.addInstance({ label: 'Empty', baseUrl: OR, apiKey: KEY, allowEmpty: true })).toMatchObject({ outcome: 'signed-in', discovered: 0 });
    expect(credentials.exists('openai-compatible--empty')).toBe(true);
  });
  it('an existing instance needs confirmation before replacement (REQ-PROVIDER-052); label and URL errors are named', async () => {
    const { svc } = service();
    await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY });
    expect(await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY })).toEqual({ outcome: 'needs-confirmation', id: 'openai-compatible--openrouter', message: "Replace the existing provider instance 'OpenRouter'?" });
    expect(await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY, replace: true })).toMatchObject({ outcome: 'signed-in' });
    expect(await svc.addInstance({ label: '---', baseUrl: OR, apiKey: KEY })).toEqual({ outcome: 'failed', message: 'Label must contain at least one letter or number.' });
    expect(await svc.addInstance({ label: 'x', baseUrl: '', apiKey: KEY })).toEqual({ outcome: 'failed', message: 'API base URL must not be empty.' });
    expect(await svc.addInstance({ label: 'x', baseUrl: OR, apiKey: '' })).toEqual({ outcome: 'failed', message: 'API key is required.' });
  });
  it('a snapshot write failure rolls the credential back (REQ-PROVIDER-054)', async () => {
    const poison = fetchWith(() => new Response(JSON.stringify({ data: [{ id: 'm', name: 'ghp_notreally' }] }), { status: 200 }));
    const { svc, credentials } = service(poison);
    const r = await svc.addInstance({ label: 'Bad', baseUrl: OR, apiKey: KEY });
    expect(r.outcome).toBe('failed');
    if (r.outcome === 'failed') expect(r.message).toMatch(/^Could not save provider openai-compatible--bad: Refusing to write snapshot/);
    expect(credentials.exists('openai-compatible--bad')).toBe(false);
  });
});

describe('the rest of the provider service', () => {
  it('a built-in api-key provider signs in the same way (deepseek); the other methods are refused by name in this build', async () => {
    const seen: string[] = [];
    const { svc } = service(fetchWith((u) => { seen.push(u); return new Response(JSON.stringify({ data: [{ id: 'deepseek-chat' }] }), { status: 200 }); }));
    expect(await svc.signInWithKey('deepseek', KEY)).toMatchObject({ outcome: 'signed-in', message: 'Login complete for DeepSeek; discovered 1 model(s).' });
    expect(seen).toEqual(['https://api.deepseek.com/models']);
    expect(await svc.signInWithKey('copilot', KEY)).toMatchObject({ outcome: 'failed' });
    expect((await svc.signInWithKey('copilot', KEY) as { message: string }).message).toContain('Code shown here, entered at the provider');
    expect(await svc.signInWithKey('claude-code', KEY)).toMatchObject({ outcome: 'failed' });
    expect(await svc.signInWithKey('concrete-cloud', KEY)).toEqual({ outcome: 'failed', message: 'Rotaris Cloud is coming soon.' });
    expect((await svc.signInWithKey('nope', KEY) as { message: string }).message).toMatch(/^Unknown provider: nope/);
  });
  it('the provider list is the union by id with method label, masked key, base URL and count (REQ-PROVIDER-140/107)', async () => {
    const { svc } = service();
    await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY });
    const rows = svc.list();
    expect(rows.map((r) => r.id)).toEqual(['claude-code', 'codex', 'concrete-cloud', 'copilot', 'deepseek', 'openai-compatible', 'openai-compatible--openrouter']);
    const or = rows.find((r) => r.id === 'openai-compatible--openrouter')!;
    expect(or).toMatchObject({ displayName: 'OpenRouter', methodLabel: 'Paste an API key', authenticated: true, maskedKey: 'sk****ef', baseUrl: OR, modelCount: 3, userDefined: true });
    expect(JSON.stringify(rows)).not.toContain(KEY);
    expect(rows.find((r) => r.id === 'concrete-cloud')!.available).toBe(false);
    expect(rows.find((r) => r.id === 'deepseek')!.baseUrl).toBe('https://api.deepseek.com/v1');
  });
  it('sign-out (REQ-PROVIDER-102) leaves the snapshot; delete (055) removes both; validate (141) needs a credential', async () => {
    const { svc, settings, credentials } = service();
    await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY });
    expect(await svc.signOut(' OPENAI-COMPATIBLE--OPENROUTER ')).toEqual({ outcome: 'signed-out', message: 'Signed out of OpenRouter.' });
    expect(credentials.exists('openai-compatible--openrouter')).toBe(false);
    expect(settings.read().ok && (settings.read() as { value: { providers: Record<string, unknown> } }).value.providers['openai-compatible--openrouter']).toBeTruthy();
    expect(await svc.signOut('openai-compatible--openrouter')).toMatchObject({ outcome: 'nothing' });
    expect(await svc.signOut('openai-compatible')).toMatchObject({ outcome: 'unknown' });
    expect((await svc.signOut('zzz')).message).toMatch(/openai-compatible--<label>/);
    expect(await svc.validate('openai-compatible--openrouter')).toEqual({ ok: false, error: 'OpenRouter is not authenticated.' });
    expect(await svc.deleteInstance('deepseek')).toEqual({ ok: false, error: 'Provider deepseek is built-in or not user-defined.' });
    expect(await svc.deleteInstance('openai-compatible--openrouter')).toEqual({ ok: true, value: { message: 'Deleted user-defined provider openai-compatible--openrouter.', credentialRemoved: false, snapshotRemoved: true } });
    expect(await svc.deleteInstance('openai-compatible--openrouter')).toEqual({ ok: false, error: 'Unknown user-defined provider: openai-compatible--openrouter.' });
  });
  it('health reduces the observations to one state (REQ-PROVIDER-118 → REQ-NOTIFY-200); a refused validate discards the credential (098)', async () => {
    let status = 200;
    const { svc, credentials } = service(fetchWith((_u, h) => new Response(status === 200 ? JSON.stringify(catalogue) : '', { status: h.get('authorization') === `Bearer ${KEY}` ? status : 401 })));
    expect(await svc.health('concrete-cloud')).toEqual({ state: 'coming_soon', detail: 'Rotaris Cloud is coming soon.', available: false });
    expect(await svc.health('deepseek')).toEqual({ state: 'unauthenticated', detail: 'Not authenticated.', available: true });
    expect(await svc.health('mystery')).toMatchObject({ state: 'unknown' });
    await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY });
    expect(await svc.health('openai-compatible--openrouter')).toMatchObject({ state: 'healthy', detail: 'Validated OpenRouter; discovered 3 model(s).' });
    status = 503;
    expect(await svc.health('openai-compatible--openrouter')).toMatchObject({ state: 'error' });
    status = 401;
    expect(await svc.health('openai-compatible--openrouter')).toMatchObject({ state: 'unauthenticated' });
    expect((await svc.validate('openai-compatible--openrouter')).ok).toBe(false);
    expect(credentials.exists('openai-compatible--openrouter')).toBe(false);
    expect(log).toContain('log:Discarded stored authentication for OpenRouter.');
  });
  it('the lease hands the bearer for an authenticated provider and reports the rest (ADR-0030; REQ-PROVIDER-057/067)', async () => {
    const { svc } = service();
    await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY });
    const { bearers, report } = svc.lease(['openai-compatible--openrouter', 'deepseek', 'openai-compatible--openrouter']);
    expect(bearers).toEqual({ 'openai-compatible--openrouter': KEY });
    expect(report).toEqual({ authenticated: ['openai-compatible--openrouter'], renewed: [], unresolved: { deepseek: 'Authentication required' }, ok: false });
    expect(svc.lastError('deepseek')).toBe('Authentication required');
    expect(svc.healthIssue('deepseek')).toEqual({ message: 'DeepSeek is missing an API key.', editable: true });
    expect(svc.healthIssue('openai-compatible--openrouter')).toBeNull();
  });
  it('replaceKey validates by discovery and refuses a non-api-key provider; refresh counts (REQ-PROVIDER-108/147)', async () => {
    const { svc } = service();
    await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY });
    expect(await svc.replaceKey('openai-compatible--openrouter', 'sk-or-other')).toEqual({ ok: false, error: 'Validation failed for OpenRouter: Authentication failed for OpenRouter: 401' });
    expect(await svc.replaceKey('openai-compatible--openrouter', KEY)).toEqual({ ok: true, value: 'Validated OpenRouter; discovered 3 model(s).' });
    expect(await svc.replaceKey('codex', KEY)).toEqual({ ok: false, error: 'OpenAI Codex does not sign in with an API key.' });
    const lines: string[] = [];
    expect(await svc.refresh('all', (l) => lines.push(l))).toEqual({ succeeded: 1, failed: 0, skipped: 5, complete: false });
    expect(lines.at(-1)).toContain('finished with failures or skips: 1 succeeded, 5 skipped (not authenticated)');
    const one: string[] = [];
    expect(await svc.refresh(['deepseek'], (l) => one.push(l))).toMatchObject({ failed: 1, skipped: 0 });
    expect(one[0]).toContain('DeepSeek was skipped: it is not authenticated');
    expect(existsSync(join(dir, 'config', 'project_settings.yaml.lock'))).toBe(false);
  });
});
