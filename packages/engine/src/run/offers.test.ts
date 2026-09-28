import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ContentPart, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { ProjectionOwner, Run, RUN_CONFIG_DEFAULTS, SequenceCounters, Sessions, SessionWriter, toSessionRecord, toTranscriptRow, type RunConfig, type RuntimePosture, type ToolPort } from '../index.js';
import { conversationOf } from './record.js';
import { OFFERS_HEADER, offersForFirstMessage, offersHeldIn, offersToldIn, openOfferIds, openOffersText } from './offers.js';
import { decodeStoredTodo, encodeStoredTodo } from '../todo-view.js';

/**
 * PD-ORCH-004 revision 4: every root that may take up an open continuation offer is told of it, once — a new run's root
 * in the handoff, a resumed root at the continue, and the root of each later iteration of the same run in that
 * iteration's first message.
 */
const HOST = mintMachineId('0000000000000000000000000000000e') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };

describe('PD-ORCH-004 revision 4: a later iteration\'s root is told the open offers', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  let n = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-offers-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  /** A child of an earlier iteration, cut off while making progress, whose offer no child has taken up. */
  function offer(sid: SessionId, id: string, name: string): void {
    dal.insertChild({ session_id: sid, task_id: id, canonical_name: name, given_name: name, persona: 'coding-agent', state: 'failed', parent_id: 'bg_0000a11e', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
    dal.setChildReport(sid, id, JSON.stringify({ status: 'failed', summary: 'timed out', cut_off: { statement: 's', changed_paths: [], changes: '', continuation_offer: `Continue with continuation_of: "${id}".` } }));
  }

  const probe: ToolPort = {
    specs: () => [{ name: 'probe', description: 'probe', parameters: { type: 'object' } }],
    dispatch: async () => ({ text: 'probed', isError: false, status: 'ok', durationMs: 1, label: 'probe', args: {} }),
    cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
  };

  /** Model calls answered in order; `during(k)` runs as the k-th call (1-based) is made, before it answers. */
  function sessionsWith(calls: ScriptedCall[], opts: { config?: Partial<RunConfig>; during?: (k: number) => void; mode?: 'auto' | 'plan' } = {}) {
    const client = new ScriptedModelClient(calls);
    const original = client.stream.bind(client);
    let k = 0;
    client.stream = (req) => { k += 1; opts.during?.(k); return original(req); };
    const runtime: { -readonly [K in keyof RuntimePosture]: RuntimePosture[K] } = {
      permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', runStartMode: opts.mode ?? 'auto',
    };
    const sessions = new Sessions({
      clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 85, host: HOST, retentionCap: 20_000, warn: () => undefined,
      mintSessionId: () => `S-off-${++n}`, model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k', ...opts.config } },
      runtime, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), tools: () => probe,
    });
    return { sessions, client, runtime };
  }

  const lists = (content: readonly ContentPart[]): string[] => content.flatMap((p) => (p.kind === 'text' && p.text.includes(OFFERS_HEADER) ? [p.text.slice(p.text.indexOf(OFFERS_HEADER))] : []));
  const firstMessageOf = (sid: SessionId, iteration: number): readonly ContentPart[] => {
    const row = dal.iterationsOf(sid).find((r) => r.iteration === iteration)!;
    const first = conversationOf(dal.agentConversation(sid, row.root_task_id)).find((m) => m.role === 'user')!;
    if (first.role !== 'user') throw new Error('no first user message');
    return first.content;
  };
  const userTexts = (req: ModelRequest): string[] => req.messages.filter((m) => m.role === 'user').flatMap((m) => m.content.flatMap((p) => (p.kind === 'text' ? [p.text] : [])));

  it('offersForFirstMessage: nothing when no offer is open, and only the offers the first message does not already hold', () => {
    const sid = asSessionId('S-unit');
    const at = new Date(clock.instant()).toISOString();
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: at, updated_at: at });
    expect(offersForFirstMessage(dal, sid, [{ kind: 'text', text: 'do it' }])).toBeNull();
    offer(sid, 'bg_00000a01', 'build');
    offer(sid, 'bg_00000a02', 'lint');
    const told = offersForFirstMessage(dal, sid, [{ kind: 'text', text: `do it\n${OFFERS_HEADER}\n- build (bg_00000a01)` }]);
    expect(told).toEqual({ kind: 'text', text: `${OFFERS_HEADER}\n- lint (bg_00000a02)` });
    expect(offersForFirstMessage(dal, sid, [{ kind: 'text', text: `${OFFERS_HEADER}\n- build (bg_00000a01)\n- lint (bg_00000a02)` }])).toBeNull();
  });

  it('the root of a later iteration of the same run is told an offer raised during an earlier one, in its first message, after the launch content', async () => {
    let sid!: SessionId;
    // Iteration 1 takes one step and the step belt ends it partial; the offer is raised while it runs.
    const { sessions, client } = sessionsWith([toolCalls([{ callId: 'p1', name: 'probe', args: {} }]), answer('done')], {
      config: { maxStepsPerTurn: 1, iterationLimit: 2 }, during: (k) => { if (k === 1) offer(sid, 'bg_0000be09', 'old'); },
    });
    sid = (sessions.start(dal, 'C:/ws', 'the task') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid).map((r) => r.iteration)).toEqual([1, 2]);
    expect(lists(firstMessageOf(sid, 1))).toEqual([]);
    const second = firstMessageOf(sid, 2);
    expect(lists(second)).toEqual([`${OFFERS_HEADER}\n- old (bg_0000be09)`]);
    // One message: the launch content first, the list after it, as a part of its own.
    expect(second[0]).toEqual({ kind: 'text', text: 'the task' });
    expect(second.at(-1)).toEqual({ kind: 'text', text: `${OFFERS_HEADER}\n- old (bg_0000be09)` });
    expect(userTexts(client.requests[1]!)).toContain(`${OFFERS_HEADER}\n- old (bg_0000be09)`);
    // Held from then on, so a continue that resumes this root does not tell it again.
    expect(offersToldIn([{ role: 'user', content: second }]).has('bg_0000be09')).toBe(true);
  });

  it('a run launched with no content of its own is told its task and then the list, as runTurn would have sent the task alone', async () => {
    const client = new ScriptedModelClient([answer('done')]);
    const sid = asSessionId('S-bare');
    const bus = new Sessions({ clocks: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 1, host: HOST, retentionCap: 0, warn: () => undefined, mintSessionId: () => 'x', model: null, sessionFilesDir: () => dir }).bus;
    let owner: ProjectionOwner | undefined;
    let run: Run | undefined;
    const created = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: (c) => { owner?.onCommitted(c); run?.onCommitted(c); } }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST, task: 't' });
    if (!created.ok) throw new Error('create');
    owner = new ProjectionOwner({ sessionId: sid, seq: new SequenceCounters(), timers: clock, publisher: { increment: () => undefined, snapshot: () => undefined }, readSession: () => toSessionRecord(dal.getSession(sid)!), readResident: () => dal.residentRows(sid).map(toTranscriptRow) });
    offer(sid, 'bg_0000be09', 'old');
    run = new Run({ sessionId: sid, workspaceRoot: 'C:/ws', task: 'the bare task', taskId: 'T', writer: created.value, owner, bus, clocks: clock, backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' }, tools: null, permission: { requested: 'ask', effective: 'ask', downgraded: false, reason: '', sandboxed: false, sandboxBackend: '' }, pid: 1, host: HOST, readSession: () => dal.getSession(sid), warn: () => undefined, dal });
    await run.start();
    expect(userTexts(client.requests[0]!)).toEqual(['the bare task', `${OFFERS_HEADER}\n- old (bg_0000be09)`]);
  });

  it('a continuation\'s first iteration reads the offers in its handoff and is told nothing more', async () => {
    const { sessions } = sessionsWith([answer('first, done'), answer('next, done')]);
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid)!;
    offer(sid, 'bg_0000be09', 'old');
    expect(sessions.prompt(sid, 'next').ok).toBe(true);
    await sessions.running(sid)!;
    const first = firstMessageOf(sid, 2);
    expect(lists(first)).toHaveLength(1);
    expect(lists(first)[0]).toContain('- old (bg_0000be09)');
  });

  it('offersForFirstMessage: the offers the handoff covered — named or left out — are held, and only those raised since are named', () => {
    const sid = asSessionId('S-elided');
    const at = new Date(clock.instant()).toISOString();
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: at, updated_at: at });
    // A child spawned before all the others, whose offer is raised only after the handoff is built.
    dal.insertChild({ session_id: sid, task_id: 'bg_0000ff00', canonical_name: 'early', given_name: 'early', persona: 'coding-agent', state: 'running', parent_id: 'bg_0000a11e', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
    for (let i = 0; i < 11; i += 1) offer(sid, `bg_0000a0${i.toString(16).padStart(2, '0')}`, `c${i}`);
    const handoff = openOffersText(dal, sid);
    const covered = openOfferIds(dal, sid);
    expect(handoff).toContain('- [... earlier continuation offers elided]\n- c1 (bg_0000a001)');
    expect(handoff).not.toContain('c0');
    expect(offersForFirstMessage(dal, sid, [{ kind: 'text', text: `the handoff\n${handoff}\nRecent iterations:` }], covered)).toBeNull();
    // Without the covered set the offer the list left out would be named again.
    expect((offersForFirstMessage(dal, sid, [{ kind: 'text', text: handoff }]) as { text: string }).text).toBe(`${OFFERS_HEADER}\n- c0 (bg_0000a000)`);
    offer(sid, 'bg_0000a0ff', 'since');
    dal.setChildReport(sid, 'bg_0000ff00', JSON.stringify({ status: 'failed', summary: 'timed out', cut_off: { statement: 's', changed_paths: [], changes: '', continuation_offer: 'Continue with continuation_of: "bg_0000ff00".' } }));
    // Raised since, whichever child raised it and however early it was spawned.
    expect(offersForFirstMessage(dal, sid, [{ kind: 'text', text: handoff }], covered)).toEqual({ kind: 'text', text: `${OFFERS_HEADER}\n- early (bg_0000ff00)\n- since (bg_0000a0ff)` });
  });

  it('with more than ten open offers, a continuation\'s first iteration and every later one read one list — the handoff\'s newest ten', async () => {
    const { sessions } = sessionsWith([answer('first, done'), toolCalls([{ callId: 'p1', name: 'probe', args: {} }]), answer('next, done')], { config: { maxStepsPerTurn: 1, iterationLimit: 3 } });
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid)!;
    for (let i = 1; i <= 12; i += 1) offer(sid, `bg_00000b${i.toString(16).padStart(2, '0')}`, `c${i}`);
    expect(sessions.prompt(sid, 'next').ok).toBe(true);
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid).map((r) => r.iteration)).toEqual([1, 2, 3]);
    for (const iteration of [2, 3]) {
      const told = lists(firstMessageOf(sid, iteration));
      expect(told).toHaveLength(1);
      expect(told[0]).toContain('- [... earlier continuation offers elided]\n- c3 (bg_00000b03)');
      expect(told[0]).not.toContain('bg_00000b01');
      expect(told[0]).not.toContain('bg_00000b02');
    }
  });

  it('a plan cycle is not an iteration and is told no offer of its own — even after a resumed iteration raised one', async () => {
    let sid!: SessionId;
    const { sessions, client, runtime } = sessionsWith([answer('first, done'), answer('resumed, done'), answer('Plan: later.')], {
      during: (k) => { if (k === 2) offer(sid, 'bg_0000be09', 'old'); },
    });
    sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid)!;
    // Iteration 1 left open by a rest, with a second task pending; the mode then `plan` with no release.
    dal.db.prepare("UPDATE iterations SET state = 'open', outcome = NULL, closed_at = NULL WHERE session_id = ? AND iteration = 1").run(sid);
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    planner.phases[0]!.tasks[0]!.state = 'in_progress';
    (planner.phases[0]!.tasks as unknown[]).push({ id: `${sid}:main:later`, text: 'later', state: 'pending', consecutiveRetries: 0 });
    dal.updateSessionRun(sid, { iterations_completed: 0, todo: encodeStoredTodo({ ...stored, planner }) });
    dal.setIterationInterruption(sid, 1, 'pause');
    dal.db.prepare("UPDATE sessions SET execution_status = 'paused' WHERE session_id = ?").run(sid);
    runtime.runStartMode = 'plan';
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    expect((await sessions.running(sid)!).execution_status).toBe('awaiting_plan_decision');
    expect(userTexts(client.requests.at(-1)!).some((t) => t.includes('- old (bg_0000be09)'))).toBe(false);
  });

  /** The residue a rest leaves on iteration `n`: open by a pause, its task in progress, and the session `paused`. */
  function restIn(sid: SessionId, n: number): void {
    dal.db.prepare("UPDATE iterations SET state = 'open', outcome = NULL, closed_at = NULL WHERE session_id = ? AND iteration = ?").run(sid, n);
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    const own = dal.iterationsOf(sid).find((r) => r.iteration === n)!.todo_task_id;
    for (const phase of planner.phases) for (const task of phase.tasks) if (task.id === own) task.state = 'in_progress';
    dal.updateSessionRun(sid, { iterations_completed: n - 1, todo: encodeStoredTodo({ ...stored, planner }) });
    dal.setIterationInterruption(sid, n, 'pause');
    dal.db.prepare("UPDATE sessions SET execution_status = 'paused' WHERE session_id = ?").run(sid);
  }
  const listsHeldBy = (sid: SessionId, iteration: number): string[] => {
    const row = dal.iterationsOf(sid).find((r) => r.iteration === iteration)!;
    return conversationOf(dal.agentConversation(sid, row.root_task_id)).flatMap((m) => (m.role === 'user' ? lists(m.content) : []));
  };

  it('a continue that resumes a root whose list left earlier offers out tells it none of them again — and tells it one raised since', async () => {
    const { sessions } = sessionsWith([answer('first, done'), answer('next, done'), answer('resumed, done')]);
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid)!;
    // A child spawned before every offer, still running when the handoff is built.
    dal.insertChild({ session_id: sid, task_id: 'bg_0000ff00', canonical_name: 'early', given_name: 'early', persona: 'coding-agent', state: 'running', parent_id: 'bg_0000a11e', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
    for (let i = 1; i <= 12; i += 1) offer(sid, `bg_00000b${i.toString(16).padStart(2, '0')}`, `c${i}`);
    expect(sessions.prompt(sid, 'next').ok).toBe(true);
    await sessions.running(sid)!;
    expect(listsHeldBy(sid, 2)).toHaveLength(1);
    restIn(sid, 2);
    // Resumed with nothing new to tell, the root's record ends on its answer and it takes no step (OQ-70).
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    await sessions.running(sid)!;
    expect(listsHeldBy(sid, 2)).toHaveLength(1);
    // The early child raises its offer after the list was recorded: the next continue that resumes the root tells it that one.
    clock.advance(1_000);
    dal.setChildReport(sid, 'bg_0000ff00', JSON.stringify({ status: 'failed', summary: 'timed out', cut_off: { statement: 's', changed_paths: [], changes: '', continuation_offer: 'Continue with continuation_of: "bg_0000ff00".' } }));
    dal.setChildState(sid, 'bg_0000ff00', 'failed', new Date(clock.instant()).toISOString());
    restIn(sid, 2);
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    await sessions.running(sid)!;
    expect(listsHeldBy(sid, 2)).toEqual([expect.stringContaining('- c12 (bg_00000b0c)'), `${OFFERS_HEADER}\n- early (bg_0000ff00)`]);
  });

  it('an offer raised during a resumed first iteration, by a child spawned before the offers its handoff left out, is told to the next iteration\'s root', async () => {
    let sid!: SessionId;
    const { sessions } = sessionsWith([answer('first, done'), answer('resumed, done'), answer('later, done')], {
      during: (k) => {
        if (k !== 2) return;
        dal.setChildReport(sid, 'bg_0000ff00', JSON.stringify({ status: 'failed', summary: 'timed out', cut_off: { statement: 's', changed_paths: [], changes: '', continuation_offer: 'Continue with continuation_of: "bg_0000ff00".' } }));
      },
    });
    sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid)!;
    dal.insertChild({ session_id: sid, task_id: 'bg_0000ff00', canonical_name: 'early', given_name: 'early', persona: 'coding-agent', state: 'running', parent_id: 'bg_0000a11e', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
    for (let i = 1; i <= 11; i += 1) offer(sid, `bg_00000c${i.toString(16).padStart(2, '0')}`, `c${i}`);
    // Iteration 1 left open by a rest, with a second task, `later`, pending.
    restIn(sid, 1);
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = structuredClone(stored.planner!);
    (planner.phases[0]!.tasks as unknown[]).push({ id: `${sid}:main:later`, text: 'later', state: 'pending', consecutiveRetries: 0 });
    dal.updateSessionRun(sid, { todo: encodeStoredTodo({ ...stored, planner }) });
    expect(sessions.prompt(sid, 'go on').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(dal.iterationsOf(sid).map((r) => r.iteration)).toEqual([1, 2]);
    const told = lists(firstMessageOf(sid, 2));
    expect(told).toHaveLength(2);
    expect(told[0]).toContain('- [... earlier continuation offers elided]\n- c2 (bg_00000c02)');
    expect(told[1]).toBe(`${OFFERS_HEADER}\n- early (bg_0000ff00)`);
  });

  it('a continue that resumes a compressed root reads the offers its compression names as held — the replacement row is no message of its own (found by the iteration lane review)', async () => {
    const { sessions } = sessionsWith([answer('first, done'), answer('resumed, done')]);
    const sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid)!;
    offer(sid, 'bg_00000d01', 'c1');
    const root = dal.iterationsOf(sid)[0]!.root_task_id;
    const before = conversationOf(dal.agentConversation(sid, root));
    // PD-ORCH-005 clause 12: the root's conversation compressed, the list it was told carried into the replacement.
    const compressed = [{ role: 'user', content: [{ kind: 'text', text: 'Earlier work, compressed.' }, { kind: 'text', text: `${OFFERS_HEADER}\n- c1 (bg_00000d01)` }] }, before.at(-1)!];
    dal.insertAgentMessage({ session_id: sid, task_id: root, iteration: 1, kind: 'replacement', body: JSON.stringify(compressed), at: new Date(clock.instant()).toISOString() });
    const rows = dal.agentConversation(sid, root);
    expect(rows.map((r) => r.kind)).toEqual(['replacement']);
    expect([...offersHeldIn(dal, sid, [...rows, ...dal.agentMessagesOf(sid, root).filter((r) => r.kind === 'message')])]).toEqual(['bg_00000d01']);
    restIn(sid, 1);
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    await sessions.running(sid)!;
    expect(listsHeldBy(sid, 1)).toEqual([`${OFFERS_HEADER}\n- c1 (bg_00000d01)`]);
  });

  it('offersHeldIn: an offer raised in the same millisecond a list was recorded counts as held by it, and one raised a millisecond later does not (OQ-80; found by the iteration lane review)', () => {
    const sid = asSessionId('S-same-ms');
    const at = new Date(clock.instant()).toISOString();
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/ws', created_at: at, updated_at: at });
    for (const id of ['bg_0000ee01', 'bg_0000ee02']) dal.insertChild({ session_id: sid, task_id: id, canonical_name: id, given_name: id, persona: 'coding-agent', state: 'running', parent_id: 'bg_0000a11e', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
    for (let i = 1; i <= 11; i += 1) offer(sid, `bg_00000e${i.toString(16).padStart(2, '0')}`, `c${i}`);
    const list = openOffersText(dal, sid, () => true);
    expect(list).toContain('- [... earlier continuation offers elided]');
    dal.insertAgentMessage({ session_id: sid, task_id: 'root', iteration: 1, kind: 'message', body: JSON.stringify({ role: 'user', content: [{ kind: 'text', text: list }] }), at });
    const raise = (id: string, when: string): void => {
      dal.setChildReport(sid, id, JSON.stringify({ status: 'failed', summary: 'timed out', cut_off: { statement: 's', changed_paths: [], changes: '', continuation_offer: `Continue with continuation_of: "${id}".` } }));
      dal.setChildState(sid, id, 'failed', when);
    };
    raise('bg_0000ee01', at);
    raise('bg_0000ee02', new Date(clock.instant() + 1).toISOString());
    const held = offersHeldIn(dal, sid, dal.agentMessagesOf(sid, 'root'));
    expect(held.has('bg_0000ee01')).toBe(true);
    expect(held.has('bg_0000ee02')).toBe(false);
  });

  it('an iteration that takes up an earlier message is sent the launch content, then that message, then the offers raised since (PD-ORCH-005 clause 17, PD-ORCH-004 revision 4; found by the iteration lane review)', async () => {
    let sid!: SessionId;
    const { sessions } = sessionsWith([answer('first, done'), answer('M1, done'), answer('M2, done'), answer('third, done')], {
      during: (k) => { if (k === 2) offer(sid, 'bg_0000dd01', 'raised'); },
    });
    sid = (sessions.start(dal, 'C:/ws', 'first') as { value: SessionId }).value;
    await sessions.running(sid)!;
    // Two continues' messages a failed iteration left pending, each to be taken up by an iteration launched by another request.
    const stored = decodeStoredTodo(dal.getSession(sid)!.todo);
    const planner = { ...stored.planner!, phases: [...stored.planner!.phases, { name: 'Continued Prompts', tasks: ['M1', 'M2'].map((text, i) => ({ id: `${sid}:continued:${i + 2}`, text, state: 'pending' as const, consecutiveRetries: 0, message: true as const })) }] };
    dal.updateSessionRun(sid, { todo: encodeStoredTodo({ ...stored, planner }) });
    expect(sessions.prompt(sid, 'third').ok).toBe(true);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(dal.iterationsOf(sid).map((r) => r.iteration)).toEqual([1, 2, 3, 4]);
    const third = firstMessageOf(sid, 3).map((p) => (p.kind === 'text' ? p.text : ''));
    expect(third).toHaveLength(3);
    expect(third[0]).toContain('Latest user request:\nthird');
    expect(third[1]).toMatch(/^The task for this iteration is an earlier message from the user[\s\S]*\n\nM2$/);
    expect(third[2]).toBe(`${OFFERS_HEADER}\n- raised (bg_0000dd01)`);
  });
});
