import { describe, expect, it } from 'vitest';
import { availabilitySentence, copilotRoute, discoverCodex, isAvailable } from './discovery-strategies.js';

describe('Copilot route selection (REQ-PROVIDER-074)', () => {
  it('normalizes the advertised endpoints and chooses the route', () => {
    expect(copilotRoute(undefined)).toBe('chat');
    expect(copilotRoute([])).toBe('chat');
    expect(copilotRoute([' /chat/completions ', '/responses'])).toBe('chat');
    expect(copilotRoute(['/v1/responses', '/v1/responses'])).toBe('responses');
    expect(copilotRoute(['/responses', 'ws:/responses'])).toBe('responses');
    expect(copilotRoute(['/v1/messages'])).toBeNull();
    // A websocket address is discarded, which leaves an empty set: chat.
    expect(copilotRoute(['wss://host/x'])).toBe('chat');
  });
});

describe('availability (REQ-PROVIDER-075, 082)', () => {
  it('renders one sentence per code, the provider detail after it, and nothing for an available model', () => {
    expect(availabilitySentence('available')).toBeNull();
    expect(availabilitySentence('')).toBeNull();
    expect(availabilitySentence('policy_disabled', 'Enable it in settings')).toBe("Your provider account has this model switched off. Enable it in the provider's settings, then refresh the model catalog. Enable it in settings.");
    expect(availabilitySentence('no_supported_route')).toBe('The provider offers this model only on an endpoint Rotaris cannot send requests to.');
    expect(availabilitySentence('something_else', '  ')).toBe('The provider will not accept requests for this model.');
    expect(isAvailable({ capabilities: {} })).toBe(true);
    expect(isAvailable({ capabilities: { availability: 'policy_disabled' } })).toBe(false);
  });
});

describe('the codex subscription catalogue (REQ-PROVIDER-076)', () => {
  const run = (body: unknown, status = 200, seen: { url?: string; headers?: Headers } = {}) => discoverCodex({
    providerId: 'codex', displayName: 'OpenAI Codex', token: 'at', accountId: 'acct', modelsUrl: 'https://chatgpt.com/backend-api/codex/models',
    fetch: async (url, init) => { seen.url = url; seen.headers = new Headers(init?.headers); return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }); },
  });

  it('asks with the fixed query and headers, skips hidden and API-unsupported entries, captures levels, modalities and the window', async () => {
    const seen: { url?: string; headers?: Headers } = {};
    const r = await run({ models: [
      { slug: 'gpt-a', display_name: 'GPT A', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }, 'high'], input_modalities: ['text', 'image'], context_window: 272000 },
      { slug: 'gpt-b', input_modalities: ['text'], max_context_window: 100000 },
      { slug: 'gpt-hidden', visibility: 'hide' },
      { slug: 'gpt-internal', supported_in_api: false },
    ] }, 200, seen);
    expect(seen.url).toBe('https://chatgpt.com/backend-api/codex/models?client_version=0.144.6');
    expect(seen.headers?.get('authorization')).toBe('Bearer at');
    expect(seen.headers?.get('originator')).toBe('codex_cli_rs');
    expect(seen.headers?.get('openai-beta')).toBe('responses=experimental');
    expect(seen.headers?.get('user-agent')).toBe('rotaris/discovery');
    expect(seen.headers?.get('chatgpt-account-id')).toBe('acct');
    expect(r.ok && r.value.map((m) => ({ id: m.qualifiedId, name: m.displayName, caps: m.capabilities, limits: m.limits }))).toEqual([
      { id: 'codex/gpt-a', name: 'GPT A', caps: { api_mode: 'responses', reasoning_levels: ['low', 'high'], accepts_image_input: true }, limits: { context_window: 272000 } },
      { id: 'codex/gpt-b', name: null, caps: { api_mode: 'responses', accepts_image_input: false }, limits: { context_window: 100000 } },
    ]);
  });

  it('maps a refusal and a malformed payload as generic discovery does', async () => {
    expect(await run('', 401)).toMatchObject({ ok: false, error: { kind: 'auth', status: 401, message: 'Authentication failed for OpenAI Codex: 401' } });
    expect(await run('', 503)).toMatchObject({ ok: false, error: { kind: 'server' } });
    expect(await run('not json')).toMatchObject({ ok: false, error: { kind: 'format' } });
    expect(await run({ nope: 1 })).toMatchObject({ ok: false, error: { message: 'Invalid response format: expected data list' } });
    expect(await run({ models: [{ id: 'no-slug' }] })).toMatchObject({ ok: false, error: { message: 'Invalid response format: expected model slug' } });
  });
});

describe('the availability sentence reads a provider\'s detail in linear time (CodeQL js/polynomial-redos)', () => {
  it('drops the closing punctuation only, and is not slowed by a long run of it inside the text', () => {
    expect(availabilitySentence('policy_disabled', 'Really?!... yes!!!')).toBe("Your provider account has this model switched off. Enable it in the provider's settings, then refresh the model catalog. Really?!... yes.");
    const hostile = `${'!'.repeat(200_000)}x`;
    const started = performance.now();
    expect(availabilitySentence('no_supported_route', hostile)!.endsWith('x.')).toBe(true);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
