import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '@rotaris/kernel';
import { authProvidersOf, classifierSlotsOf, configureRun, credentialResolver, egressReader, entryTierOf, personaResolverFor, runtimeFromConfiguration } from './configuration.js';
import { nodeClocks } from '@rotaris/platform';
import { loadConfiguration, type ModelEntry } from '@rotaris/config';

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

describe('the egress reader (ADR-0023, REQ-SANDBOX-038/118, REQ-TOOLS-089)', () => {
  it('reads the saved files at each call — a saved edit is seen by the next read, no restart; the cost is measured', async () => {
    mkdirSync(join(dir, 'config'), { recursive: true });
    mkdirSync(join(dir, 'ws', '.rotaris'), { recursive: true });
    writeFileSync(join(dir, 'config', 'project_settings.yaml'), SNAPSHOT);
    const file = join(dir, 'ws', '.rotaris', 'agents.yaml');
    writeFileSync(file, 'runtime:\n  network_egress_policy: deny\n  network_allowed_hosts: [ "*.example.com", docs.example ]\n  tool_call_timeout: 7\n');
    const read = egressReader(join(dir, 'config'), join(dir, 'ws'), nodeClocks());
    const first = await read();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.policy).toEqual({ denied: [], allowed: ['*.example.com', 'docs.example'], defaultDisposition: 'deny' });
    expect(first.toolCallTimeoutS).toBe(7);
    writeFileSync(file, 'runtime:\n  network_egress_policy: allow\n  network_denied_hosts: [ blocked.example ]\n');
    const second = await read();
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.policy).toEqual({ denied: ['blocked.example'], allowed: [], defaultDisposition: 'allow' });
    // REQ-CONFIG-115's default when the key is absent — the run level, never the executor's 10.0 s
    expect(second.toolCallTimeoutS).toBe(30);
    // the cost of one read — a YAML parse of two files plus the snapshot; stated for the record, bounded loosely
    const samples: number[] = [];
    for (let i = 0; i < 20; i += 1) samples.push((await read()).loadMs);
    const median = [...samples].sort((a, b) => a - b)[10] ?? 0;
    console.log(`egress policy read: median ${median.toFixed(2)} ms over ${samples.length} reads (min ${Math.min(...samples).toFixed(2)}, max ${Math.max(...samples).toFixed(2)})`);
    expect(median).toBeLessThan(250);
    // REQ-SANDBOX-032: a fatal file refuses the read, fail closed
    writeFileSync(file, 'runtime: [\n');
    const fatal = await read();
    expect(fatal.ok).toBe(false);
    if (fatal.ok) return;
    expect(fatal.reason).toMatch(/agents\.yaml/);
  });
  it('the live state is not consulted: only what is saved reaches the policy', async () => {
    mkdirSync(join(dir, 'config'), { recursive: true });
    mkdirSync(join(dir, 'ws', '.rotaris'), { recursive: true });
    const read = egressReader(join(dir, 'config'), join(dir, 'ws'), nodeClocks());
    const r = await read();
    expect(r.ok && r.policy.defaultDisposition).toBe('ask');
    expect(r.ok && r.toolCallTimeoutS).toBe(30);
  });
});

/**
 * PD-ORCH-004's progress rule reads the stall window: `runtime.child_stall_timeout` reaches the run, and a role's own
 * `stall_timeout` substitutes for it on that role's children and no others (REQ-CONFIG-108).
 */
describe('the stall window reaches the run (PD-ORCH-004, REQ-CONFIG-108, REQ-CONFIG-113)', () => {
  it('the runtime key is handed over in milliseconds, and only the role that states its own carries it', () => {
    mkdirSync(join(dir, 'ws', '.rotaris'), { recursive: true });
    writeFileSync(join(dir, 'ws', '.rotaris', 'agents.yaml'), `default_persona: coding-agent
models:
  selected:
    provider: openai
    model_id: first
    api_key: k
large_model: selected
medium_model: selected
small_model: selected
personas:
  coding-agent:
    name: Coding agent
    model: selected
    stall_timeout: 30
  tester:
    name: Tester
    model: selected
runtime:
  child_stall_timeout: 45
  graceful_pause_tool_deadline: 12
`);
    const loaded = loadConfiguration({ globalDir: join(dir, 'global'), workspaceRoot: join(dir, 'ws') });
    if (!loaded.ok) throw new Error('configuration');
    expect(runtimeFromConfiguration(loaded.value).childStallTimeoutMs).toBe(45_000);
    // REQ-ORCH-134 / PD-ORCH-005 clause 2: the pause's tool deadline reaches the run.
    expect(runtimeFromConfiguration(loaded.value).pauseToolDeadlineMs).toBe(12_000);
    const personas = personaResolverFor(loaded.value, true, () => undefined);
    expect(personas.resolve('coding-agent')!.persona.stallTimeoutMs).toBe(30_000);
    expect(personas.resolve('tester')!.persona.stallTimeoutMs).toBeUndefined();
  });
});

/**
 * PD-ORCH-005 clause 4: a continue that resumes an open iteration restores its root with its identity, persona
 * included, so the run is set up as the persona that root ran as — even when `default_persona` has changed since.
 */
describe('a resumed root is set up as the persona it ran as (PD-ORCH-005 clause 4, found by phase 4\'s review)', () => {
  const agents = `default_persona: coding-agent
models:
  selected:
    provider: openai
    model_id: first
    api_key: k
large_model: selected
medium_model: selected
small_model: selected
personas:
  coding-agent:
    name: Coding agent
    model: selected
  tester:
    name: Tester
    model: selected
`;

  it('the entry persona given replaces default_persona for that run; absent, default_persona stands', () => {
    mkdirSync(join(dir, 'ws', '.rotaris'), { recursive: true });
    writeFileSync(join(dir, 'ws', '.rotaris', 'agents.yaml'), agents);
    const resumed = configureRun(join(dir, 'ws'), true, deps({}), { entryPersona: 'tester' });
    expect(resumed.ok && resumed.value.model.config.persona).toBe('tester');
    const fresh = configureRun(join(dir, 'ws'), true, deps({}));
    expect(fresh.ok && fresh.value.model.config.persona).toBe('coding-agent');
  });

  it('a persona the configuration no longer knows refuses the continue, naming the way on', () => {
    mkdirSync(join(dir, 'ws', '.rotaris'), { recursive: true });
    writeFileSync(join(dir, 'ws', '.rotaris', 'agents.yaml'), agents);
    const r = configureRun(join(dir, 'ws'), true, deps({}), { entryPersona: 'gone-role' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe("The open iteration's root ran as 'gone-role', which names no role this build knows now; continue without its agents to start a new iteration.");
  });
});
