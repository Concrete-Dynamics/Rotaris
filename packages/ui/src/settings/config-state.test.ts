import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot } from '@rotaris/contracts';
import { applyChange, clampForDisplay, isDirty, liveStateOf, pendingFrom, savePayload } from './config-state.js';

const snapshot: ConfigSnapshot = {
  workspaceRoot: 'C:/ws', loadOk: true, fatal: null,
  slots: [
    { slot: 'large_model', value: 'gpt-4o', origin: 'default', thinking: null },
    { slot: 'small_model', value: 'gpt-4o-mini', origin: 'workspace', thinking: 'auto' },
  ],
  models: ['gpt-4o', 'gpt-4o-mini'], imageInputModels: [],
  roles: [{ role: 'tester', rawModel: null, modelOrigin: 'default', effectiveModel: 'gpt-4o-mini', inherited: true, builtInDefault: 'medium_model', rawThinking: null, thinkingOrigin: 'default', tier: 'medium_model', tools: ['read_file'], declaredTools: ['read_file'] }],
  runtime: { max_depth: 3, max_active_children: 6, child_timeout: 1200, max_iterations: 20, allow_outside_workspace: false, permission_mode: 'ask', improvement_collector_enabled: true, improvement_collector_timeout: 60, retrospective_timeout: 120, keep_going: false, run_start_mode: 'auto', memory_diagnostics_enabled: false, sandbox_mode: 'off', sandbox_writable_roots: [], sandbox_allow_network: false, network_egress_policy: 'ask', network_allowed_hosts: [], network_denied_hosts: [] },
  rawRuntime: { workspace: { max_depth: 3 }, global: null },
  circuitBreakerEnabled: true, compressorThresholdPercentage: 60, display: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
  skills: { enabled: true, overrides: {}, invocation_overrides: {} }, instructionsPolicy: { overrides: {} }, injectAgentsMd: true, worktreeStorageSubpath: 'worktrees', delegationStrategy: 'orchestrator', instructions: [], referential: [], warnings: [],
  files: { workspace: 'C:/ws/.rotaris/agents.yaml', global: 'C:/cfg/agents.yaml' },
};

describe('the pending settings state (REQ-CONFIG-279..287, 335, 419, 425)', () => {
  it('starts clean by definition, and a setter re-selecting the current value cannot dirty it', () => {
    const saved = pendingFrom(snapshot);
    expect(isDirty(saved, saved)).toBe(false);
    const same = applyChange(saved, { kind: 'runtime', key: 'max_depth', value: 3 });
    expect(same).toBe(saved);
    expect(applyChange(saved, { kind: 'slotThinking', slot: 'small_model', value: 'auto' })).toBe(saved);
    expect(applyChange(saved, { kind: 'slot', slot: 'large_model', value: 'gpt-4o' })).toBe(saved);
  });
  it('dirty is a difference from the last saved values; discard is the saved values again (REQ-CONFIG-285)', () => {
    const saved = pendingFrom(snapshot);
    let pending = applyChange(saved, { kind: 'runtime', key: 'max_depth', value: 2 });
    expect(isDirty(saved, pending)).toBe(true);
    pending = applyChange(pending, { kind: 'runtime', key: 'max_depth', value: 3 });
    expect(isDirty(saved, pending)).toBe(false);
  });
  it('the save payload carries only what differs: a slot only when non-empty, a null companion, the touched runtime keys, role edits with their scope (REQ-CONFIG-256/259)', () => {
    const saved = pendingFrom(snapshot);
    let pending = applyChange(saved, { kind: 'slot', slot: 'large_model', value: 'gpt-4o-mini' });
    pending = applyChange(pending, { kind: 'slot', slot: 'medium_model', value: null });
    pending = applyChange(pending, { kind: 'slotThinking', slot: 'small_model', value: null });
    pending = applyChange(pending, { kind: 'runtime', key: 'permission_mode', value: 'autonomous' });
    pending = applyChange(pending, { kind: 'circuitBreaker', value: false });
    pending = applyChange(pending, { kind: 'role', role: 'tester', scope: 'global', model: 'large_model' });
    pending = applyChange(pending, { kind: 'role', role: 'tester', scope: 'global', unsetThinking: true });
    expect(savePayload(saved, pending)).toEqual({
      slots: { large_model: 'gpt-4o-mini' },
      slotThinking: { small_model: null },
      runtime: { permission_mode: 'autonomous' },
      circuitBreakerEnabled: false,
      roles: { tester: { global: { model: 'large_model', unsetThinking: true } } },
    });
  });
  it('the live state is the screen\'s current values, saved or not (ADR-0037 Tier B, REQ-CONFIG-262)', () => {
    const saved = pendingFrom(snapshot);
    const pending = applyChange(saved, { kind: 'runtime', key: 'keep_going', value: true });
    const live = liveStateOf(pending);
    expect(live.runtime?.['keep_going']).toBe(true);
    expect(live.slots).toEqual({ large_model: 'gpt-4o', small_model: 'gpt-4o-mini' });
    expect(live.delegationStrategy).toBe('orchestrator');
  });
  it('REQ-CONFIG-446: a stored value outside the offered range shows clamped, the value itself untouched', () => {
    expect(clampForDisplay(99, 50, 95)).toBe(95);
    expect(clampForDisplay(3, 50, 95)).toBe(50);
    expect(pendingFrom({ ...snapshot, compressorThresholdPercentage: 99 }).compressorThresholdPercentage).toBe(99);
  });
});

describe('REQ-CONFIG-419/423: a reload from elsewhere keeps only what the user changed', () => {
  it('rebases field by field: an untouched slot takes the file’s new value, a touched one stays, a touched runtime key stays', async () => {
    const { rebasePending, pendingFrom, applyChange } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    const pending = applyChange(applyChange(saved, { kind: 'slot', slot: 'small_model', value: 'mine' }), { kind: 'runtime', key: 'max_depth', value: 9 });
    const fresh = { ...saved, slots: { ...saved.slots, large_model: 'discovered/large', small_model: 'discovered/small' }, runtime: { ...saved.runtime, max_depth: 4, max_iterations: 77 } };
    const rebased = rebasePending(saved, pending, fresh);
    expect(rebased.slots.large_model).toBe('discovered/large');
    expect(rebased.slots.small_model).toBe('mine');
    expect(rebased.runtime.max_depth).toBe(9);
    expect(rebased.runtime.max_iterations).toBe(77);
    expect(rebasePending(saved, saved, fresh)).toEqual(fresh);
  });
  it('a reload with no edit leaves the form clean, whatever order the rebuilt state holds its keys in (defect note a-sign-in-reload-marks-settings-unsaved-though-nothing-was-edited.md)', async () => {
    const { rebasePending, pendingFrom, applyChange, isDirty } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    // The sign-in's reload: the file gains a discovered model; the user edited nothing.
    const fresh = pendingFrom({ ...snapshot, slots: [...snapshot.slots, { slot: 'medium_model', value: 'katalyst/m', origin: 'workspace', thinking: null }] });
    expect(isDirty(fresh, rebasePending(saved, saved, fresh))).toBe(false);
    // An identical reload is clean too.
    expect(isDirty(saved, rebasePending(saved, saved, pendingFrom(snapshot)))).toBe(false);
    // A real edit stays dirty across the reload, and an edit undone after it is clean again.
    const edited = applyChange(saved, { kind: 'runtime', key: 'max_depth', value: 9 });
    const rebased = rebasePending(saved, edited, fresh);
    expect(isDirty(fresh, rebased)).toBe(true);
    expect(isDirty(fresh, applyChange(rebased, { kind: 'runtime', key: 'max_depth', value: 3 }))).toBe(false);
  });
  it('a list the user edited and put back counts as untouched, so a reload gives it the file’s new value', async () => {
    const { rebasePending, pendingFrom, applyChange } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    const putBack = applyChange(applyChange(saved, { kind: 'runtime', key: 'sandbox_writable_roots', value: ['C:/x'] }), { kind: 'runtime', key: 'sandbox_writable_roots', value: [] });
    const fresh = { ...saved, runtime: { ...saved.runtime, sandbox_writable_roots: ['C:/from-file'] } };
    expect(rebasePending(saved, putBack, fresh).runtime.sandbox_writable_roots).toEqual(['C:/from-file']);
  });
  it('REQ-CONFIG-423: a permission mode written elsewhere wins over an unsaved selection, and only that field (defect note a-permission-mode-written-elsewhere-loses-to-an-unsaved-settings-selection.md)', async () => {
    const { rebasePending, pendingFrom, applyChange, isDirty } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    // The user picked `plan` here and has not saved; meanwhile the composer wrote `autonomous`, and another key moved too.
    const pending = applyChange(applyChange(saved, { kind: 'runtime', key: 'permission_mode', value: 'plan' }), { kind: 'runtime', key: 'max_depth', value: 9 });
    const fresh = pendingFrom({ ...snapshot, runtime: { ...snapshot.runtime, permission_mode: 'autonomous', max_depth: 4 } });
    const rebased = rebasePending(saved, pending, fresh);
    expect(rebased.runtime.permission_mode).toBe('autonomous');
    // REQ-CONFIG-420: every other edit in progress survives the refresh.
    expect(rebased.runtime.max_depth).toBe(9);
    // The displaced selection is no edit any more: with nothing else pending the form is clean.
    expect(isDirty(fresh, rebasePending(saved, applyChange(saved, { kind: 'runtime', key: 'permission_mode', value: 'plan' }), fresh))).toBe(false);
  });
  it('two reloads adopted back to back leave the form clean and on the second file values (defect note two-quick-configuration-reloads-mark-settings-unsaved.md)', async () => {
    const { adoptSnapshot, applyChange, pendingFrom, isDirty, rebasePending } = await import('./config-state.js');
    const opened = adoptSnapshot(null, pendingFrom(snapshot), false);
    // Two writes from elsewhere: the breaker off, then on again — announced so close together that both are adopted before
    // the screen renders. Each adoption is rebased against the saved half the previous one left.
    const first = pendingFrom({ ...snapshot, circuitBreakerEnabled: false });
    const second = pendingFrom(snapshot);
    const after = adoptSnapshot(adoptSnapshot(opened, first, true), second, true);
    expect(after.pending.circuitBreakerEnabled).toBe(true);
    expect(isDirty(after.saved, after.pending)).toBe(false);
    // Rebased against the values from before the first — what the hook did — the first's `off` reads as an edit.
    expect(isDirty(second, rebasePending(opened.saved, adoptSnapshot(opened, first, true).pending, second))).toBe(true);
    // A real edit made before the pair survives both and stays dirty.
    const edited = { saved: opened.saved, pending: applyChange(opened.pending, { kind: 'runtime', key: 'max_depth', value: 9 }) };
    const kept = adoptSnapshot(adoptSnapshot(edited, first, true), second, true);
    expect(kept.pending.runtime.max_depth).toBe(9);
    expect(kept.pending.circuitBreakerEnabled).toBe(true);
    expect(isDirty(kept.saved, kept.pending)).toBe(true);
    // A read or a save repopulates both halves, clean.
    expect(isDirty(adoptSnapshot(kept, second, false).saved, adoptSnapshot(kept, second, false).pending)).toBe(false);
  });
  it('REQ-CONFIG-420: a reload that did not change the permission mode keeps the unsaved selection', async () => {
    const { rebasePending, pendingFrom, applyChange, isDirty } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    const pending = applyChange(saved, { kind: 'runtime', key: 'permission_mode', value: 'plan' });
    // A sign-in's reload: the file gains a model; its permission mode is the one Settings last saved.
    const fresh = pendingFrom({ ...snapshot, slots: [...snapshot.slots, { slot: 'medium_model', value: 'katalyst/m', origin: 'workspace', thinking: null }] });
    const rebased = rebasePending(saved, pending, fresh);
    expect(rebased.runtime.permission_mode).toBe('plan');
    expect(isDirty(fresh, rebased)).toBe(true);
  });
  it('equal values are clean whatever their key order, at every depth; a different value is dirty', async () => {
    const { pendingFrom, isDirty } = await import('./config-state.js');
    const saved = pendingFrom({ ...snapshot, skills: { enabled: true, overrides: { a: 'auto', b: 'manual' } as never, invocation_overrides: {} } });
    const reordered = { ...saved, skills: { invocationOverrides: {}, overrides: { b: saved.skills.overrides['b']!, a: saved.skills.overrides['a']! }, enabled: true }, runtime: Object.fromEntries(Object.entries(saved.runtime).reverse()) as unknown as typeof saved.runtime };
    expect(isDirty(saved, reordered)).toBe(false);
    expect(isDirty(saved, { ...reordered, skills: { ...reordered.skills, overrides: { a: saved.skills.overrides['a']! } } })).toBe(true);
    expect(isDirty(saved, { ...saved, runtime: { ...saved.runtime, sandbox_writable_roots: ['x'] } })).toBe(true);
    // An array's order is a value: a reordered list is an edit.
    const two = { ...saved, runtime: { ...saved.runtime, network_allowed_hosts: ['a', 'b'] } };
    expect(isDirty(two, { ...two, runtime: { ...two.runtime, network_allowed_hosts: ['b', 'a'] } })).toBe(true);
  });
});

describe('REQ-CONFIG-472 — the Display category in the pending state', () => {
  it('REQ-CONFIG-419: repopulating a control from the stored value changes nothing and cannot dirty the form', async () => {
    const { applyChange, isDirty, pendingFrom } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    expect(applyChange(saved, { kind: 'display', key: 'tool_result_lines', value: 10 })).toBe(saved);
    expect(applyChange(saved, { kind: 'display', key: 'show_tool_inputs', value: true })).toBe(saved);
    const moved = applyChange(saved, { kind: 'display', key: 'tool_result_lines', value: null });
    expect(moved).not.toBe(saved);
    expect(isDirty(saved, moved)).toBe(true);
    // The other three are untouched by a change to one.
    expect(moved.display.show_tool_results).toBe(saved.display.show_tool_results);
  });

  it('REQ-CONFIG-256/172: a save writes only what moved, under the file’s key names, unlimited as 0', async () => {
    const { applyChange, pendingFrom, savePayload } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    expect(savePayload(saved, saved).display).toBeUndefined();
    const unlimited = applyChange(saved, { kind: 'display', key: 'tool_result_lines', value: null });
    expect(savePayload(saved, unlimited).display).toEqual({ tool_result_max_lines: 0 });
    const both = applyChange(applyChange(saved, { kind: 'display', key: 'tool_input_lines', value: 20 }), { kind: 'display', key: 'show_tool_results', value: false });
    expect(savePayload(saved, both).display).toEqual({ show_tool_results: false, tool_input_max_lines: 20 });
  });

  it('REQ-CONFIG-419/423: a reload rebases the four fields one by one', async () => {
    const { applyChange, pendingFrom, rebasePending } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    const pending = applyChange(saved, { kind: 'display', key: 'tool_input_lines', value: 50 });
    const fresh = { ...saved, display: { ...saved.display, tool_input_lines: 5, tool_result_lines: 20 } };
    const rebased = rebasePending(saved, pending, fresh);
    expect(rebased.display.tool_input_lines).toBe(50);
    expect(rebased.display.tool_result_lines).toBe(20);
  });

  it('PD-WORKSPACE-002: a per-file switch marks dirty, and the save writes it sparsely', async () => {
    const { applyChange, isDirty, pendingFrom, savePayload } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    expect(isDirty(saved, saved)).toBe(false);
    expect(savePayload(saved, saved).instructions).toBeUndefined();
    const off = applyChange(saved, { kind: 'instructionToggle', id: 'workspace:AGENTS.md', value: 'off' });
    expect(isDirty(saved, off)).toBe(true);
    // Off differs from the implicit baseline: the deviation is persisted.
    expect(savePayload(saved, off).instructions).toEqual({ overrides: { 'workspace:AGENTS.md': 'off' } });
    const layered = { ...snapshot, instructionsPolicy: { overrides: { 'global:CLAUDE.md': 'off' as const } } };
    const savedLayered = pendingFrom(layered);
    const back = applyChange(savedLayered, { kind: 'instructionToggle', id: 'global:CLAUDE.md', value: 'on' });
    // A lower layer states a policy: the baseline is written explicitly so the merge produces it.
    expect(savePayload(savedLayered, back).instructions).toEqual({ overrides: { 'global:CLAUDE.md': 'on' } });
    const reselected = applyChange(off, { kind: 'instructionToggle', id: 'workspace:AGENTS.md', value: 'on' });
    // Back to the baseline with no lower-layer policy: the key is removed.
    expect(savePayload(saved, reselected).instructions).toEqual({ overrides: { 'workspace:AGENTS.md': null } });
  });
});

describe('REQ-CONFIG-341 — the Scope column reads the pending unset', () => {
  // The note's workspace: `agents.yaml` sets only `personas.tester.model: large_model`.
  const tester = { ...snapshot.roles[0]!, rawModel: 'large_model', modelOrigin: 'workspace' as const, inherited: false };

  it('draws the read-back origin, with Unset only at the edited scope, while nothing is pending', async () => {
    const { pendingFrom, scopeCellOf } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    expect(scopeCellOf(tester, saved, 'workspace')).toMatchObject({ model: { origin: 'workspace', offerUnset: true }, reasoning: { origin: 'default', offerUnset: false } });
    expect(scopeCellOf(tester, saved, 'global')).toMatchObject({ model: { origin: 'workspace', offerUnset: false }, reasoning: { origin: 'default', offerUnset: false } });
  });

  it('Unset clicked: the field reads `default` and offers no Unset; Discard (the saved state) reads `workspace` with Unset again', async () => {
    const { applyChange, pendingFrom, scopeCellOf } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    const unset = applyChange(saved, { kind: 'role', role: 'tester', scope: 'workspace', unsetModel: true });
    expect(scopeCellOf(tester, unset, 'workspace')).toMatchObject({ model: { origin: 'default', offerUnset: false }, reasoning: { origin: 'default', offerUnset: false } });
    // Switching the edit scope is a view selection: the pending unset still reads `default` there.
    expect(scopeCellOf(tester, unset, 'global').model).toMatchObject({ origin: 'default', offerUnset: false });
    expect(scopeCellOf(tester, saved, 'workspace').model).toMatchObject({ origin: 'workspace', offerUnset: true });
  });

  it('reads each field on its own: a pending reasoning unset leaves the model at its origin', async () => {
    const { applyChange, pendingFrom, scopeCellOf } = await import('./config-state.js');
    const both = { ...tester, rawThinking: 'high', thinkingOrigin: 'workspace' as const };
    const unset = applyChange(pendingFrom(snapshot), { kind: 'role', role: 'tester', scope: 'workspace', unsetThinking: true });
    expect(scopeCellOf(both, unset, 'workspace')).toMatchObject({ model: { origin: 'workspace', offerUnset: true }, reasoning: { origin: 'default', offerUnset: false } });
  });

  it('a value picked after the unset withdraws it: the field reads its read-back origin again', async () => {
    const { applyChange, pendingFrom, scopeCellOf } = await import('./config-state.js');
    let pending = applyChange(pendingFrom(snapshot), { kind: 'role', role: 'tester', scope: 'workspace', unsetModel: true });
    pending = applyChange(pending, { kind: 'role', role: 'tester', scope: 'workspace', model: 'small_model' });
    expect(scopeCellOf(tester, pending, 'workspace').model).toMatchObject({ origin: 'workspace', offerUnset: true });
  });
});

describe('REQ-CONFIG-341 — the Scope column\'s Unset is named by its field and its role', () => {
  it('names the model\'s and the reasoning\'s Unset apart, and each role apart', async () => {
    const { pendingFrom, scopeCellOf } = await import('./config-state.js');
    const saved = pendingFrom(snapshot);
    const tester = { ...snapshot.roles[0]!, rawModel: 'large_model', modelOrigin: 'workspace' as const, rawThinking: 'high', thinkingOrigin: 'workspace' as const };
    const cell = scopeCellOf(tester, saved, 'workspace');
    expect(cell.model).toMatchObject({ offerUnset: true, unsetLabel: 'Unset model for tester' });
    expect(cell.reasoning).toMatchObject({ offerUnset: true, unsetLabel: 'Unset reasoning for tester' });
    expect(scopeCellOf({ ...tester, role: 'planner' }, saved, 'workspace').model.unsetLabel).toBe('Unset model for planner');
  });
});

/**
 * Defect note `a-roles-pending-edits-at-two-scopes-save-at-the-last-scope-only.md`. REQ-CONFIG-259: "Role edits carry a
 * per-field scope"; REQ-CONFIG-341: Unset "records a pending unset of (role, field, scope)". The pending entry held ONE
 * scope per role, and every change to the role overwrote it, so a model unset at Workspace followed by a reasoning
 * unset at Global saved both at Global: the global layer was asked to unset a model it did not hold, and the workspace
 * override the user cleared stayed in place. One scope per field (the first repair) still let a second edit of the same
 * field at the other scope drop the first: the pending edits are now held per (role, scope), each field within.
 */
describe('REQ-CONFIG-259/341 — each field of a role\'s pending edit keeps the scope it was made at', () => {
  it('a model Unset at Workspace and then a reasoning Unset at Global save each at its own scope', () => {
    const saved = pendingFrom(snapshot);
    let pending = applyChange(saved, { kind: 'role', role: 'tester', scope: 'workspace', unsetModel: true });
    pending = applyChange(pending, { kind: 'role', role: 'tester', scope: 'global', unsetThinking: true });
    expect(savePayload(saved, pending).roles).toEqual({ tester: { workspace: { unsetModel: true }, global: { unsetThinking: true } } });
  });
  it('a model picked at Workspace survives a reasoning level picked at Global', () => {
    const saved = pendingFrom(snapshot);
    let pending = applyChange(saved, { kind: 'role', role: 'tester', scope: 'workspace', model: 'gpt-4o' });
    pending = applyChange(pending, { kind: 'role', role: 'tester', scope: 'global', thinking: 'high' });
    expect(savePayload(saved, pending).roles).toEqual({ tester: { workspace: { model: 'gpt-4o' }, global: { thinking: 'high' } } });
  });
  it('REQ-MONITOR-149: a model Unset at Workspace survives a model picked at Global, and both reach the save', () => {
    const saved = pendingFrom(snapshot);
    let pending = applyChange(saved, { kind: 'role', role: 'tester', scope: 'workspace', unsetModel: true });
    pending = applyChange(pending, { kind: 'role', role: 'tester', scope: 'global', model: 'gpt-4o-mini' });
    expect(savePayload(saved, pending).roles).toEqual({ tester: { workspace: { unsetModel: true }, global: { model: 'gpt-4o-mini' } } });
  });
  it('a later edit of the same field at the SAME scope replaces it there; the other scope keeps its own', () => {
    const saved = pendingFrom(snapshot);
    let pending = applyChange(saved, { kind: 'role', role: 'tester', scope: 'workspace', thinking: 'low' });
    pending = applyChange(pending, { kind: 'role', role: 'tester', scope: 'global', model: 'gpt-4o' });
    pending = applyChange(pending, { kind: 'role', role: 'tester', scope: 'workspace', unsetModel: true });
    pending = applyChange(pending, { kind: 'role', role: 'tester', scope: 'global', model: 'gpt-4o-mini' });
    expect(savePayload(saved, pending).roles).toEqual({ tester: { workspace: { unsetModel: true, thinking: 'low' }, global: { model: 'gpt-4o-mini' } } });
  });
});
