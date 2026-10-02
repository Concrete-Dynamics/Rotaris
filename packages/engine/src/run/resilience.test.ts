import { describe, expect, it } from 'vitest';
import { modelError, type ModelError } from '@rotaris/model';
import { classifyFailure, describeCondition, excludedModelKeys, localBackoffMs, pairKey, ResilienceMemory, retryAfterMs, sameTierCandidates, type CatalogueEntry } from './resilience.js';

const http = (status: number, providerMessage = '', headline = `HTTP ${status}`): ModelError => modelError({ code: 'http', status, headline, providerMessage });

describe('engine/run/resilience — classification (REQ-ORCH-091/092, REQ-NOTIFY-088/091/094)', () => {
  it.each<[string, ModelError, string]>([
    ['429 with no body', http(429), 'rate_limit'],
    ['rate limit phrase on a 400', http(400, 'Rate limit exceeded for this key'), 'rate_limit'],
    ['too many requests, any case', http(503, 'TOO MANY REQUESTS'), 'rate_limit'],
    ['rate_limit_exceeded code', http(400, '{"error":{"code":"rate_limit_exceeded"}}'), 'rate_limit'],
    ['the substring 429 in text', modelError({ code: 'unknown', headline: 'provider answered 429', transient: false }), 'rate_limit'],
    ['insufficient_quota code', http(429, '{"error":{"code":"insufficient_quota"}}'), 'quota_exhausted'],
    ['insufficient-quota code', http(402, 'insufficient-quota'), 'quota_exhausted'],
    ['exceeded your current quota', http(429, 'You exceeded your current quota, please check your plan and billing details.'), 'quota_exhausted'],
    ['check your plan and billing alone', http(403, 'Please check your plan and billing'), 'quota_exhausted'],
    ['408', http(408), 'transient'],
    ['425', http(425), 'transient'],
    ['500', http(500), 'transient'],
    ['502', http(502), 'transient'],
    ['503', http(503), 'transient'],
    ['504', http(504), 'transient'],
    ['connection error', modelError({ code: 'connection', headline: 'fetch failed' }), 'transient'],
    ['request timeout', modelError({ code: 'timeout', headline: 'the call timed out' }), 'transient'],
    // The adapter's idle bound (REQ-CONFIG-115): a silent stream is a timeout and is retried, where it
    // once arrived as `aborted` and was classed fatal — the shape that lost four children on 2026-09-12.
    ['the model timeout expiring mid-stream', modelError({ code: 'timeout', headline: 'no stream activity for 120000 ms' }), 'transient'],
    ['peer closed connection phrase', modelError({ code: 'unknown', headline: 'peer closed connection without sending complete message body', transient: false }), 'transient'],
    ['service unavailable phrase', http(400, 'Service Unavailable'), 'transient'],
    ['temporarily unavailable', http(400, 'The model is temporarily unavailable'), 'transient'],
    ['overloaded', http(529, 'overloaded_error'), 'transient'],
    ['validation by code', modelError({ code: 'validation', headline: 'unparseable', transient: false }), 'validation'],
    ['schema violation phrase', http(200, 'schema violation at $.intent'), 'validation'],
    ['context window by phrase', http(400, "This model's maximum context length is 8192 tokens"), 'context_window'],
    ['context_length_exceeded code', http(400, '{"error":{"code":"context_length_exceeded"}}'), 'context_window'],
    ['401', http(401, 'Incorrect API key provided'), 'fatal'],
    ['403', http(403, 'forbidden'), 'fatal'],
    ['404 unknown model', http(404, 'The model does not exist'), 'fatal'],
    ['400 plain', http(400, 'bad request'), 'fatal'],
    ['content policy', http(400, 'content_policy_violation'), 'fatal'],
    ['aborted', modelError({ code: 'aborted', headline: 'the call was aborted', transient: false }), 'fatal'],
    ['unknown', modelError({ code: 'unknown', headline: 'something', transient: false }), 'fatal'],
  ])('%s → %s', (_name, err, expected) => {
    expect(classifyFailure(err)).toBe(expected);
  });

  it('quota outranks rate limit on the same 429, and a limit outranks the transient statuses', () => {
    expect(classifyFailure(http(429, 'insufficient_quota: exceeded your current quota'))).toBe('quota_exhausted');
    expect(classifyFailure(http(503, 'rate limit'))).toBe('rate_limit');
  });
});

describe('engine/run/resilience — the wait (REQ-NOTIFY-084/085)', () => {
  it('reads the header as integer seconds, an HTTP date against now, and a suffixed value', () => {
    expect(retryAfterMs(modelError({ code: 'http', status: 429, headline: 'x', retryAfterMs: 7000 }))).toBe(7000);
    expect(retryAfterMs(modelError({ code: 'http', status: 429, headline: 'x', retryAfter: '12' }))).toBe(12_000);
    const now = Date.parse('2026-09-05T10:00:00Z');
    expect(retryAfterMs(modelError({ code: 'http', status: 429, headline: 'x', retryAfter: 'Sat, 05 Sep 2026 10:00:30 GMT' }), now)).toBe(30_000);
    expect(retryAfterMs(modelError({ code: 'http', status: 429, headline: 'x', retryAfter: 'Sat, 05 Sep 2026 10:00:30 GMT' }))).toBeNull();
    expect(retryAfterMs(modelError({ code: 'http', status: 429, headline: 'x', retryAfter: '45s' }))).toBe(45_000);
    expect(retryAfterMs(modelError({ code: 'http', status: 429, headline: 'x', retryAfter: '2m' }))).toBe(120_000);
  });
  it('reads try again in N <unit> from the message, minutes converted, floor 1 s, null when nothing usable', () => {
    expect(retryAfterMs(http(429, 'Rate limit reached. Please try again in 20s.'))).toBe(20_000);
    expect(retryAfterMs(http(429, 'Please try again in 3 minutes'))).toBe(180_000);
    expect(retryAfterMs(http(429, 'try again in 250ms'))).toBe(1000);
    expect(retryAfterMs(modelError({ code: 'http', status: 429, headline: 'x', retryAfter: '0' }))).toBe(1000);
    expect(retryAfterMs(modelError({ code: 'http', status: 429, headline: 'x', retryAfter: 'later' }))).toBeNull();
    expect(retryAfterMs(http(429, 'Too many requests'))).toBeNull();
  });
  it('the local backoff is 60·2^(n−1) s capped at 300 s', () => {
    expect([1, 2, 3, 4, 5, 9].map(localBackoffMs)).toEqual([60_000, 120_000, 240_000, 300_000, 300_000, 300_000]);
    expect(localBackoffMs(0)).toBe(60_000);
  });
});

const entry = (key: string, provider: string, roles: CatalogueEntry['roles'], origin: CatalogueEntry['origin'] = 'configured', usable = true): CatalogueEntry => ({
  key, provider, model: { providerId: provider === 'b' ? 'openai-compatible' : provider, modelId: key, dialect: 'chat' }, thinking: 'unset', roles, origin, usable,
});

describe('engine/run/resilience — same-tier candidates (REQ-ORCH-091 b, REQ-NOTIFY-082)', () => {
  const catalogue = [
    entry('a-small', 'a', ['small_model']),
    entry('a-large', 'a', ['large_model']),
    entry('b-small', 'b', ['small_model']),
    entry('c-small', 'c', ['small_model'], 'discovered'),
    entry('d-small', 'd', ['small_model'], 'discovered', false),
    entry('b-mixed', 'b', ['small_model', 'medium_model']),
  ];
  it('same role, different provider, configured first then discovered, unusable and same-provider excluded', () => {
    const c = sameTierCandidates({ provider: 'a', modelId: 'a-small', roles: ['small_model'] }, catalogue, new Set(), new Set());
    expect(c.map((e) => e.key)).toEqual(['b-small', 'b-mixed', 'c-small']);
  });
  it('exhausted and attempted pairs are excluded; no role means no candidate', () => {
    const c = sameTierCandidates({ provider: 'a', modelId: 'a-small', roles: ['small_model'] }, catalogue, new Set([pairKey('b', 'b-small')]), new Set([pairKey('c', 'c-small')]));
    expect(c.map((e) => e.key)).toEqual(['b-mixed']);
    expect(sameTierCandidates({ provider: 'a', modelId: 'a-small', roles: [] }, catalogue, new Set(), new Set())).toEqual([]);
  });
});

describe('engine/run/resilience — the excluded pairs a model selector annotates (REQ-MONITOR-194, REQ-MONITOR-303)', () => {
  const catalogue = [
    entry('a-small', 'a', ['small_model']),
    entry('b-small', 'b', ['small_model']),
    entry('c-small', 'c', ['small_model'], 'discovered'),
    entry('b-again', 'b', [], 'configured'),
  ];
  it('names every configured key whose pair the session recorded out of quota, in declaration order, each once', () => {
    expect(excludedModelKeys(catalogue, new Set())).toEqual([]);
    expect(excludedModelKeys(catalogue, new Set([pairKey('b', 'b-small'), pairKey('a', 'a-small')]))).toEqual(['a-small', 'b-small']);
  });
  it('a discovered model is no key a selector lists, and a pair no key reaches names nothing', () => {
    expect(excludedModelKeys(catalogue, new Set([pairKey('c', 'c-small'), pairKey('z', 'z1')]))).toEqual([]);
  });
});

describe('engine/run/resilience — REQ-NOTIFY-092 wordings', () => {
  it('one condition, one wording; only the values differ', () => {
    const a = describeCondition({ kind: 'quota_exhausted', provider: 'openrouter', model: 'gpt-x' });
    const b = describeCondition({ kind: 'quota_exhausted', provider: 'openai', model: 'gpt-y' });
    expect(a.replace('openrouter', 'P').replace('gpt-x', 'M')).toBe(b.replace('openai', 'P').replace('gpt-y', 'M'));
    expect(a).toContain('keep failing');
    expect(a).toMatch(/switch .* or add credit/);
    expect(describeCondition({ kind: 'quota_exhausted', provider: 'p', model: '' })).not.toContain('for model');
    expect(describeCondition({ kind: 'rate_limit', provider: 'p', model: 'm', intervalS: 20 })).toContain('20 s');
    expect(describeCondition({ kind: 'rate_limit', provider: 'p', model: 'm', intervalS: null })).not.toMatch(/\d/);
    expect(describeCondition({ kind: 'provider_unavailable', provider: 'p' })).toMatch(/temporarily unreachable.*Retry/);
    expect(describeCondition({ kind: 'provider_unavailable', provider: 'p' })).not.toMatch(/\d/);
    expect(describeCondition({ kind: 'non_ascii_credential', provider: 'p' })).toContain('exact ASCII value');
    expect(describeCondition({ kind: 'rejected_parameter', parameter: 'temperature', reducedSet: true })).toContain('reduced parameter set');
  });
});

describe('engine/run/resilience — the session-wide memory (REQ-ORCH-091 a/d, REQ-NOTIFY-088/089)', () => {
  it('REQ-NOTIFY-070/078: an entry carrying cleared: true takes the pin on its pair back, in replay order', () => {
    const catalogue = [entry('x', 'a', ['small_model']), entry('y', 'b', ['small_model'])];
    const resolve = (key: string) => (key === 'y' ? { model: catalogue[1]!.model, thinking: 'unset' as const } : null);
    const pin = { name: 'model_override', metadata: JSON.stringify({ provider: 'a', model: 'x', model_key: 'y', cause: 'authentication' }) };
    const clear = { name: 'model_override', metadata: JSON.stringify({ provider: 'a', model: 'x', cleared: true }) };
    expect(ResilienceMemory.rehydrate([pin], resolve).overrideFor('a', 'x')?.key).toBe('y');
    expect(ResilienceMemory.rehydrate([pin, clear], resolve).overrideFor('a', 'x')).toBeUndefined();
    expect(ResilienceMemory.rehydrate([pin, clear, pin], resolve).overrideFor('a', 'x')?.key).toBe('y');
    const m = ResilienceMemory.rehydrate([pin], resolve);
    expect(m.clearOverride('a', 'x')).toBe(true);
    expect(m.effective({ model: catalogue[0]!.model, thinking: 'unset' }, catalogue).model.modelId).toBe('x');
  });

  it('marks a pair once, follows an override chain, and rehydrates both from timeline entries', () => {
    const m = new ResilienceMemory();
    expect(m.markExhausted('a', 'x')).toBe(true);
    expect(m.markExhausted('a', 'x')).toBe(false);
    expect(m.isExhausted('a', 'x')).toBe(true);
    const catalogue = [entry('x', 'a', ['small_model']), entry('y', 'b', ['small_model'])];
    m.setOverride('a', 'x', { key: 'y', choice: { model: catalogue[1]!.model, thinking: 'low' } });
    expect(m.effective({ model: catalogue[0]!.model, thinking: 'unset' }, catalogue).model.modelId).toBe('y');
    expect(m.effective({ model: catalogue[1]!.model, thinking: 'unset' }, catalogue).model.modelId).toBe('y');
    const rows = [
      { name: 'model_exhausted', metadata: JSON.stringify({ provider: 'a', model: 'x' }) },
      { name: 'model_override', metadata: JSON.stringify({ provider: 'a', model: 'x', model_key: 'y' }) },
      { name: 'model_override', metadata: JSON.stringify({ provider: 'q', model: 'r', model_key: 'gone' }) },
      { name: 'run_start', metadata: '{}' },
    ];
    const warnings: string[] = [];
    const r = ResilienceMemory.rehydrate(rows, (key) => (key === 'y' ? { model: catalogue[1]!.model, thinking: 'unset' } : null), (w) => warnings.push(w));
    expect(r.isExhausted('a', 'x')).toBe(true);
    expect(r.overrideFor('a', 'x')?.key).toBe('y');
    expect(r.overrideFor('q', 'r')).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });

  it('REQ-NOTIFY-074/076: a `cleared` entry takes the pin on its pair back, in order, and a later pin stands again', () => {
    const catalogue = [entry('x', 'a', ['small_model']), entry('y', 'b', ['small_model']), entry('z', 'c', ['small_model'])];
    const resolve = (key: string) => { const e = catalogue.find((c) => c.key === key); return e ? { model: e.model, thinking: 'unset' as const } : null; };
    const pinned = { name: 'model_override', metadata: JSON.stringify({ provider: 'a', model: 'x', model_key: 'y' }) };
    const cleared = { name: 'model_override', metadata: JSON.stringify({ provider: 'a', model: 'x', cleared: true }) };
    const again = { name: 'model_override', metadata: JSON.stringify({ provider: 'a', model: 'x', model_key: 'z' }) };
    expect(ResilienceMemory.rehydrate([pinned, cleared], resolve).overrideFor('a', 'x')).toBeUndefined();
    expect(ResilienceMemory.rehydrate([pinned, cleared, again], resolve).overrideFor('a', 'x')?.key).toBe('z');
    const m = ResilienceMemory.rehydrate([pinned], resolve);
    expect(m.clearOverride('a', 'x')).toBe(true);
    expect(m.clearOverride('a', 'x')).toBe(false);
    expect(m.effective({ model: catalogue[0]!.model, thinking: 'unset' }, catalogue).model.modelId).toBe('x');
  });
});
