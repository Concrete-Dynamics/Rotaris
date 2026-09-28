import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling, type AgentMessageRow } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ChatMessage, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { BUILT_IN_PERSONAS, RUN_CONFIG_DEFAULTS, Sessions, SessionWriter, type DelegationOps, type ModelLookup, type PortToolResult, type Publisher, type RoleName, type RunConfig, type SessionsDeps, type ToolPort } from '../index.js';
import { ConversationRecord, conversationOf, fingerprintOf } from './record.js';
import { takenTaskIds } from '../children/naming.js';
import { decodeStoredTodo, encodeStoredTodo } from '../todo-view.js';

/**
 * PD-ORCH-005 clauses 1 and 12 — the conversation record, written as it happens: the root's and every child's
 * conversation under its task id, the iteration recorded with its root's task id, a compression written into the
 * record, and the transcript clear removing the records of closed iterations only.
 */
const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };
const TRIGGER = { tokens: 0, thresholdPercentage: 60, capacity: 1000, advertisedInputLimit: 1000, defaultThreshold: 265_000 };

describe('conversationOf — the decode a resume reads (PD-ORCH-005)', () => {
  const row = (seq: number, kind: 'message' | 'replacement', body: unknown): AgentMessageRow => ({ session_id: 's', task_id: 't', seq, iteration: 1, kind, body: JSON.stringify(body), at: 't' });
  const user = (text: string): ChatMessage => ({ role: 'user', content: [{ kind: 'text', text }] });
  it('messages in order; a replacement puts its whole conversation in place of everything before it', () => {
    expect(conversationOf([row(1, 'message', user('a')), row(2, 'message', user('b'))])).toEqual([user('a'), user('b')]);
    expect(conversationOf([row(1, 'message', user('a')), row(2, 'replacement', [user('summary')]), row(3, 'message', user('c'))])).toEqual([user('summary'), user('c')]);
    // REQ-ORCH-088's retry: an empty replacement starts the conversation again.
    expect(conversationOf([row(1, 'message', user('a')), row(2, 'replacement', []), row(3, 'message', user('a again'))])).toEqual([user('a again')]);
  });
});

describe('the conversation record in a run (PD-ORCH-005 clauses 1 and 12)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-record-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const systemOf = (req: ModelRequest): string => req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '';
  const personaOf = (req: ModelRequest): string => /^You condense an agent conversation/.test(systemOf(req)) ? 'compressor' : /^You are the orchestrator/.test(systemOf(req)) ? 'orchestrator' : /summarise/i.test(systemOf(req)) ? 'summariser' : 'child';
  const ok = (text: string, args: Record<string, unknown> = {}): PortToolResult => ({ text, isError: false, status: 'ok', durationMs: 1, label: 'x', args });

  /** The three delegation tools straight to the ops, and one `probe` tool the test answers itself. */
  function port(ops: DelegationOps | undefined, parentId: string): ToolPort {
    return {
      specs: () => ['delegate', 'wait_for_tasks', 'probe'].map((n) => ({ name: n, description: n, parameters: { type: 'object' } })),
      dispatch: async (c) => {
        const a = JSON.parse(c.rawArgs) as Record<string, unknown>;
        if (c.name === 'probe') return ok(`probed ${String(a['what'] ?? '')}`, a);
        if (c.name === 'delegate' && ops) {
          const r = await ops.delegate(parentId, { persona: String(a['persona']), taskName: String(a['task_name']), task: String(a['task']), dependsOn: [], inheritedContext: [], category: '', runInBackground: a['run_in_background'] !== false });
          return r.status === 'rejected' ? { ...ok(r.message), isError: true, status: 'failed' } : ok(`Task '${r.canonicalName}': ${r.status}\ntask_id: ${r.taskId}`);
        }
        return { ...ok(`unknown ${c.name}`), isError: true, status: 'failed' };
      },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    };
  }

  function sessionsWith(script: (persona: string, turn: number) => ScriptedCall, compression?: { triggerTokens: number }, checkpoints?: SessionsDeps['checkpoints']) {
    const counts = new Map<string, number>();
    const client = new ScriptedModelClient([]);
    const original = client.stream.bind(client);
    client.stream = (req) => {
      const persona = personaOf(req);
      const n = (counts.get(persona) ?? 0) + 1;
      counts.set(persona, n);
      client.push(script(persona, n));
      return original(req);
    };
    const warnings: string[] = [];
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' };
    const backend = new DefaultAgentBackend(client);
    const models = (key: string): ModelLookup => ({ ok: false, reason: `'${key}' is not a configured model` });
    const personas = { resolve: (name: string) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: base, alias: null } : null; }, knownRoles: () => Object.keys(BUILT_IN_PERSONAS) };
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 79, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `S-rec-${++minted}`,
      model: null, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), attended: () => true, onRunResult: () => undefined,
      tools: (ctx) => port(ctx.delegation, ctx.parentId ?? 'root'),
      ...(checkpoints ? { checkpoints } : {}),
      configure: () => ({ ok: true, value: {
        model: {
          backend, config,
          ...(compression ? { compression: { model: null, timeoutMs: 120_000, charsPerToken: 4, preserveRecentTurns: 1, triggerFor: () => ({ ...TRIGGER, tokens: compression.triggerTokens }) } } : {}),
        },
        models, personas,
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0 },
        resilience: { catalogue: [], fallbackModel: null },
      } }),
    });
    return { sessions, client, warnings };
  }
  /** What a request carried, less the system message the backend puts first. */
  const sent = (req: ModelRequest): ChatMessage[] => req.messages.slice(1) as ChatMessage[];
  const recorded = (sid: SessionId, taskId: string): ChatMessage[] => conversationOf(dal.agentConversation(sid, taskId));
  const assistant = (text: string): ChatMessage => ({ role: 'assistant', content: [{ kind: 'text', text }] });

  it('clause 1: the root\'s and the child\'s conversations are recorded under their task ids, exactly as their models saw them', async () => {
    const { sessions, client } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: probe it', run_in_background: true } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"probed","key_findings":[],"tags":[]}');
      return turn === 1 ? toolCalls([{ callId: 'p1', name: 'probe', args: { what: 'x' } }], 'Probing.') : answer('Probed x.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'probe the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');

    // The iteration is recorded with its root's task id and the todo task it worked on, and closed with its outcome.
    const [iteration] = dal.iterationsOf(sid);
    expect(iteration).toMatchObject({ iteration: 1, root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: `${sid}:main:1`, state: 'closed', outcome: 'succeeded' });
    const child = dal.childrenOf(sid)[0]!;
    expect(child.parent_id).toBe(iteration!.root_task_id);

    // Each agent's record is what its LAST request sent, followed by the answer that request produced.
    const last = (persona: string) => client.requests.filter((r) => personaOf(r) === persona).at(-1)!;
    expect(recorded(sid, iteration!.root_task_id)).toEqual([...sent(last('orchestrator')), assistant('All done.')]);
    expect(recorded(sid, child.task_id)).toEqual([...sent(last('child')), assistant('Probed x.')]);
    // Every tool call with its arguments and every tool result is in it (the child's probe).
    const kinds = recorded(sid, child.task_id).flatMap((m) => m.content.map((p) => p.kind));
    expect(kinds).toEqual(expect.arrayContaining(['tool-call', 'tool-result']));
    // Only the two agents have records: the summarising pass is no agent's conversation and records nothing.
    const recordedAgents = (dal.db.prepare('SELECT DISTINCT task_id FROM agent_messages WHERE session_id = ?').all(sid) as { task_id: string }[]).map((r) => r.task_id).sort();
    expect(recordedAgents).toEqual([iteration!.root_task_id, child.task_id].sort());
  });

  /** The residue a run host that died mid-`iteration` leaves: its row open, the count not yet moved, its todo task in progress. */
  function dieIn(sid: SessionId, iteration: number, taskIdPart: string): void {
    dal.db.prepare("UPDATE iterations SET state = 'open', outcome = NULL, closed_at = NULL WHERE session_id = ? AND iteration = ?").run(sid, iteration);
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    for (const phase of planner.phases) for (const task of phase.tasks) if (task.id.endsWith(taskIdPart)) task.state = 'in_progress';
    dal.updateSessionRun(sid, { iterations_completed: iteration - 1, todo: encodeStoredTodo({ ...stored, planner }) });
  }
  /** The same residue as a rest leaves it: the interruption recorded and the session `paused`, so the Continue action applies. */
  function restIn(sid: SessionId, iteration: number, taskIdPart: string): void {
    dieIn(sid, iteration, taskIdPart);
    dal.setIterationInterruption(sid, iteration, 'pause');
    dal.db.prepare("UPDATE sessions SET execution_status = 'paused' WHERE session_id = ?").run(sid);
  }

  it('PD-ORCH-005 clause 4, and the repair of a-crashed-iteration-number-is-reused-by-the-next-run: a dead run\'s open iteration is resumed — its number, its root and its task — and the new message is its root\'s next message', async () => {
    const { sessions, client, warnings } = sessionsWith(() => answer('Answered.'));
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const root = dal.iterationsOf(sid)[0]!.root_task_id;
    const before = recorded(sid, root);
    dieIn(sid, 1, ':main:1');

    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(SessionWriter.storeFailure(dal)).toBeUndefined();
    // One iteration, the same one: its number and its root's task id carried on, and nothing appended to the todo.
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'succeeded', root_task_id: root, interruption: null }]);
    const tasks = decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks);
    expect(tasks.map((t) => [t.text, t.state])).toEqual([['first', 'complete']]);
    // The root carried on from its record, the new message its next message; the crash's `crash` interruption came and went.
    const last = client.requests.at(-1)!;
    expect(sent(last)).toEqual([...before, { role: 'user', content: [{ kind: 'text', text: 'second' }] }]);
    expect(recorded(sid, root)).toEqual([...before, { role: 'user', content: [{ kind: 'text', text: 'second' }] }, assistant('Answered.')]);
    expect(dal.timelineOf(sid).map((t) => t.name)).toEqual(expect.arrayContaining(['iteration_paused', 'iteration_resumed']));
    // The resumed iteration is the open row itself: no second row is opened for it, so none is refused.
    expect(warnings.filter((w) => /was not recorded open/.test(w))).toEqual([]);
  });

  it('PD-ORCH-005 clause 6, declined: the open iteration closes cancelled, its task goes back to pending, and the next iteration takes the next number', async () => {
    const { sessions } = sessionsWith(() => answer('Answered.'));
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    restIn(sid, 1, ':main:1');

    expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(SessionWriter.storeFailure(dal)).toBeUndefined();
    const rows = dal.iterationsOf(sid);
    expect(rows.slice(0, 2).map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'cancelled'], [2, 'closed', 'succeeded']]);
    // The declined iteration's task was selected again (REQ-ORCH-135: it stays anchored), under a new root.
    expect(rows[1]!.todo_task_id).toBe(rows[0]!.todo_task_id);
    const ended = dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; outcome: string });
    expect(ended.filter((e) => e.iteration === 1).map((e) => e.outcome)).toEqual(['succeeded', 'cancelled']);
    expect(new Set(rows.map((r) => r.root_task_id)).size).toBe(rows.length);
    for (const r of rows) expect(takenTaskIds(dal, sid).has(r.root_task_id)).toBe(true);
  });

  it('a continued prompt\'s dead iteration is resumed too: the next prompt is its root\'s next message, never a second task under a reused id', async () => {
    const { sessions } = sessionsWith(() => answer('Answered.'));
    const sid = (sessions.start(dal, 'C:/ws', 'FIRST') as { value: SessionId }).value;
    await sessions.running(sid);
    expect(sessions.prompt(sid, 'SECOND').ok).toBe(true);
    await sessions.running(sid);
    const root2 = dal.iterationsOf(sid)[1]!.root_task_id;
    dieIn(sid, 2, ':continued:2');

    expect(sessions.prompt(sid, 'THIRD').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    const tasks = decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    expect(tasks.map((t) => [t.text, t.state])).toEqual([['FIRST', 'complete'], ['SECOND', 'complete']]);
    expect(dal.iterationsOf(sid).map((r) => [r.iteration, r.outcome, r.root_task_id === root2])).toEqual([[1, 'succeeded', false], [2, 'succeeded', true]]);
    expect(recorded(sid, root2).filter((m) => m.role === 'user').at(-1)).toEqual({ role: 'user', content: [{ kind: 'text', text: 'THIRD' }] });
  });

  it('a continued task id steps past every id the todo holds, even one no iteration row carries (a run that died before its first iteration opened)', async () => {
    const { sessions } = sessionsWith(() => answer('Answered.'));
    const sid = (sessions.start(dal, 'C:/ws', 'FIRST') as { value: SessionId }).value;
    await sessions.running(sid);
    // The residue: the continued prompt's task was appended and saved as `continued:2`, and the run died before iteration 2 opened.
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = { ...stored.planner!, phases: [...stored.planner!.phases, { name: 'Continued Prompts', tasks: [{ id: `${sid}:continued:2`, text: 'LOST', state: 'pending' as const, consecutiveRetries: 0 }] }] };
    dal.updateSessionRun(sid, { todo: encodeStoredTodo({ ...stored, planner }) });

    expect(sessions.prompt(sid, 'SECOND').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    const tasks = decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases.flatMap((p) => p.tasks);
    expect(tasks.map((t) => [t.id, t.text, t.state])).toEqual([[`${sid}:main:1`, 'FIRST', 'complete'], [`${sid}:continued:2`, 'LOST', 'complete'], [`${sid}:continued:3`, 'SECOND', 'complete']]);
  });

  it('REQ-GIT-051: an open iteration declined closes at that moment, so its one capture is attempted then — before this run\'s first; resumed, it is captured once, when it closes', async () => {
    const captures: { iteration: number; childName: string }[] = [];
    const { sessions } = sessionsWith(() => answer('Answered.'), undefined, () => ({ enabled: true, capture: async (input) => { captures.push({ iteration: input.iteration, childName: input.childName }); return { outcome: 'captured', detail: '' } as never; } }));
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid);
    restIn(sid, 1, ':main:1');
    captures.length = 0;
    expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
    await sessions.running(sid);
    // The declined one first (no child credited), then each iteration this run closed.
    expect(captures[0]).toEqual({ iteration: 1, childName: '' });
    expect(captures.map((c) => c.iteration)).toEqual([1, ...dal.iterationsOf(sid).slice(1).map((r) => r.iteration)]);

    restIn(sid, dal.iterationsOf(sid).length, ':main:1');
    captures.length = 0;
    expect(sessions.prompt(sid, 'again').ok).toBe(true);
    await sessions.running(sid);
    expect(captures.map((c) => c.iteration)).toEqual([dal.iterationsOf(sid).length]);
  });

  it('an open the store already holds is refused with a warning, never a store failure; the count never falls below a closed iteration', async () => {
    const { sessions } = sessionsWith(() => answer('Answered.'));
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid);
    // The count behind the rows with nothing left open — a crash between the close and the count's save.
    dal.updateSessionRun(sid, { iterations_completed: 0 });
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(SessionWriter.storeFailure(dal)).toBeUndefined();
    expect(dal.iterationsOf(sid).map((r) => r.iteration)).toEqual([1, 2]);

    const writer = new SessionWriter({ dal, sessionId: sid, wall: clock, retentionCap: 0, onCommitted: () => undefined, warn: () => undefined });
    expect(writer.openIteration({ iteration: 2, root_task_id: 'bg_twice', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't' })).toEqual({ ok: true, value: false });
    expect(SessionWriter.storeFailure(dal)).toBeUndefined();
  });

  it('PD-ORCH-005 clause 12: a manual compression that lands after its turn ended leaves the record equal to what the model was last sent', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    let manual: Promise<unknown> | null = null;
    const ref: { sessions?: Sessions; sid?: SessionId } = {};
    const { sessions, client } = sessionsWith((persona, n) => {
      if (persona === 'compressor') return { parts: [{ hold: gate }, ...answer('Work performed: probed. Findings: none. Open: none.').parts] };
      if (persona === 'summariser') return answer('{"summary":"probed","key_findings":[],"tags":[]}');
      if (persona === 'orchestrator') {
        if (n === 1) return toolCalls([{ callId: 'o1', name: 'probe', args: { what: 'a' } }], 'Probing.');
        if (n === 2) return toolCalls([{ callId: 'o2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: probe it' } }], 'Delegating.');
        if (n === 3) { manual = ref.sessions!.controlAsync({ op: 'forceCompression', sessionId: ref.sid!, args: {} }); return { parts: [{ hold: sleep(50) }, ...answer('Waiting.').parts] }; }
        release();
        return { parts: [{ hold: sleep(80) }, ...answer('All done.').parts] };
      }
      return n === 1 ? toolCalls([{ callId: 'c1', name: 'probe', args: { what: 'x' } }], 'Probing.') : answer('Probed x.');
    }, { triggerTokens: 1e9 });
    ref.sessions = sessions;
    const sid = (sessions.start(dal, 'C:/ws', 'probe the thing') as { value: SessionId }).value;
    ref.sid = sid;
    expect((await sessions.running(sid)!).status).toBe('completed');
    await manual;
    const root = dal.iterationsOf(sid)[0]!.root_task_id;
    const last = client.requests.filter((r) => personaOf(r) === 'orchestrator').at(-1)!;
    // Without the turn closing its conversation, the late pass wrote a replacement the model never saw.
    expect(recorded(sid, root)).toEqual([...sent(last), assistant('All done.')]);
  });

  it('PD-ORCH-005 clause 4: a resumed conversation too long for its model is compressed as any conversation is, before its first step', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const long = 'Every file of the project, probed in turn. '.repeat(80);
    const first = sessionsWith((_persona, turn) => {
      if (turn === 1) return toolCalls([{ callId: 'p1', name: 'probe', args: { what: long } }], 'Probing.', { input: 5, output: 5 });
      return { parts: [{ hold }, ...toolCalls([{ callId: 'p2', name: 'probe', args: { what: 'y' } }], 'Again.', { input: 5, output: 5 }).parts] };
    }, { triggerTokens: 600 });
    const sid = (first.sessions.start(dal, 'C:/ws', 'probe the thing') as { value: SessionId }).value;
    for (let i = 0; i < 400 && first.client.requests.length < 2; i += 1) await new Promise((r) => setTimeout(r, 2));
    expect(first.sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await first.sessions.running(sid);
    const root = dal.iterationsOf(sid)[0]!.root_task_id;
    // Under the provider's small reading nothing was compressed before the rest.
    expect(dal.agentMessagesOf(sid, root).filter((e) => e.kind === 'replacement')).toHaveLength(0);

    // A relaunch: a new process holds no reading of this agent's prompt, so the count is the conversation's estimate.
    const second = sessionsWith((persona) => (persona === 'compressor' ? answer('Work performed: probed once. Findings reached: none. Questions left open: the second probe.') : answer('done')), { triggerTokens: 600 });
    expect(second.sessions.resume(dal, 'C:/ws', sid).ok).toBe(true);
    expect(second.sessions.continueSession(sid, 'continue').ok).toBe(true);
    expect((await second.sessions.running(sid)!).status).toBe('completed');
    expect(dal.agentMessagesOf(sid, root).filter((e) => e.kind === 'replacement')).toHaveLength(1);
    const resumedStep = second.client.requests.find((r) => personaOf(r) === 'orchestrator')!;
    expect(JSON.stringify(sent(resumedStep))).not.toContain(long.slice(0, 200));
    expect(recorded(sid, root)).toEqual([...sent(resumedStep), assistant('done')]);
  });

  it('clause 12: a compression is written into the record, so the conversation a resume sends is the compressed one', async () => {
    // The first step reports 900 prompt tokens against a trigger of 600, so the second step compresses first.
    const { sessions, client } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') return answer('Work performed: probed twice. Findings reached: none. Questions left open: none.');
      if (turn === 1) return toolCalls([{ callId: 'c1', name: 'probe', args: { what: '1' } }], 'one', { input: 20, output: 10 });
      if (turn === 2) return toolCalls([{ callId: 'c2', name: 'probe', args: { what: '2' } }], 'two', { input: 900, output: 10 });
      return answer('done');
    }, { triggerTokens: 600 });
    const sid = (sessions.start(dal, 'C:/ws', 'probe twice') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const root = dal.iterationsOf(sid)[0]!.root_task_id;
    const entries = dal.agentMessagesOf(sid, root);
    expect(entries.filter((e) => e.kind === 'replacement')).toHaveLength(1);
    // The request that followed the compression went out over the compressed conversation; the record reads the same.
    const afterCompression = client.requests.filter((r) => personaOf(r) === 'orchestrator').at(-1)!;
    expect(recorded(sid, root)).toEqual([...sent(afterCompression), assistant('done')]);
    // …and the full history is still in the table: the messages before the replacement were not rewritten.
    const firstReplacement = entries.findIndex((e) => e.kind === 'replacement');
    expect(firstReplacement).toBeGreaterThan(2);
  });

  it('clause 12: clearing the transcript removes the records of closed iterations and keeps an open iteration\'s', async () => {
    const { sessions } = sessionsWith(() => answer('Answered.'));
    const sid = (sessions.start(dal, 'C:/ws', 'answer') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const closedRoot = dal.iterationsOf(sid)[0]!.root_task_id;
    const closedEntries = dal.agentMessagesOf(sid, closedRoot).length;
    expect(closedEntries).toBeGreaterThan(0);
    // An open iteration beside it, as a pause will leave one: its record must survive the clear.
    dal.insertIteration({ session_id: sid, iteration: 2, root_task_id: 'bg_0000open', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    dal.insertAgentMessage({ session_id: sid, task_id: 'bg_0000open', iteration: 2, kind: 'message', body: JSON.stringify({ role: 'user', content: [{ kind: 'text', text: 'open' }] }), at: 't' });
    expect(sessions.control({ op: 'clearTranscript', sessionId: sid, args: {} })).toEqual({ ok: true });
    expect(dal.agentMessagesOf(sid, closedRoot)).toEqual([]);
    expect(dal.agentMessagesOf(sid, 'bg_0000open')).toHaveLength(1);
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'transcript_cleared')!.metadata)).toMatchObject({ records_removed: closedEntries });
  });
});

/**
 * PD-ORCH-005 revision 4 clause 14: each agent's record keeps a fingerprint of the system instructions and the tool
 * definitions it started with; a resumed agent runs with its persona's current ones, and when they differ the run states,
 * as a warning, which agent resumed under changed instructions (OQ-78).
 */
describe('F — the fingerprint an agent started with (PD-ORCH-005 clause 14)', () => {
  const spec = (name: string, parameters: Record<string, unknown> = { type: 'object' }, description = name) => ({ name, description, parameters });

  it('fingerprintOf: the same instructions and tools give the same digests whatever order the listing or its keys were built in', () => {
    const a = fingerprintOf('You are x.', [spec('read', { type: 'object', properties: { path: { type: 'string' } } }), spec('write')]);
    const b = fingerprintOf('You are x.', [spec('write'), { parameters: { properties: { path: { type: 'string' } }, type: 'object' }, description: 'read', name: 'read' }]);
    expect(b).toEqual(a);
    expect(a.instructions).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tools).toMatch(/^[0-9a-f]{64}$/);
    // A changed prompt changes the instructions only; a changed description, schema or name changes the tools only.
    const prompt = fingerprintOf('You are y.', [spec('read', { type: 'object', properties: { path: { type: 'string' } } }), spec('write')]);
    expect([prompt.instructions === a.instructions, prompt.tools === a.tools]).toEqual([false, true]);
    for (const tools of [
      [spec('read', { type: 'object', properties: { path: { type: 'string' } } }, 'reads'), spec('write')],
      [spec('read', { type: 'object', properties: { path: { type: 'number' } } }), spec('write')],
      [spec('read', { type: 'object', properties: { path: { type: 'string' } } })],
    ]) {
      const changed = fingerprintOf('You are x.', tools);
      expect([changed.instructions === a.instructions, changed.tools === a.tools]).toEqual([true, false]);
    }
  });

  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-fingerprint-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const systemOf = (req: ModelRequest): string => req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '';
  const personaOf = (req: ModelRequest): string => /^You are the orchestrator/.test(systemOf(req)) ? 'orchestrator' : /summarise/i.test(systemOf(req)) ? 'summariser' : 'child';
  const ok = (text: string): PortToolResult => ({ text, isError: false, status: 'ok', durationMs: 1, label: 'x', args: {} });
  const ROOT = RUN_CONFIG_DEFAULTS.systemPrompt;
  const CHILD = BUILT_IN_PERSONAS['coding-agent' as RoleName]!;

  /** A root and its children over `delegate` and `probe`; `extraTool` widens every agent's listing. */
  function harness(script: (persona: string, turn: number) => ScriptedCall, over: { rootPrompt?: string; childPrompt?: string; extraTool?: boolean } = {}) {
    const counts = new Map<string, number>();
    const client = new ScriptedModelClient([]);
    const original = client.stream.bind(client);
    client.stream = (req) => {
      const persona = personaOf(req);
      const n = (counts.get(persona) ?? 0) + 1;
      counts.set(persona, n);
      client.push(script(persona, n));
      return original(req);
    };
    const names = ['delegate', 'probe', ...(over.extraTool ? ['extra'] : [])];
    const port = (ops: DelegationOps | undefined, parentId: string): ToolPort => ({
      specs: () => names.map((n) => ({ name: n, description: n, parameters: { type: 'object' } })),
      dispatch: async (c) => {
        const a = JSON.parse(c.rawArgs) as Record<string, unknown>;
        if (c.name === 'delegate' && ops) {
          const r = await ops.delegate(parentId, { persona: 'coding-agent', taskName: String(a['task_name']), task: 'TASK: probe it', dependsOn: [], inheritedContext: [], category: '', runInBackground: true });
          return r.status === 'rejected' ? { ...ok(r.message), isError: true, status: 'failed' } : ok(`task_id: ${r.taskId}`);
        }
        return ok(`probed`);
      },
      // REQ-MCP-101: the MCP section the port renders is appended to the instructions, and is fingerprinted with them.
      promptSection: () => 'MCP servers: none connected.',
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    });
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k', systemPrompt: over.rootPrompt ?? ROOT };
    const backend = new DefaultAgentBackend(client);
    const models = (key: string): ModelLookup => ({ ok: false, reason: `'${key}' is not a configured model` });
    const personas = { resolve: (name: string) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: name === 'coding-agent' && over.childPrompt ? { ...base, systemPrompt: over.childPrompt } : base, alias: null } : null; }, knownRoles: () => Object.keys(BUILT_IN_PERSONAS) };
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 79, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => `S-fp-${++minted}`,
      model: null, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), attended: () => true, onRunResult: () => undefined,
      tools: (ctx) => port(ctx.delegation, ctx.parentId ?? 'root'),
      configure: () => ({ ok: true, value: {
        model: { backend, config }, models, personas,
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0 },
        resilience: { catalogue: [], fallbackModel: null },
      } }),
    });
    return { sessions, client };
  }
  const warnings = (sid: SessionId) => dal.issuesOf(sid).filter((i) => i.kind === 'resumed_under_changed_instructions');
  const systemRows = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'system' && /resumed under changed instructions/.test(r.body)).map((r) => r.body);
  /** The residue a run host that died mid-iteration leaves (as record.test's `dieIn`): its row open, the count behind it. */
  function dieIn(sid: SessionId): void {
    dal.db.prepare("UPDATE iterations SET state = 'open', outcome = NULL, closed_at = NULL WHERE session_id = ? AND iteration = 1").run(sid);
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    for (const phase of planner.phases) for (const task of phase.tasks) if (task.id.endsWith(':main:1')) task.state = 'in_progress';
    dal.updateSessionRun(sid, { iterations_completed: 0, todo: encodeStoredTodo({ ...stored, planner }) });
  }

  it('each agent records the fingerprint of what its first request carried, once; a resume under the same instructions states nothing', async () => {
    const first = harness((persona, turn) => (persona === 'orchestrator' ? (turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { task_name: 'work' } }], 'Delegating.') : answer('All done.')) : persona === 'summariser' ? answer('{"summary":"probed"}') : answer('Probed.')));
    const sid = (first.sessions.start(dal, 'C:/ws', 'probe the thing') as { value: SessionId }).value;
    expect((await first.sessions.running(sid)!).status).toBe('completed');
    const root = dal.iterationsOf(sid)[0]!.root_task_id;
    const child = dal.childrenOf(sid)[0]!.task_id;
    const request = (persona: string) => first.client.requests.find((r) => personaOf(r) === persona)!;
    for (const [taskId, persona] of [[root, 'orchestrator'], [child, 'child']] as const) {
      const req = request(persona);
      expect(systemOf(req)).toContain('MCP servers: none connected.');
      expect(dal.agentFingerprintOf(sid, taskId)).toMatchObject({ iteration: 1, ...fingerprintOf(systemOf(req), req.tools ?? []) });
    }
    // The root's later requests (after its child reported) record nothing more: one row per agent.
    expect((dal.db.prepare('SELECT count(*) AS c FROM agent_fingerprints WHERE session_id = ?').get(sid) as { c: number }).c).toBe(2);

    dieIn(sid);
    const again = harness(() => answer('Answered again.'));
    expect(again.sessions.resume(dal, 'C:/ws', sid).ok).toBe(true);
    expect(again.sessions.prompt(sid, 'go on').ok).toBe(true);
    expect((await again.sessions.running(sid)!).status).toBe('completed');
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, root_task_id: root, state: 'closed' }]);
    expect(warnings(sid)).toEqual([]);
    expect(systemRows(sid)).toEqual([]);
  });

  it('a root resumed after its instructions changed is named in a warning issue, its timeline entry and a transcript line; the fingerprint it started with is kept', async () => {
    const first = harness(() => answer('Answered.'));
    const sid = (first.sessions.start(dal, 'C:/ws', 'answer') as { value: SessionId }).value;
    expect((await first.sessions.running(sid)!).status).toBe('completed');
    const root = dal.iterationsOf(sid)[0]!;
    const started = dal.agentFingerprintOf(sid, root.root_task_id)!;
    dieIn(sid);

    const changed = harness(() => answer('Answered under new instructions.'), { rootPrompt: `${ROOT} Always answer in French.` });
    expect(changed.sessions.resume(dal, 'C:/ws', sid).ok).toBe(true);
    expect(changed.sessions.prompt(sid, 'go on').ok).toBe(true);
    expect((await changed.sessions.running(sid)!).status).toBe('completed');
    // It ran with its persona's current instructions…
    expect(systemOf(changed.client.requests.at(-1)!)).toContain('Always answer in French.');
    // …and the run said so, naming the agent: once, as a warning.
    const message = `Agent ${root.root_canonical_name} (${root.root_task_id}) resumed under changed instructions: its system instructions differ from the ones it started with.`;
    expect(warnings(sid)).toMatchObject([{ severity: 'warning', actor: root.root_canonical_name, message }]);
    expect(JSON.parse(warnings(sid)[0]!.metadata)).toEqual({ task_id: root.root_task_id, iteration: 1, instructions_changed: true, tools_changed: false });
    expect(dal.timelineOf(sid).filter((t) => t.name === 'issue' && t.message === message)).toHaveLength(1);
    expect(systemRows(sid)).toEqual([message]);
    // The fingerprint is of what it STARTED with: a resume never replaces it.
    expect(dal.agentFingerprintOf(sid, root.root_task_id)).toEqual(started);
  });

  it('a child resumed after its persona\'s tools and instructions changed is named; the unchanged root is not', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const first = harness((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { task_name: 'work' } }], 'Delegating.') : answer('Waiting.');
      if (persona === 'summariser') return answer('{"summary":"probed"}');
      return turn === 1 ? { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'probe', args: {} }], 'Probing.').parts] } : answer('Probed.');
    });
    const sid = (first.sessions.start(dal, 'C:/ws', 'probe the thing') as { value: SessionId }).value;
    for (let i = 0; i < 400 && !first.client.requests.some((r) => personaOf(r) === 'child'); i += 1) await new Promise((r) => setTimeout(r, 2));
    expect(first.sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await first.sessions.running(sid);
    const child = dal.childrenOf(sid)[0]!;
    expect(child.state).toBe('paused');
    expect(dal.agentFingerprintOf(sid, child.task_id)).toBeDefined();

    const changed = harness((persona) => (persona === 'summariser' ? answer('{"summary":"probed"}') : answer('Done.')), { childPrompt: `${CHILD.systemPrompt}\nNever touch tests.`, extraTool: true });
    expect(changed.sessions.resume(dal, 'C:/ws', sid).ok).toBe(true);
    expect(changed.sessions.continueSession(sid, 'continue').ok).toBe(true);
    expect((await changed.sessions.running(sid)!).status).toBe('completed');
    // The root's tools changed too (`extra` joined every listing), so it is named for its tools alone.
    const root = dal.iterationsOf(sid)[0]!;
    expect(warnings(sid).map((w) => [w.actor, JSON.parse(w.metadata) as unknown])).toEqual(expect.arrayContaining([
      [child.canonical_name, { task_id: child.task_id, iteration: 1, instructions_changed: true, tools_changed: true }],
      [root.root_canonical_name, { task_id: root.root_task_id, iteration: 1, instructions_changed: false, tools_changed: true }],
    ]));
    expect(systemRows(sid)).toContain(`Agent ${child.canonical_name} (${child.task_id}) resumed under changed instructions: its system instructions and tool definitions differ from the ones it started with.`);
    expect(warnings(sid)).toHaveLength(2);
  });

  it('the check acts once per execution: a second call within it compares nothing, and a record with no store checks nothing', () => {
    const sid = asSessionId('S-fp-unit');
    dal.upsertSession({ session_id: sid, execution_status: 'running', workspace_root: 'C:/ws', created_at: 't', updated_at: 't' });
    const w = SessionWriter.open({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { pid: 5, host: HOST, isProcessAlive: () => false });
    if (!w.ok) throw new Error('writer');
    const record = new ConversationRecord(w.value, dal, sid);
    record.fingerprint('bg_0000aa01', 'work', 1)('You are a.', []);
    expect(dal.agentFingerprintOf(sid, 'bg_0000aa01')).toMatchObject({ iteration: 1, ...fingerprintOf('You are a.', []) });
    // A later execution under changed instructions warns once, however many steps it takes — even when they change again.
    const resumed = record.fingerprint('bg_0000aa01', 'work', 1);
    resumed('You are b.', []);
    resumed('You are c.', [spec('x')]);
    expect(warnings(sid)).toHaveLength(1);
    // One under the instructions it started with states nothing.
    record.fingerprint('bg_0000aa01', 'work', 1)('You are a.', []);
    expect(warnings(sid)).toHaveLength(1);
    new ConversationRecord(w.value, undefined, sid).fingerprint('bg_0000aa02', 'other', 1)('You are a.', []);
    expect(dal.agentFingerprintOf(sid, 'bg_0000aa02')).toBeUndefined();
  });

  it('clause 12: clearing the transcript removes the fingerprints of closed iterations and keeps an open iteration\'s', async () => {
    const { sessions } = harness(() => answer('Answered.'));
    const sid = (sessions.start(dal, 'C:/ws', 'answer') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const closedRoot = dal.iterationsOf(sid)[0]!.root_task_id;
    expect(dal.agentFingerprintOf(sid, closedRoot)).toBeDefined();
    dal.insertIteration({ session_id: sid, iteration: 2, root_task_id: 'bg_0000open', root_canonical_name: 'orchestrator', root_persona: 'orchestrator', todo_task_id: 't', task: 't', opened_at: 't' });
    dal.insertAgentFingerprint({ session_id: sid, task_id: 'bg_0000open', iteration: 2, instructions: 'i', tools: 't', at: 't' });
    expect(sessions.control({ op: 'clearTranscript', sessionId: sid, args: {} })).toEqual({ ok: true });
    expect(dal.agentFingerprintOf(sid, closedRoot)).toBeUndefined();
    expect(dal.agentFingerprintOf(sid, 'bg_0000open')).toBeDefined();
    expect(JSON.parse(dal.timelineOf(sid).find((t) => t.name === 'transcript_cleared')!.metadata)).toMatchObject({ fingerprints_removed: 1 });
  });
});
