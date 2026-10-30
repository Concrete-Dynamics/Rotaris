import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, type AgentBackend } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type ModelLookup, type RunNotice } from './index.js';
import { Run } from './run/run.js';

const HOST = mintMachineId('0000000000000000000000000000000c') as MachineId;
const MODEL = { providerId: 'test', modelId: 'test', dialect: 'chat' as const };

describe('the control channel (REQ-MONITOR-004/005/008, REQ-CHAT-035..041, REQ-MONITOR-123..125/133/134/142, REQ-ORCH-084..087, REQ-SESSION-110)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-control-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const many = (n: number) => new DefaultAgentBackend(new ScriptedModelClient(Array.from({ length: n }, (_, i) => answer(`answer ${i + 1}`, { input: 5, output: 2 }))));
  const makeSessions = (backend: AgentBackend, extras: { messageLimit?: number | null; onRunPaused?: (id: SessionId, info: { count: number; limit: number | null }) => void; notice?: (n: RunNotice) => void; models?: (key: string) => ModelLookup } = {}) => new Sessions({
    clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 4242, host: HOST,
    retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-control',
    model: { backend, config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => '' } },
    sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid),
    runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', messageLimit: extras.messageLimit ?? null },
    ...(extras.onRunPaused ? { onRunPaused: extras.onRunPaused } : {}),
    ...(extras.notice ? { notice: extras.notice } : {}),
    ...(extras.models ? { configure: (root, ctx) => { void root; void ctx; return { ok: true as const, value: { model: { backend, config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => '' } }, runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', messageLimit: extras.messageLimit ?? null }, models: extras.models! } }; } } : {}),
  });

  it('queues a prompt during a run, consumes it exactly once at the iteration boundary as a "Queued Prompts" task, and refuses edits after the trigger (REQ-CHAT-035/037/038/040)', async () => {
    const sessions = makeSessions(many(5));
    const started = sessions.start(dal, 'C:/ws', 'first task');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: '   ' } })).toEqual({ ok: false });
    const queued = sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'then do this' } });
    expect(queued.ok).toBe(true);
    const promptId = queued.ok ? queued.value! : '';
    expect(promptId).toHaveLength(36);
    expect(sessions.control({ op: 'editQueuedPrompt', sessionId: sid, args: { promptId, text: 'then do this instead' } })).toEqual({ ok: true });
    expect(sessions.control({ op: 'editQueuedPrompt', sessionId: sid, args: { promptId: 'nope', text: 'x' } })).toEqual({ ok: false });
    await sessions.running(sid);
    const row = dal.getSession(sid)!;
    expect(row.execution_status).toBe('completed');
    expect(row.iterations_completed).toBe(2);
    const prompts = dal.queuedPromptsOf(sid);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({ prompt_id: promptId, content: 'then do this instead', status: 'COMPLETED' });
    const todo = JSON.parse(row.todo!) as { phases: { name: string; tasks: { id: string; name?: string; text: string; state: string }[] }[] };
    expect(todo.phases.map((p) => p.name)).toEqual(['main', 'Queued Prompts']);
    // REQ-CHAT-040 / REQ-ORCH-071 (acceptance A28): the task is NAMED "Queued Prompt: <first 8 characters of the prompt id>"
    // and carries the prompt text as its content.
    expect(todo.phases[1]!.tasks[0]).toMatchObject({ name: `Queued Prompt: ${promptId.slice(0, 8)}`, text: 'then do this instead', state: 'complete' });
    // REQ-CHAT-089: its id is the backend's, 8 lowercase hexadecimal characters — never the prompt's own UUID.
    expect(todo.phases[1]!.tasks[0]!.id).toMatch(/^[0-9a-f]{8}$/);
    expect(dal.timelineOf(sid).map((t) => t.name)).toEqual(expect.arrayContaining(['prompt_queued', 'prompt_edited', 'prompt_triggered']));
    // A run that ended answers false; a triggered prompt cannot be edited or removed.
    expect(sessions.control({ op: 'removeQueuedPrompt', sessionId: sid, args: { promptId } })).toEqual({ ok: false });
  });

  /**
   * Part AB — REQ-CHAT-039's scoped half, and REQ-CHAT-038's exactly-once transition. The unscoped half is NOT
   * tested because it is not built: `queued_prompts.session_id` is NOT NULL and OQ-59 asks the owner whether an
   * unscoped prompt still exists after REQ-CHAT-041's 2026-09-07 amendment to "one session-scoped queue".
   */
  it('scopes a queued prompt by the session it was submitted to, keeps the ownership across edit and trigger, and refuses a snapshot naming another session (REQ-CHAT-038/039)', async () => {
    const sessions = makeSessions(many(5));
    const started = sessions.start(dal, 'C:/ws', 'first task');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    // The addressing IS the explicit session id; a snapshot agreeing with it is stored and changes nothing.
    const agreed = sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'scoped', context: { session_id: sid, note: 'from the composer' } } });
    expect(agreed.ok).toBe(true);
    // A snapshot naming ANOTHER session is refused rather than silently re-scoped or written under the wrong owner.
    expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'mis-scoped', context: { session_id: 'S-somewhere-else' } } })).toEqual({ ok: false });
    const promptId = agreed.ok ? agreed.value! : '';
    const afterCreate = dal.queuedPromptsOf(sid);
    expect(afterCreate).toHaveLength(1);
    expect(afterCreate[0]!.session_id).toBe(sid);
    expect(JSON.parse(afterCreate[0]!.context_snapshot!) as Record<string, unknown>).toEqual({ session_id: sid, note: 'from the composer' });
    // Ownership and the snapshot survive an edit …
    expect(sessions.control({ op: 'editQueuedPrompt', sessionId: sid, args: { promptId, text: 'scoped, edited' } })).toEqual({ ok: true });
    const afterEdit = dal.queuedPromptsOf(sid)[0]!;
    expect([afterEdit.session_id, afterEdit.content, afterEdit.context_snapshot]).toEqual([sid, 'scoped, edited', afterCreate[0]!.context_snapshot]);
    // A context snapshot is optional, and an unreadable one is no snapshot rather than an error (REQ-CHAT-038).
    const plain = sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'no snapshot', context: 'not json' } });
    expect(plain.ok).toBe(true);
    expect(dal.queuedPromptsOf(sid).find((p) => p.content === 'no snapshot')!.context_snapshot).toBeNull();
    // … and the trigger.
    await sessions.running(sid);
    const afterTrigger = dal.queuedPromptsOf(sid)[0]!;
    expect(afterTrigger.session_id).toBe(sid);
    expect(afterTrigger.status).toBe('COMPLETED');
    expect(afterTrigger.context_snapshot).toBe(afterCreate[0]!.context_snapshot);
  });

  it('moves QUEUED → TRIGGERED for exactly one of two callers racing the same prompt (REQ-CHAT-038)', () => {
    const sessions = makeSessions(many(2));
    const started = sessions.start(dal, 'C:/ws', 'first task');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    const queued = sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'consume me once' } });
    const promptId = queued.ok ? queued.value! : '';
    // Two callers attempting the same transition on the same prompt: the conditional UPDATE's row count is the
    // claim, so exactly one sees `true` and the other "observes that the prompt is no longer QUEUED".
    const claims = [dal.triggerQueuedPrompt(sid, promptId, 'T1'), dal.triggerQueuedPrompt(sid, promptId, 'T2')];
    expect(claims.filter(Boolean)).toHaveLength(1);
    const row = dal.queuedPromptsOf(sid)[0]!;
    expect([row.status, row.triggered_at]).toEqual(['TRIGGERED', 'T1']);
    // The loser left it alone: nothing was overwritten and the row is still owned by the same session.
    expect(row.session_id).toBe(sid);
    // A third caller is the same refusal, however many runs are eligible.
    expect(dal.triggerQueuedPrompt(sid, promptId, 'T3')).toBe(false);
  });

  it('a steer needs an agent id and text, returns its id, and reaches the conversation at its next step (REQ-MONITOR-005/008/133/134)', async () => {
    const sessions = makeSessions(many(3));
    const started = sessions.start(dal, 'C:/ws', 'steer me');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: '', text: 'go left' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: 'run', text: '' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: 'bg_deadbeef', text: 'go left' } })).toEqual({ ok: false });
    const steered = sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: 'run', text: 'go left' } });
    expect(steered.ok && steered.value?.length).toBe(36);
    await sessions.running(sid);
    const names = dal.timelineOf(sid).map((t) => t.name);
    expect(names).toContain('steering_submitted');
    expect(names).toContain('steering_injected');
    expect(names.indexOf('steering_injected')).toBeGreaterThan(names.indexOf('steering_submitted'));
  });

  it('pause is graceful and whole-run: pausing, then paused with the task pending; continue runs it to completion (REQ-MONITOR-123..125)', async () => {
    const sessions = makeSessions(many(4));
    const started = sessions.start(dal, 'C:/ws', 'pause me');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    expect(dal.getSession(sid)!.execution_status).toBe('pausing');
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: false });
    const result = await sessions.running(sid);
    expect(result?.status).toBe('interrupted');
    const paused = dal.getSession(sid)!;
    expect(paused.execution_status).toBe('paused');
    expect(dal.residentRows(sid).some((r) => r.kind === 'system' && r.body.includes("paused at the user's request"))).toBe(true);
    const todo = JSON.parse(paused.todo!) as { phases: { tasks: { state: string }[] }[] };
    expect(todo.phases[0]!.tasks[0]!.state).toBe('pending');
    // REQ-MONITOR-125: continued from the composer; nothing is appended and the same session runs on.
    const before = dal.residentRows(sid).filter((r) => r.kind === 'user').length;
    const c = sessions.continueSession(sid, 'continue');
    expect(c).toEqual({ ok: true, value: { resumed: true, messageLimit: null } });
    await sessions.running(sid);
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
    expect(dal.residentRows(sid).filter((r) => r.kind === 'user').length).toBe(before);
    expect(sessions.continueSession(sid, 'continue')).toMatchObject({ ok: false, error: { code: 'not-paused' } });
  });

  it('keeps a prompt queued for a paused session editable and removable at rest, and consumes the edit on the continue (REQ-CHAT-040, REQ-CHAT-037)', async () => {
    const sessions = makeSessions(many(6));
    const started = sessions.start(dal, 'C:/ws', 'first');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    const kept = sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'keep me' } });
    const dropped = sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'drop me' } });
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    await sessions.running(sid);
    expect(dal.getSession(sid)!.execution_status).toBe('paused');
    const keptId = kept.ok ? kept.value! : '';
    const droppedId = dropped.ok ? dropped.value! : '';
    expect(sessions.control({ op: 'editQueuedPrompt', sessionId: sid, args: { promptId: keptId, text: 'kept and edited' } })).toEqual({ ok: true });
    expect(sessions.control({ op: 'removeQueuedPrompt', sessionId: sid, args: { promptId: droppedId } })).toEqual({ ok: true });
    expect(dal.queuedPromptsOf(sid).map((p) => [p.content, p.status])).toEqual([['kept and edited', 'QUEUED']]);
    expect(dal.timelineOf(sid).map((t) => t.name)).toEqual(expect.arrayContaining(['prompt_edited', 'prompt_removed']));
    expect(sessions.continueSession(sid, 'continue')).toMatchObject({ ok: true });
    await sessions.running(sid);
    expect(dal.queuedPromptsOf(sid).map((p) => [p.content, p.status])).toEqual([['kept and edited', 'COMPLETED']]);
    expect(sessions.control({ op: 'editQueuedPrompt', sessionId: sid, args: { promptId: keptId, text: 'too late' } })).toEqual({ ok: false });
  });

  it('moves a queued prompt to COMPLETED only once its task has finished (REQ-CHAT-038)', async () => {
    const sessions = makeSessions(many(6));
    const started = sessions.start(dal, 'C:/ws', 'first');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    const seen: string[] = [];
    sessions.bus.attach(sid, { mode: 'blocking', deliver: (e) => { if (e.event === 'iteration.start') seen.push(dal.queuedPromptsOf(sid)[0]?.status ?? 'none'); return undefined; } });
    sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'later' } });
    await sessions.running(sid);
    expect(seen.at(-1)).toBe('TRIGGERED');
    expect(dal.queuedPromptsOf(sid)[0]).toMatchObject({ status: 'COMPLETED' });
  });

  it('a prompt the iteration limit left TRIGGERED runs on the next prompt to the session, and stays on its todo meanwhile (REQ-CHAT-040, REQ-ORCH-071)', async () => {
    const backend = many(8);
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 4242, host: HOST,
      retentionCap: 20_000, warn: () => undefined, mintSessionId: () => 'S-limit',
      model: { backend, config: { ...RUN_CONFIG_DEFAULTS, iterationLimit: 1, model: MODEL, credentialFor: () => async () => '' } },
      sessionFilesDir: (_store, sid) => join(dir, 'sessions', sid),
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', messageLimit: null },
    });
    const started = sessions.start(dal, 'C:/ws', 'first');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'later' } });
    await sessions.running(sid);
    expect(dal.getSession(sid)).toMatchObject({ execution_status: 'stopped', stop_reason: 'iteration_limit_reached', iterations_completed: 1 });
    const task = (): unknown => (JSON.parse(dal.getSession(sid)!.todo!) as { phases: { name: string; tasks: { state: string }[] }[] }).phases.find((p) => p.name === 'Queued Prompts')?.tasks[0]?.state;
    expect(task()).toBe('pending');
    const r = sessions.prompt(sid, 'and now this');
    expect(r.ok).toBe(true);
    await sessions.running(sid);
    expect(task()).toBe('complete');
    expect(dal.queuedPromptsOf(sid).map((p) => p.status)).toEqual(['COMPLETED']);
  });

  it('refuses a prompt queued once the run has stopped stepping, so none is left QUEUED under a completed run (REQ-CHAT-035, REQ-CHAT-040)', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    let reached = false;
    const settled = vi.spyOn(Run.prototype as unknown as { childCompletionsSettled(): Promise<void> }, 'childCompletionsSettled').mockImplementation(async () => { reached = true; await hold; });
    try {
      const sessions = makeSessions(many(3));
      const started = sessions.start(dal, 'C:/ws', 'first');
      if (!started.ok) throw new Error(started.error.reason);
      const sid = started.value;
      await vi.waitFor(() => { expect(reached).toBe(true); });
      expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'too late' } })).toEqual({ ok: false });
      release();
      await sessions.running(sid);
      expect(dal.getSession(sid)!.execution_status).toBe('completed');
      expect(dal.queuedPromptsOf(sid)).toEqual([]);
    } finally { settled.mockRestore(); }
  });

  it('still accepts a prompt after a PAUSE has come to rest, and keeps it QUEUED until the continue drains it (REQ-CHAT-040, REQ-CHAT-035)', async () => {
    /*
     * REQ-CHAT-040: only a run about to report COMPLETION closes its queue. A paused run is one a continue takes up
     * again, and the requirement promises the prompt is consumed at the first boundary after it resumes. Until
     * 2026-10-30 the closure was `steeringClosed`, also set at a pause's rest, so this prompt was refused although the
     * session read `pausing` and the composer still offered `Queue`. The hold is teardown's first await, so the prompt is
     * offered while the run is still live and after its rest is recorded.
     */
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    let reached = false;
    const settled = vi.spyOn(Run.prototype as unknown as { childCompletionsSettled(): Promise<void> }, 'childCompletionsSettled').mockImplementation(async () => { reached = true; await hold; });
    try {
      const sessions = makeSessions(many(6));
      const started = sessions.start(dal, 'C:/ws', 'first');
      if (!started.ok) throw new Error(started.error.reason);
      const sid = started.value;
      sessions.control({ op: 'pause', sessionId: sid, args: {} });
      await vi.waitFor(() => { expect(reached).toBe(true); });
      const queued = sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'while resting' } });
      expect(queued).toMatchObject({ ok: true });
      release();
      await sessions.running(sid);
      expect(dal.getSession(sid)!.execution_status).toBe('paused');
      expect(dal.queuedPromptsOf(sid).map((p) => [p.content, p.status])).toEqual([['while resting', 'QUEUED']]);
      expect(sessions.control({ op: 'editQueuedPrompt', sessionId: sid, args: { promptId: queued.ok ? queued.value! : '', text: 'while resting, edited' } })).toEqual({ ok: true });
      expect(sessions.continueSession(sid, 'continue')).toMatchObject({ ok: true });
      await sessions.running(sid);
      expect(dal.queuedPromptsOf(sid).map((p) => [p.content, p.status])).toEqual([['while resting, edited', 'COMPLETED']]);
      expect(dal.getSession(sid)!.execution_status).toBe('completed');
    } finally { settled.mockRestore(); }
  });

  it('survives the process: a second Sessions over the same store shows the prompt, edits it and consumes it on the continue (REQ-CHAT-041)', async () => {
    const first = makeSessions(many(6));
    const started = first.start(dal, 'C:/ws', 'first');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    const queued = first.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'after a restart' } });
    first.control({ op: 'pause', sessionId: sid, args: {} });
    await first.running(sid);
    const promptId = queued.ok ? queued.value! : '';

    const second = makeSessions(many(6));
    const resumed = second.resume(dal, 'C:/ws', sid);
    if (!resumed.ok) throw new Error(resumed.error.reason);
    expect(dal.queuedPromptsOf(sid).map((p) => p.status)).toEqual(['QUEUED']);
    expect(second.control({ op: 'editQueuedPrompt', sessionId: sid, args: { promptId, text: 'after a restart, edited' } })).toEqual({ ok: true });
    expect(second.continueSession(sid, 'continue')).toMatchObject({ ok: true });
    await second.running(sid);
    expect(dal.queuedPromptsOf(sid).map((p) => [p.content, p.status])).toEqual([['after a restart, edited', 'COMPLETED']]);
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
  });

  it('pauses at the message limit durably with the count and the limit, tells the host, and resumes on double with the limit doubled (REQ-ORCH-084/085/087, REQ-SESSION-110)', async () => {
    const pauses: { count: number; limit: number | null }[] = [];
    const sessions = makeSessions(many(6), { messageLimit: 1, onRunPaused: (_id, info) => { pauses.push({ count: info.count, limit: info.limit }); } });
    const started = sessions.start(dal, 'C:/ws', 'limited');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    // The first task completes in one iteration; a queued prompt keeps the run going past the limit.
    sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'more work' } });
    const result = await sessions.running(sid);
    expect(result?.execution_status).toBe('paused_message_limit');
    expect(result?.stop_reason).toBe('message_limit_reached');
    const paused = dal.getSession(sid)!;
    expect(paused).toMatchObject({ execution_status: 'paused_message_limit', paused_at_count: 1, message_limit: 1, iterations_completed: 1 });
    expect(pauses).toEqual([{ count: 1, limit: 1 }]);
    expect(dal.timelineOf(sid).map((t) => t.name)).toContain('run_paused_message_limit');
    expect(dal.getLock(sid)).toBeDefined();
    expect(sessions.isRunActive(sid)).toBe(false);
    // Every control answers false while paused (REQ-MONITOR-011).
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: false });
    const doubled = sessions.continueSession(sid, 'double');
    expect(doubled).toEqual({ ok: true, value: { resumed: true, messageLimit: 2 } });
    await sessions.running(sid);
    // The continuation ran one iteration (the continued prompt's task) and met the doubled limit at the next boundary — paused again, count 2 of 2.
    const after = dal.getSession(sid)!;
    expect(after).toMatchObject({ execution_status: 'paused_message_limit', paused_at_count: 2, message_limit: 2, iterations_completed: 2 });
    expect(pauses).toEqual([{ count: 1, limit: 1 }, { count: 2, limit: 2 }]);
    expect(dal.timelineOf(sid).filter((t) => t.name === 'pause_resolved')).toHaveLength(1);
    // Continue once more: the counter keeps accumulating (REQ-ORCH-086) and the run completes with no task left.
    expect(sessions.continueSession(sid, 'continue')).toEqual({ ok: true, value: { resumed: true, messageLimit: 2 } });
    await sessions.running(sid);
    expect(dal.getSession(sid)!.paused_at_count).not.toBeNull();
  });

  it('REQ-MONITOR-133/134 with OQ-128 (found by the third review of the repair of a-steering-prompt-pending-at-a-rest-is-lost): a root steer still pending at the message-limit pause is recorded as not delivered, and a steer once the pause is reached is refused', async () => {
    let releaseEnd!: () => void;
    const endHold = new Promise<void>((r) => { releaseEnd = r; });
    let releasePause!: () => void;
    const pauseHold = new Promise<void>((r) => { releasePause = r; });
    let atEnd = false;
    let atPause = false;
    const sessions = makeSessions(many(6), { messageLimit: 1 });
    const started = sessions.start(dal, 'C:/ws', 'limited');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'more work' } });
    // REQ-EVENTS-165: the boundary's drain waits on this consumer once iteration 1 has ended, and the pause's once it is recorded.
    sessions.bus.attach(sid, { mode: 'blocking', deliver: (e) => {
      if (dal.timelineOf(sid).some((t) => t.name === 'run_paused_message_limit')) { atPause = true; return pauseHold; }
      if (e.event === 'iteration.end') { atEnd = true; return endHold; }
      return undefined;
    } });
    await vi.waitFor(() => { expect(atEnd).toBe(true); });
    // The root's turn has returned and the limit is met at this boundary: no step of this run will inject the steer.
    const steered = sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: 'run', text: 'mind the tests' } });
    expect(steered.ok && steered.value?.length).toBe(36);
    const promptId = steered.ok ? steered.value! : '';
    releaseEnd();
    await vi.waitFor(() => { expect(atPause).toBe(true); });
    expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: 'run', text: 'too late' } })).toEqual({ ok: false });
    releasePause();
    expect((await sessions.running(sid))?.execution_status).toBe('paused_message_limit');
    const steering = dal.timelineOf(sid).filter((t) => t.name.startsWith('steering_'));
    expect(steering.map((t) => t.name)).toEqual(['steering_submitted', 'steering_not_delivered']);
    expect(JSON.parse(steering[1]!.metadata)).toMatchObject({ prompt_id: promptId, agent: 'root' });
    expect(steering[1]!.message).toMatch(/was not delivered: the run paused at the message limit before /);
    expect(dal.residentRows(sid).filter((r) => r.kind === 'system').map((r) => r.body)).toContain(steering[1]!.message);
  });

  /**
   * The repair of `docs/defects/fixed/a-stop-accepted-during-teardown-writes-cancelling-over-the-runs-terminal-status.md`
   * (finacc3 F05, found by its first verifier): the message-limit pause writes the run's rest and then forwards it and runs
   * the `session_end` hooks before the run has ended. A stop, a root cancel or a pause accepted in that window saved
   * `cancelling` or `pausing` over `paused_message_limit`, and nothing wrote the rest again. Each is refused there, as at
   * the teardown's end.
   */
  it('REQ-SESSION-186 / REQ-MONITOR-123/127/130 with OQ-165 (finacc3 F05): no control accepted after the message-limit pause wrote its rest saves an active status over it', async () => {
    let release!: () => void;
    const pauseHold = new Promise<void>((r) => { release = r; });
    let atPause = false;
    const sessions = makeSessions(many(6), { messageLimit: 1 });
    const started = sessions.start(dal, 'C:/ws', 'limited');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'more work' } });
    // REQ-EVENTS-165: the pause's drain waits on this consumer once the rest is recorded, before the run has ended.
    sessions.bus.attach(sid, { mode: 'blocking', deliver: () => {
      if (dal.timelineOf(sid).some((t) => t.name === 'run_paused_message_limit')) { atPause = true; return pauseHold; }
      return undefined;
    } });
    await vi.waitFor(() => { expect(atPause).toBe(true); });
    expect(sessions.run(sid)!.isEnded).toBe(false);
    expect(dal.getSession(sid)!.execution_status).toBe('paused_message_limit');
    const seen = [
      sessions.control({ op: 'pause', sessionId: sid, args: {} }),
      sessions.control({ op: 'cancel', sessionId: sid, args: {} }),
      sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'run' } }),
    ];
    expect([...seen, dal.getSession(sid)!.execution_status]).toEqual([{ ok: false }, { ok: false }, { ok: false }, 'paused_message_limit']);
    release();
    expect((await sessions.running(sid))?.execution_status).toBe('paused_message_limit');
    expect(dal.getSession(sid)).toMatchObject({ execution_status: 'paused_message_limit', paused_at_count: 1, message_limit: 1 });
    expect(dal.timelineOf(sid).map((t) => t.name)).not.toContain('run_pause_requested');
    // The rest's own cancel is unchanged: it still ends the paused session.
    expect(sessions.continueSession(sid, 'cancel')).toEqual({ ok: true, value: { resumed: false, messageLimit: 1 } });
  });

  it('cancel at the limit sets paused with stop reason message_limit_reached; a null limit cannot resume and warns (REQ-SESSION-110)', async () => {
    const notices: RunNotice[] = [];
    const sessions = makeSessions(many(4), { messageLimit: 1, notice: (n) => { notices.push(n); } });
    const started = sessions.start(dal, 'C:/ws', 'limited');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: 'more' } });
    await sessions.running(sid);
    expect(dal.getSession(sid)!.execution_status).toBe('paused_message_limit');
    expect(sessions.continueSession(sid, 'cancel')).toEqual({ ok: true, value: { resumed: false, messageLimit: 1 } });
    expect(dal.getSession(sid)!).toMatchObject({ execution_status: 'paused', paused_at_count: null, stop_reason: 'message_limit_reached' });
    // A session paused at a limit that is no longer recorded.
    dal.setPause(sid, 'paused_message_limit', 3, null, '2026-09-05T00:00:00.000Z');
    expect(sessions.continueSession(sid, 'continue')).toEqual({ ok: true, value: { resumed: false, messageLimit: null } });
    expect(dal.getSession(sid)!).toMatchObject({ execution_status: 'paused', paused_at_count: null, message_limit: null });
    expect(notices.some((n) => n.severity === 'warning' && /no message limit/.test(n.headline))).toBe(true);
  });

  it('todo edits, the entry reasoning switch and the shutdown announce; every unbacked operation answers false (REQ-MONITOR-004/142/131)', async () => {
    const sessions = makeSessions(many(4), { models: (key): ModelLookup => (key === 'fast' ? { ok: true, key, choice: { model: MODEL, thinking: 'unset' } } : { ok: false, reason: `'${key}' is not a configured model` }) });
    const started = sessions.start(dal, 'C:/ws', 'edit me');
    if (!started.ok) throw new Error(started.error.reason);
    const sid = started.value;
    expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', id: 'extra', text: 'one more thing' } })).toEqual({ ok: true });
    expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'update', id: 'nope', text: 'x' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', id: 'blank', text: '' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'setReasoning', sessionId: sid, args: { level: 'high' } })).toEqual({ ok: true });
    expect(sessions.control({ op: 'setReasoning', sessionId: sid, args: { level: 'ultra' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'fast' } })).toEqual({ ok: true });
    expect(sessions.control({ op: 'setModel', sessionId: sid, args: { model: 'slow' } })).toEqual({ ok: false });
    // Part AO: `forceCompression` and `clearTranscript` have arms now (`run/chat-controls.test.ts`); the synchronous `control`
    // answers the first with the pass's own refusal (`controlAsync` is its entry) and CLEARS on the second, so neither is unbacked.
    for (const op of ['skipCheck', 'terminalInput', 'terminalResize', 'terminalInterrupt', 'terminalKill'] as const) {
      expect(sessions.control({ op, sessionId: sid, args: { streamId: 'x', text: 'y' } })).toEqual({ ok: false });
    }
    // Part AC — REQ-CHAT-096: the two question operations HAVE a mechanism behind them now, and both refuse the same
    // two ways: a missing request id (REQ-MONITOR-008) and a stale one that names no waiting call. This session's
    // tool port is the test's stand-in and holds no question wait, so a well-formed request refuses too.
    for (const op of ['answerQuestion', 'cancelQuestions'] as const) {
      expect(sessions.control({ op, sessionId: sid, args: { streamId: 'x', text: 'y' } })).toEqual({ ok: false });
      expect(sessions.control({ op, sessionId: sid, args: { requestId: '' } })).toEqual({ ok: false });
      expect(sessions.control({ op, sessionId: sid, args: { requestId: 'no-such-prompt', selected: { a: 'x' } } })).toEqual({ ok: false });
    }
    expect(sessions.control({ op: 'announceShutdown', sessionId: sid, args: {} })).toEqual({ ok: true });
    const result = await sessions.running(sid);
    expect(result?.stop_reason).toBe('application_shutdown');
    const rows = dal.residentRows(sid).filter((r) => r.kind === 'system').map((r) => r.body);
    expect(rows.some((b) => b.includes('reasoning level switched to high'))).toBe(true);
    expect(rows.some((b) => b.includes('Entry model switched to fast'))).toBe(true);
    const todo = JSON.parse(dal.getSession(sid)!.todo!) as { phases: { name: string; tasks: { id: string; text: string }[] }[] };
    // REQ-CHAT-089: the added task carries the backend's id, never the one the request sent.
    const added = todo.phases[0]!.tasks.find((t) => t.text === 'one more thing');
    expect(added?.id).toMatch(/^[0-9a-f]{8}$/);
    expect(todo.phases[0]!.tasks.map((t) => t.id)).not.toContain('extra');
    expect(dal.timelineOf(sid).map((t) => t.name)).toContain('todo_edited');
    expect(sessions.control({ op: 'editTodo', sessionId: asSessionId('S-other'), args: { op: 'add', id: 'x', text: 'y' } })).toEqual({ ok: false });
  });

  describe('REQ-CHAT-090 with REQ-EVENTS-098 / ADR-0005: a todo edit at rest is written under the session\'s lock', () => {
    const planned = (sid: SessionId) => (JSON.parse(dal.getSession(sid)!.todo!) as { phases: { tasks: { text: string }[] }[] }).phases.flatMap((p) => p.tasks.map((t) => t.text));
    const rested = async () => {
      const sessions = makeSessions(many(2));
      const started = sessions.start(dal, 'C:/ws', 'edit me at rest');
      if (!started.ok) throw new Error(started.error.reason);
      const sid = started.value;
      await sessions.running(sid);
      // The run's teardown released the lock while the session stays loaded here.
      expect(dal.getSession(sid)!.execution_status).toBe('completed');
      expect(dal.getLock(sid)).toBeUndefined();
      return { sessions, sid };
    };

    it('another live process holding the lock refuses the edit in REQ-SESSION-048\'s words, writing nothing and leaving its lock; once it is free the edit takes the lock for the write and gives it back', async () => {
      const { sessions, sid } = await rested();
      const before = dal.getSession(sid)!.todo;
      expect(dal.claimLock(sid, 999, HOST, '2026-10-01T00:00:00.000Z').claimed).toBe(true);
      expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', text: 'one more thing' } })).toEqual({ ok: false, refusal: { code: 'session_locked', message: `Session ${sid} is held by another run in this application (pid 999). Finish or stop that run first.` } });
      expect(dal.getSession(sid)!.todo).toBe(before);
      expect(dal.getLock(sid)).toMatchObject({ pid: 999 });
      dal.releaseLock(sid, 999, HOST);
      expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', text: 'one more thing' } }).ok).toBe(true);
      expect(planned(sid)).toContain('one more thing');
      expect(dal.getLock(sid)).toBeUndefined();
    });

    it('a store error while taking the lock involves no other process: it is refused store_failed, writing nothing', async () => {
      const { sessions, sid } = await rested();
      const before = dal.getSession(sid)!.todo;
      const read = vi.spyOn(dal, 'getLock').mockImplementationOnce(() => { throw new Error('SQLITE_IOERR: disk I/O error'); });
      expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', text: 'one more thing' } })).toEqual({ ok: false, refusal: { code: 'store_failed', message: 'The workspace store could not take this session\'s lock, so the todo was not edited: Error: SQLITE_IOERR: disk I/O error' } });
      read.mockRestore();
      expect(dal.getSession(sid)!.todo).toBe(before);
      expect(dal.getLock(sid)).toBeUndefined();
    });

    it('a malformed edit is refused before the lock is touched, so it never names a foreign holder', async () => {
      const { sessions, sid } = await rested();
      expect(dal.claimLock(sid, 999, HOST, '2026-10-01T00:00:00.000Z').claimed).toBe(true);
      expect(sessions.control({ op: 'editTodo', sessionId: sid, args: { op: 'add', text: '   ' } })).toEqual({ ok: false });
      expect(dal.getLock(sid)).toMatchObject({ pid: 999 });
    });
  });
});
