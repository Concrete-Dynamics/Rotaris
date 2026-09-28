import { describe, expect, it } from 'vitest';
import { contextPercent, DEFAULT_CONTEXT_CAPACITY, RUN_AGENT_ID, type AgentRecord, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { CANCEL_RUN_TEXT, cancelCascade, cancelConfirmation, cancelOffered, cascadeNote, PAUSED_CANCEL_ALONE, PAUSED_CANCEL_WITH, pausedCancelWith, chipStates, countNoun, followedAgent, inspectorEnablement, instancesOf, mcpChipStates, mcpFateText, metaLine, PAUSE_NO_RUN, PAUSE_SELECT_RUN, pauseAvailability, resolvedTools, ringFigures, rowsOf, runLevelAgent, steerOffered, tableOrder } from './agents.js';
import { personaColourToken } from './PersonaWindow.js';
import { useShellState } from './shell-state.js';

const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_00000001', name: 'helper', givenName: 'Helper', persona: 'coding-agent', state: 'running', presentationState: 'running', parentId: 'root:1', dependencies: [], activity: 'do the thing', model: 'scripted/alpha',
  depth: 1, background: true, category: 'quick', spawnedAt: '2026-09-05T10:00:00.000Z', completedAt: null, toolCalls: 2, delegationTask: 'do the thing', reasoning: 'medium', contextUsed: 1000, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: ['read_file', 'grep'], calledTools: ['grep'], activeTools: [], delegationSessionId: null, inheritedContext: '', live: true, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, ...over,
});
const row = (over: Partial<TranscriptRow>): TranscriptRow => ({ index: 0, kind: 'agent', settled: true, body: 'x', at: '2026-09-05T10:00:00.000Z', ts: '10:00:00', ...over });
const session = (over: Partial<SessionRecord>): SessionRecord => ({
  id: 's1', executionStatus: 'running', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-09-05T10:05:00.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: null, runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-09-05T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: null,
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 5, agents: 2, byTool: [] }, worktreeBranch: null, wait: null, compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, ...over,
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
    const r = runLevelAgent(session({ agents: [agent({ toolCalls: 2 })] }), entry, false)!;
    expect(r).toMatchObject({ id: RUN_AGENT_ID, name: 'orchestrator', persona: 'orchestrator', presentationState: 'running', live: true, toolCalls: 3, model: 'scripted/alpha', reasoning: 'high', grantedTools: ['delegate', 'read_file'], contextUsed: 0, contextLimit: DEFAULT_CONTEXT_CAPACITY, completedAt: null });
    expect(runLevelAgent(session({ executionStatus: 'completed' }), entry, false)).toMatchObject({ presentationState: 'done', live: false, completedAt: '2026-09-05T10:05:00.000Z' });
    expect(runLevelAgent(session({ executionStatus: 'failed' }), entry, false)?.presentationState).toBe('failed');
    expect(runLevelAgent(session({ executionStatus: 'paused' }), entry, false)?.presentationState).toBe('cancelled');
    expect(runLevelAgent(session({ runStartedAt: null }), entry, false)).toBeNull();
    expect(runLevelAgent(null, entry, false)).toBeNull();
  });
});

describe('agents — the inspector follows the latest author (REQ-MONITOR-053/054/056)', () => {
  const helper = agent({});
  const runLevel = runLevelAgent(session({ agents: [helper] }), { persona: 'orchestrator', model: 'm', reasoning: 'medium', tools: [] }, false)!;
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
  it('the cascade reaches unfinished descendants only, never a settled one, and the run cascades to every unfinished agent (its reach to a paused one, OQ-73, is pinned below)', () => {
    const a = agent({ id: 'a', name: 'a', parentId: 'root:1' });
    const b = agent({ id: 'b', name: 'b', parentId: 'a', presentationState: 'queued', state: 'queued', live: false });
    const c = agent({ id: 'c', name: 'c', parentId: 'b', presentationState: 'done', state: 'succeeded', live: false });
    const d = agent({ id: 'd', name: 'd', parentId: 'root:1', presentationState: 'waiting', state: 'waiting_on_model_slot', live: false });
    expect(cancelCascade([a, b, c, d], a).map((x) => x.id)).toEqual(['b']);
    expect(cancelCascade([a, b, c, d], { id: RUN_AGENT_ID }).map((x) => x.id)).toEqual(['a', 'b', 'd']);
    expect(cascadeNote([])).toBe('');
    expect(cascadeNote([b])).toBe('Cancelling cascades to 1 live descendant.');
    expect(cascadeNote([a, b, d])).toBe('Cancelling cascades to 3 live descendants.');
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

describe('REQ-MONITOR-126 / REQ-MONITOR-128: what confirming a cancel states (PD-ORCH-005 clause 3)', () => {
  const a = agent({ id: 'a', name: 'alpha', parentId: 'root:1' });
  const b = agent({ id: 'b', name: 'beta', parentId: 'a' });
  const c = agent({ id: 'c', name: 'gamma', parentId: 'a', presentationState: 'done', state: 'succeeded' });

  it('the run instance\'s cancel is the run\'s own, final — whichever surface confirms it', () => {
    expect(cancelConfirmation({ id: RUN_AGENT_ID, name: 'orchestrator' }, [a, b])).toEqual({ title: 'Cancel the run?', body: CANCEL_RUN_TEXT, lines: [], confirmLabel: 'Cancel the run', cancelLabel: 'Keep running' });
  });

  it('an agent\'s names it, and one line per live descendant cancelled with it', () => {
    expect(cancelConfirmation({ id: 'a', name: 'alpha' }, [a, b, c])).toEqual({ title: 'Cancel alpha?', body: 'Its live descendants will be cancelled with it:', lines: ['beta'], confirmLabel: 'Cancel alpha', cancelLabel: 'Keep running' });
    expect(cancelConfirmation({ id: 'b', name: 'beta' }, [a, b, c])).toEqual({ title: 'Cancel beta?', body: 'The agent will be cancelled.', lines: [], confirmLabel: 'Cancel beta', cancelLabel: 'Keep running' });
  });
});

describe('agents — PD-ORCH-005 clause 13 (revision 4): a paused agent presents as paused (OQ-73)', () => {
  const entry = { persona: 'orchestrator', model: 'm', reasoning: 'medium', tools: [] };
  const resumable = { iteration: 1, agents: 2 };
  it('the run-level agent of a session resting with an iteration open presents `paused`, not live and not ended — the root the Continue action counts', () => {
    for (const executionStatus of ['paused', 'interrupted']) {
      expect(runLevelAgent(session({ executionStatus, resumable }), entry, false)).toMatchObject({ state: 'paused', presentationState: 'paused', live: false, completedAt: null });
    }
    // REQ-CHAT-008's recovery state: only the caller knows no run is behind the busy status.
    expect(runLevelAgent(session({ executionStatus: 'running', resumable }), entry, true)).toMatchObject({ presentationState: 'paused', live: false, completedAt: null });
    // A live run holds its iteration open too, and presents running; a rest with nothing open presents as before.
    expect(runLevelAgent(session({ executionStatus: 'running', resumable }), entry, false)).toMatchObject({ presentationState: 'running', live: true });
    expect(runLevelAgent(session({ executionStatus: 'paused', resumable: null }), entry, false)?.presentationState).toBe('cancelled');
    expect(runLevelAgent(session({ executionStatus: 'completed', resumable }), entry, false)?.presentationState).toBe('done');
  });
  it('the inspector\'s meta line names it; it is not live, so it offers no steer, and its Cancel is clause 16\'s alone', () => {
    const paused = agent({ id: 'bg_00000002', parentId: 'bg_00000001', state: 'paused', presentationState: 'paused', live: false, interruption: 'stop' });
    expect(metaLine(paused, null)).toBe('paused · — · 2 tool calls');
    // REQ-MONITOR-063's live-agent rule offers a paused agent nothing but Pop out; `cancelOffered` decides its Cancel.
    expect(inspectorEnablement('paused')).toEqual({ steer: false, cancel: false, popOut: true });
  });
});

describe('agents — PD-ORCH-005 clause 16 (revision 4): one paused child is cancellable while its session rests (OQ-74)', () => {
  const one = agent({ id: 'one', name: 'one', parentId: 'root', state: 'paused', presentationState: 'paused', live: false });
  const done = agent({ id: 'done', name: 'done', parentId: 'one', state: 'succeeded', presentationState: 'done', live: false });
  const grand = agent({ id: 'grand', name: 'grand', parentId: 'done', state: 'paused', presentationState: 'paused', live: false });
  const two = agent({ id: 'two', name: 'two', parentId: 'root', state: 'paused', presentationState: 'paused', live: false });
  const agents = [one, done, grand, two];
  it('Cancel is offered for a paused child while its session rests, never for the resting run itself; a live agent still needs its run', () => {
    expect(cancelOffered(one, false, true)).toBe(true);
    // `resting` alone decides a paused child's Cancel, whatever the caller reads of a run: no surface passes both today
    // (a resting session is never read as an active run), so this pins only that the second argument cannot withhold it.
    expect(cancelOffered(one, true, true)).toBe(true);
    expect(cancelOffered({ id: RUN_AGENT_ID, presentationState: 'paused' }, false, true)).toBe(false);
    expect(cancelOffered({ id: RUN_AGENT_ID, presentationState: 'paused' }, true, true)).toBe(false);
    expect(cancelOffered(agent({ presentationState: 'running' }), false, false)).toBe(false);
    expect(cancelOffered(agent({ presentationState: 'queued' }), true, false)).toBe(true);
    expect(cancelOffered(done, true, true)).toBe(false);
    expect(cancelOffered(null, true, true)).toBe(false);
  });
  it('a paused child is not offered Cancel while a run is active and its session does not rest — a `pausing` run, or a continue not yet reaching it', () => {
    expect(cancelOffered(one, true, false)).toBe(false);
  });
  it('what cascades is its paused descendants, through a finished one; a live agent\'s is its live ones', () => {
    expect(cancelCascade(agents, one).map((a) => a.name)).toEqual(['grand']);
    expect(cancelCascade(agents, two)).toEqual([]);
    expect(cancelCascade([agent({ id: 'p' }), agent({ id: 'k', parentId: 'p' })], agent({ id: 'p' })).map((a) => a.id)).toEqual(['k']);
    expect(cascadeNote([grand])).toBe('Cancelling cascades to 1 paused descendant.');
    expect(cascadeNote([grand, two])).toBe('Cancelling cascades to 2 paused descendants.');
  });
  it('the confirmation names the child, gives one line per paused descendant, says it is final, and keeps it paused on dismissal (REQ-MONITOR-128)', () => {
    expect(cancelConfirmation({ id: 'one', name: 'one' }, agents)).toEqual({ title: 'Cancel one?', body: PAUSED_CANCEL_WITH, lines: ['grand'], confirmLabel: 'Cancel one', cancelLabel: 'Keep it paused' });
    expect(cancelConfirmation({ id: 'two', name: 'two' }, agents)).toEqual({ title: 'Cancel two?', body: PAUSED_CANCEL_ALONE, lines: [], confirmLabel: 'Cancel two', cancelLabel: 'Keep it paused' });
    // The sentences the owner reads, pinned as literals rather than against the constants they are built from.
    expect(PAUSED_CANCEL_WITH).toBe('Cancellation cannot be undone: the agent will not resume, and its paused descendants are cancelled with it:');
    expect(PAUSED_CANCEL_ALONE).toBe('Cancellation cannot be undone: the agent will not resume. The other paused agents resume when the session continues.');
  });
});

describe('agents — PD-ORCH-005 clause 13 (revision 4): a live agent\'s cancel still ends its paused descendants, and says so (OQ-73)', () => {
  const one = agent({ id: 'one', name: 'one', parentId: 'root:1' });
  const grand = agent({ id: 'grand', name: 'grand', parentId: 'one', state: 'paused', presentationState: 'paused', live: false });
  const kid = agent({ id: 'kid', name: 'kid', parentId: 'one', presentationState: 'queued', state: 'queued', live: false });
  const done = agent({ id: 'done', name: 'done', parentId: 'one', presentationState: 'done', state: 'succeeded', live: false });
  const deep = agent({ id: 'deep', name: 'deep', parentId: 'done', state: 'paused', presentationState: 'paused', live: false });
  it('a live target\'s cascade is every descendant the engine cancels — live and paused, through a finished one — and the run\'s is every live or paused agent', () => {
    expect(cancelCascade([one, grand], one).map((a) => a.name)).toEqual(['grand']);
    expect(cancelCascade([one, grand, kid, done, deep], one).map((a) => a.name)).toEqual(['grand', 'kid', 'deep']);
    expect(cancelCascade([one, grand, kid, done, deep], { id: RUN_AGENT_ID }).map((a) => a.name)).toEqual(['one', 'grand', 'kid', 'deep']);
  });
  it('the confirmation lists them and the note counts them, naming what they are', () => {
    expect(cancelConfirmation({ id: 'one', name: 'one' }, [one, grand])).toEqual({ title: 'Cancel one?', body: 'Its paused descendants will be cancelled with it:', lines: ['grand'], confirmLabel: 'Cancel one', cancelLabel: 'Keep running' });
    expect(cancelConfirmation({ id: 'one', name: 'one' }, [one, grand, kid]).body).toBe('Its live and paused descendants will be cancelled with it:');
    expect(cascadeNote(cancelCascade([one, grand], one))).toBe('Cancelling cascades to 1 paused descendant.');
    expect(cascadeNote(cancelCascade([one, grand, kid], one))).toBe('Cancelling cascades to 2 live and paused descendants.');
  });
  it('the Workspace header offers Steer to a live agent while its run is active, never to a paused one (a `pausing` run)', () => {
    expect(steerOffered(one, true)).toBe(true);
    expect(steerOffered(kid, true)).toBe(true);
    expect(steerOffered(grand, true)).toBe(false);
    expect(steerOffered(done, true)).toBe(false);
    expect(steerOffered(one, false)).toBe(false);
    expect(steerOffered(null, true)).toBe(false);
  });
});

describe('agents — PD-ORCH-005 clause 16 (revision 4): a paused child\'s confirmation names every descendant its cancel ends (OQ-74)', () => {
  const one = agent({ id: 'one', name: 'one', parentId: 'root:1', state: 'paused', presentationState: 'paused', live: false });
  const kid = agent({ id: 'kid', name: 'kid', parentId: 'one' });
  const grand = agent({ id: 'grand', name: 'grand', parentId: 'kid', state: 'paused', presentationState: 'paused', live: false });
  it('in a `pausing` run, a paused parent\'s running child — its call still in flight — is listed and counted, as the live cancel a persona window reaches ends it', () => {
    expect(cancelCascade([one, kid, grand], one).map((a) => a.name)).toEqual(['kid', 'grand']);
    expect(cancelConfirmation({ id: 'one', name: 'one' }, [one, kid, grand])).toEqual({ title: 'Cancel one?', body: pausedCancelWith('live and paused'), lines: ['kid', 'grand'], confirmLabel: 'Cancel one', cancelLabel: 'Keep it paused' });
    expect(cancelConfirmation({ id: 'one', name: 'one' }, [one, kid]).body).toBe('Cancellation cannot be undone: the agent will not resume, and its live descendants are cancelled with it:');
    expect(cascadeNote(cancelCascade([one, kid, grand], one))).toBe('Cancelling cascades to 2 live and paused descendants.');
  });
  it('at rest, where every unfinished descendant is paused, the set and the wording are what they were', () => {
    const rested = agent({ id: 'g2', name: 'g2', parentId: 'one', state: 'paused', presentationState: 'paused', live: false });
    expect(cancelConfirmation({ id: 'one', name: 'one' }, [one, rested])).toMatchObject({ body: PAUSED_CANCEL_WITH, lines: ['g2'] });
  });
});
