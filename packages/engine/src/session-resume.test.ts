import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type Result, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type AgentBackend, type ScriptedCall } from '@rotaris/model';
import { ArtifactStore, buildContinuationPayload, entryRootsOf, offersToldIn, RUN_CONFIG_DEFAULTS, Sessions, type ArtifactOps, type Preflight, type PreflightContext, type RunSetup, type SessionWriter, type TodoDocument, type ToolPort } from './index.js';
import { recordedRootNames } from './children/naming.js';
import { splitFrontmatter, type SessionRecord } from '@rotaris/contracts';

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

  /**
   * REQ-NOTIFY-060/061: a continuation refused at the confinement gate keeps its class through the engine (`confinement`),
   * so main reports it in REQ-NOTIFY-061's notice; any other configuration refusal stays `configuration`. Before the repair of
   * `docs/defects/fixed/a-refused-confinement-start-is-not-reported-as-req-notify-061-says.md` both read `configuration`.
   */
  it('REQ-NOTIFY-061: a continuation refused at the confinement gate is refused as `confinement`, another refusal as `configuration`', async () => {
    const client = new ScriptedModelClient([answer('one')]);
    const backend = new DefaultAgentBackend(client);
    let refuse: { readonly reason: string; readonly code?: 'confinement' } | null = null;
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 77, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-confined',
      model: null, sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid),
      configure: (): Result<RunSetup, { readonly reason: string; readonly code?: 'confinement' }> => refuse !== null
        ? { ok: false, error: refuse }
        : { ok: true, value: { model: { backend, config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => '' } }, runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' } } },
    });
    const started = sessions.start(dal, 'C:/ws', 'build it');
    if (!started.ok) throw new Error(started.error.reason);
    await sessions.running(started.value);
    refuse = { reason: 'Confinement is unavailable: bwrap is not on PATH. Install bubblewrap.', code: 'confinement' };
    expect(sessions.prompt(started.value, 'keep going')).toMatchObject({ ok: false, error: { code: 'confinement', reason: refuse.reason } });
    refuse = { reason: 'The configuration could not be loaded: runtime is not a mapping.' };
    expect(sessions.prompt(started.value, 'keep going')).toMatchObject({ ok: false, error: { code: 'configuration' } });
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
    // REQ-LIBRARY-092: its report is an artifact, as every terminal child's is (a-stale-settled-childs-report-is-never-an-artifact.md).
    expect(dal.artifactsOf(sid).filter((a) => a.source_task_id === 'bg_00000001').map((a) => [a.kind, a.status])).toEqual([['child_report', 'cancelled']]);
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

  /**
   * REQ-SESSION-115's "the last 5 outer-loop iterations", read from the timeline's `iteration_end` entries (REQ-ORCH-139's
   * vocabulary, REQ-ORCH-067's number, task, outcome and summary), which the run now writes as each iteration closes. The
   * repair of `the-follow-up-payloads-recent-iterations-read-timeline-entries-nothing-writes.md` (live-run finding P4):
   * nothing wrote such an entry, and the block always read "- (none recorded)".
   */
  it('REQ-SESSION-115: a follow-up after two iterations tells the root how each ended, from the timeline\'s iteration_end entries', async () => {
    const client = new ScriptedModelClient([answer('First done.'), answer('Second done: the parser now accepts tabs.'), answer('Third.')]);
    const sessions = makeSessions(91, new DefaultAgentBackend(client));
    const started = sessions.start(dal, 'C:/ws', 'write the parser');
    if (!started.ok) throw new Error(started.error.reason);
    await sessions.running(started.value);
    expect(sessions.prompt(started.value, 'make it accept tabs').ok).toBe(true);
    await sessions.running(started.value);
    expect(sessions.prompt(started.value, 'now document it').ok).toBe(true);
    await sessions.running(started.value);
    const ends = dal.timelineOf(started.value).filter((e) => e.name === 'iteration_end');
    expect(ends.map((e) => JSON.parse(e.metadata) as Record<string, unknown>).map((m) => [m['iteration'], m['outcome']])).toEqual([[1, 'succeeded'], [2, 'succeeded'], [3, 'succeeded']]);
    const third = client.requests[2]!.messages.find((m) => m.role === 'user')!.content.map((c) => (c.kind === 'text' ? c.text : '')).join('\n');
    const block = third.slice(third.indexOf('Recent iterations:'), third.indexOf('\n\nRecent session context:'));
    // Without the repair: "Recent iterations:\n- (none recorded)".
    expect(block).toBe('Recent iterations:\n- Iteration 1 (write the parser): succeeded — First done.\n- Iteration 2 (make it accept tabs): succeeded — Second done: the parser now accepts tabs.');
  });

  it('REQ-SESSION-115: the iterations block keeps the last five, each cut to 700 characters', () => {
    const sid = asSessionId('S-iterations');
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: new Date(clock.instant()).toISOString(), updated_at: new Date(clock.instant()).toISOString() });
    const at = new Date(clock.instant()).toISOString();
    for (let i = 1; i <= 7; i += 1) dal.insertTimeline(sid, i, at, 'iteration_end', 'rotaris', `Iteration ${i} (t): succeeded — ${'s'.repeat(i === 7 ? 900 : 5)}`, '{}', `t${i}`, 'info');
    const payload = buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined);
    const lines = payload.split('Recent iterations:\n')[1]!.split('\n\n')[0]!.split('\n');
    expect(lines.map((l) => /^- Iteration (\d)/.exec(l)?.[1])).toEqual(['3', '4', '5', '6', '7']);
    expect(lines[4]!.length).toBeLessThanOrEqual(2 + 700);
  });

  it('REQ-SESSION-115 / REQ-CHAT-040: a named task\'s line in the handoff is its display title, the name, not its content', () => {
    const sid = asSessionId('S-named');
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: new Date(clock.instant()).toISOString(), updated_at: new Date(clock.instant()).toISOString() });
    const todo: TodoDocument = { schema_version: 1, phases: [{ name: 'Queued Prompts', tasks: [{ id: '0123abcd-x', name: 'Queued Prompt: 0123abcd', text: `then do this ${'q'.repeat(100)}`, state: 'pending' as const, consecutiveRetries: 0 }] }] };
    const lines = buildContinuationPayload(dal, dal.getSession(sid)!, 'next', todo).split('\n').filter((l) => l.startsWith('- [pending] '));
    expect(lines).toEqual(['- [pending] Queued Prompt: 0123abcd']);
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

  it('PD-LIBRARY-003 (e), OQ-210: an artifact a person edited is carried as its document, without its frontmatter and marked `edited`; one whose document cannot be read falls back to its columns', () => {
    const sid = asSessionId('S-edited');
    const at = new Date(clock.instant()).toISOString();
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: at, updated_at: at });
    const files = join(dir, 'sessions', sid);
    const store = new ArtifactStore({ dal, sessionId: sid, directory: () => files, wall: clock, warn: () => undefined });
    const report = store.materialiseChildReport({ taskId: 'bg_00000e01', canonicalName: 'reconcile', persona: 'coding-agent', status: 'failed', summary: 'The reconciliation was completed.', keyFindings: ['all rows match'], editedFiles: [], createdFiles: [], commands: [], highlightPaths: [], snippets: [], tags: [] });
    if (!report.ok) throw new Error('report');
    const id = report.value.record.id;
    const payloadOf = () => buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined, store);
    // Unedited: the columns, as before.
    expect(payloadOf()).toContain(`Artifact: ${id} — reconcile report (child_report, failed)\nThe reconciliation was completed.\nKey findings:\n- all rows match\nTodo:`);
    const saved = store.body(id);
    if (!saved.ok) throw new Error('body');
    const frontmatter = splitFrontmatter(saved.value.text).frontmatter!;
    expect(store.editBody(id, `${frontmatter}\n# reconcile report\n\nCorrected by hand: the reconciliation was NOT completed.\n\n`).ok).toBe(true);
    const edited = payloadOf();
    expect(edited).toContain(`Artifact: ${id} — reconcile report (child_report, failed, edited)\n# reconcile report\n\nCorrected by hand: the reconciliation was NOT completed.\nTodo:`);
    expect(edited).not.toContain('id: "');
    expect(edited).not.toContain('The reconciliation was completed.');
    // Within the same 6,000 characters.
    expect(store.editBody(id, `${frontmatter}${'w'.repeat(9_000)}`).ok).toBe(true);
    const long = payloadOf();
    expect(long.slice(long.indexOf('Artifact: '), long.indexOf('\nTodo:')).length).toBe(6_000);
    // A document that cannot be read: the columns, unmarked.
    rmSync(join(files, report.value.record.bodyFile));
    expect(payloadOf()).toContain(`Artifact: ${id} — reconcile report (child_report, failed)\nThe reconciliation was completed.`);
    // No store at hand: the columns too.
    expect(buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined)).toContain(`(child_report, failed)\nThe reconciliation was completed.`);
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

  it('PD-ORCH-004 revision 3: the handoff states every continuation offer no child has taken up, so a later run\'s root learns of it (OQ-99)', () => {
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

  /*
   * ADR-0005, REQ-SESSION-083 (the repair of `a-continuation-in-the-process-that-ran-the-session-holds-no-lock.md` and
   * `a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`, R-067): every run releases the session's lock at
   * its teardown while the session stays live here, so a continue in the process that ran it claims the lock again before
   * its first write and holds it for the run — reaping a dead local holder once, and refusing, with REQ-SESSION-048's
   * words and nothing written, while another live process holds it.
   */
  describe('a continue in the process that ran the session holds the lock (ADR-0005, REQ-SESSION-047/048/083)', () => {
    const userRows = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'user').length;

    it('REQ-SESSION-083: a second and a third run in one process each hold the lock row for the run, and teardown gives it back', async () => {
      const sessions = makeSessions(77, new DefaultAgentBackend(new ScriptedModelClient([answer('one'), answer('two'), answer('three')])));
      const started = sessions.start(dal, 'C:/ws', 'build it');
      if (!started.ok) throw new Error(started.error.reason);
      const sid = started.value;
      await sessions.running(sid);
      expect(dal.getLock(sid)).toBeUndefined();
      for (const message of ['keep going', 'and more']) {
        expect(sessions.prompt(sid, message).ok).toBe(true);
        expect(dal.getLock(sid)).toMatchObject({ pid: 77, host: HOST });
        await sessions.running(sid);
        expect(dal.getLock(sid)).toBeUndefined();
      }
    });

    it('REQ-SESSION-083: the Continue action on a session paused in this process holds the lock for the run it launches', async () => {
      const sessions = makeSessions(77, new DefaultAgentBackend(new ScriptedModelClient([answer('one'), answer('two'), answer('three')])));
      const started = sessions.start(dal, 'C:/ws', 'pause me');
      if (!started.ok) throw new Error(started.error.reason);
      const sid = started.value;
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      await sessions.running(sid);
      expect(dal.getSession(sid)!.execution_status).toBe('paused');
      expect(dal.getLock(sid)).toBeUndefined();
      // A resolution that launches no run gives back the lock it took for itself.
      expect(sessions.continueSession(sid, 'cancel')).toEqual({ ok: true, value: { resumed: false, messageLimit: null } });
      expect(dal.getLock(sid)).toBeUndefined();
      expect(sessions.continueSession(sid, 'continue')).toEqual({ ok: true, value: { resumed: true, messageLimit: null } });
      expect(dal.getLock(sid)).toMatchObject({ pid: 77, host: HOST });
      await sessions.running(sid);
      expect(dal.getSession(sid)!.execution_status).toBe('completed');
      expect(dal.getLock(sid)).toBeUndefined();
    });

    it('REQ-SESSION-048/083: a live holder in another process refuses a continue by message and the Continue action, naming it, and nothing is written', async () => {
      const sessions = makeSessions(77, new DefaultAgentBackend(new ScriptedModelClient([answer('one'), answer('two')])), { isProcessAlive: () => true });
      const started = sessions.start(dal, 'C:/ws', 'pause me');
      if (!started.ok) throw new Error(started.error.reason);
      const sid = started.value;
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      await sessions.running(sid);
      const before = { rows: dal.residentRows(sid).length, users: userRows(sid), session: { ...dal.getSession(sid)! } };

      // A second instance on this machine loaded the session after this process's run released it.
      dal.claimLock(sid, 902, HOST, '2026-09-04T00:00:00.000Z');
      const local = sessions.prompt(sid, 'keep going');
      expect(local).toMatchObject({ ok: false, error: { code: 'lock-held-local' } });
      expect(!local.ok && local.error.reason).toContain('pid 902');
      const localContinue = sessions.continueSession(sid, 'continue');
      expect(localContinue).toMatchObject({ ok: false, error: { code: 'lock-held-local' } });
      expect(dal.getLock(sid)).toMatchObject({ pid: 902, host: HOST });

      // A lock naming another machine: REQ-SESSION-048's second case, never reaped.
      dal.releaseLock(sid, 902, HOST);
      dal.claimLock(sid, 903, OTHER, '2026-09-04T01:02:03.000Z');
      const foreign = sessions.prompt(sid, 'keep going');
      expect(foreign).toMatchObject({ ok: false, error: { code: 'lock-held-foreign' } });
      expect(!foreign.ok && foreign.error.reason).toContain(`${OTHER}`);
      expect(!foreign.ok && foreign.error.reason).toContain('cannot establish whether that run is still going');
      expect(sessions.continueSession(sid, 'continue')).toMatchObject({ ok: false, error: { code: 'lock-held-foreign' } });
      expect(dal.getLock(sid)).toMatchObject({ pid: 903, host: OTHER });

      // Nothing was written by any refusal, and no run started.
      expect(dal.residentRows(sid).length).toBe(before.rows);
      expect(userRows(sid)).toBe(before.users);
      expect(dal.getSession(sid)).toEqual(before.session);
      expect(sessions.run(sid)?.isEnded).toBe(true);
    });

    it('REQ-SESSION-047: a lock a dead local process left is reaped once, and the continue holds it for its run', async () => {
      const sessions = makeSessions(77, new DefaultAgentBackend(new ScriptedModelClient([answer('one'), answer('two')])), { isProcessAlive: (pid) => pid !== 901 });
      const started = sessions.start(dal, 'C:/ws', 'build it');
      if (!started.ok) throw new Error(started.error.reason);
      const sid = started.value;
      await sessions.running(sid);
      dal.claimLock(sid, 901, HOST, '2026-09-04T00:00:00.000Z');
      expect(sessions.prompt(sid, 'keep going').ok).toBe(true);
      expect(dal.getLock(sid)).toMatchObject({ pid: 77, host: HOST });
      await sessions.running(sid);
      expect(dal.getLock(sid)).toBeUndefined();
    });

    it('ADR-0005: a session loaded here keeps the lock its load claimed through the continue, and its teardown gives it back', async () => {
      const first = makeSessions(77, new DefaultAgentBackend(new ScriptedModelClient([answer('one')])));
      const started = first.start(dal, 'C:/ws', 'build it');
      if (!started.ok) throw new Error(started.error.reason);
      const sid = started.value;
      await first.running(sid);
      const resumed = makeSessions(88, new DefaultAgentBackend(new ScriptedModelClient([answer('two')])));
      expect(resumed.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(dal.getLock(sid)).toMatchObject({ pid: 88, host: HOST });
      expect(resumed.prompt(sid, 'keep going').ok).toBe(true);
      expect(dal.getLock(sid)).toMatchObject({ pid: 88, host: HOST });
      await resumed.running(sid);
      expect(dal.getLock(sid)).toBeUndefined();
    });
  });

  /*
   * ADR-0005, REQ-EVENTS-098, REQ-SESSION-060, REQ-GIT-094/058/062 (the repair of
   * `a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md`, R-067): a run's teardown releases the
   * lock while the session stays live here, so a write from outside a run through that live writer — the repair, the
   * safety checkpoint, the restore's outcome — claims the lock first: kept when this process holds it, taken (a dead
   * local holder reaped once) and given back otherwise, and refused with nothing written while another live process holds it.
   */
  describe('a write through a loaded session outside a run holds the lock (ADR-0005, REQ-EVENTS-098)', () => {
    const ranHere = async (isProcessAlive: (pid: number) => boolean = () => true) => {
      const sessions = makeSessions(77, new DefaultAgentBackend(new ScriptedModelClient([answer('one')])), { isProcessAlive });
      const started = sessions.start(dal, 'C:/ws', 'build it');
      if (!started.ok) throw new Error(started.error.reason);
      const sid = started.value;
      await sessions.running(sid);
      expect(dal.getLock(sid)).toBeUndefined();
      return { sessions, sid };
    };
    const refusedRestore = { sequence: 4, restored: false, safetySequence: null, changedPaths: 0, blockedReason: 'No checkpoint 4 is recorded.', forced: false, treeRoot: 'C:/ws', dirtyPaths: [], ref: null, commit: null };
    const safety = { sequence: 1, ref: 'refs/rotaris/checkpoints/S-resume/1', commit: 'c1', iteration: 0, childName: '', files: ['a.txt'], kind: 'pre_restore' as const };

    it('REQ-GIT-058/062: the safety checkpoint and the restore outcome are written under this process\'s lock, which is given back after', async () => {
      const { sessions, sid } = await ranHere();
      const writer = sessions.writer(sid)!;
      const seen: unknown[] = [];
      const recordCheckpoint = writer.recordCheckpoint.bind(writer);
      vi.spyOn(writer, 'recordCheckpoint').mockImplementation((input, keep) => { seen.push(dal.getLock(sid)); return recordCheckpoint(input, keep); });
      const recordRestore = writer.recordRestore.bind(writer);
      vi.spyOn(writer, 'recordRestore').mockImplementation((input) => { seen.push(dal.getLock(sid)); return recordRestore(input); });
      const recorded = sessions.recordSafetyCheckpoint(dal, sid, safety, 10);
      expect(recorded.ok).toBe(true);
      expect(sessions.recordRestore(dal, sid, refusedRestore).ok).toBe(true);
      expect(seen).toEqual([expect.objectContaining({ pid: 77, host: HOST }), expect.objectContaining({ pid: 77, host: HOST })]);
      expect(dal.getLock(sid)).toBeUndefined();
    });

    it('REQ-EVENTS-098: a live holder in another process refuses the safety checkpoint and the restore outcome, and nothing is written', async () => {
      const { sessions, sid } = await ranHere();
      const before = { rows: dal.residentRows(sid).length, checkpoints: dal.checkpointCount(sid), session: { ...dal.getSession(sid)! } };
      // A second instance on this machine loaded the session after this process's run released it.
      dal.claimLock(sid, 902, HOST, '2026-09-04T00:00:00.000Z');
      const checkpoint = sessions.recordSafetyCheckpoint(dal, sid, safety, 10);
      expect(checkpoint).toMatchObject({ ok: false, error: { code: 'lock-held' } });
      expect(!checkpoint.ok && checkpoint.error.reason).toContain('pid 902');
      expect(sessions.recordRestore(dal, sid, refusedRestore)).toMatchObject({ ok: false, error: { code: 'lock-held' } });
      dal.releaseLock(sid, 902, HOST);
      dal.claimLock(sid, 903, OTHER, '2026-09-04T01:02:03.000Z');
      expect(sessions.recordRestore(dal, sid, refusedRestore)).toMatchObject({ ok: false, error: { code: 'lock-held' } });
      expect(dal.getLock(sid)).toMatchObject({ pid: 903, host: OTHER });
      expect(dal.residentRows(sid).length).toBe(before.rows);
      expect(dal.checkpointCount(sid)).toBe(before.checkpoints);
      expect(dal.getSession(sid)).toEqual(before.session);
    });

    it('REQ-SESSION-060/047: the repair of a session loaded here reaps a dead local holder once, writes under its own lock and gives it back', async () => {
      const { sessions, sid } = await ranHere((pid) => pid !== 901);
      // A process that loaded the session after this one's run ended died mid-run, leaving it persisted busy.
      dal.upsertSession({ ...dal.getSession(sid)!, execution_status: 'running' });
      dal.claimLock(sid, 901, HOST, '2026-09-04T00:00:00.000Z');
      const writer = sessions.writer(sid)!;
      const seen: unknown[] = [];
      const save = writer.save.bind(writer);
      vi.spyOn(writer, 'save').mockImplementation((...args) => { seen.push(dal.getLock(sid)); return save(...args); });
      const report = sessions.repair(dal, 'C:/ws', { sessionId: sid });
      expect(report.repaired).toEqual([expect.objectContaining({ sessionId: sid, from: 'running', to: 'interrupted' })]);
      expect(seen).toEqual([expect.objectContaining({ pid: 77, host: HOST })]);
      expect(dal.getSession(sid)!.execution_status).toBe('interrupted');
      expect(dal.getLock(sid)).toBeUndefined();
    });
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

/**
 * PD-ORCH-005 clause 20 (revision 4): the handoff's artifact is the latest one the iteration's root published that
 * nothing supersedes and, when the root published none, the latest of any kind that nothing supersedes. The iteration is
 * the session's most recent recorded one (OQ-106), and its root is known by the task id its publishes carry.
 */
describe('PD-ORCH-005 clause 20: the handoff prefers the root\'s own artifact', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-handoff-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const seed = (sid: SessionId): void => {
    const at = new Date(clock.instant()).toISOString();
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: at, updated_at: at });
  };
  const iteration = (sid: SessionId, n: number, rootTaskId: string, openedAt = '2026-09-27T00:00:00.000Z'): void => dal.insertIteration({ session_id: sid, iteration: n, root_task_id: rootTaskId, root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: `t${n}`, task: 'work', opened_at: openedAt });
  const artifact = (sid: SessionId, id: string, kind: 'child_report' | 'agent_published', conversationId: string | null, createdAt: string, supersededBy: string | null = null) => dal.insertArtifact({
    session_id: sid, id, slug: id, title: `${id} title`, kind, source_task_id: conversationId ?? 'bg_00000001', canonical_name: 'build', source_persona: 'coding-agent', status: kind === 'child_report' ? 'succeeded' : 'published',
    summary: `${id} summary`, key_findings: `${id} body`, highlight_paths: '[]', snippets: '[]', edited_files: '[]', created_files: '[]', commands: '[]', tags: '[]',
    supersedes: null, superseded_by: supersededBy, created_by: 'build', consumed_by: '[]', timeline_event_id: null, conversation_id: conversationId, importance: 'normal',
    created_at: createdAt, edited_at: null, body_file: `${id}.md`,
  });
  const handoffArtifact = (sid: SessionId): string => /Artifact: (\S+)/.exec(buildContinuationPayload(dal, dal.getSession(sid)!, 'next', undefined))![1]!;

  it('the root\'s publish is chosen over a later child report and over a later publish by a child', () => {
    const sid = asSessionId('S-root-first');
    seed(sid);
    iteration(sid, 1, 'bg_root0001');
    artifact(sid, 'a0000001', 'agent_published', 'bg_root0001', '2026-09-27T01:00:00.000Z');
    artifact(sid, 'a0000002', 'child_report', 'bg_child001', '2026-09-27T02:00:00.000Z');
    artifact(sid, 'a0000003', 'agent_published', 'bg_child001', '2026-09-27T03:00:00.000Z');
    expect(handoffArtifact(sid)).toBe('a0000001');
    // The latest of the root's own, when it published more than one.
    artifact(sid, 'a0000004', 'agent_published', 'bg_root0001', '2026-09-27T04:00:00.000Z');
    artifact(sid, 'a0000005', 'child_report', 'bg_child002', '2026-09-27T05:00:00.000Z');
    expect(handoffArtifact(sid)).toBe('a0000004');
  });

  it('a root publish that is superseded, or a root that published none, falls back to the latest of any kind', () => {
    const sid = asSessionId('S-root-fallback');
    seed(sid);
    iteration(sid, 1, 'bg_root0001');
    artifact(sid, 'a0000001', 'child_report', 'bg_child001', '2026-09-27T01:00:00.000Z');
    artifact(sid, 'a0000002', 'agent_published', 'bg_child001', '2026-09-27T02:00:00.000Z');
    // The root published none.
    expect(handoffArtifact(sid)).toBe('a0000002');
    // The root's only publish is superseded (by a child's), so nothing of the root's stands.
    artifact(sid, 'a0000000', 'agent_published', 'bg_root0001', '2026-09-27T00:30:00.000Z', 'a0000002');
    expect(handoffArtifact(sid)).toBe('a0000002');
  });

  it('the root is the most recent recorded iteration\'s: an earlier iteration\'s root publish counts only as "of any kind" (OQ-106)', () => {
    const sid = asSessionId('S-root-iterations');
    seed(sid);
    iteration(sid, 1, 'bg_root0001');
    dal.closeIteration(sid, 1, 'succeeded', '2026-09-27T01:30:00.000Z');
    artifact(sid, 'a0000001', 'agent_published', 'bg_root0001', '2026-09-27T01:00:00.000Z');
    artifact(sid, 'a0000002', 'child_report', 'bg_child002', '2026-09-27T02:00:00.000Z');
    expect(handoffArtifact(sid)).toBe('a0000001');
    iteration(sid, 2, 'bg_root0002');
    expect(handoffArtifact(sid)).toBe('a0000002');
    // A plan cycle's root (iteration 0, never recorded as an iteration) is not an iteration's root either.
    artifact(sid, 'a0000003', 'agent_published', 'bg_plan0001', '2026-09-27T03:00:00.000Z');
    artifact(sid, 'a0000004', 'child_report', 'bg_child003', '2026-09-27T04:00:00.000Z');
    expect(handoffArtifact(sid)).toBe('a0000004');
    artifact(sid, 'a0000005', 'agent_published', 'bg_root0002', '2026-09-27T01:00:00.000Z');
    expect(handoffArtifact(sid)).toBe('a0000005');
  });

  it('a plan cycle that ran after the latest iteration is what the new work follows: an earlier iteration\'s root document never outranks what the plan cycle produced (OQ-106)', () => {
    const sid = asSessionId('S-root-plan-cycle');
    seed(sid);
    iteration(sid, 1, 'bg_root0001', '2026-09-27T00:00:00.000Z');
    dal.closeIteration(sid, 1, 'succeeded', '2026-09-27T01:30:00.000Z');
    artifact(sid, 'a0000001', 'agent_published', 'bg_root0001', '2026-09-27T01:00:00.000Z');
    // The session is re-armed and a prompt starts a plan cycle: its child reports, its root publishes the plan, and the
    // gate opens. The handoff the approve (or the revise) builds takes the latest of any kind — the plan — not X.
    artifact(sid, 'a0000002', 'child_report', 'bg_child002', '2026-09-27T02:00:00.000Z');
    artifact(sid, 'a0000003', 'agent_published', 'bg_plan0001', '2026-09-27T02:30:00.000Z');
    expect(handoffArtifact(sid)).toBe('a0000001');
    dal.insertPlanCycle(sid, 1, '2026-09-27T03:00:00.000Z', 'The plan.', 'implementation', '', '');
    expect(handoffArtifact(sid)).toBe('a0000003');
    // Approved: the iteration the plan led into opens after the gate, so its root is preferred again once it publishes.
    iteration(sid, 2, 'bg_root0002', '2026-09-27T04:00:00.000Z');
    expect(handoffArtifact(sid)).toBe('a0000003');
    artifact(sid, 'a0000004', 'agent_published', 'bg_root0002', '2026-09-27T05:00:00.000Z');
    artifact(sid, 'a0000005', 'child_report', 'bg_child005', '2026-09-27T06:00:00.000Z');
    expect(handoffArtifact(sid)).toBe('a0000004');
  });

  it('the plan cycle PD-ORCH-003 revision 2 holds after a resumed iteration is taken the same way: the resumed root\'s document counts only as "of any kind" (OQ-106)', () => {
    const sid = asSessionId('S-root-resumed-hold');
    seed(sid);
    // Iteration 1 opens, its root publishes, a pause leaves it open; a continue resumes it (opened_at is never rewritten),
    // the resumed root publishes again, and the iteration closes. With no release in `plan` mode the run then holds: a
    // plan cycle plans the work still pending, and a child of that plan cycle reports.
    iteration(sid, 1, 'bg_root0001', '2026-09-27T00:00:00.000Z');
    artifact(sid, 'a0000001', 'agent_published', 'bg_root0001', '2026-09-27T01:00:00.000Z');
    expect(dal.setIterationInterruption(sid, 1, 'pause')).toBe(true);
    expect(dal.setIterationInterruption(sid, 1, null)).toBe(true);
    artifact(sid, 'a0000002', 'agent_published', 'bg_root0001', '2026-09-27T02:00:00.000Z');
    dal.closeIteration(sid, 1, 'succeeded', '2026-09-27T02:30:00.000Z');
    expect(dal.iterationsOf(sid)[0]!.opened_at).toBe('2026-09-27T00:00:00.000Z');
    expect(handoffArtifact(sid)).toBe('a0000002');
    artifact(sid, 'a0000003', 'child_report', 'bg_child003', '2026-09-27T02:45:00.000Z');
    dal.insertPlanCycle(sid, 1, '2026-09-27T03:00:00.000Z', 'The plan.', 'implementation', '', '');
    // The approve's (or the revise's) handoff: the plan-cycle child's later report, not the resumed root's own document.
    expect(handoffArtifact(sid)).toBe('a0000003');
  });

  it('REQ-LIBRARY-093: a root\'s publish names the root instance by its canonical name, never its persona, in a run\'s first iteration and in a continue\'s (docs/defects/fixed/a-roots-publish-names-its-persona-as-its-author.md)', async () => {
    const script: ScriptedCall[] = [
      toolCalls([{ callId: 'w1', name: 'publish', args: {} }], 'Publishing.'), answer('Published.'),
      toolCalls([{ callId: 'w2', name: 'publish', args: {} }], 'Publishing again.'), answer('Published again.'),
    ];
    const backend = new DefaultAgentBackend(new ScriptedModelClient(script));
    let n = 0;
    const port = (ops: ArtifactOps | undefined): ToolPort => ({
      specs: () => [{ name: 'publish', description: 'publish', parameters: { type: 'object' } }],
      dispatch: async () => {
        n += 1;
        const r = ops?.write({ slug: `the-plan-${n}`, title: 'The plan', body: 'Plan body.', tags: [], supersedes: null });
        return { text: r?.ok ? r.id : 'failed', isError: !r?.ok, status: r?.ok ? 'ok' : 'failed', durationMs: 1, label: 'publish', args: {} };
      },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    });
    // A persona id the canonicaliser rewrites: its space becomes a hyphen in the instance's canonical name.
    const snapshots: SessionRecord[] = [];
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } }, pid: 82, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-root-author',
      model: null, sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid), attended: () => true,
      tools: (ctx) => port(ctx.artifacts),
      configure: () => ({ ok: true, value: {
        model: { backend, config: { ...RUN_CONFIG_DEFAULTS, persona: 'Lead Planner', model: MODEL, credentialFor: () => async () => '' } },
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0 },
      } }),
    });
    const sid = (sessions.start(dal, 'C:/ws', 'plan it') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(sessions.prompt(sid, 'next').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    const roots = dal.iterationsOf(sid);
    expect(roots.map((r) => [r.root_canonical_name, r.root_persona])).toEqual([['Lead-Planner', 'Lead Planner'], ['Lead-Planner', 'Lead Planner']]);
    const published = dal.artifactsOf(sid).filter((a) => a.kind === 'agent_published');
    // One publish by each iteration's root (the fake clock stamps both alike, so they are compared in root order).
    const byRoot = (a: { conversation_id: string | null }, b: { conversation_id: string | null }) => (a.conversation_id ?? '').localeCompare(b.conversation_id ?? '');
    expect([...published].sort(byRoot).map((a) => [a.created_by, a.source_persona, a.conversation_id])).toEqual([...roots].map((r) => ({ conversation_id: r.root_task_id })).sort(byRoot).map((r) => ['Lead-Planner', 'Lead Planner', r.conversation_id]));
    // The surfaces know the run-level agent by the persona id; the session names each root by its rows' name and its
    // canonical name, so the root's publishes are the run-level agent's links
    // (docs/defects/fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md).
    sessions.owner(sid)!.reconcile();
    const seen = snapshots.at(-1)!;
    expect(seen.entryRoots).toEqual([{ name: 'Lead Planner', canonical: 'Lead-Planner' }]);
    expect(seen.artifacts.map((a) => a.producer)).toEqual(['Lead-Planner', 'Lead-Planner']);
  });

  /*
   * REQ-MONITOR-057/060 with PD-ORCH-003 (the second repair of
   * docs/defects/fixed/after-an-entry-persona-switch-the-run-level-agent-is-drawn-as-the-first-roots-persona.md): the live
   * run's chips are its root's (`entryTools`) from the run's start, so the record carries the persona that root runs as,
   * before it has written any row; a surface read the persona from the transcript alone, and drew the previous root's.
   */
  it('REQ-MONITOR-060: while a run is live the record names the persona its root runs as, before that root has written a row; at rest none', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const client = new ScriptedModelClient([answer('Done.'), { parts: [{ hold }, ...answer('Reviewed.').parts] }]);
    const backend = new DefaultAgentBackend(client);
    const personas = ['orchestrator', 'reviewer'];
    let runs = 0;
    const snapshots: SessionRecord[] = [];
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } }, pid: 84, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-entry-persona',
      model: null, sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid), attended: () => true,
      // `default_persona` is read for every run: the second run's root runs as another persona.
      configure: () => ({ ok: true, value: {
        model: { backend, config: { ...RUN_CONFIG_DEFAULTS, persona: personas[Math.min(runs++, 1)]!, model: MODEL, credentialFor: () => async () => '' } },
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0 },
      } }),
    });
    const sid = (sessions.start(dal, 'C:/ws', 'read the readme') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    sessions.owner(sid)!.reconcile();
    expect(snapshots.at(-1)!.entryPersona).toBeNull();
    expect(sessions.prompt(sid, 'now review it').ok).toBe(true);
    let held: SessionRecord | undefined;
    for (let i = 0; i < 200 && held === undefined; i++) {
      await new Promise((r) => setTimeout(r, 5));
      sessions.owner(sid)!.reconcile();
      held = snapshots.at(-1)!.entryPersona === null ? undefined : snapshots.at(-1);
    }
    expect(held?.entryPersona).toBe('reviewer');
    // The second root is held in its first model call: no row of the transcript names it yet.
    expect(dal.residentRows(sid).filter((r) => r.persona === 'reviewer')).toEqual([]);
    release();
    expect((await sessions.running(sid)!).status).toBe('completed');
    sessions.owner(sid)!.reconcile();
    expect(snapshots.at(-1)!.entryPersona).toBeNull();
  });

  /*
   * Found by the fifth review of the repair of the-run-level-agent-is-known-by-its-entry-persona-alone.md: a plan cycle's
   * root has no iteration row (REQ-ORCH-153), so the session named it only through its live run (`Run.currentRoot`), which
   * the session lets go of once `start()` settles — as the park does. A session at the gate named no root, in the process
   * that parked it and reopened in a fresh one, and the plan cycle root's publish — recorded under its canonical name since
   * the repair of a-roots-publish-names-its-persona-as-its-author.md, where it had carried the persona the surfaces know the
   * run-level agent by — was no agent's while the user reviewed the plan. A root's publish carries its task id as its
   * conversation (OQ-106), so a publish whose conversation is no child's and no iteration's root is the publish of a root
   * with no iteration row, and names it.
   */
  describe('REQ-LIBRARY-093 with REQ-MONITOR-044 and OQ-106: a plan cycle\'s root is named by its publishes once the process that ran it is gone', () => {
    const publishing = (ops: ArtifactOps | undefined): ToolPort => ({
      specs: () => [{ name: 'publish', description: 'publish', parameters: { type: 'object' } }],
      dispatch: async () => {
        const r = ops?.write({ slug: 'the-plan', title: 'The plan', body: 'Plan body.', tags: [], supersedes: null });
        return { text: r?.ok ? r.id : 'failed', isError: !r?.ok, status: r?.ok ? 'ok' : 'failed', durationMs: 1, label: 'publish', args: {} };
      },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    });
    /** A persona id the canonicaliser rewrites, in `plan` mode: every run of a new session is held for a plan first. */
    const planSessions = (pid: number, backend: AgentBackend, snapshots: SessionRecord[] = [], portOf: (ops: ArtifactOps | undefined) => ToolPort = publishing) => new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } }, pid, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-plan-root',
      model: null, sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid), attended: () => true,
      tools: (ctx) => portOf(ctx.artifacts),
      configure: () => ({ ok: true, value: {
        model: { backend, config: { ...RUN_CONFIG_DEFAULTS, persona: 'Lead Planner', model: MODEL, credentialFor: () => async () => '' } },
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0, runStartMode: 'plan' },
      } }),
    });
    const ROOT = { name: 'Lead Planner', canonical: 'Lead-Planner' };

    it('parked at the gate: the session reopened in a fresh process names the plan cycle\'s root, the producer of its publish', async () => {
      const backend = new DefaultAgentBackend(new ScriptedModelClient([toolCalls([{ callId: 'w1', name: 'publish', args: {} }], 'Publishing.'), answer('Step 1: the plan.')]));
      const live: SessionRecord[] = [];
      const first = planSessions(82, backend, live);
      const sid = (first.start(dal, 'C:/ws', 'plan it') as { value: SessionId }).value;
      expect((await first.running(sid)!).execution_status).toBe('awaiting_plan_decision');
      // A plan cycle is not an iteration: the root is on no iteration row, and its publish carries its canonical name.
      expect(dal.iterationsOf(sid)).toEqual([]);
      expect(dal.artifactsOf(sid).map((a) => [a.kind, a.created_by, a.source_persona])).toEqual([['agent_published', 'Lead-Planner', 'Lead Planner']]);
      first.owner(sid)!.reconcile();
      expect(live.at(-1)!.entryRoots).toEqual([ROOT]);
      // The application quits and a fresh process opens the parked session: no run of it is held anywhere.
      await first.closeAll();
      expect(entryRootsOf(dal, sid, undefined)).toEqual([ROOT]);
      const reopened: SessionRecord[] = [];
      const second = planSessions(83, backend, reopened);
      expect(second.resume(dal, 'C:/ws', sid).ok).toBe(true);
      second.owner(sid)!.reconcile();
      const seen = reopened.at(-1)!;
      expect(seen.planGate?.cycle).toBe(1);
      expect(seen.entryRoots).toEqual([ROOT]);
      expect(seen.artifacts.map((a) => a.producer)).toEqual([ROOT.canonical]);
    });

    it('stopped before its gate opened: the plan cycle\'s root is still named by its publish, with no plan cycle and no iteration recorded', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      let published = false;
      const client = new ScriptedModelClient([toolCalls([{ callId: 'w1', name: 'publish', args: {} }], 'Publishing.'), { parts: [{ hold }, ...answer('Step 1: the plan.').parts] }]);
      const sessions = planSessions(82, new DefaultAgentBackend(client));
      const sid = (sessions.start(dal, 'C:/ws', 'plan it') as { value: SessionId }).value;
      for (let i = 0; i < 200 && !published; i++) { await new Promise((r) => setTimeout(r, 5)); published = dal.artifactsOf(sid).length > 0; }
      expect(published).toBe(true);
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      expect((await sessions.running(sid)!).execution_status).not.toBe('awaiting_plan_decision');
      await sessions.closeAll();
      expect(dal.planCyclesOf(sid)).toEqual([]);
      expect(dal.iterationsOf(sid)).toEqual([]);
      expect(entryRootsOf(dal, sid, undefined)).toEqual([ROOT]);
    });

    /*
     * docs/defects/fixed/a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md (acceptance A22, R-067):
     * a plan cycle's root that READ an artifact of the session and published none was named only by its live run, so at
     * the gate the artifact's consumer — its canonical name, `Lead-Planner` (REQ-LIBRARY-099, REQ-LIBRARY-093) — was no
     * agent's, and the run-level agent lost its received link (REQ-MONITOR-044/052/069). The session records each plan
     * cycle's root when it starts (`plan_roots`, store v30), so it is named however the cycle ends.
     */
    const reading = (sid: SessionId) => (ops: ArtifactOps | undefined): ToolPort => ({
      specs: () => [{ name: 'artifact_read', description: 'read', parameters: { type: 'object' } }],
      dispatch: async () => {
        // An artifact of the session the root did not write: a report an earlier agent left (no conversation of this root's).
        if (dal.artifactsOf(sid).length === 0) artifact(sid, 'a0000001', 'child_report', 'bg_child001', '2026-09-27T00:00:00.000Z');
        const r = ops?.read('a0000001', ['summary']);
        return { text: r?.ok ? r.text : 'failed', isError: !r?.ok, status: r?.ok ? 'ok' : 'failed', durationMs: 1, label: 'read', args: {} };
      },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    });

    it('REQ-MONITOR-044/052/069 with REQ-LIBRARY-099: parked at the gate, a plan cycle\'s root that only read is named — live, and reopened in a fresh process — so what it read is the run-level agent\'s received link', async () => {
      const sid = asSessionId('S-plan-root');
      const backend = new DefaultAgentBackend(new ScriptedModelClient([toolCalls([{ callId: 'r1', name: 'artifact_read', args: {} }], 'Reading.'), answer('Step 1: the plan.')]));
      const live: SessionRecord[] = [];
      const first = planSessions(82, backend, live, reading(sid));
      expect((first.start(dal, 'C:/ws', 'plan it') as { value: SessionId }).value).toBe(sid);
      expect((await first.running(sid)!).execution_status).toBe('awaiting_plan_decision');
      // The root published nothing, sits on no iteration row, and is recorded a consumer under its canonical name.
      expect(dal.iterationsOf(sid)).toEqual([]);
      expect(dal.artifactsOf(sid).map((a) => [a.kind, a.consumed_by])).toEqual([['child_report', '["Lead-Planner"]']]);
      first.owner(sid)!.reconcile();
      expect(live.at(-1)!.entryRoots).toEqual([ROOT]);
      expect(live.at(-1)!.artifacts.map((a) => a.consumedBy)).toEqual([[ROOT.canonical]]);
      await first.closeAll();
      expect(entryRootsOf(dal, sid, undefined)).toEqual([ROOT]);
      const reopened: SessionRecord[] = [];
      const second = planSessions(83, backend, reopened, reading(sid));
      expect(second.resume(dal, 'C:/ws', sid).ok).toBe(true);
      second.owner(sid)!.reconcile();
      expect(reopened.at(-1)!.entryRoots).toEqual([ROOT]);
    });

    it('stopped before its gate opened: a plan cycle\'s root that only read is still named, with no plan cycle and no iteration recorded', async () => {
      const sid = asSessionId('S-plan-root');
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const client = new ScriptedModelClient([toolCalls([{ callId: 'r1', name: 'artifact_read', args: {} }], 'Reading.'), { parts: [{ hold }, ...answer('Step 1: the plan.').parts] }]);
      const sessions = planSessions(82, new DefaultAgentBackend(client), [], reading(sid));
      sessions.start(dal, 'C:/ws', 'plan it');
      let consumed = false;
      for (let i = 0; i < 200 && !consumed; i++) { await new Promise((r) => setTimeout(r, 5)); consumed = dal.artifactsOf(sid).some((a) => a.consumed_by !== '[]'); }
      expect(consumed).toBe(true);
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      expect((await sessions.running(sid)!).execution_status).not.toBe('awaiting_plan_decision');
      await sessions.closeAll();
      expect(dal.planCyclesOf(sid)).toEqual([]);
      expect(dal.iterationsOf(sid)).toEqual([]);
      expect(entryRootsOf(dal, sid, undefined)).toEqual([ROOT]);
    });
  });

  /*
   * REQ-MONITOR-060/069 with REQ-ORCH-153 (the repair of
   * `the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md`, acceptance A21, R-067): with no run
   * live the run-level agent's history was read under the latest iteration root's persona alone, and a plan cycle's root has
   * no iteration row, so in a session whose first run parked at the gate every chip read `not used` while the user reviewed
   * the plan — although the ring and the tracker held the root's calls under the name it dispatched under.
   */
  describe('REQ-MONITOR-060 with REQ-ORCH-153: the run-level agent\'s tool history at a plan gate no iteration precedes', () => {
    // Each call is recorded through the writer as the run host's gate records it (`openToolCall`, `settleToolCall`).
    const grepping = (writer: SessionWriter): ToolPort => ({
      specs: () => [{ name: 'grep', description: 'search', parameters: { type: 'object' } }],
      dispatch: async (c) => {
        const open = { call_id: c.callId, agent_name: c.agentName, tool_name: c.name, args: {} };
        const ordinal = writer.openToolCall(open);
        if (ordinal.ok) writer.settleToolCall(ordinal.value, open, { status: 'ok', elapsed_ms: 1, is_error: false, result: 'a.ts:1: match' });
        return { text: 'a.ts:1: match', isError: false, status: 'ok' as const, durationMs: 1, label: 'grep', args: {} };
      },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    });
    const planSessions = (pid: number, backend: AgentBackend, snapshots: SessionRecord[]) => new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } }, pid, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-plan-tools',
      model: null, sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid), attended: () => true,
      tools: (ctx) => grepping(ctx.writer),
      configure: () => ({ ok: true, value: {
        model: { backend, config: { ...RUN_CONFIG_DEFAULTS, persona: 'Lead Planner', model: MODEL, credentialFor: () => async () => '' } },
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0, runStartMode: 'plan' },
      } }),
    });

    it('parked at the gate: the plan cycle root\'s calls are the run-level agent\'s history, in the process that parked it and in a fresh one', async () => {
      const backend = new DefaultAgentBackend(new ScriptedModelClient([toolCalls([{ callId: 'g1', name: 'grep', args: { pattern: 'x' } }], 'Searching.'), answer('Step 1: the plan.')]));
      const live: SessionRecord[] = [];
      const first = planSessions(82, backend, live);
      const sid = (first.start(dal, 'C:/ws', 'plan it') as { value: SessionId }).value;
      expect((await first.running(sid)!).execution_status).toBe('awaiting_plan_decision');
      expect(dal.iterationsOf(sid)).toEqual([]);
      expect(dal.toolCallCounts(sid).map((t) => t.tool_name)).toEqual(['grep']);
      first.owner(sid)!.reconcile();
      expect(live.at(-1)!.entryTools).toEqual({ resolved: [], called: ['grep'], active: [] });
      // The application quits and a fresh process opens the parked session: the tracker is seeded from the ring.
      await first.closeAll();
      const reopened: SessionRecord[] = [];
      const second = planSessions(83, backend, reopened);
      expect(second.resume(dal, 'C:/ws', sid).ok).toBe(true);
      second.owner(sid)!.reconcile();
      expect(reopened.at(-1)!.planGate?.cycle).toBe(1);
      expect(reopened.at(-1)!.entryTools).toEqual({ resolved: [], called: ['grep'], active: [] });
    });

    /*
     * PD-ORCH-003 with REQ-ORCH-153 (the repair of
     * `a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md`): with an iteration recorded the
     * history was read under the latest iteration root's persona, so a plan cycle re-armed after it, under an entry persona
     * switched in between, was marked from the earlier iteration root's calls. Its root is recorded in `plan_roots` (v30),
     * so the history is read under whichever root ran last.
     */
    it('a plan cycle re-armed after an iteration, under a switched entry persona: the chips read the plan cycle root\'s calls, not the iteration root\'s', async () => {
      const port = (writer: SessionWriter): ToolPort => {
        const base = grepping(writer);
        return { ...base, specs: () => [{ name: 'grep', description: 'search', parameters: { type: 'object' } }, { name: 'glob', description: 'list', parameters: { type: 'object' } }] };
      };
      let persona = 'Builder';
      let mode: 'auto' | 'plan' = 'auto';
      const backend = new DefaultAgentBackend(new ScriptedModelClient([
        toolCalls([{ callId: 'b1', name: 'glob', args: { pattern: '*' } }], 'Listing.'), answer('Built.'),
        toolCalls([{ callId: 'r1', name: 'grep', args: { pattern: 'x' } }], 'Searching.'), answer('Step 1: the review plan.'),
      ]));
      const switching = (pid: number, snapshots: SessionRecord[]) => new Sessions({
        clocks: clock, publisher: { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } }, pid, host: HOST,
        retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-plan-after-iteration',
        model: null, sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid), attended: () => true,
        tools: (ctx) => port(ctx.writer),
        configure: () => ({ ok: true, value: {
          model: { backend, config: { ...RUN_CONFIG_DEFAULTS, persona, model: MODEL, credentialFor: () => async () => '' } },
          runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0, runStartMode: mode },
        } }),
      });
      const live: SessionRecord[] = [];
      const first = switching(84, live);
      const sid = (first.start(dal, 'C:/ws', 'build it') as { value: SessionId }).value;
      expect((await first.running(sid)!).execution_status).toBe('completed');
      expect(dal.iterationsOf(sid).map((r) => r.root_persona)).toEqual(['Builder']);
      // The user re-arms `plan` on the run-start chip and switches the entry persona before the next prompt (PD-ORCH-003).
      clock.advance(1_000);
      mode = 'plan';
      persona = 'Reviewer';
      expect(first.prompt(sid, 'now review it').ok).toBe(true);
      expect((await first.running(sid)!).execution_status).toBe('awaiting_plan_decision');
      expect(dal.iterationsOf(sid).map((r) => r.root_persona)).toEqual(['Builder']);
      expect(dal.planRootsOf(sid).map((r) => r.root_persona)).toEqual(['Reviewer']);
      first.owner(sid)!.reconcile();
      expect(live.at(-1)!.entryTools).toEqual({ resolved: [], called: ['grep'], active: [] });
      // A fresh process opens the parked session: the tracker is seeded from the ring, and the reading is the same.
      await first.closeAll();
      const reopened: SessionRecord[] = [];
      const second = switching(85, reopened);
      expect(second.resume(dal, 'C:/ws', sid).ok).toBe(true);
      second.owner(sid)!.reconcile();
      expect(reopened.at(-1)!.planGate?.cycle).toBe(1);
      expect(reopened.at(-1)!.entryTools).toEqual({ resolved: [], called: ['grep'], active: [] });
    });
  });

  it('entryRootsOf (REQ-MONITOR-071, REQ-LIBRARY-093, OQ-97, OQ-106): each iteration\'s root, then each root no iteration records that published, and no child — read from the store alone', () => {
    const sid = asSessionId('S-entry-roots');
    seed(sid);
    /** A publish as an agent's own tool port records it (`ArtifactStore.publish`): no source task, its task id as conversation. */
    const publish = (id: string, conversationId: string | null, persona: string, createdBy: string, createdAt: string, supersededBy: string | null = null) => dal.insertArtifact({
      session_id: sid, id, slug: id, title: `${id} title`, kind: 'agent_published', source_task_id: null, canonical_name: createdBy, source_persona: persona, status: 'published',
      summary: '', key_findings: '', highlight_paths: '[]', snippets: '[]', edited_files: '[]', created_files: '[]', commands: '[]', tags: '[]',
      supersedes: null, superseded_by: supersededBy, created_by: createdBy, consumed_by: '[]', timeline_event_id: null, conversation_id: conversationId, importance: 'normal',
      created_at: createdAt, edited_at: null, body_file: `${id}.md`,
    });
    // Iteration 1's root was resumed as the entry role (OQ-97): its rows carry `orchestrator`, its publish the entry role's
    // persona beside its own canonical name. It is named once, by its iteration row, never by that publish's persona.
    iteration(sid, 1, 'bg_root0001', '2026-09-27T00:00:00.000Z');
    dal.closeIteration(sid, 1, 'succeeded', '2026-09-27T00:30:00.000Z');
    publish('a0000001', 'bg_root0001', 'coding-agent', 'orchestrator', '2026-09-27T00:10:00.000Z');
    // A child's publish and its report carry the child's task id: a child is never one of the roots.
    dal.insertChild({ session_id: sid, task_id: 'bg_child001', canonical_name: 'Research', given_name: 'Research', persona: 'researcher', state: 'succeeded', parent_id: 'bg_root0001', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: '2026-09-27T00:15:00.000Z' });
    publish('a0000002', 'bg_child001', 'researcher', 'Research', '2026-09-27T00:20:00.000Z');
    artifact(sid, 'a0000003', 'child_report', 'bg_child001', '2026-09-27T00:25:00.000Z');
    // Two plan cycles' roots of personas the canonicaliser rewrites, each named once by its publishes: the first one's only
    // publish was superseded by the second's, which still names it (what it read is recorded under that name), and the
    // second published twice. A publish recorded with no conversation names no root.
    publish('a0000004', 'bg_plan0001', 'Lead Planner', 'Lead-Planner', '2026-09-27T01:00:00.000Z', 'a0000005');
    publish('a0000005', 'bg_plan0002', 'Lead Reviewer', 'Lead-Reviewer', '2026-09-27T02:00:00.000Z');
    publish('a0000006', 'bg_plan0002', 'Lead Reviewer', 'Lead-Reviewer', '2026-09-27T02:30:00.000Z');
    publish('a0000007', null, 'Other', 'Other', '2026-09-27T03:00:00.000Z');
    const orchestrator = { name: 'orchestrator', canonical: 'orchestrator' };
    const planner = { name: 'Lead Planner', canonical: 'Lead-Planner' };
    const reviewer = { name: 'Lead Reviewer', canonical: 'Lead-Reviewer' };
    expect(entryRootsOf(dal, sid, undefined)).toEqual([orchestrator, planner, reviewer]);
    // OQ-158: the ledger keeps every child off exactly the names these roots carry, read from the same sources.
    expect(recordedRootNames(dal, sid)).toEqual(new Set(entryRootsOf(dal, sid, undefined).flatMap((r) => [r.name, r.canonical])));
    // A live run's current root comes last, and once.
    expect(entryRootsOf(dal, sid, { currentRoot: planner })).toEqual([orchestrator, planner, reviewer]);
    expect(entryRootsOf(dal, sid, { currentRoot: { name: 'coding-agent', canonical: 'coding-agent' } })).toEqual([orchestrator, planner, reviewer, { name: 'coding-agent', canonical: 'coding-agent' }]);
  });

  it('end to end: a root\'s publish carries its task id as its conversation, and the next iteration\'s handoff names it over a later report', async () => {
    const calls: unknown[] = [];
    const script: ScriptedCall[] = [
      toolCalls([{ callId: 'w1', name: 'publish', args: {} }], 'Publishing.'), answer('Published.'),
      answer('Second iteration done.'),
    ];
    const client = new ScriptedModelClient(script);
    const backend = new DefaultAgentBackend(client);
    const port = (ops: ArtifactOps | undefined): ToolPort => ({
      specs: () => [{ name: 'publish', description: 'publish', parameters: { type: 'object' } }],
      dispatch: async (c) => {
        calls.push(c);
        const r = ops?.write({ slug: 'the-plan', title: 'The plan', body: 'Plan body.', tags: [], supersedes: null });
        return { text: r?.ok ? r.id : 'failed', isError: !r?.ok, status: r?.ok ? 'ok' : 'failed', durationMs: 1, label: 'publish', args: {} };
      },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    });
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 81, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-handoff-e2e',
      model: null, sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid), attended: () => true,
      tools: (ctx) => port(ctx.artifacts),
      configure: () => ({ ok: true, value: {
        model: { backend, config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => '' } },
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0 },
      } }),
    });
    const sid = (sessions.start(dal, 'C:/ws', 'plan it') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(calls).toHaveLength(1);
    const root = dal.iterationsOf(sid)[0]!.root_task_id;
    const published = dal.artifactsOf(sid).find((a) => a.kind === 'agent_published')!;
    expect(published.conversation_id).toBe(root);
    // A later child report (as a child of the same iteration would leave) is newer than the root's publish.
    artifact(sid, 'a0000009', 'child_report', 'bg_child009', '2999-01-01T00:00:00.000Z');
    expect(sessions.prompt(sid, 'next').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    const firstOfSecond = client.requests.at(-1)!.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    expect(firstOfSecond).toContain(`Artifact: ${published.id} — The plan (agent_published, published)\nPlan body.`);
    expect(firstOfSecond).not.toContain('Artifact: a0000009');
  });
});
