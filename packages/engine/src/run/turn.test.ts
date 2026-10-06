import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { AiSdkModelClient, answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type FetchLike, type ModelClient, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type ModeChange, type PortToolCall, type PortToolResult, type Publisher, type RunConfig, type SessionsDeps, type ToolPort } from '../index.js';
import { conversationOf } from './record.js';
import { interruptedResult } from './interruption.js';
import { decodeStoredTodo } from '../todo-view.js';
import type { LiveTerminal } from './run.js';
import type { HookPort } from '../hooks-port.js';

const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };

/** A tool port that records calls and answers by name; `hold` parks a dispatch until released. */
function fakePort(opts: { hold?: Promise<void>; holdOn?: string; pinnedPersona?: string } = {}) {
  const calls: PortToolCall[] = [];
  const pending = { cancelled: 0, withdrawn: [] as string[], answered: [] as string[] };
  let mode: 'restricted' | 'ask' | 'autonomous' = 'ask';
  const port: ToolPort = {
    specs: () => [{ name: 'glob', description: 'find files', parameters: { type: 'object' } }, { name: 'write_file', description: 'write', parameters: { type: 'object' } }],
    dispatch: async (c, signal): Promise<PortToolResult> => {
      calls.push(c);
      if (opts.hold && c.name === (opts.holdOn ?? c.name)) await Promise.race([opts.hold, new Promise<void>((r) => signal.addEventListener('abort', () => r(), { once: true }))]);
      if (signal.aborted) return { text: 'cancelled', isError: true, status: 'failed', durationMs: 1, label: c.name, args: {} };
      if (c.name === 'write_file') return { text: 'wrote a.txt', isError: false, status: 'ok', durationMs: 2, label: 'write_file a.txt', args: JSON.parse(c.rawArgs) as Record<string, unknown>, diff: 'a.txt [Created] +1 -0\n[1]+ hello' };
      if (c.name === 'terminal') return { text: "Permission denied by rule 'starter:deny-recursive-delete'. …", isError: true, status: 'blocked', durationMs: 0, label: 'terminal: $ rm -rf x', args: {}, blockedReason: 'recursive delete' };
      return { text: 'a.ts\nb.ts', isError: false, status: 'ok', durationMs: 3, label: 'glob **/*.ts', args: {} };
    },
    cancelPending: () => { pending.cancelled += 1; return 0; },
    withdrawPending: (cause) => { pending.withdrawn.push(cause); return 0; },
    setMode: (m, _source): ModeChange => {
      const previous = mode;
      // REQ-TOOLS-074: a pinned agent refuses a loosening change and names its persona; the run collects the names.
      if (opts.pinnedPersona !== undefined) return { requested: m as typeof mode, effective: previous, downgraded: false, reason: '', previous, skippedPersona: opts.pinnedPersona };
      mode = m as typeof mode;
      return { requested: mode, effective: mode, downgraded: false, reason: '', previous };
    },
    currentMode: () => mode,
    answerApproval: (id) => { pending.answered.push(id); return id === 'known'; },
  };
  return { port, calls, pending };
}

describe('engine/run — the tool loop inside an iteration (REQ-TOOLS-180, REQ-ORCH-141, REQ-CHAT-046/050/060, REQ-MONITOR-012/150..153)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-turn-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const config = (over: Partial<RunConfig> = {}): RunConfig => ({ ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k', ...over });

  function sessionsWith(calls: ScriptedCall[], port: ToolPort | null, extra: { attended?: boolean; runtime?: { permissionMode: string; pauseToolDeadlineMs?: number }; terminals?: SessionsDeps['terminals']; hooks?: HookPort; wrap?: (c: ModelClient) => ModelClient } = {}) {
    const client = new ScriptedModelClient(calls);
    let n = 0;
    const logLines: string[] = [];
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `S${++n}`,
      model: { backend: new DefaultAgentBackend(extra.wrap ? extra.wrap(client) : client), config: config() }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      ...(port ? { tools: () => port } : {}), attended: () => extra.attended ?? true,
      runtime: { permissionMode: extra.runtime?.permissionMode ?? 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', ...(extra.runtime?.pauseToolDeadlineMs === undefined ? {} : { pauseToolDeadlineMs: extra.runtime.pauseToolDeadlineMs }) },
      sessionLogAppender: () => (line) => { logLines.push(line); },
      ...(extra.terminals ? { terminals: extra.terminals } : {}),
      ...(extra.hooks ? { hooks: () => extra.hooks! } : {}),
    });
    return { sessions, client, logLines };
  }
  const events = (sid: SessionId) => dal.eventsFrom(sid, 1, 10_000).map((e) => e.kind);
  const rows = (sid: SessionId) => dal.residentRows(sid).map((r) => ({ kind: r.kind, body: r.body, status: r.tool_status }));

  it('the model calls two tools then answers: tool rows running → ok, a diff row beneath the write, results fed back, one iteration', async () => {
    const { port, calls } = fakePort();
    const { sessions, client } = sessionsWith([
      toolCalls([{ callId: 'c1', name: 'glob', args: { pattern: '**/*.ts' } }], 'Let me look.'),
      toolCalls([{ callId: 'c2', name: 'write_file', args: { operation: 'create', path: 'a.txt' } }]),
      answer('Done: a.txt written.'),
    ], port);
    const sid = (sessions.start(dal, 'C:/ws', 'write a file') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(calls.map((c) => c.name)).toEqual(['glob', 'write_file']);
    expect(rows(sid)).toEqual([
      { kind: 'user', body: 'write a file', status: null },
      { kind: 'agent', body: 'Let me look.', status: null },
      { kind: 'tool', body: 'glob **/*.ts', status: 'ok' },
      { kind: 'tool', body: 'write_file a.txt', status: 'ok' },
      { kind: 'diff', body: 'a.txt [Created] +1 -0\n[1]+ hello', status: null },
      { kind: 'agent', body: 'Done: a.txt written.', status: null },
      { kind: 'system', body: 'The run completed.', status: null },
    ]);
    const toolRow = dal.residentRows(sid)[2]!;
    expect(toolRow).toMatchObject({ tool_name: 'glob', call_key: 'c1', duration_ms: 3, output: 'a.ts\nb.ts' });
    expect(toolRow.input).toBe('{"pattern":"**/*.ts"}');
    // the third model call saw the tool results in its messages
    const third = client.requests[2]!;
    expect(third.messages.filter((m) => m.role === 'tool')).toHaveLength(2);
    expect(third.tools?.map((t) => t.name)).toEqual(['glob', 'write_file']);
    expect(dal.getSession(sid)).toMatchObject({ iterations_completed: 1, tool_calls: 2, permission_mode: 'ask', sandboxed: 0 });
    expect(events(sid).filter((k) => k === 'iteration.start')).toHaveLength(1);
    const start = JSON.parse(dal.eventsOfKind(sid, 'session.start')[0]!.payload) as { permission_mode: string; sandbox: { enabled: boolean; backend: string } };
    expect(start).toMatchObject({ permission_mode: 'ask', sandbox: { enabled: false, backend: '' } });
  });

  it('a blocked call: the row reads blocked with its reason, the refusal text goes back to the model, and the run continues', async () => {
    const { port } = fakePort();
    const { sessions, client } = sessionsWith([toolCalls([{ callId: 'c1', name: 'terminal', args: { command: 'rm -rf x' } }]), answer('I will not do that.')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'clean') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(dal.residentRows(sid)[1]).toMatchObject({ kind: 'tool', tool_status: 'blocked', blocked_reason: 'recursive delete' });
    const second = client.requests[1]!;
    const toolMsg = second.messages.find((m) => m.role === 'tool')!;
    expect(toolMsg.content[0]).toMatchObject({ kind: 'tool-result', callId: 'c1', isError: true });
    expect((toolMsg.content[0] as { result: string }).result).toMatch(/^Permission denied by rule/);
  });

  it('REQ-TOOLS-032: a call whose arguments are a JSON string (encoded twice) is refused recoverably, its replay carries a mapping, and the run continues', async () => {
    /*
     * The 2026-10-01 live run (docs/defects/fixed/a-tool-call-whose-arguments-are-a-json-string-ends-the-run-with-http-400.md):
     * the model's `arguments` text was a JSON string literal holding the object. The client stands where the run host
     * puts it, the AI SDK adapter, against an endpoint that refuses a request whose replayed arguments are not a mapping
     * (HTTP 400, as that endpoint's chat template did). The port answers as the gate does for an unreadable payload.
     */
    const doubly = JSON.stringify(JSON.stringify({ pattern: '**/*.ts' }));
    const refusal = "The arguments for 'glob' could not be read as JSON even after repair. Re-issue the call with a well-formed object.";
    const chunk = (delta: Record<string, unknown>, finish: string | null) => JSON.stringify({ id: 'r', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [{ index: 0, delta, finish_reason: finish }] });
    const sse = (lines: string[]) => new Response(lines.map((l) => `data: ${l}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    const bodies: { messages: { role: string; content?: unknown; tool_calls?: { function: { arguments: string } }[] }[] }[] = [];
    const endpoint: FetchLike = async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as (typeof bodies)[number];
      bodies.push(body);
      const replayed = body.messages.flatMap((m) => m.tool_calls ?? []).map((c) => JSON.parse(c.function.arguments) as unknown);
      if (replayed.some((a) => typeof a !== 'object' || a === null || Array.isArray(a))) {
        return new Response(JSON.stringify({ error: { message: 'Can only get item pairs from a mapping.', type: 'BadRequestError', code: 400 } }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      if (bodies.length === 1) {
        return sse([chunk({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'glob', arguments: doubly } }] }, null), chunk({}, 'tool_calls'), '[DONE]']);
      }
      return sse([chunk({ content: 'I will re-issue it as an object.' }, null), chunk({}, 'stop'), '[DONE]']);
    };
    const { port } = fakePort();
    const seenRaw: string[] = [];
    const gateLike: ToolPort = { ...port, dispatch: async (c) => { seenRaw.push(c.rawArgs); return { text: refusal, isError: true, status: 'failed', durationMs: 0, label: 'glob()', args: {} }; } };
    const wrap = (): ModelClient => new AiSdkModelClient({ baseUrl: 'https://endpoint.example/v1', fetch: endpoint, timers: clock, monotonic: clock });
    const { sessions } = sessionsWith([], gateLike, { wrap });
    const sid = (sessions.start(dal, 'C:/ws', 'find the ts files') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    // the gate was handed the model's own text, unchanged
    expect(seenRaw).toEqual([doubly]);
    // the second request reached the model: the refusal travelled as the call's result, beside a replay that is a mapping
    expect(bodies).toHaveLength(2);
    const second = bodies[1]!.messages;
    expect(JSON.parse(second.find((m) => m.role === 'assistant')!.tool_calls![0]!.function.arguments)).toEqual({ _raw: doubly });
    expect(JSON.stringify(second.find((m) => m.role === 'tool')!.content)).toContain('could not be read as JSON even after repair');
    expect(dal.residentRows(sid).at(-2)).toMatchObject({ kind: 'agent', body: 'I will re-issue it as an object.' });
  });

  it('REQ-ORCH-141: a replayed call id is not dispatched again', async () => {
    const { port, calls } = fakePort();
    const { sessions } = sessionsWith([toolCalls([{ callId: 'same', name: 'glob', args: {} }]), toolCalls([{ callId: 'same', name: 'glob', args: {} }]), answer('ok')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(calls).toHaveLength(1);
  });

  it('REQ-MONITOR-012 / PD-ORCH-005 clauses 3 and 9: a stop WITHDRAWS the pending approvals first (never cancels them), aborts the tool in flight — recorded as interrupted — and the run ends interrupted', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { port, pending } = fakePort({ hold, holdOn: 'write_file' });
    const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'write_file', args: { path: 'a' } }]), answer('never')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    expect(dal.residentRows(sid).at(-1)).toMatchObject({ kind: 'tool', tool_status: 'running' });
    expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
    expect(pending.withdrawn).toEqual(['stop']);
    expect(pending.cancelled).toBe(0);
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    expect(dal.residentRows(sid).find((r) => r.kind === 'tool')).toMatchObject({ tool_status: 'failed' });
    // The call's result in the root's record says it was interrupted by the stop and not re-run (clause 3).
    const root = dal.iterationsOf(sid)[0]!.root_task_id;
    const results = conversationOf(dal.agentConversation(sid, root)).flatMap((m) => m.content.flatMap((p) => (p.kind === 'tool-result' ? [p] : [])));
    expect(results).toEqual([{ kind: 'tool-result', callId: 'c1', name: 'write_file', isError: true, result: expect.stringMatching(/^This call was interrupted by the stop before it completed, and it was not re-run\./) }]);
    release();
  });

  it('REQ-MONITOR-012: the explicit cancel (REQ-MONITOR-126) still releases the pending approvals as cancelled', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { port, pending } = fakePort({ hold, holdOn: 'write_file' });
    const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'write_file', args: { path: 'a' } }]), answer('never')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } })).toEqual({ ok: true });
    expect(pending.cancelled).toBe(1);
    expect(pending.withdrawn).toEqual([]);
    expect((await sessions.running(sid)!).status).toBe('interrupted');
    expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'closed', outcome: 'cancelled', interruption: null }]);
    release();
  });

  /**
   * OQ-165, ruled 2026-10-06 (R-071): the engine saves `cancelling` when it accepts the explicit cancel, as the stop does, so
   * every window reads it from the session record, not only the one that sent it through its local overlay. Before, the
   * record kept reading `running` through the graceful stop until the teardown wrote the run's end. The status holds until
   * then: a save on the way to the end (here a permission-mode change's) does not read `running` again.
   */
  it('OQ-165: the explicit cancel saves `cancelling` when it is accepted, and holds it until the run ends (REQ-MONITOR-127, REQ-MONITOR-130)', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { port } = fakePort({ hold, holdOn: 'write_file' });
    const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'write_file', args: { path: 'a' } }]), answer('never')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 400 && !dal.residentRows(sid).some((r) => r.kind === 'tool'); i += 1) await new Promise((r) => setTimeout(r, 2));
    expect(dal.getSession(sid)!.execution_status).toBe('running');
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } })).toEqual({ ok: true });
    expect(dal.getSession(sid)!.execution_status).toBe('cancelling');
    expect(sessions.control({ op: 'setPermissionMode', sessionId: sid, args: { mode: 'autonomous' } })).toEqual({ ok: true });
    expect(dal.getSession(sid)!.execution_status).toBe('cancelling');
    release();
    await sessions.running(sid)!;
    // The teardown's write replaces it: the run rests on the user's interrupt, `user_cancelled` (REQ-ORCH-136), read paused (REQ-ORCH-082).
    expect(dal.getSession(sid)).toMatchObject({ execution_status: 'paused', stop_reason: 'user_cancelled' });
  });

  /**
   * `docs/defects/fixed/a-stops-saved-cancelling-reads-running-again-at-the-runs-next-save.md` (fin21, OQ-165's build): the stop
   * saved `cancelling` when it was accepted, but the run's next save on the way to rest wrote `running` again, so every window
   * read `running` for the rest of the graceful stop. The stop's `cancelling` is held as the explicit cancel's is.
   */
  it('REQ-SESSION-186 with OQ-165: the stop\'s saved `cancelling` holds through the run\'s later saves until it rests (REQ-MONITOR-130)', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { port } = fakePort({ hold, holdOn: 'write_file' });
    const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'write_file', args: { path: 'a' } }]), answer('never')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 400 && !dal.residentRows(sid).some((r) => r.kind === 'tool'); i += 1) await new Promise((r) => setTimeout(r, 2));
    expect(dal.getSession(sid)!.execution_status).toBe('running');
    expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
    expect(dal.getSession(sid)!.execution_status).toBe('cancelling');
    expect(sessions.control({ op: 'setPermissionMode', sessionId: sid, args: { mode: 'autonomous' } })).toEqual({ ok: true });
    expect(dal.getSession(sid)!.execution_status).toBe('cancelling');
    release();
    expect((await sessions.running(sid)!).status).toBe('interrupted');
    // The teardown's write replaces it: a stop rests `paused` (PD-ORCH-005 clause 3).
    expect(dal.getSession(sid)!.execution_status).toBe('paused');
  });

  /**
   * `docs/defects/fixed/a-stop-accepted-during-teardown-writes-cancelling-over-the-runs-terminal-status.md` (finacc3 F05): a
   * stop accepted after the teardown wrote the run's end, while it forwarded the terminal pair or ran the hooks advisory, was
   * answered `ok` and saved `cancelling` over the terminal status, which nothing wrote again. It is refused, as the explicit
   * cancel is, and no later save of the run writes a non-terminal status over its end.
   */
  it('REQ-SESSION-186 with OQ-165: a stop accepted after the teardown wrote the run\'s end is refused and leaves the terminal status (REQ-MONITOR-130)', async () => {
    let sessionsRef!: Sessions;
    let sid!: SessionId;
    const seen: unknown[] = [];
    const hooks: HookPort = {
      auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
      fireLifecycle: async () => [], toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      // The hooks advisory runs after the terminal transaction and the terminal pair's forwarding, before the run has ended.
      advisory: () => {
        seen.push(dal.getSession(sid)!.execution_status);
        seen.push(sessionsRef.control({ op: 'cancel', sessionId: sid, args: {} }));
        seen.push(dal.getSession(sid)!.execution_status);
        return '';
      },
    };
    const { port } = fakePort();
    const { sessions } = sessionsWith([answer('done')], port, { hooks });
    sessionsRef = sessions;
    sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(seen).toEqual(['completed', { ok: false }, 'completed']);
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
  });

  it('REQ-SESSION-094 with REQ-MONITOR-123/150 (finacc3 F05): no control accepted after the teardown wrote the run\'s end saves an active status over it', async () => {
    let sessionsRef!: Sessions;
    let sid!: SessionId;
    const seen: unknown[] = [];
    const hooks: HookPort = {
      auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
      fireLifecycle: async () => [], toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      advisory: () => {
        seen.push(sessionsRef.control({ op: 'pause', sessionId: sid, args: {} }));
        seen.push(sessionsRef.control({ op: 'setPermissionMode', sessionId: sid, args: { mode: 'autonomous' } }));
        seen.push(sessionsRef.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', id: 'x', text: 'late' } }).ok);
        seen.push(dal.getSession(sid)!.execution_status);
        return '';
      },
    };
    const { port } = fakePort();
    const { sessions } = sessionsWith([answer('done')], port, { hooks });
    sessionsRef = sessions;
    sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(seen).toEqual([{ ok: false }, { ok: false }, false, 'completed']);
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
  });

  it('OQ-165: cancelling one child saves no `cancelling` for the run', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { port } = fakePort({ hold, holdOn: 'write_file' });
    const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'write_file', args: { path: 'a' } }]), answer('never')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 400 && !dal.residentRows(sid).some((r) => r.kind === 'tool'); i += 1) await new Promise((r) => setTimeout(r, 2));
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'no-such-child' } })).toEqual({ ok: false });
    expect(dal.getSession(sid)!.execution_status).toBe('running');
    sessions.control({ op: 'cancel', sessionId: sid, args: { force: true } });
    release();
    await sessions.running(sid)!;
  });

  it('REQ-MONITOR-150..153 / REQ-TOOLS-082: setPermissionMode applies to the next call, writes the audit entry and the system row; empty mode refused', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { port } = fakePort({ hold, holdOn: 'glob' });
    const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('ok')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    expect(sessions.control({ op: 'setPermissionMode', sessionId: sid, args: { mode: '' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'setPermissionMode', sessionId: sid, args: { mode: 'autonomous' } })).toEqual({ ok: true });
    expect(port.currentMode()).toBe('autonomous');
    const audit = dal.auditOf(sid);
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]!.entry)).toMatchObject({ event: 'permission_mode_change', requested_mode: 'autonomous', previous_mode: 'ask', skipped_personas: [] });
    expect(dal.residentRows(sid).find((r) => r.kind === 'system')?.body).toBe("Permission mode is now 'autonomous'; it applies from the next tool call.");
    expect(dal.timelineOf(sid).map((t) => t.name)).toContain('permission_mode_changed');
    expect(dal.getSession(sid)!.permission_mode).toBe('autonomous');
    release();
    await sessions.running(sid)!;
    // REQ-TOOLS-075: the override is discarded at run end — a later control is refused because no run is live.
    expect(sessions.control({ op: 'setPermissionMode', sessionId: sid, args: { mode: 'ask' } })).toEqual({ ok: false });
  });

  it('REQ-TOOLS-074: a change that would loosen a pinned agent leaves it pinned, and the persona is named in the audit, the row and the log', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { port } = fakePort({ hold, holdOn: 'glob', pinnedPersona: 'reviewer' });
    const { sessions, logLines } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('ok')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    expect(sessions.control({ op: 'setPermissionMode', sessionId: sid, args: { mode: 'autonomous' } })).toEqual({ ok: true });
    // The pinned agent keeps deciding under its pin; the SESSION's mode is the one that was asked for.
    expect(port.currentMode()).toBe('ask');
    expect(dal.getSession(sid)!.permission_mode).toBe('autonomous');
    expect(JSON.parse(dal.auditOf(sid)[0]!.entry)).toMatchObject({ requested_mode: 'autonomous', effective_mode: 'autonomous', skipped_personas: ['reviewer'] });
    expect(dal.residentRows(sid).find((r) => r.kind === 'system')?.body).toBe("Permission mode is now 'autonomous'; it applies from the next tool call. reviewer keeps its pinned mode.");
    expect(logLines.some((l) => /did not reach reviewer/.test(l))).toBe(true);
    release();
    await sessions.running(sid)!;
  });

  it('answerApproval routes by request id across live sessions; unknown id or option is refused (REQ-MONITOR-010/254)', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { port, pending } = fakePort({ hold, holdOn: 'glob' });
    const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('ok')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    expect(sessions.control({ op: 'answerApproval', sessionId: sid, args: { requestId: 'known', option: 'once' } })).toEqual({ ok: true });
    expect(sessions.control({ op: 'answerApproval', sessionId: sid, args: { requestId: 'nope', option: 'once' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'answerApproval', sessionId: sid, args: { requestId: 'known', option: 'maybe' } })).toEqual({ ok: false });
    expect(pending.answered).toEqual(['known', 'nope']);
    release();
    await sessions.running(sid)!;
  });

  it('PD-TOOLS-002 (was REQ-TOOLS-067/071): autonomous requested while unattended and unsandboxed keeps autonomous — no downgrade row, timeline event or log warning', async () => {
    const { port } = fakePort();
    const { sessions, logLines } = sessionsWith([answer('hi')], port, { attended: false, runtime: { permissionMode: 'autonomous' } });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.permission_mode).toBe('autonomous');
    expect(dal.residentRows(sid).map((r) => r.body).join('\n')).not.toMatch(/downgraded/);
    expect(dal.timelineOf(sid).map((t) => t.name)).not.toContain('permission_mode_downgraded');
    expect(logLines.some((l) => /WARNING.*downgraded/.test(l))).toBe(false);
    expect(JSON.parse(dal.eventsOfKind(sid, 'session.start')[0]!.payload)).toMatchObject({ permission_mode: 'autonomous' });
  });

  it('with no tool port the model is offered no tool and a requested call ends the turn with a warning', async () => {
    const { sessions, client } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }], 'text')], null);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(client.requests[0]!.tools).toEqual([]);
    expect(warnings.some((w) => /no tool port/.test(w))).toBe(true);
  });

  it('REQ-SESSION-142: the session log takes WARNING and above by default and nothing after run end', async () => {
    const { port } = fakePort();
    const { sessions, logLines } = sessionsWith([answer('hi')], port);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await sessions.running(sid)!;
    const before = logLines.length;
    sessions.control({ op: 'cancel', sessionId: sid, args: {} });
    expect(logLines.length).toBe(before);
    expect(logLines.every((l) => /^\d{4}-\d\d-\d\dT.*(WARNING|ERROR)/.test(l))).toBe(true);
  });

  it('OQ-110 (REQ-CONFIG-086, REQ-SESSION-142): a retry the dispatch layer absorbed is written to the session log with the status it met and the delay it waited', async () => {
    const { port } = fakePort();
    // The client stands where the AI-SDK adapter stands: it absorbed a 429 and a 500 before the answer it streams.
    const wrap = (inner: ModelClient): ModelClient => ({
      stream: (req) => {
        req.onRetry?.({ attempt: 1, of: req.retries, status: 429, delayMs: 2_008 });
        req.onRetry?.({ attempt: 2, of: req.retries, status: 500, delayMs: 4_008 });
        return inner.stream(req);
      },
    });
    const { sessions, logLines } = sessionsWith([answer('recovered')], port, { wrap });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const retried = logLines.filter((l) => /retried by the dispatch layer/.test(l));
    expect(retried).toHaveLength(2);
    expect(retried[0]).toMatch(/^\d{4}-\d\d-\d\dT\S+ WARNING .* on p\/m met HTTP 429 and waited 2008 ms before retry 1 of 5 \(REQ-CONFIG-086/);
    expect(retried[1]).toMatch(/met HTTP 500 and waited 4008 ms before retry 2 of 5/);
    // The ladder was never reached: no issue and no timeline entry claims it (OQ-110 adds nothing to it).
    expect(dal.eventsFrom(sid, 1, 10_000).map((e) => e.kind).filter((k) => /issue|wait/.test(k))).toEqual([]);
  });

  describe('PD-ORCH-005 clauses 2, 9 and 10: what a pause does, and what becomes of the background sessions', () => {
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 2)); };
    const resultOf = (sid: SessionId, callId: string) => {
      const root = dal.iterationsOf(sid)[0]!.root_task_id;
      return conversationOf(dal.agentConversation(sid, root)).flatMap((m) => m.content.flatMap((p) => (p.kind === 'tool-result' ? [p] : []))).find((p) => p.callId === callId);
    };

    it('clause 9: an accepted pause withdraws every approval and question at once — the calls waiting on a person are not waited for', async () => {
      const { port, pending } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'write_file' });
      const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'write_file', args: { path: 'a' } }]), answer('never')], port);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      expect(pending.withdrawn).toEqual(['pause']);
      expect(pending.cancelled).toBe(0);
      clock.advance(30_000);
      await sessions.running(sid)!;
    });

    it('REQ-ORCH-134 (clause 2): a call still in flight is awaited until the pause\'s tool deadline — `runtime.graceful_pause_tool_deadline` — then cut and recorded as interrupted', async () => {
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('never')], port, { runtime: { permissionMode: 'ask', pauseToolDeadlineMs: 5_000 } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      clock.advance(4_999);
      await new Promise((r) => setTimeout(r, 10));
      expect(sessions.isRunActive(sid)).toBe(true);
      clock.advance(1);
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('interrupted');
      expect(resultOf(sid, 'c1')).toMatchObject({ isError: true, result: expect.stringMatching(/^This call was interrupted by the pause before it completed, and it was not re-run\.[\s\S]*cancelled$/) });
      expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'pause' }]);
    });

    function withTerminals() {
      const live: { -readonly [K in keyof LiveTerminal]: LiveTerminal[K] }[] = [
        { id: 'ts_serve', taskId: 'bg_agent01', command: 'serve', startedAt: '2026-09-27T00:00:00.000Z', status: 'running', exitCode: null, tail: 'listening' },
        { id: 'ts_build', taskId: 'bg_agent01', command: 'build', startedAt: '2026-09-27T00:00:01.000Z', status: 'completed', exitCode: 0, tail: 'built' },
      ];
      const ended: string[][] = [];
      const terminals: SessionsDeps['terminals'] = () => ({ list: () => live, end: async (ids) => { ended.push([...ids]); for (const t of live) if (ids.includes(t.id)) { t.status = 'killed'; t.exitCode = -1; } } });
      return { terminals, ended };
    }

    it('clause 10: a stop ends the running background sessions and records each as ended by the stop, with its last output', async () => {
      const { terminals, ended } = withTerminals();
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('never')], port, { terminals });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      sessions.control({ op: 'cancel', sessionId: sid, args: {} });
      await sessions.running(sid)!;
      expect(ended).toEqual([['ts_serve']]);
      // Recorded before the kill: the kill's own `killed` is not the end the record keeps.
      expect(dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state, t.output_tail])).toEqual([['ts_serve', 'stop', 'listening'], ['ts_build', 'completed', 'built']]);
    });

    it('clause 10: when an agent resumes it is told, for each background session it had started, whether it still runs or how it ended, with its last recorded output', async () => {
      const { terminals } = withTerminals();
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions, client } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('resumed')], port, { terminals: (sid) => { const t = terminals!(sid); return { ...t, list: () => t.list().map((l) => ({ ...l, taskId: dal.iterationsOf(sid)[0]?.root_task_id ?? '' })) }; }, runtime: { permissionMode: 'ask', pauseToolDeadlineMs: 5_000 } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      clock.advance(5_000);
      await sessions.running(sid)!;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      const told = client.requests.at(-1)!.messages.at(-1)!.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
      expect(told).toMatch(/^You were paused and have now resumed\. The background terminal sessions you had started:/);
      expect(told).toContain('- ts_serve (`serve`) is still running; query or kill it by that id. Its last recorded output:\n```\nlistening\n```');
      expect(told).toContain('- ts_build (`build`) has ended: it completed, exit code 0. Its last recorded output:\n```\nbuilt\n```');
      // The notice is part of the record, as every message of the conversation is.
      const root = dal.iterationsOf(sid)[0]!.root_task_id;
      expect(conversationOf(dal.agentConversation(sid, root)).some((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text === told))).toBe(true);
    });

    it('clauses 4 and 10 (found by phase 4\'s second review): a continue by message tells the resumed root of its background sessions first, so the user\'s message is the last it reads', async () => {
      const { terminals } = withTerminals();
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions, client } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('resumed')], port, { terminals: (sid) => { const t = terminals!(sid); return { ...t, list: () => t.list().map((l) => ({ ...l, taskId: dal.iterationsOf(sid)[0]?.root_task_id ?? '' })) }; }, runtime: { permissionMode: 'ask', pauseToolDeadlineMs: 5_000 } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      clock.advance(5_000);
      await sessions.running(sid)!;
      expect(sessions.prompt(sid, 'NOW DO Y').ok).toBe(true);
      await sessions.running(sid)!;
      const last = client.requests.at(-1)!.messages.slice(-2).map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join(''));
      expect(last[0]).toMatch(/^You were paused and have now resumed\./);
      expect(last[1]).toBe('NOW DO Y');
    });

    it('clause 10 (found by phase 4\'s third review): continues that come to rest before the root takes a step tell it of its background sessions once, and deliver every message', async () => {
      const { terminals } = withTerminals();
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions, client } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('resumed')], port, { terminals: (sid) => { const t = terminals!(sid); return { ...t, list: () => t.list().map((l) => ({ ...l, taskId: dal.iterationsOf(sid)[0]?.root_task_id ?? '' })) }; }, runtime: { permissionMode: 'ask', pauseToolDeadlineMs: 5_000 } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      clock.advance(5_000);
      await sessions.running(sid)!;
      for (const message of ['FIRST', 'SECOND']) {
        expect(sessions.prompt(sid, message).ok).toBe(true);
        sessions.control({ op: 'pause', sessionId: sid, args: {} });
        await sessions.running(sid)!;
      }
      expect(sessions.prompt(sid, 'THIRD').ok).toBe(true);
      await sessions.running(sid)!;
      const read = client.requests.at(-1)!.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join(''));
      expect(read.filter((t) => t.startsWith('You were paused and have now resumed.'))).toHaveLength(1);
      expect(read.slice(-3)).toEqual(['FIRST', 'SECOND', 'THIRD']);
    });

    it('PD-ORCH-004 revision 3 (found by phase 6\'s third review): a resumed root is told an open offer once — a later continue, after it has read it, does not tell it again', async () => {
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), toolCalls([{ callId: 'c2', name: 'glob', args: {} }]), answer('done')], port, { runtime: { permissionMode: 'ask', pauseToolDeadlineMs: 5_000 } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      const restAt = async (n: number) => {
        await settle(() => dal.residentRows(sid).filter((r) => r.kind === 'tool').length === n);
        sessions.control({ op: 'pause', sessionId: sid, args: {} });
        clock.advance(5_000);
        await sessions.running(sid)!;
      };
      await restAt(1);
      // An earlier iteration's child, cut off with an offer no child has taken up.
      dal.insertChild({ session_id: sid, task_id: 'bg_0000be09', canonical_name: 'old', given_name: 'old', persona: 'coding-agent', state: 'failed', parent_id: 'bg_0000a11e', depth: 1, iteration: 0, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
      dal.setChildReport(sid, 'bg_0000be09', JSON.stringify({ status: 'failed', summary: 'timed out', cut_off: { statement: 's', changed_paths: [], changes: '', continuation_offer: 'Continue with continuation_of: "bg_0000be09".' } }));
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await restAt(2);
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      const root = dal.iterationsOf(sid)[0]!.root_task_id;
      const told = conversationOf(dal.agentConversation(sid, root)).filter((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text.startsWith('Open continuation offers')));
      expect(told).toHaveLength(1);
    });

    it('clause 3 (found by phase 3\'s second review): the explicit cancel that lands while teardown ends the background sessions still closes the iteration cancelled', async () => {
      const live: { -readonly [K in keyof LiveTerminal]: LiveTerminal[K] }[] = [{ id: 'ts_serve', taskId: 'bg_agent01', command: 'serve', startedAt: '2026-09-27T00:00:00.000Z', status: 'running', exitCode: null, tail: 'listening' }];
      let ending = false;
      let releaseEnd!: () => void;
      const endHold = new Promise<void>((r) => { releaseEnd = r; });
      const terminals: SessionsDeps['terminals'] = () => ({ list: () => live, end: async () => { ending = true; await endHold; live[0]!.status = 'killed'; } });
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('never')], port, { terminals });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      sessions.control({ op: 'cancel', sessionId: sid, args: {} });
      await settle(() => ending);
      expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'stop' }]);
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } })).toEqual({ ok: true });
      releaseEnd();
      await sessions.running(sid)!;
      expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'closed', outcome: 'cancelled' }]);
      const closed = dal.eventsOfKind(sid, 'iteration.end').map((e) => JSON.parse(e.payload) as { summary: string });
      expect(closed.map((e) => e.summary)).toEqual(['the run was cancelled after it had come to rest']);
    });

    it('clause 10: the explicit cancel that lands after a pause came to rest ends the background sessions the pause had left running', async () => {
      const { terminals, ended } = withTerminals();
      let releaseHook!: () => void;
      const hookHold = new Promise<void>((r) => { releaseHook = r; });
      let ending = false;
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event) => { if (event === 'session_end') { ending = true; await hookHold; } return []; }, advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('never')], port, { terminals, hooks, runtime: { permissionMode: 'ask', pauseToolDeadlineMs: 5_000 } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      clock.advance(5_000);
      await settle(() => ending);
      expect(ended).toEqual([]);
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } })).toEqual({ ok: true });
      releaseHook();
      await sessions.running(sid)!;
      expect(ended).toEqual([['ts_serve']]);
      expect(dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state])).toEqual([['ts_serve', 'stop'], ['ts_build', 'completed']]);
      expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'closed', outcome: 'cancelled' }]);
    });

    it('clause 10 (OQ-96): the explicit cancel is a stop for the background sessions — it ends them and records it', async () => {
      const { terminals, ended } = withTerminals();
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('never')], port, { terminals });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } });
      await sessions.running(sid)!;
      expect(ended).toEqual([['ts_serve']]);
      expect(dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state])).toEqual([['ts_serve', 'stop'], ['ts_build', 'completed']]);
    });

    it('a call that raises while the run comes to rest leaves the iteration open to be resumed, not failed and abandoned', async () => {
      let raise!: () => void;
      const raised = new Promise<void>((r) => { raise = r; });
      const fake = fakePort().port;
      const port: ToolPort = { ...fake, dispatch: async (c, signal) => { if (c.name !== 'glob') return fake.dispatch(c, signal); await raised; throw new Error('the tool host went away'); } };
      const { sessions } = sessionsWith([toolCalls([{ callId: 'c0', name: 'write_file', args: { path: 'a.txt' } }, { callId: 'c1', name: 'glob', args: {} }]), answer('never')], port);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool' && r.tool_name === 'glob'));
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      raise();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('interrupted');
      expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'pause' }]);
      expect(decodeStoredTodo(dal.getSession(sid)!.todo).planner!.phases[0]!.tasks[0]!.state).toBe('in_progress');
      // The call it raised out of is answered as interrupted in the root's record, and its row settles (phase 3's third
      // review); the call that completed before it in the same step keeps what it returned (phase 3's fourth review).
      const root = dal.iterationsOf(sid)[0]!.root_task_id;
      expect(conversationOf(dal.agentConversation(sid, root)).at(-1)).toEqual({ role: 'tool', content: [
        { kind: 'tool-result', callId: 'c0', name: 'write_file', isError: false, result: 'wrote a.txt' },
        { kind: 'tool-result', callId: 'c1', name: 'glob', isError: true, result: interruptedResult('pause', true, '') },
      ] });
      expect(dal.residentRows(sid).filter((r) => r.kind === 'tool').map((r) => [r.tool_name, r.tool_status])).toEqual([['write_file', 'ok'], ['glob', 'failed']]);
    });

    it('clause 10: a pause leaves them running while the application stays open; the quit that follows ends them and records it', async () => {
      const { terminals, ended } = withTerminals();
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('never')], port, { terminals, runtime: { permissionMode: 'ask', pauseToolDeadlineMs: 5_000 } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      clock.advance(5_000);
      await sessions.running(sid)!;
      expect(ended).toEqual([]);
      expect(dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state])).toEqual([['ts_serve', 'running'], ['ts_build', 'completed']]);
      await sessions.closeAll();
      expect(dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state])).toEqual([['ts_serve', 'quit'], ['ts_build', 'completed']]);
      // The pause's teardown released the lock; the quit took it for the record and gave it back.
      expect(dal.getLock(sid)).toBeUndefined();
    });

    it('clause 10 with REQ-EVENTS-098 / ADR-0005: the quit records nothing of a session another live process holds, and leaves that holder\'s lock', async () => {
      const { terminals } = withTerminals();
      const { port } = fakePort({ hold: new Promise<void>(() => undefined), holdOn: 'glob' });
      const { sessions } = sessionsWith([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('never')], port, { terminals, runtime: { permissionMode: 'ask', pauseToolDeadlineMs: 5_000 } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.residentRows(sid).some((r) => r.kind === 'tool'));
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      clock.advance(5_000);
      await sessions.running(sid)!;
      expect(dal.getLock(sid)).toBeUndefined();
      expect(dal.claimLock(sid, 999, HOST, '2026-10-01T00:00:00.000Z').claimed).toBe(true);
      const events = dal.eventsFrom(sid, 1, 10_000).length;
      await sessions.closeAll();
      expect(dal.agentTerminalsOf(sid).map((t) => [t.terminal_id, t.state])).toEqual([['ts_serve', 'running'], ['ts_build', 'completed']]);
      expect(dal.eventsFrom(sid, 1, 10_000)).toHaveLength(events);
      expect(dal.getLock(sid)).toMatchObject({ pid: 999 });
      expect(warnings.some((w) => w.includes('ts_serve') && w.includes('pid 999'))).toBe(true);
    });
  });
});
