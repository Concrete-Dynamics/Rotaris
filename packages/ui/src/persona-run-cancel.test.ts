import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, RUN_AGENT_ID, type SessionRecord } from '@rotaris/contracts';
import { agentStateLabel, restingView } from './agents.js';
import { createCancelOverlayStore, shownSession } from './cancel-overlay.js';
import { PersonaWindow } from './PersonaWindow.js';

/**
 * REQ-MONITOR-127 / REQ-MONITOR-130 / REQ-MONITOR-296 (acceptance A35, the verifier's finding on its repair): a persona
 * window's Cancel on the run's own instance is the run's cancel, and the window reads the session through the same overlay
 * the Workspace and the Mission view read. The run-level agent is presented through the agent vocabulary, which has no
 * `cancelling` — every busy status maps to `running` — so the overlay's `cancelling` reached no word the window draws and
 * the run's instance read `running` until the record at rest arrived. Its muted state label (REQ-SHELL-075 (a)) and its
 * tab's tooltip now read the run's status while the shown session reads `cancelling` (OQ-165).
 */
const ENTRY = { persona: 'orchestrator', model: 'scripted/alpha', reasoning: 'medium', tools: ['read_file'] } as const;
const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1', executionStatus: 'running', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-10-01T10:00:10.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: null, runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-10-01T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: null,
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 0, agents: 0, byTool: [] }, worktreeBranch: null, wait: null, compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: { resolved: [], called: [], active: [] }, artifacts: [], entryRoots: [], entryStalledSeconds: null, entryToolCalls: null,
  ...over,
});
const render = (shown: SessionRecord) => {
  const { runLevel } = restingView(shown, ENTRY, false);
  return renderToStaticMarkup(createElement(PersonaWindow, {
    persona: ENTRY.persona, session: shown, rows: [], runLevel, declaredTools: [...ENTRY.tools], selectedAgentId: RUN_AGENT_ID, onSelectTab: () => undefined, nowIso: null, compressionThresholdPercent: 60,
    onSteer: async () => ({ ok: true as const }), onCancel: async () => ({ ok: true as const }),
  }));
};
const stateLabel = (html: string) => html.match(/data-testid="persona-agent-state">([^<]*)</)?.[1] ?? '';
const tabTitle = (html: string) => html.match(new RegExp(`data-agent-id="${RUN_AGENT_ID}"[^>]*`))?.[0].match(/title="([^"]*)"/)?.[1] ?? html.match(new RegExp(`title="([^"]*)"[^>]*data-agent-id="${RUN_AGENT_ID}"`))?.[1] ?? '';

describe('REQ-MONITOR-127 / REQ-MONITOR-130: a persona window shows a confirmed run cancel on the run\'s own instance', () => {
  it('reads `cancelling` under the run overlay the window\'s cancel sets, from the confirmation', () => {
    const store = createCancelOverlayStore();
    const record = session();
    expect(store.getState().beginRun(record, '2026-10-01T10:00:20.000Z')).not.toBeNull();
    const html = render(shownSession(record, store.getState())!);
    expect(stateLabel(html)).toBe('cancelling');
    expect(tabTitle(html).startsWith('cancelling · ')).toBe(true);
    // The instance is still live while the run winds down: the dot keeps pulsing (REQ-SHELL-075 (a)).
    expect(html).toContain('agent-row__dot agent-row__dot--running');
  });

  it('reads `cancelling` when the engine\'s own record reads it (the stop writes it)', () => {
    expect(stateLabel(render(session({ executionStatus: 'cancelling' })))).toBe('cancelling');
  });

  it('reads the agent vocabulary otherwise: running before the confirmation, and as the record at rest says after', () => {
    expect(stateLabel(render(session()))).toBe('running');
    expect(stateLabel(render(session({ executionStatus: 'stopped' })))).toBe('cancelled');
    // A refusal: the overlay is gone and the record's own status shows again (REQ-MONITOR-296).
    const store = createCancelOverlayStore();
    const record = session();
    store.getState().refuse(store.getState().beginRun(record, '2026-10-01T10:00:20.000Z')!);
    expect(stateLabel(render(shownSession(record, store.getState())!))).toBe('running');
  });
});

describe('agentStateLabel: only the run\'s own live instance takes the run\'s `cancelling`', () => {
  it('leaves a child in the agent vocabulary while its session reads cancelling', () => {
    const child = { id: 'bg_00000001', presentationState: 'running', live: true } as const;
    expect(agentStateLabel(child, { executionStatus: 'cancelling' })).toBe('running');
    expect(agentStateLabel({ id: RUN_AGENT_ID, presentationState: 'running', live: true }, { executionStatus: 'cancelling' })).toBe('cancelling');
    // In REQ-CHAT-008's recovery state the run-level agent is not live and reads its own presentation.
    expect(agentStateLabel({ id: RUN_AGENT_ID, presentationState: 'cancelled', live: false }, { executionStatus: 'cancelling' })).toBe('cancelled');
    expect(agentStateLabel({ id: RUN_AGENT_ID, presentationState: 'running', live: true }, null)).toBe('running');
  });
});
