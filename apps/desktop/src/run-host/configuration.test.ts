import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { authProvidersOf, configureRun, credentialResolver, entryTierOf } from './configuration.js';
import type { ModelEntry } from '@rotaris/config';

/**
 * ADR-0030 at the run-host root: a model naming an `auth_provider` resolves the bearer main leased, per request;
 * the providers a run needs are collected from every configured model; the entry tier is the slot alias.
 */
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-rh-cfg-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const NOW = '2026-09-05T10:00:00.000Z';
const SNAPSHOT = `version: 1
providers:
  openai-compatible--openrouter:
    id: openai-compatible--openrouter
    display_name: OpenRouter
    family: openai-compatible
    base_url: https://openrouter.ai/api/v1
    authenticated: true
    large_model: openai-compatible--openrouter/anthropic/claude-haiku-4.5
    medium_model: openai-compatible--openrouter/anthropic/claude-haiku-4.5
    small_model: openai-compatible--openrouter/anthropic/claude-haiku-4.5
    discovered_at: ${NOW}
    models:
      - { id: openai-compatible--openrouter/anthropic/claude-haiku-4.5, capabilities: {}, limits: {}, pricing: {}, discovered_at: ${NOW} }
`;

function deps(bearers: Record<string, string>) {
  const clocks = new FakeClock();
  return {
    clocks, globalDir: join(dir, 'config'), env: {}, scriptedClient: () => { throw new Error('not scripted'); }, onRequest: () => {}, log: () => {}, liveState: () => ({}),
    bearers: () => bearers,
  };
}

describe('the run host resolves the leased bearer for a snapshot model', () => {
  it('the entry model names its auth_provider; the resolver reads the leased map per request; the tier is the slot alias', async () => {
    mkdirSync(join(dir, 'config'), { recursive: true });
    mkdirSync(join(dir, 'ws', '.rotaris'), { recursive: true });
    writeFileSync(join(dir, 'config', 'project_settings.yaml'), SNAPSHOT);
    const leased: Record<string, string> = {};
    const r = configureRun(join(dir, 'ws'), true, deps(leased));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.authProviders).toEqual(['openai-compatible--openrouter']);
    expect(r.value.entryAuthProvider).toBe('openai-compatible--openrouter');
    expect(r.value.tier).toBe('large');
    expect(r.value.model.config.model).toMatchObject({ providerId: 'openai-compatible', modelId: 'anthropic/claude-haiku-4.5', baseUrl: 'https://openrouter.ai/api/v1' });
    expect(await r.value.model.config.resolveCredential()).toBe('');
    leased['openai-compatible--openrouter'] = 'sk-or-leased';
    expect(await r.value.model.config.resolveCredential()).toBe('sk-or-leased');
    expect(authProvidersOf(r.value.cfg)).toEqual(['openai-compatible--openrouter']);
    expect(entryTierOf(r.value.cfg)).toBe('large');
  });
  it('a model without auth_provider keeps api_key over api_key_env', async () => {
    const entry = { provider: 'openai', model_id: 'x', api_key: null, api_key_env: 'K', auth_provider: null } as unknown as ModelEntry;
    expect(await credentialResolver(entry, { K: 'from-env' }, () => ({}))()).toBe('from-env');
    expect(await credentialResolver({ ...entry, api_key: 'inline' }, { K: 'from-env' })()).toBe('inline');
  });
});
