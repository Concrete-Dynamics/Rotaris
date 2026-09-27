import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type ModeChange, type PortToolCall, type PortToolResult, type Publisher, type RunConfig, type SessionsDeps, type ToolPort } from '../index.js';
import { conversationOf } from './record.js';
import type { LiveTerminal } from './run.js';

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

  function sessionsWith(calls: ScriptedCall[], port: ToolPort | null, extra: { attended?: boolean; runtime?: { permissionMode: string; pauseToolDeadlineMs?: number }; terminals?: SessionsDeps['terminals'] } = {}) {
    const client = new ScriptedModelClient(calls);
    let n = 0;
    const logLines: string[] = [];
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `S${++n}`,
      model: { backend: new DefaultAgentBackend(client), config: config() }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      ...(port ? { tools: () => port } : {}), attended: () => extra.attended ?? true,
      runtime: { permissionMode: extra.runtime?.permissionMode ?? 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', ...(extra.runtime?.pauseToolDeadlineMs === undefined ? {} : { pauseToolDeadlineMs: extra.runtime.pauseToolDeadlineMs }) },
      sessionLogAppender: () => (line) => { logLines.push(line); },
      ...(extra.terminals ? { terminals: extra.terminals } : {}),
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
    });
  });
});
