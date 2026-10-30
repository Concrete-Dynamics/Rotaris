import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, PRIMARY_VIEWS, type AgentRecord, type ConfigSnapshot, type SessionRecord, DICTATION_CONFIG_DEFAULT } from '@rotaris/contracts';
import { AgentTable } from './AgentTable.js';
import { AgentTree } from './AgentTree.js';
import { perAgentTimeoutPath, runLevelAgent, TIMED_OUT_TAG, timeoutLimitText, timeoutLine } from './agents.js';
import { Inspector } from './Inspector.js';
import { PersonaWindow } from './PersonaWindow.js';
import { SETTINGS_CATEGORIES } from './SettingsView.js';
import { RuntimeSettings, type ConfigSettingsProps } from './settings/ConfigSettings.js';
import { pendingFrom } from './settings/config-state.js';

/**
 * PD-CONFIG-003 revision 3 (OQ-234, the R-072 consortium's CN1), the repair of
 * docs/defects/fixed/a-child-cut-off-at-its-per-agent-timeout-reads-only-failed.md: a delegated agent its per-agent timeout
 * stopped read `failed` and nothing else on every surface (the final duress live run at `a68f121`, `bg_dcecf655` and
 * `bg_98fa54d7`), and nothing named the control that moves the limit. Now the tree row and the Mission-table row carry a
 * "timed out" tag after the state, and the inspector (under its meta line) and the persona window's instance tab (under its
 * state) carry one line, worded once, whose path is the labels Settings renders.
 */
const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_dcecf655', name: 'wave3-verify-all', givenName: 'Verify all', persona: 'tester', state: 'failed', presentationState: 'failed', parentId: 'root:1', dependencies: [], activity: 'verify the whole result', model: 'scripted/alpha',
  depth: 1, background: true, category: '', spawnedAt: '2026-09-05T10:00:00.000Z', completedAt: '2026-09-05T10:20:04.000Z', toolCalls: 58, delegationTask: 'verify the whole result', reasoning: 'medium', contextUsed: 1000, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: ['read_file'], grantRecorded: true, calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: false, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, stalledSeconds: null, timedOut: null, ...over,
});
const session = (agents: AgentRecord[]): SessionRecord => ({
  id: 's1', executionStatus: 'completed', workspaceRoot: '/ws', createdAt: 'x', updatedAt: '2026-09-05T10:30:00.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents, pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: null, runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-09-05T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, sandboxBackend: '', backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: null,
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 0, agents: 0, byTool: [] }, worktreeBranch: null, wait: null, modelOverrides: [], excludedModels: [], compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: { resolved: [], called: [], active: [] }, artifacts: [], entryRoots: [], entryPersona: null, entryModelKey: null, entryStalledSeconds: null, entryToolCalls: null, compressions: 0,
});
const NOW = '2026-09-05T10:30:00.000Z';
const tree = (a: AgentRecord) => renderToStaticMarkup(createElement(AgentTree, { agents: [a], selected: null, onSelect: () => undefined, nowIso: NOW }));
const table = (a: AgentRecord) => renderToStaticMarkup(createElement(AgentTable, { agents: [a], selected: null, nowIso: NOW, onSelect: () => undefined, onOpen: () => undefined, onPopOut: () => undefined }));
const inspector = (a: AgentRecord) => renderToStaticMarkup(createElement(Inspector, {
  session: session([a]), rows: [], personas: [], runLevel: null, selectedAgentId: a.id, onSelect: () => undefined, models: [], compressionThresholdPercent: 60, runActive: false, resting: false, nowIso: NOW,
  onSteer: () => undefined, onCancel: () => undefined, onPopOut: () => undefined,
}));
const persona = (a: AgentRecord) => renderToStaticMarkup(createElement(PersonaWindow, {
  persona: a.persona, session: session([a]), rows: [], runLevel: null, declaredTools: [], selectedAgentId: a.id, onSelectTab: () => undefined, nowIso: NOW, compressionThresholdPercent: 60,
  onSteer: async () => ({ ok: true as const }), onCancel: async () => ({ ok: true as const }),
}));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'");
/** The text of the element carrying the test id, its own inline spans included. */
const byTestId = (html: string, id: string) => text(html).match(new RegExp(`data-testid="${id}"[^>]*>((?:[^<]|<span[^>]*>[^<]*</span>)*)<`))?.[1]?.replace(/<[^>]+>/g, '') ?? null;

const PROGRESS = agent({ timedOut: { limitSeconds: 1200, makingProgress: true } });
const IDLE = agent({ id: 'bg_98fa54d7', name: 'wave3b-finish-verification', timedOut: { limitSeconds: 1250, makingProgress: false } });
const OTHER = agent({ id: 'bg_00000003', name: 'other-failure' });

describe('PD-CONFIG-003 revision 3: the wording, once', () => {
  it('writes the limit in whole minutes where it is one, else in seconds', () => {
    expect(timeoutLimitText(60)).toBe('1 minute');
    expect(timeoutLimitText(1200)).toBe('20 minutes');
    expect(timeoutLimitText(2700)).toBe('45 minutes');
    expect(timeoutLimitText(1250)).toBe('1250 seconds');
    expect(timeoutLimitText(30)).toBe('30 seconds');
    expect(timeoutLimitText(1)).toBe('1 second');
  });

  it('says "while making progress" exactly when the report carried the cut-off statement', () => {
    expect(timeoutLine({ limitSeconds: 1200, makingProgress: true })).toBe('Cut off at its per-agent timeout of 20 minutes while making progress. Settings › Runtime › Per-agent timeout sets this limit for runs started from now.');
    expect(timeoutLine({ limitSeconds: 1250, makingProgress: false })).toBe('Cut off at its per-agent timeout of 1250 seconds. Settings › Runtime › Per-agent timeout sets this limit for runs started from now.');
    expect(TIMED_OUT_TAG).toBe('timed out');
  });

  it('names the control by the labels Settings renders: the rail\'s view, the category and the control', () => {
    const [settings, runtime, control] = perAgentTimeoutPath().split(' › ');
    expect(settings).toBe(PRIMARY_VIEWS.find((v) => v.id === 'settings')!.label);
    expect(runtime).toBe(SETTINGS_CATEGORIES.find((c) => c.id === 'runtime')!.label);
    const markup = renderToStaticMarkup(createElement(RuntimeSettings, settingsProps()));
    expect(markup).toContain(`<h1 class="display">${runtime}</h1>`);
    expect(markup).toContain(`<label for="child-timeout">${control}</label>`);
  });

  it('the run-level agent is never cut off by the per-agent timeout', () => {
    const run = runLevelAgent({ ...session([PROGRESS]), executionStatus: 'failed' }, { persona: 'orchestrator', model: 'scripted/alpha', reasoning: 'medium', tools: [] }, false);
    expect(run?.timedOut).toBeNull();
  });
});

describe('PD-CONFIG-003 revision 3: where a cut-off agent shows', () => {
  it('the tree row and the Mission-table row carry a `tag-fail` "timed out" after the state, titled with the line', () => {
    for (const html of [tree(PROGRESS), table(PROGRESS)]) {
      expect(byTestId(html, 'agent-timed-out')).toBe('timed out');
      const tag = text(html).match(/<span class="([^"]*)"[^>]*data-testid="agent-timed-out"[^>]*>/);
      expect(tag?.[1]).toMatch(/\btag-fail\b/);
      expect(tag?.[0]).toContain(`title="${timeoutLine(PROGRESS.timedOut!)}"`);
      expect(tag?.[0]).toContain(`aria-description="${timeoutLine(PROGRESS.timedOut!)}"`);
    }
    // After the state: the tree's meta label reads `failed · <elapsed>` and then the tag, on a line of its own (stacked).
    expect(text(tree(PROGRESS))).toMatch(/class="agent-row__meta mono agent-row__meta--stacked">failed · 20m 4s <span class="[^"]*\btag-fail\b[^"]*"[^>]*data-testid="agent-timed-out"/);
    expect(text(table(PROGRESS))).toMatch(/<span class="agent-table__state-text">failed<\/span> <span class="[^"]*\btag-fail\b[^"]*"[^>]*data-testid="agent-timed-out"/);
    // REQ-MONITOR-041's row tooltip is unchanged: the delegation task.
    expect(text(tree(PROGRESS))).toContain('title="verify the whole result"');
  });

  it('the inspector carries the line directly under its meta line, whose form is unchanged', () => {
    const html = text(inspector(PROGRESS));
    expect(byTestId(html, 'inspector-meta')).toBe('failed · 20m 4s · 58 tool calls');
    expect(byTestId(html, 'inspector-timeout')).toBe(timeoutLine(PROGRESS.timedOut!));
    expect(html).toMatch(/data-testid="inspector-meta">[^<]*<\/div><div class="inspector__timeout text-secondary" data-testid="inspector-timeout">/);
    // The control's path stays on one line.
    expect(html).toContain('<span class="agent-timeout__path">Settings \u203a Runtime \u203a Per-agent timeout</span>');
    expect(byTestId(text(inspector(IDLE)), 'inspector-timeout')).toBe('Cut off at its per-agent timeout of 1250 seconds. Settings › Runtime › Per-agent timeout sets this limit for runs started from now.');
  });

  it('the persona window\'s instance tab carries the line directly under its state', () => {
    const html = text(persona(PROGRESS));
    expect(byTestId(html, 'persona-timeout')).toBe(timeoutLine(PROGRESS.timedOut!));
    expect(html).toMatch(/data-testid="persona-agent-state">failed<\/span><\/div><div class="persona-window__timeout text-secondary" data-testid="persona-timeout">/);
  });

  it('an agent that failed for any other reason, or did not fail, shows neither', () => {
    for (const a of [OTHER, agent({ state: 'succeeded', presentationState: 'done' }), agent({ state: 'running', presentationState: 'running', live: true, completedAt: null })]) {
      for (const html of [tree(a), table(a), inspector(a), persona(a)]) {
        expect(html).not.toContain('agent-timed-out');
        expect(html).not.toContain('inspector-timeout');
        expect(html).not.toContain('persona-timeout');
        expect(html).not.toContain('per-agent timeout');
      }
    }
  });
});

function settingsProps(): ConfigSettingsProps {
  const snapshot: ConfigSnapshot = {
    workspaceRoot: '/ws', loadOk: true, fatal: null,
    slots: [{ slot: 'large_model', value: 'gpt-4o', origin: 'default', thinking: null }],
    models: ['gpt-4o'], imageInputModels: [],
    roles: [],
    runtime: { max_depth: 3, max_active_children: 6, child_timeout: 1200, max_iterations: 20, allow_outside_workspace: false, permission_mode: 'ask', improvement_collector_enabled: true, improvement_collector_timeout: 60, retrospective_timeout: 120, keep_going: false, run_start_mode: 'auto', memory_diagnostics_enabled: false, sandbox_mode: 'off', sandbox_writable_roots: [], sandbox_allow_network: false, network_egress_policy: 'ask', network_allowed_hosts: [], network_denied_hosts: [] },
    rawRuntime: { workspace: null, global: null },
    circuitBreakerEnabled: true, compressorThresholdPercentage: 60, display: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 },
    skills: { enabled: true, overrides: {}, invocation_overrides: {} }, instructionsPolicy: { overrides: {} }, dictation: DICTATION_CONFIG_DEFAULT, injectAgentsMd: true, worktreeStorageSubpath: 'worktrees', delegationStrategy: 'orchestrator', instructions: [], referential: [], warnings: [],
    files: { workspace: '/ws/.rotaris/agents.yaml', global: '/cfg/agents.yaml' },
  };
  const outcome = async () => ({ ok: true as const });
  return { snapshot, pending: pendingFrom(snapshot), dirty: false, loading: false, error: null, serviceAvailable: true, onChange: () => {}, onSave: outcome, onDiscard: () => {}, onSetField: outcome };
}
