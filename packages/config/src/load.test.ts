import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicaliseRoles, mergeLayers, overlaySection, PLAIN_OPS } from './merge.js';
import { loadConfiguration, readDelegationStrategy, type LoadedConfiguration } from './load.js';
import { parseConfig } from './document.js';
import { referentialMessages, renderFatal, renderProblems } from './validate.js';
import { resolveSlotsAndReasoning, registeredAliases, resolveSlotBase } from './slots.js';
import { readRuntimeSection, validateRuntimeField, RUNTIME_DEFAULTS } from './sections/runtime.js';
import { readModelEntry, providerEffort } from './sections/models.js';
import { readCircuitBreakerSection, CIRCUIT_BREAKER_DEFAULTS } from './circuit-breaker-section.js';
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
});

describe('REQ-CONFIG-063..081 tier aliases and reasoning synthesis', () => {
  it('registers an alias only for a concrete slot value; a literal alias survives to referential validation (REQ-CONFIG-074)', () => {
    expect(registeredAliases({ small_model: 'medium_model', medium_model: 'm', large_model: 'large_model', default_summary_model: null, improvement_collector_model: null, gatekeeper_model: null, fallback_model: null })).toEqual({ medium_model: 'm' });
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
  it('the transform is pure over a draft', () => {
    const draft = { slots: { small_model: 'a', medium_model: 'a', large_model: 'a', default_summary_model: 'small_model', improvement_collector_model: null, gatekeeper_model: null, fallback_model: null }, slotThinking: { small_model: null, medium_model: null, large_model: null, default_summary_model: null, improvement_collector_model: null, gatekeeper_model: null, fallback_model: null }, models: { a: readModelEntry('a', { provider: 'p', model_id: 'a' }, sink())! }, personas: {}, compressorModel: 'small_model', circuitBreakerModel: 'x' };
    const r = resolveSlotsAndReasoning(draft);
    expect(r.warnings).toEqual([]);
    expect(draft.slots.fallback_model).toBe('a');
    expect(draft.compressorModel).toBe('a');
    expect(draft.circuitBreakerModel).toBe('x');
  });
});

describe('REQ-CONFIG-082..110 model and persona entries', () => {
  it('reads the fields, the legacy thinking booleans, the provider-conditional max_parallel and the explicit null (REQ-CONFIG-057/090/095)', () => {
    const s = sink();
    const deepseek = readModelEntry('d', { provider: 'deepseek', model_id: 'x', thinking: true }, s)!;
    expect(deepseek).toMatchObject({ max_parallel: 3, thinking: 'high' });
    const capped = readModelEntry('e', { provider: 'deepseek', model_id: 'x', max_parallel: null, thinking: false }, s)!;
    expect(capped).toMatchObject({ max_parallel: null, thinking: null });
    const copilot = readModelEntry('c', { provider: 'openai', model_id: 'x', auth_provider: 'copilot', mystery: 1 }, s)!;
    expect(copilot.disable_responses_api).toBe(true);
    expect(s.errors).toEqual([]);
    expect(s.warnings.map((w) => w.path)).toEqual(['models.c.mystery']);
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
  it('referential messages come in REQ-CONFIG-231/232\'s order and never throw', () => {
    const models = { m: readModelEntry('m', { provider: 'p', model_id: 'm' }, sink())! };
    const persona = (over: Record<string, unknown>) => ({ name: 'r', model: 'm', purpose: null, system_prompt: null, system_prompt_file: null, model_family_variants: null, tools: [], delegates_to: [], custom_tools: [], mcp_servers: [], mcp_tools: null, tool_restrictions: null, coordinator_only: false, read_only: false, can_publish_artifacts: false, skip_auto_sibling_context: false, stall_timeout: null, permission_mode: null, fallback_model: null, summary_model: null, thinking: null, ...over });
    const messages = referentialMessages({
      defaultPersona: 'ghost', slots: { small_model: 'm', medium_model: null, large_model: 'zz', default_summary_model: 'm', improvement_collector_model: null, gatekeeper_model: null, fallback_model: 'm' }, models,
      personas: { a: persona({ model: 'nope', summary_model: 'nope2', delegates_to: ['b', 'ghost'], mcp_servers: ['srv'], mcp_tools: { other: ['t'] }, tools: ['read_file', 'read_file', 'internal_only'], custom_tools: ['read_file'] }), b: persona({ delegates_to: ['a'] }) },
      compressorModel: 'small_model',
    });
    expect(messages).toEqual([
      "persona a: model 'nope' names no configured model",
      "persona a: summary_model 'nope2' names no configured model",
      "persona a: delegates_to 'ghost' names no configured role",
      "persona a: mcp_servers 'srv' names no configured tool server",
      "persona a: mcp_tools names 'other', which the role does not list in mcp_servers; the grant confers nothing",
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
    expect(cfg.models['openai-compatible--openrouter/openai/gpt-4o']).toMatchObject({ input_cost_per_token: 0.0000025, output_cost_per_token: 0.00001 });
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
    expect(r.value.models['deepseek/deepseek-chat']).toMatchObject({ provider: 'deepseek', model_id: 'deepseek-chat', auth_provider: 'deepseek', max_parallel: 3 });
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
