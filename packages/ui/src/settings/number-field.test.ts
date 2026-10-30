import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot } from '@rotaris/contracts';
import { RuntimeSettings, type ConfigSettingsProps } from './ConfigSettings.js';
import { CHILD_TIMEOUT_MINUTES, clampedNumberCommit, clampedNumberEdit, COMPRESSION_THRESHOLD_RANGE, DEPTH_CAP_RANGE, FAN_OUT_RANGE, IMPROVEMENT_TIMEOUT_SECONDS, ITERATION_CAP_RANGE, pendingFrom, type NumberRange } from './config-state.js';
import { DICTATION_CONFIG_DEFAULT } from '@rotaris/contracts';

/**
 * REQ-CONFIG-322 and REQ-CONFIG-325 ("hard widget-level clamping, so out-of-range values are unreachable through the UI"),
 * PD-CONFIG-003 and its revision 2: every Settings › Runtime number field keeps its clamp, and every value inside it can be
 * typed. Until fin34 five of the six clamped each keystroke, so "70" typed into Compression threshold became 50 and then 95,
 * and "4" typed into a cleared Depth cap became 14
 * (`docs/defects/fixed/a-settings-number-field-clamps-every-keystroke-so-some-values-cannot-be-typed.md`).
 */
const FIELDS: readonly (readonly [string, NumberRange])[] = [
  ['max-depth', DEPTH_CAP_RANGE], ['max-active', FAN_OUT_RANGE], ['child-timeout', CHILD_TIMEOUT_MINUTES],
  ['improvement-timeout', IMPROVEMENT_TIMEOUT_SECONDS], ['threshold', COMPRESSION_THRESHOLD_RANGE], ['iterations', ITERATION_CAP_RANGE],
];

/**
 * A person selecting the field and typing `keys` one by one, then leaving it: each keystroke appends to what the field shows
 * (a controlled input shows the draft, or the last committed value), and leaving it commits a held draft. Returns every
 * value the field committed, in order.
 */
function typeInto(range: NumberRange, keys: string): number[] {
  const committed: number[] = [];
  let shown = '';
  let draft: string | null = '';
  for (const key of keys) {
    const edit = clampedNumberEdit(shown + key, range);
    if ('commit' in edit) { draft = null; committed.push(edit.commit); shown = String(edit.commit); } else { draft = edit.draft; shown = edit.draft; }
  }
  if (draft !== null) committed.push(clampedNumberCommit(draft, range));
  return committed;
}

describe('a Settings number field — REQ-CONFIG-322, REQ-CONFIG-325, PD-CONFIG-003', () => {
  it('every value inside each field\'s range can be typed into the cleared field, and the last value committed is that value', () => {
    for (const [, range] of FIELDS) {
      for (let v = range.min; v <= range.max; v += 1) expect(typeInto(range, String(v)).at(-1)).toBe(v);
    }
  });

  it('the cases the note names: 70 into Compression threshold, 4 into Depth cap, 45 into Per-agent timeout', () => {
    expect(typeInto(COMPRESSION_THRESHOLD_RANGE, '70')).toEqual([70]);
    expect(typeInto(DEPTH_CAP_RANGE, '4')).toEqual([4]);
    expect(typeInto(CHILD_TIMEOUT_MINUTES, '45')).toEqual([4, 45]);
  });

  it('no value outside a field\'s range is ever committed: a draft past the bounds is clamped when the field is left', () => {
    for (const [, range] of FIELDS) {
      for (const keys of ['0', '9999', '', '-3', '2.5', String(range.max + 1), String(range.min - 1)]) {
        for (const v of typeInto(range, keys)) {
          expect(v).toBeGreaterThanOrEqual(range.min);
          expect(v).toBeLessThanOrEqual(range.max);
          expect(Number.isInteger(v)).toBe(true);
        }
      }
    }
    expect(clampedNumberCommit('9999', ITERATION_CAP_RANGE)).toBe(500);
    expect(clampedNumberCommit('', COMPRESSION_THRESHOLD_RANGE)).toBe(50);
    expect(clampedNumberCommit('2.5', DEPTH_CAP_RANGE)).toBe(3);
  });

  it('every Runtime number field is drawn as the clamped field, with its range on the input', () => {
    const snapshot = {
      workspaceRoot: '/ws', loadOk: true, fatal: null, slots: [], models: [], imageInputModels: [], roles: [],
      runtime: { max_depth: 3, max_active_children: 6, child_timeout: 1200, max_iterations: 20, allow_outside_workspace: false, permission_mode: 'ask', improvement_collector_enabled: true, improvement_collector_timeout: 60, retrospective_timeout: 120, keep_going: false, run_start_mode: 'auto', memory_diagnostics_enabled: false, sandbox_mode: 'off', sandbox_writable_roots: [], sandbox_allow_network: false, network_egress_policy: 'ask', network_allowed_hosts: [], network_denied_hosts: [] },
      rawRuntime: { workspace: null, global: null }, circuitBreakerEnabled: true, compressorThresholdPercentage: 60,
      display: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
      skills: { enabled: true, overrides: {}, invocation_overrides: {} }, instructionsPolicy: { overrides: {} }, dictation: DICTATION_CONFIG_DEFAULT, injectAgentsMd: true, worktreeStorageSubpath: 'worktrees', delegationStrategy: 'orchestrator', instructions: [], referential: [], warnings: [],
      files: { workspace: '/ws/.rotaris/agents.yaml', global: '/cfg/agents.yaml' },
    } as ConfigSnapshot;
    const props: ConfigSettingsProps = { snapshot, pending: pendingFrom(snapshot), dirty: false, loading: false, error: null, serviceAvailable: true, onChange: () => {}, onSave: async () => ({ ok: true as const }), onDiscard: () => {}, onSetField: async () => ({ ok: true as const }) };
    const markup = renderToStaticMarkup(createElement(RuntimeSettings, props));
    for (const [id, range] of FIELDS) {
      const input = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(markup)?.[0] ?? '';
      expect(input, id).toContain('data-clamped-number=""');
      expect(input, id).toContain(`min="${range.min}"`);
      expect(input, id).toContain(`max="${range.max}"`);
    }
  });
});
