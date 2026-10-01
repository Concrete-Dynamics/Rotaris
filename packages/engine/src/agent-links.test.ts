import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls } from '@rotaris/model';
import type { SessionRecord } from '@rotaris/contracts';
import type { HookPort } from './hooks-port.js';
import { ArtifactStore } from './artifacts/store.js';
import { AgentActivity } from './children/activity.js';
import { RUN_CONFIG_DEFAULTS, Sessions, type SessionWriter, type ToolPort } from './index.js';
import { artifactLinksOf, entryToolCallsOf, entryToolsOf, toSessionRecord } from './sessions.js';

/**
 * Live-run finding K1 (R-067): the inspector drew "No tools resolved." and "No artifacts yet — this build has no artifact
 * store." in every screenshot of a run whose orchestrator had made fifteen calls and whose store held seven reports. The
 * session record now carries the run-level agent's tools (REQ-MONITOR-060/061) and the session's artifact links
 * (REQ-MONITOR-044/052/068/069); these are the two projections that fill it, against the real store.
 */
describe('engine — the run-level agent\'s tools and the session\'s artifact links on the session record (live-run finding K1)', () => {
  let dir: string;
  let dal: StoreDal;
  let sid: SessionId;
  const clock = new FakeClock();
  const store = () => new ArtifactStore({ dal, sessionId: sid, directory: () => join(dir, 'files'), wall: clock, warn: () => undefined });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-agent-links-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    sid = asSessionId('S-links');
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: '2026-09-29T00:00:00.000Z', updated_at: '2026-09-29T00:00:00.000Z' });
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  it('a stored record carries none of either until the live projection fills them', () => {
    const row = dal.getSession(sid)!;
    expect(toSessionRecord(row).entryTools).toEqual({ resolved: [], called: [], active: [] });
    expect(toSessionRecord(row).artifacts).toEqual([]);
  });

  it('REQ-MONITOR-060/061 with REQ-ORCH-153: a live run reports its own resolution and history; with none, nothing is resolved and the history is the tracker\'s under the latest root\'s persona, or, before any iteration, under every name that is no child\'s', () => {
    const activity = new AgentActivity();
    activity.started('orchestrator', 'c1', 'delegate');
    activity.settled('orchestrator', 'c1');
    activity.started('orchestrator', 'c2', 'todo');
    activity.started('planner-1', 'c3', 'grep');
    const live = { entryTools: { resolved: ['read_file', 'delegate', 'todo'], called: ['delegate', 'todo'], active: ['todo'] } };
    expect(entryToolsOf(dal, sid, live, activity)).toBe(live.entryTools);
    // No iteration recorded: every root so far was a plan cycle's (REQ-ORCH-153), named by no row, so the history is every
    // name the tracker holds that is no child's — here the root's, not the child `planner-1`'s (the repair of
    // the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md; it read none before).
    dal.insertChild({
      session_id: sid, task_id: 'bg_00000001', canonical_name: 'planner-1', given_name: 'planner-1', persona: 'planner', state: 'completed', parent_id: 'root', depth: 1, iteration: 1,
      model_key: 'm', category: '', background: 0, task: 'plan', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: '2026-09-29T00:00:00.000Z',
    });
    expect(entryToolsOf(dal, sid, null, activity)).toEqual({ resolved: [], called: ['delegate', 'todo'], active: [] });
    dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: 'root:1', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: '', task: 'the task', opened_at: '2026-09-29T00:00:01.000Z' });
    expect(entryToolsOf(dal, sid, undefined, activity)).toEqual({ resolved: [], called: ['delegate', 'todo'], active: [] });
  });

  it('PD-ORCH-003 with REQ-ORCH-153: after an iteration the history is the tracker\'s under whichever root ran last — a plan cycle\'s root recorded later than the latest iteration\'s, or that iteration\'s root', () => {
    const activity = new AgentActivity();
    activity.started('Builder', 'c1', 'glob');
    activity.settled('Builder', 'c1');
    activity.started('Reviewer', 'c2', 'grep');
    activity.settled('Reviewer', 'c2');
    dal.insertIteration({ session_id: sid, iteration: 1, root_task_id: 'root:1', root_canonical_name: 'builder', root_persona: 'Builder', todo_task_id: '', task: 'build', opened_at: '2026-09-29T00:00:01.000Z' });
    dal.closeIteration(sid, 1, 'succeeded', '2026-09-29T00:00:01.500Z');
    expect(entryToolsOf(dal, sid, null, activity)).toEqual({ resolved: [], called: ['glob'], active: [] });
    // A plan cycle re-armed after the iteration, its root under a switched entry persona (the repair of
    // a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md; it read `glob` before).
    dal.insertPlanRoot({ session_id: sid, root_task_id: 'root:plan-2', root_canonical_name: 'reviewer', root_persona: 'Reviewer', opened_at: '2026-09-29T00:00:02.000Z' });
    expect(entryToolsOf(dal, sid, null, activity)).toEqual({ resolved: [], called: ['grep'], active: [] });
    // That plan approved, an iteration opens after it under its persona's successor: the iteration's root ran last.
    activity.started('Fixer', 'c3', 'read_file');
    activity.settled('Fixer', 'c3');
    dal.insertIteration({ session_id: sid, iteration: 2, root_task_id: 'root:2', root_canonical_name: 'fixer', root_persona: 'Fixer', todo_task_id: '', task: 'fix', opened_at: '2026-09-29T00:00:03.000Z' });
    expect(entryToolsOf(dal, sid, null, activity)).toEqual({ resolved: [], called: ['read_file'], active: [] });
  });

  it('REQ-MONITOR-044/052: every artifact not superseded, with its producer, ready flag and consumers, in creation order', () => {
    const s = store();
    const plan = s.publish({ slug: 'the-plan', title: 'The plan', body: 'First.', tags: [], supersedes: null, createdBy: 'planner-1', persona: 'planner' });
    clock.advance(1000);
    const notes = s.publish({ slug: 'notes', title: 'Notes', body: 'Notes.', tags: [], supersedes: null, createdBy: 'orchestrator', persona: 'orchestrator' });
    if (!plan.ok || !notes.ok) throw new Error('publish');
    s.markConsumed(plan.value.id, 'coder-1');
    clock.advance(1000);
    const report = s.materialiseChildReport({ taskId: 'bg_00000001', canonicalName: 'coder-1', persona: 'coding-agent', status: 'failed', summary: 'It failed.', keyFindings: [], highlightPaths: [], snippets: [], editedFiles: [], createdFiles: [], commands: [], tags: [], conversationId: null });
    if (!report.ok) throw new Error(`materialise: ${report.error.reason}`);
    clock.advance(1000);
    const newer = s.publish({ slug: 'notes-v2', title: 'Notes, again', body: 'Notes 2.', tags: [], supersedes: notes.value.id, createdBy: 'orchestrator', persona: 'orchestrator' });
    if (!newer.ok) throw new Error('publish');
    const links = artifactLinksOf(dal, sid);
    expect(links.map((l) => l.slug)).toEqual(['the-plan', report.value.record.slug, 'notes-v2']);
    expect(links[0]).toEqual({ id: plan.value.id, slug: 'the-plan', title: 'The plan', status: 'published', producer: 'planner-1', ready: true, consumedBy: ['coder-1'] });
    expect(links[1]).toMatchObject({ producer: 'coder-1', status: 'failed', ready: false, consumedBy: [] });
  });
});

/**
 * docs/defects/fixed/the-run-level-agents-tool-call-count-reads-zero-while-its-turn-runs.md (acceptance A20, R-067): the surfaces
 * derived the run-level agent's `{N} tool calls` (REQ-MONITOR-052, REQ-MONITOR-044) as the session's total less the
 * children's, and the root's calls join that total only when its turn returns (REQ-ORCH-097's cadence, OQ-116), so while
 * the root's turn ran it read 0 beside the tools it had used. The session record now carries the run-level agent's own
 * count (`SessionRecord.entryToolCalls`): the roots' calls the total holds, plus the live root's calls it does not yet.
 */
describe('engine — the run-level agent\'s tool-call count while its turn runs (REQ-MONITOR-044/052)', () => {
  let dir: string;
  let dal: StoreDal;
  const clock = new FakeClock();
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-entry-calls-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const MODEL = { providerId: 'test', modelId: 'test', dialect: 'chat' as const };
  const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
  /** Each call recorded through the writer as the run host's gate records it (`openToolCall`, `settleToolCall`); `boom` raises once it is open. */
  const port = (writer: SessionWriter): ToolPort => ({
    specs: () => [{ name: 'grep', description: 'grep', parameters: { type: 'object' } }, { name: 'boom', description: 'raises', parameters: { type: 'object' } }],
    dispatch: async (c) => {
      const open = { call_id: c.callId, agent_name: c.agentName, tool_name: c.name, args: {} };
      const ordinal = writer.openToolCall(open);
      if (c.name === 'boom') throw new Error('the port raised');
      if (ordinal.ok) writer.settleToolCall(ordinal.value, open, { status: 'ok', elapsed_ms: 1, is_error: false, result: 'found' });
      return { text: 'found', isError: false, status: 'ok' as const, durationMs: 1, label: c.name, args: {} };
    },
    cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
  });

  it('counts the root\'s calls while its turn runs, then the same figure from the total once it returns, never twice', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const client = new ScriptedModelClient([
      toolCalls([{ callId: 'g1', name: 'grep', args: {} }, { callId: 'g2', name: 'grep', args: {} }], 'Searching.'),
      { parts: [{ hold }, ...answer('Done.').parts] },
    ]);
    const snapshots: SessionRecord[] = [];
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } }, pid: 82, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-entry-calls',
      model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => '' } },
      sessionFilesDir: (_store, s) => join(dir, 'sessions', s), tools: (ctx) => port(ctx.writer),
    });
    const sid = (sessions.start(dal, 'C:/ws', 'find it') as { value: SessionId }).value;
    let called = false;
    for (let i = 0; i < 200 && !called; i++) { await new Promise((r) => setTimeout(r, 5)); called = dal.toolCallsOf(sid).filter((c) => c.status !== 'running').length === 2; }
    expect(called).toBe(true);
    sessions.owner(sid)!.reconcile();
    const running = snapshots.at(-1)!;
    // The cause: the total does not hold the running root's calls yet, so the total less the children's read 0.
    expect(running.toolCalls.total).toBe(0);
    expect(running.entryToolCalls).toBe(2);
    release();
    expect((await sessions.running(sid)!).status).toBe('completed');
    sessions.owner(sid)!.reconcile();
    const done = snapshots.at(-1)!;
    expect(done.toolCalls.total).toBe(2);
    expect(done.entryToolCalls).toBe(2);
    await sessions.closeAll();
  });

  /*
   * The verifier's finding on the repair: the case above reads its post-return figure once the session has let go of the
   * run, where no run's uncounted term is added whether or not it was cleared. The run stays live after its root returns
   * — here held in REQ-HOOKS-080's `iteration_end`, which fires once the root's execution is over — and the root's two
   * calls are then in the total: the run-level agent's figure is still 2, never the total's 2 plus the tracker's 2.
   */
  /** A hook port whose `iteration_end` waits on `hold`, so the run stays live after its root's execution is over. */
  const holdingIterationEnd = (hold: Promise<void>, onHeld: () => void): HookPort => ({
    auditSnapshot: () => [],
    trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f'.repeat(64), loadWarning: '' }),
    announceWithheld: () => 0,
    hasHooksFor: () => true,
    fireLifecycle: async (event) => { if (event === 'iteration_end') { onHeld(); await hold; } return []; },
    advisory: () => '',
    toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
  });

  it.each([
    // The root's turn returns: its two calls join the total with its outcome.
    { how: 'returns', second: answer('Done.'), calls: 2 },
    // The root's turn raises out of a call (`boom`): its three started calls are counted from its record instead.
    { how: 'raises', second: toolCalls([{ callId: 'b1', name: 'boom', args: {} }]), calls: 3 },
  ])('REQ-MONITOR-044/052: once the root\'s turn $how and the run is still live, its calls are counted from the total alone, never twice', async ({ second, calls }) => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    let held = false;
    const client = new ScriptedModelClient([
      toolCalls([{ callId: 'g1', name: 'grep', args: {} }, { callId: 'g2', name: 'grep', args: {} }], 'Searching.'),
      second,
    ]);
    const snapshots: SessionRecord[] = [];
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } }, pid: 83, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-entry-calls-held',
      model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => '' } },
      sessionFilesDir: (_store, s) => join(dir, 'sessions', s), tools: (ctx) => port(ctx.writer), hooks: () => holdingIterationEnd(hold, () => { held = true; }),
    });
    const sid = (sessions.start(dal, 'C:/ws', 'find it') as { value: SessionId }).value;
    for (let i = 0; i < 200 && !held; i++) await new Promise((r) => setTimeout(r, 5));
    expect(held).toBe(true);
    sessions.owner(sid)!.reconcile();
    const between = snapshots.at(-1)!;
    // The run is live — the session still holds it — and the root's calls are in the total.
    expect(between.executionStatus).toBe('running');
    expect(between.toolCalls.total).toBe(calls);
    expect(between.entryToolCalls).toBe(calls);
    release();
    await sessions.running(sid);
    await sessions.closeAll();
  });

  it('a stored record carries no count of its own; the projection reads the roots\' share of the total, less every child\'s, with no run live', () => {
    const sid = asSessionId('S-entry-share');
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: '2026-09-29T00:00:00.000Z', updated_at: '2026-09-29T00:00:00.000Z' });
    dal.updateSessionRun(sid, { tool_calls: 7 });
    dal.insertChild({ session_id: sid, task_id: 'bg_child001', canonical_name: 'Research', given_name: 'Research', persona: 'researcher', state: 'succeeded', parent_id: 'root', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
    dal.setChildTodo(sid, 'bg_child001', null, 3);
    const row = dal.getSession(sid)!;
    expect(toSessionRecord(row).entryToolCalls).toBeNull();
    expect(entryToolCallsOf(row, dal.childrenOf(sid), null)).toBe(4);
    expect(entryToolCallsOf(row, dal.childrenOf(sid), { entryUncountedToolCalls: 2 })).toBe(6);
  });
});
