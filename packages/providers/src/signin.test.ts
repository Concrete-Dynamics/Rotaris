import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, failure, ok } from '@rotaris/kernel';
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
  const svc = new ProviderService({ credentials, settings, wall: clock, timers: clock, fetch, log: (m) => log.push(`log:${m}`), warn: (m) => log.push(`warn:${m}`) });
  return { svc, credentials, settings };
}

describe('OQ-20 pre-contact sign-in failures', () => {
  it('returns one actionable failure while preserving credentials and last-error state', async () => {
    let contacts = 0;
    const { svc, credentials } = service(fetchWith(() => { contacts += 1; return new Response('{}'); }));
    const before = svc.lastError('codex');
    const result = await svc.signInWithKey('codex', KEY);
    expect(result.outcome).toBe('failed');
    expect(svc.lastError('codex')).toBe(before);
    expect(contacts).toBe(0);
    expect(credentials.list()).toEqual([]);
    expect(log).toEqual([]);
  });
});

describe('the API-key sign-in for an OpenAI-compatible instance (ADR-0030; REQ-PROVIDER-051..054/133)', () => {
  it('validates, discovers, persists the credential only after discovery, writes the snapshot with picks, reports the outcome', async () => {
    const { svc, credentials, settings } = service();
    const r = await svc.addInstance({ label: 'OpenRouter', baseUrl: `${OR}/`, apiKey: ` ${KEY} ` });
    expect(r).toMatchObject({ outcome: 'signed-in', id: 'openai-compatible--openrouter', discovered: 3, message: 'Added OpenRouter; discovered 3 models.' });
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
    const { svc } = service(fetchWith((u, h) => { seen.push(u); return new Response(JSON.stringify({ data: [{ id: 'deepseek-chat' }] }), { status: h.get('authorization') ? 200 : 401 }); }));
    expect(await svc.signInWithKey('deepseek', KEY)).toMatchObject({ outcome: 'signed-in', message: 'Login complete for DeepSeek; discovered 1 model.' });
    expect(seen).toEqual(['https://api.deepseek.com/models', 'https://api.deepseek.com/models']);
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
    expect(await svc.health('openai-compatible--openrouter')).toMatchObject({ state: 'healthy', detail: 'Validated OpenRouter; discovered 3 models.' });
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
    const { bearers, report } = await svc.lease(['openai-compatible--openrouter', 'deepseek', 'openai-compatible--openrouter']);
    expect(bearers).toEqual({ 'openai-compatible--openrouter': KEY });
    expect(report).toEqual({ authenticated: ['openai-compatible--openrouter'], renewed: [], unresolved: { deepseek: 'Authentication required' }, ok: false });
    expect(svc.lastError('deepseek')).toBe('Authentication required');
    expect(svc.healthIssue('deepseek')).toEqual({ message: 'DeepSeek is missing an API key.', editable: true });
    expect(svc.healthIssue('openai-compatible--openrouter')).toBeNull();
  });
  it('replaceKey validates by discovery and refuses a non-api-key provider; refresh counts (REQ-PROVIDER-108/147)', async () => {
    const { svc } = service();
    await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY });
    expect(await svc.replaceKey('openai-compatible--openrouter', 'sk-or-other')).toEqual({ ok: false, stage: 'validation', message: 'Validation failed for OpenRouter: Authentication failed for OpenRouter: 401' });
    expect(await svc.replaceKey('openai-compatible--openrouter', KEY)).toEqual({ ok: true, message: 'Validated OpenRouter; discovered 3 models.' });
    expect(await svc.replaceKey('codex', KEY)).toEqual({ ok: false, stage: 'method', message: 'OpenAI Codex does not sign in with an API key.' });
    const lines: string[] = [];
    expect(await svc.refresh('all', (l) => lines.push(l))).toEqual({ succeeded: 1, failed: 0, skipped: 5, complete: false });
    expect(lines.at(-1)).toContain('finished with failures or skips: 1 succeeded, 5 skipped (not authenticated)');
    const one: string[] = [];
    expect(await svc.refresh(['deepseek'], (l) => one.push(l))).toMatchObject({ failed: 1, skipped: 0 });
    expect(one[0]).toContain('DeepSeek was skipped: it is not authenticated');
    expect(existsSync(join(dir, 'config', 'project_settings.yaml.lock'))).toBe(false);
  });
});

describe('the recovery dialog\'s re-authentication (REQ-NOTIFY-076/077, REQ-NOTIFY-202)', () => {
  const failingProtector = () => {
    const lock = { pid: process.pid, startedAt: '2026-09-05T00:00:00.000Z', timers: clock, monotonic: clock };
    const credentials = new CredentialStore({ dir: join(dir, 'data', 'tokens'), protector: { protect: async () => ({ ok: false as const, error: { code: 'acl', headline: 'the ACL could not be set' } }) }, lock, random: () => 'r', warn: (m) => log.push(`warn:${m}`), info: (m) => log.push(`info:${m}`) });
    const settings = new ProjectSettingsStore({ path: join(dir, 'config', 'project_settings.yaml'), lock, timers: clock, warn: (m) => log.push(`warn:${m}`) });
    return new ProviderService({ credentials, settings, wall: clock, timers: clock, fetch: okCatalogue, log: (m) => log.push(`log:${m}`), warn: (m) => log.push(`warn:${m}`) });
  };

  it('names the method: a key field for an API-key provider, the provider own flow for device-code and browser ones, configuration for an id no method resolves', async () => {
    const { svc } = service();
    expect(await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY })).toMatchObject({ outcome: 'signed-in' });
    expect(svc.reauthentication('openai-compatible--openrouter')).toMatchObject({ method: 'api-key' });
    expect(svc.reauthentication('deepseek')).toMatchObject({ method: 'api-key' });
    expect(svc.reauthentication('copilot')).toEqual({ method: 'interactive', message: 'GitHub Copilot signs in with "Code shown here, entered at the provider". Start its sign-in, complete it at the provider, then confirm here.' });
    expect(svc.reauthentication('codex').method).toBe('interactive');
    expect(svc.reauthentication('claude-code').method).toBe('unavailable');
    expect(svc.reauthentication('concrete-cloud')).toEqual({ method: 'unavailable', message: 'Rotaris Cloud is coming soon.' });
    expect(svc.reauthentication('scripted')).toMatchObject({ method: 'configuration', message: expect.stringMatching(/^Authentication is managed by model configuration\./) });
    // No message sends the user to a shell, a terminal or a separate program (REQ-NOTIFY-076's last sentence).
    for (const id of ['openai-compatible--openrouter', 'copilot', 'codex', 'claude-code', 'scripted']) expect(svc.reauthentication(id).message).not.toMatch(/terminal|shell|command line|cli\b|run `/i);
  });

  it('validates the new key before storing it, and stores it: the provider refusing it is the validation stage, nothing stored', async () => {
    const { svc, credentials } = service();
    await svc.addInstance({ label: 'OpenRouter', baseUrl: OR, apiKey: KEY });
    const refused = await svc.reauthenticateWithKey('openai-compatible--openrouter', 'sk-or-wrong');
    expect(refused).toEqual({ ok: false, stage: 'validation', message: 'Validation failed for OpenRouter: Authentication failed for OpenRouter: 401' });
    expect(credentials.load('openai-compatible--openrouter')!.access_token).toBe(KEY);
    expect(await svc.reauthenticateWithKey('openai-compatible--openrouter', '   ')).toMatchObject({ ok: false, stage: 'key' });
    expect(await svc.reauthenticateWithKey('openai-compatible--openrouter', KEY)).toEqual({ ok: true, message: 'Validated OpenRouter; discovered 3 models.' });
    expect(credentials.load('openai-compatible--openrouter')!.extra).toEqual({ provider_family: 'openai-compatible', api_base: OR });
    expect(await svc.reauthenticateWithKey('copilot', KEY)).toMatchObject({ ok: false, stage: 'method' });
    expect(JSON.stringify(log)).not.toContain('sk-or-wrong');
  });

  it('a key stored whose discovered models cannot be recorded is the catalog stage, never the storage one', async () => {
    const { svc, credentials, settings } = service();
    settings.upsertProvider = async () => ({ ok: false as const, error: failure('settings.write', 'the provider settings could not be written') });
    const r = await svc.reauthenticateWithKey('deepseek', KEY);
    expect(r).toEqual({ ok: false, stage: 'catalog', message: 'The key for DeepSeek was saved, but its discovered models could not be recorded: the provider settings could not be written' });
    // The key itself reached the credential store.
    expect(credentials.load('deepseek')?.access_token).toBe(KEY);
  });

  it('REQ-NOTIFY-077: a key that cannot be stored answers the storage stage, naming the storage failure', async () => {
    const svc = failingProtector();
    const r = await svc.reauthenticateWithKey('deepseek', KEY);
    expect(r.ok).toBe(false);
    expect(r.ok ? null : r.stage).toBe('storage');
    expect(r.ok ? '' : r.message).toMatch(/^No credential was stored: the credential store at .* could not be protected$/);
  });
});

describe('the interactive sign-in, refresh and the lease (R-110; REQ-PROVIDER-020..034, 057, 058, 067, 096..099)', () => {
  const NOW = 1_756_684_800; // the fake wall clock's start, in seconds
  const device = { device_code: 'DC', user_code: 'WXYZ-1234', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 600 };
  const copilotCatalogue = { data: [
    { id: 'gpt-4.1', capabilities: { type: 'chat', limits: { max_context_window_tokens: 128000, max_output_tokens: 16384 }, supports: { vision: true } }, supported_endpoints: ['/chat/completions'] },
    { id: 'gpt-5-codex', capabilities: { type: 'chat' }, supported_endpoints: ['/responses', 'ws:/responses'] },
    { id: 'embed-1', capabilities: { type: 'embeddings' } },
    { id: 'opus', capabilities: { type: 'chat' }, policy: { state: 'disabled', terms: 'Enable it in your Copilot settings' } },
    { id: 'odd', capabilities: { type: 'chat' }, supported_endpoints: ['/v1/messages'] },
  ] };
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
  async function drive<T>(p: Promise<T>): Promise<T> {
    let settled = false;
    void p.finally(() => { settled = true; });
    for (let i = 0; i < 400 && !settled; i += 1) { await new Promise((r) => setImmediate(r)); clock.advance(2_000); }
    return p;
  }
  /** GitHub and Copilot, scripted: the device flow answers at once, the exchange hands out `bearer-<n>` valid for `lifetime` seconds. */
  function copilotWorld(opts: { lifetime?: number; modelsStatus?: number } = {}) {
    const seen: { url: string; headers: Headers }[] = [];
    let exchanges = 0;
    const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
      seen.push({ url, headers: new Headers(init?.headers) });
      if (url.endsWith('/login/device/code')) return json(device);
      if (url.endsWith('/login/oauth/access_token')) return json({ access_token: 'ghu_durable' });
      if (url.endsWith('/copilot_internal/v2/token')) { exchanges += 1; return json({ token: `bearer-${exchanges}`, expires_at: NOW + Math.floor(clock.now() / 1000) + (opts.lifetime ?? 1500), endpoints: { api: 'https://api.tenant.githubcopilot.com' }, sku: 'pro' }); }
      if (url.endsWith('/models')) return opts.modelsStatus ? new Response('', { status: opts.modelsStatus }) : json(copilotCatalogue);
      return new Response('', { status: 404 });
    };
    return { fetch, seen, exchanges: () => exchanges };
  }

  it('signs Copilot in: the prompt, the credential layout, discovery on the tenant base with the editor identity, dropping and annotating', async () => {
    const world = copilotWorld();
    const { svc, credentials, settings } = service(world.fetch);
    const prompts: unknown[] = [];
    const r = await drive(svc.signInInteractive('copilot', { prompt: (p) => prompts.push(p) }));
    expect(r).toMatchObject({ outcome: 'signed-in', id: 'copilot', discovered: 4, message: 'Login complete for GitHub Copilot; discovered 4 models.' });
    expect(prompts).toEqual([{ kind: 'device-code', verificationUri: device.verification_uri, userCode: 'WXYZ-1234', intervalSeconds: 5, expiresInSeconds: 600 }]);
    expect(credentials.load('copilot')).toMatchObject({ access_token: 'bearer-1', refresh_token: 'ghu_durable', extra: { api_base: 'https://api.tenant.githubcopilot.com', sku: 'pro' } });
    const models = world.seen.find((s) => s.url.endsWith('/models'))!;
    expect(models.url).toBe('https://api.tenant.githubcopilot.com/models');
    expect(models.headers.get('copilot-integration-id')).toBe('vscode-chat');
    expect(models.headers.get('openai-intent')).toBe('conversation-panel');
    const snap = settings.read();
    const rec = snap.ok ? snap.value!.providers['copilot']! : null;
    expect(rec!.base_url).toBe('https://api.tenant.githubcopilot.com');
    expect(rec!.models.map((m) => [m.id, m.capabilities['availability'], m.capabilities['api_mode'] ?? null]).sort()).toEqual([
      ['copilot/gpt-4.1', 'available', 'chat'], ['copilot/gpt-5-codex', 'available', 'responses'], ['copilot/odd', 'no_supported_route', null], ['copilot/opus', 'policy_disabled', null],
    ]);
    expect(rec!.models.find((m) => m.id === 'copilot/gpt-4.1')).toMatchObject({ limits: { context_window: 128000, max_output_tokens: 16384 }, capabilities: { accepts_image_input: true } });
    // REQ-PROVIDER-082: an unavailable model never fills a slot.
    for (const slot of [rec!.small_model, rec!.medium_model, rec!.large_model]) expect(['copilot/gpt-4.1', 'copilot/gpt-5-codex']).toContain(slot);
    expect(svc.status('copilot')).toBe('authenticated');
    expect(svc.reauthentication('copilot').method).toBe('interactive');
  });

  it('uses a stored authentication without running the flow, and discards it first when re-authentication is asked', async () => {
    const world = copilotWorld();
    const { svc } = service(world.fetch);
    await drive(svc.signInInteractive('copilot', { prompt: () => undefined }));
    const before = world.seen.length;
    const prompts: unknown[] = [];
    expect(await drive(svc.signInInteractive('copilot', { prompt: (p) => prompts.push(p) }))).toMatchObject({ outcome: 'signed-in' });
    expect(prompts).toEqual([]);
    expect(world.seen.slice(before).map((s) => s.url)).toEqual(['https://api.tenant.githubcopilot.com/models']);
    expect(log).toContain('log:Using the stored authentication for GitHub Copilot.');
    expect(await drive(svc.signInInteractive('copilot', { reauthenticate: true, prompt: (p) => prompts.push(p) }))).toMatchObject({ outcome: 'signed-in' });
    expect(prompts).toHaveLength(1);
    expect(log).toContain('log:Discarded stored authentication for GitHub Copilot.');
  });

  it('ends cancelled when the wait is aborted, storing nothing; a refused catalog read discards the credential it stored (codex excepted)', async () => {
    const abort = new AbortController();
    const cancelled = service(copilotWorld().fetch);
    const flow = cancelled.svc.signInInteractive('copilot', { prompt: () => abort.abort(), signal: abort.signal });
    expect(await drive(flow)).toEqual({ outcome: 'cancelled' });
    expect(cancelled.credentials.list()).toEqual([]);
    const refused = service(copilotWorld({ modelsStatus: 401 }).fetch);
    expect(await drive(refused.svc.signInInteractive('copilot', { prompt: () => undefined }))).toMatchObject({ outcome: 'failed', message: 'GitHub Copilot: Authentication failed for GitHub Copilot: 401' });
    expect(refused.credentials.list()).toEqual([]);
    expect(log).toContain('log:Discarded stored authentication for GitHub Copilot.');
  });

  it('refuses the providers no interactive flow serves, before anything is contacted', async () => {
    let contacts = 0;
    const { svc, credentials } = service(fetchWith(() => { contacts += 1; return new Response('{}'); }));
    expect(await svc.signInInteractive('concrete-cloud', { prompt: () => undefined })).toEqual({ outcome: 'failed', message: 'Rotaris Cloud is coming soon.' });
    expect((await svc.signInInteractive('deepseek', { prompt: () => undefined })).outcome).toBe('failed');
    expect((await svc.signInInteractive('nope', { prompt: () => undefined })).outcome).toBe('failed');
    const claude = await svc.signInWithKey('claude-code', 'sk-ant-oat01-abc');
    expect(claude).toMatchObject({ outcome: 'failed', message: expect.stringContaining('cannot drive yet') });
    expect(svc.reauthentication('claude-code')).toMatchObject({ method: 'unavailable' });
    expect(contacts).toBe(0);
    expect(credentials.list()).toEqual([]);
  });

  it('leases with the refresh margin: a bearer within 300 seconds of expiry is renewed, one beyond it is handed over as it is', async () => {
    const world = copilotWorld({ lifetime: 1500 });
    const { svc, credentials } = service(world.fetch);
    await drive(svc.signInInteractive('copilot', { prompt: () => undefined }));
    const first = await svc.lease(['copilot']);
    expect(first).toMatchObject({ bearers: { copilot: 'bearer-1' }, renewable: ['copilot'], report: { authenticated: ['copilot'], renewed: [], unresolved: {}, ok: true } });
    expect(first.headers['copilot']).toMatchObject({ 'Copilot-Integration-Id': 'vscode-chat', 'Editor-Version': 'vscode/1.99.1' });
    // Advance the wall clock to 299 seconds before expiry.
    const expiresAt = credentials.load('copilot')!.expires_at;
    clock.advance((expiresAt - 299) * 1000 - clock.instant());
    const second = await svc.lease(['copilot']);
    expect(second).toMatchObject({ bearers: { copilot: 'bearer-2' }, report: { authenticated: [], renewed: ['copilot'], unresolved: {} } });
    expect(credentials.load('copilot')).toMatchObject({ access_token: 'bearer-2', refresh_token: 'ghu_durable' });
    expect(world.exchanges()).toBe(2);
  });

  it('reports a provider that cannot be renewed once it has expired, and never fails the lease for it', async () => {
    let refuse = false;
    const world = copilotWorld({ lifetime: 100 });
    const { svc } = service(async (url, init) => (refuse && url.endsWith('/copilot_internal/v2/token') ? new Response('', { status: 401 }) : world.fetch(url, init)));
    await drive(svc.signInInteractive('copilot', { prompt: () => undefined }));
    refuse = true;
    clock.advance(200_000);
    const r = await svc.lease(['copilot', 'deepseek']);
    expect(r.bearers).toEqual({});
    expect(r.report.ok).toBe(false);
    expect(r.report.unresolved['copilot']).toMatch(/Copilot session exchange failed/);
    expect(r.report.unresolved['deepseek']).toBe('Authentication required');
    expect(svc.lastError('copilot')).toMatch(/Copilot session exchange failed/);
  });

  it('renews a codex credential through its refresh token, one refresh at a time, and leases its account header', async () => {
    const jwt = (claims: object): string => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
    let refreshes = 0;
    const { svc, credentials } = service(async (url, init) => {
      if (url === 'https://auth.openai.com/oauth/token') {
        refreshes += 1;
        expect(new URLSearchParams((init?.body as string)).get('refresh_token')).toBe('rt-1');
        await new Promise((r) => setImmediate(r));
        return json({ access_token: 'at-2', refresh_token: 'rt-2', id_token: jwt({ chatgpt_account_id: 'acct-9' }), expires_in: 3600 });
      }
      return new Response('', { status: 404 });
    });
    await credentials.save('codex', { access_token: 'at-1', refresh_token: 'rt-1', expires_at: NOW + 60, account_id: null, extra: { auth_mode: 'chatgpt' } });
    const [a, b] = await Promise.all([svc.lease(['codex']), svc.lease(['codex'])]);
    expect(refreshes).toBe(1);
    expect(a.bearers).toEqual({ codex: 'at-2' });
    expect(b.bearers).toEqual({ codex: 'at-2' });
    expect(a.headers['codex']).toEqual({ originator: 'codex_cli_rs', 'OpenAI-Beta': 'responses=experimental', 'chatgpt-account-id': 'acct-9' });
    expect(credentials.load('codex')).toMatchObject({ access_token: 'at-2', refresh_token: 'rt-2', expires_at: NOW + 3600, account_id: 'acct-9' });
    expect(svc.status('codex')).toBe('authenticated');
  });
});

describe('a local-sdk provider stores no token by any route (R-110)', () => {
  it('refuses the settings key path, reads unavailable in the list and in the health check', async () => {
    const { svc, credentials } = service();
    expect(await svc.replaceKey('claude-code', 'sk-ant-oat01-abc')).toMatchObject({ ok: false, stage: 'method', message: expect.stringContaining('cannot drive yet') });
    expect(await svc.reauthenticateWithKey('claude-code', 'sk-ant-oat01-abc')).toMatchObject({ ok: false, stage: 'method' });
    expect(credentials.list()).toEqual([]);
    expect(svc.list().find((r) => r.id === 'claude-code')).toMatchObject({ available: false, authenticated: false });
    expect(await svc.health('claude-code')).toMatchObject({ state: 'coming_soon', available: false, detail: expect.stringContaining('Claude Agent SDK') });
  });
});
