import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, RUN_AGENT_ID, type AgentRecord, type SessionRecord } from '@rotaris/contracts';
import { MissionView, missionCancelBody, missionConfirmation } from './MissionView.js';
import { CANCEL_RUN_TEXT, cancelConfirmation, cancelUnavailableReason, PAUSE_NO_RUN, PAUSED_CANCEL_ALONE, PAUSED_CANCEL_WITH, restingView } from './agents.js';
import { Inspector } from './Inspector.js';
import { useShellState } from './shell-state.js';
import { WorkspaceView } from './WorkspaceView.js';
import type * as HostModule from './terminal/host.js';

// The transcript toolbar draws the terminal host's live counts through `useSyncExternalStore`, which a static render
// cannot serve; the Workspace's agents panel is what these tests read, so the control is drawn as nothing here.
vi.mock('./terminal/host.js', async (importOriginal) => ({ ...(await importOriginal<typeof HostModule>()), TerminalToolbarControl: () => null }));

/**
 * PD-ORCH-005 clause 16 (revision 4, OQ-101): "A `paused` child SHALL offer Cancel wherever a live agent offers it." What a
 * unit test can prove is the markup — which Cancel is enabled for which agent of a resting session; the click, the
 * confirmation and the engine's answer are driven against the built product (`pnpm app:drive`), since vitest has no DOM.
 */
const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_00000001', name: 'one', givenName: 'one', persona: 'coding-agent', state: 'paused', presentationState: 'paused', parentId: 'bg_0000root', dependencies: [], activity: 'TASK: one', model: 'm',
  depth: 1, background: true, category: '', spawnedAt: '2026-09-28T10:00:00.000Z', completedAt: null, toolCalls: 1, delegationTask: 'TASK: one', reasoning: 'medium', contextUsed: 0, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: [], grantRecorded: false, calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: false, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: 'pause', stalledSeconds: null, ...over,
});
const paused = agent({});
const grand = agent({ id: 'bg_00000002', name: 'grand', parentId: 'bg_00000001', depth: 2 });
const finished = agent({ id: 'bg_00000003', name: 'done-one', state: 'succeeded', presentationState: 'done', completedAt: '2026-09-28T10:01:00.000Z', interruption: null });
const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1', executionStatus: 'paused', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-09-28T10:05:00.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [paused, grand, finished], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: 'user_cancelled', runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-09-28T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: { iteration: 1, agents: 3 },
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 0, agents: 0, byTool: [] }, worktreeBranch: null, wait: null, compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: { resolved: [], called: [], active: [] }, artifacts: [], entryRoots: [], entryStalledSeconds: null, entryToolCalls: null, ...over,
});
const ok = async () => ({ ok: true as const });
/** The inspector as the Workspace draws it for a resting session: no run active (REQ-MONITOR-063's gate), resting. */
const inspector = (selected: string, over: { runActive?: boolean; resting?: boolean; session?: SessionRecord } = {}) => renderToStaticMarkup(createElement(Inspector, {
  session: over.session ?? session(), rows: [], personas: [], runLevel: null, selectedAgentId: selected, onSelect: () => undefined, models: [], compressionThresholdPercent: 60, runActive: over.runActive ?? false, resting: over.resting ?? true, nowIso: null,
  onSteer: () => undefined, onCancel: () => undefined, onPopOut: () => undefined,
}));
const mission = (selected: string, over: { resting?: boolean; recovery?: boolean; session?: SessionRecord; runLevel?: AgentRecord | null } = {}) => renderToStaticMarkup(createElement(MissionView, {
  session: over.session ?? session(), sessionLabel: null, runLevel: over.runLevel ?? null, resting: over.resting ?? true, recovery: over.recovery ?? false, selectedAgentId: selected, onSelect: () => undefined, nowIso: null, strategy: null, maxDepth: null,
  onSetStrategy: ok, onSetDepth: ok, onPause: ok, onCancelAgent: ok, onCancelRun: ok, onOpen: () => undefined, onPopOut: () => undefined,
}));
/** The attributes of the one button a test id names. */
const button = (html: string, testId: string) => html.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? '';

describe('PD-ORCH-005 clause 16 (revision 4, OQ-101): a paused child offers Cancel wherever a live agent offers it', () => {
  it('the inspector enables Cancel for a paused child of a resting session and counts its paused descendant; a finished one stays disabled', () => {
    const html = inspector(paused.id);
    expect(button(html, 'inspector-cancel')).toMatch(/^<button/);
    expect(button(html, 'inspector-cancel')).not.toContain('disabled');
    expect(button(html, 'inspector-cancel')).toContain('title="Cancel one"');
    expect(html).toContain('Cancelling cascades to 1 paused descendant.');
    expect(button(inspector(finished.id), 'inspector-cancel')).toContain('disabled');
  });

  it('the Mission view enables "Cancel selection" for a paused child with no run active, and its confirmation says the cancel cannot be undone', () => {
    expect(button(mission(paused.id), 'mission-cancel')).toMatch(/^<button/);
    expect(button(mission(paused.id), 'mission-cancel')).not.toContain('disabled');
    expect(button(mission(finished.id), 'mission-cancel')).toContain('disabled');
    expect(missionCancelBody(paused, [agent({ presentationState: 'paused' })])).toBe(`one (coding-agent) will be cancelled. ${PAUSED_CANCEL_WITH}`);
    expect(missionCancelBody(paused, [])).toBe(`one (coding-agent) will be cancelled. ${PAUSED_CANCEL_ALONE}`);
    expect(missionCancelBody(agent({ presentationState: 'running' }), [])).toBe('one (coding-agent) will be cancelled. Nothing cascades.');
  });

  // The note "the Mission view's paused-child confirmation omits that it cannot be undone": clause 16 makes the cancel
  // "final as clause 3 says", and every surface that confirms it states that finality in the same words.
  it('the Mission view states a paused child\'s cancel final in the words the Workspace and a persona window use (clauses 3 and 16)', () => {
    const all = [paused, grand, finished];
    for (const cascade of [[grand], []]) {
      const shared = cancelConfirmation(paused, cascade.length > 0 ? all : [paused, finished]);
      const mission = missionConfirmation(paused, cascade, cascade.length > 0 ? all : [paused, finished]);
      expect(shared.body).toContain('Cancellation cannot be undone');
      expect(mission.body.endsWith(shared.body)).toBe(true);
      expect(mission.lines).toEqual(shared.lines);
      expect(mission.cancelLabel).toBe('Keep it paused');
    }
  });
});

describe('PD-ORCH-005 clauses 13 and 16 (revision 4, OQ-100/OQ-101): the Mission view and the inspector offer a paused child\'s Cancel only while its session rests', () => {
  /** The run-level agent as `runLevelAgent` presents it while the session rests (clause 13). */
  const restingRun = agent({ id: RUN_AGENT_ID, name: 'orchestrator', persona: 'orchestrator', parentId: '', depth: 0, interruption: null });
  it('in REQ-CHAT-008\'s recovery state the persisted status reads busy, yet the resting run-level agent offers no "Cancel selection" — the engine would refuse it', () => {
    const recovery = session({ executionStatus: 'running' });
    expect(button(mission(RUN_AGENT_ID, { session: recovery, recovery: true, runLevel: restingRun }), 'mission-cancel')).toContain('disabled');
    // …while a paused child of the same session offers it.
    expect(button(mission(paused.id, { session: recovery, recovery: true, runLevel: restingRun }), 'mission-cancel')).not.toContain('disabled');
  });
  it('in REQ-CHAT-008\'s recovery state the Mission view offers no "Pause" for the run it draws `paused`: no run is active', () => {
    const recovery = session({ executionStatus: 'running' });
    const html = mission(RUN_AGENT_ID, { session: recovery, recovery: true, runLevel: restingRun });
    expect(button(html, 'mission-pause')).toContain('data-enabled="0"');
    expect(html).toContain(PAUSE_NO_RUN);
    expect(html).not.toContain('Pauses the whole run after its current step.');
    // The same busy status with a run under way here still offers it.
    expect(button(mission(RUN_AGENT_ID, { session: recovery, resting: false, recovery: false, runLevel: restingRun }), 'mission-pause')).toContain('data-enabled="1"');
  });
  it('in REQ-CHAT-008\'s recovery state the Mission view\'s run row and subtitle read the recovery label, not "Running" beside a root drawn `paused`', () => {
    const recovery = session({ executionStatus: 'running' });
    const html = mission(RUN_AGENT_ID, { session: recovery, recovery: true, runLevel: restingRun });
    expect(html).toMatch(/data-testid="mission-run-row"[\s\S]*?mission__run-state[^>]*>Run needs recovery</);
    expect(html).toContain('· Run needs recovery</span>');
    expect(html).not.toMatch(/>Running</);
    // With a run under way here the same status still reads as running.
    expect(mission(RUN_AGENT_ID, { session: recovery, resting: false, recovery: false, runLevel: restingRun })).toMatch(/mission__run-state[^>]*>Running</);
  });
  it('the inspector and the Mission view explain the resting run\'s refused Cancel alike, pointing to "Continue without them" (clause 6)', () => {
    const recovery = session({ executionStatus: 'running' });
    const resting = cancelUnavailableReason(restingRun);
    expect(resting).toContain('"Continue without them" ends its paused agents');
    expect(button(mission(RUN_AGENT_ID, { session: recovery, recovery: true, runLevel: restingRun }), 'mission-cancel')).toContain(`title="${resting.replace(/"/g, '&quot;')}"`);
    expect(button(mission(RUN_AGENT_ID, { runLevel: restingRun }), 'mission-cancel')).not.toContain('Select a live agent');
    // A paused child during a `pausing` run, and a finished agent, read the rule itself on both surfaces.
    const rule = cancelUnavailableReason(finished);
    expect(rule).toContain('for a paused child while its session rests');
    expect(button(mission(paused.id, { session: session({ executionStatus: 'pausing' }), resting: false }), 'mission-cancel')).toContain(`title="${rule}"`);
    expect(button(inspector(finished.id), 'inspector-cancel')).toContain(`title="${rule}"`);
  });
  it('with nothing selected the Mission view\'s hint names the run, which "Cancel selection" cancels from its row (REQ-MONITOR-126), and the paused child', () => {
    const none = cancelUnavailableReason(null);
    expect(none).toContain('a live agent or the run while the run is active');
    expect(none).toContain('a paused child while its session rests');
    expect(button(mission('no-such-agent', { session: session({ executionStatus: 'running' }), resting: false }), 'mission-cancel')).toContain(`title="${none}"`);
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
    expect(forPaused).toEqual({ title: 'Cancel one?', body: `one (coding-agent) will be cancelled. ${PAUSED_CANCEL_WITH}`, lines: ['grand'], confirmLabel: 'Cancel one', cancelLabel: 'Keep it paused' });
    const live = agent({ id: 'bg_00000009', name: 'live', state: 'running', presentationState: 'running', live: true, interruption: null });
    expect(missionConfirmation(live, [], [...all, live]).cancelLabel).toBe('Keep running');
    const run = agent({ id: RUN_AGENT_ID, name: 'orchestrator', state: 'running', presentationState: 'running', live: true });
    expect(missionConfirmation(run, [live], [live])).toEqual({ title: 'Cancel the run?', body: CANCEL_RUN_TEXT, lines: ['live'], confirmLabel: 'Cancel the run', cancelLabel: 'Keep running' });
  });
});

describe('PD-ORCH-005 clause 13 (revision 4, OQ-100): a live agent\'s cancel names the paused descendants it also ends', () => {
  it('in a `pausing` run, the inspector\'s note for a live parent counts its child already paused', () => {
    const live = agent({ state: 'running', presentationState: 'running', live: true, interruption: null });
    const pausing = session({ executionStatus: 'pausing', agents: [live, grand] });
    const html = inspector(live.id, { session: pausing, runActive: true, resting: false });
    expect(button(html, 'inspector-cancel')).not.toContain('disabled');
    expect(html).toContain('Cancelling cascades to 1 paused descendant.');
    expect(missionConfirmation(live, [grand], [live, grand]).body).toBe('one (coding-agent) will be cancelled. Cancelling cascades to 1 paused descendant.');
  });
});

/**
 * PD-ORCH-005 clauses 13 and 16 (revision 4, OQ-100/OQ-101) on the Workspace, the main surface: what connects the helpers
 * pinned above to it — the agents header's Cancel, the `resting` its inspector is handed, and the REQ-CHAT-008 recovery
 * fact the run-level agent is drawn from (`restingView`, which the Mission root in the desktop renderer calls too).
 */
describe('PD-ORCH-005 clauses 13 and 16 (revision 4, OQ-100/OQ-101): the Workspace offers a paused child\'s Cancel and draws the resting root `paused`', () => {
  const entry = { persona: 'orchestrator', model: 'm', reasoning: 'medium', tools: [] };
  const workspace = (selected: string, s: SessionRecord, needsRecovery = false) => {
    // A static render reads the store's initial state (zustand's server snapshot), so the selection is made there.
    const initial = useShellState.getInitialState() as { selectedAgentId: string | null };
    const was = initial.selectedAgentId;
    initial.selectedAgentId = selected;
    try {
      return renderToStaticMarkup(createElement(WorkspaceView, {
        session: s, rows: [], needsRecovery, entry,
        onSubmit: ok, onStop: ok, onContinue: ok, onCancelAgent: ok,
      }));
    } finally { initial.selectedAgentId = was; }
  };
  /** The agents header's Cancel for the selected agent, which only it draws with this label. */
  const headerCancel = (html: string, name: string) => new RegExp(`<button[^>]*agents__cancel[^>]*>Cancel ${name}</button>`).test(html);
  const recovering = session({ executionStatus: 'running', agents: [agent({ interruption: 'crash' }), grand, finished] });

  it('a paused child of a resting session: the agents header and the inspector offer its Cancel, paused or in REQ-CHAT-008\'s recovery state', () => {
    for (const [s, recovery] of [[session(), false], [session({ executionStatus: 'interrupted' }), false], [recovering, true]] as const) {
      const html = workspace(paused.id, s, recovery);
      expect(headerCancel(html, 'one'), s.executionStatus).toBe(true);
      expect(button(html, 'inspector-cancel'), s.executionStatus).not.toContain('disabled');
    }
  });

  it('the same session with a live run behind it rests not: neither offers the paused child\'s Cancel', () => {
    const html = workspace(paused.id, recovering, false);
    expect(headerCancel(html, 'one')).toBe(false);
    expect(button(html, 'inspector-cancel')).toContain('disabled');
  });

  it('the run-level agent presents `paused` in REQ-CHAT-008\'s recovery state, as its agents do, and running while a run is live behind it', () => {
    expect(workspace(RUN_AGENT_ID, recovering, true)).toMatch(/data-testid="inspector-meta">paused · /);
    expect(workspace(RUN_AGENT_ID, recovering, false)).toMatch(/data-testid="inspector-meta">running · /);
  });

  it('restingView answers the run-level agent and the rest from the one recovery fact', () => {
    expect(restingView(recovering, entry, true)).toMatchObject({ resting: true, runLevel: { presentationState: 'paused' } });
    expect(restingView(recovering, entry, false)).toMatchObject({ resting: false, runLevel: { presentationState: 'running' } });
    expect(restingView(session(), undefined, false)).toEqual({ resting: true, runLevel: null });
    expect(restingView(null, entry, true)).toEqual({ resting: false, runLevel: null });
  });
});
