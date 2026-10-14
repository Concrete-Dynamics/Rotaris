import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicaliseRoles, mergeLayers, overlaySection, PLAIN_OPS } from './merge.js';
import { loadConfiguration, readDelegationStrategy, repositoryExcludeFile, statedPrefixLength, type LoadedConfiguration } from './load.js';
import { parseConfig } from './document.js';
import { referentialMessages, renderFatal, renderProblems } from './validate.js';
import { resolveSlotsAndReasoning, registeredAliases, resolveSlotBase, syntheticOriginOf } from './slots.js';
import { readRuntimeSection, validateRuntimeField, RUNTIME_DEFAULTS } from './sections/runtime.js';
import { effectivePricing, modelCapInForce, readModelEntry, providerEffort } from './sections/models.js';
import { readCircuitBreakerSection, CIRCUIT_BREAKER_DEFAULTS } from './circuit-breaker-section.js';
import { checkpointsEnabledFor } from './sections/checkpoints.js';
import { CODE_INTELLIGENCE_MARKER_SEGMENTS } from './mcp/code-intelligence.js';
import type { ProblemSink } from './sections/field.js';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rotaris-load-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function scopes(globalText: string | null, workspaceText: string | null, extra: { globalModels?: string; workspaceModels?: string } = {}): { globalDir: string; workspaceRoot: string } {
  const globalDir = join(tmp(), 'config');
  const workspaceRoot = join(tmp(), 'ws');
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
  if (globalText !== null) writeFileSync(join(globalDir, 'agents.yaml'), globalText);
  if (workspaceText !== null) writeFileSync(join(workspaceRoot, '.rotaris', 'agents.yaml'), workspaceText);
  if (extra.globalModels) writeFileSync(join(globalDir, 'models.yml'), extra.globalModels);
  if (extra.workspaceModels) writeFileSync(join(workspaceRoot, '.rotaris', 'models.yml'), extra.workspaceModels);
  return { globalDir, workspaceRoot };
}

function loaded(globalText: string | null, workspaceText: string | null, extra: { globalModels?: string; workspaceModels?: string } = {}): LoadedConfiguration {
  const r = loadConfiguration(scopes(globalText, workspaceText, extra));
  if (!r.ok) throw new Error(`load failed: ${r.error.lines.join(' | ')}`);
  return r.value;
}

const sink = (): ProblemSink => ({ errors: [], warnings: [] });

describe('REQ-CONFIG-040..050 the four merge classes', () => {
  it('replace-if-not-null: null cannot clear an inherited value (REQ-CONFIG-052)', () => {
    const m = mergeLayers([{ source: 'g', value: { large_model: 'big' } }, { source: 'w', value: { large_model: null } }]);
    expect(m.value['large_model']).toBe('big');
  });
  it('named entries union by name, overlay immediate fields, replace lists and nested maps wholesale, null clears (REQ-CONFIG-043..046, 053)', () => {
    const m = mergeLayers([
      { source: 'g', value: { personas: { a: { name: 'a', model: 'x', tools: ['read_file', 'grep'], tool_restrictions: { k: ['v'] }, system_prompt_file: 'p.md' }, b: { name: 'b', model: 'y' } } } },
      { source: 'w', value: { personas: { a: { tools: ['glob'], tool_restrictions: { z: [] }, system_prompt_file: null } } } },
    ]);
    const personas = m.value['personas'] as Record<string, Record<string, unknown>>;
    expect(personas['a']).toEqual({ name: 'a', model: 'x', tools: ['glob'], tool_restrictions: { z: [] }, system_prompt_file: null });
    expect(personas['b']).toEqual({ name: 'b', model: 'y' });
  });
  it('sections overlay per field recursively; a bare section key contributes nothing (REQ-CONFIG-047/048/054)', () => {
    const m = mergeLayers([
      { source: 'g', value: { runtime: { max_depth: 5, max_iterations: 9 }, requirements: { board: { card_limit: 3, filters: ['x'] } }, verifier: { checks: [] } } },
      { source: 'w', value: { runtime: { max_depth: 2 }, requirements: { board: { card_limit: 7 } }, verifier: null } },
    ]);
    expect(m.value['runtime']).toEqual({ max_depth: 2, max_iterations: 9 });
    expect(m.value['requirements']).toEqual({ board: { card_limit: 7, filters: ['x'] } });
    expect(m.value['verifier']).toEqual({ checks: [] });
  });
  it('a computed key written into a file has no effect; an unknown key warns naming the file (REQ-CONFIG-049/040)', () => {
    const m = mergeLayers([{ source: 'C:/x/agents.yaml', value: { workspace_root: '/elsewhere', something_new: 1, rotaris: { delegation_strategy: 'single' } } }]);
    expect(m.value['workspace_root']).toBeUndefined();
    expect(m.warnings).toEqual([{ source: 'C:/x/agents.yaml', path: 'something_new', message: "unknown top-level key 'something_new' contributes nothing and is left in place" }]);
  });
  it('the shared overlay never mutates the lower layer', () => {
    const lower = { runtime: { hosts: ['a'] } };
    const target: Record<string, unknown> = {};
    overlaySection(target, lower, PLAIN_OPS);
    (target['runtime'] as { hosts: string[] }).hosts.push('b');
    expect(lower.runtime.hosts).toEqual(['a']);
  });
  it('REQ-CONFIG-062: legacy role names canonicalise per scope, before the merge, field-merging duplicates', () => {
    const v = canonicaliseRoles({ default_persona: 'oracle', personas: { oracle: { name: 'oracle', model: 'a', delegates_to: ['oracle'], tool_restrictions: { oracle: ['x'] } }, 'codebase-analyst': { model: 'b' } } });
    expect(v['default_persona']).toBe('codebase-analyst');
    expect(v['personas']).toEqual({ 'codebase-analyst': { name: 'codebase-analyst', model: 'b', delegates_to: ['codebase-analyst'], tool_restrictions: { 'codebase-analyst': ['x'] } } });
  });
});

describe('REQ-CONFIG-051 the end-to-end two-scope fixture', () => {
  it('workspace role fields win per field, unstated fields inherit, a global-only role survives, models union across four files, runtime states two keys', () => {
    const c = loaded(
      [
        'personas:',
        '  coding-agent:',
        '    name: coding-agent',
        '    model: large_model',
        '    purpose: writes code',
        '    tools: [read_file, write_file, terminal]',
        '  reviewer:',
        '    name: reviewer',
        '    model: medium_model',
        'models:',
        '  g-agents: { provider: openai, model_id: g1 }',
        'runtime:',
        '  max_depth: 4',
        '  max_iterations: 7',
        '  child_timeout: 900',
      ].join('\n'),
      [
        'personas:',
        '  coding-agent:',
        '    model: ws-model',
        '    tools: [glob]',
        'models:',
        '  w-agents: { provider: openai, model_id: w1 }',
        'runtime:',
        '  max_depth: 2',
        '  max_iterations: 3',
      ].join('\n'),
      { globalModels: 'models:\n  ws-model: { provider: openai, model_id: gm }\n  g-models: { provider: openai, model_id: g2 }\n', workspaceModels: 'models:\n  w-models: { provider: openai, model_id: w2 }\nignored_key: 1\n' },
    );
    const coder = c.personas['coding-agent']!;
    expect(coder.model).toBe('ws-model');
    expect(coder.purpose).toBe('writes code');
    expect(coder.tools).toEqual(['glob']);
    expect(c.personas['reviewer']?.model).toBe('gpt-4o-mini');
    expect(Object.keys(c.models).sort()).toEqual(['g-agents', 'g-models', 'gpt-4o', 'gpt-4o-mini', 'w-agents', 'w-models', 'ws-model']);
    expect(c.runtime.max_depth).toBe(2);
    expect(c.runtime.max_iterations).toBe(3);
    expect(c.runtime.child_timeout).toBe(900);
    expect(c.runtime.max_children).toBe(RUNTIME_DEFAULTS.max_children);
    expect(c.referential).toEqual([]);
    expect(c.loadMs).toBeNull();
    let tick = 0;
    const timed = loadConfiguration({ ...scopes(null, null), now: () => (tick += 5) });
    expect(timed.ok && timed.value.loadMs).toBe(5);
  });
  it('REQ-CONFIG-005: a scope\'s models.yml overlays that scope\'s agents.yaml per field and still loses to the workspace agents.yaml', () => {
    const c = loaded('models:\n  m: { provider: openai, model_id: from-agents, timeout: 5 }\n', 'models:\n  m: { provider: openai, model_id: from-ws-agents }\n', { globalModels: 'models:\n  m: { provider: openai, model_id: from-models-yml }\n' });
    expect(c.models['m']?.model_id).toBe('from-ws-agents');
    const g = loaded('models:\n  m: { provider: openai, model_id: from-agents, timeout: 5 }\n', null, { globalModels: 'models:\n  m: { provider: openai, model_id: from-models-yml }\n' });
    expect(g.models['m']).toMatchObject({ model_id: 'from-models-yml', timeout: 5 });
  });
  it('REQ-CONFIG-012/016/017: no files, empty and comment-only files all load on the built-in defaults', () => {
    const none = loadConfiguration({ globalDir: join(tmp(), 'absent'), workspaceRoot: join(tmp(), 'absent-ws') });
    expect(none.ok && none.value.slots.large_model).toBe('gpt-4o');
    const c = loaded('   \n', '# only a comment\n');
    expect(c.slots.small_model).toBe('gpt-4o-mini');
    expect(c.defaultPersona).toBe('orchestrator');
    expect(c.personas['orchestrator']?.model).toBe('gpt-4o');
    expect(c.warnings).toEqual([]);
  });
  it('REQ-MCP-014: the intent-classifier persona ships in the defaults, carrying no servers', () => {
    const c = loaded(null, null);
    const p = c.personas['intent-classifier'];
    expect(p).toMatchObject({ name: 'intent-classifier', model: 'gpt-4o-mini', mcp_servers: [] });
    expect(c.warnings).toEqual([]);
  });
  // Found live 2026-09-16: a global file's leftover partial override for a persona the defaults
  // did not declare failed the whole load. The default entry is what makes the merge contract hold.
  it('a partial personas override for intent-classifier merges onto its default entry and loads (REQ-CONFIG-031, REQ-CONFIG-098)', () => {
    const c = loaded('personas:\n  intent-classifier:\n    thinking: low\n', null);
    const entry = c.personas['intent-classifier'];
    // The stated thinking synthesises the reserved model name (REQ-CONFIG-079); the underlying
    // model is the entry's own default, the small slot's base.
    expect(entry).toMatchObject({ name: 'intent-classifier', mcp_servers: [] });
    expect(syntheticOriginOf(entry!.model, c.syntheticOrigins)).toBe('gpt-4o-mini');
    expect(c.warnings).toEqual([]);
  });
  // OQ-228 and OQ-229 (ruled 2026-10-07 under R-072): `intent-classifier` is no delegation target, and a non-empty `delegates_to`
  // narrows a persona's targets. Both are refusals at delegation, never at load: an override of the persona, and a list naming
  // it, still load with nothing refused (fin33's plan for P5 asked for this case; it had existing coverage only).
  it('OQ-228 / OQ-229: an intent-classifier override, and a delegates_to naming it, still load (REQ-CONFIG-031, REQ-CONFIG-101)', () => {
    const c = loaded('personas:\n  intent-classifier:\n    thinking: low\n    tools: [read_file]\n  orchestrator:\n    delegates_to: [intent-classifier, coding-agent]\n', null);
    expect(c.personas['intent-classifier']).toMatchObject({ name: 'intent-classifier', tools: ['read_file'], mcp_servers: [] });
    expect(c.personas['orchestrator']?.delegates_to).toEqual(['intent-classifier', 'coding-agent']);
    expect(c.referential).toEqual([]);
    expect(c.warnings).toEqual([]);
  });
});

describe('REQ-CONFIG-063..081 tier aliases and reasoning synthesis', () => {
  it('registers an alias only for a concrete slot value; a literal alias survives to referential validation (REQ-CONFIG-074)', () => {
    expect(registeredAliases({ small_model: 'medium_model', medium_model: 'm', large_model: 'large_model', default_summary_model: null, improvement_collector_model: null, retrospective_model: null, gatekeeper_model: null, fallback_model: null })).toEqual({ medium_model: 'm' });
    const c = loaded(null, 'small_model: medium_model\nmedium_model: gpt-4o\n');
    expect(c.slots.small_model).toBe('medium_model');
    expect(c.referential).toContain("small_model 'medium_model' names no configured model (a tier alias that registered no substitution)");
  });
  it('substitutes every reference field, records the tier per role, and resolves fallback_model from small_model (REQ-CONFIG-067/071/073)', () => {
    const c = loaded(null, 'small_model: gpt-4o-mini\nlarge_model: gpt-4o\ndefault_summary_model: large_model\npersonas:\n  tester: { model: large_model, summary_model: small_model }\ncompressor:\n  model: large_model\ncircuit_breaker:\n  model: large_model\n');
    expect(c.slots.default_summary_model).toBe('gpt-4o');
    expect(c.slots.fallback_model).toBe('gpt-4o-mini');
    expect(c.personas['tester']).toMatchObject({ model: 'gpt-4o', summary_model: 'gpt-4o-mini' });
    expect(c.compressor.model).toBe('gpt-4o');
    expect(c.circuitBreaker.model).toBe('gpt-4o');
    expect(c.resolvedPersonaModelTiers['tester']).toBe('large_model');
    expect(c.resolvedPersonaModelTiers['orchestrator']).toBe('large_model');
  });
  it('slot reasoning synthesises a reserved entry and repoints the slot; a cycle and a missing base each warn and skip (REQ-CONFIG-076..078)', () => {
    const c = loaded(null, 'small_model_thinking: high\ndefault_summary_model: fallback_model\nfallback_model: default_summary_model\ndefault_summary_model_thinking: low\ngatekeeper_model: nope\ngatekeeper_model_thinking: max\n');
    expect(c.slots.small_model).toBe('__startup_slot__:small_model');
    expect(c.models['__startup_slot__:small_model']).toMatchObject({ model_id: 'gpt-4o-mini', thinking: 'high' });
    expect(c.warnings.some((w) => w.includes('circular'))).toBe(true);
    expect(c.warnings.some((w) => w.includes("gatekeeper_model names 'nope'"))).toBe(true);
    expect(resolveSlotBase({ ...c.slots, a: 'b' } as never, 'small_model').cycle).toBe(false);
  });
  it('role reasoning: default normalises to unset, provider_default clears the effort, a level copies the resolved model (REQ-CONFIG-079/080)', () => {
    const c = loaded(null, 'models:\n  m: { provider: openai, model_id: m, thinking: high, reasoning_effort: xhigh }\nmedium_model: m\npersonas:\n  tester: { thinking: provider_default }\n  planner: { thinking: default }\n  verifier: { model: m, thinking: low }\n  librarian: { model: missing, thinking: low }\n');
    expect(c.personas['tester']?.model).toBe('__persona__:tester');
    expect(c.models['__persona__:tester']).toMatchObject({ thinking: null, reasoning_effort: null });
    expect(c.personas['planner']).toMatchObject({ model: 'gpt-4o', thinking: null });
    expect(c.models['__persona__:verifier']?.thinking).toBe('low');
    expect(c.warnings).toContain("thinking for role librarian skipped: 'missing' is not a configured model");
  });
  it('REQ-CONFIG-081/094: each synthetic copy records the models: key it was copied from, even where two keys name the same provider model', () => {
    const c = loaded(null, 'models:\n  openai-compatible--alpha/qwen: { provider: openai-compatible, model_id: qwen, base_url: https://alpha.example/v1, max_parallel: 1 }\n  openai-compatible--beta/qwen: { provider: openai-compatible, model_id: qwen, base_url: https://beta.example/v1, max_parallel: 4 }\nsmall_model: openai-compatible--beta/qwen\nsmall_model_thinking: high\npersonas:\n  verifier: { model: openai-compatible--beta/qwen, thinking: low }\n  tester: { model: openai-compatible--alpha/qwen, thinking: low }\n');
    expect(c.personas['verifier']?.model).toBe('__persona__:verifier');
    expect(c.syntheticOrigins['__persona__:verifier']).toBe('openai-compatible--beta/qwen');
    expect(c.syntheticOrigins['__persona__:tester']).toBe('openai-compatible--alpha/qwen');
    expect(c.syntheticOrigins['__startup_slot__:small_model']).toBe('openai-compatible--beta/qwen');
    expect(syntheticOriginOf('__persona__:verifier', c.syntheticOrigins)).toBe('openai-compatible--beta/qwen');
    // A name the loader did not synthesise is its own key.
    expect(syntheticOriginOf('openai-compatible--alpha/qwen', c.syntheticOrigins)).toBe('openai-compatible--alpha/qwen');
  });
  it('REQ-CONFIG-094/253: a slot chained through five earlier slots\' copies still unwraps to the key at the end of the chain', () => {
    // Each slot names the one before it and states a level, so each copy's recorded origin is the previous slot's copy.
    const c = loaded(null, 'models:\n  openai-compatible--alpha/qwen: { provider: openai-compatible, model_id: qwen }\n  openai-compatible--beta/qwen: { provider: openai-compatible, model_id: qwen }\ndefault_summary_model: openai-compatible--beta/qwen\ndefault_summary_model_thinking: low\nimprovement_collector_model: default_summary_model\nimprovement_collector_model_thinking: low\nretrospective_model: improvement_collector_model\nretrospective_model_thinking: low\ngatekeeper_model: retrospective_model\ngatekeeper_model_thinking: low\nsmall_model: gatekeeper_model\nsmall_model_thinking: low\nmedium_model: small_model\nmedium_model_thinking: high\n');
    expect(c.slots.medium_model).toBe('__startup_slot__:medium_model');
    expect(c.syntheticOrigins['__startup_slot__:medium_model']).toBe('__startup_slot__:small_model');
    expect(syntheticOriginOf('__startup_slot__:medium_model', c.syntheticOrigins)).toBe('openai-compatible--beta/qwen');
    // A recorded cycle (never produced by the loader) ends the walk instead of spinning.
    expect(syntheticOriginOf('a', { a: 'b', b: 'a' })).toBe('b');
  });
  it('the transform is pure over a draft', () => {
    const draft = { slots: { small_model: 'a', medium_model: 'a', large_model: 'a', default_summary_model: 'small_model', improvement_collector_model: null, retrospective_model: null, gatekeeper_model: null, fallback_model: null }, slotThinking: { small_model: null, medium_model: null, large_model: null, default_summary_model: null, improvement_collector_model: null, retrospective_model: null, gatekeeper_model: null, fallback_model: null }, models: { a: readModelEntry('a', { provider: 'p', model_id: 'a' }, sink())! }, personas: {}, compressorModel: 'small_model', circuitBreakerModel: 'x' };
    const r = resolveSlotsAndReasoning(draft);
    expect(r.warnings).toEqual([]);
    expect(draft.slots.fallback_model).toBe('a');
    expect(draft.compressorModel).toBe('a');
    expect(draft.circuitBreakerModel).toBe('x');
  });
});

describe('the cap in force for a model (PD-PROVIDER-001, REQ-MONITOR-021, REQ-CONFIG-057/095)', () => {
  const caps = { deepseek: 3, 'claude-code': 2 };
  it('is the provider\'s declared cap when the entry states none, and unbounded for a provider that declares none', () => {
    const s = sink();
    expect(modelCapInForce(readModelEntry('d', { provider: 'deepseek', model_id: 'x' }, s)!, caps)).toBe(3);
    expect(modelCapInForce(readModelEntry('c', { provider: 'claude-code', model_id: 'x' }, s)!, caps)).toBe(2);
    expect(modelCapInForce(readModelEntry('o', { provider: 'openai-compatible', model_id: 'x', base_url: 'https://x.example/v1' }, s)!, caps)).toBeNull();
    // A provider added later caps its models by declaring a number, with no name written here.
    expect(modelCapInForce(readModelEntry('n', { provider: 'newcomer', model_id: 'x' }, s)!, { newcomer: 7 })).toBe(7);
    expect(modelCapInForce(undefined, caps)).toBeNull();
  });
  it('is the entry\'s own when stated, raising, lowering or removing the declared one entirely', () => {
    const s = sink();
    expect(modelCapInForce(readModelEntry('d', { provider: 'deepseek', model_id: 'x', max_parallel: 8 }, s)!, caps)).toBe(8);
    expect(modelCapInForce(readModelEntry('d', { provider: 'deepseek', model_id: 'x', max_parallel: 1 }, s)!, caps)).toBe(1);
    expect(modelCapInForce(readModelEntry('d', { provider: 'deepseek', model_id: 'x', max_parallel: null }, s)!, caps)).toBeNull();
  });
});

describe('REQ-CONFIG-082..110 model and persona entries', () => {
  it('reads the fields, the legacy thinking booleans, a stated max_parallel and the explicit null (REQ-CONFIG-057/090/095)', () => {
    const s = sink();
    // PD-PROVIDER-001: configuration holds no provider's cap; an unstated `max_parallel` stays unstated, and the cap in
    // force is the provider's catalogue entry's (`modelCapInForce`). Until fin22 this read `max_parallel: 3` here.
    const deepseek = readModelEntry('d', { provider: 'deepseek', model_id: 'x', thinking: true }, s)!;
    expect(deepseek).toMatchObject({ thinking: 'high' });
    expect(deepseek).not.toHaveProperty('max_parallel');
    const capped = readModelEntry('e', { provider: 'deepseek', model_id: 'x', max_parallel: null, thinking: false }, s)!;
    expect(capped).toMatchObject({ max_parallel: null, thinking: null });
    expect(readModelEntry('f', { provider: 'deepseek', model_id: 'x', max_parallel: 5 }, s)).toMatchObject({ max_parallel: 5 });
    const copilot = readModelEntry('c', { provider: 'openai', model_id: 'x', auth_provider: 'copilot', mystery: 1 }, s)!;
    expect(copilot.disable_responses_api).toBe(true);
    expect(s.errors).toEqual([]);
    expect(s.warnings.map((w) => w.path)).toEqual(['models.c.mystery']);
  });
  it('REQ-CONFIG-088 (amended, OQ-21): a price is the decimal its text states, in any spelling, number or quoted string', () => {
    const c = loaded([
      'models:',
      '  plain:    { provider: openai, model_id: a, input_cost_per_token: 0.000003,   output_cost_per_token: 0.000015 }',
      '  exponent: { provider: openai, model_id: b, input_cost_per_token: 3e-6,       output_cost_per_token: 1.5E-5 }',
      '  quoted:   { provider: openai, model_id: c, input_cost_per_token: "0.000003", output_cost_per_token: \'0.000015\' }',
      '  short:    { provider: openai, model_id: d, input_cost_per_token: .000003,    output_cost_per_token: 0 }',
      // A price a double cannot hold exactly: 0.1 + 0.2 is the classic, and 0.0000001 is the per-token reality.
      '  tiny:     { provider: openai, model_id: e, input_cost_per_token: 0.0000001,  output_cost_per_token: 0.30000000000000004 }',
    ].join('\n') + '\n', null);
    for (const key of ['plain', 'exponent', 'quoted']) expect(c.models[key]).toMatchObject({ input_cost_per_token: '0.000003', output_cost_per_token: key === 'exponent' ? '0.000015' : '0.000015' });
    expect(c.models['short']).toMatchObject({ input_cost_per_token: '0.000003', output_cost_per_token: '0' });
    expect(c.models['tiny']).toMatchObject({ input_cost_per_token: '0.0000001', output_cost_per_token: '0.30000000000000004' });
    expect(effectivePricing(c.models['plain']!)).toEqual({ input: '0.000003', output: '0.000015' });
  });
  it('REQ-CONFIG-088: one price alone has no effect; a workspace price overrides a global one exactly; models.yml is read the same way', () => {
    const c = loaded(
      'models:\n  m: { provider: openai, model_id: m, input_cost_per_token: 0.000001, output_cost_per_token: 0.000002 }\n  half: { provider: openai, model_id: h, input_cost_per_token: 0.000001 }\n',
      'models:\n  m: { provider: openai, model_id: m, output_cost_per_token: 2e-7 }\n',
      { workspaceModels: 'models:\n  y: { provider: openai, model_id: y, input_cost_per_token: 1e-6, output_cost_per_token: 2e-6 }\n' },
    );
    expect(effectivePricing(c.models['m']!)).toEqual({ input: '0.000001', output: '0.0000002' });
    expect(c.models['half']).toMatchObject({ input_cost_per_token: '0.000001', output_cost_per_token: null });
    expect(effectivePricing(c.models['half']!)).toBeNull();
    expect(effectivePricing(c.models['y']!)).toEqual({ input: '0.000001', output: '0.000002' });
  });
  it('REQ-CONFIG-088: a negative or non-decimal price fails the load, naming the field', () => {
    for (const bad of ['-0.000001', '"cheap"', '.inf', 'true']) {
      const r = loadConfiguration(scopes(`models:\n  m: { provider: openai, model_id: m, input_cost_per_token: ${bad}, output_cost_per_token: 0.1 }\n`, null));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.path).toBe('models.m.input_cost_per_token');
    }
  });
  it('REQ-CONFIG-092/093: effort reaches a provider as low/medium/high/xhigh, the map wins, auto reaches nothing', () => {
    expect(providerEffort({ thinking: 'max', reasoning_effort: null, reasoning_effort_map: {} })).toBe('xhigh');
    expect(providerEffort({ thinking: 'max', reasoning_effort: null, reasoning_effort_map: { max: 'ultra' } })).toBe('ultra');
    expect(providerEffort({ thinking: 'auto', reasoning_effort: null, reasoning_effort_map: {} })).toBeNull();
    expect(providerEffort({ thinking: 'low', reasoning_effort: 'explicit', reasoning_effort_map: {} })).toBe('explicit');
  });
  it('a multi-line purpose fails the load; an unknown permission mode coerces to restricted with a warning (REQ-CONFIG-099/109)', () => {
    const bad = loadConfiguration(scopes(null, 'personas:\n  tester:\n    purpose: "two\\nlines"\n'));
    expect(bad.ok).toBe(false);
    if (!bad.ok) { expect(bad.error.path).toBe('personas.tester.purpose'); expect(bad.error.kind).toBe('schema'); expect(bad.error.scope).toBe('workspace'); }
    const c = loaded(null, 'personas:\n  tester:\n    permission_mode: sudo\n');
    expect(c.personas['tester']?.permission_mode).toBe('restricted');
    expect(c.warnings.some((w) => w.includes('sudo'))).toBe(true);
  });
});

describe('REQ-CONFIG-111..131 the runtime section', () => {
  it('reads defaults, ranges and the other domains\' vocabularies; sandbox_mode off folded by YAML is still off (REQ-SANDBOX-049)', () => {
    const p = parseConfig('runtime:\n  sandbox_mode: off\n  network_egress_policy: "  ASK "\n  permission_mode: sudo\n  headless_approval_policy: whatever\n  terminal_stream_interval_ms: 50\n  sandbox_writable_roots: ["  ", "C:/data", "/srv"]\n  additional_read_only_roots: [relative]\n');
    const s = sink();
    const runtime = readRuntimeSection((p.ok ? p.value.doc.toJSON() : {}).runtime, s);
    expect(runtime.sandbox_mode).toBe('off');
    expect(runtime.network_egress_policy).toBe('ask');
    expect(runtime.permission_mode).toBe('restricted');
    expect(runtime.headless_approval_policy).toBe('deny');
    expect(runtime.terminal_stream_interval_ms).toBe(50);
    expect(runtime.sandbox_writable_roots).toEqual(['C:/data', '/srv']);
    expect(s.errors.map((e) => e.path)).toEqual(['runtime.additional_read_only_roots.0']);
    expect(s.warnings.map((w) => w.path).sort()).toEqual(['runtime.headless_approval_policy', 'runtime.permission_mode']);
  });
  it('a bad confinement mode, egress disposition or run-start mode is fatal with the vocabulary named (REQ-SANDBOX-048, REQ-SANDBOX-002, REQ-CONFIG-476)', () => {
    for (const [text, path] of [['runtime:\n  sandbox_mode: on\n', 'runtime.sandbox_mode'], ['runtime:\n  network_egress_policy: maybe\n', 'runtime.network_egress_policy'], ['runtime:\n  run_start_mode: think\n', 'runtime.run_start_mode']] as const) {
      const r = loadConfiguration(scopes(null, text));
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.error.path).toBe(path); expect(r.error.lines[0]).toMatch(/expected one of/); }
    }
  });
  it('REQ-CONFIG-111: assignment-time validation is the load\'s schema over one key', () => {
    expect(validateRuntimeField('max_depth', 0).map((p) => p.message)).toEqual(['must be at least 1, got 0']);
    expect(validateRuntimeField('max_depth', 3)).toEqual([]);
    expect(validateRuntimeField('permission_mode', 'sudo')).toHaveLength(1);
    expect(validateRuntimeField('nope', 1)[0]?.message).toBe("unknown runtime key 'nope'");
  });
  it('REQ-CONFIG-136/137: the breaker thresholds load and a timeout_seconds key is an unknown-key warning', () => {
    const s = sink();
    const cb = readCircuitBreakerSection({ timeout_seconds: 4, tool_weight: 0.9, cycle_threshold: 2 }, s);
    expect(cb).toEqual({ ...CIRCUIT_BREAKER_DEFAULTS, tool_weight: 0.9, cycle_threshold: 2 });
    expect(s.errors).toEqual([]);
    expect(s.warnings.map((w) => w.path)).toEqual(['circuit_breaker.timeout_seconds']);
  });
});

describe('REQ-CONFIG-229..238, 478 validation and the fatal report', () => {
  it('renders one line per problem and gathers missing model fields into exactly two lines', () => {
    const lines = renderProblems([{ path: '', message: 'field required' }, { path: 'models.b.provider', message: 'missing required field' }, { path: 'models.a.model_id', message: 'missing required field' }, { path: 'models.a.provider', message: 'missing required field' }]);
    expect(lines).toEqual([
      'config: missing required field',
      'models with missing required fields: a (model_id, provider); b (provider)',
      'a models: entry is replaced as a whole across configuration scopes, so an override of a model has to repeat provider and model_id even when only some other field is being changed',
    ]);
    expect(renderProblems([])).toEqual(['the configuration is invalid']);
  });
  it('a syntax error, a non-mapping top level and non-UTF-8 bytes each abort naming the file and the kind (REQ-CONFIG-018/019/462)', () => {
    const syntax = loadConfiguration(scopes('hooks: [\n', null));
    expect(!syntax.ok && syntax.error).toMatchObject({ kind: 'syntax', scope: 'global', path: '' });
    if (!syntax.ok) expect(renderFatal(syntax.error)).toContain('agents.yaml (global scope)');
    const list = loadConfiguration(scopes(null, '- a\n- b\n'));
    expect(!list.ok && list.error).toMatchObject({ kind: 'top-level', scope: 'workspace' });
    const s = scopes(null, null);
    writeFileSync(join(s.workspaceRoot, '.rotaris', 'models.yml'), Buffer.from([0xff, 0xfe, 0x41]));
    const encoding = loadConfiguration(s);
    expect(!encoding.ok && encoding.error).toMatchObject({ kind: 'encoding', scope: 'workspace' });
    if (!encoding.ok) expect(encoding.error.message).toContain('UTF-8');
  });
  it('a schema fault carries the key path and every line; a BOM is accepted', () => {
    const r = loadConfiguration(scopes('\uFEFFruntime:\n  max_depth: many\n', 'models:\n  m: { provider: openai }\n'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.path).toBe('models.m.model_id');
    expect(r.error.lines).toEqual(['runtime.max_depth: must be an integer, got string', 'models with missing required fields: m (model_id)', expect.stringContaining('replaced as a whole')]);
    expect(renderFatal(r.error)).toContain('does not recognise it');
  });
  /**
   * REQ-CONFIG-478: the report names the file that STATED the rejected key, by full path and scope — a fault found on the
   * merged document was attributed to the workspace `agents.yaml` whatever file declared it, naming a file that need not
   * exist and the wrong scope (docs/defects/fixed/a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md).
   */
  describe('REQ-CONFIG-478: a merged-document fault names the file and scope that stated it', () => {
    const fault = (s: { globalDir: string; workspaceRoot: string }) => { const r = loadConfiguration(s); if (r.ok) throw new Error('the load did not fail'); return r.error; };
    it('an unknown key under requirements: in the global file, with no workspace file, is the global file\'s (REQ-CONFIG-183)', () => {
      const s = scopes('requirements:\n  scheduling:\n    mode: automatic\n  no_such_key: 1\n', null);
      const e = fault(s);
      expect(e).toMatchObject({ kind: 'schema', path: 'requirements.no_such_key', file: join(s.globalDir, 'agents.yaml'), scope: 'global' });
      expect(renderFatal(e)).toContain(`${join(s.globalDir, 'agents.yaml')} at requirements.no_such_key (global scope)`);
    });
    it('a workspace file that states a sibling key in the same section does not take the global file\'s fault', () => {
      const s = scopes('requirements:\n  no_such_key: 1\n', 'requirements:\n  scheduling:\n    mode: automatic\n');
      expect(fault(s)).toMatchObject({ path: 'requirements.no_such_key', file: join(s.globalDir, 'agents.yaml'), scope: 'global' });
    });
    it('a key both scopes state is the workspace file\'s, the value the merge kept', () => {
      const s = scopes('requirements:\n  no_such_key: 1\n', 'requirements:\n  no_such_key: 2\n');
      expect(fault(s)).toMatchObject({ path: 'requirements.no_such_key', file: join(s.workspaceRoot, '.rotaris', 'agents.yaml'), scope: 'workspace' });
    });
    it('a top-level null in the workspace file states nothing, so the global value it left in force is the global file\'s (REQ-CONFIG-052)', () => {
      const s = scopes('inject_agents_md: 5\n', 'inject_agents_md: ~\n');
      expect(fault(s)).toMatchObject({ path: 'inject_agents_md', file: join(s.globalDir, 'agents.yaml'), scope: 'global' });
    });
    it('a model field stated in the global models.yml names that file, a model name holding a dot included (REQ-CONFIG-004)', () => {
      const s = scopes(null, null, { globalModels: 'models:\n  gpt-4.1: { provider: openai, model_id: m, input_cost_per_token: cheap, output_cost_per_token: 0.1 }\n' });
      expect(fault(s)).toMatchObject({ path: 'models.gpt-4.1.input_cost_per_token', file: join(s.globalDir, 'models.yml'), scope: 'global' });
    });
    it('a role stated under its legacy name in the global file is found under its canonical name (REQ-CONFIG-062)', () => {
      const s = scopes('personas:\n  oracle:\n    purpose: "two\\nlines"\n', 'personas:\n  tester:\n    purpose: one line\n');
      expect(fault(s)).toMatchObject({ path: 'personas.codebase-analyst.purpose', file: join(s.globalDir, 'agents.yaml'), scope: 'global' });
    });
    it('the path walk takes the longest key at each level, steps into list items, and stops where the document stops', () => {
      const doc = { models: { 'gpt-4': { a: 1 }, 'gpt-4.1': { provider: 'x' } }, hooks: [{ event: 'x' }], top: null, runtime: { k: null } };
      expect(statedPrefixLength(doc, 'models.gpt-4.1.provider')).toBe('models.gpt-4.1.provider'.length);
      expect(statedPrefixLength(doc, 'models.gpt-4.1.model_id')).toBe('models.gpt-4.1'.length);
      expect(statedPrefixLength(doc, 'hooks[0].event')).toBe('hooks[0].event'.length);
      expect(statedPrefixLength(doc, 'hooks[3].event')).toBe('hooks'.length);
      expect(statedPrefixLength(doc, 'runtime.k')).toBe('runtime.k'.length);
      expect(statedPrefixLength(doc, 'top')).toBe(-1);
      expect(statedPrefixLength(doc, 'absent.key')).toBe(-1);
      expect(statedPrefixLength(null, 'models')).toBe(-1);
    });
  });
  it('referential messages come in REQ-CONFIG-231/232\'s order and never throw', () => {
    const models = { m: readModelEntry('m', { provider: 'p', model_id: 'm' }, sink())! };
    const persona = (over: Record<string, unknown>) => ({ name: 'r', model: 'm', purpose: null, system_prompt: null, system_prompt_file: null, model_family_variants: null, tools: [], delegates_to: [], custom_tools: [], mcp_servers: [], mcp_tools: null, tool_restrictions: null, coordinator_only: false, read_only: false, can_publish_artifacts: false, skip_auto_sibling_context: false, stall_timeout: null, permission_mode: null, fallback_model: null, summary_model: null, thinking: null, ...over });
    const messages = referentialMessages({
      defaultPersona: 'ghost', slots: { small_model: 'm', medium_model: null, large_model: 'zz', default_summary_model: 'm', improvement_collector_model: null, retrospective_model: null, gatekeeper_model: null, fallback_model: 'm' }, models,
      personas: { a: persona({ model: 'nope', summary_model: 'nope2', delegates_to: ['b', 'ghost'], mcp_servers: ['srv'], mcp_tools: { other: ['t'] }, tools: ['read_file', 'read_file', 'internal_only'], custom_tools: ['read_file'] }), b: persona({ delegates_to: ['a'] }) },
      compressorModel: 'small_model',
    });
    expect(messages).toEqual([
      "persona a: model 'nope' names no configured model",
      "persona a: summary_model 'nope2' names no configured model",
      "persona a: delegates_to 'ghost' names no configured role",
      "Persona 'a' references unknown MCP server 'srv'",
      "Persona 'a' grants MCP tools for server 'other', which it does not carry in mcp_servers; the grant confers nothing (REQ-MCP-104)",
      'persona a: tools named more than once across tools and custom_tools: read_file',
      expect.stringContaining("persona a: tool 'internal_only' is neither an accepted public tool name"),
      "default_persona 'ghost' names no existing role",
      'medium_model is unset; authenticate a model provider in Settings → Models before a model can be chosen',
      "large_model 'zz' names no configured model",
      "compressor.model 'small_model' names no configured model (a tier alias that registered no substitution)".replace(' (a tier alias that registered no substitution)', ''),
      'delegation cycle: a → b → a',
    ]);
  });
});

describe('the rest of the load', () => {
  it('REQ-CONFIG-013: the scope directory is kept out of version control, idempotently, never failing the load', () => {
    const s = scopes(null, null);
    writeFileSync(join(s.workspaceRoot, '.gitignore'), 'node_modules');
    loadConfiguration(s);
    expect(readFileSync(join(s.workspaceRoot, '.gitignore'), 'utf8')).toBe('node_modules\n.rotaris/\n');
    loadConfiguration(s);
    expect(readFileSync(join(s.workspaceRoot, '.gitignore'), 'utf8')).toBe('node_modules\n.rotaris/\n');
    const fresh = scopes(null, null);
    expect(loadConfiguration({ ...fresh, keepIgnored: false }).ok).toBe(true);
  });

  describe("OQ-161's reading, confirmed 2026-10-06 by R-071: the code-intelligence marker's directory is kept out of version control without touching a tracked file", () => {
    const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8' });
    const marker = CODE_INTELLIGENCE_MARKER_SEGMENTS[0]!;

    it('a fresh repository gets `.rotaris/` in .gitignore and the marker in .git/info/exclude, once each', () => {
      const s = scopes(null, null);
      git(s.workspaceRoot, 'init', '-q');
      loadConfiguration(s);
      loadConfiguration(s);
      expect(readFileSync(join(s.workspaceRoot, '.gitignore'), 'utf8')).toBe('.rotaris/\n');
      const exclude = readFileSync(join(s.workspaceRoot, '.git', 'info', 'exclude'), 'utf8');
      expect(exclude.split('\n').filter((line) => line === `${marker}/`)).toHaveLength(1);
      expect(exclude.endsWith(`\n${marker}/\n`)).toBe(true);
    });

    it("a repository whose committed .gitignore already names `.rotaris/` stays clean once the runtime's marker exists", () => {
      const s = scopes(null, null);
      git(s.workspaceRoot, 'init', '-q');
      writeFileSync(join(s.workspaceRoot, '.gitignore'), 'node_modules/\n.rotaris/\n');
      writeFileSync(join(s.workspaceRoot, 'README.md'), '# fixture\n');
      git(s.workspaceRoot, 'add', '.gitignore', 'README.md');
      git(s.workspaceRoot, 'commit', '-q', '-m', 'fixture');
      loadConfiguration(s);
      mkdirSync(join(s.workspaceRoot, ...CODE_INTELLIGENCE_MARKER_SEGMENTS.slice(0, -1)), { recursive: true });
      writeFileSync(join(s.workspaceRoot, ...CODE_INTELLIGENCE_MARKER_SEGMENTS), 'project_name: fixture\n');
      expect(git(s.workspaceRoot, 'status', '--porcelain', '--untracked-files=all')).toBe('');
      expect(readFileSync(join(s.workspaceRoot, '.gitignore'), 'utf8')).toBe('node_modules/\n.rotaris/\n');
    });

    it("a linked worktree writes the repository's shared exclude file, and stays clean once the runtime's marker exists", () => {
      const s = scopes(null, null);
      git(s.workspaceRoot, 'init', '-q');
      writeFileSync(join(s.workspaceRoot, '.gitignore'), '.rotaris/\n');
      git(s.workspaceRoot, 'add', '.gitignore');
      git(s.workspaceRoot, 'commit', '-q', '-m', 'fixture');
      const linked = join(tmp(), 'linked');
      git(s.workspaceRoot, 'worktree', 'add', '-q', linked);
      mkdirSync(join(linked, '.rotaris'), { recursive: true });
      loadConfiguration({ ...s, workspaceRoot: linked });
      expect(readFileSync(join(s.workspaceRoot, '.git', 'info', 'exclude'), 'utf8')).toContain(`\n${marker}/\n`);
      mkdirSync(join(linked, marker), { recursive: true });
      writeFileSync(join(linked, ...CODE_INTELLIGENCE_MARKER_SEGMENTS), 'project_name: linked\n');
      expect(git(linked, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    });

    it('a workspace below a repository\'s top level writes nothing into that repository', () => {
      const outer = scopes(null, null);
      git(outer.workspaceRoot, 'init', '-q');
      const before = readFileSync(join(outer.workspaceRoot, '.git', 'info', 'exclude'), 'utf8');
      const below = join(outer.workspaceRoot, 'packages', 'app');
      mkdirSync(join(below, '.rotaris'), { recursive: true });
      loadConfiguration({ ...outer, workspaceRoot: below });
      expect(readFileSync(join(outer.workspaceRoot, '.git', 'info', 'exclude'), 'utf8')).toBe(before);
      expect(readFileSync(join(below, '.gitignore'), 'utf8')).toBe('.rotaris/\n');
    });

    it('a workspace in no repository gets no exclude file, and a marker line .gitignore already holds is not repeated', () => {
      const s = scopes(null, null);
      loadConfiguration(s);
      expect(existsSync(join(s.workspaceRoot, '.git'))).toBe(false);
      const old = scopes(null, null);
      git(old.workspaceRoot, 'init', '-q');
      writeFileSync(join(old.workspaceRoot, '.gitignore'), `.rotaris/\n${marker}/\n`);
      loadConfiguration(old);
      expect(readFileSync(join(old.workspaceRoot, '.gitignore'), 'utf8')).toBe(`.rotaris/\n${marker}/\n`);
      expect(readFileSync(join(old.workspaceRoot, '.git', 'info', 'exclude'), 'utf8')).not.toContain(`\n${marker}/\n`);
    });

    it("a stale `gitdir:` pointer (the repository moved or deleted) creates nothing and writes nothing", () => {
      const s = scopes(null, null);
      const gone = join(tmp(), 'gone', 'repo', '.git', 'worktrees', 'ws');
      writeFileSync(join(s.workspaceRoot, '.git'), `gitdir: ${gone}\n`);
      loadConfiguration(s);
      expect(existsSync(dirname(dirname(dirname(dirname(gone)))))).toBe(false);
      expect(repositoryExcludeFile(s.workspaceRoot)).toBeNull();
      expect(readFileSync(join(s.workspaceRoot, '.gitignore'), 'utf8')).toBe('.rotaris/\n');
    });

    it('a `gitdir:` pointer to a directory that is not a git directory writes nothing into it', () => {
      const parent = tmp();
      const workspaceRoot = join(parent, 'ws');
      const notARepo = join(parent, 'not-a-repo');
      mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
      mkdirSync(notARepo);
      writeFileSync(join(notARepo, 'notes.txt'), 'not a repository\n');
      writeFileSync(join(workspaceRoot, '.git'), 'gitdir: ../not-a-repo\n');
      loadConfiguration({ ...scopes(null, null), workspaceRoot });
      expect(readdirSync(notARepo)).toEqual(['notes.txt']);
      expect(repositoryExcludeFile(workspaceRoot)).toBeNull();
    });

    it("a git directory whose `commondir` names a directory that is not one writes nothing there", () => {
      const s = scopes(null, null);
      git(s.workspaceRoot, 'init', '-q');
      const elsewhere = tmp();
      writeFileSync(join(s.workspaceRoot, '.git', 'commondir'), `${elsewhere}\n`);
      loadConfiguration(s);
      expect(readdirSync(elsewhere)).toEqual([]);
      expect(repositoryExcludeFile(s.workspaceRoot)).toBeNull();
    });

    it('a repository without an `info` directory gains only that directory and its exclude file', () => {
      const s = scopes(null, null);
      git(s.workspaceRoot, 'init', '-q', '--template=');
      expect(existsSync(join(s.workspaceRoot, '.git', 'info'))).toBe(false);
      loadConfiguration(s);
      expect(readFileSync(join(s.workspaceRoot, '.git', 'info', 'exclude'), 'utf8')).toBe(`${marker}/\n`);
      expect(readdirSync(join(s.workspaceRoot, '.git', 'info'))).toEqual(['exclude']);
    });
  });
  it('rotaris.delegation_strategy is a separate workspace-only lookup with no validation', () => {
    expect(loaded('rotaris:\n  delegation_strategy: single\n', null).delegationStrategy).toBe('orchestrator');
    expect(loaded(null, 'rotaris:\n  delegation_strategy: single\n').delegationStrategy).toBe('single');
    expect(loaded(null, 'rotaris:\n  delegation_strategy: chaos\n').delegationStrategy).toBe('orchestrator');
    const p = parseConfig('rotaris: 5\n');
    expect(readDelegationStrategy(p.ok ? p.value : null)).toBe('orchestrator');
  });
  it('hooks are a section of the one load with their own fatal faults, and the raw documents are exposed per scope', () => {
    const c = loaded('hooks:\n  - event: session_end\n    command: notify\n', 'runtime:\n  max_depth: 2\n');
    expect(c.hooks.entries.map((e) => e.id)).toEqual(['global:0:session_end']);
    expect(c.raw.workspace.agents).toEqual({ runtime: { max_depth: 2 } });
    expect(c.raw.global.models).toBeNull();
    const bad = loadConfiguration(scopes(null, 'hooks:\n  - event: nope\n    command: x\n'));
    expect(!bad.ok && bad.error.path).toBe('hooks.entries.0.event');
  });
});

describe('REQ-CONFIG-034 / REQ-PROVIDER-091 / REQ-CONFIG-204: the discovery snapshot as layer 3', () => {
  const NOW = '2026-09-05T10:00:00.000Z';
  const snapshot = (extra = '') => `version: 1
providers:
  openai-compatible--openrouter:
    id: openai-compatible--openrouter
    display_name: OpenRouter
    family: openai-compatible
    base_url: https://openrouter.ai/api/v1
    authenticated: true
    large_model: openai-compatible--openrouter/openai/gpt-4o
    medium_model: openai-compatible--openrouter/openai/gpt-4o-mini
    small_model: openai-compatible--openrouter/anthropic/claude-haiku-4.5
    default_summary_model: openai-compatible--openrouter/openai/gpt-4o-mini
    fallback_model: openai-compatible--openrouter/anthropic/claude-haiku-4.5
    discovered_at: ${NOW}
    models:
      - id: openai-compatible--openrouter/anthropic/claude-haiku-4.5
        display_name: Claude Haiku 4.5
        capabilities: { accepts_image_input: true }
        limits: { context_window: 200000, max_output_tokens: 32000 }
        pricing: {}
        discovered_at: ${NOW}
      - id: openai-compatible--openrouter/openai/gpt-4o
        capabilities: {}
        limits: {}
        pricing: { input_cost_per_token: 0.0000025, output_cost_per_token: 0.00001 }
        discovered_at: ${NOW}
      - id: openai-compatible--openrouter/openai/gpt-4o-mini
        capabilities: {}
        limits: {}
        pricing: {}
        discovered_at: ${NOW}
  deepseek:
    id: deepseek
    display_name: DeepSeek
    base_url: https://api.deepseek.com/v1
    authenticated: false
    small_model: deepseek/deepseek-chat
    discovered_at: ${NOW}
    models:
      - id: deepseek/deepseek-chat
        capabilities: {}
        limits: {}
        pricing: {}
        discovered_at: ${NOW}
${extra}`;

  it('folds an authenticated provider\'s models as entries keyed by qualified id with auth_provider and base_url, and seeds the slots; an unauthenticated provider contributes nothing', () => {
    const s = scopes(null, null);
    writeFileSync(join(s.globalDir, 'project_settings.yaml'), snapshot());
    const r = loadConfiguration(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cfg = r.value;
    expect(cfg.authenticatedProviders).toEqual(['openai-compatible--openrouter']);
    const haiku = cfg.models['openai-compatible--openrouter/anthropic/claude-haiku-4.5']!;
    expect(haiku).toMatchObject({ provider: 'openai-compatible', model_id: 'anthropic/claude-haiku-4.5', auth_provider: 'openai-compatible--openrouter', base_url: 'https://openrouter.ai/api/v1', max_input_tokens: 200000, max_output_tokens: 32000, api_key: null, api_key_env: null });
    // REQ-PROVIDER-072 (amended, OQ-21): the snapshot's prices arrive as the decimals their text states.
    expect(cfg.models['openai-compatible--openrouter/openai/gpt-4o']).toMatchObject({ input_cost_per_token: '0.0000025', output_cost_per_token: '0.00001' });
    expect(cfg.models['deepseek/deepseek-chat']).toBeUndefined();
    expect(cfg.slots.small_model).toBe('openai-compatible--openrouter/anthropic/claude-haiku-4.5');
    expect(cfg.slots.large_model).toBe('openai-compatible--openrouter/openai/gpt-4o');
    // The shipped defaults still sit beneath (layer 1): their two entries remain configured models.
    expect(cfg.models['gpt-4o']).toBeDefined();
    expect(cfg.referential).toEqual([]);
    expect(cfg.resolvedPersonaModelTiers['orchestrator']).toBe('large_model');
  });
  it('the YAML scopes outrank the snapshot (REQ-CONFIG-031): a workspace slot wins; a YAML entry of the same name overrides per field (REQ-CONFIG-043 is how REQ-PROVIDER-091 overrides)', () => {
    const s = scopes(null, 'small_model: gpt-4o-mini\nmodels:\n  openai-compatible--openrouter/openai/gpt-4o:\n    provider: openai\n    model_id: gpt-4o-custom\n');
    writeFileSync(join(s.globalDir, 'project_settings.yaml'), snapshot());
    const r = loadConfiguration(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slots.small_model).toBe('gpt-4o-mini');
    // The named-entry class overlays per field: provider and model_id are the file's, auth_provider stays the snapshot's.
    expect(r.value.models['openai-compatible--openrouter/openai/gpt-4o']).toMatchObject({ provider: 'openai', model_id: 'gpt-4o-custom', auth_provider: 'openai-compatible--openrouter' });
  });
  it('two authenticated providers: the lower id wins each slot it suggests (REQ-CONFIG-204)', () => {
    const s = scopes(null, null);
    writeFileSync(join(s.globalDir, 'project_settings.yaml'), snapshot().replace('authenticated: false\n    small_model: deepseek/deepseek-chat', 'authenticated: true\n    small_model: deepseek/deepseek-chat\n    large_model: deepseek/deepseek-chat'));
    const r = loadConfiguration(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.authenticatedProviders).toEqual(['deepseek', 'openai-compatible--openrouter']);
    expect(r.value.slots.small_model).toBe('deepseek/deepseek-chat');
    expect(r.value.slots.large_model).toBe('deepseek/deepseek-chat');
    expect(r.value.slots.medium_model).toBe('openai-compatible--openrouter/openai/gpt-4o-mini');
    expect(r.value.models['deepseek/deepseek-chat']).toMatchObject({ provider: 'deepseek', model_id: 'deepseek-chat', auth_provider: 'deepseek' });
    // PD-PROVIDER-001: the snapshot's model states no cap; the catalogue's 3 applies where the cap is read (`modelCapInForce`).
    expect(modelCapInForce(r.value.models['deepseek/deepseek-chat'], { deepseek: 3 })).toBe(3);
  });
  it('an invalid snapshot is ignored with a warning; an auth_provider naming no authenticated provider is a referential message with the hint; no snapshot → the hint on every unset slot', () => {
    const s = scopes(null, 'models:\n  mine:\n    provider: openai-compatible\n    model_id: x\n    auth_provider: openai-compatible--gone\n');
    writeFileSync(join(s.globalDir, 'project_settings.yaml'), 'version: 9\n');
    const r = loadConfiguration(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warnings.some((w) => w.startsWith('Ignoring project settings snapshot: Invalid project snapshot at') && w.includes('unsupported project snapshot version'))).toBe(true);
    expect(r.value.authenticatedProviders).toEqual([]);
    expect(r.value.referential).toContain("models.mine: auth_provider 'openai-compatible--gone' names no authenticated provider; authenticate a model provider in Settings → Models before a model can be chosen");
    const none = loadConfiguration({ ...scopes(null, null), snapshotPath: null });
    expect(none.ok && none.value.authenticatedProviders).toEqual([]);
  });
});

describe('REQ-CONFIG-341: the editor names the snapshot layer as `discovered` and reads a written null as unstated', () => {
  it('a starter file of nulls leaves every slot at the discovered value with origin discovered', async () => {
    const { slotPreferences } = await import('./preferences.js');
    const { bootstrapConfigFile } = await import('./writers.js');
    const s = scopes(null, null);
    writeFileSync(join(s.globalDir, 'project_settings.yaml'), `version: 1
providers:
  p:
    id: p
    display_name: P
    authenticated: true
    base_url: https://x.example/v1
    large_model: p/big
    small_model: p/tiny
    discovered_at: 2026-09-05T10:00:00.000Z
    models:
      - { id: p/big, capabilities: {}, limits: {}, pricing: {}, discovered_at: 2026-09-05T10:00:00.000Z }
      - { id: p/tiny, capabilities: {}, limits: {}, pricing: {}, discovered_at: 2026-09-05T10:00:00.000Z }
`);
    const wsFile = join(s.workspaceRoot, '.rotaris', 'agents.yaml');
    expect(bootstrapConfigFile(wsFile)).toEqual({ ok: true, value: 'written' });
    expect(readFileSync(wsFile, 'utf8')).toContain('small_model: null');
    const r = loadConfiguration(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const slots = Object.fromEntries(slotPreferences(r.value).map((p) => [p.slot, p]));
    expect(slots['small_model']).toMatchObject({ value: 'p/tiny', origin: 'discovered' });
    expect(slots['large_model']).toMatchObject({ value: 'p/big', origin: 'discovered' });
    expect(slots['medium_model']).toMatchObject({ origin: 'default' });
    expect(r.value.discoveredSlots).toEqual({ large_model: 'p/big', small_model: 'p/tiny' });
  });
});

describe('REQ-GIT-070/071/072 the checkpoints section (Part P)', () => {
  it('defaults: enabled unset, 50 per session, untracked included; a bare key loads as unset; explicit false at workspace level is preserved', () => {
    expect(loaded(null, null).checkpoints).toEqual({ enabled: null, max_per_session: 50, include_untracked: true });
    expect(loaded(null, 'checkpoints:\n').checkpoints.enabled).toBeNull();
    expect(loaded('checkpoints:\n  enabled: true\n', 'checkpoints:\n  enabled: false\n  max_per_session: 3\n').checkpoints).toEqual({ enabled: false, max_per_session: 3, include_untracked: true });
    expect(checkpointsEnabledFor({ enabled: null }, true)).toBe(true);
    expect(checkpointsEnabledFor({ enabled: null }, false)).toBe(false);
    expect(checkpointsEnabledFor({ enabled: false }, true)).toBe(false);
    expect(checkpointsEnabledFor({ enabled: true }, false)).toBe(true);
  });
  it('REQ-GIT-071: a max_per_session below 1 or not an integer fails the load as a whole, naming the key, the value and the constraint', () => {
    for (const bad of ['0', '-2', '1.5', '"ten"']) {
      const r = loadConfiguration(scopes(null, `checkpoints:\n  max_per_session: ${bad}\n`));
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error.path).toBe('checkpoints.max_per_session');
      expect(renderFatal(r.error)).toMatch(/must be (at least 1|an integer)/);
    }
    expect(loaded(null, 'checkpoints:\n  max_per_session: 1\n').checkpoints.max_per_session).toBe(1);
  });
});

describe('REQ-GIT-073 / REQ-CONFIG-068 / REQ-GIT-138: worktree_storage_subpath', () => {
  // docs/defects/fixed/a-worktree-storage-subpath-inside-the-requirement-checkout-directory-is-not-rejected-at-load.md
  it('defaults to worktrees and loads a stated value unchanged', () => {
    expect(loaded(null, null).worktreeStorageSubpath).toBe('worktrees');
    expect(loaded(null, 'worktree_storage_subpath: trees/sessions\n').worktreeStorageSubpath).toBe('trees/sessions');
    expect(loaded('worktree_storage_subpath: global-trees\n', null).worktreeStorageSubpath).toBe('global-trees');
  });
  it('REQ-GIT-138: a value resolving to the requirement checkout directory or inside it fails the load as a whole, naming key, value and namespace', () => {
    for (const bad of ['requirements/worktrees', 'requirements/worktrees/sessions', './requirements//worktrees/', 'other/../requirements/worktrees']) {
      const r = loadConfiguration(scopes(null, `worktree_storage_subpath: ${JSON.stringify(bad)}\n`));
      expect(r.ok, bad).toBe(false);
      if (r.ok) continue;
      expect(r.error.path).toBe('worktree_storage_subpath');
      const text = renderFatal(r.error);
      expect(text).toContain(JSON.stringify(bad));
      expect(text).toContain('.rotaris/requirements/worktrees');
      expect(text).toContain('REQ-GIT-138');
    }
    // Beside it, above it and the default all pass (a value CONTAINING the directory loads — ruled (OQ-263, confirmed as built)).
    for (const good of ['requirements', '.', 'requirements/worktrees-x', 'requirement/worktrees', 'worktrees']) expect(loaded(null, `worktree_storage_subpath: ${good}\n`).worktreeStorageSubpath).toBe(good);
  });
});

describe('REQ-CONFIG-225: the unresolved-placeholder warning names the file the entry came from', () => {
  // docs/defects/fixed/the-unresolved-placeholder-warning-names-no-configuration-file.md
  const lineFor = (r: ReturnType<typeof loadConfiguration>, server: string): string => {
    if (!r.ok) throw new Error(`load failed: ${r.error.lines.join(' | ')}`);
    const line = r.value.mcp.diagnostics.find((d) => d.key.startsWith(`mcp.url-unresolved.${server}.`));
    if (!line) throw new Error(`no unresolved-placeholder line for ${server}`);
    return line.message;
  };
  it('names the workspace file over the global one when both state the url, and the global one when only it does', () => {
    const s = scopes(
      'mcp_servers:\n  both: { type: http, url: "https://g.example/?k=${NOPE_G}" }\n  global_only: { type: http, url: "https://g.example/?k=${NOPE_O}" }\n',
      'mcp_servers:\n  both: { type: http, url: "https://w.example/?k=${NOPE_W}" }\n  global_only: { enabled: true }\n',
    );
    const r = loadConfiguration({ ...s, env: {}, home: tmp() });
    expect(lineFor(r, 'both')).toContain(`set in ${join(s.workspaceRoot, '.rotaris', 'agents.yaml')}`);
    // The workspace entry states no url, so the global file is the one to correct.
    expect(lineFor(r, 'global_only')).toContain(`set in ${join(s.globalDir, 'agents.yaml')}`);
  });
  it('names a discovered file, and the built-in defaults for the shipped web_search a workspace only switches on', () => {
    const s = scopes(null, 'mcp_servers:\n  web_search: { enabled: true }\n');
    writeFileSync(join(s.workspaceRoot, '.mcp.json'), JSON.stringify({ mcpServers: { found: { type: 'http', url: 'https://d.example/?k=${NOPE_D}' } } }));
    const r = loadConfiguration({ ...s, env: {}, home: tmp() });
    expect(lineFor(r, 'found')).toContain(`set in ${join(s.workspaceRoot, '.mcp.json')}`);
    expect(lineFor(r, 'web_search')).toContain('from the built-in defaults');
  });
});
