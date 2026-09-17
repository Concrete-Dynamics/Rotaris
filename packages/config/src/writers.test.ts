import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapConfigFile, saveDesktop, starterDocument, writeConfigFields, writeModelPreferences, writeVerifierSection } from './writers.js';
import { loadConfiguration } from './load.js';
import { overlayLiveState } from './tiers.js';
import { rolePreferences, slotPreferences, followRawSlot } from './preferences.js';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'rotaris-writers-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function scope(): { globalDir: string; workspaceRoot: string; wsFile: string; gFile: string } {
  const globalDir = join(tmp(), 'config');
  const workspaceRoot = join(tmp(), 'ws');
  mkdirSync(globalDir, { recursive: true });
  mkdirSync(join(workspaceRoot, '.rotaris'), { recursive: true });
  return { globalDir, workspaceRoot, wsFile: join(workspaceRoot, '.rotaris', 'agents.yaml'), gFile: join(globalDir, 'agents.yaml') };
}

/** REQ-CONFIG-252's guard fixture: a comment header, an unknown key with its own comment, blank lines, nested indentation. */
const FIXTURE = [
  '# my workspace configuration',
  '# keep this header',
  '',
  'default_persona: orchestrator # trailing comment on a key',
  'small_model: gpt-4o-mini',
  '',
  '# a key this build does not know, with the comment explaining it',
  'future_feature:',
  '  nested: true',
  '',
  'runtime:',
  '  # the depth cap',
  '  max_depth: 4',
  '  max_iterations: 7',
  'personas:',
  '  tester:',
  '    model: gpt-4o',
  '',
].join('\n');

describe('REQ-CONFIG-252 every writer preserves comments, blank lines, indentation and an unknown key', () => {
  it("re-emission is not byte-identical: an inline comment's spacing collapses to one space (found on first execution, recorded on ADR-0036)", async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'default_persona: orchestrator   # three spaces\n');
    const r = await writeConfigFields(s.wsFile, { runtime: { max_depth: 2 } });
    expect(r.ok && r.value.text).toBe('default_persona: orchestrator # three spaces\nruntime:\n  max_depth: 2\n');
  });
  it('the scoped per-field writer overlays only the keys it names', async () => {
    const s = scope();
    writeFileSync(s.wsFile, FIXTURE);
    const r = await writeConfigFields(s.wsFile, { runtime: { permission_mode: 'autonomous' } });
    expect(r.ok).toBe(true);
    const text = readFileSync(s.wsFile, 'utf8');
    expect(text).toContain('# my workspace configuration\n# keep this header\n\ndefault_persona: orchestrator # trailing comment on a key');
    expect(text).toContain('# a key this build does not know, with the comment explaining it\nfuture_feature:\n  nested: true\n');
    expect(text).toContain('runtime:\n  # the depth cap\n  max_depth: 4\n  max_iterations: 7\n  permission_mode: autonomous\n');
    expect(text).toContain('personas:\n  tester:\n    model: gpt-4o\n');
  });
  it('the desktop save writes its enumerated keys and nothing else', async () => {
    const s = scope();
    writeFileSync(s.wsFile, FIXTURE);
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { slots: { large_model: 'gpt-4o', medium_model: '' }, slotThinking: { large_model: 'high' }, runtime: { max_depth: 2 }, circuitBreakerEnabled: false, delegationStrategy: 'single', roles: { tester: { scope: 'workspace', thinking: 'low' } } });
    expect(r.ok).toBe(true);
    const text = readFileSync(s.wsFile, 'utf8');
    expect(text).toContain('# keep this header\n\ndefault_persona: orchestrator # trailing comment on a key\nsmall_model: gpt-4o-mini\n');
    expect(text).toContain('future_feature:\n  nested: true\n');
    expect(text).toContain('runtime:\n  # the depth cap\n  max_depth: 2\n  max_iterations: 7\n');
    expect(text).toContain('personas:\n  tester:\n    model: gpt-4o\n    thinking: low\n');
    expect(text).toContain('large_model: gpt-4o\nlarge_model_thinking: high\n');
    expect(text).not.toContain('medium_model');
    expect(text).toContain('circuit_breaker:\n  enabled: false\n');
    expect(text).toContain('rotaris:\n  delegation_strategy: single\n');
  });
  it('the model-preference writer touches slots, companions and the role mapping only', async () => {
    const s = scope();
    writeFileSync(s.wsFile, FIXTURE);
    const r = await writeModelPreferences(s.wsFile, { slots: { small_model: null, large_model: 'gpt-4o' }, thinking: { small_model: 'low' }, roles: { tester: { model: 'large_model' } } });
    expect(r.ok).toBe(true);
    const text = readFileSync(s.wsFile, 'utf8');
    expect(text).toContain('# keep this header');
    expect(text).toContain('small_model: null\n');
    expect(text).toContain('small_model_thinking: low\n');
    expect(text).toContain('future_feature:\n  nested: true\n');
    expect(text).toContain('runtime:\n  # the depth cap\n  max_depth: 4\n');
    expect(text).toContain('personas:\n  tester:\n    model: large_model\n');
  });
  it('the bootstrap never clobbers a file that has content', () => {
    const s = scope();
    writeFileSync(s.wsFile, FIXTURE);
    expect(bootstrapConfigFile(s.wsFile)).toEqual({ ok: true, value: 'exists' });
    expect(readFileSync(s.wsFile, 'utf8')).toBe(FIXTURE);
  });
});

describe('REQ-CONFIG-025..030 the bootstrap', () => {
  it('writes the starter for an absent or blank file, creates parents, declines a directory and non-UTF-8 bytes', () => {
    const s = scope();
    const deep = join(s.workspaceRoot, 'nested', 'deeper', 'agents.yaml');
    expect(bootstrapConfigFile(deep)).toEqual({ ok: true, value: 'written' });
    expect(readFileSync(deep, 'utf8')).toBe(starterDocument());
    writeFileSync(s.wsFile, '  \n\n');
    expect(bootstrapConfigFile(s.wsFile)).toEqual({ ok: true, value: 'written' });
    expect(bootstrapConfigFile(join(s.workspaceRoot, '.rotaris'))).toEqual({ ok: true, value: 'declined-directory' });
    writeFileSync(s.gFile, Buffer.from([0xff, 0xfe, 0x41]));
    expect(bootstrapConfigFile(s.gFile)).toEqual({ ok: true, value: 'declined-not-utf8' });
    // The fourteen explicit nulls do not clear the built-in slots (REQ-CONFIG-052); PD-LIBRARY-002 added two.
    const c = loadConfiguration({ globalDir: join(tmp(), 'none'), workspaceRoot: s.workspaceRoot, keepIgnored: false });
    expect(c.ok && c.value.slots.large_model).toBe('gpt-4o');
    expect(starterDocument()).toMatch(/^# Rotaris configuration/);
    expect((starterDocument().match(/: null$/gm) ?? []).length).toBe(14);
  });
});

describe('REQ-CONFIG-441..444 the scoped per-field write path', () => {
  it('refuses an unparseable file and a non-mapping file, leaving the bytes as they were, naming file and fault', async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'runtime: [\n');
    const r = await writeConfigFields(s.wsFile, { runtime: { max_depth: 1 } });
    expect(!r.ok && r.error).toMatchObject({ code: 'unreadable', file: s.wsFile });
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime: [\n');
    writeFileSync(s.gFile, '- a\n');
    const g = await writeConfigFields(s.gFile, { runtime: { max_depth: 1 } });
    expect(!g.ok && g.error.code).toBe('not-a-mapping');
    expect(readFileSync(s.gFile, 'utf8')).toBe('- a\n');
  });
  it('starts from an empty document when the file is absent and validates a runtime value on assignment (REQ-CONFIG-111)', async () => {
    const s = scope();
    const bad = await writeConfigFields(s.wsFile, { runtime: { max_depth: 0 } });
    expect(!bad.ok && bad.error).toMatchObject({ code: 'invalid', fault: 'runtime.max_depth: must be at least 1, got 0' });
    const coerced = await writeConfigFields(s.wsFile, { runtime: { permission_mode: 'sudo' } });
    expect(!coerced.ok && coerced.error.code).toBe('invalid');
    const r = await writeConfigFields(s.wsFile, { runtime: { memory_diagnostics_enabled: true } });
    expect(r.ok && r.value.text).toBe('runtime:\n  memory_diagnostics_enabled: true\n');
  });
});

describe('REQ-LIBRARY verifier gate writer', () => {
  it('writes the shared verifier shape while preserving unrelated content and reports an exact replay unchanged', async () => {
    const s = scope();
    writeFileSync(s.wsFile, '# keep\nruntime:\n  max_depth: 4\nverifier:\n  gate_completion: false\n');
    const section = { gate_completion: true, checks: [{ name: 'suite', command: 'pnpm test', role: 'test' as const }] };
    const first = await writeVerifierSection(s.wsFile, section);
    expect(first.ok && first.value.changed).toBe(true);
    const text = readFileSync(s.wsFile, 'utf8');
    expect(text).toContain('# keep\nruntime:\n  max_depth: 4\n');
    expect(text).toContain('verifier:\n  gate_completion: true\n  checks:\n    - name: suite\n      command: pnpm test\n      timeout: 600\n      severity: blocking\n      role: test\n');
    const second = await writeVerifierSection(s.wsFile, section);
    expect(second.ok && second.value.changed).toBe(false);
  });

  it('rejects an unsafe verifier section before touching the file', async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'runtime:\n  max_depth: 4\n');
    const result = await writeVerifierSection(s.wsFile, { checks: [{ name: 'suite', command: 'pnpm test', cwd: '..' }] });
    expect(!result.ok && result.error.code).toBe('invalid');
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime:\n  max_depth: 4\n');
  });
});

describe('REQ-CONFIG-256..260 the desktop save', () => {
  it('refuses a non-mapping workspace file, and identifies the global file when a global role edit meets one', async () => {
    const s = scope();
    writeFileSync(s.wsFile, '- x\n');
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { runtime: { max_depth: 3 } });
    expect(!r.ok && r.error.fault).toContain('workspace agents.yaml');
    writeFileSync(s.wsFile, '');
    writeFileSync(s.gFile, '- x\n');
    const g = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { roles: { tester: { scope: 'global', model: 'gpt-4o' } } });
    expect(!g.ok && g.error.fault).toContain('global agents.yaml');
    expect(readFileSync(s.wsFile, 'utf8')).toBe('');
  });
  it('validates before any file is touched: the six security values report the first complaint as one sentence', async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'runtime:\n  max_depth: 4\n');
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { runtime: { sandbox_mode: 'on', max_depth: 1 } });
    expect(!r.ok && r.error).toMatchObject({ code: 'invalid' });
    if (!r.ok) expect(r.error.fault).toMatch(/^'on' is not an accepted value; expected one of: off, workspace-write, read-only$/);
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime:\n  max_depth: 4\n');
  });
  it('replaces a non-mapping section with a fresh mapping, writes global role edits to the global file, removes an emptied personas key', async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'runtime: 5\npersonas:\n  oracle:\n    model: a\n');
    writeFileSync(s.gFile, 'personas:\n  tester:\n    model: gpt-4o\n    thinking: low\n');
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { runtime: { max_depth: 2 }, roles: { 'codebase-analyst': { scope: 'workspace', model: 'gpt-4o-mini' }, tester: { scope: 'global', unsetModel: true, unsetThinking: true } } });
    expect(r.ok).toBe(true);
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime:\n  max_depth: 2\npersonas:\n  codebase-analyst:\n    model: gpt-4o-mini\n');
    expect(readFileSync(s.gFile, 'utf8')).toBe('{}\n');
  });
  // Found live 2026-09-16: the model selector's baseline option reaches the writer as model: null,
  // which was written literally — an entry the persona reader rejects (REQ-CONFIG-098) and a fatal
  // load on the next read. A null role model is the unset spelling at the edited scope.
  it('a role model edit carrying null removes the key instead of writing model: null (REQ-CONFIG-041, REQ-CONFIG-098)', async () => {
    const s = scope();
    writeFileSync(s.gFile, 'personas:\n  orchestrator:\n    thinking: default\n    model: gpt-4o\n');
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { roles: { orchestrator: { scope: 'global', model: null } } });
    expect(r.ok).toBe(true);
    expect(readFileSync(s.gFile, 'utf8')).toBe('personas:\n  orchestrator:\n    thinking: default\n');
  });
});

describe('REQ-CONFIG-248..255 the model-preference path and its read-back', () => {
  it('bootstraps a missing file first, writes null as null, removes a null companion, rejects an unknown slot', async () => {
    const s = scope();
    const bad = await writeModelPreferences(s.gFile, { slots: { huge_model: 'x' } });
    expect(!bad.ok && bad.error.fault).toContain("unknown model slot 'huge_model'");
    const r = await writeModelPreferences(s.gFile, { slots: { medium_model: null, large_model: 'gpt-4o' }, thinking: { large_model: 'high', medium_model: null } });
    expect(r.ok).toBe(true);
    const text = readFileSync(s.gFile, 'utf8');
    expect(text).toMatch(/^# Rotaris configuration/);
    expect(text).toContain('medium_model: null\n');
    expect(text).not.toContain('medium_model_thinking');
    expect(text).toContain('large_model: gpt-4o\nlarge_model_thinking: high\n');
  });
  it('the read-back follows raw slot names with cycle detection and unwraps a synthetic (REQ-CONFIG-253/254/255)', () => {
    const s = scope();
    writeFileSync(s.gFile, 'large_model: medium_model\nmedium_model: gpt-4o\nsmall_model: fallback_model\nfallback_model: small_model\nsmall_model_thinking: auto\npersonas:\n  tester:\n    model: large_model\n    thinking: high\n');
    const c = loadConfiguration({ globalDir: s.globalDir, workspaceRoot: s.workspaceRoot, keepIgnored: false });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(followRawSlot(c.value.raw.global.agents, 'large_model')).toBe('gpt-4o');
    expect(followRawSlot(c.value.raw.global.agents, 'small_model')).toBeNull();
    const slots = Object.fromEntries(slotPreferences(c.value).map((p) => [p.slot, p]));
    expect(slots['large_model']).toMatchObject({ value: 'gpt-4o', origin: 'global' });
    expect(slots['small_model']).toMatchObject({ value: null, origin: 'global', thinking: 'auto' });
    expect(slots['default_summary_model']).toMatchObject({ origin: 'built-in' });
    const tester = rolePreferences(c.value).find((r) => r.role === 'tester')!;
    // `large_model: medium_model` registers no alias (REQ-CONFIG-074): the editor follows the raw chain to gpt-4o, while the
    // resolved role keeps the literal and referential validation names it.
    expect(tester).toMatchObject({ rawModel: 'large_model', modelOrigin: 'global', effectiveModel: 'large_model', inherited: false, builtInDefault: 'medium_model', rawThinking: 'high', tier: 'large_model' });
    expect(c.value.referential).toContain("large_model 'medium_model' names no configured model (a tier alias that registered no substitution)");
    const planner = rolePreferences(c.value).find((r) => r.role === 'planner')!;
    expect(planner).toMatchObject({ rawModel: null, modelOrigin: 'built-in', inherited: true, effectiveModel: 'large_model', builtInDefault: 'large_model' });
  });
});

describe('ADR-0037 Tier B — the live state over the merged document, resolved by the loader\'s own passes', () => {
  it('overlays slots (repointing roles that followed the previous value), the entry role, the session override, the runtime keys and the breaker', () => {
    const s = scope();
    writeFileSync(s.wsFile, 'models:\n  fast: { provider: openai, model_id: fast }\n  slow: { provider: openai, model_id: slow }\nlarge_model: slow\npersonas:\n  tester:\n    model: slow\n  planner:\n    model: large_model\nruntime:\n  max_depth: 4\n');
    const loaded = loadConfiguration({ globalDir: s.globalDir, workspaceRoot: s.workspaceRoot, keepIgnored: false });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const live = overlayLiveState(loaded.value, { slots: { large_model: 'fast', small_model: '' }, slotThinking: { large_model: 'high' }, entryRole: 'planner', sessionModel: 'slow', sessionThinking: 'low', runtime: { max_depth: 1, permission_mode: 'autonomous', keep_going: true }, circuitBreakerEnabled: false, delegationStrategy: 'single' });
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    const v = live.value;
    expect(v.slots.large_model).toBe('__startup_slot__:large_model');
    expect(v.models['__startup_slot__:large_model']).toMatchObject({ model_id: 'fast', thinking: 'high' });
    expect(v.personas['tester']?.model).toBe('fast');
    expect(v.defaultPersona).toBe('planner');
    expect(v.personas['planner']?.model).toBe('__persona__:planner');
    expect(v.models['__persona__:planner']).toMatchObject({ model_id: 'slow', thinking: 'low' });
    expect(v.runtime).toMatchObject({ max_depth: 1, permission_mode: 'autonomous', keep_going: true });
    expect(v.circuitBreaker.enabled).toBe(false);
    expect(v.delegationStrategy).toBe('single');
    // The loaded configuration is untouched: a pure function.
    expect(loaded.value.runtime.max_depth).toBe(4);
    expect(loaded.value.personas['tester']?.model).toBe('slow');
  });
});

describe('REQ-CONFIG-175/472 — the display round trip is a contract', () => {
  it('writes the requirement’s key names, stores unlimited as 0, and reads all four back', async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'display:\n  # a key this screen does not offer\n  show_thinking: true\n');
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { display: { show_tool_results: false, show_tool_inputs: true, tool_result_max_lines: 20, tool_input_max_lines: 0 } });
    expect(r.ok).toBe(true);
    const text = readFileSync(s.wsFile, 'utf8');
    expect(text).toContain('tool_result_max_lines: 20');
    // REQ-CONFIG-172: unlimited is 0 in the file, and the key this screen does not offer stays as the file states it.
    expect(text).toContain('tool_input_max_lines: 0');
    expect(text).toContain('show_thinking: true');
    const loaded = loadConfiguration({ globalDir: s.globalDir, workspaceRoot: s.workspaceRoot });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.display).toEqual({ show_tool_results: false, show_tool_inputs: true, tool_result_lines: 20, tool_input_lines: null });
  });
});
