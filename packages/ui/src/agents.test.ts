import { describe, expect, it } from 'vitest';
import { contextPercent, DEFAULT_CONTEXT_CAPACITY, RUN_AGENT_ID, type AgentRecord, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { cascadeNote, chipStates, countNoun, followedAgent, inspectorEnablement, instancesOf, liveDescendants, mcpChipStates, mcpFateText, metaLine, PAUSE_NO_RUN, PAUSE_SELECT_RUN, pauseAvailability, resolvedTools, ringFigures, rowsOf, runLevelAgent, tableOrder } from './agents.js';
import { personaColourToken } from './PersonaWindow.js';
import { useShellState } from './shell-state.js';

const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_00000001', name: 'helper', givenName: 'Helper', persona: 'coding-agent', state: 'running', presentationState: 'running', parentId: 'root:1', dependencies: [], activity: 'do the thing', model: 'scripted/alpha',
  depth: 1, background: true, category: 'quick', spawnedAt: '2026-09-05T10:00:00.000Z', completedAt: null, toolCalls: 2, delegationTask: 'do the thing', reasoning: 'medium', contextUsed: 1000, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: ['read_file', 'grep'], calledTools: ['grep'], activeTools: [], delegationSessionId: null, inheritedContext: '', live: true, grantedMcp: {}, mcpServers: [], ...over,
});
const row = (over: Partial<TranscriptRow>): TranscriptRow => ({ index: 0, kind: 'agent', settled: true, body: 'x', at: '2026-09-05T10:00:00.000Z', ts: '10:00:00', ...over });
const session = (over: Partial<SessionRecord>): SessionRecord => ({
  id: 's1', executionStatus: 'running', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-09-05T10:05:00.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: null, runStartedAt: '2026-09-05T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null,
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 5, agents: 2, byTool: [] }, worktreeBranch: null, wait: null, ...over,
});

describe('agents — the shared selection (REQ-MONITOR-042) and the run-level agent (REQ-MONITOR-043/057)', () => {
  it('one selection in the shell store, read by every surface; null drops it', () => {
    useShellState.getState().selectAgent('bg_00000001');
    expect(useShellState.getState().selectedAgentId).toBe('bg_00000001');
    useShellState.getState().selectAgent(null);
    expect(useShellState.getState().selectedAgentId).toBeNull();
  });
  it('the run-level agent is the entry role: live while the run is busy, its own tool calls the session total less the children, no record-carried context', () => {
    const entry = { persona: 'orchestrator', model: 'scripted/alpha', reasoning: 'high', tools: ['delegate', 'read_file'] };
    const r = runLevelAgent(session({ agents: [agent({ toolCalls: 2 })] }), entry)!;
    expect(r).toMatchObject({ id: RUN_AGENT_ID, name: 'orchestrator', persona: 'orchestrator', presentationState: 'running', live: true, toolCalls: 3, model: 'scripted/alpha', reasoning: 'high', grantedTools: ['delegate', 'read_file'], contextUsed: 0, contextLimit: DEFAULT_CONTEXT_CAPACITY, completedAt: null });
    expect(runLevelAgent(session({ executionStatus: 'completed' }), entry)).toMatchObject({ presentationState: 'done', live: false, completedAt: '2026-09-05T10:05:00.000Z' });
    expect(runLevelAgent(session({ executionStatus: 'failed' }), entry)?.presentationState).toBe('failed');
    expect(runLevelAgent(session({ executionStatus: 'paused' }), entry)?.presentationState).toBe('cancelled');
    expect(runLevelAgent(session({ runStartedAt: null }), entry)).toBeNull();
    expect(runLevelAgent(null, entry)).toBeNull();
  });
});

describe('agents — the inspector follows the latest author (REQ-MONITOR-053/054/056)', () => {
  const helper = agent({});
  const runLevel = runLevelAgent(session({ agents: [helper] }), { persona: 'orchestrator', model: 'm', reasoning: 'medium', tools: [] })!;
  it('scans backwards past user, system, intent, verifier and unknown rows to the latest known agent', () => {
    const rows = [
      row({ index: 0, kind: 'user', body: 'go' }),
      row({ index: 1, kind: 'agent', persona: 'orchestrator', name: 'orchestrator' }),
      row({ index: 2, kind: 'tool', persona: 'coding-agent', name: 'helper', toolName: 'grep' }),
      row({ index: 3, kind: 'agent', persona: 'ghost', name: 'nobody' }),
      row({ index: 4, kind: 'system', body: 'note' }),
      row({ index: 5, kind: 'verifier', body: 'check' }),
      row({ index: 6, kind: 'user', body: 'more' }),
    ];
    expect(followedAgent(rows, [helper], runLevel)?.id).toBe(helper.id);
    expect(followedAgent(rows.slice(0, 2), [helper], runLevel)?.id).toBe(RUN_AGENT_ID);
    expect(followedAgent(rows.slice(0, 2), [helper], null)).toBeNull();
    expect(followedAgent([row({ index: 0, kind: 'user' })], [helper], runLevel)).toBeNull();
  });
  it('an instance list groups by persona with the run-level agent first for its own persona (REQ-MONITOR-050), and rows are scoped by author (REQ-MONITOR-071)', () => {
    const second = agent({ id: 'bg_00000002', name: 'helper-2', parentId: 'bg_00000001', depth: 2 });
    const other = agent({ id: 'bg_00000003', name: 'checker', persona: 'reviewer' });
    expect(instancesOf('coding-agent', [other, second, helper], runLevel).map((a) => a.name)).toEqual(['helper', 'helper-2']);
    expect(instancesOf('orchestrator', [helper], runLevel).map((a) => a.id)).toEqual([RUN_AGENT_ID]);
    const rows = [row({ index: 1, kind: 'agent', persona: 'orchestrator', name: 'orchestrator' }), row({ index: 2, kind: 'tool', persona: 'coding-agent', name: 'helper' }), row({ index: 3, kind: 'user' }), row({ index: 4, kind: 'agent', persona: 'coding-agent', name: 'helper' })];
    expect(rowsOf(rows, helper).map((r) => r.index)).toEqual([2, 4]);
    expect(rowsOf(rows, runLevel).map((r) => r.index)).toEqual([1]);
  });
});

describe('agents — chips, enablement, cascade, pause (REQ-MONITOR-060/062/063/064, 274/276)', () => {
  it('chips follow the resolved set in its own order and only their marks change on a state change', () => {
    const before = chipStates(['read_file', 'grep', 'terminal'], ['grep'], ['grep']);
    const after = chipStates(['read_file', 'grep', 'terminal'], ['grep'], []);
    expect(before.map((c) => c.name)).toEqual(after.map((c) => c.name));
    expect(before.map((c) => c.state)).toEqual(['not used', 'active', 'not used']);
    expect(after.map((c) => c.state)).toEqual(['not used', 'used', 'not used']);
    expect(resolvedTools(agent({ grantedTools: [] }), ['a', 'b'])).toEqual(['a', 'b']);
    expect(resolvedTools(agent({ grantedTools: ['x'] }), ['a'])).toEqual(['x']);
  });
  it('Steer while running or waiting; Cancel while running, waiting or queued; Pop out always for a shown agent', () => {
    expect(inspectorEnablement('running')).toEqual({ steer: true, cancel: true, popOut: true });
    expect(inspectorEnablement('waiting')).toEqual({ steer: true, cancel: true, popOut: true });
    expect(inspectorEnablement('queued')).toEqual({ steer: false, cancel: true, popOut: true });
    expect(inspectorEnablement('done')).toEqual({ steer: false, cancel: false, popOut: true });
    expect(inspectorEnablement(null)).toEqual({ steer: false, cancel: false, popOut: false });
  });
  it('the cascade counts live descendants only, and the run cascades to every live agent', () => {
    const a = agent({ id: 'a', name: 'a', parentId: 'root:1' });
    const b = agent({ id: 'b', name: 'b', parentId: 'a', presentationState: 'queued', state: 'queued', live: false });
    const c = agent({ id: 'c', name: 'c', parentId: 'b', presentationState: 'done', state: 'succeeded', live: false });
    const d = agent({ id: 'd', name: 'd', parentId: 'root:1', presentationState: 'waiting', state: 'waiting_on_model_slot', live: false });
    expect(liveDescendants([a, b, c, d], 'a').map((x) => x.id)).toEqual(['b']);
    expect(liveDescendants([a, b, c, d], RUN_AGENT_ID).map((x) => x.id)).toEqual(['a', 'b', 'd']);
    expect(cascadeNote(0)).toBe('');
    expect(cascadeNote(1)).toBe('Cancelling cascades to 1 live descendant.');
    expect(cascadeNote(3)).toBe('Cancelling cascades to 3 live descendants.');
  });
  it('pause is valid for the run-level selection only while a run executes; the refusal is the explanation text', () => {
    expect(pauseAvailability('bg_1', true, 'running')).toEqual({ enabled: false, reason: PAUSE_SELECT_RUN });
    expect(pauseAvailability(null, true, 'running')).toEqual({ enabled: false, reason: PAUSE_SELECT_RUN });
    expect(pauseAvailability(RUN_AGENT_ID, false, 'completed')).toEqual({ enabled: false, reason: PAUSE_NO_RUN });
    expect(pauseAvailability(RUN_AGENT_ID, true, 'running').enabled).toBe(true);
    expect(pauseAvailability(RUN_AGENT_ID, true, 'pausing').enabled).toBe(false);
  });
});

describe('agents — the table order, the ring, the meta line, the nouns (REQ-MONITOR-036/045/052/087, REQ-SHELL-044)', () => {
  it('orders depth-first as the tree does', () => {
    const a = agent({ id: 'a', name: 'a', parentId: 'root:1' });
    const b = agent({ id: 'b', name: 'b', parentId: 'a' });
    const c = agent({ id: 'c', name: 'c', parentId: 'root:1' });
    expect(tableOrder([c, b, a]).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('the ring: a whole percent, 0 at a zero limit, the bands at 75 % of the threshold and at it', () => {
    expect(contextPercent(1325, DEFAULT_CONTEXT_CAPACITY)).toBe(1);
    expect(contextPercent(10, 0)).toBe(0);
    expect(ringFigures(0, 100, 60)).toMatchObject({ percent: 0, threshold: 60, band: 'ok' });
    expect(ringFigures(45, 100, 60).band).toBe('warn');
    expect(ringFigures(60, 100, 60).band).toBe('fail');
    expect(ringFigures(10, 100, 500).threshold).toBe(100);
  });
  it('the meta line and the nouns', () => {
    expect(metaLine(agent({ toolCalls: 1 }), '12s')).toBe('running · 12s · 1 tool call');
    expect(metaLine(agent({ toolCalls: 0 }), null)).toBe('running · — · 0 tool calls');
    expect(countNoun(1, 'instance')).toBe('1 instance');
    expect(countNoun(2, 'instance')).toBe('2 instances');
  });
  it('a persona colour is a named token, stable for a name', () => {
    expect(personaColourToken('coding-agent')).toBe(personaColourToken('coding-agent'));
    expect(personaColourToken('coding-agent')).toMatch(/^--rt-/);
  });
});

describe('the MCP chips per server (REQ-MCP-065/100/114, REQ-MONITOR-060; wired at the merge of Parts R and S)', () => {
  it('marks a granted name used or active whether the call was logged under the reported name or the server prefix', () => {
    expect(mcpChipStates('alpha', ['echo', 'slow', 'fail'], ['alpha_echo'], ['slow'])).toEqual([
      { name: 'echo', state: 'used' }, { name: 'slow', state: 'active' }, { name: 'fail', state: 'not used' },
    ]);
    expect(mcpFateText({ fate: 'connected' })).toBe('connected');
    expect(mcpFateText({ fate: 'dropped', reason: 'disabled' })).toBe('dropped — disabled');
  });
});
