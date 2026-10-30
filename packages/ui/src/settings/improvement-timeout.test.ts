import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DESKTOP_SAVE_RUNTIME_KEYS, type ConfigSnapshot, DICTATION_CONFIG_DEFAULT } from '@rotaris/contracts';
import { RuntimeSettings, type ConfigSettingsProps } from './ConfigSettings.js';
import { adoptSnapshot, applyChange, IMPROVEMENT_TIMEOUT_SECONDS, improvementTimeoutEdit, improvementTimeoutForDisplay, improvementTimeoutFromInput, isDirty, liveStateOf, pendingFrom, savePayload, storedImprovementTimeoutNote } from './config-state.js';

/**
 * PD-CONFIG-003 revision 2 (OQ-223, the R-072 consortium's IT1): Settings › Runtime › Runtime policy keeps "Improvement
 * analysis timeout" directly after the "Improvement loop" toggle — whole seconds with a "seconds" suffix, clamped 10–600 at
 * the widget, a stored value outside that range shown clamped with its seconds stated beneath and kept until the field
 * changes. Before, the control took any positive number, had no suffix, a hint naming "the collector", and wrote a key no
 * Settings list named (`docs/defects/fixed/the-improvement-analysis-timeout-control-writes-a-key-no-settings-list-names.md`).
 */
const runtime = (improvementTimeout: number): ConfigSnapshot['runtime'] => ({ max_depth: 3, max_active_children: 6, child_timeout: 1200, max_iterations: 20, allow_outside_workspace: false, permission_mode: 'ask', improvement_collector_enabled: true, improvement_collector_timeout: improvementTimeout, retrospective_timeout: 120, keep_going: false, run_start_mode: 'auto', memory_diagnostics_enabled: false, sandbox_mode: 'off', sandbox_writable_roots: [], sandbox_allow_network: false, network_egress_policy: 'ask', network_allowed_hosts: [], network_denied_hosts: [] });
const snapshotWith = (improvementTimeout: number): ConfigSnapshot => ({
  workspaceRoot: '/ws', loadOk: true, fatal: null,
  slots: [{ slot: 'large_model', value: 'gpt-4o', origin: 'default', thinking: null }],
  models: ['gpt-4o'], imageInputModels: [],
  roles: [],
  runtime: runtime(improvementTimeout),
  rawRuntime: { workspace: null, global: null },
  circuitBreakerEnabled: true, compressorThresholdPercentage: 60, display: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
  skills: { enabled: true, overrides: {}, invocation_overrides: {} }, instructionsPolicy: { overrides: {} }, dictation: DICTATION_CONFIG_DEFAULT, injectAgentsMd: true, worktreeStorageSubpath: 'worktrees', delegationStrategy: 'orchestrator', instructions: [], referential: [], warnings: [],
  files: { workspace: '/ws/.rotaris/agents.yaml', global: '/cfg/agents.yaml' },
});
const outcome = async () => ({ ok: true as const });
function render(snapshot: ConfigSnapshot, edit?: number): string {
  const saved = pendingFrom(snapshot);
  const pending = edit === undefined ? saved : applyChange(saved, { kind: 'runtime', key: 'improvement_collector_timeout', value: edit });
  const props: ConfigSettingsProps = {
    snapshot, pending, dirty: pending !== saved, loading: false, error: null, serviceAvailable: true,
    onChange: () => {}, onSave: outcome, onDiscard: () => {}, onSetField: outcome,
  };
  return renderToStaticMarkup(createElement(RuntimeSettings, props));
}
/** The Runtime policy card's markup, from its heading on. */
const policy = (markup: string): string => markup.slice(markup.indexOf('Runtime policy'));

describe('the improvement analysis timeout control (PD-CONFIG-003 revision 2, REQ-CONFIG-118, REQ-LIBRARY-039)', () => {
  it('is clamped 10–600 seconds at the widget, for display and for entry', () => {
    expect(IMPROVEMENT_TIMEOUT_SECONDS).toEqual({ min: 10, max: 600 });
    expect(improvementTimeoutForDisplay(60)).toBe(60);
    expect(improvementTimeoutForDisplay(5)).toBe(10);
    expect(improvementTimeoutForDisplay(900)).toBe(600);
    expect(improvementTimeoutFromInput(700)).toBe(600);
    expect(improvementTimeoutFromInput(5)).toBe(10);
    expect(improvementTimeoutFromInput(120.4)).toBe(120);
    expect(improvementTimeoutFromInput(Number.NaN)).toBe(10);
  });

  it('commits a keystroke only when it makes a whole number within 10–600; anything else is held until the field loses focus', () => {
    // Typing 120 into a cleared field: "1" and "" are drafts, "12" and "120" are values (driven in the built app, where
    // clamping each keystroke turned "120" into 10, then 102, then 600).
    expect(improvementTimeoutEdit('1')).toEqual({ draft: '1' });
    expect(improvementTimeoutEdit('12')).toEqual({ commit: 12 });
    expect(improvementTimeoutEdit('120')).toEqual({ commit: 120 });
    expect(improvementTimeoutEdit('')).toEqual({ draft: '' });
    expect(improvementTimeoutEdit('700')).toEqual({ draft: '700' });
    expect(improvementTimeoutEdit('12.5')).toEqual({ draft: '12.5' });
    // On blur a draft is clamped: 700 → 600, 5 → 10, an empty field → 10.
    expect(improvementTimeoutFromInput(Number('700'))).toBe(600);
    expect(improvementTimeoutFromInput(Number.NaN)).toBe(10);
  });

  it('states the stored seconds only where the control cannot show them', () => {
    expect(storedImprovementTimeoutNote(60)).toBeNull();
    expect(storedImprovementTimeoutNote(600)).toBeNull();
    expect(storedImprovementTimeoutNote(5)).toBe('Stored as 5 seconds; kept until you change this field.');
    expect(storedImprovementTimeoutNote(900)).toBe('Stored as 900 seconds; kept until you change this field.');
  });

  it('draws the control directly after the Improvement loop toggle, reading 60 seconds on a default install, with its hint and no stored line', () => {
    const card = policy(render(snapshotWith(60)));
    const toggle = card.indexOf('Improvement loop');
    const control = card.indexOf('<label for="improvement-timeout">Improvement analysis timeout</label>');
    expect(toggle).toBeGreaterThan(-1);
    expect(control).toBeGreaterThan(toggle);
    expect(card.indexOf('Keep going')).toBeGreaterThan(control);
    expect(card).toMatch(/id="improvement-timeout"[^>]*min="10"[^>]*max="600"/);
    expect(card).toMatch(/id="improvement-timeout"[^>]*value="60"/);
    expect(card).toContain('aria-description="Stored as 60 seconds."');
    expect(card).toMatch(/id="improvement-timeout"[^>]*\/><span class="text-secondary">seconds<\/span>/);
    const hint = /data-testid="improvement-timeout-hint">([^<]*)</.exec(card)?.[1] ?? '';
    expect(hint).toMatch(/background review of a finished run/);
    expect(hint).toMatch(/no proposals/);
    expect(hint).toMatch(/never holds up your work/);
    expect(hint).toMatch(/improvement loop is on/);
    expect(hint).toMatch(/runs started from now/);
    expect(hint).not.toMatch(/collector/);
    expect(card).not.toContain('data-testid="improvement-timeout-stored"');
  });

  it('draws a stored 5 as 10 and a stored 900 as 600, each with its exact seconds beneath, and the form left clean', () => {
    for (const [stored, shown] of [[5, 10], [900, 600]] as const) {
      const card = policy(render(snapshotWith(stored)));
      expect(card).toMatch(new RegExp(`id="improvement-timeout"[^>]*value="${shown}"`));
      expect(card).toContain(`data-testid="improvement-timeout-stored">Stored as ${stored} seconds; kept until you change this field.</span>`);
      const saved = pendingFrom(snapshotWith(stored));
      expect(saved.runtime.improvement_collector_timeout).toBe(stored);
      expect(isDirty(saved, saved)).toBe(false);
      expect(savePayload(saved, saved).runtime).toBeUndefined();
    }
  });

  it('a repopulation emits no change (REQ-CONFIG-419); the save carries the key only after an edit, and the live state carries it (REQ-CONFIG-262)', () => {
    const saved = pendingFrom(snapshotWith(60));
    const again = adoptSnapshot({ saved, pending: saved }, pendingFrom(snapshotWith(60)), false);
    expect(isDirty(again.saved, again.pending)).toBe(false);
    expect(savePayload(saved, saved).runtime).toBeUndefined();
    const edited = applyChange(saved, { kind: 'runtime', key: 'improvement_collector_timeout', value: improvementTimeoutFromInput(120) });
    expect(savePayload(saved, edited).runtime).toEqual({ improvement_collector_timeout: 120 });
    expect(liveStateOf(edited).runtime?.['improvement_collector_timeout']).toBe(120);
  });

  it('states the stored seconds, not an unsaved edit, during an edit (REQ-CONFIG-446, REQ-CONFIG-419)', () => {
    // A stored 5 s, shown clamped as 10, overtyped with 300: the form holds 300 s until Save, the workspace file still 5 s
    // (docs/defects/fixed/a-runtime-timeout-fields-description-states-an-unsaved-value-as-stored.md). Until 2026-10-15 the
    // description read the pending 300.
    const card = policy(render(snapshotWith(5), improvementTimeoutFromInput(300)));
    expect(card).toMatch(/id="improvement-timeout"[^>]*value="300"/);
    expect(card).toContain('aria-description="Stored as 5 seconds."');
    expect(card).not.toContain('Stored as 300 seconds');
    expect(card).not.toContain('data-testid="improvement-timeout-stored"');
    expect(storedImprovementTimeoutNote(5, 300)).toBeNull();
    expect(storedImprovementTimeoutNote(5, 5)).toBe('Stored as 5 seconds; kept until you change this field.');
    expect(policy(render(snapshotWith(300)))).toContain('aria-description="Stored as 300 seconds."');
  });

  it("the screen's runtime keys are exactly the desktop save's (REQ-CONFIG-256's closed list)", () => {
    expect(Object.keys(pendingFrom(snapshotWith(60)).runtime).sort()).toEqual([...DESKTOP_SAVE_RUNTIME_KEYS].sort());
  });
});
