import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot } from '@rotaris/contracts';
import { RuntimeSettings, type ConfigSettingsProps } from './ConfigSettings.js';
import { pendingFrom } from './config-state.js';

/**
 * The Runtime category's run-start mode hint (REQ-CONFIG-320, REQ-ORCH-152 narrowed by PD-ORCH-003). Until 2026-09-29
 * it read "The plan gate itself is not built in this version." — the gate has been built since ADR-0062, so the
 * sentence told a user that choosing `plan` does nothing, and it said nothing of a session's release
 * (`docs/defects/fixed/the-run-start-setting-says-the-plan-gate-is-not-built.md`). What a unit test can show is the
 * markup; the built app's reading is `settings-proof`'s run-start launches.
 */
const snapshot: ConfigSnapshot = {
  workspaceRoot: '/ws', loadOk: true, fatal: null,
  slots: [{ slot: 'large_model', value: 'gpt-4o', origin: 'default', thinking: null }],
  models: ['gpt-4o'], imageInputModels: [],
  roles: [],
  runtime: { max_depth: 3, max_active_children: 6, child_timeout: 1200, max_iterations: 20, allow_outside_workspace: false, permission_mode: 'ask', improvement_collector_enabled: true, improvement_collector_timeout: 60, retrospective_timeout: 120, keep_going: false, run_start_mode: 'plan', memory_diagnostics_enabled: false, sandbox_mode: 'off', sandbox_writable_roots: [], sandbox_allow_network: false, network_egress_policy: 'ask', network_allowed_hosts: [], network_denied_hosts: [] },
  rawRuntime: { workspace: null, global: null },
  circuitBreakerEnabled: true, compressorThresholdPercentage: 60, display: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
  skills: { enabled: true, overrides: {}, invocation_overrides: {} }, instructionsPolicy: { overrides: {} }, injectAgentsMd: true, worktreeStorageSubpath: 'worktrees', delegationStrategy: 'orchestrator', instructions: [], referential: [], warnings: [],
  files: { workspace: '/ws/.rotaris/agents.yaml', global: '/cfg/agents.yaml' },
};

const outcome = async () => ({ ok: true as const });
function render(extra: Partial<ConfigSettingsProps> = {}): string {
  const props: ConfigSettingsProps = {
    snapshot, pending: pendingFrom(snapshot), dirty: false, loading: false, error: null, serviceAvailable: true,
    onChange: () => {}, onSave: outcome, onDiscard: () => {}, onSetField: outcome, ...extra,
  };
  return renderToStaticMarkup(createElement(RuntimeSettings, props));
}
/** The hint the run-start control carries — the first hint after the selector — with the markup's entities read back as text. */
function hint(markup: string): { released: string | null; text: string } {
  const after = markup.slice(markup.indexOf('id="run-start-mode"'));
  const m = /<span[^>]*settings__hint[^>]*>(.*?)<\/span>/.exec(after);
  if (!m) throw new Error('the run-start mode control carries no hint');
  expect(m[0]).toContain('data-testid="run-start-hint"');
  const released = /data-released="(true|false)"/.exec(m[0])?.[1] ?? null;
  return { released, text: m[1]!.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&') };
}

describe('the run-start mode hint (REQ-ORCH-152, REQ-CONFIG-320, PD-ORCH-003)', () => {
  it('REQ-ORCH-152: says what `plan` does — the next run held at the plan gate — and never that the gate is not built', () => {
    const { text, released } = hint(render());
    expect(text).not.toMatch(/not built/i);
    expect(text).toMatch(/next run/);
    expect(text).toMatch(/plan gate/);
    expect(text).toMatch(/before it changes anything/);
    // REQ-ORCH-153's answer group is not held, and the hint does not promise that it is.
    expect(text).toMatch(/question or an exploration is not held/);
    expect(released).toBe('false');
    expect(text).not.toMatch(/released/);
  });

  it('PD-ORCH-003: for a followed session holding a release, it states that the session is released and names the gesture that re-arms it', () => {
    const { text, released } = hint(render({ planReleased: true }));
    expect(released).toBe('true');
    expect(text).not.toMatch(/not built/i);
    expect(text).toMatch(/This session is released/);
    expect(text).toMatch(/whatever this setting says/);
    // OQ-137: the settings control defers to Save and re-arms nothing, so the hint names the control that does.
    expect(text).toMatch(/Plan first/);
    expect(text).toMatch(/composer's run-start control/);
  });

  it('a session that holds no release reads as the base hint', () => {
    expect(hint(render({ planReleased: false })).text).toBe(hint(render()).text);
  });
});
