import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrapConfigFile, saveDesktop, starterDocument, writeConfigFields, writeModelPreferences, writeVerifierSection } from './writers.js';
import { loadConfiguration } from './load.js';
import { liveStateProblems, overlayLiveState, TIER_B_RUNTIME_KEYS } from './tiers.js';
import { DESKTOP_SAVE_RUNTIME_KEYS } from '@rotaris/contracts';
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
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { slots: { large_model: 'gpt-4o', medium_model: '' }, slotThinking: { large_model: 'high' }, runtime: { max_depth: 2 }, circuitBreakerEnabled: false, delegationStrategy: 'single', roles: { tester: { workspace: { thinking: 'low' } } } });
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
    // The twelve explicit nulls do not clear the built-in slots (REQ-CONFIG-052).
    const c = loadConfiguration({ globalDir: join(tmp(), 'none'), workspaceRoot: s.workspaceRoot, keepIgnored: false });
    expect(c.ok && c.value.slots.large_model).toBe('gpt-4o');
    expect((starterDocument().match(/: null$/gm) ?? []).length).toBe(12);
  });

  // docs/defects/fixed/the-starter-agents-yaml-writes-fourteen-explicit-nulls-where-the-specification-names-twelve.md: the
  // starter also wrote PD-LIBRARY-002's `retrospective_model` and its companion as nulls, a directive that names neither
  // REQ-CONFIG-025 nor REQ-WORKSPACE-038.
  it('states default_persona then exactly REQ-WORKSPACE-038\'s twelve explicitly-null keys, in its order, and nothing else (REQ-WORKSPACE-038, REQ-CONFIG-025)', () => {
    const body = starterDocument().split('\n').filter((l) => l !== '' && !l.startsWith('#'));
    expect(body).toEqual([
      'default_persona: orchestrator',
      ...['default_summary_model', 'default_summary_model_thinking', 'large_model', 'large_model_thinking', 'medium_model', 'medium_model_thinking', 'small_model', 'small_model_thinking', 'fallback_model', 'fallback_model_thinking', 'improvement_collector_model', 'improvement_collector_model_thinking'].map((k) => `${k}: null`),
    ]);
    expect(starterDocument()).not.toMatch(/^retrospective_model/m);
  });

  it('leaves the retrospective slot resolving as before once the starter no longer states it (REQ-CONFIG-041, PD-LIBRARY-002)', () => {
    const s = scope();
    // A lower layer pins the retrospective slot; the workspace starter, with or without the two old nulls, leaves it.
    writeFileSync(s.gFile, 'retrospective_model: gpt-4o\nretrospective_model_thinking: high\n');
    expect(bootstrapConfigFile(s.wsFile)).toEqual({ ok: true, value: 'written' });
    const withStarter = loadConfiguration({ globalDir: s.globalDir, workspaceRoot: s.workspaceRoot, keepIgnored: false });
    const old = starterDocument().includes('retrospective_model: null') ? starterDocument() : `${starterDocument()}retrospective_model: null\nretrospective_model_thinking: null\n`;
    writeFileSync(s.wsFile, old);
    const withNulls = loadConfiguration({ globalDir: s.globalDir, workspaceRoot: s.workspaceRoot, keepIgnored: false });
    expect(withStarter.ok && withNulls.ok).toBe(true);
    if (withStarter.ok && withNulls.ok) {
      // With a thinking level the slot resolves to its synthesized name (REQ-CONFIG-076); what matters is that it is the global's.
      expect(withStarter.value.slots.retrospective_model).not.toBeNull();
      expect(withStarter.value.slots).toEqual(withNulls.value.slots);
      expect(withStarter.value.slotThinking.retrospective_model).toBe('high');
      expect(withStarter.value.slotThinking).toEqual(withNulls.value.slotThinking);
    }
  });

  // docs/defects/fixed/replace-document-sync-throws-when-the-parent-cannot-be-created.md: a parent that cannot be created
  // threw out of the synchronous replace, so the bootstrap and the synchronous write threw rather than declining.
  it('declines with the path and the fault, never a throw, when a regular file stands where `.rotaris` would go (REQ-CONFIG-026, REQ-CONFIG-028)', async () => {
    const workspaceRoot = join(tmp(), 'ws');
    mkdirSync(workspaceRoot);
    writeFileSync(join(workspaceRoot, '.rotaris'), 'not a directory\n');
    const file = join(workspaceRoot, '.rotaris', 'agents.yaml');
    const boot = bootstrapConfigFile(file);
    expect(boot.ok).toBe(false);
    if (!boot.ok) {
      expect(boot.error.code).toBe('write-failed');
      expect(boot.error.file).toBe(file);
      expect(boot.error.fault).toMatch(/EEXIST.*\.rotaris/);
    }
    // The per-field writer with no timers takes the synchronous replace (ADR-0006): the same refusal, not a rejection.
    const written = await writeConfigFields(file, { default_persona: 'coder' });
    expect(written.ok === false && written.error.code).toBe('write-failed');
    expect(readFileSync(join(workspaceRoot, '.rotaris'), 'utf8')).toBe('not a directory\n');
  });

  it('opens with REQ-WORKSPACE-038\'s three-line header: a minimal start, an override of the built-ins, and a provider authenticated in Settings → Models', () => {
    const lines = starterDocument().split('\n');
    const header = lines.slice(0, lines.findIndex((l) => !l.startsWith('#')));
    expect(header).toHaveLength(3);
    expect(lines[3]).toBe('default_persona: orchestrator');
    expect(header[0]).toMatch(/minimal starting configuration/);
    expect(header[1]).toMatch(/overrides the built-in personas, models and tool servers/);
    // REQ-WORKSPACE-152: the guided provider setup starts from the Settings Models category.
    expect(header[2]).toMatch(/real models are wired up by authenticating a provider in the Models category of Settings/i);
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
  it('PD-CONFIG-003: the desktop save writes runtime.child_timeout in seconds, and refuses one below 1 before touching the file (REQ-CONFIG-111)', async () => {
    const s = scope();
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { runtime: { child_timeout: 2700 } });
    expect(r.ok).toBe(true);
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime:\n  child_timeout: 2700\n');
    const bad = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { runtime: { child_timeout: 0 } });
    expect(bad.ok).toBe(false);
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime:\n  child_timeout: 2700\n');
  });
});

describe('PD-CONFIG-003 revision 2: the improvement analysis timeout through the desktop save and Tier B (OQ-223)', () => {
  it('the desktop save writes runtime.improvement_collector_timeout, and refuses one below 1 before touching the file (REQ-CONFIG-111)', async () => {
    const s = scope();
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { runtime: { improvement_collector_timeout: 120 } });
    expect(r.ok).toBe(true);
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime:\n  improvement_collector_timeout: 120\n');
    const bad = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { runtime: { improvement_collector_timeout: 0 } });
    expect(bad.ok).toBe(false);
    expect(readFileSync(s.wsFile, 'utf8')).toBe('runtime:\n  improvement_collector_timeout: 120\n');
  });

  it('a live 120 reaches the resolved runtime the run host reads, saved or not (REQ-CONFIG-262, REQ-CONFIG-263)', () => {
    const s = scope();
    writeFileSync(s.wsFile, 'runtime:\n  improvement_collector_timeout: 60\n');
    const loaded = loadConfiguration({ globalDir: s.globalDir, workspaceRoot: s.workspaceRoot, keepIgnored: false });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const live = overlayLiveState(loaded.value, { runtime: { improvement_collector_timeout: 120 } });
    expect(live.ok && live.value.runtime.improvement_collector_timeout).toBe(120);
    expect(loaded.value.runtime.improvement_collector_timeout).toBe(60);
  });

  it("Tier B's runtime keys are the desktop save's, less the six confinement and egress fields REQ-SANDBOX-118 keeps to the file", () => {
    const confinement = ['sandbox_mode', 'sandbox_writable_roots', 'sandbox_allow_network', 'network_egress_policy', 'network_allowed_hosts', 'network_denied_hosts'];
    expect([...TIER_B_RUNTIME_KEYS].sort()).toEqual(DESKTOP_SAVE_RUNTIME_KEYS.filter((k) => !confinement.includes(k)).sort());
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

  it('writes a check timeout above 600 s, which the configuration surface accepts (REQ-CONFIG-145, REQ-LIBRARY-009 (c), REQ-LIBRARY-063)', async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'runtime:\n  max_depth: 4\n');
    const result = await writeVerifierSection(s.wsFile, { checks: [{ name: 'suite', command: 'pnpm test', timeout: 900 }] });
    expect(result.ok && result.value.changed).toBe(true);
    expect(readFileSync(s.wsFile, 'utf8')).toContain('      timeout: 900\n');
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
    const g = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { roles: { tester: { global: { model: 'gpt-4o' } } } });
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
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { runtime: { max_depth: 2 }, roles: { 'codebase-analyst': { workspace: { model: 'gpt-4o-mini' } }, tester: { global: { unsetModel: true, unsetThinking: true } } } });
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
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { roles: { orchestrator: { global: { model: null } } } });
    expect(r.ok).toBe(true);
    expect(readFileSync(s.gFile, 'utf8')).toBe('personas:\n  orchestrator:\n    thinking: default\n');
  });
});

/**
 * Defect note `a-roles-pending-edits-at-two-scopes-save-at-the-last-scope-only.md` — REQ-CONFIG-259: "Role edits carry a
 * per-field scope". One role's model unset at the workspace and reasoning unset at the global layer each land where they
 * were made, and each file is written once; until 2026-10-02 one `scope` routed the whole entry to one file.
 */
describe('REQ-CONFIG-259/341 a role edit at two scopes', () => {
  it('unsets the model in the workspace file and the reasoning in the global file, each file written once', async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'personas:\n  tester:\n    model: gpt-4o\n');
    writeFileSync(s.gFile, 'personas:\n  tester:\n    model: gpt-4o-mini\n    thinking: high\n');
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { roles: { tester: { workspace: { unsetModel: true }, global: { unsetThinking: true } } } });
    expect(r.ok).toBe(true);
    // The workspace's override is cleared; the global layer's model, which the user did not touch, stays.
    expect(readFileSync(s.wsFile, 'utf8')).toBe('{}\n');
    expect(readFileSync(s.gFile, 'utf8')).toBe('personas:\n  tester:\n    model: gpt-4o-mini\n');
    expect(r.ok && r.value.global).not.toBeNull();
    const loaded = loadConfiguration({ globalDir: s.globalDir, workspaceRoot: s.workspaceRoot });
    expect(loaded.ok && loaded.value.personas['tester']).toMatchObject({ model: 'gpt-4o-mini' });
  });
  it('writes a model picked at the workspace and a reasoning level picked at the global layer each in its own file', async () => {
    const s = scope();
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { roles: { tester: { workspace: { model: 'gpt-4o' }, global: { thinking: 'high' } } } });
    expect(r.ok).toBe(true);
    expect(readFileSync(s.wsFile, 'utf8')).toBe('personas:\n  tester:\n    model: gpt-4o\n');
    expect(readFileSync(s.gFile, 'utf8')).toContain('personas:\n  tester:\n    thinking: high\n');
  });
  it('REQ-CONFIG-341/MONITOR-149: a model unset at the workspace and a model picked at the global layer both land, each in its own file', async () => {
    const s = scope();
    writeFileSync(s.wsFile, 'personas:\n  tester:\n    model: gpt-4o\n');
    writeFileSync(s.gFile, 'personas:\n  tester:\n    model: gpt-4o\n');
    const r = await saveDesktop({ workspace: s.wsFile, global: s.gFile }, { roles: { tester: { workspace: { unsetModel: true }, global: { model: 'gpt-4o-mini' } } } });
    expect(r.ok).toBe(true);
    // The workspace override the user cleared is gone, so the global pick is what the role now runs on.
    expect(readFileSync(s.wsFile, 'utf8')).toBe('{}\n');
    expect(readFileSync(s.gFile, 'utf8')).toBe('personas:\n  tester:\n    model: gpt-4o-mini\n');
    const loaded = loadConfiguration({ globalDir: s.globalDir, workspaceRoot: s.workspaceRoot });
    expect(loaded.ok && loaded.value.personas['tester']).toMatchObject({ model: 'gpt-4o-mini' });
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
    expect(text.startsWith(starterDocument().slice(0, starterDocument().indexOf('default_persona: ')))).toBe(true);
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
    expect(slots['default_summary_model']).toMatchObject({ origin: 'default' });
    const tester = rolePreferences(c.value).find((r) => r.role === 'tester')!;
    // `large_model: medium_model` registers no alias (REQ-CONFIG-074): the editor follows the raw chain to gpt-4o, while the
    // resolved role keeps the literal and referential validation names it.
    expect(tester).toMatchObject({ rawModel: 'large_model', modelOrigin: 'global', effectiveModel: 'large_model', inherited: false, builtInDefault: 'medium_model', rawThinking: 'high', tier: 'large_model' });
    expect(c.value.referential).toContain("large_model 'medium_model' names no configured model (a tier alias that registered no substitution)");
    const planner = rolePreferences(c.value).find((r) => r.role === 'planner')!;
    expect(planner).toMatchObject({ rawModel: null, modelOrigin: 'default', inherited: true, effectiveModel: 'large_model', builtInDefault: 'large_model' });
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

  it('PD-CONFIG-003: a live per-agent timeout reaches the resolved runtime the run host reads (`childTimeoutMs`)', () => {
    const s = scope();
    writeFileSync(s.wsFile, 'runtime:\n  child_timeout: 1200\n');
    const loaded = loadConfiguration({ globalDir: s.globalDir, workspaceRoot: s.workspaceRoot, keepIgnored: false });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const live = overlayLiveState(loaded.value, { runtime: { child_timeout: 2700 } });
    expect(live.ok && live.value.runtime.child_timeout).toBe(2700);
    expect(loaded.value.runtime.child_timeout).toBe(1200);
  });

  /**
   * REQ-CONFIG-111 at the Tier B handover: the run host refuses a live state the load's schema rejects, so `resolveMerged`
   * never meets an overlay value at fault and never names a scope file for it
   * (docs/defects/fixed/a-live-setting-the-load-schema-rejects-is-reported-in-a-scope-file-that-does-not-hold-it.md).
   */
  it('REQ-CONFIG-111: liveStateProblems is the load\'s schema over each value the overlay lays on, by the loader\'s path', () => {
    expect(liveStateProblems({})).toEqual([]);
    expect(liveStateProblems({ slots: { large_model: 'fast', small_model: null }, slotThinking: { large_model: 'high' }, entryRole: 'planner', sessionModel: null, sessionThinking: 'provider_default', delegationStrategy: 'swarm', runtime: { max_depth: 3, permission_mode: 'autonomous', keep_going: true, sandbox_mode: 'nonsense' } as never, circuitBreakerEnabled: true, compressorThresholdPercentage: 95 })).toEqual([]);
    const paths = (live: unknown) => liveStateProblems(live as never).map((p) => p.path);
    expect(paths({ runtime: { max_depth: 0 } })).toEqual(['runtime.max_depth']);
    expect(paths({ runtime: { permission_mode: 'sudo' } })).toEqual(['runtime.permission_mode']);
    expect(paths({ compressorThresholdPercentage: 0 })).toEqual(['compressor.threshold_percentage']);
    expect(paths({ compressorThresholdPercentage: 101 })).toEqual(['compressor.threshold_percentage']);
    expect(paths({ circuitBreakerEnabled: 'yes' })).toEqual(['circuit_breaker.enabled']);
    expect(paths({ slots: { large_model: 5 }, slotThinking: { small_model: 'extreme' } })).toEqual(['small_model_thinking', 'large_model']);
    expect(paths({ delegationStrategy: 'mob', sessionThinking: 'turbo' })).toEqual(['personas.<entry role>.thinking', 'rotaris.delegation_strategy']);
    expect(liveStateProblems({ runtime: { max_depth: 0 } })[0]?.message).toBe('must be at least 1, got 0');
  });

  it('a live state liveStateProblems passes overlays with no fault, and one it refuses is the one that faulted in a file\'s name', () => {
    const s = scope();
    writeFileSync(s.gFile, 'runtime:\n  max_depth: 4\n');
    const loaded = loadConfiguration({ globalDir: s.globalDir, workspaceRoot: s.workspaceRoot, keepIgnored: false });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const accepted = { runtime: { max_depth: 2 }, compressorThresholdPercentage: 50 };
    expect(liveStateProblems(accepted)).toEqual([]);
    expect(overlayLiveState(loaded.value, accepted).ok).toBe(true);
    // The overlay itself still runs the loader's passes and still names the files: what keeps this from the run start is the handover's refusal.
    const refused = { runtime: { max_depth: 0 } };
    expect(liveStateProblems(refused)).not.toEqual([]);
    const faulted = overlayLiveState(loaded.value, refused);
    expect(!faulted.ok && faulted.error).toMatchObject({ path: 'runtime.max_depth', file: s.gFile });
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
