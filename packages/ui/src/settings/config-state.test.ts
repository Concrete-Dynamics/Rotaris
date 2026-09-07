import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot } from '@rotaris/contracts';
import { applyChange, clampForDisplay, isDirty, liveStateOf, pendingFrom, savePayload } from './config-state.js';

const snapshot: ConfigSnapshot = {
  workspaceRoot: 'C:/ws', loadOk: true, fatal: null,
  slots: [
    { slot: 'large_model', value: 'gpt-4o', origin: 'built-in', thinking: null },
    { slot: 'small_model', value: 'gpt-4o-mini', origin: 'workspace', thinking: 'auto' },
  ],
  models: ['gpt-4o', 'gpt-4o-mini'],
  roles: [{ role: 'tester', rawModel: null, modelOrigin: 'built-in', effectiveModel: 'gpt-4o-mini', inherited: true, builtInDefault: 'medium_model', rawThinking: null, thinkingOrigin: 'built-in', tier: 'medium_model', tools: ['read_file'] }],
  runtime: { max_depth: 3, max_active_children: 6, max_iterations: 20, allow_outside_workspace: false, permission_mode: 'ask', improvement_collector_enabled: true, keep_going: false, run_start_mode: 'auto', memory_diagnostics_enabled: false, sandbox_mode: 'off' },
  rawRuntime: { workspace: { max_depth: 3 }, global: null },
  circuitBreakerEnabled: true, compressorThresholdPercentage: 60, display: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 }, delegationStrategy: 'orchestrator', referential: [], warnings: [],
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
      roles: { tester: { scope: 'global', model: 'large_model', unsetThinking: true } },
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
});
