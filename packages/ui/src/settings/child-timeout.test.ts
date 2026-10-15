import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot } from '@rotaris/contracts';
import { RuntimeSettings, type ConfigSettingsProps } from './ConfigSettings.js';
import { adoptSnapshot, applyChange, isDirty, liveStateOf, pendingFrom, savePayload, storedTimeoutNote, timeoutMinutesForDisplay, timeoutSecondsFromInput } from './config-state.js';

/**
 * PD-CONFIG-003 (REQ-MONITOR-286, T1 ruled under R-072 as OQ-218): Settings › Runtime › Delegation limits carries the
 * per-agent timeout as a third numeric control, in whole minutes clamped 1–240, over `runtime.child_timeout`'s seconds.
 * Until 2026-10-07 no surface showed the figure at all: the two delegation controls were the depth cap and the fan-out
 * limit, and the only route to the limit both duress runs met ("Child timed out after 1200s") was a YAML key in seconds.
 */
const runtime = (childTimeout: number): ConfigSnapshot['runtime'] => ({ max_depth: 3, max_active_children: 6, child_timeout: childTimeout, max_iterations: 20, allow_outside_workspace: false, permission_mode: 'ask', improvement_collector_enabled: true, improvement_collector_timeout: 60, retrospective_timeout: 120, keep_going: false, run_start_mode: 'auto', memory_diagnostics_enabled: false, sandbox_mode: 'off', sandbox_writable_roots: [], sandbox_allow_network: false, network_egress_policy: 'ask', network_allowed_hosts: [], network_denied_hosts: [] });
const snapshotWith = (childTimeout: number): ConfigSnapshot => ({
  workspaceRoot: '/ws', loadOk: true, fatal: null,
  slots: [{ slot: 'large_model', value: 'gpt-4o', origin: 'default', thinking: null }],
  models: ['gpt-4o'], imageInputModels: [],
  roles: [],
  runtime: runtime(childTimeout),
  rawRuntime: { workspace: null, global: null },
  circuitBreakerEnabled: true, compressorThresholdPercentage: 60, display: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
  skills: { enabled: true, overrides: {}, invocation_overrides: {} }, instructionsPolicy: { overrides: {} }, injectAgentsMd: true, worktreeStorageSubpath: 'worktrees', delegationStrategy: 'orchestrator', instructions: [], referential: [], warnings: [],
  files: { workspace: '/ws/.rotaris/agents.yaml', global: '/cfg/agents.yaml' },
});

const outcome = async () => ({ ok: true as const });
function render(snapshot: ConfigSnapshot, edit?: number): string {
  const saved = pendingFrom(snapshot);
  const pending = edit === undefined ? saved : applyChange(saved, { kind: 'runtime', key: 'child_timeout', value: edit });
  const props: ConfigSettingsProps = {
    snapshot, pending, dirty: pending !== saved, loading: false, error: null, serviceAvailable: true,
    onChange: () => {}, onSave: outcome, onDiscard: () => {}, onSetField: outcome,
  };
  return renderToStaticMarkup(createElement(RuntimeSettings, props));
}
/** The Delegation limits section: from its heading to the next one. */
const limits = (markup: string): string => markup.slice(markup.indexOf('Delegation limits'), markup.indexOf('Runtime policy'));

describe('the per-agent timeout in minutes (PD-CONFIG-003, REQ-MONITOR-286)', () => {
  it('shows stored seconds as whole minutes, clamped 1–240 for display only (REQ-CONFIG-446)', () => {
    expect(timeoutMinutesForDisplay(1200)).toBe(20);
    expect(timeoutMinutesForDisplay(2700)).toBe(45);
    expect(timeoutMinutesForDisplay(1250)).toBe(21);
    expect(timeoutMinutesForDisplay(36000)).toBe(240);
    expect(timeoutMinutesForDisplay(10)).toBe(1);
  });

  it('stores a user entry as whole minutes clamped 1–240, times 60', () => {
    expect(timeoutSecondsFromInput(0)).toBe(60);
    expect(timeoutSecondsFromInput(45)).toBe(2700);
    expect(timeoutSecondsFromInput(999)).toBe(14400);
    expect(timeoutSecondsFromInput(20.4)).toBe(1200);
    expect(timeoutSecondsFromInput(Number.NaN)).toBe(60);
  });

  it('states the exact stored seconds only where the control cannot show them', () => {
    expect(storedTimeoutNote(1200)).toBeNull();
    expect(storedTimeoutNote(14400)).toBeNull();
    expect(storedTimeoutNote(1250)).toBe('Stored as 1250 seconds; kept until you change this field.');
    expect(storedTimeoutNote(36000)).toBe('Stored as 36000 seconds; kept until you change this field.');
  });

  it('a stored value the control cannot express stays pending as stored, and nothing is saved until the user changes the field', () => {
    for (const stored of [1250, 36000]) {
      const saved = pendingFrom(snapshotWith(stored));
      expect(saved.runtime.child_timeout).toBe(stored);
      expect(isDirty(saved, saved)).toBe(false);
      expect(savePayload(saved, saved).runtime).toBeUndefined();
    }
  });

  it('a repopulation emits no change (REQ-CONFIG-419), and the save carries child_timeout only after a user edit', () => {
    const saved = pendingFrom(snapshotWith(1200));
    const again = adoptSnapshot({ saved, pending: saved }, pendingFrom(snapshotWith(1200)), false);
    expect(isDirty(again.saved, again.pending)).toBe(false);
    expect(applyChange(saved, { kind: 'runtime', key: 'child_timeout', value: 1200 })).toBe(saved);
    const edited = applyChange(saved, { kind: 'runtime', key: 'child_timeout', value: timeoutSecondsFromInput(45) });
    expect(isDirty(saved, edited)).toBe(true);
    expect(savePayload(saved, edited).runtime).toEqual({ child_timeout: 2700 });
    // ADR-0037 Tier B: the screen's value, saved or not, is what the next run start reads (REQ-CONFIG-262).
    expect(liveStateOf(edited).runtime?.['child_timeout']).toBe(2700);
  });

  it('draws a third Delegation limits control reading 20 minutes on a default install, with its hint and no stored line', () => {
    const section = limits(render(snapshotWith(1200)));
    expect(section).toContain('<label for="child-timeout">Per-agent timeout</label>');
    expect(section).toMatch(/id="child-timeout"[^>]*min="1"[^>]*max="240"/);
    expect(section).toMatch(/id="child-timeout"[^>]*value="20"/);
    expect(section).toContain('>minutes</span>');
    expect(section).toContain('aria-description="Stored as 1200 seconds."');
    expect(section).toContain('data-testid="child-timeout-hint"');
    expect(section).toMatch(/delegated agent/);
    expect(section).not.toContain('data-testid="child-timeout-stored"');
    expect((section.match(/type="number"/g) ?? []).length).toBe(3);
  });

  it('draws a stored 1250 s as 21 minutes with the exact seconds stated beneath', () => {
    const section = limits(render(snapshotWith(1250)));
    expect(section).toMatch(/id="child-timeout"[^>]*value="21"/);
    expect(section).toContain('data-testid="child-timeout-stored">Stored as 1250 seconds; kept until you change this field.</span>');
  });

  it('states the stored seconds, not an unsaved edit, during an edit (REQ-CONFIG-446, REQ-CONFIG-419)', () => {
    // A stored 3 s, shown clamped as 1 minute, overtyped with 1: the form holds 60 s until Save, the workspace file still 3 s
    // (docs/defects/fixed/a-runtime-timeout-fields-description-states-an-unsaved-value-as-stored.md). Until 2026-10-15 the
    // description read the pending 60.
    const section = limits(render(snapshotWith(3), timeoutSecondsFromInput(1)));
    expect(section).toMatch(/id="child-timeout"[^>]*value="1"/);
    expect(section).toContain('aria-description="Stored as 3 seconds."');
    expect(section).not.toContain('Stored as 60 seconds');
    // The field was changed, so the stored line beneath is gone: the stored value is kept only until then.
    expect(section).not.toContain('data-testid="child-timeout-stored"');
    expect(storedTimeoutNote(3, 60)).toBeNull();
    expect(storedTimeoutNote(3, 3)).toBe('Stored as 3 seconds; kept until you change this field.');
    // After Save the snapshot holds the new value, and the description follows it.
    expect(limits(render(snapshotWith(60)))).toContain('aria-description="Stored as 60 seconds."');
  });
});
