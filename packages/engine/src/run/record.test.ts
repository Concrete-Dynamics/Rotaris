import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling, type AgentMessageRow } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ChatMessage, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { BUILT_IN_PERSONAS, RUN_CONFIG_DEFAULTS, Sessions, type DelegationOps, type ModelLookup, type PortToolResult, type Publisher, type RoleName, type RunConfig, type ToolPort } from '../index.js';
import { conversationOf } from './record.js';
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

  function sessionsWith(script: (persona: string, turn: number) => ScriptedCall, compression?: { triggerTokens: number }) {
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
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' };
    const backend = new DefaultAgentBackend(client);
    const models = (key: string): ModelLookup => ({ ok: false, reason: `'${key}' is not a configured model` });
    const personas = { resolve: (name: string) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: base, alias: null } : null; }, knownRoles: () => Object.keys(BUILT_IN_PERSONAS) };
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 79, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => `S-rec-${++minted}`,
      model: null, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), attended: () => true, onRunResult: () => undefined,
      tools: (ctx) => port(ctx.delegation, ctx.parentId ?? 'root'),
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
    return { sessions, client };
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

  it('the repair of a-crashed-iteration-number-is-reused-by-the-next-run: an iteration a dead run left open closes cancelled, its task goes back to pending, and the next iteration takes the next number', async () => {
    const { sessions } = sessionsWith(() => answer('Answered.'));
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    // The residue a run host that died mid-iteration 1 leaves: the row open, the count not yet moved, the task in progress.
    dal.db.prepare("UPDATE iterations SET state = 'open', outcome = NULL, closed_at = NULL WHERE session_id = ? AND iteration = 1").run(sid);
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    planner.phases[0]!.tasks[0]!.state = 'in_progress';
    dal.updateSessionRun(sid, { iterations_completed: 0, todo: encodeStoredTodo({ ...stored, planner }) });

    const continued = sessions.prompt(sid, 'second');
    expect(continued.ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    // No store failure — before the repair the reused number failed the insert and the whole workspace store with it.
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
    const rows = dal.iterationsOf(sid);
    expect(rows.map((r) => [r.iteration, r.state, r.outcome])).toEqual([[1, 'closed', 'cancelled'], [2, 'closed', 'succeeded'], [3, 'closed', 'succeeded']]);
    // The dead iteration's task was selected again (REQ-ORCH-135: it stays anchored), then the continued prompt's.
    expect(rows[1]!.todo_task_id).toBe(rows[0]!.todo_task_id);
    const ended = dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { iteration: number; outcome: string });
    expect(ended.filter((e) => e.iteration === 1).map((e) => e.outcome)).toEqual(['succeeded', 'cancelled']);
    // Each root has its own id, and every recorded root's id is taken when the next one is minted.
    expect(new Set(rows.map((r) => r.root_task_id)).size).toBe(3);
    for (const r of rows) expect(takenTaskIds(dal, sid).has(r.root_task_id)).toBe(true);
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
