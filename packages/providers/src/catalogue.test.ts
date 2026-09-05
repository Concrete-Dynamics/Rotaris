import { describe, expect, it } from 'vitest';
import { CATALOGUE, PROVIDER_IDS, destinationHint, destinationHost, instanceId, instanceSlug, LABEL_EMPTY, lookupProvider, modelsEndpoint, normalizeBaseUrl, signInMethodFor, validateCatalog, type CatalogueEntry } from './catalogue.js';
import { validateKnownLimits, lookupKnownLimits, KNOWN_LIMITS } from './limits.data.js';
import { validateTierPreferences } from './tiers.data.js';

describe('the provider catalogue (ADR-0028; REQ-PROVIDER-001..007)', () => {
  it('holds exactly six entries in the fixed order with the fixed display names', () => {
    expect(CATALOGUE.map((c) => c.id)).toEqual([...PROVIDER_IDS]);
    expect(CATALOGUE.map((c) => c.displayName)).toEqual(['Rotaris Cloud (recommended)', 'GitHub Copilot', 'OpenAI Codex', 'OpenAI-compatible', 'Claude Code (subscription)', 'DeepSeek']);
    expect(Object.isFrozen(CATALOGUE)).toBe(true);
  });
  it('validates as shipped (REQ-PROVIDER-003)', () => {
    expect(validateCatalog()).toEqual({ ok: true, value: undefined });
  });
  it('rejects a deliberately broken build: a local-sdk entry with a base URL, a custom entry with an operator, an unavailable entry without a reason', () => {
    const broken = CATALOGUE.map((c): CatalogueEntry => (c.id === 'claude-code' ? { ...c, baseUrl: 'https://x.example' } : c.id === 'openai-compatible' ? { ...c, operator: 'Someone' } : c.id === 'concrete-cloud' ? { ...c, unavailabilityReason: null } : c));
    const r = validateCatalog(broken);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.some((p) => p.startsWith('claude-code'))).toBe(true);
      expect(r.error.some((p) => p.startsWith('openai-compatible'))).toBe(true);
      expect(r.error.some((p) => p.startsWith('concrete-cloud'))).toBe(true);
    }
  });
  it('destination hosts (REQ-PROVIDER-004): none for local-sdk and custom, the hostname otherwise', () => {
    const host = (id: string) => destinationHost(CATALOGUE.find((c) => c.id === id)!);
    expect(host('concrete-cloud')).toBe('rotaris.ai');
    expect(host('copilot')).toBe('api.githubcopilot.com');
    expect(host('codex')).toBe('chatgpt.com');
    expect(host('deepseek')).toBe('api.deepseek.com');
    expect(host('claude-code')).toBeNull();
    expect(host('openai-compatible')).toBeNull();
  });
  it('claude-code declares neither URL (REQ-PROVIDER-005); the hosted provider ships coming soon (006)', () => {
    const cc = CATALOGUE.find((c) => c.id === 'claude-code')!;
    expect(cc.discoveryUrl).toBeNull();
    expect(cc.baseUrl).toBeNull();
    const cloud = CATALOGUE.find((c) => c.id === 'concrete-cloud')!;
    expect(cloud.available).toBe(false);
    expect(cloud.unavailabilityReason).toBe('Rotaris Cloud is coming soon.');
    expect(CATALOGUE.find((c) => c.id === 'deepseek')!.discoveryUrl).toBe('https://api.deepseek.com/models');
  });
  it('an unknown id is an error and no alias resolves (REQ-PROVIDER-007/009)', () => {
    expect(lookupProvider('openai').ok).toBe(false);
    expect(lookupProvider('Copilot').ok).toBe(false);
    expect(lookupProvider('copilot').ok).toBe(true);
  });
  it('sign-in methods (REQ-PROVIDER-008/009): the mapping, instances api-key, an unknown id only with the stored family', () => {
    expect(signInMethodFor('copilot')).toBe('device-code');
    expect(signInMethodFor('codex')).toBe('browser-pkce');
    expect(signInMethodFor('concrete-cloud')).toBe('browser-pkce');
    expect(signInMethodFor('deepseek')).toBe('api-key');
    expect(signInMethodFor('claude-code')).toBe('api-key');
    expect(signInMethodFor('openai-compatible--my-lab')).toBe('api-key');
    expect(signInMethodFor('mystery')).toBeNull();
    expect(signInMethodFor('mystery', 'openai-compatible')).toBe('api-key');
  });
  it('instance ids (REQ-PROVIDER-051) and base URL normalisation (053)', () => {
    expect(instanceSlug('  My Lab!! v2 ')).toBe('my-lab-v2');
    expect(instanceId('OpenRouter')).toEqual({ ok: true, value: 'openai-compatible--openrouter' });
    expect(instanceId('!!!')).toEqual({ ok: false, error: LABEL_EMPTY });
    expect(normalizeBaseUrl(' https://openrouter.ai/api/v1/ ')).toEqual({ ok: true, value: 'https://openrouter.ai/api/v1' });
    expect(normalizeBaseUrl('https://openrouter.ai/api/v1/models')).toEqual({ ok: true, value: 'https://openrouter.ai/api/v1' });
    expect(normalizeBaseUrl('')).toEqual({ ok: false, error: 'API base URL must not be empty.' });
    expect(normalizeBaseUrl('openrouter.ai/api/v1')).toEqual({ ok: false, error: 'API base URL must include a scheme and hostname.' });
    expect(modelsEndpoint('https://openrouter.ai/api/v1')).toBe('https://openrouter.ai/api/v1/models');
  });
  it('destination hints follow the connection mode (REQ-PROVIDER-117)', () => {
    const hint = (id: string) => destinationHint(CATALOGUE.find((c) => c.id === id)!);
    expect(hint('openai-compatible')).toBe('Custom endpoint — model traffic is sent to the base URL you enter below.');
    expect(hint('claude-code')).toContain('Claude Agent SDK');
    expect(hint('concrete-cloud')).toBe('Rotaris-managed cloud service — destination: rotaris.ai.');
    expect(hint('deepseek')).toBe('Direct provider API — DeepSeek, destination: api.deepseek.com.');
  });
});

describe('the build-data tables (ADR-0028)', () => {
  it('the known-limits table has the required shape and the deepseek/ row (REQ-PROVIDER-079)', () => {
    expect(validateKnownLimits()).toEqual([]);
  });
  it('lookup tries the id, then suffix-shortened forms, then the provider-wide row; instances under their id then the family', () => {
    expect(lookupKnownLimits(KNOWN_LIMITS, 'openai', 'gpt-4o-2024-08-06')).toEqual({ input: 128_000, output: 16_384 });
    expect(lookupKnownLimits(KNOWN_LIMITS, 'codex', 'gpt-4o-latest')).toEqual({ input: 128_000, output: 16_384 });
    expect(lookupKnownLimits(KNOWN_LIMITS, 'deepseek', 'deepseek-v9-9999')).toEqual({ input: 1_048_576, output: 384_000 });
    expect(lookupKnownLimits(KNOWN_LIMITS, 'openai-compatible--openrouter', 'anthropic/claude-haiku-4.5')).toBeNull();
    expect(lookupKnownLimits({ ...KNOWN_LIMITS, 'openai-compatible/foo': { input: 1, output: 2 } }, 'openai-compatible--x', 'foo')).toEqual({ input: 1, output: 2 });
  });
  it('the tier preference lists have the required shape (REQ-PROVIDER-081)', () => {
    expect(validateTierPreferences()).toEqual([]);
  });
});
