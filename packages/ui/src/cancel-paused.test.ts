import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, type AgentRecord, type SessionRecord } from '@rotaris/contracts';
import { MissionView, missionCancelBody } from './MissionView.js';
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
/** The inspector as the Workspace draws it for a resting session: no run active (REQ-MONITOR-063's gate). */
const inspector = (selected: string) => renderToStaticMarkup(createElement(Inspector, {
  session: session(), rows: [], personas: [], runLevel: null, selectedAgentId: selected, onSelect: () => undefined, models: [], compressionThresholdPercent: 60, runActive: false, nowIso: null,
  onSteer: () => undefined, onCancel: () => undefined, onPopOut: () => undefined,
}));
const mission = (selected: string) => renderToStaticMarkup(createElement(MissionView, {
  session: session(), sessionLabel: null, runLevel: null, selectedAgentId: selected, onSelect: () => undefined, nowIso: null, strategy: null, maxDepth: null,
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
    expect(missionCancelBody(paused, 1)).toBe('one (coding-agent) will be cancelled and will not resume. Cancelling cascades to 1 paused descendant.');
    expect(missionCancelBody(agent({ presentationState: 'running' }), 0)).toBe('one (coding-agent) will be cancelled. Nothing cascades.');
  });
});
