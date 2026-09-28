import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, RUN_AGENT_ID, type AgentRecord, type SessionRecord } from '@rotaris/contracts';
import { MissionView, missionCancelBody, missionConfirmation } from './MissionView.js';
import { CANCEL_RUN_TEXT } from './agents.js';
import { Inspector } from './Inspector.js';

/**
 * PD-ORCH-005 clause 16 (revision 4, OQ-74): "A `paused` child SHALL offer Cancel wherever a live agent offers it." What a
 * unit test can prove is the markup — which Cancel is enabled for which agent of a resting session; the click, the
 * confirmation and the engine's answer are driven against the built product (`pnpm app:drive`), since vitest has no DOM.
 */
const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_00000001', name: 'one', givenName: 'one', persona: 'coding-agent', state: 'paused', presentationState: 'paused', parentId: 'bg_0000root', dependencies: [], activity: 'TASK: one', model: 'm',
  depth: 1, background: true, category: '', spawnedAt: '2026-09-28T10:00:00.000Z', completedAt: null, toolCalls: 1, delegationTask: 'TASK: one', reasoning: 'medium', contextUsed: 0, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: [], calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: false, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: 'pause', ...over,
});
const paused = agent({});
const grand = agent({ id: 'bg_00000002', name: 'grand', parentId: 'bg_00000001', depth: 2 });
const finished = agent({ id: 'bg_00000003', name: 'done-one', state: 'succeeded', presentationState: 'done', completedAt: '2026-09-28T10:01:00.000Z', interruption: null });
const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1', executionStatus: 'paused', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-09-28T10:05:00.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [paused, grand, finished], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: 'user_cancelled', runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-09-28T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: { iteration: 1, agents: 3 },
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 0, agents: 0, byTool: [] }, worktreeBranch: null, wait: null, compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, ...over,
});
const ok = async () => ({ ok: true as const });
/** The inspector as the Workspace draws it for a resting session: no run active (REQ-MONITOR-063's gate), resting. */
const inspector = (selected: string, over: { runActive?: boolean; resting?: boolean; session?: SessionRecord } = {}) => renderToStaticMarkup(createElement(Inspector, {
  session: over.session ?? session(), rows: [], personas: [], runLevel: null, selectedAgentId: selected, onSelect: () => undefined, models: [], compressionThresholdPercent: 60, runActive: over.runActive ?? false, resting: over.resting ?? true, nowIso: null,
  onSteer: () => undefined, onCancel: () => undefined, onPopOut: () => undefined,
}));
const mission = (selected: string, over: { resting?: boolean; session?: SessionRecord; runLevel?: AgentRecord | null } = {}) => renderToStaticMarkup(createElement(MissionView, {
  session: over.session ?? session(), sessionLabel: null, runLevel: over.runLevel ?? null, resting: over.resting ?? true, selectedAgentId: selected, onSelect: () => undefined, nowIso: null, strategy: null, maxDepth: null,
  onSetStrategy: ok, onSetDepth: ok, onPause: ok, onCancelAgent: ok, onCancelRun: ok, onOpen: () => undefined, onPopOut: () => undefined,
}));
/** The attributes of the one button a test id names. */
const button = (html: string, testId: string) => html.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? '';

describe('PD-ORCH-005 clause 16 (revision 4, OQ-74): a paused child offers Cancel wherever a live agent offers it', () => {
  it('the inspector enables Cancel for a paused child of a resting session and counts its paused descendant; a finished one stays disabled', () => {
    const html = inspector(paused.id);
    expect(button(html, 'inspector-cancel')).toMatch(/^<button/);
    expect(button(html, 'inspector-cancel')).not.toContain('disabled');
    expect(button(html, 'inspector-cancel')).toContain('title="Cancel one"');
    expect(html).toContain('Cancelling cascades to 1 paused descendant.');
    expect(button(inspector(finished.id), 'inspector-cancel')).toContain('disabled');
  });

  it('the Mission view enables "Cancel selection" for a paused child with no run active, and its confirmation says the child will not resume', () => {
    expect(button(mission(paused.id), 'mission-cancel')).toMatch(/^<button/);
    expect(button(mission(paused.id), 'mission-cancel')).not.toContain('disabled');
    expect(button(mission(finished.id), 'mission-cancel')).toContain('disabled');
    expect(missionCancelBody(paused, [agent({ presentationState: 'paused' })])).toBe('one (coding-agent) will be cancelled and will not resume. Cancelling cascades to 1 paused descendant.');
    expect(missionCancelBody(agent({ presentationState: 'running' }), [])).toBe('one (coding-agent) will be cancelled. Nothing cascades.');
  });
});

describe('PD-ORCH-005 clauses 13 and 16 (revision 4, OQ-73/OQ-74): the Mission view and the inspector offer a paused child\'s Cancel only while its session rests', () => {
  /** The run-level agent as `runLevelAgent` presents it while the session rests (clause 13). */
  const restingRun = agent({ id: RUN_AGENT_ID, name: 'orchestrator', persona: 'orchestrator', parentId: '', depth: 0, interruption: null });
  it('in REQ-CHAT-008\'s recovery state the persisted status reads busy, yet the resting run-level agent offers no "Cancel selection" — the engine would refuse it', () => {
    const recovery = session({ executionStatus: 'running' });
    expect(button(mission(RUN_AGENT_ID, { session: recovery, runLevel: restingRun }), 'mission-cancel')).toContain('disabled');
    // …while a paused child of the same session offers it.
    expect(button(mission(paused.id, { session: recovery, runLevel: restingRun }), 'mission-cancel')).not.toContain('disabled');
  });
  it('a live run\'s run-level agent still offers it', () => {
    const live = agent({ id: RUN_AGENT_ID, name: 'orchestrator', persona: 'orchestrator', parentId: '', depth: 0, state: 'running', presentationState: 'running', live: true, interruption: null });
    expect(button(mission(RUN_AGENT_ID, { session: session({ executionStatus: 'running' }), runLevel: live, resting: false }), 'mission-cancel')).not.toContain('disabled');
  });
  it('while a run is active and the session does not rest — a `pausing` run bringing its agents to rest — a paused child offers no Cancel', () => {
    const pausing = session({ executionStatus: 'pausing' });
    expect(button(mission(paused.id, { session: pausing, resting: false }), 'mission-cancel')).toContain('disabled');
    expect(button(inspector(paused.id, { session: pausing, runActive: true, resting: false }), 'inspector-cancel')).toContain('disabled');
  });
  it('the Mission view\'s confirmation takes its title and buttons from cancelConfirmation: "Keep it paused" for a paused child', () => {
    const all = [paused, grand, finished];
    const forPaused = missionConfirmation(paused, [grand], all);
    expect(forPaused).toEqual({ title: 'Cancel one?', body: 'one (coding-agent) will be cancelled and will not resume. Cancelling cascades to 1 paused descendant.', lines: ['grand'], confirmLabel: 'Cancel one', cancelLabel: 'Keep it paused' });
    const live = agent({ id: 'bg_00000009', name: 'live', state: 'running', presentationState: 'running', live: true, interruption: null });
    expect(missionConfirmation(live, [], [...all, live]).cancelLabel).toBe('Keep running');
    const run = agent({ id: RUN_AGENT_ID, name: 'orchestrator', state: 'running', presentationState: 'running', live: true });
    expect(missionConfirmation(run, [live], [live])).toEqual({ title: 'Cancel the run?', body: CANCEL_RUN_TEXT, lines: ['live'], confirmLabel: 'Cancel the run', cancelLabel: 'Keep running' });
  });
});

describe('PD-ORCH-005 clause 13 (revision 4, round 2, OQ-73): a live agent\'s cancel names the paused descendants it also ends', () => {
  it('in a `pausing` run, the inspector\'s note for a live parent counts its child already paused', () => {
    const live = agent({ state: 'running', presentationState: 'running', live: true, interruption: null });
    const pausing = session({ executionStatus: 'pausing', agents: [live, grand] });
    const html = inspector(live.id, { session: pausing, runActive: true, resting: false });
    expect(button(html, 'inspector-cancel')).not.toContain('disabled');
    expect(html).toContain('Cancelling cascades to 1 paused descendant.');
    expect(missionConfirmation(live, [grand], [live, grand]).body).toBe('one (coding-agent) will be cancelled. Cancelling cascades to 1 paused descendant.');
  });
});
