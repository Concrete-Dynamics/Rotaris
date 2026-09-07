import { describe, expect, it } from 'vitest';
import { acceptableLimit, classifyDiscoveryResponse, discover, DISCOVERY_USER_AGENT, modelOfItem, parseDiscoveryPayload } from './discovery.js';
import { KNOWN_LIMITS } from './limits.data.js';

function respond(status: number, body: string, statusText = ''): (input: string, init?: RequestInit) => Promise<Response> {
  return async () => new Response(body, { status, statusText, headers: { 'content-type': 'application/json' } });
}
const base = { providerId: 'openai-compatible--openrouter', displayName: 'OpenRouter', modelsUrl: 'https://openrouter.ai/api/v1/models', token: 'sk-or-key' };

describe('generic discovery (REQ-PROVIDER-069/071/072)', () => {
  it('A5: preserves true, false and unknown independently of model names', () => {
    for (const declaration of [true, false]) {
      const model = modelOfItem({ id: 'm', capabilities: { accepts_image_input: declaration } }, 'p')!;
      expect(model.capabilities.accepts_image_input).toBe(declaration);
      expect(JSON.parse(JSON.stringify(model)).capabilities.accepts_image_input).toBe(declaration);
    }
    const unknown = modelOfItem({ id: 'vision-image-model' }, 'p')!;
    expect(Object.hasOwn(unknown.capabilities, 'accepts_image_input')).toBe(false);
    expect(Object.hasOwn(JSON.parse(JSON.stringify(unknown)).capabilities, 'accepts_image_input')).toBe(false);
    expect(modelOfItem({ id: 'm', input_modalities: ['text'] }, 'p')!.capabilities.accepts_image_input).toBe(false);
  });
  it('sends the bearer and the user agent, and maps a models payload', async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null;
    const fetch = async (url: string, init?: RequestInit) => { seen = { url, headers: Object.fromEntries(new Headers(init?.headers).entries()) }; return new Response(JSON.stringify({ data: [{ id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', context_length: 200000, architecture: { input_modalities: ['text', 'image'] }, top_provider: { max_completion_tokens: 32000 }, pricing: { prompt: '0.000001' } }, { id: 'x/y' }] }), { status: 200 }); };
    const r = await discover({ ...base, fetch });
    expect(seen!.url).toBe(base.modelsUrl);
    expect(seen!.headers['authorization']).toBe('Bearer sk-or-key');
    expect(seen!.headers['user-agent']).toBe(DISCOVERY_USER_AGENT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.map((m) => m.qualifiedId)).toEqual(['openai-compatible--openrouter/anthropic/claude-haiku-4.5', 'openai-compatible--openrouter/x/y']);
      expect(r.value[0]!.displayName).toBe('Claude Haiku 4.5');
      expect(r.value[0]!.limits).toEqual({ context_window: 200000, max_output_tokens: 32000 });
      expect(r.value[0]!.capabilities['accepts_image_input']).toBe(true);
      expect(r.value[0]!.pricing).toEqual({});
      expect(r.value[1]!.capabilities['accepts_image_input']).toBeUndefined();
    }
  });
  it('the error mapping is total (REQ-PROVIDER-071)', async () => {
    expect((await discover({ ...base, fetch: respond(401, '') })).ok === false && (await discover({ ...base, fetch: respond(401, '') }) as { error: { message: string } }).error.message).toBe('Authentication failed for OpenRouter: 401');
    expect(classifyDiscoveryResponse(403, '', 'X')?.kind).toBe('auth');
    expect(classifyDiscoveryResponse(500, 'Internal Server Error', 'X')?.message).toBe('Discovery request failed: Internal Server Error');
    expect(classifyDiscoveryResponse(503, '', 'X')?.message).toBe('Discovery request failed: HTTP 503');
    expect(classifyDiscoveryResponse(429, '', 'X')).toMatchObject({ kind: 'rate-limited', status: 429 });
    expect(classifyDiscoveryResponse(429, '', 'X')?.message).toMatch(/rate limit/);
    expect(classifyDiscoveryResponse(404, '', 'X')).toMatchObject({ kind: 'refused', status: 404 });
    expect(classifyDiscoveryResponse(408, '', 'X')?.message).toMatch(/other than authentication/);
    expect(classifyDiscoveryResponse(200, '', 'X')).toBeNull();
    const transport = await discover({ ...base, fetch: async () => { throw new TypeError('fetch failed'); } });
    expect(transport.ok).toBe(false);
    if (!transport.ok) expect(transport.error).toMatchObject({ kind: 'transport', status: null, message: 'Discovery request failed: fetch failed' });
  });
  it('format errors (REQ-PROVIDER-071) and an empty data list is zero models, not an error', () => {
    expect(parseDiscoveryPayload('nope').ok).toBe(false);
    expect((parseDiscoveryPayload('[]') as { error: { message: string } }).error.message).toBe('Invalid response format: expected JSON object');
    expect((parseDiscoveryPayload('{"data":{}}') as { error: { message: string } }).error.message).toBe('Invalid response format: expected data list');
    expect((parseDiscoveryPayload('{"data":[1]}') as { error: { message: string } }).error.message).toBe('Invalid response format: expected model objects');
    expect(parseDiscoveryPayload('{"data":[]}')).toEqual({ ok: true, value: [] });
  });
  it('the limit ladder (REQ-PROVIDER-078) and known-limit back-fill (079/080)', () => {
    expect(acceptableLimit(true)).toBeNull();
    expect(acceptableLimit(0)).toBeNull();
    expect(acceptableLimit(-5)).toBeNull();
    expect(acceptableLimit(12.5)).toBeNull();
    expect(acceptableLimit(128000.0)).toBe(128000);
    expect(acceptableLimit('1_048_576')).toBe(1048576);
    expect(acceptableLimit('128,000')).toBe(128000);
    const m = modelOfItem({ id: 'gpt-4o', context_tokens: 0, max_input_tokens: 'x', context_window: 111 }, 'openai', KNOWN_LIMITS)!;
    expect(m.limits).toEqual({ context_window: 111, max_output_tokens: 16_384 });
    const full = modelOfItem({ id: 'gpt-4o', context_window: 1, output_tokens: 2 }, 'openai', KNOWN_LIMITS)!;
    expect(full.limits).toEqual({ context_window: 1, max_output_tokens: 2 });
    expect(modelOfItem({ name: 'no id' }, 'p')).toBeNull();
  });
});
