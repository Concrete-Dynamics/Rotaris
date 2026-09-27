import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import type { IntentCategory } from '@rotaris/contracts';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type AgentBackend, type ScriptedCall } from '@rotaris/model';
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

  function sessionsWith(backend: AgentBackend, opts: { mode?: 'auto' | 'plan'; intent?: IntentCategory; classifier?: LoopClassifier; preflightHold?: Promise<void> | (() => Promise<void>); tools?: ToolPort } = {}) {
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
      ...(opts.classifier ? { supervisor: () => ({ config: { ...SUPERVISOR_DEFAULTS, repetitionThreshold: 3 }, classifier: opts.classifier! }), tools: () => grepPort() } : {}),
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

  it('PD-ORCH-005 clause 3 (found by phase 3\'s third review): an explicit cancel before a continue has taken up the iteration an earlier rest left open leaves it to the next continue', async () => {
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
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'pause' }]);
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
    expect(row.summary_text).toBe('The run came to rest because a person stopped it.');
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
});
