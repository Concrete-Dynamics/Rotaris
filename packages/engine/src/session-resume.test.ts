import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type Result, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, type AgentBackend } from '@rotaris/model';
import { buildContinuationPayload, offersToldIn, RUN_CONFIG_DEFAULTS, Sessions, type Preflight, type PreflightContext, type RunSetup, type TodoDocument } from './index.js';

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

  it('REQ-SESSION-115\'s artifact is the latest one the session holds, never a line saying none is recorded (the repair of the-continuation-payload-says-no-artifact-is-recorded)', () => {
    const sid = asSessionId('S-artifact');
    const at = new Date(clock.instant()).toISOString();
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: at, updated_at: at });
    expect(buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined)).toContain('Artifact: (none recorded in this session)');
    const artifact = (id: string, title: string, summary: string, createdAt: string, supersededBy: string | null = null, kind: 'child_report' | 'agent_published' = 'child_report', findings = '- found the bug') => dal.insertArtifact({
      session_id: sid, id, slug: id, title, kind, source_task_id: 'bg_00000001', canonical_name: 'build', source_persona: 'coding-agent', status: kind === 'child_report' ? 'succeeded' : 'published',
      summary, key_findings: findings, highlight_paths: '[]', snippets: '[]', edited_files: '[]', created_files: '[]', commands: '[]', tags: '[]',
      supersedes: null, superseded_by: supersededBy, created_by: 'build', consumed_by: '[]', timeline_event_id: null, conversation_id: null, importance: 'normal',
      created_at: createdAt, edited_at: null, body_file: `${id}.md`,
    });
    artifact('a0000001', 'build report', 'The build was fixed.', '2026-09-27T01:00:00.000Z');
    artifact('a0000002', 'review report', 'The review found nothing.', '2026-09-27T02:00:00.000Z');
    // A superseded record is never the latest.
    artifact('a0000003', 'draft report', 'A draft.', '2026-09-27T03:00:00.000Z', 'a0000002');
    const payload = buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined);
    expect(payload).not.toContain('no orchestrator artifact is recorded');
    // Its id leads, so no cut reaches it (REQ-SESSION-194).
    expect(payload).toContain('Artifact: a0000002 — review report (child_report, succeeded)\nThe review found nothing.\nKey findings:\n- found the bug');
    expect(payload).not.toContain('A draft.');
    // At most 6,000 characters of it (REQ-SESSION-115's budget).
    artifact('a0000004', 'long report', 'w'.repeat(9_000), '2026-09-27T04:00:00.000Z');
    const long = buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined);
    const part = long.slice(long.indexOf('Artifact: '), long.indexOf('\nTodo:'));
    expect(part.length).toBe(6_000);
    expect(part.endsWith('...')).toBe(true);
    // A cut never splits a surrogate pair (found by phase 6's review): this one would fall between a pair's halves.
    artifact('a0000005', 'emoji report', `${'w'.repeat(5_900)}${'😀'.repeat(60)}`, '2026-09-27T05:00:00.000Z');
    const emoji = buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined);
    const tail = emoji.slice(emoji.indexOf('Artifact: '), emoji.indexOf('\nTodo:'));
    expect(tail.endsWith('...')).toBe(true);
    expect(/[\uD800-\uDBFF]$/.test(tail.slice(0, -3))).toBe(false);
    // A title is cut to 80 characters; the id before it never is.
    artifact('a0000007', 'T'.repeat(100), 'Long.', '2026-09-27T05:30:00.000Z');
    expect(buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined)).toContain(`Artifact: a0000007 — ${'T'.repeat(77)}... (child_report, succeeded)`);
    // A published document states its body once: its summary is the body's first line (REQ-LIBRARY-093).
    artifact('a0000006', 'notes', 'First line.', '2026-09-27T06:00:00.000Z', null, 'agent_published', 'First line.\nSecond line.');
    expect(buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined)).toContain('Artifact: a0000006 — notes (agent_published, published)\nFirst line.\nSecond line.\nTodo:');
  });

  it('PD-ORCH-004 revision 3 (found by phase 6\'s fourth review): an offer counts as told only when the conversation holds the offer itself, never for a mere mention of its task id', () => {
    const offer = 'Continuation offer: the remaining work may be delegated to a new child as a continuation of this one — call delegate with continuation_of: "bg_0000aa01". A piece of work is continued once; a continuation is not offered one of its own.';
    const told = offersToldIn([
      { role: 'user', content: [{ kind: 'text', text: `### build (coding-agent) — failed\n${offer}` }] },
      { role: 'tool', content: [{ kind: 'tool-result', callId: 'w1', name: 'wait_for_tasks', isError: false, result: offer.replaceAll('aa01', 'aa02') }] },
      { role: 'user', content: [{ kind: 'text', text: 'Open continuation offers (delegate with `continuation_of` set to the task id to take one up):\n- lint (bg_0000aa03)' }] },
      { role: 'assistant', content: [{ kind: 'text', text: 'I will look at bg_0000aa04 later.' }, { kind: 'tool-call', callId: 'b1', name: 'background_output', args: '{"task_id":"bg_0000aa05"}' }] },
      // The list inside a new iteration's handoff counts too, elision line and all; the line after it ends the list.
      { role: 'user', content: [{ kind: 'text', text: 'Progress: p\nOpen continuation offers (delegate with `continuation_of` set to the task id to take one up):\n- [... earlier continuation offers elided]\n- docs (bg_0000aa06)\nRecent iterations:\n- iteration 1 (bg_0000aa07)' }] },
    ]);
    expect([...told].sort()).toEqual(['bg_0000aa01', 'bg_0000aa02', 'bg_0000aa03', 'bg_0000aa06']);
  });

  it('PD-ORCH-004 revision 3: the handoff states every continuation offer no child has taken up, so a later run\'s root learns of it (OQ-72)', () => {
    const sid = asSessionId('S-offers');
    const at = new Date(clock.instant()).toISOString();
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: at, updated_at: at });
    expect(buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined)).not.toContain('Open continuation offers');
    const child = (id: string, name: string, continuationOf: string | null = null) => dal.insertChild({ session_id: sid, task_id: id, canonical_name: name, given_name: name, persona: 'coding-agent', state: 'failed', parent_id: 'bg_root0001', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: at, continuation_of: continuationOf });
    const offering = (id: string) => JSON.stringify({ status: 'failed', summary: 'timed out', cut_off: { statement: 's', changed_paths: [], changes: '', continuation_offer: `Continue with continuation_of: "${id}".` } });
    child('bg_00000a01', 'build');
    dal.setChildReport(sid, 'bg_00000a01', offering('bg_00000a01'));
    child('bg_00000a02', 'lint');
    dal.setChildReport(sid, 'bg_00000a02', offering('bg_00000a02'));
    child('bg_00000a03', 'lint-rest', 'bg_00000a02');
    const payload = buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined);
    expect(payload).toContain('Open continuation offers (delegate with `continuation_of` set to the task id to take one up):\n- build (bg_00000a01)\nRecent iterations:');
    expect(payload).not.toContain('- lint (bg_00000a02)');
    // Budgeted as every part of the handoff is: the newest ten, the rest elided (found by phase 6's second review).
    for (let i = 10; i < 21; i += 1) {
      const id = `bg_00000b${i}`;
      child(id, `task-${i}`);
      dal.setChildReport(sid, id, offering(id));
    }
    const many = buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined);
    const told = many.slice(many.indexOf('Open continuation offers'), many.indexOf('\nRecent iterations:')).split('\n');
    expect(told.slice(1, 3)).toEqual(['- [... earlier continuation offers elided]', '- task-11 (bg_00000b11)']);
    expect(told).toHaveLength(12);
    expect(told.at(-1)).toBe('- task-20 (bg_00000b20)');
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
