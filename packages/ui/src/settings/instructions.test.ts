import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot } from '@rotaris/contracts';
import { InstructionsSettings } from './Inventories.js';

/**
 * PD-WORKSPACE-002 — the Instructions category as a surface. What is asserted here is the pair the
 * switch cannot show on its own: a row reads the per-file POLICY rather than its resolved `enabled`,
 * and the master switch being off is said in words instead of being mistaken for every file being off.
 */
const snapshot = (over: Partial<ConfigSnapshot> = {}): ConfigSnapshot => ({
  workspaceRoot: 'C:/ws', loadOk: true, fatal: null, slots: [], models: [], imageInputModels: [], roles: [],
  personas: [], mcp: { servers: [], sources: [] }, hooks: { entries: [] }, initialization: null, projectInit: null,
  requirements: null, checkpoints: null, integration: null, verifier: null, transcript: null,
  runtime: { max_depth: 3, max_active_children: 6, max_iterations: 20, allow_outside_workspace: false, permission_mode: 'ask', improvement_collector_enabled: true, improvement_collector_timeout: 60, retrospective_timeout: 120, keep_going: false, run_start_mode: 'auto', memory_diagnostics_enabled: false, sandbox_mode: 'off', sandbox_writable_roots: [], sandbox_allow_network: false, network_egress_policy: 'ask', network_allowed_hosts: [], network_denied_hosts: [] },
  rawRuntime: { workspace: null, global: null },
  circuitBreakerEnabled: true, compressorThresholdPercentage: 60,
  display: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
  skills: { enabled: true, overrides: {}, invocation_overrides: {} },
  instructionsPolicy: { overrides: {} }, injectAgentsMd: true,
  delegationStrategy: 'orchestrator', referential: [], warnings: [],
  instructions: [
    { id: 'workspace:AGENTS.md', name: 'AGENTS.md', path: 'C:/ws/AGENTS.md', source: 'workspace', enabled: true },
    { id: 'global:CLAUDE.md', name: 'CLAUDE.md', path: 'C:/cfg/CLAUDE.md', source: 'global', enabled: true },
  ],
  files: { workspace: 'C:/ws/.rotaris/agents.yaml', global: 'C:/cfg/agents.yaml' },
  ...over,
} as ConfigSnapshot);

const draw = (s: ConfigSnapshot | null, pending?: Record<string, 'on' | 'off'>) =>
  renderToStaticMarkup(createElement(InstructionsSettings, { snapshot: s, workspace: 'C:/ws', onToggle: () => undefined, ...(pending ? { pending } : {}) }));

describe('the Instructions category (PD-WORKSPACE-002)', () => {
  it('lists every present file with its source and absolute path, each row carrying a switch', () => {
    const html = draw(snapshot());
    expect(html).toContain('data-id="workspace:AGENTS.md"');
    expect(html).toContain('data-id="global:CLAUDE.md"');
    expect(html).toContain('C:/cfg/CLAUDE.md');
    expect((html.match(/data-testid="instruction-toggle"/g) ?? []).length).toBe(2);
  });

  it('a switch shows the per-file policy, and a pending choice wins over the saved one', () => {
    const off = draw(snapshot({ instructionsPolicy: { overrides: { 'global:CLAUDE.md': 'off' } } }));
    expect(off).toContain('data-id="global:CLAUDE.md" data-on="false"');
    expect(off).toContain('data-id="workspace:AGENTS.md" data-on="true"');
    const pending = draw(snapshot(), { 'workspace:AGENTS.md': 'off' });
    expect(pending).toContain('data-id="workspace:AGENTS.md" data-on="false"');
  });

  it('REQ-WORKSPACE-048: with the master switch off the screen says so and the switches still read their policy', () => {
    // `enabled` is false for every row when injection is off — a switch drawn from it would read off
    // for a file the user never touched, which is the state this sentence exists to tell apart.
    const html = draw(snapshot({
      injectAgentsMd: false,
      instructions: snapshot().instructions.map((f) => ({ ...f, enabled: false })),
    }));
    expect(html).toContain('data-testid="instructions-master-off"');
    expect(html).toContain('inject_agents_md: true');
    expect(html).toContain('data-id="workspace:AGENTS.md" data-on="true"');
  });

  it('with injection on the sentence is absent, and with no files the empty state names the file to create', () => {
    expect(draw(snapshot())).not.toContain('instructions-master-off');
    const empty = draw(snapshot({ instructions: [] }));
    expect(empty).toContain('data-testid="inventory-empty"');
    expect(empty).toContain('Create AGENTS.md in C:/ws');
  });
});
