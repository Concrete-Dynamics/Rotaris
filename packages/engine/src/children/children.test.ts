import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, millis, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling, type ChildRow } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { CHILD_STATES, CHILD_TRANSITIONS, isLegalChildMove, RUN_AGENT_ID, TASK_ID_PATTERN, TERMINAL_CHILD_STATES, type PermissionPreset } from '@rotaris/contracts';
import { canonicaliseName, ChildLedger, RUN_CONFIG_DEFAULTS, Scheduler, Sessions, SessionWriter, uniqueUnderParent, type DelegationOps, type PortToolResult, type Publisher, type RunConfig, type ToolPort, type ToolPortContext } from '../index.js';
import type { ProjectionOwner } from '../projection-owner.js';
import { conversationOf } from '../run/record.js';
import { decodeStoredTodo } from '../todo-view.js';

const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };

describe('naming (REQ-ORCH-044/045)', () => {
  it('canonicalises, shortens to 80 with an 8-hex suffix, and disambiguates per parent', () => {
    expect(canonicaliseName('  Fix the  bug!  ')).toBe('Fix-the-bug');
    expect(canonicaliseName('---')).toBe('task');
    const long = 'x'.repeat(100);
    const c = canonicaliseName(long);
    expect(c).toHaveLength(80);
    expect(c).toMatch(/^x{71}-[0-9a-f]{8}$/);
    expect(canonicaliseName(long)).toBe(c);
    expect(canonicaliseName(`${long}y`)).not.toBe(c);
    expect(uniqueUnderParent('a', new Set(['a', 'a_1']))).toBe('a_2');
  });
});

describe('the transition table (REQ-MONITOR-300)', () => {
  it('admits exactly the listed moves, the two settling paths, and nothing out of a terminal state', () => {
    for (const from of CHILD_STATES) for (const to of CHILD_STATES) {
      expect(isLegalChildMove(from, to)).toBe(CHILD_TRANSITIONS[from].includes(to));
      expect(isLegalChildMove(from, to, 'cancellation')).toBe(!TERMINAL_CHILD_STATES.has(from) && to === 'cancelled');
      expect(isLegalChildMove(from, to, 'reconciliation')).toBe(!TERMINAL_CHILD_STATES.has(from) && TERMINAL_CHILD_STATES.has(to));
    }
    // PD-ORCH-005 (narrowing REQ-MONITOR-300): every non-terminal state may come to rest in `paused`.
    expect(CHILD_TRANSITIONS.queued).toEqual(['starting', 'waiting_on_model_slot', 'blocked', 'paused']);
    expect(CHILD_TRANSITIONS.running).toEqual(['summarizing', 'succeeded', 'failed', 'paused']);
  });
});

describe('the ledger and the scheduler against a real store (ADR-0012)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let writer: SessionWriter;
  const sid = 'S-ledger' as SessionId;
  const warnings: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-children-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
    const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: (m) => warnings.push(m), onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
    if (!w.ok) throw new Error('writer');
    writer = w.value;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const ledger = (cap: number | null = null, budget = { maxDepth: 3, maxTotal: 20, maxActive: 6 }) => new ChildLedger({ dal, writer, sessionId: sid, iteration: 1, budget, modelCap: () => cap, warn: (m) => warnings.push(m) });
  const spawn = (l: ChildLedger, name: string, over: Partial<Parameters<ChildLedger['spawn']>[0]> = {}) => l.spawn({ parentId: 'root', parentDepth: 0, persona: 'coding-agent', taskName: name, task: `do ${name}`, dependsOn: [], inheritedContext: [], category: '', background: true, modelKey: 'm', grantedTools: [], ...over });

  it('REQ-ORCH-046: the five checks in order reject with no record; aliases resolve; names are unique per parent', () => {
    const l = ledger(null, { maxDepth: 1, maxTotal: 2, maxActive: 1 });
    expect(spawn(l, 'x', { persona: 'nobody' })).toMatchObject({ ok: false, error: { reason: expect.stringMatching(/^Unknown persona 'nobody'\. Known personas: orchestrator, .*coder->coding-agent/) } });
    expect(spawn(l, 'x', { parentDepth: 1 })).toMatchObject({ ok: false, error: { reason: 'Max depth 1 exceeded' } });
    const a = spawn(l, 'build it', { persona: 'coder' });
    expect(a.ok && a.value.aliasResolved).toBe('coder');
    expect(a.ok && a.value.row).toMatchObject({ persona: 'coding-agent', canonical_name: 'build-it', state: 'queued' });
    const a2 = spawn(l, 'build it');
    expect(a2.ok && a2.value.row.canonical_name).toBe('build-it_1');
    expect(spawn(l, 'third')).toMatchObject({ ok: false, error: { reason: 'Max total children 2 exceeded' } });
    expect(dal.childrenOf(sid)).toHaveLength(2);
    // the total check (2) precedes the dependency check (4): a wider budget reaches it
    const wide = ledger(null, { maxDepth: 3, maxTotal: 20, maxActive: 6 });
    expect(spawn(wide, 'dep', { dependsOn: ['bg_00000000'] })).toMatchObject({ ok: false, error: { reason: "Unknown dependency 'bg_00000000'" } });
    // A dependency owned by another parent of the same iteration — a child's child — is refused naming that parent.
    const someone = spawn(wide, 'someone');
    const someoneId = someone.ok ? someone.value.row.task_id : '';
    const other = spawn(wide, 'other', { parentId: someoneId, parentDepth: 1 });
    const otherId = other.ok ? other.value.row.task_id : '';
    expect(spawn(wide, 'dep2', { dependsOn: [otherId] })).toMatchObject({ ok: false, error: { reason: expect.stringMatching(new RegExp(`is owned by parent '${someoneId}', not 'root'`)) } });
    expect(dal.eventsOfKind(sid, 'child.spawn')).toHaveLength(4);
  });

  it('REQ-MONITOR-016: an illegal move is refused naming both states, the record untouched, no event; a legal terminal move stamps completed_at', () => {
    const l = ledger();
    const a = spawn(l, 'a');
    const id = a.ok ? a.value.row.task_id : '';
    const bad = l.transition(id, 'succeeded');
    expect(bad).toMatchObject({ ok: false, reason: expect.stringContaining("is in state 'queued' and cannot move to 'succeeded'") });
    expect(dal.getChild(sid, id)).toMatchObject({ state: 'queued', completed_at: null });
    expect(dal.eventsOfKind(sid, 'child.transition')).toHaveLength(0);
    expect(l.transition(id, 'cancelled', 'cancellation')).toMatchObject({ ok: true, row: { state: 'cancelled' } });
    expect(dal.getChild(sid, id)!.completed_at).not.toBeNull();
    expect(dal.eventsOfKind(sid, 'child.transition')).toHaveLength(1);
    expect(JSON.parse(dal.eventsOfKind(sid, 'child.transition')[0]!.payload)).toMatchObject({ from_state: 'queued', to_state: 'cancelled', child_id: id });
  });

  it('the repair of a-crashed-iteration-number-is-reused-by-the-next-run: a ledger holds its own root\'s tree, not every child numbered like it', () => {
    // Two roots under one iteration number — every plan cycle is numbered 0, and a dead run's number was reused.
    const earlier = ledger();
    const a = spawn(earlier, 'a');
    const idA = a.ok ? a.value.row.task_id : '';
    spawn(earlier, 'b', { parentId: idA, parentDepth: 1 });
    const later = ledger();
    expect(later.root.taskId).not.toBe(earlier.root.taskId);
    expect(earlier.all().map((c) => c.canonical_name).sort()).toEqual(['a', 'b']);
    expect(later.all()).toEqual([]);
    // So the earlier root's children count toward none of the later ledger's limits and resolve none of its dependencies.
    expect(spawn(later, 'dep', { dependsOn: [idA] })).toMatchObject({ ok: false, error: { reason: `Unknown dependency '${idA}'` } });
  });

  it('REQ-ORCH-049: two passes claim the same child; exactly one child_start, one suppression recorded in the same transaction', () => {
    const l = ledger();
    const a = spawn(l, 'a');
    const id = a.ok ? a.value.row.task_id : '';
    expect(l.claimStart(id)).toBe(true);
    expect(l.claimStart(id)).toBe(false);
    const names = dal.timelineOf(sid).map((t) => t.name);
    expect(names.filter((n) => n === 'child_start')).toHaveLength(1);
    expect(names.filter((n) => n === 'child_launch_suppressed')).toHaveLength(1);
    expect(dal.issuesOf(sid).map((i) => i.kind)).toEqual(['stale_child_launch_claim']);
    expect(dal.getChild(sid, id)).toMatchObject({ state: 'starting', launch_generation: 1 });
  });

  it('dependencies: a dependent starts only when every dependency succeeded WITH a stored report; a failure cascades blocked transitively', async () => {
    const l = ledger();
    const started: string[] = [];
    const sched = new Scheduler({ ledger: l, runChild: async (row) => { started.push(row.task_id); }, warn: (m) => warnings.push(m) });
    const a = spawn(l, 'a'); const idA = a.ok ? a.value.row.task_id : '';
    const b = spawn(l, 'b', { dependsOn: [idA] }); const idB = b.ok ? b.value.row.task_id : '';
    const c = spawn(l, 'c', { dependsOn: [idB] }); const idC = c.ok ? c.value.row.task_id : '';
    expect(dal.getChild(sid, idB)!.state).toBe('waiting_on_dependencies');
    sched.pass();
    expect(started).toEqual([idA]);
    expect(dal.getChild(sid, idA)!.state).toBe('starting');
    l.transition(idA, 'running'); l.transition(idA, 'succeeded');
    sched.pass();
    // succeeded but no report yet: not released
    expect(dal.getChild(sid, idB)!.state).toBe('waiting_on_dependencies');
    l.storeReport(idA, { status: 'succeeded', summary: 's' });
    sched.pass();
    expect(started).toEqual([idA, idB]);
    l.transition(idB, 'running'); l.transition(idB, 'failed'); sched.settled(dal.getChild(sid, idB)!);
    sched.pass();
    expect(dal.getChild(sid, idC)!.state).toBe('blocked');
    expect(dal.getChild(sid, idC)!.completed_at).not.toBeNull();
  });

  it('REQ-ORCH-050: over the cap a child is held, promoted in the order held one per freed slot; a terminal held child is dropped', () => {
    const l = ledger(1);
    const started: string[] = [];
    const sched = new Scheduler({ ledger: l, runChild: async (row) => { started.push(row.task_id); }, warn: (m) => warnings.push(m) });
    const a = spawn(l, 'a'); const idA = a.ok ? a.value.row.task_id : '';
    sched.pass();
    l.transition(idA, 'running');
    const b = spawn(l, 'b'); const idB = b.ok ? b.value.row.task_id : '';
    const c = spawn(l, 'c'); const idC = c.ok ? c.value.row.task_id : '';
    expect(b.ok && b.value.held).toBe(true);
    expect(dal.getChild(sid, idB)!.state).toBe('waiting_on_model_slot');
    expect(l.slotQueue('m')).toEqual([idB, idC]);
    sched.pass();
    expect(started).toEqual([idA]);
    // c is cancelled while held → dropped, not released
    l.transition(idC, 'cancelled', 'cancellation');
    l.transition(idA, 'succeeded'); sched.settled(dal.getChild(sid, idA)!); sched.pass();
    expect(started).toEqual([idA, idB]);
    expect(l.slotQueue('m')).toEqual([]);
    expect(dal.getChild(sid, idB)!.state).toBe('starting');
  });

  it('REQ-ORCH-052/056: the finalize sweep settles every non-terminal record cancelled with a report; a pass that changes nothing ends', () => {
    const l = ledger();
    const sched = new Scheduler({ ledger: l, runChild: async () => undefined, warn: (m) => warnings.push(m) });
    const a = spawn(l, 'a'); const idA = a.ok ? a.value.row.task_id : '';
    const b = spawn(l, 'b', { dependsOn: [idA] }); const idB = b.ok ? b.value.row.task_id : '';
    sched.pass();
    expect(sched.finalizeIncomplete('cleanup')).toBe(2);
    expect(dal.getChild(sid, idA)).toMatchObject({ state: 'cancelled', report_stored: 1 });
    expect(dal.getChild(sid, idB)!.state).toBe('cancelled');
    expect(sched.hasNonTerminal).toBe(false);
    sched.pass();
    expect(warnings.filter((w) => /quiescence/.test(w))).toHaveLength(0);
  });
});

describe('an iteration with children, end to end against the run (REQ-ORCH-055..060, 072, 080, 088, 108..112, REQ-TOOLS-152..156)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-iter-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  /** A tool the test answers itself, in place of the gate's executors; undefined leaves the call to the delegation tools. */
  type TestTool = (name: string, args: Record<string, unknown>) => Promise<PortToolResult> | undefined;

  /** A tool port whose only tools are the three delegation tools, dispatched straight to the ops (the gate is Part A's, tested there). */
  function delegationPort(ops: DelegationOps, parentId: string, tool?: TestTool): ToolPort {
    const dispatch = async (name: string, raw: string): Promise<PortToolResult> => {
      const a = JSON.parse(raw) as Record<string, unknown>;
      const ok = (text: string): PortToolResult => ({ text, isError: false, status: 'ok', durationMs: 1, label: name, args: a });
      const own = tool?.(name, a);
      if (own) return own;
      if (name === 'delegate') {
        const r = await ops.delegate(parentId, { persona: String(a['persona']), taskName: String(a['task_name']), task: String(a['task']), dependsOn: (a['depends_on'] as string[]) ?? [], inheritedContext: [], category: '', runInBackground: a['run_in_background'] !== false, writeScope: (a['write_scope'] as string[] | undefined) ?? [], ...(typeof a['continuation_of'] === 'string' ? { continuationOf: a['continuation_of'] } : {}) });
        if (r.status === 'rejected') return { ...ok(`Task '${r.canonicalName}': rejected — ${r.message}`), isError: true, status: 'failed' };
        let text = `Task '${r.canonicalName}': ${r.status} — ${r.message}\ntask_id: ${r.taskId}`;
        if (a['run_in_background'] === false) { const w = await ops.waitForTasks(parentId, [r.taskId]); text += `\n\n${'refused' in w ? w.refused : 'interrupted' in w ? w.interrupted : w.text}`; }
        return ok(text);
      }
      if (name === 'wait_for_tasks') { const w = await ops.waitForTasks(parentId, (a['task_ids'] as string[]) ?? []); return 'refused' in w ? { ...ok(w.refused), isError: true, status: 'failed' } : 'interrupted' in w ? { ...ok(w.interrupted), isError: true, status: 'failed', interrupted: true } : ok(w.text); }
      if (name === 'background_output') { const r = ops.backgroundOutput(parentId, String(a['task_id']), 'summary'); return ok(r.status === 'ok' ? r.text : r.status); }
      return { ...ok(`unknown ${name}`), isError: true, status: 'failed' };
    };
    return {
      specs: () => ['delegate', 'wait_for_tasks', 'background_output'].map((n) => ({ name: n, description: n, parameters: { type: 'object' } })),
      dispatch: (c) => dispatch(c.name, c.rawArgs), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    };
  }

  function sessionsWith(script: (persona: string, turn: number, req: ModelRequest) => ScriptedCall, over: { cap?: number | null; childTimeoutMs?: number; childStallTimeoutMs?: number; tool?: TestTool } = {}) {
    // The scripted client answers by persona and by the number of calls that persona has made.
    const counts = new Map<string, number>();
    const client = new ScriptedModelClient([]);
    const original = client.stream.bind(client);
    client.stream = (req) => {
      const persona = /^You are the orchestrator/.test(req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '') ? 'orchestrator' : /summarise/i.test(req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '') ? 'summariser' : 'child';
      const n = (counts.get(persona) ?? 0) + 1;
      counts.set(persona, n);
      client.push(script(persona, n, req));
      return original(req);
    };
    let n = 0;
    const built: { persona: string; mode: PermissionPreset }[] = [];
    /** Each agent's tool-port context, by canonical name, as the engine built it. */
    const contexts = new Map<string, ToolPortContext>();
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' };
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `S${++n}`,
      model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      tools: (ctx) => {
        // The mode each agent was BUILT with, in construction order. The run host's port SELECTS it through
        // `selectRequestedMode` — the persona's pin, then the session override, then `runtime.permission_mode`
        // (REQ-TOOLS-048, covered in `run-host/tools.test.ts`); with no pins that is the override or the
        // start-of-run mode, which is the half this run's engine owns (REQ-TOOLS-073's second).
        const selected = (ctx.modeOverride ?? ctx.requestedMode) as PermissionPreset;
        built.push({ persona: ctx.persona, mode: selected });
        contexts.set(ctx.agentName, ctx);
        let mode: PermissionPreset = selected;
        const base = { cancelPending: () => 0, setMode: (m: string) => { const previous = mode; mode = m as PermissionPreset; return { requested: mode, effective: mode, downgraded: false, reason: '', previous }; }, currentMode: () => mode, answerApproval: () => false };
        return ctx.delegation
          ? { ...delegationPort(ctx.delegation, ctx.parentId ?? 'root', over.tool), ...base }
          : { specs: () => [], dispatch: async () => ({ text: '', isError: true, status: 'failed', durationMs: 0, label: '', args: {} }), ...base };
      },
      attended: () => true,
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', modelConcurrencyCap: over.cap ?? null, drainTimeoutMs: 0, ...(over.childStallTimeoutMs === undefined ? {} : { childStallTimeoutMs: over.childStallTimeoutMs }), ...(over.childTimeoutMs === undefined ? {} : { childTimeoutMs: over.childTimeoutMs }) },
    });
    return { sessions, client, counts, built, contexts };
  }
  const children = (sid: SessionId): ChildRow[] => dal.childrenOf(sid);
  const kinds = (sid: SessionId) => dal.eventsFrom(sid, 1, 10_000).map((e) => e.kind);

  it('delegate in the background → the child runs its own turn, reports, the parent is resumed once with the report, the run completes', async () => {
    const { sessions, client } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.') : answer('All done: the child implemented it.');
      if (persona === 'summariser') return answer('{"summary":"The child wrote the file.","key_findings":["one file"],"tags":["implementation"]}');
      return answer('I implemented it.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const rows = children(sid);
    expect(rows).toHaveLength(1);
    const c = rows[0]!;
    expect(c).toMatchObject({ persona: 'coding-agent', canonical_name: 'implement', state: 'succeeded', iteration: 1, depth: 1, observed: 1, report_stored: 1 });
    // REQ-ORCH-072: the child names the root execution record's task id as its parent
    expect(c.parent_id).toMatch(TASK_ID_PATTERN);
    expect(JSON.parse(c.report!)).toMatchObject({ agent_name: 'implement', role: 'coding-agent', status: 'succeeded', summary: 'The child wrote the file.', key_findings: ['one file'], final_response: 'I implemented it.' });
    // the ordering obligations: child.spawn precedes every event naming the child, child.complete carries the report
    const ks = kinds(sid);
    expect(ks.indexOf('child.spawn')).toBeLessThan(ks.indexOf('child.transition'));
    expect(ks.filter((k) => k === 'child.spawn')).toHaveLength(1);
    expect(ks.filter((k) => k === 'child.complete')).toHaveLength(1);
    const transitions = dal.eventsOfKind(sid, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state);
    expect(transitions).toEqual(['starting', 'running', 'summarizing', 'succeeded']);
    // the parent's second model call carried the notification and the report block
    const resume = client.requests.filter((r) => /^You are the orchestrator/.test(r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '')).at(-1)!;
    const lastUser = [...resume.messages].reverse().find((m) => m.role === 'user')!;
    const text = lastUser.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    expect(text).toContain('[Background task completed]');
    expect(text).toContain('### implement (coding-agent) — succeeded');
    expect(text).toContain('All background tasks finished.');
    // the child's rows are in the same transcript, tagged by its canonical name
    expect(dal.residentRows(sid).some((r) => r.kind === 'agent' && r.name === 'implement')).toBe(true);
    expect(dal.timelineOf(sid).map((t) => t.name)).toEqual(expect.arrayContaining(['child_start', 'child_end', 'child_result', 'child_conversation_closed']));
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
  });

  it('REQ-EVENTS-053 / PD-MONITOR-001: a delegated child\'s provider requests reach the run\'s tokens, cost and usage.update', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1
        ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: read it', run_in_background: false } }], 'Delegating.', { input: 10, output: 2, cost: '0.001' })
        : answer('All done.', { input: 12, output: 3, cost: '0.002' });
      // The summariser reports nothing here, so this case is the child's alone; the next case counts the summariser.
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}', { input: 0, output: 0 });
      // A reader that answers in text is accepted at once (REQ-ORCH-095 re-prompts only an implementer), so this is one request.
      return answer('The module is small.', { input: 100, output: 20, cost: '0.0105' });
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    // The entry agent's two requests and the child's one, each counted once; the summariser reported no usage, so it moves no total.
    expect(dal.getSession(sid)).toMatchObject({ tokens_input: 122, tokens_output: 25, cost: '0.0135' });
    const updates = dal.eventsOfKind(sid, 'usage.update').map((e) => (JSON.parse(e.payload) as { tokens: { total: number }; cost: { total: string } }));
    expect(updates).toHaveLength(3);
    expect(updates.at(-1)).toMatchObject({ tokens: { input: 122, output: 25, total: 147 }, cost: { total: '0.0135' } });
    expect(updates.map((u) => u.cost.total)).toContain('0.0115');
  });

  it('REQ-EVENTS-053 / PD-MONITOR-001: the child-report summariser\'s request counts against the run like any agent\'s', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1
        ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: read it', run_in_background: false } }], 'Delegating.', { input: 10, output: 2, cost: '0.001' })
        : answer('All done.', { input: 12, output: 3, cost: '0.002' });
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}', { input: 40, output: 8, cost: '0.0004' });
      return answer('The module is small.', { input: 100, output: 20, cost: '0.0105' });
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    // The three agent requests of the case above, plus the summariser's one — no agent's turn, and still the run's.
    expect(dal.getSession(sid)).toMatchObject({ tokens_input: 162, tokens_output: 33, cost: '0.0139' });
    const updates = dal.eventsOfKind(sid, 'usage.update').map((e) => (JSON.parse(e.payload) as { cost: { total: string } }));
    expect(updates).toHaveLength(4);
    expect(updates.at(-1)).toMatchObject({ cost: { total: '0.0139' } });
  });

  describe('PD-TOOLS-006: write scopes', () => {
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
    const heldByApi = { canonicalName: 'api', persona: 'codebase-analyst', pattern: 'src/api/**' };
    /** Until `ready()` holds, yielding to the run between looks; the scripted children park on a hold meanwhile. */
    async function until(ready: () => boolean): Promise<void> {
      for (let i = 0; i < 500 && !ready(); i += 1) await new Promise((r) => setTimeout(r, 1));
      expect(ready()).toBe(true);
    }

    it('a live scope refuses its sibling and the entry agent but not its holder; each child is told the live scopes; the claim lapses when its child ends', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const payloads = new Map<string, string>();
      const { sessions, contexts } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([
            { callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'api', task: 'TASK: api', write_scope: ['src/api/**'] } },
            { callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'ui', task: 'TASK: ui' } },
          ], 'Delegating.') : answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: api') ? 'api' : 'ui';
        if (!payloads.has(name)) payloads.set(name, text);
        return { parts: [{ hold }, ...answer(`${name}: read.`).parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'split the work') as { value: SessionId }).value;
      const running = sessions.running(sid)!;
      await until(() => payloads.size === 2);
      const claim = (agent: string, rel: string) => contexts.get(agent)!.writeClaimFor!(rel);
      // The entry agent and the unscoped sibling are refused inside the scope; the holder is not, and nobody is outside it.
      expect(claim('orchestrator', 'src/api/users.ts')).toMatchObject(heldByApi);
      expect(claim('ui', 'src/api/users.ts')).toMatchObject(heldByApi);
      expect(claim('ui', 'SRC/API/users.ts')).toMatchObject(heldByApi);
      expect(claim('api', 'src/api/users.ts')).toBeNull();
      expect(claim('ui', 'src/ui/view.ts')).toBeNull();
      expect(claim('api', 'src/ui/view.ts')).toBeNull();
      // The disclosure sits immediately after the workspace-root prefix: the holder's own scope, the sibling's view of it.
      expect(payloads.get('api')).toMatch(/Workspace root: [^\n]*\n\nWrite scopes:\n- Yours: 'src\/api\/\*\*'\./);
      expect(payloads.get('ui')).toMatch(/Workspace root: [^\n]*\n\nWrite scopes:\n- Held by other agents[^\n]*\n {2}- api: 'src\/api\/\*\*'\n/);
      // PD-TOOLS-006 revision 2: the declared scope is stored with the child's record, so a resumed child can claim it again.
      expect(Object.fromEntries(children(sid).map((c) => [c.canonical_name, c.write_scope]))).toEqual({ api: '["src/api/**"]', ui: '[]' });
      release();
      expect((await running).status).toBe('completed');
      expect(claim('orchestrator', 'src/api/users.ts')).toBeNull();
    });

    it('the holder\'s own descendants are not refused, and are told the scope belongs to an agent they work under', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const payloads = new Map<string, string>();
      const calls = new Map<string, number>();
      const { sessions, contexts } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'api', task: 'TASK: api', write_scope: ['src/api/**'] } }], 'Delegating.') : answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: deep') ? 'deep' : 'api';
        const n = (calls.get(name) ?? 0) + 1;
        calls.set(name, n);
        if (!payloads.has(name)) payloads.set(name, text);
        if (name === 'api' && n === 1) return toolCalls([{ callId: 'g1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'deep', task: 'TASK: deep' } }], 'Delegating further.');
        return name === 'deep' ? { parts: [{ hold }, ...answer('deep: read.').parts] } : answer('api: done.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'nest the work') as { value: SessionId }).value;
      const running = sessions.running(sid)!;
      await until(() => payloads.has('deep'));
      const claim = (agent: string, rel: string) => contexts.get(agent)!.writeClaimFor!(rel);
      expect(claim('deep', 'src/api/users.ts')).toBeNull();
      expect(claim('orchestrator', 'src/api/users.ts')).toMatchObject(heldByApi);
      expect(payloads.get('deep')).toContain("  - api: 'src/api/**' (you work under this agent, so its scope does not fence you)");
      release();
      expect((await running).status).toBe('completed');
    });

    it('a scope reaching outside the workspace root rejects the delegation: no child, no task id, the reason names the pattern', async () => {
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'escape', task: 'TASK: x', write_scope: ['src/**', '../elsewhere/**'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'try it') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'escape': rejected — write_scope pattern '../elsewhere/**' reaches outside the workspace root.");
      expect(resumed).not.toContain('task_id:');
    });
  });

  it('REQ-TOOLS-030/073 (PD-TOOLS-002): a mid-run switch to autonomous reaches the children built after it', async () => {
    const ref: { sid?: SessionId } = {};
    const { sessions, built } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) {
          // Mid-run, while the entry agent is the only agent: the user picks `autonomous` in the composer.
          expect(sessions.control({ op: 'setPermissionMode', sessionId: ref.sid!, args: { mode: 'autonomous' } })).toEqual({ ok: true });
          return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.');
        }
        return answer('All done.');
      }
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    });
    ref.sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(ref.sid)!).status).toBe('completed');
    // The entry agent was built before the switch; the child was built after it and must carry the new mode.
    expect(built[0]).toMatchObject({ persona: 'orchestrator', mode: 'ask' });
    expect(built.slice(1).map((b) => b.mode)).not.toContain('ask');
  });

  it('REQ-MONITOR-102: the persisted tool-call total is session-wide — the entry agent\'s calls AND its children\'s', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done"}');
      return turn === 1 ? toolCalls([{ callId: 'b1', name: 'background_output', args: { task_id: 'none' } }], 'Checking.') : answer('I implemented it.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(children(sid)[0]!.tool_calls).toBe(1);
    // One delegate by the entry agent, one call by the child. A total that held the entry agent's alone read 1,
    // and every surface that subtracts the per-agent counts from it — the synthetic run row — read zero.
    expect(dal.getSession(sid)!.tool_calls).toBe(2);
  });

  it('a foreground delegation waits through the one mechanism and returns the report inline; wait_for_tasks refuses the caller\'s own task', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'tester', task_name: 'test it', task: 'TASK: run tests', run_in_background: false } }]);
        if (turn === 2) return toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: ['root:1'] } }]);
        return answer('done');
      }
      if (persona === 'summariser') return answer('{"summary":"tests pass"}');
      return answer('All tests pass.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'test') as { value: SessionId }).value;
    await sessions.running(sid)!;
    const rows = dal.residentRows(sid);
    const delegateRow = rows.find((r) => r.kind === 'tool' && r.tool_name === 'delegate')!;
    expect(delegateRow.output).toContain('The waited-for background tasks completed (1).');
    expect(delegateRow.output).toContain('### test-it (tester) — succeeded');
    const waitRow = rows.find((r) => r.kind === 'tool' && r.tool_name === 'wait_for_tasks')!;
    expect(waitRow.output).toBe('An agent cannot wait for its own task.');
    expect(waitRow.tool_status).toBe('failed');
  });

  it('REQ-ORCH-088: a child that never answers times out, reports failed with the timeout, and the parent still completes', async () => {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow' } }]) : answer('finished after the timeout');
      if (persona === 'summariser') return answer('not json');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(children(sid)[0]!.state).toBe('running');
    clock.advance(1_200_000);
    releaseChild();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const c = children(sid)[0]!;
    expect(c.state).toBe('failed');
    const report = JSON.parse(c.report!) as { errors: { type: string; message: string }[] };
    expect(report.errors.map((e) => e.type)).toEqual(expect.arrayContaining(['timeout', 'summary_failure']));
    expect(dal.issuesOf(sid).map((i) => i.kind)).toContain('timeout');
  });

  it('REQ-ORCH-088: the ceiling asks the child to land, so the step in flight finishes and its words reach the report', async () => {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow' } }]) : answer('finished after the timeout');
      if (persona === 'summariser') return answer('not json');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'I surveyed nine files and found the lockfile pins yaml twice' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    clock.advance(1_200_000);
    // The ceiling has passed and the child has NOT been cut: the step in flight is still allowed to answer.
    releaseChild();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const c = children(sid)[0]!;
    expect(c.state).toBe('failed');
    const report = JSON.parse(c.report!) as { last_response: string; final_response: string; errors: { type: string }[] };
    // REQ-ORCH-088: "carrying the last/final response extracted from the transcript" — before the landing
    // this read '' for both, because the abort killed the child inside the step that was about to speak.
    expect(report.last_response).toContain('the lockfile pins yaml twice');
    expect(report.errors.map((e) => e.type)).toContain('timeout');
    // REQ-ORCH-110: it is the LAST response, never the final one — the child was stopped, it did not conclude.
    expect(report.final_response).toBe('');
  });

  it('REQ-ORCH-088 / REQ-CONFIG-113: a child that cannot land inside the grace is still cut off by the backstop', async () => {
    // Nothing in this test ever resolves the hold: the point is that a child which CANNOT land is
    // still ended by the product rather than by the test.
    const hold = new Promise<void>(() => undefined);
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: never answer' } }]) : answer('finished after the backstop');
      if (persona === 'summariser') return answer('not json');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'never said' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    clock.advance(1_200_000);
    await new Promise((r) => setTimeout(r, 10));
    expect(children(sid)[0]!.state).toBe('running'); // asked to land; not cut, because nothing has spoken yet
    // Past the grace, and past a second ceiling too: REQ-ORCH-088's fallback retry may take one more
    // attempt, and it is bounded by the same ladder. The run must end on its own either way.
    for (let i = 0; i < 4 && sessions.running(sid) !== undefined && children(sid)[0]!.state === 'running'; i += 1) {
      clock.advance(30_000);
      await new Promise((r) => setTimeout(r, 10));
      clock.advance(1_200_000);
      await new Promise((r) => setTimeout(r, 10));
    }
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const c = children(sid)[0]!;
    expect(c.state).toBe('failed');
    const report = JSON.parse(c.report!) as { last_response: string; errors: { type: string }[] };
    expect(report.errors.map((e) => e.type)).toContain('timeout');
    // Cut before it could speak — the grace is a chance to land, not an extension of the ceiling.
    expect(report.last_response).toBe('');
    expect(dal.issuesOf(sid).map((i) => i.kind)).toContain('timeout');
  });

  describe('PD-ORCH-004: a child cut off while making progress hands its work back', () => {
    const tick = () => new Promise((r) => setTimeout(r, 10));
    const textOf = (m: ModelRequest['messages'][number]) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('');
    /** A gate the test opens: a tool call waiting on it completes at whatever the clock reads when it is opened. */
    const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
    type StoredCutOff = { statement: string; changed_paths: string[]; changes: string; continuation_offer: string | null };
    type Stored = { status: string; last_response: string; errors: { type: string; message: string }[]; cut_off?: StoredCutOff };
    const reportOf = (row: ChildRow) => JSON.parse(row.report!) as Stored;
    /** The file tools and `read_file`, answered here: a write to `fail.ts` fails, a read of a gate waits for it. */
    const fileTools = (gates: Record<string, Promise<void>>) => (name: string, a: Record<string, unknown>): Promise<PortToolResult> | undefined => {
      if (!['write_file', 'haet_edit', 'read_file'].includes(name)) return undefined;
      const failed = String(a['path']).endsWith('fail.ts');
      const result: PortToolResult = { text: failed ? 'the edit did not apply' : 'ok', isError: failed, status: failed ? 'failed' : 'ok', durationMs: 1, label: name, args: a };
      const waitOn = gates[String(a['path'])];
      return waitOn ? waitOn.then(() => result) : Promise.resolve(result);
    };
    /** A child's step number is the count of its own assistant messages so far, plus one. */
    const stepOf = (req: ModelRequest) => req.messages.filter((m) => m.role === 'assistant').length + 1;
    const hasTask = (req: ModelRequest, task: string) => req.messages.some((m) => m.role === 'user' && textOf(m).includes(task));

    /**
     * One child, delegated by the root, whose last tool call completes when the clock reads `completedAt` (the child
     * started at 0, so its 1,200 s limit expires at 1,200,000); it then speaks once more and is cut off. At its next
     * turn the root tries to continue it and then ends.
     */
    async function cutOffAt(completedAt: number, over: { childStallTimeoutMs?: number } = {}) {
      const g = gate();
      const hold = gate();
      let sid = '' as SessionId;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build' } }]);
          if (turn === 3) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build-rest', task: 'TASK: continue', continuation_of: children(sid)[0]!.task_id } }]);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (stepOf(req) === 1) return toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'src/a.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'gate' } }]);
        return { parts: [{ hold: hold.p }, { part: { kind: 'text', delta: 'I wrote a and was reading on' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { tool: fileTools({ gate: g.p }), ...over });
      sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(completedAt);
      g.open();
      await tick();
      clock.advance(1_200_000 - completedAt);
      hold.open();
      const result = await sessions.running(sid)!;
      return { sid, result, client, row: children(sid)[0]! };
    }

    it('a call completed exactly at the start of the final 90 s is progress: the report adds the statement, the paths and the offer, and the parent reads them', async () => {
      const { sid, result, client, row } = await cutOffAt(1_110_000);
      expect(result.status).toBe('completed');
      expect(row.state).toBe('failed');
      const report = reportOf(row);
      // REQ-ORCH-088's report stands as it was.
      expect(report.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 1200s' }]));
      expect(report.last_response).toBe('I wrote a and was reading on');
      expect(report.cut_off).toEqual({
        statement: 'Cut off while making progress: this child completed a tool call within the final 90s before its 1200s limit expired.',
        changed_paths: ['src/a.ts'],
        changes: 'Workspace paths its file-writing calls changed, in the order first changed: src/a.ts.',
        continuation_offer: expect.stringContaining(`continuation_of: "${row.task_id}"`),
      });
      // The parent's resume message carries all three, after the report's result text.
      const resume = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!)))[2]!;
      const block = textOf([...resume.messages].reverse().find((m) => m.role === 'user')!);
      expect(block).toContain(`### build (coding-agent) — failed\nI wrote a and was reading on\n${report.cut_off!.statement}\n${report.cut_off!.changes}\n${report.cut_off!.continuation_offer}`);
      // The continuation was admitted and carries the relationship in its record.
      const rest = children(sid).find((c) => c.canonical_name === 'build-rest')!;
      expect(rest.continuation_of).toBe(row.task_id);
      expect(row.continuation_of).toBeNull();
    });

    it('a call completed one millisecond before the final 90 s is not progress: exactly REQ-ORCH-088\'s report, and no continuation is admitted', async () => {
      const { sid, client, row } = await cutOffAt(1_109_999);
      expect(row.state).toBe('failed');
      const report = reportOf(row);
      expect(report.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 1200s' }]));
      expect(report.cut_off).toBeUndefined();
      const resume = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!)))[2]!;
      expect(textOf([...resume.messages].reverse().find((m) => m.role === 'user')!)).not.toMatch(/Cut off|continuation/);
      // The root's attempt to continue it is refused before a record exists.
      expect(children(sid)).toHaveLength(1);
      const after = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!)))[3]!;
      expect(textOf(after.messages.at(-1)!)).toMatch(/rejected — Task 'build' \(bg_[0-9a-f]{8}\) made no continuation offer/);
    });

    it('runtime.child_stall_timeout is the window: at 60 s, a call completed 60.001 s before the expiry is not progress', async () => {
      const { row } = await cutOffAt(1_139_999, { childStallTimeoutMs: 60_000 });
      expect(reportOf(row).cut_off).toBeUndefined();
    });

    it('the paths are listed in the order first changed, once each; the continuation says it changed none and is never continued in turn; work is continued once', async () => {
      const g1 = gate(); const hold1 = gate(); const g2 = gate(); const hold2 = gate();
      let sid = '' as SessionId;
      const idOf = (name: string) => children(sid).find((c) => c.canonical_name === name)!.task_id;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build' } }]);
          if (turn === 3) {
            // The offer named the id to use: take it from the resume message rather than from the store.
            const offered = /continuation_of: "(bg_[0-9a-f]{8})"/.exec(textOf([...req.messages].reverse().find((m) => m.role === 'user')!))![1]!;
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build-rest', task: 'TASK: continue', continuation_of: offered } }]);
          }
          if (turn === 5) return toolCalls([
            { callId: 'd3', name: 'delegate', args: { persona: 'coding-agent', task_name: 'chain', task: 'TASK: chain', continuation_of: idOf('build-rest') } },
            { callId: 'd4', name: 'delegate', args: { persona: 'coding-agent', task_name: 'again', task: 'TASK: again', continuation_of: idOf('build') } },
            { callId: 'd5', name: 'delegate', args: { persona: 'coding-agent', task_name: 'nobody', task: 'TASK: nobody', continuation_of: 'bg_00000000' } },
          ]);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (hasTask(req, 'TASK: build')) {
          const step = stepOf(req);
          if (step === 1) return toolCalls([
            { callId: 'b1', name: 'write_file', args: { path: 'src/b.ts', content: 'b' } },
            { callId: 'b2', name: 'haet_edit', args: { path: './src/a.ts' } },
            { callId: 'b3', name: 'write_file', args: { path: 'src/fail.ts', content: 'x' } },
          ]);
          if (step === 2) return toolCalls([
            { callId: 'b4', name: 'write_file', args: { path: '/ws/src/b.ts', content: 'b2' } },
            { callId: 'b5', name: 'haet_edit', args: { file_path: 'docs/c.md' } },
            { callId: 'b6', name: 'read_file', args: { path: 'gate1' } },
          ]);
          return { parts: [{ hold: hold1.p }, { part: { kind: 'text', delta: 'halfway' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        }
        if (stepOf(req) === 1) return toolCalls([{ callId: 'c1', name: 'read_file', args: { path: 'gate2' } }]);
        return { parts: [{ hold: hold2.p }, { part: { kind: 'text', delta: 'still reading' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { tool: fileTools({ gate1: g1.p, gate2: g2.p }) });
      sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(1_150_000); g1.open(); await tick();
      clock.advance(50_000); hold1.open(); await tick(); await tick();
      // The continuation started when the root delegated it, at 1,200,000; its own limit expires at 2,400,000.
      expect(children(sid).find((c) => c.canonical_name === 'build-rest')?.state).toBe('running');
      clock.advance(1_150_000); g2.open(); await tick();
      clock.advance(50_000); hold2.open();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('completed');

      const build = children(sid).find((c) => c.canonical_name === 'build')!;
      const rest = children(sid).find((c) => c.canonical_name === 'build-rest')!;
      expect(reportOf(build).cut_off!.changed_paths).toEqual(['src/b.ts', 'src/a.ts', 'docs/c.md']);
      expect(rest.continuation_of).toBe(build.task_id);
      expect(rest.state).toBe('failed');
      const restReport = reportOf(rest);
      expect(restReport.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 1200s' }]));
      expect(restReport.cut_off).toMatchObject({ changed_paths: [], changes: 'Its file-writing calls changed no workspace paths.', continuation_offer: null });
      expect(restReport.cut_off!.statement).toMatch(/^Cut off while making progress/);
      // The three refused continuations created no record, and each says why.
      expect(children(sid).map((c) => c.canonical_name)).toEqual(['build', 'build-rest']);
      const last = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!))).at(-1)!;
      const refusals = textOf(last.messages.at(-1)!);
      expect(refusals).toContain(`Task 'chain': rejected — Task 'build-rest' (${rest.task_id}) made no continuation offer`);
      expect(refusals).toContain(`Task 'again': rejected — Task 'build' (${build.task_id}) was already continued by 'build-rest' (${rest.task_id})`);
      expect(refusals).toContain("Task 'nobody': rejected — continuation_of 'bg_00000000' names no child task of yours");
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'timeout')).toHaveLength(2);
    });
  });

  function holdingChild() {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('never');
      if (persona === 'summariser') return answer('{}');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    return { sessions, release: () => releaseChild() };
  }

  it('PD-ORCH-005 clause 3 (narrowing REQ-ORCH-052): a stop while a child runs leaves it paused by the stop, the iteration open, and the run ends interrupted', async () => {
    const { sessions, release } = holdingChild();
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    const c = children(sid)[0]!;
    // Its model step was cut by the stop, so it resumes running; nothing settled it, summarised it or stored a report.
    expect(c).toMatchObject({ state: 'paused', interruption: 'stop', resume_state: 'running', completed_at: null, report_stored: 0 });
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', outcome: null, interruption: 'stop' }]);
    expect(dal.getSession(sid)!.execution_status).toBe('paused');
    expect(dal.getSession(sid)!.iterations_completed).toBe(0);
  });

  it('PD-ORCH-005 clause 3: the explicit cancel (REQ-MONITOR-126, the reserved run id) is final — its child settles cancelled with a report and the iteration closes', async () => {
    const { sessions, release } = holdingChild();
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
    release();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    const c = children(sid)[0]!;
    expect(c.state).toBe('cancelled');
    expect(c.interruption).toBeNull();
    expect(c.completed_at).not.toBeNull();
    expect(JSON.parse(c.report!)).toMatchObject({ status: 'cancelled' });
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled', interruption: null }]);
  });

  it('REQ-ORCH-053: a later run on the same session settles a phantom child left by a killed host before its first iteration', async () => {
    const { sessions } = sessionsWith(() => answer('hi'));
    // A child left `running` by a previous run (as a killed host would leave it).
    const sid0 = 'S-prev' as SessionId;
    const w = SessionWriter.create({ dal, sessionId: sid0, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
    if (!w.ok) throw new Error('writer');
    w.value.spawnChild({ task_id: 'bg_0000dead', canonical_name: 'ghost', given_name: 'ghost', persona: 'coding-agent', state: 'running', parent_id: 'root:1', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}' });
    w.value.release(1, HOST);
    // The next run on that session id is refused by design (a new session is minted per prompt today), so the sweep is exercised directly.
    const settled = (await import('./orchestration.js')).settleStaleChildren(dal, w.value, sid0, () => undefined);
    expect(settled).toBe(1);
    expect(dal.getChild(sid0, 'bg_0000dead')).toMatchObject({ state: 'cancelled', report_stored: 1 });
    void sessions;
  });

  it('REQ-ORCH-050: with a cap of 1 the second child parks waiting_on_model_slot and is promoted when the first ends', async () => {
    let releaseFirst!: () => void;
    const hold = new Promise<void>((r) => { releaseFirst = r; });
    let childCalls = 0;
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]);
        return answer('both done');
      }
      if (persona === 'summariser') return answer('{"summary":"ok"}');
      childCalls += 1;
      // the first child holds its slot until the second has been delegated and parked
      return childCalls === 1 ? { parts: [{ hold }, { part: { kind: 'text', delta: 'done' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer('done');
    }, { cap: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 200 && !(children(sid).length === 2 && children(sid)[1]!.state === 'waiting_on_model_slot'); i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(children(sid).map((c) => c.state).sort()).toEqual(['running', 'waiting_on_model_slot']);
    releaseFirst();
    await sessions.running(sid)!;
    const rows = children(sid);
    expect(rows.map((c) => c.state)).toEqual(['succeeded', 'succeeded']);
    const delegateRows = dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.tool_name === 'delegate');
    expect(delegateRows[1]!.output).toMatch(/waiting_on_model_slot — Queued behind model 'm''s slot cap: 1 of 1 slots in use/);
    const trans = dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { child_id: string; from_state: string; to_state: string });
    const two = rows.find((c) => c.canonical_name === 'two')!.task_id;
    expect(trans.filter((t) => t.child_id === two).map((t) => t.to_state)).toEqual(['queued', 'starting', 'running', 'summarizing', 'succeeded']);
  });

  it('REQ-MONITOR-009 / REQ-ORCH-133: cancelAgent settles one child cancelled with the user\'s timeline entry; the reserved id cancels the run; unknown ids refuse', async () => {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('ok');
      if (persona === 'summariser') return answer('{"summary":"x"}');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    const id = children(sid)[0]!.task_id;
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: '' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'bg_00000000' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: id } })).toEqual({ ok: true });
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: id } })).toEqual({ ok: false });
    expect(dal.timelineOf(sid).map((t) => t.name)).toContain('child_user_cancelled');
    releaseChild();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(children(sid)[0]!.state).toBe('cancelled');
    void millis;
  });

  describe('PD-ORCH-005 phase 3: a pause, a stop and a quit leave every unfinished agent paused, and a cancel stops what it cancels', () => {
    const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow => children(sid).find((c) => c.canonical_name === name)!;

    /** Two background children under a cap of one: `one` is mid-step on a held model call, `two` waits on the slot. */
    function heldPair() {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const seen = { summaries: 0, childSteps: 0, orchestratorSteps: 0 };
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          seen.orchestratorSteps += 1;
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]) : answer('both delegated');
        }
        if (persona === 'summariser') { seen.summaries += 1; return answer('{"summary":"x"}'); }
        seen.childSteps += 1;
        // The step in flight when the pause is accepted finishes by asking for a call.
        return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      }, { cap: 1 });
      return { sessions, seen, release: () => release() };
    }

    it('clause 2, the repair of a-pause-settles-children-instead-of-holding-them: no model call after the pause, no queued child starts, nothing summarises — every unfinished agent is left paused where it stood and the iteration open', async () => {
      const { sessions, seen, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('interrupted');
      expect(dal.getSession(sid)!.execution_status).toBe('paused');
      // No summarising call, no step of the parked child, nothing after the pause but the step already in flight.
      expect(seen).toEqual({ summaries: 0, childSteps: 1, orchestratorSteps: 2 });
      expect(byName(sid, 'one')).toMatchObject({ state: 'paused', interruption: 'pause', resume_state: 'running', completed_at: null, report_stored: 0 });
      expect(byName(sid, 'two')).toMatchObject({ state: 'paused', interruption: 'pause', resume_state: 'waiting_on_model_slot', completed_at: null, report_stored: 0 });
      // The call the in-flight step asked for never ran, and the record says so for the resume to read.
      const last = conversationOf(dal.agentConversation(sid, byName(sid, 'one').task_id)).at(-1)!;
      expect(last.role).toBe('tool');
      expect(last.content).toEqual([expect.objectContaining({ callId: 'p1', isError: true, result: expect.stringMatching(/^This call was not run: it was interrupted by the pause/) })]);
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', outcome: null, interruption: 'pause' }]);
      expect(dal.eventsOfKind(sid, 'iteration.end')).toHaveLength(0);
      // The open iteration still holds its task: neither re-queued nor closed.
      expect(decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases[0]!.tasks[0]!.state).toBe('in_progress');
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_paused')).toHaveLength(2);
      expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'iteration_paused')!.metadata)).toMatchObject({ iteration: 1, interruption: 'pause', paused_agents: 3 });
    });

    it('clause 3: a quit (the application closing its sessions) leaves the same state, recorded as quit', async () => {
      const { sessions, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      const closing = sessions.closeAll();
      release();
      await closing;
      expect(children(sid).map((c) => [c.canonical_name, c.state, c.interruption]).sort()).toEqual([['one', 'paused', 'quit'], ['two', 'paused', 'quit']]);
      expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'quit' }]);
      expect(dal.getSession(sid)!.stop_reason).toBe('application_shutdown');
    });

    it('REQ-ORCH-053 narrowed: the stale-child settle leaves a paused agent as it is', async () => {
      const { sessions, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      release();
      await sessions.running(sid)!;
      const w = SessionWriter.open({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { pid: 5, host: HOST, isProcessAlive: () => false });
      if (!w.ok) throw new Error('writer');
      expect((await import('./orchestration.js')).settleStaleChildren(dal, w.value, sid, () => undefined)).toBe(0);
      expect(children(sid).map((c) => c.state)).toEqual(['paused', 'paused']);
    });

    it('until the resume is built, a continue ends the paused agents cancelled — clause 6\'s "continue without them" — closes the open iteration cancelled, and works in a new one', async () => {
      const { sessions, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      release();
      await sessions.running(sid)!;
      expect(sessions.prompt(sid, 'go on').ok).toBe(true);
      await sessions.running(sid)!;
      for (const name of ['one', 'two']) {
        expect(byName(sid, name)).toMatchObject({ state: 'cancelled', interruption: 'pause', report_stored: 1 });
        expect(JSON.parse(byName(sid, name).report!)).toMatchObject({ status: 'cancelled', summary: expect.stringMatching(/continued without this agent, which the pause had left paused/) });
      }
      // The open iteration's task stays anchored (REQ-ORCH-135): it is worked again first, then the new prompt.
      expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'cancelled'], [2, 'closed', 'succeeded'], [3, 'closed', 'succeeded']]);
      const first = dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; summary: string }).find((e) => e.iteration === 1)!;
      expect(first.summary).toBe('the session was continued without the agents the pause had left paused');
    });

    it('REQ-SESSION-092 (found by phase 3\'s review): a stop waits for its agents within the 30 s grace, so a call that ignores the stop cannot hold the run open', async () => {
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: stuck' } }]) : answer('delegated');
        return toolCalls([{ callId: 'h1', name: 'hang', args: {} }], 'Hanging.');
      }, { tool: (name) => (name === 'hang' ? new Promise<PortToolResult>(() => undefined) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'hang'));
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(30_000);
      const ended = await Promise.race([sessions.running(sid)!.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 1_000))]);
      expect(ended).toBe(true);
      expect(byName(sid, 'stuck')).toMatchObject({ state: 'paused', interruption: 'stop', resume_state: 'running' });
      expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'stop' }]);
    });

    /** One background child whose steps the test scripts one by one; each step may wait on the promise it is given. */
    function scriptedChild(steps: readonly ((n: number) => ScriptedCall)[], over: { childTimeoutMs?: number; summary?: (req: ModelRequest) => ScriptedCall; root?: (turn: number) => ScriptedCall } = {}) {
      const seen = { summaries: 0, childSteps: 0 };
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return over.root?.(turn) ?? (turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work', write_scope: ['src/**'] } }]) : answer('ok'));
        if (persona === 'summariser') { seen.summaries += 1; return over.summary?.(req) ?? answer('{"summary":"x"}'); }
        seen.childSteps += 1;
        return (steps[seen.childSteps - 1] ?? (() => answer('done')))(seen.childSteps);
      }, over);
      return { sessions, seen };
    }
    const gate = () => { let open!: () => void; const hold = new Promise<void>((r) => { open = r; }); return { hold, open: () => open() }; };
    const look = (): ScriptedCall => toolCalls([{ callId: 'b1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Looking.');
    async function pauseAt(sessions: Sessions, sid: SessionId, reached: () => boolean, release: () => void): Promise<void> {
      await settle(reached);
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
    }

    it('clause 2 (found by phase 3\'s review): a child that ended with a report its parent has not been given leaves the parent unfinished — the rest holds the iteration open', async () => {
      const g = gate();
      const delegate = toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
      const { sessions } = scriptedChild([look, () => answer('done')], { root: (turn) => (turn === 1 ? delegate : { parts: [{ hold: g.hold }, ...answer('Mid-step.').parts] }) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => byName(sid, 'work')?.state === 'succeeded', g.open);
      // The child's report was never given to the root: the root is not done, so the iteration is open and the report owed.
      expect(byName(sid, 'work')).toMatchObject({ state: 'succeeded', observed: 0 });
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'pause' }]);
      expect(decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases[0]!.tasks[0]!.state).toBe('in_progress');
    });

    it('clause 2 with REQ-ORCH-095: a child that answered without a call when the pause came still owes its re-prompt, so it resumes running, not summarising', async () => {
      const g = gate();
      const { sessions, seen } = scriptedChild([() => ({ parts: [{ hold: g.hold }, ...answer('I would do it.').parts] })]);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await pauseAt(sessions, sid, () => seen.childSteps === 1, g.open);
      expect(byName(sid, 'work')).toMatchObject({ state: 'paused', resume_state: 'running' });
      expect(seen).toEqual({ summaries: 0, childSteps: 1 });
    });

    it('clause 3 (found by phase 3\'s review): the explicit cancel is final even while the run is coming to rest — nothing is left paused and the iteration closes', async () => {
      const { sessions, release } = heldPair();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      // The root is woken and its turn comes to rest, which then waits on `one`'s step in flight: the user cancels the run
      // in that window, after the rest began and before it paused anything.
      await new Promise((r) => setTimeout(r, 20));
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      expect(children(sid).map((c) => c.state)).toEqual(['cancelled', 'cancelled']);
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled', interruption: null }]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_paused')).toEqual([]);
    });

    it('REQ-ORCH-133 (found by phase 3\'s review): a child cancelled while it summarises keeps the cancellation\'s report — the summarising call is aborted and nothing is written over it', async () => {
      const g = gate();
      let summarising: AbortSignal | null = null;
      const { sessions, seen } = scriptedChild([look, () => answer('Finished.')], { summary: (req) => { summarising = req.signal; return { parts: [{ hold: g.hold }, ...answer('{"summary":"the summariser won"}').parts] }; } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'summarizing' && seen.summaries === 1);
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      expect(summarising!.aborted).toBe(true);
      g.open();
      await sessions.running(sid)!;
      expect(byName(sid, 'work')).toMatchObject({ state: 'cancelled' });
      expect(JSON.parse(byName(sid, 'work').report!)).toMatchObject({ status: 'cancelled', summary: 'The user cancelled this child.' });
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_end')).toEqual([]);
    });

    it('REQ-TOOLS-156 at a rest: a parent waiting in wait_for_tasks is released at once, and its wait is recorded as interrupted', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
          return turn === 2 ? toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [] } }]) : answer('never');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'wait_for_tasks'));
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      await settle(() => !sessions.isRunActive(sid) || dal.getSession(sid)!.execution_status !== 'pausing');
      release();
      await sessions.running(sid)!;
      const root = dal.iterationsOf(sid)[0]!.root_task_id;
      const waited = conversationOf(dal.agentConversation(sid, root)).flatMap((m) => m.content.flatMap((p) => (p.kind === 'tool-result' ? [p] : []))).find((p) => p.callId === 'w1');
      expect(waited).toMatchObject({ isError: true, result: expect.stringMatching(/^This call was interrupted by the pause before it completed[\s\S]*The wait for .* was interrupted by the pause: the tasks were paused with the run/) });
      expect(children(sid)[0]).toMatchObject({ state: 'paused', interruption: 'pause' });
    });

    it('REQ-ORCH-133 / REQ-MONITOR-128, the repair of cancelling-one-child-does-not-stop-it: cancelling a child aborts its execution and its descendant\'s, and the cancellation\'s report is the one that stays', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const seen = { summaries: 0, stepsAfterRelease: 0, released: false };
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('ok');
        if (persona === 'summariser') { seen.summaries += 1; return answer('{"summary":"x"}'); }
        if (seen.released) seen.stepsAfterRelease += 1;
        const grand = userText(req).includes('TASK: grand');
        const delegated = req.messages.some((m) => m.role === 'tool');
        if (!grand && !delegated) return toolCalls([{ callId: 'g1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'grand', task: 'TASK: grand' } }], 'Delegating.');
        return { parts: [{ hold }, ...answer(grand ? 'grand late' : 'late').parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && children(sid).every((c) => c.state === 'running'));
      const work = byName(sid, 'work').task_id;
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: work } })).toEqual({ ok: true });
      // Both settle at once: the child and, with it, its live descendant.
      expect(children(sid).map((c) => c.state)).toEqual(['cancelled', 'cancelled']);
      seen.released = true;
      release();
      await sessions.running(sid)!;
      // Neither aborted execution took another step, summarised, or wrote over the cancellation's report.
      expect(seen.summaries).toBe(0);
      expect(seen.stepsAfterRelease).toBe(0);
      expect(JSON.parse(byName(sid, 'work').report!)).toMatchObject({ status: 'cancelled', summary: 'The user cancelled this child.' });
      expect(JSON.parse(byName(sid, 'grand').report!)).toMatchObject({ status: 'cancelled', summary: 'Cancelled with work, which the user cancelled.' });
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled').map((t) => JSON.parse(t.metadata) as Record<string, unknown>)).toEqual([{ task_id: work }, { task_id: byName(sid, 'grand').task_id, cancelled_with: work }]);
      // An explicit cancel is final: nothing it ended is paused or carries an interruption.
      expect(children(sid).map((c) => c.interruption)).toEqual([null, null]);
    });
  });

  describe('REQ-ORCH-072: the root execution record identity and lookups', () => {
    it('carries canonical name and task id in the children namespace, and is distinct from delegated children', () => {
      const sid = 'S-root-test' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const ledger = new ChildLedger({ dal, writer: w.value, sessionId: sid, iteration: 1, budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 }, modelCap: () => null, warn: () => undefined });
      expect(ledger.root.taskId).toMatch(TASK_ID_PATTERN);
      expect(ledger.root.canonicalName).toBe('orchestrator');
      expect(ledger.root.persona).toBe('orchestrator');
      expect(ledger.root.depth).toBe(0);
      expect(ledger.root.state).toBe('running');
      // The root record is NOT a delegated child row
      expect(ledger.all()).toHaveLength(0);
      expect(ledger.activeCount()).toBe(0);
      expect(ledger.slotsInUse('m')).toBe(0);
      // isRoot recognizes all forms of identity
      expect(ledger.isRoot(ledger.root.taskId)).toBe(true);
      expect(ledger.isRoot(ledger.root.canonicalName)).toBe(true);
      expect(ledger.isRoot('root')).toBe(true);
      expect(ledger.isRoot('root:1')).toBe(true);
      expect(ledger.isRoot('bg_ffffffff')).toBe(false);
      w.value.release(1, HOST);
    });

    it('wait_for_tasks and background_output lookups naming the root resolve and enforce parent-scoping', async () => {
      const sid = 'S-ops-test' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const { IterationChildren } = await import('./orchestration.js');
      const ops = new IterationChildren({
        dal,
        writer: w.value,
        sessionId: sid,
        workspaceRoot: 'C:/ws',
        owner: null as unknown as ProjectionOwner,
        backend: new DefaultAgentBackend(new ScriptedModelClient([])),
        clocks: clock,
        model: MODEL,
        thinking: 'unset',
        modelTimeoutMs: 1000,
        modelRetries: 0,
        credentialFor: () => async () => '',
        maxStepsPerTurn: 10,
        budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 },
        modelCap: () => null,
        toolsFor: () => null,
        summariser: null,
        runSignal: new AbortController().signal,
        warn: () => undefined,
      }, 1);
      const rootId = ops.ledger.root.taskId;
      const rootName = ops.ledger.root.canonicalName;
      // 1. Root caller waiting for its own task (by task id, canonical name, 'root', or 'root:1') is refused
      expect(await ops.waitForTasks(rootId, [rootId])).toEqual({ refused: 'An agent cannot wait for its own task.' });
      expect(await ops.waitForTasks(rootId, [rootName])).toEqual({ refused: 'An agent cannot wait for its own task.' });
      expect(await ops.waitForTasks(rootId, ['root'])).toEqual({ refused: 'An agent cannot wait for its own task.' });
      expect(await ops.waitForTasks(rootId, ['root:1'])).toEqual({ refused: 'An agent cannot wait for its own task.' });

      // 2. Child caller waiting for root is refused under parent-scoping, NOT told root is not a task id
      const childId = 'bg_11112222';
      expect(await ops.waitForTasks(childId, [rootId])).toEqual({ refused: 'An agent can wait only for its direct child tasks.' });
      expect(await ops.waitForTasks(childId, [rootName])).toEqual({ refused: 'An agent can wait only for its direct child tasks.' });
      expect(await ops.waitForTasks(childId, ['root'])).toEqual({ refused: 'An agent can wait only for its direct child tasks.' });
      // Non-existent invalid id is refused as not a task id
      expect(await ops.waitForTasks(childId, ['not-a-task-id'])).toEqual({ refused: "'not-a-task-id' is not a task id." });

      // 3. background_output naming the root reads as not_found under parent-scoping (caller does not own root)
      expect(ops.backgroundOutput(rootId, rootId, 'summary')).toEqual({ status: 'not_found', state: '', text: '' });
      expect(ops.backgroundOutput(childId, rootId, 'summary')).toEqual({ status: 'not_found', state: '', text: '' });
      expect(ops.backgroundOutput(childId, rootName, 'summary')).toEqual({ status: 'not_found', state: '', text: '' });

      w.value.release(1, HOST);
    });

    it('end-to-end: delegated children carry the root task id as parent_id and steer/cancel resolve the root', async () => {
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      let rootCapturedTaskId = '';
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'child-task', task: 'TASK: do child work', run_in_background: false } }]);
          return answer('done');
        }
        if (persona === 'summariser') return answer('{"summary":"child done"}');
        return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'build with root') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      // Access root execution record identity
      const childRow = children(sid)[0]!;
      rootCapturedTaskId = childRow.parent_id;
      expect(rootCapturedTaskId).toMatch(TASK_ID_PATTERN);
      expect(childRow.depth).toBe(1);

      // Steer by root task id
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: rootCapturedTaskId, text: 'keep going' } })).toMatchObject({ ok: true });
      // Steer by root canonical name
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: 'orchestrator', text: 'focus' } })).toMatchObject({ ok: true });

      releaseChild();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('completed');
    });

    it('end-to-end: cancelAgent naming the root by task id stops the run', async () => {
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'child-task', task: 'TASK: do child work', run_in_background: false } }]);
          return answer('done');
        }
        if (persona === 'summariser') return answer('{"summary":"child done"}');
        return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'build with cancel') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      const childRow = children(sid)[0]!;
      const rootTaskId = childRow.parent_id;

      // Cancel by root task id
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: rootTaskId } })).toEqual({ ok: true });
      releaseChild();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('interrupted');
    });
  });
});
