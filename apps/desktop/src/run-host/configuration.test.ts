import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { authProvidersOf, classifierSlotsOf, configureRun, credentialResolver, entryTierOf } from './configuration.js';
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
    const entryModel = r.value.model.config.model;
    expect(await r.value.model.config.credentialFor(entryModel)()).toBe('');
    leased['openai-compatible--openrouter'] = 'sk-or-leased';
    expect(await r.value.model.config.credentialFor(entryModel)()).toBe('sk-or-leased');
    expect(authProvidersOf(r.value.cfg)).toEqual(['openai-compatible--openrouter']);
    expect(entryTierOf(r.value.cfg)).toBe('large');
  });
  it('ADR-0030 per model: two providers each lease their own bearer; an api_key_env model beside them keeps its key; an unleased slot is skipped', async () => {
    mkdirSync(join(dir, 'config'), { recursive: true });
    mkdirSync(join(dir, 'ws', '.rotaris'), { recursive: true });
    writeFileSync(join(dir, 'config', 'project_settings.yaml'), SNAPSHOT);
    writeFileSync(join(dir, 'ws', '.rotaris', 'agents.yaml'), `models:
  second:
    provider: openai-compatible
    model_id: tiny
    base_url: https://second.example/v1
    auth_provider: openai-compatible--second
  keyed:
    provider: openai
    model_id: gpt-x
    api_key_env: KEYED
small_model: second
default_summary_model: keyed
`);
    const leased: Record<string, string> = { 'openai-compatible--openrouter': 'bearer-one', 'openai-compatible--second': 'bearer-two' };
    const d = { ...deps(leased), env: { KEYED: 'from-env' } };
    const r = configureRun(join(dir, 'ws'), true, d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.authProviders).toEqual(['openai-compatible--openrouter', 'openai-compatible--second']);
    const f = r.value.model.config.credentialFor;
    expect(await f(r.value.model.config.model)()).toBe('bearer-one');
    expect(await f({ providerId: 'openai-compatible', modelId: 'tiny', dialect: 'chat', baseUrl: 'https://second.example/v1' })()).toBe('bearer-two');
    expect(await f({ providerId: 'openai', modelId: 'gpt-x', dialect: 'chat', baseUrl: 'https://api.openai.com/v1' })()).toBe('from-env');
    // a reference no entry produced: the entry model's credential, once warned
    expect(await f({ providerId: 'openai-compatible', modelId: 'unknown', dialect: 'chat', baseUrl: 'https://second.example/v1' })()).toBe('bearer-one');
    expect((r.value.warnings ?? []).filter((w) => /no models: entry produced/.test(w)).length).toBe(1);
    // REQ-CONFIG-065: the summariser on its own slot
    expect(r.value.model.summariser?.model).toMatchObject({ providerId: 'openai', modelId: 'gpt-x' });
    // REQ-ORCH-009: a slot whose provider was not leased is skipped with a warning; the next slot answers
    const warnings: string[] = [];
    const slots = classifierSlotsOf(r.value.cfg, false, { 'openai-compatible--openrouter': 'bearer-one' }, (m) => warnings.push(m));
    expect(slots.small).toBeNull();
    expect(slots.summary?.modelId).toBe('gpt-x');
    expect(warnings[0]).toMatch(/small_model names second, whose provider openai-compatible--second is not authenticated/);
    expect(classifierSlotsOf(r.value.cfg, false).small?.modelId).toBe('tiny');
  });
  it('a model without auth_provider keeps api_key over api_key_env', async () => {
    const entry = { provider: 'openai', model_id: 'x', api_key: null, api_key_env: 'K', auth_provider: null } as unknown as ModelEntry;
    expect(await credentialResolver(entry, { K: 'from-env' }, () => ({}))()).toBe('from-env');
    expect(await credentialResolver({ ...entry, api_key: 'inline' }, { K: 'from-env' })()).toBe('inline');
  });
});
