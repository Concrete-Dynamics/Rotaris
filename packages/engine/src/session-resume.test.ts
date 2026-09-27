import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type Result, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, type AgentBackend } from '@rotaris/model';
import { buildContinuationPayload, RUN_CONFIG_DEFAULTS, Sessions, type Preflight, type PreflightContext, type RunSetup, type TodoDocument } from './index.js';

const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const OTHER = mintMachineId('0000000000000000000000000000000b') as MachineId;
const MODEL = { providerId: 'test', modelId: 'test', dialect: 'chat' as const };

describe('persisted session resume and continue (REQ-SESSION-083/112..118)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-resume-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const makeSessions = (pid: number, backend: AgentBackend, extras: { preflight?: (ctx: PreflightContext) => Promise<Preflight>; isProcessAlive?: (pid: number) => boolean } = {}) => new Sessions({
    clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid, host: HOST,
    retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-resume',
    model: { backend, config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => '' } },
    sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid),
    ...(extras.preflight ? { preflight: extras.preflight } : {}),
    ...(extras.isProcessAlive ? { isProcessAlive: extras.isProcessAlive } : {}),
  });

  const child = (sid: SessionId) => ({
    session_id: sid, task_id: 'bg_00000001', canonical_name: 'old-child', given_name: 'old-child', persona: 'coding-agent', state: 'running', parent_id: 'root', depth: 1, iteration: 1,
    model_key: 'm', category: '', background: 1, task: 'old work', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: '2026-09-04T00:00:00.000Z',
  });

  /**
   * REQ-WORKSPACE-050, the context half: the root a run EXECUTES in reaches configuration, which is where the
   * run host turns it into the workspace-context reader. The recorded defect was that it did not — an isolated
   * session was given the BASE workspace's instruction files, never its worktree's. A continuation of that
   * session owes the same root, which it reads back from the stored binding rather than from a start argument.
   */
  it('REQ-WORKSPACE-050: an isolated session hands configuration the worktree as its execution root, at start and at every continuation', async () => {
    const client = new ScriptedModelClient([answer('one'), answer('two')]);
    const backend = new DefaultAgentBackend(client);
    const roots: { workspaceRoot: string; executionRoot: string }[] = [];
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 77, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-isolated',
      model: null, sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid),
      configure: (workspaceRoot, ctx): Result<RunSetup, { readonly reason: string }> => {
        roots.push({ workspaceRoot, executionRoot: ctx.executionRoot });
        return { ok: true, value: { model: { backend, config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => '' } }, runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' } } };
      },
    });
    // A real directory: a continuation refuses a binding whose tree has gone (REQ-GIT-157).
    const tree = join(dir, 'worktrees', 'S-isolated');
    mkdirSync(tree, { recursive: true });
    const started = sessions.start(dal, 'C:/ws', 'build it', {
      worktree: { worktree_path: tree, branch: 'feat/x', base_branch: 'main', base_revision: 'abc', created_by_session: true, merge_status: 'ready', integration_session_id: null },
    });
    if (!started.ok) throw new Error(started.error.reason);
    await sessions.running(started.value);
    const again = sessions.prompt(started.value, 'keep going');
    if (!again.ok) throw new Error(again.error.reason);
    await sessions.running(started.value);
    // The record stays anchored to the base workspace; the run works in the tree, both times.
    expect(roots).toEqual([{ workspaceRoot: 'C:/ws', executionRoot: tree }, { workspaceRoot: 'C:/ws', executionRoot: tree }]);
  });

  it('reopens the same identity, sweeps orphans at the continue (never at the load, PD-ORCH-005 clause 8), continues ordinals and carries prior intent', async () => {
    const client = new ScriptedModelClient([answer('first answer', { input: 10, output: 4 }), answer('second answer', { input: 7, output: 3 })]);
    const backend = new DefaultAgentBackend(client);
    const priorContexts: (string | null | undefined)[] = [];
    const preflight = async (ctx: PreflightContext): Promise<Preflight> => {
      priorContexts.push(ctx.previousIntent);
      const carried = ctx.previousIntent !== undefined && ctx.previousIntent !== null;
      return {
        intent: { category: carried ? ctx.previousIntent! : 'single_file_change', confidence: carried ? null : 0.9, reason: carried ? 'continued' : 'fresh', fallback: false, carried_over: carried },
        grant: 'direct-work', route: 'work', resolvedPlaybooks: {}, playbookFor: () => '', budgetCell: null, warnings: [],
      };
    };
    const first = makeSessions(77, backend, { preflight });
    const started = first.start(dal, 'C:/ws', 'build it');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    await first.running(sid);
    const persisted = { ...dal.getSession(sid)! };
    const launchAudit = dal.getLaunchAudit(sid)!.payload;
    dal.insertChild(child(sid));

    const resumed = makeSessions(88, backend, { preflight, isProcessAlive: () => false });
    const opened = resumed.resume(dal, 'C:/ws', sid);
    expect(opened).toEqual({ ok: true, value: { sessionId: sid } });
    expect(dal.getSession(sid)).toEqual(persisted);
    // Loading a session to view it changes no agent record; the settle happens when a run is about to start.
    expect(dal.getChild(sid, 'bg_00000001')).toMatchObject({ state: 'running', report_stored: 0 });
    expect(dal.getLock(sid)).toMatchObject({ pid: 88, host: HOST });

    expect(resumed.prompt(sid, 'continue').ok).toBe(true);
    await resumed.running(sid);
    // REQ-ORCH-053: the orphan belongs to no open iteration, so the continue settles it cancelled before its first iteration.
    expect(dal.getChild(sid, 'bg_00000001')).toMatchObject({ state: 'cancelled', report_stored: 1 });
    expect(priorContexts).toEqual([undefined, 'single_file_change']);
    const continuation = client.requests[1]!.messages
      .flatMap((message) => message.content.map((part) => part.kind === 'text' ? part.text : null))
      .find((text) => text?.includes('Authoritative session handoff:'));
    if (!continuation) throw new Error('expected continuation text');
    expect(continuation).toContain('Latest user request:\ncontinue');
    expect(continuation).toContain('Authoritative session handoff:');
    expect(continuation).toContain('Recent session context:');
    expect(continuation).toContain('first answer');

    const stored = dal.getSession(sid)!;
    expect(stored).toMatchObject({ session_id: sid, workspace_root: 'C:/ws', created_at: persisted.created_at, iterations_completed: 2, tokens_input: 17, tokens_output: 7 });
    expect(dal.eventsOfKind(sid, 'iteration.start').map((event) => event.iteration)).toEqual([1, 2]);
    expect(dal.getLaunchAudit(sid)!.payload).toBe(launchAudit);
    expect(dal.residentRows(sid).filter((row) => row.kind === 'user').map((row) => row.body)).toEqual(['build it', 'continue']);
    expect(dal.residentRows(sid).some((row) => row.body === 'Intent classified: single_file_change (continued from previous run)')).toBe(true);
    expect(dal.getLock(sid)).toBeUndefined();
  });

  it('formats the exact continuation caps and todo elision marker', () => {
    const sid = asSessionId('S-payload');
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: new Date(clock.instant()).toISOString(), updated_at: new Date(clock.instant()).toISOString() });
    dal.updateSessionRun(sid, { progress: JSON.stringify({ detail: 'p'.repeat(900) }) });
    for (let i = 0; i < 9; i += 1) dal.appendRow(sid, i, i % 2 ? 'agent' : 'user', true, `${i}:${'x'.repeat(900)}`, new Date(clock.instant()).toISOString());
    const todo: TodoDocument = { schema_version: 1, phases: [{ name: 'main', tasks: Array.from({ length: 22 }, (_, i) => ({ id: String(i), text: `task ${i} ${'z'.repeat(100)}`, state: 'complete' as const, consecutiveRetries: 0 })) }] };
    const payload = buildContinuationPayload(dal, dal.getSession(sid)!, 'next', todo);
    expect(payload).toContain('- [... additional todo tasks elided]');
    expect(payload.match(/^(user|agent):/gm)).toHaveLength(6);
    expect(payload).toContain('...');
    const context = payload.split('Recent session context:\n')[1]!;
    expect(context.length).toBeLessThanOrEqual(3_200);
  });

  it('reaps one dead local lock and preserves live local and foreign holders with distinct refusals', () => {
    const backend = new DefaultAgentBackend(new ScriptedModelClient([]));
    const makeRow = (id: string) => {
      const sid = asSessionId(id);
      dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: new Date(clock.instant()).toISOString(), updated_at: new Date(clock.instant()).toISOString() });
      return sid;
    };
    const dead = makeRow('S-dead');
    dal.claimLock(dead, 901, HOST, '2026-09-04T00:00:00.000Z');
    const deadResume = makeSessions(88, backend, { isProcessAlive: () => false });
    expect(deadResume.resume(dal, 'C:/ws', dead).ok).toBe(true);
    expect(dal.getLock(dead)).toMatchObject({ pid: 88, host: HOST });

    const live = makeRow('S-live');
    dal.claimLock(live, 902, HOST, '2026-09-04T00:00:00.000Z');
    const liveResult = makeSessions(89, backend, { isProcessAlive: () => true }).resume(dal, 'C:/ws', live);
    expect(!liveResult.ok && liveResult.error.reason).toContain('pid 902');

    const foreign = makeRow('S-foreign');
    dal.claimLock(foreign, 903, OTHER, '2026-09-04T01:02:03.000Z');
    const foreignResult = makeSessions(90, backend, { isProcessAlive: () => false }).resume(dal, 'C:/ws', foreign);
    expect(!foreignResult.ok && foreignResult.error.reason).toContain(`${OTHER}`);
    expect(!foreignResult.ok && foreignResult.error.reason).toContain('cannot establish whether that run is still going');
  });

  it('lists stored status text and marks only active unowned sessions stale', () => {
    const active = asSessionId('S-stale');
    const done = asSessionId('S-done');
    for (const [sid, status] of [[active, 'running'], [done, 'completed']] as const) dal.upsertSession({ session_id: sid, execution_status: status, workspace_root: 'C:/ws', created_at: new Date(clock.instant()).toISOString(), updated_at: new Date(clock.instant()).toISOString() });
    const sessions = makeSessions(77, new DefaultAgentBackend(new ScriptedModelClient([])), { isProcessAlive: () => false });
    expect(sessions.list(dal, 'C:/ws').map((row) => ({ id: row.sessionId, status: row.status, stale: row.stale }))).toEqual([
      { id: active, status: 'running', stale: true }, { id: done, status: 'completed', stale: false },
    ]);
  });
});
