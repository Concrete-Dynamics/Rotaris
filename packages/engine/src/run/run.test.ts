import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import type { SessionSnapshot, TranscriptIncrement } from '@rotaris/contracts';
import { answer, DefaultAgentBackend, modelError, ScriptedModelClient, type AgentBackend, type ScriptedCall, type TurnReport } from '@rotaris/model';
import { parseEventLine, ProjectionOwner, Run, RUN_CONFIG_DEFAULTS, SequenceCounters, Sessions, SessionWriter, toSessionRecord, toTranscriptRow, type Publisher, type RunConfig, type RunNotice, type RunResult } from '../index.js';

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

  function sessionsWith(backend: AgentBackend, over: Partial<RunConfig> = {}, extra: { onRunResult?: (id: SessionId, r: RunResult) => void; notice?: (n: RunNotice) => void } = {}) {
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
    expect(payload(sid, 'session.start')).toMatchObject({ task: 'what is the answer?', persona: 'orchestrator', sandbox: { enabled: false, backend: '' }, max_iterations: 20 });
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

  it('starts an improvement run from its supplied approved-proposal todo and persists that plan', async () => {
    const { backend } = scripted([answer('Applied the first proposal.'), answer('Applied the second proposal.')]);
    const { sessions } = sessionsWith(backend);
    const started = sessions.start(dal, 'C:/ws', 'Apply the reviewed improvements.', {
      runType: 'improvement_run',
      initialTodo: {
        schema_version: 1,
        phases: [{
          name: 'improvement_run',
          tasks: [
            { id: 'imp_1', text: 'Apply improvement imp_1: first', state: 'pending', consecutiveRetries: 0 },
            { id: 'imp_2', text: 'Apply improvement imp_2: second', state: 'pending', consecutiveRetries: 0 },
          ],
        }],
      },
    });
    if (!started.ok) throw new Error(JSON.stringify(started.error));

    await sessions.running(started.value)!;

    const session = dal.getSession(started.value)!;
    expect(session.run_type).toBe('improvement_run');
    expect(JSON.parse(session.todo!)).toEqual({
      schema_version: 1,
      phases: [{
        name: 'improvement_run',
        tasks: [
          { id: 'imp_1', text: 'Apply improvement imp_1: first', state: 'complete', consecutiveRetries: 0 },
          { id: 'imp_2', text: 'Apply improvement imp_2: second', state: 'complete', consecutiveRetries: 0 },
        ],
      }],
    });
  });

  it('A3: holds ownership through terminal inserts and delivery, releasing after detachment', async () => {
    const { backend } = scripted([answer('ok')]);
    const { sessions } = sessionsWith(backend);
    const sid = asSessionId('S1');
    const terminal: string[] = [];
    const insert = dal.insertEvent.bind(dal);
    vi.spyOn(dal, 'insertEvent').mockImplementation((...args) => {
      if (args[2] === 'session.end' || args[2] === 'result') expect(dal.getLock(sid)).toBeDefined();
      return insert(...args);
    });
    const release = dal.releaseLock.bind(dal);
    vi.spyOn(dal, 'releaseLock').mockImplementation((...args) => {
      expect(sessions.bus.consumers(sid)).toBe(0);
      expect(terminal).toEqual(['session.end', 'result']);
      return release(...args);
    });
    sessions.bus.attach(sid, { mode: 'blocking', deliver: (e) => {
      if (e.event === 'session.end' || e.event === 'result') {
        expect(dal.getLock(sid)).toBeDefined();
        terminal.push(e.event);
      }
    } });
    expect(sessions.start(dal, 'C:/ws', 'ownership').ok).toBe(true);
    await sessions.running(sid);
    expect(dal.getLock(sid)).toBeUndefined();
    expect(terminal).toEqual(['session.end', 'result']);
  });

  it('A3: terminal persistence failure rolls back the pair and still detaches and releases', async () => {
    const { backend } = scripted([answer('ok')]);
    const { sessions } = sessionsWith(backend);
    const sid = asSessionId('S1');
    const delivered: string[] = [];
    sessions.bus.attach(sid, { mode: 'blocking', deliver: (e) => { delivered.push(e.event); } });
    const insert = dal.insertEvent.bind(dal);
    vi.spyOn(dal, 'insertEvent').mockImplementation((...args) => {
      if (args[2] === 'result') throw new Error('injected terminal write failure');
      return insert(...args);
    });
    expect(sessions.start(dal, 'C:/ws', 'failed commit').ok).toBe(true);
    const result = await sessions.running(sid);
    expect(result).toMatchObject({ status: 'error', execution_status: 'unknown', persistence: { confirmed: false } });
    expect(events(sid)).not.toContain('session.end');
    expect(events(sid)).not.toContain('result');
    expect(delivered).not.toContain('session.end');
    expect(delivered).not.toContain('result');
    expect(sessions.bus.consumers(sid)).toBe(0);
    expect(dal.getLock(sid)).toBeUndefined();
    expect(warnings.some((w) => w.includes('injected terminal write failure'))).toBe(true);
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
    // PD-ORCH-005 clauses 2 and 3: the stop cut the root mid-step, so the iteration is left open — no `iteration.end` —
    // with the stop recorded, and the root execution record is paused rather than cancelled.
    expect(events(sid)).not.toContain('iteration.end');
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'stop' }]);
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
    // Part Q: the issue is a recorded diagnostics row naming the attempt and the limit (REQ-NOTIFY-096), not only a warning line.
    const issue = dal.issuesOf(sid).find((i) => i.kind === 'transient_llm_error');
    expect(issue).toBeDefined();
    expect(JSON.parse(issue!.metadata)).toMatchObject({ attempt: 1, limit: 1, delay_seconds: 1 });
    expect(warnings.some((w) => w.includes('Transient model failure'))).toBe(true);
  });

  it('OQ-8 / REQ-EVENTS-053: one usage.update per completed provider request — a retried failure\'s reported usage is counted, identical totals are skipped, and session.end carries the final totals', async () => {
    // A transient failure that reported its usage before failing, then the retry that succeeded.
    const failedWithUsage: ScriptedCall = { parts: [{ part: { kind: 'usage', usage: { input: 11, output: 3 } } }, { error: modelError({ code: 'http', status: 503, headline: 'overloaded' }) }] };
    const { client, backend } = scripted([failedWithUsage, answer('second time lucky', { input: 20, output: 6 })]);
    const { sessions } = sessionsWith(backend);
    const sid = (sessions.start(dal, 'C:/ws', 'retry') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    clock.advance(1_000);
    const result = await sessions.running(sid)!;
    expect(client.requests.length).toBe(2);
    expect(result.status).toBe('completed');
    // Two requests completed, each contributing new usage: two events, cumulative, the newest superseding.
    const updates = dal.eventsOfKind(sid, 'usage.update').map((e) => JSON.parse(e.payload) as { tokens: { input: number; output: number; total: number } });
    expect(updates.map((u) => u.tokens)).toEqual([
      { input: 11, output: 3, total: 14 },
      { input: 31, output: 9, total: 40 },
    ]);
    // The spent tokens of the discarded attempt are in the session's own totals and in the terminal event.
    expect(dal.getSession(sid)).toMatchObject({ tokens_input: 31, tokens_output: 9 });
    expect(payload(sid, 'session.end')).toMatchObject({ tokens: { input: 31, output: 9, total: 40 } });
    expect(result.tokens).toEqual({ input: 31, output: 9, total: 40 });
  });

  it('PD-MONITOR-001: a cost the provider reported for each request is summed exactly and reaches the session, the event and the label', async () => {
    // Two completed requests, each answering with its own cost — the figures a rate would have had to be
    // multiplied for, stated by the provider instead (OQ-62's second branch, ruled rather than waited on).
    // The first request failed after reporting its figures and the ladder retried past it: the provider
    // charged for it, so its cost is counted exactly as REQ-EVENTS-053 counts its tokens.
    const failedWithCost: ScriptedCall = { parts: [{ part: { kind: 'usage', usage: { input: 10, output: 5, cost: '0.0012' } } }, { error: modelError({ code: 'http', status: 503, headline: 'overloaded' }) }] };
    const { backend } = scripted([failedWithCost, answer('priced', { input: 20, output: 6, cost: '0.00034' })]);
    const { sessions } = sessionsWith(backend);
    const sid = (sessions.start(dal, 'C:/ws', 'priced') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 5));
    clock.advance(1_000);
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const updates = dal.eventsOfKind(sid, 'usage.update').map((e) => (JSON.parse(e.payload) as { cost: { total: string } }).cost.total);
    // Exact decimal addition at the wider scale: a double would have made the second figure 0.00154000000000000002.
    expect(updates).toEqual(['0.0012', '0.00154']);
    expect(dal.getSession(sid)).toMatchObject({ cost: '0.00154' });
    expect(payload(sid, 'session.end')).toMatchObject({ cost: { total: '0.00154' } });
    // REQ-MONITOR-166's fourth qualifier, recorded with the total, and REQ-PROVIDER-121's four places below one hundredth.
    expect(dal.getSession(sid)).toMatchObject({ cost_qualifier: 'reported' });
    expect(toSessionRecord(dal.getSession(sid)!).costLabel).toEqual({ text: '0.0015 reported by the provider', qualifier: 'reported' });
  });

  it('OQ-8 / REQ-EVENTS-053: a request that reports no figures moves no total and raises no event', async () => {
    const { backend } = scripted([answer('nothing to report', { input: 0, output: 0 })]);
    const { sessions } = sessionsWith(backend);
    const sid = (sessions.start(dal, 'C:/ws', 'silent') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(dal.eventsOfKind(sid, 'usage.update')).toEqual([]);
    expect(events(sid)).not.toContain('usage.update');
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

  it('A3 / REQ-SESSION-094 / REQ-EVENTS-098: the lock is still held when both terminal events are delivered, and released only after the sink is detached', async () => {
    const { backend } = scripted([answer('done')]);
    const { sessions } = sessionsWith(backend);
    const sid = asSessionId('S1');
    const heldAt: { event: string; lock: boolean }[] = [];
    // A blocking consumer observes each event at the moment it is delivered, which is while teardown is mid-pipeline.
    (sessions as unknown as { bus: { attach: (id: SessionId, c: { mode: 'blocking'; deliver: (e: { event: string }) => void }) => void } })
      .bus.attach(sid, { mode: 'blocking', deliver: (e) => { heldAt.push({ event: e.event, lock: dal.getLock(sid) !== undefined }); } });
    const started = sessions.start(dal, 'C:/ws', 'terminal');
    if (!started.ok) throw new Error('start');
    await sessions.running(sid);
    /**
     * REQ-EVENTS-098 makes the right to write a session's history exactly the right to hold its lock, and A3
     * settled that the lock is therefore held THROUGH terminal persistence and both final events rather than
     * released before them. Every delivered event, the terminal pair included, sees the lock held.
     */
    expect(heldAt.map((h) => h.event).slice(-2)).toEqual(['session.end', 'result']);
    expect(heldAt.every((h) => h.lock)).toBe(true);
    // Guaranteed cleanup runs after the pipeline: the lock is gone once the run has ended.
    expect(dal.getLock(sid)).toBeUndefined();
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

  it('OQ-42: quarantines sibling runs, refuses admission and probes explicit reopen recovery', async () => {
    let entered = 0;
    const backend: AgentBackend = { ownsTheLoop: false, runTurn: (_i, _s, signal) => new Promise<TurnReport>((resolve) => {
      entered += 1;
      signal.addEventListener('abort', () => resolve({ status: 'failed', text: '', usage: { input: 0, output: 0 }, error: modelError({ code: 'aborted', headline: 'aborted', transient: false }) }), { once: true });
    }) };
    const notices: RunNotice[] = [];
    const { sessions } = sessionsWith(backend, {}, { notice: (n) => notices.push(n) });
    const a = (sessions.start(dal, 'C:/ws', 'a') as { value: SessionId }).value;
    const b = (sessions.start(dal, 'C:/ws', 'b') as { value: SessionId }).value;
    await vi.waitFor(() => expect(entered).toBe(2));
    const boundaryA = events(a).length;
    const boundaryB = events(b).length;
    const insert = vi.spyOn(dal, 'insertEvent').mockImplementationOnce(() => { throw new Error('injected full disk'); });
    expect(sessions.writer(a)!.recordEvent('error', { message: 'failure probe' }).ok).toBe(false);
    insert.mockRestore();
    expect(sessions.run(a)!.stop.requested).toBe(true);
    expect(sessions.run(b)!.stop.requested).toBe(true);
    expect(sessions.start(dal, 'C:/ws', 'blocked')).toMatchObject({ ok: false, error: { code: 'store-failed' } });
    expect(sessions.resume(dal, 'C:/ws', a)).toMatchObject({ ok: false, error: { code: 'store' } });
    const outcomes = await Promise.all([sessions.running(a), sessions.running(b)]);
    // REQ-EVENTS-088: the caller's outcome discloses the uncertainty structurally — the ordinal is readable, not a sentence.
    for (const outcome of outcomes) expect(outcome).toMatchObject({ status: 'error', execution_status: 'unknown', persistence: { confirmed: false } });
    for (const outcome of outcomes) expect(typeof outcome!.persistence!.last_event_ordinal).toBe('number');
    /**
     * REQ-EVENTS-088 / OQ-42: exactly one failure notification per AFFECTED run — two runs, two notices, never
     * one per failed write — each naming its own session, its own last durable ordinal, and the recovery action
     * that reopens that session. The key is per session for the same reason.
     */
    const failures = notices.filter((n) => n.headline === 'Run recording failed; completion is unconfirmed');
    expect(failures.map((n) => n.sessionId).sort()).toEqual([a, b].sort());
    for (const n of failures) {
      expect(n).toMatchObject({ severity: 'error', action: 'session.reopen', key: `recording-failure:${n.sessionId}` });
      expect(n.detail).toContain('Last durable event ordinal:');
      expect(n.detail).toContain('reopen the session');
    }
    expect(events(a).length).toBe(boundaryA);
    expect(events(b).length).toBe(boundaryB);
    expect(sessions.prompt(a, 'blocked')).toMatchObject({ ok: false, error: { code: 'store-failed' } });
    const probe = vi.spyOn(dal.db, 'exec').mockImplementationOnce(() => { throw new Error('still full'); });
    expect(sessions.resume(dal, 'C:/ws', a)).toMatchObject({ ok: false, error: { code: 'store' } });
    probe.mockRestore();
    expect(SessionWriter.storeFailure(dal)).toContain('injected full disk');
    expect(sessions.resume(dal, 'C:/ws', a).ok).toBe(true);
    expect(SessionWriter.storeFailure(dal)).toBeUndefined();
    expect(sessions.writer(a)!.failed).toBeNull();
    expect(events(a).length).toBe(boundaryA);
    expect(dal.db.prepare("SELECT name FROM sqlite_master WHERE name = '__probe'").get()).toBeUndefined();
    expect(sessions.start(dal, 'C:/ws', 'recovered').ok).toBe(true);
    await sessions.closeAll();
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

/**
 * PD-ORCH-005 clause 18 (item D, round 2 of its review): the Continue action and its decline are offered to a session a
 * crash left — one persisted busy that no process runs (`not-live`). A session the store's failure left busy in THIS
 * process reads the same (OQ-42), but it did not crash and nothing can be recorded of it: every continue is refused
 * `store-failed`, as the continue by message is, until the reopen rebuilds the writer (OQ-76). The guard stands first,
 * so a `paused` session under a store failure is refused the same way.
 */
describe('PD-ORCH-005 clause 18: a session under a store failure is refused every continue', () => {
  let dir: string;
  let dal: StoreDal;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-run-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  it('the Continue action, the decline and the continue by message are each refused store-failed, and record nothing', async () => {
    let entered = 0;
    const backend: AgentBackend = { ownsTheLoop: false, runTurn: (_i, _s, signal) => new Promise<TurnReport>((resolve) => {
      entered += 1;
      signal.addEventListener('abort', () => resolve({ status: 'failed', text: '', usage: { input: 0, output: 0 }, error: modelError({ code: 'aborted', headline: 'aborted', transient: false }) }), { once: true });
    }) };
    const sessions = new Sessions({
      clocks: new FakeClock(), publisher: recorder(), pid: 77, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S1',
      model: { backend, config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' } }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
    });
    const sid = (sessions.start(dal, 'C:/ws', 'a') as { value: SessionId }).value;
    await vi.waitFor(() => expect(entered).toBe(1));
    const insert = vi.spyOn(dal, 'insertEvent').mockImplementationOnce(() => { throw new Error('injected full disk'); });
    expect(sessions.writer(sid)!.recordEvent('error', { message: 'failure probe' }).ok).toBe(false);
    insert.mockRestore();
    await sessions.running(sid);
    // What the composer reads as a crash left it: still busy, with no process running it.
    expect(dal.getSession(sid)!.execution_status).toBe('running');
    expect(sessions.liveness(dal, sid)).toBe('not-live');
    const boundary = dal.eventsFrom(sid, 1, 10_000).length;
    expect(sessions.continueSession(sid, 'continue')).toMatchObject({ ok: false, error: { code: 'store-failed' } });
    expect(sessions.continueSession(sid, 'continue', { withoutPaused: true })).toMatchObject({ ok: false, error: { code: 'store-failed' } });
    expect(sessions.prompt(sid, 'blocked')).toMatchObject({ ok: false, error: { code: 'store-failed' } });
    expect(sessions.run(sid)!.isEnded).toBe(true);
    expect(dal.getSession(sid)!.execution_status).toBe('running');
    expect(dal.eventsFrom(sid, 1, 10_000).length).toBe(boundary);
    await sessions.closeAll();
  });

  it('a paused session under a store failure is refused the Continue action and the decline too, and nothing is recorded (OQ-76)', async () => {
    const backend = new DefaultAgentBackend(new ScriptedModelClient(Array.from({ length: 4 }, (_, n) => answer(`answer ${n + 1}`, { input: 5, output: 2 }))));
    const sessions = new Sessions({
      clocks: new FakeClock(), publisher: recorder(), pid: 77, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S1',
      model: { backend, config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' } }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
    });
    const sid = (sessions.start(dal, 'C:/ws', 'a') as { value: SessionId }).value;
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    await sessions.running(sid);
    expect(dal.getSession(sid)!.execution_status).toBe('paused');
    // The store fails after the rest: the guard stands first, so the ordinary paused continue is refused as well.
    const insert = vi.spyOn(dal, 'insertEvent').mockImplementationOnce(() => { throw new Error('injected full disk'); });
    expect(sessions.writer(sid)!.recordEvent('error', { message: 'failure probe' }).ok).toBe(false);
    insert.mockRestore();
    const boundary = dal.eventsFrom(sid, 1, 10_000).length;
    expect(sessions.continueSession(sid, 'continue')).toMatchObject({ ok: false, error: { code: 'store-failed' } });
    expect(sessions.continueSession(sid, 'continue', { withoutPaused: true })).toMatchObject({ ok: false, error: { code: 'store-failed' } });
    expect(sessions.run(sid)!.isEnded).toBe(true);
    expect(dal.getSession(sid)!.execution_status).toBe('paused');
    expect(dal.eventsFrom(sid, 1, 10_000).length).toBe(boundary);
    await sessions.closeAll();
  });
});
