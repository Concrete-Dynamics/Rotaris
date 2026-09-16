import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import type { IntentCategory } from '@rotaris/contracts';
import { answer, DefaultAgentBackend, ScriptedModelClient, type AgentBackend, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type Preflight, type RunConfig, type RuntimePosture } from '../index.js';

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

  function sessionsWith(backend: AgentBackend, opts: { mode?: 'auto' | 'plan'; intent?: IntentCategory } = {}) {
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
      ...(opts.intent ? { preflight: async () => preflightOf(opts.intent!) } : {}),
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

  it('a fresh user prompt is the next run, which the mode governs again (REQ-ORCH-154)', async () => {
    const sessions = sessionsWith(scripted([answer('a plan'), answer('carried out'), answer('a second plan'), answer('spare'), answer('spare')]).backend);
    const sid = (sessions.start(dal, 'C:/ws', 'change the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    sessions.planDecision(sid, 'approve');
    await sessions.running(sid)!;
    expect(dal.getSession(sid)!.plan_released).toBe(1);
    // The next prompt clears the release, so the gate holds again.
    expect(sessions.prompt(sid, 'and now the other thing').ok).toBe(true);
    await sessions.running(sid)!;
    const row = dal.getSession(sid)!;
    expect(row.plan_released).toBe(0);
    expect(row.execution_status).toBe('awaiting_plan_decision');
    expect(row.plan_cycle).toBe(2);
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
