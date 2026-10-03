import { describe, expect, it } from 'vitest';
import { contextPercent, DEFAULT_CONTEXT_CAPACITY, RUN_AGENT_ID, type AgentRecord, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { CANCEL_RUN_TEXT, cancelCascade, cancelConfirmation, cancelOffered, cascadeNote, entryRole, PAUSED_CANCEL_ALONE, PAUSED_CANCEL_WITH, pausedCancelWith, chipStates, compressionLine, countNoun, followedAgent, inspectorEnablement, instancesOf, mcpChipStates, mcpFateText, metaLine, PAUSE_NO_RUN, PAUSE_SELECT_RUN, pauseAvailability, resolvedTools, ringFigures, rowsOf, runLevelAgent, runLevelModel, steerOffered, tableOrder } from './agents.js';
import { personaColourToken } from './PersonaWindow.js';
import { useShellState } from './shell-state.js';

const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_00000001', name: 'helper', givenName: 'Helper', persona: 'coding-agent', state: 'running', presentationState: 'running', parentId: 'root:1', dependencies: [], activity: 'do the thing', model: 'scripted/alpha',
  depth: 1, background: true, category: 'quick', spawnedAt: '2026-09-05T10:00:00.000Z', completedAt: null, toolCalls: 2, delegationTask: 'do the thing', reasoning: 'medium', contextUsed: 1000, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: ['read_file', 'grep'], calledTools: ['grep'], activeTools: [], delegationSessionId: null, inheritedContext: '', live: true, grantRecorded: true, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, stalledSeconds: null, ...over,
});
const row = (over: Partial<TranscriptRow>): TranscriptRow => ({ index: 0, kind: 'agent', settled: true, body: 'x', at: '2026-09-05T10:00:00.000Z', ts: '10:00:00', ...over });
const session = (over: Partial<SessionRecord>): SessionRecord => ({
  id: 's1', executionStatus: 'running', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-09-05T10:05:00.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: null, runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-09-05T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, sandboxBackend: '', backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: null,
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 5, agents: 2, byTool: [] }, worktreeBranch: null, wait: null, modelOverrides: [], excludedModels: [], compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: { resolved: [], called: [], active: [] }, artifacts: [], entryRoots: [], entryPersona: null, entryModelKey: null, entryStalledSeconds: null, entryToolCalls: null, compressions: 0, ...over,
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
    // Live-run finding K1: a live run-level agent's tools are its root port's resolution, never the declared set standing in
    // (REQ-MONITOR-061) — this assertion read the declared `entry.tools` of a RUNNING agent until that repair.
    const r = runLevelAgent(session({ agents: [agent({ toolCalls: 2 })], entryTools: { resolved: ['read_file', 'delegate'], called: [], active: [] } }), entry, false)!;
    expect(r).toMatchObject({ id: RUN_AGENT_ID, name: 'orchestrator', persona: 'orchestrator', presentationState: 'running', live: true, toolCalls: 3, model: 'scripted/alpha', reasoning: 'high', grantedTools: ['read_file', 'delegate'], contextUsed: 0, contextLimit: DEFAULT_CONTEXT_CAPACITY, completedAt: null });
    // With no live instance the persona's declared tools stand in (REQ-MONITOR-060).
    expect(runLevelAgent(session({ executionStatus: 'completed' }), entry, false)).toMatchObject({ presentationState: 'done', live: false, completedAt: '2026-09-05T10:05:00.000Z', grantedTools: ['delegate', 'read_file'] });
    expect(runLevelAgent(session({ executionStatus: 'failed' }), entry, false)?.presentationState).toBe('failed');
    expect(runLevelAgent(session({ executionStatus: 'paused' }), entry, false)?.presentationState).toBe('cancelled');
    expect(runLevelAgent(session({ runStartedAt: null }), entry, false)).toBeNull();
    // REQ-MONITOR-117/119: the entry agent's own stall figure, while its run is live; none once it has ended.
    expect(runLevelAgent(session({ entryStalledSeconds: 90 }), entry, false)?.stalledSeconds).toBe(90);
    expect(runLevelAgent(session({ executionStatus: 'completed', entryStalledSeconds: 90 }), entry, false)?.stalledSeconds).toBeNull();
    expect(runLevelAgent(null, entry, false)).toBeNull();
  });
  it('REQ-MONITOR-044/052 (acceptance A20): the run-level agent\'s count is the session\'s own figure for it, which holds the calls its running turn has made; with none, the total less the children', () => {
    const entry = { persona: 'orchestrator', model: 'scripted/alpha', reasoning: 'high', tools: [] };
    // The artifacts-proof screenshot's state: the root's turn has made two calls the total does not hold yet, and a child's
    // live count is ahead of the total too. The total less the children read 0 beside the root's used chips.
    const live = session({ toolCalls: { total: 0, agents: 1, byTool: [] }, agents: [agent({ toolCalls: 1 })], entryTools: { resolved: ['delegate', 'artifact_write'], called: ['delegate', 'artifact_write'], active: [] }, entryToolCalls: 2 });
    expect(runLevelAgent(live, entry, false)?.toolCalls).toBe(2);
    expect(metaLine(runLevelAgent(live, entry, false)!, live, '8s')).toBe('running · 8s · 2 tool calls');
    // A record with no projection still derives it.
    expect(runLevelAgent(session({ agents: [agent({ toolCalls: 2 })] }), entry, false)?.toolCalls).toBe(3);
  });
  /*
   * docs/defects/fixed/the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md: the run-level
   * agent's Model was the entry role's (the configured key, or the override in force), so with alpha held out of quota and the
   * root moved to beta before its first call, the inspector read "alpha" while every call went to beta.
   */
  it('REQ-MONITOR-052/066/069: while the run is live the run-level agent names the key its root runs on; at rest, the entry role\'s', () => {
    const entry = { persona: 'orchestrator', model: 'alpha', reasoning: 'high', tools: [] };
    // A live record whose root's cell moved to beta (a same-tier or pre-call move) draws the run-level agent on beta.
    expect(runLevelAgent(session({ entryModelKey: 'beta' }), entry, false)?.model).toBe('beta');
    // Before the cell exists (null) the entry role's key stands in.
    expect(runLevelAgent(session({ entryModelKey: null }), entry, false)?.model).toBe('alpha');
    // At rest the entry role's key — the configured key or the override `entryRole` resolved — whatever a record carried.
    expect(runLevelAgent(session({ executionStatus: 'completed', entryModelKey: 'beta' }), entry, false)?.model).toBe('alpha');
    expect(runLevelAgent(session({ executionStatus: 'paused', resumable: { iteration: 1, agents: 2 }, entryModelKey: 'beta' }), entry, false)?.model).toBe('alpha');
    // The entry role itself is untouched: what the composer's chip and the strip name for the next run (REQ-MONITOR-146, REQ-SHELL-043).
    expect(runLevelModel(session({ entryModelKey: 'beta' }), 'gamma', true)).toBe('beta');
    expect(runLevelModel(session({ entryModelKey: 'beta' }), 'gamma', false)).toBe('gamma');
  });
  /*
   * docs/defects/fixed/the-inspector-and-a-persona-window-show-per-agent-metrics-without-the-compression-count.md: the
   * run-level agent's compression count summed `session.agents`, which holds the children alone, so a root's own
   * compressions were counted nowhere. It is the run-wide count the session carries (REQ-MONITOR-086, OQ-159's reading).
   */
  it('REQ-MONITOR-086/281: a root that compressed twice and a child that compressed once read 3 across the run and 1 on the child, each labelled', () => {
    const entry = { persona: 'orchestrator', model: 'scripted/alpha', reasoning: 'high', tools: [] };
    const child = agent({ compressions: 1 });
    const s = session({ agents: [child], compressions: 3 });
    const run = runLevelAgent(s, entry, false)!;
    expect(run.compressions).toBe(3);
    expect(child.compressions).toBe(1);
    expect(compressionLine(run)).toBe('3 compressions across the run');
    expect(compressionLine(child)).toBe("1 compression of this agent's context");
    expect(compressionLine(agent({ compressions: 0 }))).toBe("0 compressions of this agent's context");
    // The meta line keeps REQ-MONITOR-052's form: the count is a line of its own, never appended to it.
    expect(metaLine(run, s, '8s')).toBe('running · 8s · 3 tool calls');
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
  /*
   * Found by the fourth review of the repair of a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record
   * (docs/defects/fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md): a root resumed as the entry role keeps
   * its own persona's name on its rows, so matching them by the entry persona alone dropped every one of them.
   */
  it('PD-ORCH-005 clause 4 with OQ-97: a root resumed as the entry role keeps its own persona\'s name on its rows, and the run-level agent still owns them (REQ-MONITOR-071) and is the agent they are followed to (REQ-MONITOR-053); a child of the entry persona stays its own', () => {
    const coding = agent({ id: 'bg_00000009', name: 'coder', persona: 'coding-agent' });
    // The entry role is `coding-agent` now; the session's roots were opened as `orchestrator` (`SessionRecord.entryRoots`).
    const roots = [{ name: 'orchestrator', canonical: 'orchestrator' }];
    const fallback = runLevelAgent(session({ agents: [coding], entryRoots: roots }), { persona: 'coding-agent', model: 'm', reasoning: 'medium', tools: [] }, false)!;
    const rows = [
      row({ index: 1, kind: 'agent', persona: 'orchestrator', name: 'orchestrator' }),
      row({ index: 2, kind: 'agent', persona: 'coding-agent', name: 'orchestrator' }),
      row({ index: 3, kind: 'tool', persona: 'coding-agent', name: 'orchestrator', toolName: 'grep' }),
      row({ index: 4, kind: 'tool', persona: 'coding-agent', name: 'coder', toolName: 'grep' }),
    ];
    expect(rowsOf(rows, fallback, roots).map((r) => r.index)).toEqual([1, 2, 3]);
    expect(rowsOf(rows, coding, roots).map((r) => r.index)).toEqual([4]);
    // The root's row written before the rest, under the persona it ran as then, is followed to the run-level agent too.
    expect(followedAgent(rows.slice(0, 1), [coding], fallback, roots)?.id).toBe(RUN_AGENT_ID);
    expect(followedAgent(rows, [coding], fallback, roots)?.id).toBe(coding.id);
  });
});

/*
 * REQ-MONITOR-060/069 with PD-ORCH-003 (docs/defects/fixed/after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md):
 * the entry persona can change between runs, and the run-level agent's chips are marked from the latest root's history
 * (`entryToolsOf`). Its name, its model and reasoning and the declared tools that stand in for its grant come from that
 * same root's persona, not the first root's. Until 2026-10-01 they came from the transcript's first root row, so after an
 * iteration as `orchestrator` and a plan cycle as `reviewer` the inspector drew `orchestrator`'s fourteen tools with
 * `reviewer`'s `glob` marked used.
 */
describe('entryRole — the run-level agent is drawn as the latest root (REQ-MONITOR-060, PD-ORCH-003)', () => {
  const roles = [
    { role: 'orchestrator', effectiveModel: 'large', rawThinking: 'high', declaredTools: ['read_file', 'grep', 'glob', 'write_file'] },
    { role: 'reviewer', effectiveModel: 'scripted', rawThinking: null, declaredTools: ['glob', 'read_file', 'todo'] },
  ];
  it('rows for an orchestrator root then a reviewer root draw the reviewer, with its declared tools, model and reasoning', () => {
    const rows = [
      row({ index: 0, kind: 'user', body: 'read the readme' }),
      row({ index: 1, kind: 'agent', name: 'orchestrator', persona: 'orchestrator' }),
      row({ index: 2, kind: 'agent', name: 'helper', persona: 'coding-agent' }),
      row({ index: 3, kind: 'user', body: 'now review it' }),
      row({ index: 4, kind: 'agent', name: 'reviewer', persona: 'reviewer' }),
      row({ index: 5, kind: 'agent', name: 'helper', persona: 'coding-agent' }),
    ];
    expect(entryRole(roles, rows, [agent({ name: 'helper' })])).toEqual({ persona: 'reviewer', model: 'scripted', reasoning: 'medium', tools: ['glob', 'read_file', 'todo'] });
  });
  it('REQ-CHAT-006 / REQ-SESSION-026: with a session-wide override in force the entry role names the model it runs on', () => {
    const rows = [row({ index: 0, kind: 'agent', name: 'orchestrator', persona: 'orchestrator' })];
    // The record's `to` is already the end of the override chain (the engine follows it, `overridesInForce`).
    expect(entryRole(roles, rows, [], [], null, [{ from: 'large', to: 'beta' }]).model).toBe('beta');
    // An override of another key leaves the configured one; none at all is the configured one too.
    expect(entryRole(roles, rows, [], [], null, [{ from: 'scripted', to: 'beta' }]).model).toBe('large');
    expect(entryRole(roles, rows, [], [], null, []).model).toBe('large');
  });
  it('a row named for one of the session\'s roots is preferred, so a child\'s row ahead of its record cannot pass for the latest root', () => {
    const rows = [row({ index: 0, kind: 'agent', name: 'reviewer', persona: 'reviewer' }), row({ index: 1, kind: 'agent', name: 'fresh', persona: 'coding-agent' })];
    expect(entryRole(roles, rows, [], [{ name: 'reviewer' }]).persona).toBe('reviewer');
    // OQ-97: a root resumed under a fallback keeps its own name on its rows while their persona is the role it runs as.
    const resumed = [row({ index: 0, kind: 'agent', name: 'orchestrator', persona: 'orchestrator' }), row({ index: 1, kind: 'agent', name: 'house-style', persona: 'reviewer' })];
    expect(entryRole(roles, resumed, [], [{ name: 'orchestrator' }, { name: 'house-style' }]).persona).toBe('reviewer');
  });
  /*
   * The verifier's finding on the first repair: a turn writes an `agent` row only when text arrives, and its tool calls,
   * reasoning and diffs carry the same persona and name. Read from `agent` rows alone, a switched root whose first steps were
   * tool calls was drawn as the previous root, under the chips its own calls marked, until its first text.
   */
  it('a latest root that has written only tool, reasoning or diff rows is drawn, not the root before it', () => {
    const roots = [{ name: 'orchestrator' }, { name: 'reviewer' }];
    const before = [row({ index: 0, kind: 'user', body: 'read the readme' }), row({ index: 1, kind: 'agent', name: 'orchestrator', persona: 'orchestrator' }), row({ index: 2, kind: 'user', body: 'now review it' })];
    for (const kind of ['tool', 'thinking', 'diff'] as const) {
      const rows = [...before, row({ index: 3, kind, name: 'reviewer', persona: 'reviewer', ...(kind === 'tool' ? { toolName: 'glob' } : {}) })];
      expect(entryRole(roles, rows, [], roots)).toEqual({ persona: 'reviewer', model: 'scripted', reasoning: 'medium', tools: ['glob', 'read_file', 'todo'] });
    }
    // A row that names no author (a system notice) is no root's.
    expect(entryRole(roles, [...before, row({ index: 3, kind: 'system', body: 'Intent classified: question' })], [], roots).persona).toBe('orchestrator');
  });
  it('while a run is live, the persona its root runs as (`SessionRecord.entryPersona`) is drawn, before that root has written any row', () => {
    const rows = [row({ index: 0, kind: 'agent', name: 'orchestrator', persona: 'orchestrator' }), row({ index: 1, kind: 'user', body: 'now review it' })];
    expect(entryRole(roles, rows, [], [{ name: 'orchestrator' }], 'reviewer')).toEqual({ persona: 'reviewer', model: 'scripted', reasoning: 'medium', tools: ['glob', 'read_file', 'todo'] });
    // At rest (no live run) the transcript decides.
    expect(entryRole(roles, rows, [], [{ name: 'orchestrator' }], null).persona).toBe('orchestrator');
  });
  it('one root, a child\'s rows after it, or no root row at all', () => {
    const rows = [row({ index: 0, kind: 'agent', name: 'orchestrator', persona: 'orchestrator' }), row({ index: 1, kind: 'agent', name: 'helper', persona: 'coding-agent' })];
    expect(entryRole(roles, rows, [agent({ name: 'helper' })])).toEqual({ persona: 'orchestrator', model: 'large', reasoning: 'high', tools: ['read_file', 'grep', 'glob', 'write_file'] });
    expect(entryRole(roles, [], []).persona).toBe('orchestrator');
    expect(entryRole([], [row({ kind: 'agent', name: 'reviewer', persona: 'reviewer' })], [])).toEqual({ persona: 'reviewer', model: '', reasoning: 'medium', tools: [] });
  });
});

describe('agents — chips, enablement, cascade, pause (REQ-MONITOR-060/062/063/064, 274/276)', () => {
  it('chips follow the resolved set in its own order and only their marks change on a state change', () => {
    const before = chipStates(['read_file', 'grep', 'terminal'], ['grep'], ['grep']);
    const after = chipStates(['read_file', 'grep', 'terminal'], ['grep'], []);
    expect(before.map((c) => c.name)).toEqual(after.map((c) => c.name));
    expect(before.map((c) => c.state)).toEqual(['not used', 'active', 'not used']);
    expect(after.map((c) => c.state)).toEqual(['not used', 'used', 'not used']);
    expect(resolvedTools(agent({ grantedTools: [], grantRecorded: false }), ['a', 'b'])).toEqual(['a', 'b']);
    expect(resolvedTools(agent({ grantedTools: ['x'] }), ['a'])).toEqual(['x']);
  });
  /*
   * REQ-MONITOR-049/060 with REQ-TOOLS-006 (docs/defects/fixed/a-grant-the-controls-left-empty-reads-as-no-grant-recorded.md):
   * a grant the controls left empty of native tools is a recorded grant, and the declared tools do not stand in for it.
   * Until 2026-10-01 an empty list read as "no grant recorded", so the inspector listed every tool the controls removed.
   */
  it('REQ-MONITOR-049 / REQ-TOOLS-006: a recorded empty grant lists no native tool; an unrecorded one lets the declared tools stand in', () => {
    expect(resolvedTools(agent({ grantedTools: [], grantRecorded: true, live: false }), ['read_file', 'grep'])).toEqual([]);
    expect(resolvedTools(agent({ grantedTools: [], grantRecorded: true, live: true }), ['read_file', 'grep'])).toEqual([]);
    expect(resolvedTools(agent({ grantedTools: [], grantRecorded: false, live: false }), ['read_file', 'grep'])).toEqual(['read_file', 'grep']);
    expect(resolvedTools(agent({ grantedTools: ['read_file'], grantRecorded: true }), ['read_file', 'grep'])).toEqual(['read_file']);
  });
  it('Steer while running or waiting; Cancel while running, waiting or queued; Pop out always for a shown agent', () => {
    expect(inspectorEnablement('running')).toEqual({ steer: true, cancel: true, popOut: true });
    expect(inspectorEnablement('waiting')).toEqual({ steer: true, cancel: true, popOut: true });
    expect(inspectorEnablement('queued')).toEqual({ steer: false, cancel: true, popOut: true });
    expect(inspectorEnablement('done')).toEqual({ steer: false, cancel: false, popOut: true });
    expect(inspectorEnablement(null)).toEqual({ steer: false, cancel: false, popOut: false });
  });
  it('the cascade reaches unfinished descendants only, never a settled one, and the run cascades to every unfinished agent (its reach to a paused one, OQ-100, is pinned below)', () => {
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
    expect(metaLine(agent({ toolCalls: 1 }), null, '12s')).toBe('running · 12s · 1 tool call');
    expect(metaLine(agent({ toolCalls: 0 }), null, null)).toBe('running · — · 0 tool calls');
    // REQ-ORCH-089 / REQ-MONITOR-119: a stalled agent's line ends with the watch's figure.
    expect(metaLine(agent({ toolCalls: 1, stalledSeconds: 95 }), null, '12s')).toBe('running · 12s · 1 tool call · stalled\u00a095s');
    expect(countNoun(1, 'instance')).toBe('1 instance');
    expect(countNoun(2, 'instance')).toBe('2 instances');
  });
  it('REQ-MONITOR-127/130 with OQ-165\'s reading: the run-level agent\'s meta line reads the run\'s `cancelling` while it is live and the shown session cancels; a child keeps its own state', () => {
    const entry = { persona: 'orchestrator', model: 'scripted/alpha', reasoning: 'high', tools: [] };
    // The confirmed cancel's overlay (or the stop's own record) reads `cancelling`; the run-level agent is still live.
    const cancelling = session({ executionStatus: 'cancelling', entryToolCalls: 3 });
    const runLevel = runLevelAgent(cancelling, entry, false)!;
    expect(runLevel.presentationState).toBe('running');
    expect(metaLine(runLevel, cancelling, '1m 4s')).toBe('cancelling · 1m 4s · 3 tool calls');
    // A child is settled by the engine in the teardown: the run's cancel shows no agent cancelled before it does.
    expect(metaLine(agent({ toolCalls: 1 }), cancelling, '12s')).toBe('running · 12s · 1 tool call');
    // Before the confirmation, and once the record at rest arrives, the agent vocabulary reads.
    expect(metaLine(runLevel, session({}), '1m 4s')).toBe('running · 1m 4s · 3 tool calls');
    const atRest = session({ executionStatus: 'stopped', entryToolCalls: 3 });
    expect(metaLine(runLevelAgent(atRest, entry, false)!, atRest, null)).toBe('cancelled · — · 3 tool calls');
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

describe('agents — PD-ORCH-005 clause 13 (revision 4): a paused agent presents as paused (OQ-100)', () => {
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
  it('OQ-103 (R-067): in REQ-CHAT-008\'s recovery state with nothing to resume — an accepted explicit cancel the host died before carrying out — the run-level agent is presented ended as the repair will leave it, not live, and offered neither Steer nor Cancel', () => {
    for (const executionStatus of ['running', 'starting', 'cancelling']) {
      const shown = runLevelAgent(session({ executionStatus, resumable: null, entryTools: { resolved: ['delegate'], called: [], active: ['delegate'] } }), entry, true)!;
      expect(shown, executionStatus).toMatchObject({ state: 'cancelled', presentationState: 'cancelled', live: false, activeTools: [] });
      expect(shown.completedAt, executionStatus).not.toBeNull();
      expect(inspectorEnablement(shown.presentationState), executionStatus).toEqual({ steer: false, cancel: false, popOut: true });
      expect(cancelOffered(shown, false, false), executionStatus).toBe(false);
      // What the repair then writes — `interrupted`, nothing open — presents the same.
      expect(runLevelAgent(session({ executionStatus: 'interrupted', resumable: null }), entry, false)).toMatchObject({ presentationState: 'cancelled', live: false });
    }
    // A live run with nothing open — no recovery — is still running.
    expect(runLevelAgent(session({ executionStatus: 'running', resumable: null }), entry, false)).toMatchObject({ presentationState: 'running', live: true });
  });
  it('the inspector\'s meta line names it; it is not live, so it offers no steer, and its Cancel is clause 16\'s alone', () => {
    const paused = agent({ id: 'bg_00000002', parentId: 'bg_00000001', state: 'paused', presentationState: 'paused', live: false, interruption: 'stop' });
    expect(metaLine(paused, null, null)).toBe('paused · — · 2 tool calls');
    // REQ-MONITOR-063's live-agent rule offers a paused agent nothing but Pop out; `cancelOffered` decides its Cancel.
    expect(inspectorEnablement('paused')).toEqual({ steer: false, cancel: false, popOut: true });
  });
});

describe('agents — PD-ORCH-005 clause 16 (revision 4): one paused child is cancellable while its session rests (OQ-101)', () => {
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

describe('agents — PD-ORCH-005 clause 13 (revision 4): a live agent\'s cancel still ends its paused descendants, and says so (OQ-100)', () => {
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

describe('agents — PD-ORCH-005 clause 16 (revision 4): a paused child\'s confirmation names every descendant its cancel ends (OQ-101)', () => {
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
