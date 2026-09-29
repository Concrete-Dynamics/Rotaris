import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import type { IntentCategory } from '@rotaris/contracts';
import { answer, DefaultAgentBackend, modelError, ScriptedModelClient, toolCalls, type AgentBackend, type ScriptedCall } from '@rotaris/model';
import { SUPERVISOR_DEFAULTS, type LoopClassifier } from './supervisor.js';
import { RUN_CONFIG_DEFAULTS, Sessions, type Preflight, type RunConfig, type RuntimePosture, type ToolPort } from '../index.js';

/**
 * REQ-ORCH-152/153/154 (ADR-0062): the plan gate end to end through the session manager — the park, what it
 * records, what survives it, the answer group's exemption, and approval's one-way release.
 */
const HOST = mintMachineId('0000000000000000000000000000000b') as MachineId;
const MODEL = { providerId: 'scripted', modelId: 'm', dialect: 'chat' as const };

describe('the plan gate (REQ-ORCH-152/153/154, ADR-0062)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-plan-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const config = (over: Partial<RunConfig> = {}): RunConfig => ({ ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k', ...over });
  const recorder = () => ({ increment: () => undefined, snapshot: () => undefined });

  /** A pre-flight that answers one category and nothing else; the run reads only the intent for the gate's test. */
  const preflightOf = (category: IntentCategory): Preflight => ({
    intent: { category, confidence: 1, reason: 'fixed by the test', fallback: false, carried_over: false },
    grant: 'none', route: category === 'question' || category === 'exploration' ? 'answer' : 'work',
    resolvedPlaybooks: {}, playbookFor: () => '', budgetCell: null, warnings: [],
  });

  function scripted(calls: ScriptedCall[]) {
    const client = new ScriptedModelClient(calls);
    return { client, backend: new DefaultAgentBackend(client) as AgentBackend };
  }

  /** A one-tool port, so a turn can take several steps — which is what it takes for a loop to exist at all. */
  const grepPort = (): ToolPort => ({
    specs: () => [{ name: 'grep', description: 'search', parameters: { type: 'object' } }],
    dispatch: async () => ({ text: 'packages/a/yarn.lock:1: yaml@2.4.5', isError: false, status: 'ok', durationMs: 1, label: 'grep', args: {} }),
    cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
  });

  function sessionsWith(backend: AgentBackend, opts: { mode?: 'auto' | 'plan'; intent?: IntentCategory; classifier?: LoopClassifier; grep?: boolean; preflightHold?: Promise<void> | (() => Promise<void>); tools?: ToolPort } = {}) {
    const runtime: RuntimePosture = {
      permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' },
      sessionLogLevel: 'WARNING', runStartMode: opts.mode ?? 'plan',
    };
    let n = 0;
    const sessions = new Sessions({
      clocks: clock, publisher: recorder(), pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m),
      mintSessionId: () => `S${++n}`, model: { backend, config: config() }, runtime,
      sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      // The registry predicate the run host injects; here just enough to exercise the child-admission refusal.
      planWithholds: (tool) => ['write_file', 'terminal', 'haet', 'haet_edit', 'git_commit'].includes(tool),
      ...(opts.intent ? { preflight: async () => { await (typeof opts.preflightHold === 'function' ? opts.preflightHold() : opts.preflightHold); return preflightOf(opts.intent!); } } : {}),
      // PD-ORCH-001: supervision is only constructed when this dependency answers, which is how the directive's
      // "no supervisor is attached" is observable at all — a run without it looks the same from the outside.
      ...(opts.classifier ? { supervisor: () => ({ config: { ...SUPERVISOR_DEFAULTS, repetitionThreshold: 3 }, classifier: opts.classifier! }), tools: () => grepPort() } : opts.grep ? { tools: () => grepPort() } : {}),
      ...(opts.tools ? { tools: () => opts.tools! } : {}),
    });
    return sessions;
  }

  it('parks at the gate: one turn, the plan verbatim, the status and the cycle durable, and no terminal result', async () => {
    const plan = 'Step 1: read the file.\nStep 2: change it.';
    const sessions = sessionsWith(scripted([answer(plan)]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;

    // REQ-ORCH-153: not a termination. No `result` event is presented and the stop reason claims nothing.
    expect(result.execution_status).toBe('awaiting_plan_decision');
    expect(result.stop_reason).toBe('');
    expect(dal.eventsOfKind(sid, 'result')).toEqual([]);
    expect(dal.eventsOfKind(sid, 'session.end')).toEqual([]);

    const row = dal.getSession(sid)!;
    expect(row.execution_status).toBe('awaiting_plan_decision');
    expect(row.plan_cycle).toBe(1);
    expect(row.plan_released).toBe(0);
    const cycle = dal.planCycle(sid, 1)!;
    // Verbatim: the text the role wrote, not summarised, truncated or re-rendered.
    expect(cycle.plan).toBe(plan);
    expect(cycle.edited).toBeNull();
    expect(cycle.decision).toBeNull();
    expect(cycle.intent).toBe('moderate_feature');
    expect(dal.timelineOf(sid).map((t) => t.name)).toContain('plan_gate_opened');
    // A plan cycle is not an iteration (the owner's ruling): nothing was judged complete and no iteration closed.
    expect(row.iterations_completed).toBe(0);
    expect(dal.eventsOfKind(sid, 'iteration.start')).toEqual([]);
  });

  it('PD-ORCH-005 clause 11: while the plan gate holds no agent is unfinished — a pause is refused during the plan cycle and at the gate', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const sessions = sessionsWith(scripted([{ parts: [{ hold }, ...answer('Step 1: do it.').parts] }]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.run(sid)!.isPlanGateHeld).toBe(true);
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: false });
    expect(dal.timelineOf(sid).map((t) => t.name)).not.toContain('run_pause_requested');
    release();
    const result = await sessions.running(sid)!;
    expect(result.execution_status).toBe('awaiting_plan_decision');
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: false });
  });

  it('REQ-MONITOR-133 with OQ-127 (found by the third review of the repair of a-steering-prompt-pending-at-a-rest-is-lost): once the plan cycle\'s turn has returned a steer is refused while the park is still forwarded, not acknowledged for a step no agent of the held run takes', async () => {
    let release!: () => void;
    const parkHold = new Promise<void>((r) => { release = r; });
    let parking = false;
    const sessions = sessionsWith(scripted([answer('Step 1: do it.')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    // REQ-EVENTS-165: the park's drain waits on this consumer once the gate is recorded, before the run has ended.
    sessions.bus.attach(sid, { mode: 'blocking', deliver: () => { if (dal.timelineOf(sid).some((t) => t.name === 'plan_gate_opened')) { parking = true; return parkHold; } return undefined; } });
    await vi.waitFor(() => { expect(parking).toBe(true); });
    expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: 'run', text: 'mind the tests' } })).toEqual({ ok: false });
    release();
    expect((await sessions.running(sid)!).execution_status).toBe('awaiting_plan_decision');
    expect(dal.timelineOf(sid).filter((t) => t.name.startsWith('steering_'))).toEqual([]);
  });

  /*
   * Found by the fourth review of the same repair: the park's close sat before the two branches that end the run instead
   * of parking it, so a steer pending when the plan cycle was stopped, quit, or ended by its failed turn was recorded as
   * not delivered because "the run was held at the plan gate" — a gate that never opened. Only the park names the gate; an
   * end that takes teardown is recorded by teardown's own close, as the run ending.
   */
  for (const how of ['stopped', 'quit', 'failed'] as const) it(`REQ-MONITOR-134 with OQ-127: a steer pending when the plan cycle's turn is ${how === 'failed' ? 'ended by a failed model step' : `${how} while its call runs`} is recorded as not delivered because the run ended, never as held at a plan gate that did not open`, async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    let calling = false;
    const port: ToolPort = {
      specs: () => [{ name: 'glob', description: 'find', parameters: { type: 'object' } }],
      // The plan turn's call, held until the test lets it return.
      dispatch: async () => { calling = true; await hold; return { text: 'a.ts', isError: false, status: 'ok', durationMs: 1, label: 'glob', args: {} }; },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    };
    const { client, backend } = scripted(how === 'failed'
      ? [{ parts: [{ hold }, { error: modelError({ code: 'http', status: 401, headline: 'unauthorised', providerMessage: 'bad key' }) }] }]
      : [toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('Step 1: the plan.')]);
    const sessions = sessionsWith(backend, { tools: port });
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await vi.waitFor(() => { expect(how === 'failed' ? client.requests.length > 0 : calling).toBe(true); });
    expect(sessions.run(sid)!.isPlanGateHeld).toBe(true);
    const steered = sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: 'run', text: 'mind the tests' } });
    expect(steered.ok).toBe(true);
    let closed: Promise<void> | null = null;
    if (how === 'stopped') expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
    else if (how === 'quit') closed = sessions.closeAll();
    release();
    expect((await sessions.running(sid)!).execution_status).not.toBe('awaiting_plan_decision');
    await closed;
    const timeline = dal.timelineOf(sid);
    expect(timeline.map((t) => t.name)).not.toContain('plan_gate_opened');
    const steering = timeline.filter((t) => t.name.startsWith('steering_'));
    expect(steering.map((t) => t.name)).toEqual(['steering_submitted', 'steering_not_delivered']);
    const line = steering[1]!.message;
    expect(line).not.toMatch(/plan gate/);
    expect(line).toMatch(/was not delivered: the run ended before /);
    expect(dal.residentRows(sid).filter((r) => r.kind === 'system').map((r) => r.body)).toContain(line);
  });

  it('PD-ORCH-003 revision 2: a continue that resumes an open iteration runs it without holding, and with no new work after it no plan cycle opens', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    // The execution segment's step is in flight when the pause is accepted; the call it asks for is never run, so the root is mid-turn.
    const sessions = sessionsWith(scripted([answer('Step 1: do it.'), { parts: [{ hold }, ...toolCalls([{ callId: 'g1', name: 'grep', args: { pattern: 'x' } }]).parts] }, answer('resumed and done')]).backend, { grep: true });
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(sessions.planDecision(sid, 'approve').ok).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'pause' }]);
    // Re-armed, a fresh prompt would be held; this one resumes the open iteration instead, and — its message done with
    // the iteration (PD-ORCH-005 clause 17) and the approve having appended no second task — no new iteration, so no cycle.
    expect(sessions.planRearm(sid).ok).toBe(true);
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    const result = await sessions.running(sid)!;
    expect(result.execution_status).toBe('completed');
    expect(dal.getSession(sid)!.plan_cycle).toBeNull();
    expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed', outcome: 'succeeded', interruption: null });
    expect(dal.timelineOf(sid).filter((t) => t.name === 'plan_gate_opened')).toHaveLength(1);
  });

  it('PD-ORCH-005 clause 11 (found by phase 3\'s review): a pause accepted before the hold is settled is refused once it is — the plan cycle runs and parks', async () => {
    let release!: () => void;
    const preflightHold = new Promise<void>((r) => { release = r; });
    const sessions = sessionsWith(scripted([answer('Step 1: do it.')]).backend, { intent: 'moderate_feature', preflightHold });
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    // The hold is not settled until the pre-flight answers, so the pause is accepted…
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    // …and refused once the hold is known: the plan cycle is produced and parks, as it would have without it.
    const result = await sessions.running(sid)!;
    expect(result.execution_status).toBe('awaiting_plan_decision');
    expect(dal.planCycle(sid, 1)!.plan).toBe('Step 1: do it.');
    expect(dal.timelineOf(sid).map((t) => t.name)).toContain('run_pause_refused');
  });

  it('PD-ORCH-005 clause 2 (found by phase 3\'s second review): a deadline that passed before the refusal cuts no plan-cycle call', async () => {
    let release!: () => void;
    const preflightHold = new Promise<void>((r) => { release = r; });
    let cut: boolean | null = null;
    const tools: ToolPort = { ...grepPort(), dispatch: async (_c, signal) => { cut = signal.aborted; return { text: 'found', isError: false, status: 'ok', durationMs: 1, label: 'grep', args: {} }; } };
    const sessions = sessionsWith(scripted([toolCalls([{ callId: 'g1', name: 'grep', args: {} }], 'Reading first.'), answer('Step 1: do it.')]).backend, { intent: 'moderate_feature', preflightHold, tools });
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    // A slow pre-flight: the pause's deadline passes before the hold is known.
    clock.advance(30_000);
    release();
    const result = await sessions.running(sid)!;
    expect(cut).toBe(false);
    expect(result.execution_status).toBe('awaiting_plan_decision');
    expect(dal.planCycle(sid, 1)!.plan).toBe('Step 1: do it.');
  });

  it('PD-ORCH-005 clause 2: the refused pause\'s tool deadline goes with it — a plan-cycle call past 30 s is not cut', async () => {
    let release!: () => void;
    const preflightHold = new Promise<void>((r) => { release = r; });
    let finish!: () => void;
    const finishing = new Promise<void>((r) => { finish = r; });
    let cut: boolean | null = null;
    const tools: ToolPort = { ...grepPort(), dispatch: async (_c, signal) => { await finishing; cut = signal.aborted; return { text: 'found', isError: false, status: 'ok', durationMs: 1, label: 'grep', args: {} }; } };
    const sessions = sessionsWith(scripted([toolCalls([{ callId: 'g1', name: 'grep', args: {} }]), answer('Step 1: do it.')]).backend, { intent: 'moderate_feature', preflightHold, tools });
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    for (let i = 0; i < 100 && !dal.residentRows(sid).some((r) => r.kind === 'tool'); i++) await new Promise((r) => setTimeout(r, 5));
    clock.advance(30_000);
    finish();
    const result = await sessions.running(sid)!;
    expect(cut).toBe(false);
    expect(result.execution_status).toBe('awaiting_plan_decision');
  });

  /*
   * Phase 3's third review had this cancel leave the iteration to the next continue: then every continue declined an
   * open iteration at its first iteration, so the iteration was not yet the continue's. Once a continue resumes it
   * before anything else, the continue holds it from its start, and leaving it open would have the next Continue resume
   * what the user cancelled (found by phase 4's review).
   */
  for (const route of ['a message, which resumes it', '"continue without them", which declines it'] as const) it(`PD-ORCH-005 clause 3 (found by phase 4's review): an explicit cancel before a continue by ${route} has taken up the iteration an earlier rest left open closes it — the continue already held it`, async () => {
    let finish!: () => void;
    const finishing = new Promise<void>((r) => { finish = r; });
    const tools: ToolPort = { ...grepPort(), dispatch: async () => { await finishing; return { text: 'found', isError: false, status: 'ok', durationMs: 1, label: 'grep', args: {} }; } };
    let next: Promise<void> = Promise.resolve();
    const sessions = sessionsWith(scripted([toolCalls([{ callId: 'g1', name: 'grep', args: {} }]), answer('never')]).backend, { mode: 'auto', intent: 'moderate_feature', preflightHold: () => next, tools });
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    for (let i = 0; i < 100 && !dal.residentRows(sid).some((r) => r.kind === 'tool'); i++) await new Promise((r) => setTimeout(r, 5));
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    finish();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'pause' }]);
    // The continue's pre-flight is held; the user cancels the run before it takes the open iteration up.
    let release!: () => void;
    next = new Promise<void>((r) => { release = r; });
    expect((route === 'a message, which resumes it' ? sessions.prompt(sid, 'go on') : sessions.continueSession(sid, 'continue', { withoutPaused: true })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled' }]);
  });

  it('PD-ORCH-005 clause 11: a quit leaves the hold as it stands and records no interruption', async () => {
    const sessions = sessionsWith(scripted([answer('Step 1: do it.')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    const before = dal.getSession(sid)!;
    await sessions.closeAll();
    const after = dal.getSession(sid)!;
    expect(after).toMatchObject({ execution_status: 'awaiting_plan_decision', plan_cycle: before.plan_cycle, stop_reason: before.stop_reason });
    expect(dal.iterationsOf(sid)).toEqual([]);
    expect(dal.childrenOf(sid).filter((c) => c.interruption !== null)).toEqual([]);
  });

  it('the producing role is told what a plan cycle is: the task carries the request, and so does the content', async () => {
    /*
     * REQ-ORCH-153, found by building: the held run takes ONE turn, and on the first cycle its task is the
     * user's own prompt. Nothing in it said a plan was what was wanted, that the final message IS the plan, or
     * that approval is taken in the product — so the role tried to do the work, collected refusals and asked
     * for approval with a question tool. The preamble has to reach the model through the CONTENT parts, which
     * are what an initial turn actually sends (`Sessions.start` always builds them).
     */
    const s = scripted([answer('a plan')]);
    const sessions = sessionsWith(s.backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    const first = s.client.requests[0]!;
    const sent = first.messages.flatMap((m) => [...m.content] as { kind: string; text?: string }[]).map((c) => (c.kind === 'text' ? c.text ?? '' : '')).join('\n');
    expect(sent).toContain('held at the plan gate');
    expect(sent).toContain('Write the plan as the final message of this turn');
    expect(sent).toContain('Do not ask for approval in the conversation');
    // The user's own prompt still reaches the model, after the request and unaltered.
    expect(sent).toContain('change the thing');
    expect(sent.indexOf('held at the plan gate')).toBeLessThan(sent.indexOf('change the thing'));
  });

  it('the answer group is never held (REQ-ORCH-021): a question runs straight through in plan mode', async () => {
    const sessions = sessionsWith(scripted([answer('42.')]).backend, { mode: 'plan', intent: 'question' });
    const sid = (sessions.start(dal, 'C:/ws', 'what is it?') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.execution_status).not.toBe('awaiting_plan_decision');
    expect(dal.getSession(sid)!.plan_cycle).toBeNull();
    expect(dal.planCyclesOf(sid)).toEqual([]);
  });

  it('`auto` applies no gate at all (REQ-ORCH-152)', async () => {
    const sessions = sessionsWith(scripted([answer('done')]).backend, { mode: 'auto' });
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.execution_status).not.toBe('awaiting_plan_decision');
    expect(dal.planCyclesOf(sid)).toEqual([]);
  });

  it('editing alone never approves it (REQ-ORCH-154): the gate stays held on the same cycle', async () => {
    const sessions = sessionsWith(scripted([answer('a plan')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(sessions.planEdit(sid, 'my own plan')).toEqual({ ok: true, value: true });
    const row = dal.getSession(sid)!;
    expect(row.execution_status).toBe('awaiting_plan_decision');
    expect(row.plan_cycle).toBe(1);
    expect(row.plan_released).toBe(0);
    const cycle = dal.planCycle(sid, 1)!;
    expect(cycle.plan).toBe('a plan');
    expect(cycle.edited).toBe('my own plan');
    expect(cycle.decision).toBeNull();
  });

  /*
   * ADR-0005, REQ-SESSION-048/083 (the repair of `a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`,
   * R-067): a plan decision's relaunch is a continue, so it writes and runs under the session's lock — refused, with the
   * gate left as it stands, while another live process holds it, and claimed again when no process does.
   */
  it('REQ-SESSION-083: a plan decision refuses while another live process holds the lock, and a relaunch holds it for its run', async () => {
    const sessions = sessionsWith(scripted([answer('a plan'), answer('carried out')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.execution_status).toBe('awaiting_plan_decision');
    // Another process on this machine took the session after this one let it go.
    dal.releaseLock(sid, 77, HOST);
    dal.claimLock(sid, 902, HOST, '2026-09-04T00:00:00.000Z');
    const refused = sessions.planDecision(sid, 'approve');
    expect(refused).toMatchObject({ ok: false, error: { code: 'lock-held-local' } });
    expect(!refused.ok && refused.error.reason).toContain('pid 902');
    expect(dal.getSession(sid)).toMatchObject({ execution_status: 'awaiting_plan_decision', plan_cycle: 1, plan_released: 0 });
    expect(dal.planCycle(sid, 1)!.decision).toBeNull();
    // That process let it go: the decision claims the lock and its relaunch holds it until the run's teardown.
    dal.releaseLock(sid, 902, HOST);
    expect(sessions.planDecision(sid, 'approve')).toEqual({ ok: true, value: { relaunched: true, cycle: 1 } });
    expect(dal.getLock(sid)).toMatchObject({ pid: 77, host: HOST });
    await sessions.running(sid)!;
    expect(dal.getLock(sid)).toBeUndefined();
  });

  it('approve releases execution one way: the next segment does not hold, and the run carries the EDITED text', async () => {
    const sessions = sessionsWith(scripted([answer('a plan'), answer('carried out')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    sessions.planEdit(sid, 'my own plan');
    expect(sessions.planDecision(sid, 'approve')).toEqual({ ok: true, value: { relaunched: true, cycle: 1 } });
    const result = await sessions.running(sid)!;
    expect(result.execution_status).not.toBe('awaiting_plan_decision');
    const row = dal.getSession(sid)!;
    expect(row.plan_released).toBe(1);
    expect(row.plan_cycle).toBeNull();
    expect(dal.planCycle(sid, 1)).toMatchObject({ decision: 'approve' });
    // Only one cycle exists: a plan produced later in the same run must not block execution.
    expect(dal.planCyclesOf(sid)).toHaveLength(1);
    expect(dal.timelineOf(sid).map((t) => t.name)).toContain('plan_gate_resolved');
  });

  it('revise starts a further cycle with the plan as it stands and the changes stated; there is no limit on cycles', async () => {
    const sessions = sessionsWith(scripted([answer('plan one'), answer('plan two'), answer('plan three')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(sessions.planDecision(sid, 'revise', 'smaller steps')).toEqual({ ok: true, value: { relaunched: true, cycle: 1 } });
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.plan_cycle).toBe(2);
    expect(dal.planCycle(sid, 2)).toMatchObject({ plan: 'plan two', changes: 'smaller steps', decision: null });
    sessions.planDecision(sid, 'revise', 'smaller still');
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.plan_cycle).toBe(3);
    expect(dal.planCyclesOf(sid).map((c) => c.decision)).toEqual(['revise', 'revise', null]);
    expect(dal.getSession(sid)!.plan_released).toBe(0);
  });

  /**
   * A2 of run `a26918e8`'s autopsy. Every message the model reads has an author, and only one of the two
   * possible authors is a person. This section is delivered inside a `role: 'user'` payload and opened "The user
   * approved this plan" — the product narrating the user, in the user's own voice, which leaves the model to
   * work out for itself whether anyone just spoke to it. No requirement fixes the wording; `planRequestSection`
   * already names the product as the speaker and this now matches it.
   */
  const textOf = (r: { messages: readonly { content: readonly { kind: string; text?: string }[] }[] }): string =>
    r.messages.flatMap((m) => [...m.content]).map((c) => (c.kind === 'text' ? c.text ?? '' : '')).join('\n');

  it('the section an APPROVED cycle is handed back names the product as its speaker, not the user (REQ-ORCH-154)', async () => {
    const s = scripted([answer('a plan'), answer('carried out')]);
    const sessions = sessionsWith(s.backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    sessions.planDecision(sid, 'approve');
    await sessions.running(sid)!;
    const resumed = s.client.requests.map(textOf).find((t) => t.includes('plan gate has resolved'))!;
    expect(resumed).toContain('the user approved this plan in the product');
    expect(resumed).toContain('not the user speaking again');
    expect(resumed).not.toContain('The user approved this plan. Carry it out');
    // REQ-ORCH-154 is unchanged: the approved text is still carried back whole.
    expect(resumed).toContain('Approved plan:');
    expect(resumed).toContain('a plan');
  });

  it('the section a REVISED cycle is handed back names the product too, and still carries both halves (REQ-ORCH-154)', async () => {
    const s = scripted([answer('plan one'), answer('plan two')]);
    const sessions = sessionsWith(s.backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    sessions.planDecision(sid, 'revise', 'smaller steps');
    await sessions.running(sid)!;
    const again = s.client.requests.map(textOf).find((t) => t.includes('plan gate has resolved'))!;
    expect(again).toContain('the user chose revise in the product');
    expect(again).toContain('not the user speaking again');
    expect(again).not.toContain('The user asked for a revision of this plan.');
    expect(again).toContain('The plan as it currently stands:');
    expect(again).toContain('plan one');
    expect(again).toContain('smaller steps');
  });

  /**
   * PD-ORCH-001. A held run has every writing tool withheld, so the only work it can do is read and search —
   * and a plan for an unfamiliar codebase is written by doing that over the same region, which is
   * REQ-ORCH-101's first trigger firing on the gate's own side effect. Run `a26918e8` then read the
   * supervisor's `role: 'user'` injection as an instruction from the person it was waiting for and spent
   * 3 min 12 s reconciling it with what it remembered being asked.
   */
  it('PD-ORCH-001: supervision does not fire while the gate holds, and fires again once it has resolved', async () => {
    const circling = (): ScriptedCall => toolCalls([{ callId: 'g1', name: 'grep', args: { pattern: 'yaml', path: 'packages' } }]);
    let classifications = 0;
    const classifier: LoopClassifier = {
      classify: async () => { classifications += 1; return { loop_detected: true, reason: 'circling', corrective_message: 'Pause and reassess the grep call.' }; },
    };
    const s = scripted([
      circling(), circling(), circling(), circling(), answer('a plan'),
      circling(), circling(), circling(), circling(), answer('carried out'),
    ]);
    const sessions = sessionsWith(s.backend, { classifier });
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;

    // The held segment circled four times over the same call and nothing supervised it.
    expect(dal.getSession(sid)!.execution_status).toBe('awaiting_plan_decision');
    expect(classifications).toBe(0);
    expect(dal.timelineOf(sid).map((t) => t.name)).not.toContain('loop_supervisor_activation');

    sessions.planDecision(sid, 'approve');
    await sessions.running(sid)!;
    // Released, the same circling is supervised exactly as it always was.
    expect(classifications).toBeGreaterThan(0);
    expect(dal.timelineOf(sid).map((t) => t.name)).toContain('loop_supervisor_activation');
  });

  it('cancel stops the run with `user_cancelled` and launches nothing (REQ-ORCH-153)', async () => {
    const sessions = sessionsWith(scripted([answer('a plan')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(sessions.planDecision(sid, 'cancel')).toEqual({ ok: true, value: { relaunched: false, cycle: 1 } });
    const row = dal.getSession(sid)!;
    expect(row.execution_status).toBe('paused');
    expect(row.stop_reason).toBe('user_cancelled');
    expect(row.plan_cycle).toBeNull();
    expect(row.plan_released).toBe(0);
    expect(dal.planCycle(sid, 1)).toMatchObject({ decision: 'cancel' });
    /*
     * REQ-ORCH-082, rule 1: a cancel at the gate is a run that came to rest because a person stopped it, and it
     * is summarised by the one definition the product has. Before this, the three summary columns were written
     * only by `Run.teardown`, which a cancel at the gate never reaches — so the session read back with a NULL
     * outcome and no reader could say why it stopped.
     */
    expect(row.summary_status).toBe('paused');
    expect(row.summary_severity).toBe('warning');
    expect(row.summary_text).toBe("The run came to rest at the user's request.");
  });

  it('PD-ORCH-003: a follow-up prompt after an approval is NOT held — the release is the session\'s', async () => {
    const sessions = sessionsWith(scripted([answer('a plan'), answer('carried out'), answer('the follow-up, carried out'), answer('spare')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    sessions.planDecision(sid, 'approve');
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.plan_released).toBe(1);
    // The friction the directive was raised against: this used to open a second gate for a follow-up to a plan
    // the user had just approved. The mode is still `plan` and is deliberately not consulted.
    expect(sessions.prompt(sid, 'you missed the error case, add it').ok).toBe(true);
    await sessions.running(sid)!;
    const row = dal.getSession(sid)!;
    expect(row.plan_released).toBe(1);
    expect(row.execution_status).not.toBe('awaiting_plan_decision');
    expect(row.plan_cycle).toBeNull();
    // One cycle in the whole session, and it is the one that was approved.
    expect(dal.planCyclesOf(sid)).toHaveLength(1);
  });

  it('PD-ORCH-003: re-arming holds the next prompt again, and re-arming an armed session does nothing', async () => {
    const sessions = sessionsWith(scripted([answer('a plan'), answer('carried out'), answer('a second plan'), answer('spare')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    sessions.planDecision(sid, 'approve');
    await sessions.running(sid)!;
    // `true` says a release was dropped; the second call is a no-op that still succeeds, so a surface may send
    // it without reading the flag first.
    expect(sessions.planRearm(sid)).toEqual({ ok: true, value: true });
    expect(sessions.planRearm(sid)).toEqual({ ok: true, value: false });
    expect(dal.getSession(sid)!.plan_released).toBe(0);
    expect(sessions.prompt(sid, 'and now the other thing').ok).toBe(true);
    await sessions.running(sid)!;
    const row = dal.getSession(sid)!;
    expect(row.execution_status).toBe('awaiting_plan_decision');
    expect(row.plan_cycle).toBe(2);
  });

  it('PD-ORCH-003: a cancelled gate releases nothing, so the next prompt is held', async () => {
    const sessions = sessionsWith(scripted([answer('a plan'), answer('a second plan'), answer('spare')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    sessions.planDecision(sid, 'cancel');
    expect(dal.getSession(sid)!.plan_released).toBe(0);
    expect(sessions.prompt(sid, 'try again then').ok).toBe(true);
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.execution_status).toBe('awaiting_plan_decision');
  });

  it('an answer is refused when no gate is held, and a decided cycle takes no further edit', async () => {
    const sessions = sessionsWith(scripted([answer('a plan')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    sessions.planDecision(sid, 'cancel');
    const again = sessions.planDecision(sid, 'approve');
    expect(again.ok).toBe(false);
    expect(sessions.planEdit(sid, 'too late').ok).toBe(false);
  });

  /**
   * PD-ORCH-005 clause 15 (revision 4): "A stop or a quit during a plan cycle ends the cycle's agents and records no
   * interruption, and the plan gate keeps its hold (clause 11)." The quit at a PARKED gate is covered above; these reach
   * the cycle while its turn is still in flight, with a child it delegated still running (a role that withholds nothing
   * is admitted during a plan cycle, REQ-ORCH-153).
   */
  describe('PD-ORCH-005 clause 15: a stop or a quit during a plan cycle', () => {
    function planCycleWithChild() {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const client = new ScriptedModelClient([]);
      const original = client.stream.bind(client);
      const counts = new Map<string, number>();
      client.stream = (req) => {
        const first = req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '';
        const persona = /^You are the orchestrator/.test(first) ? 'orchestrator' : /summarise/i.test(first) ? 'summariser' : 'child';
        const n = (counts.get(persona) ?? 0) + 1;
        counts.set(persona, n);
        client.push(persona === 'orchestrator'
          ? (n === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('Step 1: the plan.'))
          : persona === 'summariser' ? answer('{}') : { parts: [{ hold }, ...answer('late').parts] });
        return original(req);
      };
      const base: Pick<ToolPort, 'cancelPending' | 'setMode' | 'currentMode' | 'answerApproval'> = { cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false };
      const runtime: RuntimePosture = { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', runStartMode: 'plan' };
      const sessions = new Sessions({
        clocks: clock, publisher: recorder(), pid: 77, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => 'S1',
        model: { backend: new DefaultAgentBackend(client), config: config() }, runtime, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
        planWithholds: () => false, attended: () => true,
        // The root's port delegates (its only tool); a child's offers nothing.
        tools: (ctx): ToolPort => {
          const ops = ctx.delegation;
          if (!ops) return { ...base, specs: () => [], dispatch: async () => ({ text: '', isError: true, status: 'failed', durationMs: 0, label: '', args: {} }) };
          return {
            ...base,
            specs: () => [{ name: 'delegate', description: 'delegate', parameters: { type: 'object' } }],
            dispatch: async (c) => {
              const a = JSON.parse(c.rawArgs) as Record<string, unknown>;
              const r = await ops.delegate(ctx.parentId ?? 'root', { persona: String(a['persona']), taskName: String(a['task_name']), task: String(a['task']), dependsOn: [], inheritedContext: [], category: '', runInBackground: true, writeScope: [] });
              return { text: `${r.status} ${r.message}`, isError: r.status === 'rejected', status: r.status === 'rejected' ? 'failed' : 'ok', durationMs: 1, label: 'delegate', args: a };
            },
          };
        },
      });
      return { sessions, release: () => release() };
    }

    for (const how of ['stop', 'quit'] as const) it(`a ${how} while the plan turn and its child are in flight ends the child, records no interruption and opens no iteration, and the next prompt is held at the gate again`, async () => {
      const { sessions, release } = planCycleWithChild();
      const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
      for (let i = 0; i < 100 && dal.childrenOf(sid).length === 0; i++) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 10));
      expect(sessions.run(sid)!.isPlanGateHeld).toBe(true);
      expect(dal.childrenOf(sid).map((c) => c.state)).toEqual(['running']);
      let closed: Promise<void> | null = null;
      if (how === 'stop') expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      else closed = sessions.closeAll();
      release();
      await sessions.running(sid);
      await closed;
      // The cycle's agent is ended as before — settled with its result — never left paused, and no interruption is named.
      expect(dal.childrenOf(sid).map((c) => [c.state, c.interruption, c.resume_state])).toEqual([['cancelled', null, null]]);
      const timeline = dal.timelineOf(sid).map((t) => t.name);
      expect(timeline).toContain('child_result');
      expect(timeline).not.toContain('child_paused');
      // A plan cycle is not an iteration: nothing is left open for a continue to resume.
      expect(dal.iterationsOf(sid)).toEqual([]);
      // The gate keeps its hold: nothing was released, so the next prompt is held again.
      expect(dal.getSession(sid)!.plan_released).toBe(0);
      if (how === 'quit') expect(sessions.resume(dal, 'C:/ws', sid).ok).toBe(true);
      expect(sessions.prompt(sid, 'try again').ok).toBe(true);
      await sessions.running(sid);
      expect(dal.getSession(sid)!).toMatchObject({ execution_status: 'awaiting_plan_decision', plan_released: 0 });
    });
  });

  /**
   * PD-ORCH-005 clause 15 (revision 4), last bullet: "an approval dialog the application's quit closes SHALL answer
   * nothing, and the quit withdraws the approval (clause 9)"; PD-CHAT-002 revision 2: a question the quit dismisses is
   * withdrawn, never cancelled. The directive decides this "in each case", a plan cycle among them: the cycle's agents end
   * and no interruption is recorded of them, but what waits on a person is withdrawn by the stop or the quit (OQ-108).
   * The explicit cancel is final (clause 3), and a stop the run raises itself (`agent_session_aborted`: a recording
   * failure, the headless abort hook, an escalation) is neither: both still cancel the wait (REQ-TOOLS-052).
   */
  describe('PD-ORCH-005 clause 15: a wait inside a plan cycle is withdrawn by the stop or the quit', () => {
    for (const how of ['stop', 'quit', 'cancel', 'raised'] as const) it(how === 'cancel'
      ? 'the explicit cancel while the plan turn waits on a person cancels the wait and withdraws nothing (clause 3: it is final)'
      : how === 'raised'
      ? 'a stop the run raises itself while the plan turn waits on a person cancels the wait and withdraws nothing (no one stopped it)'
      : `a ${how} while the plan turn waits on a person withdraws the wait by \`${how}\` and cancels nothing`, async () => {
      const released = { cancelled: 0, withdrawn: [] as string[] };
      let waiting = false;
      const port: ToolPort = {
        specs: () => [{ name: 'glob', description: 'find', parameters: { type: 'object' } }],
        // The call a person must answer: it waits until the run releases it.
        dispatch: async (_c, signal) => {
          waiting = true;
          await new Promise<void>((r) => signal.addEventListener('abort', () => r(), { once: true }));
          return { text: 'released', isError: true, status: 'failed', durationMs: 1, label: 'glob', args: {} };
        },
        cancelPending: () => { released.cancelled += 1; return 1; },
        withdrawPending: (cause) => { released.withdrawn.push(cause); return 1; },
        setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
      };
      const sessions = sessionsWith(scripted([toolCalls([{ callId: 'c1', name: 'glob', args: {} }]), answer('Step 1: the plan.')]).backend, { tools: port });
      const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
      for (let i = 0; i < 100 && !waiting; i++) await new Promise((r) => setTimeout(r, 5));
      expect(waiting).toBe(true);
      expect(sessions.run(sid)!.isPlanGateHeld).toBe(true);
      let closed: Promise<void> | null = null;
      if (how === 'stop') expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      else if (how === 'cancel') expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } })).toEqual({ ok: true });
      // What the tool context's `abortRun` does (the headless abort hook), and a recording failure's writer.onFailed.
      else if (how === 'raised') sessions.run(sid)!.stop.request('agent_session_aborted');
      else closed = sessions.closeAll();
      await sessions.running(sid);
      await closed;
      if (how === 'cancel' || how === 'raised') {
        expect(released.withdrawn).toEqual([]);
        expect(released.cancelled).toBeGreaterThan(0);
        return;
      }
      expect(released.withdrawn[0]).toBe(how);
      expect(released.cancelled).toBe(0);
      // Nothing of the cycle is recorded as interrupted: a plan cycle is not an iteration, and the gate keeps its hold.
      expect(dal.iterationsOf(sid)).toEqual([]);
      expect(dal.getSession(sid)!.plan_released).toBe(0);
    });
  });
});
