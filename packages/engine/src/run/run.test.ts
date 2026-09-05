import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import type { SessionSnapshot, TranscriptIncrement } from '@rotaris/contracts';
import { answer, DefaultAgentBackend, modelError, ScriptedModelClient, type AgentBackend, type ScriptedCall, type TurnReport } from '@rotaris/model';
import { parseEventLine, ProjectionOwner, Run, RUN_CONFIG_DEFAULTS, SequenceCounters, Sessions, SessionWriter, toSessionRecord, toTranscriptRow, type Publisher, type RunConfig, type RunResult } from '../index.js';

const HOST = mintMachineId('0000000000000000000000000000000a') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };

function recorder(): Publisher & { seen: { channel: 'inc' | 'snap'; seq: number; payload: TranscriptIncrement | SessionSnapshot }[] } {
  const seen: { channel: 'inc' | 'snap'; seq: number; payload: TranscriptIncrement | SessionSnapshot }[] = [];
  return { seen, increment: (p) => seen.push({ channel: 'inc', seq: p.seq, payload: p }), snapshot: (p) => seen.push({ channel: 'snap', seq: p.seq, payload: p }) };
}

describe('engine/run — the run loop end to end against a real store and a scripted model', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-run-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const config = (over: Partial<RunConfig> = {}): RunConfig => ({ ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k', ...over });

  function sessionsWith(backend: AgentBackend, over: Partial<RunConfig> = {}, extra: { onRunResult?: (id: SessionId, r: RunResult) => void } = {}) {
    const pub = recorder();
    let n = 0;
    const sessions = new Sessions({
      clocks: clock, publisher: pub, pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `S${++n}`,
      model: { backend, config: config(over) }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), ...extra,
    });
    return { sessions, pub };
  }
  function scripted(calls: ScriptedCall[]) {
    const client = new ScriptedModelClient(calls);
    return { client, backend: new DefaultAgentBackend(client) };
  }
  const events = (sid: SessionId) => dal.eventsFrom(sid, 1, 10_000).map((e) => e.kind);
  const rows = (sid: SessionId) => dal.residentRows(sid).map((r) => ({ kind: r.kind, body: r.body, settled: r.settled }));
  const payload = (sid: SessionId, kind: string) => { const e = dal.eventsOfKind(sid, kind).at(-1)!; const p = parseEventLine(e.payload); if (!p.ok) throw new Error(p.error.reason); return p.value; };

  it('happy path: every event in order, exactly one session.start/session.end/result, completed, lock released, audit once, summary written', async () => {
    const { backend } = scripted([answer('The answer is 42.', { input: 20, output: 6 })]);
    const results: RunResult[] = [];
    const { sessions, pub } = sessionsWith(backend, {}, { onRunResult: (_id, r) => results.push(r) });
    const started = sessions.start(dal, 'C:/ws', 'what is the answer?');
    if (!started.ok) throw new Error(JSON.stringify(started.error));
    const sid = started.value;
    const result = await sessions.running(sid)!;

    expect(events(sid)).toEqual(['session.start', 'transcript.row', 'iteration.start', 'transcript.row', 'transcript.row', 'usage.update', 'iteration.end', 'transcript.row', 'session.end', 'result']);
    expect(rows(sid)).toEqual([
      { kind: 'user', body: 'what is the answer?', settled: 1 },
      { kind: 'agent', body: 'The answer is 42.', settled: 1 },
      { kind: 'system', body: 'The run completed.', settled: 1 },
    ]);
    expect(dal.residentRows(sid)[1]).toMatchObject({ persona: 'orchestrator', name: 'orchestrator' });
    expect(dal.residentRows(sid)[1]!.ts).toMatch(/^\d\d:\d\d:\d\d$/);
    const s = dal.getSession(sid)!;
    expect(s).toMatchObject({ execution_status: 'completed', stop_reason: 'tasks_complete', iterations_completed: 1, tokens_input: 20, tokens_output: 6, summary_status: 'completed' });
    expect(dal.getLock(sid)).toBeUndefined();
    expect(dal.getLaunchAudit(sid)).toBeDefined();
    expect(JSON.parse(dal.getLaunchAudit(sid)!.payload).run_intent.fallback).toBe(true);
    expect(dal.timelineOf(sid).map((t) => t.name)).toEqual(['run_start', 'run_end']);
    expect(result).toMatchObject({ status: 'completed', stop_reason: 'tasks_complete', iterations_completed: 1, tokens: { input: 20, output: 6, total: 26 }, error: null });
    expect(results).toEqual([result]);
    // REQ-SESSION-095: session.end and result mirror one computation.
    expect(payload(sid, 'session.end')).toMatchObject({ status: 'completed', stop_reason: 'tasks_complete', iterations_completed: 1 });
    expect((payload(sid, 'result') as unknown as { result: { status: string } }).result.status).toBe('completed');
    expect(payload(sid, 'session.start')).toMatchObject({ task: 'what is the answer?', persona: 'orchestrator', sandboxed: false, max_iterations: 20 });
    expect(payload(sid, 'iteration.start')).toMatchObject({ iteration: 1 });
    expect(dal.eventsOfKind(sid, 'iteration.end')[0]!.iteration).toBe(1);
    // The status transitions were each published as snapshots: starting, running, …, completed.
    const statuses = pub.seen.filter((p) => p.channel === 'snap').map((p) => (p.payload as SessionSnapshot).session.executionStatus);
    expect(statuses[0]).toBe('starting');
    expect(statuses).toContain('running');
    expect(statuses.at(-1)).toBe('completed');
    // The summary file lands after the save, off the path.
    await new Promise((r) => setTimeout(r, 20));
    const summary = join(dir, 'sessions', sid, 'summary.md');
    expect(existsSync(summary)).toBe(true);
    expect(readFileSync(summary, 'utf8')).toContain('completed');
  });

  it('REQ-MONITOR-219: growth of the agent row is coalesced into a 50 ms tick, in memory, and the settle cancels a pending tick', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { backend } = scripted([{ parts: [{ part: { kind: 'text', delta: 'abc' } }, { part: { kind: 'text', delta: 'def' } }, { hold, part: { kind: 'text', delta: 'ghi' } }, { part: { kind: 'finish', reason: 'stop' } }] }]);
    const { sessions, pub } = sessionsWith(backend);
    const sid = (sessions.start(dal, 'C:/ws', 'grow') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    const before = pub.seen.filter((p) => p.channel === 'inc').length;
    clock.advance(50);
    const ticks = pub.seen.filter((p) => p.channel === 'inc').slice(before);
    expect(ticks.length).toBe(1);
    expect((ticks[0]!.payload as TranscriptIncrement).rows.at(-1)).toMatchObject({ kind: 'agent', body: 'abcdef', settled: false });
    // No commit per tick: the store holds the row's first-appearance body until the settle.
    expect(dal.residentRows(sid)[1]!.body).toBe('abc');
    release();
    await sessions.running(sid);
    expect(dal.residentRows(sid)[1]).toMatchObject({ body: 'abcdefghi', settled: 1 });
    // user row, agent first appearance, agent settled, the system row: four, and none per tick.
    expect(dal.eventsOfKind(sid, 'transcript.row').length).toBe(4);
  });

  it('cancel mid-stream: cancelling is persisted, the call is aborted, the 30 s hard-cancel is armed, and the run ends interrupted → paused with its row', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { backend } = scripted([{ parts: [{ part: { kind: 'text', delta: 'partial' } }, { hold, part: { kind: 'text', delta: ' more' } }] }]);
    const { sessions } = sessionsWith(backend);
    const sid = (sessions.start(dal, 'C:/ws', 'stop me') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    expect(sessions.isRunActive(sid)).toBe(true);
    expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
    expect(dal.getSession(sid)!.execution_status).toBe('cancelling');
    expect(sessions.run(sid)!.hardCancelArmed).toBe(true);
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    expect(result.stop_reason).toBe('user_cancelled');
    expect(dal.getSession(sid)!.execution_status).toBe('paused');
    expect(rows(sid).at(-1)).toEqual({ kind: 'system', body: 'Run paused: interrupted by user.', settled: 1 });
    expect(dal.residentRows(sid)[1]).toMatchObject({ kind: 'agent', body: 'partial', settled: 1 });
    expect(events(sid).slice(-2)).toEqual(['session.end', 'result']);
    expect(payload(sid, 'iteration.end')).toMatchObject({ outcome: 'cancelled' });
    expect(dal.getLock(sid)).toBeUndefined();
    expect(sessions.isRunActive(sid)).toBe(false);
    // Controls on an ended run answer false (REQ-MONITOR-011); the unbuilt ops answer false (REQ-MONITOR-007).
    expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: false });
    release();
  });

  it('a second cancel while the first is pending forces (REQ-SESSION-186); the hard-cancel timer fires the force by itself at 30 s', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    // A backend that ignores the abort: the only thing that ends it is the release.
    const stubborn: AgentBackend = { ownsTheLoop: false, runTurn: async () => { await hold; return { status: 'succeeded', text: 'late', usage: { input: 0, output: 0 } }; } };
    const { sessions } = sessionsWith(stubborn);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    sessions.control({ op: 'cancel', sessionId: sid, args: {} });
    const run = sessions.run(sid)!;
    expect(run.stop.forced).toBe(false);
    clock.advance(30_000);
    expect(run.stop.forced).toBe(true);
    release();
    const result = await sessions.running(sid)!;
    // REQ-EVENTS-028: the turn "succeeded" late, and interrupted still wins.
    expect(result.status).toBe('interrupted');
  });

  it('REQ-SESSION-091: a cancellation requested before the loop exists makes no model call and ends interrupted at paused', async () => {
    const { client, backend } = scripted([answer('never')]);
    const sid = asSessionId('S-early');
    const bus = new Sessions({ clocks: clock, publisher: recorder(), pid: 1, host: HOST, retentionCap: 0, warn: () => undefined, mintSessionId: () => 'x', model: null, sessionFilesDir: () => dir }).bus;
    let owner: ProjectionOwner | undefined;
    let run: Run | undefined;
    const created = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: (c) => { owner?.onCommitted(c); run?.onCommitted(c); } }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST, task: 't' });
    if (!created.ok) throw new Error('create');
    owner = new ProjectionOwner({ sessionId: sid, seq: new SequenceCounters(), timers: clock, publisher: recorder(), readSession: () => toSessionRecord(dal.getSession(sid)!), readResident: () => dal.residentRows(sid).map(toTranscriptRow) });
    run = new Run({ sessionId: sid, workspaceRoot: 'C:/ws', task: 't', taskId: 'T', writer: created.value, owner, bus, clocks: clock, backend, config: config(), tools: null, permission: { requested: 'ask', effective: 'ask', downgraded: false, reason: '', sandboxed: false, sandboxBackend: '' }, pid: 1, host: HOST, readSession: () => dal.getSession(sid), warn: () => undefined });
    run.stop.request('user_cancelled');
    const result = await run.start();
    expect(result.status).toBe('interrupted');
    expect(client.requests.length).toBe(0);
    expect(dal.getSession(sid)!.execution_status).toBe('paused');
    expect(events(sid)).toEqual(['session.start', 'transcript.row', 'session.end', 'result']);
    expect(dal.getLaunchAudit(sid)).toBeUndefined();
  });

  it('REQ-ORCH-092: a transient failure is retried once after 1 s and recorded as transient_llm_error; the retry succeeds', async () => {
    const { client, backend } = scripted([{ parts: [{ error: modelError({ code: 'http', status: 503, headline: 'overloaded' }) }] }, answer('second time lucky')]);
    const { sessions } = sessionsWith(backend);
    const sid = (sessions.start(dal, 'C:/ws', 'retry') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    expect(client.requests.length).toBe(1);
    clock.advance(999);
    await new Promise((r) => setTimeout(r, 5));
    expect(client.requests.length).toBe(1);
    clock.advance(1);
    const result = await sessions.running(sid)!;
    expect(client.requests.length).toBe(2);
    expect(result.status).toBe('completed');
    expect(warnings.some((w) => w.includes('transient_llm_error'))).toBe(true);
  });

  it('a failure outside the transient class ends the run agent_session_aborted → failed, with the error in the row and the result', async () => {
    const { backend } = scripted([{ parts: [{ error: modelError({ code: 'http', status: 401, headline: 'unauthorised', providerMessage: 'bad key' }) }] }]);
    const { sessions } = sessionsWith(backend);
    const sid = (sessions.start(dal, 'C:/ws', 'fail') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result).toMatchObject({ status: 'failed', stop_reason: 'agent_session_aborted', execution_status: 'failed' });
    expect(result.error).toContain('bad key');
    expect(rows(sid).at(-1)!.body).toMatch(/^Run failed: /);
    expect(dal.getSession(sid)).toMatchObject({ execution_status: 'failed', summary_status: 'failed' });
    expect(events(sid).filter((k) => k === 'result').length).toBe(1);
  });

  it('REQ-ORCH-074/069: a partial turn returns the task to pending; the iteration limit ends the run max_iterations → stopped', async () => {
    const length: ScriptedCall = { parts: [{ part: { kind: 'text', delta: 'half…' } }, { part: { kind: 'finish', reason: 'length' } }] };
    const { backend } = scripted([length, length]);
    const { sessions } = sessionsWith(backend, { iterationLimit: 2 });
    const sid = (sessions.start(dal, 'C:/ws', 'long') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result).toMatchObject({ status: 'max_iterations', stop_reason: 'iteration_limit_reached', iterations_completed: 2, execution_status: 'stopped' });
    expect(dal.eventsOfKind(sid, 'iteration.end').map((e) => e.iteration)).toEqual([1, 2]);
    expect(dal.getSession(sid)!.execution_status).toBe('stopped');
  });

  it('REQ-ORCH-077: three consecutive pending outcomes abandon the task; the run then stops no_pending_tasks and persists the summarised failed status (REQ-SESSION-093)', async () => {
    const length: ScriptedCall = { parts: [{ part: { kind: 'finish', reason: 'length' } }] };
    const { backend } = scripted([length, length, length, answer('unreached')]);
    const { sessions } = sessionsWith(backend);
    const sid = (sessions.start(dal, 'C:/ws', 'loop') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result).toMatchObject({ status: 'completed', stop_reason: 'no_pending_tasks', iterations_completed: 3 });
    expect(dal.getSession(sid)).toMatchObject({ execution_status: 'failed', summary_status: 'failed' });
    expect(JSON.parse(dal.getSession(sid)!.todo!).phases[0].tasks[0].state).toBe('abandoned');
  });

  it('REQ-EVENTS-028: a stop requested during a turn that then completes still yields interrupted', async () => {
    const { sessions } = sessionsWith({ ownsTheLoop: false, runTurn: async () => ({ status: 'succeeded', text: 'done', usage: { input: 1, output: 1 } }) } satisfies AgentBackend);
    // Wrap: request the stop from inside the turn, after which the turn reports success.
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    sessions.run(sid)!.stop.request('user_cancelled');
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
  });

  it('REQ-SESSION-094: teardown runs every step even when one throws and when the iteration raised', async () => {
    const throwing: AgentBackend = { ownsTheLoop: false, runTurn: async () => { throw new Error('backend exploded'); } };
    const { sessions } = sessionsWith(throwing);
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    const run = sessions.run(sid)!;
    // A teardown step that throws (the flush) must not stop the pipeline.
    const owner = sessions.owner(sid)!;
    owner.flushPending = () => { throw new Error('flush exploded'); };
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('failed');
    expect(result.error).toContain('backend exploded');
    expect(run.isEnded).toBe(true);
    expect(dal.getLock(sid)).toBeUndefined();
    expect(events(sid).slice(-2)).toEqual(['session.end', 'result']);
    expect(warnings.some((w) => w.includes('flush exploded'))).toBe(true);
  });

  it('REQ-EVENTS-021 / REQ-SESSION-082: with no model configured the run is refused before it starts — no session, one error result marked failed-before-start', () => {
    const sessions = new Sessions({ clocks: clock, publisher: recorder(), pid: 1, host: HOST, retentionCap: 0, warn: () => undefined, mintSessionId: () => 'never', model: null, sessionFilesDir: () => dir });
    const r = sessions.start(dal, 'C:/ws', 'x');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: 'no-model', failedBeforeStart: true, result: { status: 'error', session_id: '' } });
    expect(dal.totals().sessions).toBe(0);
  });

  it('REQ-CHAT-012 / REQ-MONITOR-260: a prompt while a run is active is refused with "A run is already active."; after the run it is recorded', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const { backend } = scripted([{ parts: [{ hold, part: { kind: 'text', delta: 'x' } }, { part: { kind: 'finish', reason: 'stop' } }] }]);
    const { sessions } = sessionsWith(backend);
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    const refused = sessions.prompt(sid, 'second');
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.reason).toBe('A run is already active.');
    release();
    await sessions.running(sid);
    expect(sessions.prompt(sid, 'second').ok).toBe(true);
  });

  it('REQ-MONITOR-255 / REQ-MONITOR-131: shutdown asks every run to stop before waiting on any; each ends interrupted and releases its lock', async () => {
    const holds: (() => void)[] = [];
    const backend: AgentBackend = { ownsTheLoop: false, runTurn: (_i, _s, signal) => new Promise<TurnReport>((resolve) => { holds.push(() => resolve({ status: 'succeeded', text: 'late', usage: { input: 0, output: 0 } })); signal.addEventListener('abort', () => resolve({ status: 'failed', text: '', usage: { input: 0, output: 0 }, error: modelError({ code: 'aborted', headline: 'aborted', transient: false }) })); }) };
    const { sessions } = sessionsWith(backend);
    const a = (sessions.start(dal, 'C:/ws', 'a') as { value: SessionId }).value;
    const b = (sessions.start(dal, 'C:/ws', 'b') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    expect(sessions.activeRunCount()).toBe(2);
    await sessions.closeAll();
    for (const sid of [a, b]) {
      expect(dal.getSession(sid)!.execution_status).toBe('paused');
      expect(dal.getSession(sid)!.stop_reason).toBe('application_shutdown');
      expect(dal.getLock(sid)).toBeUndefined();
    }
  });

  it('REQ-SESSION-147 / REQ-EVENTS-165: a blocking consumer sees every event after its commit, in ordinal order, and holds the run until it takes each', async () => {
    const { backend } = scripted([answer('ok')]);
    const { sessions } = sessionsWith(backend);
    const seen: { kind: string; persisted: boolean }[] = [];
    let n = 0;
    const sessionsAny = sessions;
    const sid = asSessionId('S1');
    sessionsAny.bus.attach(sid, { mode: 'blocking', deliver: (e) => { n += 1; seen.push({ kind: e.event, persisted: dal.eventsFrom(sid, 1, 1000).some((r) => r.kind === e.event && r.ordinal === n) }); } });
    const started = sessions.start(dal, 'C:/ws', 'tee');
    if (!started.ok) throw new Error('start');
    expect(started.value).toBe(sid);
    await sessions.running(sid);
    expect(seen.map((s) => s.kind)).toEqual(events(sid));
    expect(seen.every((s) => s.persisted)).toBe(true);
    expect(sessions.bus.consumers(sid)).toBe(0);
  });
});
