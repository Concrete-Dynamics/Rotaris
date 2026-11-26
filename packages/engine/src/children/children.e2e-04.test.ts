import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import type { SessionId } from '@rotaris/kernel';
import { openStore, StoreDal, type ChildRow } from '@rotaris/store';
import { answer, DefaultAgentBackend, modelError, ScriptedModelClient, toolCalls, type ModelRequest } from '@rotaris/model';
import { RUN_AGENT_ID, TASK_ID_PATTERN, type SessionRecord } from '@rotaris/contracts';
import type { Sessions } from '../index.js';
import { ChildLedger, SessionWriter } from '../index.js';
import type { ProjectionOwner } from '../projection-owner.js';
import type { HookPort } from '../hooks-port.js';
import { resumableOf } from '../sessions.js';
import { HOST, MODEL, dir, dal, clock, warnings, sessionsWith, children, holdingChild, setDal, useIterationStore } from './children.test-support.js';

/**
 * Part 4 of 4 of the end-to-end cases of `children.test.ts`, which were one describe in that file and the longest
 * file of the parallel project by a factor of two. They are spread over files so that the cores run them side by side;
 * the store, the clock and the helpers every case starts from are `children.test-support.ts`. A new case goes into the
 * part its neighbours are in.
 */
describe('an iteration with children, end to end against the run (REQ-ORCH-055..060, 072, 080, 088, 108..112, REQ-TOOLS-152..156)', () => {
  useIterationStore();

  describe('REQ-ORCH-072: the root execution record identity and lookups', () => {
    it('carries canonical name and task id in the children namespace, and is distinct from delegated children', () => {
      const sid = 'S-root-test' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const ledger = new ChildLedger({ dal, writer: w.value, sessionId: sid, iteration: 1, budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 }, modelCap: () => null, warn: () => undefined });
      expect(ledger.root.taskId).toMatch(TASK_ID_PATTERN);
      expect(ledger.root.canonicalName).toBe('orchestrator');
      expect(ledger.root.persona).toBe('orchestrator');
      expect(ledger.root.depth).toBe(0);
      expect(ledger.root.state).toBe('running');
      // The root record is NOT a delegated child row
      expect(ledger.all()).toHaveLength(0);
      expect(ledger.activeCount()).toBe(0);
      expect(ledger.slotsInUse('m')).toBe(0);
      // isRoot recognizes all forms of identity
      expect(ledger.isRoot(ledger.root.taskId)).toBe(true);
      expect(ledger.isRoot(ledger.root.canonicalName)).toBe(true);
      expect(ledger.isRoot('root')).toBe(true);
      expect(ledger.isRoot('root:1')).toBe(true);
      expect(ledger.isRoot('bg_ffffffff')).toBe(false);
      w.value.release(1, HOST);
    });

    it('wait_for_tasks and background_output lookups naming the root resolve and enforce parent-scoping', async () => {
      const sid = 'S-ops-test' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const { IterationChildren } = await import('./orchestration.js');
      const ops = new IterationChildren({
        dal,
        writer: w.value,
        sessionId: sid,
        workspaceRoot: 'C:/ws',
        owner: null as unknown as ProjectionOwner,
        backend: new DefaultAgentBackend(new ScriptedModelClient([])),
        clocks: clock,
        model: MODEL,
        thinking: 'unset',
        modelTimeoutMs: 1000,
        modelRetries: 0,
        credentialFor: () => async () => '',
        budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 },
        modelCap: () => null,
        toolsFor: () => null,
        summariser: null,
        runSignal: new AbortController().signal,
        warn: () => undefined,
      }, 1);
      const rootId = ops.ledger.root.taskId;
      const rootName = ops.ledger.root.canonicalName;
      // 1. Root caller waiting for its own task (by task id, canonical name, 'root', or 'root:1') is refused
      expect(await ops.waitForTasks(rootId, [rootId])).toEqual({ refused: 'An agent cannot wait for its own task.' });
      expect(await ops.waitForTasks(rootId, [rootName])).toEqual({ refused: 'An agent cannot wait for its own task.' });
      expect(await ops.waitForTasks(rootId, ['root'])).toEqual({ refused: 'An agent cannot wait for its own task.' });
      expect(await ops.waitForTasks(rootId, ['root:1'])).toEqual({ refused: 'An agent cannot wait for its own task.' });

      // 2. Child caller waiting for root is refused under parent-scoping, NOT told root is not a task id
      const childId = 'bg_11112222';
      expect(await ops.waitForTasks(childId, [rootId])).toEqual({ refused: 'An agent can wait only for its direct child tasks.' });
      expect(await ops.waitForTasks(childId, [rootName])).toEqual({ refused: 'An agent can wait only for its direct child tasks.' });
      expect(await ops.waitForTasks(childId, ['root'])).toEqual({ refused: 'An agent can wait only for its direct child tasks.' });
      // Non-existent invalid id is refused as not a task id
      expect(await ops.waitForTasks(childId, ['not-a-task-id'])).toEqual({ refused: "'not-a-task-id' is not a task id." });

      // 3. background_output naming the root reads as not_found under parent-scoping (caller does not own root)
      expect(ops.backgroundOutput(rootId, rootId, 'summary')).toEqual({ status: 'not_found', state: '', text: '' });
      expect(ops.backgroundOutput(childId, rootId, 'summary')).toEqual({ status: 'not_found', state: '', text: '' });
      expect(ops.backgroundOutput(childId, rootName, 'summary')).toEqual({ status: 'not_found', state: '', text: '' });

      w.value.release(1, HOST);
    });

    // REQ-ORCH-053 / REQ-ORCH-098, repair round 1 of a-childs-closing-scheduler-pass-can-outlive-the-run-that-awaited-it: a
    // resumed child (PD-ORCH-005 clause 4) ends in the same unawaited pass a fresh one does. Its store closes before anything
    // closed the scheduler; the pass that follows its end raises on the closed store, and that raise is warned once, never
    // rejected (before: `.finally(() => this.scheduler.pass())`, an unhandled 'The database connection is not open').
    it('a resumed child that settles after its store is closed: the pass that follows is warned once and rejects nothing', async () => {
      const sid = 'S-resumed-close' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const { IterationChildren } = await import('./orchestration.js');
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      const client = new ScriptedModelClient([{ parts: [{ hold: held }, ...answer('resumed and done').parts] }]);
      const warned: string[] = [];
      const rejections: unknown[] = [];
      const onRejection = (e: unknown) => { rejections.push(e); };
      process.on('unhandledRejection', onRejection);
      try {
        const ops = new IterationChildren({
          dal, writer: w.value, sessionId: sid, workspaceRoot: 'C:/ws', owner: null as unknown as ProjectionOwner,
          backend: new DefaultAgentBackend(client), clocks: clock, model: MODEL, thinking: 'unset', modelTimeoutMs: 1000, modelRetries: 0,
          // A cap of 0 holds the accepted child on its model's slot, so it never starts before the test rests it.
          credentialFor: () => async () => '', budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 }, modelCap: () => 0,
          toolsFor: () => null, summariser: null, runSignal: new AbortController().signal, warn: (m) => warned.push(m),
        }, 1);
        const accepted = await ops.delegate(ops.ledger.root.taskId, { persona: 'coding-agent', taskName: 'work', task: 'TASK: work', dependsOn: [], inheritedContext: [], category: '', runInBackground: true });
        expect(accepted.status).toBe('waiting_on_model_slot');
        const taskId = dal.childrenOf(sid)[0]!.task_id;
        // Left paused by a stop while running, as a rest leaves it (PD-ORCH-005 clause 3); the continuation resumes it.
        const rested = ops.ledger.rest(taskId, 'stop', 'running');
        expect(rested.ok).toBe(true);
        expect(ops.resumePaused()).toBe(1);
        for (let i = 0; i < 40 && client.requests.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
        expect(client.requests).toHaveLength(1);
        // The store closes under the resumed execution, before anything closed the scheduler; then the call returns.
        dal.db.close();
        release();
        await new Promise((r) => setTimeout(r, 40));
        expect(rejections).toEqual([]);
        expect(warned.filter((m) => /the scheduler's pass after child .* raised: .*not open/i.test(m))).toHaveLength(1);
      } finally {
        process.off('unhandledRejection', onRejection);
        // The suite's afterEach closes the store it finds: give it an open one.
        if (!dal.db.open) setDal(new StoreDal(openStore(join(dir, 'workspace.db'))));
      }
    });

    it('PD-ORCH-021 clause 10: a child is admitted under the session\'s stop at that moment, records it, and is keyed by that stop\'s model', async () => {
      const sid = 'S-money-stop' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const { IterationChildren } = await import('./orchestration.js');
      const { resolveRole } = await import('./personas.js');
      let stop: 'regular' | 'token_burner' = 'regular';
      // The stop's personas: under token burner the coding agent runs on a larger model's key.
      const personasAt = (at: string) => ({
        resolve: (name: string) => {
          const r = resolveRole(name);
          if (r === null || at !== 'token_burner') return r;
          return { ...r, persona: { ...r.persona, modelRef: { ...MODEL, modelId: 'large' }, modelKey: 'scripted/large' } };
        },
        delegationTargets: () => [],
      });
      const ops = new IterationChildren({
        dal, writer: w.value, sessionId: sid, workspaceRoot: 'C:/ws', owner: null as unknown as ProjectionOwner,
        backend: new DefaultAgentBackend(new ScriptedModelClient([])), clocks: clock, model: MODEL, thinking: 'unset', modelTimeoutMs: 1000, modelRetries: 0,
        // A cap of 0 holds each accepted child on its model's slot, so nothing starts.
        credentialFor: () => async () => '', budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 }, modelCap: () => 0,
        toolsFor: () => null, summariser: null, runSignal: new AbortController().signal, warn: () => undefined,
        spend: { stopNow: () => stop, personasAt },
      }, 1);
      const root = ops.ledger.root.taskId;
      const request = (taskName: string) => ({ persona: 'coding-agent', taskName, task: 'TASK: t', dependsOn: [], inheritedContext: [], category: '', runInBackground: true });
      await ops.delegate(root, request('before'));
      stop = 'token_burner';
      await ops.delegate(root, request('after'));
      const rows = dal.childrenOf(sid);
      expect(rows.map((r) => [r.given_name, r.money_stop, r.model_key])).toEqual([
        ['before', 'regular', MODEL.modelId],
        ['after', 'token_burner', 'scripted/large'],
      ]);
    });

    it('REQ-ORCH-034 / REQ-ORCH-153 (the repair of delegate-reads-no-alias-on-the-built-in-table): with no configured persona catalogue an alias is admitted as its target — refused while the plan gate holds, and granted its target\'s tools', async () => {
      const sid = 'S-alias-built-in' as SessionId;
      const w = SessionWriter.create({ dal, sessionId: sid, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
      if (!w.ok) throw new Error('writer');
      const { IterationChildren } = await import('./orchestration.js');
      let held = true;
      // No `personas`: the engine's built-in table is the catalogue. The gate withholds what writes files or runs commands.
      const ops = new IterationChildren({
        dal, writer: w.value, sessionId: sid, workspaceRoot: 'C:/ws', owner: null as unknown as ProjectionOwner,
        backend: new DefaultAgentBackend(new ScriptedModelClient([])), clocks: clock, model: MODEL, thinking: 'unset', modelTimeoutMs: 1000, modelRetries: 0,
        // A cap of 0 holds an accepted child on its model's slot, so nothing starts once the test's store is closed.
        credentialFor: () => async () => '', budget: { maxDepth: 3, maxTotal: 20, maxActive: 6 }, modelCap: () => 0,
        toolsFor: () => null, summariser: null, runSignal: new AbortController().signal, warn: () => undefined,
        planGate: { held: () => held, withholds: (t) => ['write_file', 'haet_edit', 'haet', 'terminal'].includes(t) },
      }, 1);
      const root = ops.ledger.root.taskId;
      const request = (persona: string, taskName: string) => ({ persona, taskName, task: 'TASK: t', dependsOn: [], inheritedContext: [], category: '', runInBackground: true });
      // While the gate holds, `coder` and `playwright` are refused as the roles they name, before any record exists.
      const coder = await ops.delegate(root, request('coder', 'write'));
      expect(coder).toMatchObject({ status: 'rejected' });
      expect(coder.message).toContain("The 'coder' role was not started");
      expect(coder.message).toContain('write_file');
      const playwright = await ops.delegate(root, request('playwright', 'look'));
      expect(playwright).toMatchObject({ status: 'rejected' });
      expect(playwright.message).toContain('terminal');
      expect(dal.childrenOf(sid)).toHaveLength(0);
      // Released, the alias is accepted as its target, granted the target's tools and recorded under the run's key.
      held = false;
      const accepted = await ops.delegate(root, request('coder', 'write'));
      expect(accepted.status).toBe('waiting_on_model_slot');
      expect(accepted.message).toContain("Alias 'coder' resolved to 'coding-agent'");
      const row = dal.childrenOf(sid)[0]!;
      // The target's tools reach the child through its port, which is built for the row's persona; the row records the grant
      // that port puts in force once ready (REQ-MCP-065), and none at spawn — until 2026-10-01 it recorded the target's
      // declared tools here (`docs/archive/defects/a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`).
      expect(row.persona).toBe('coding-agent');
      expect(JSON.parse(row.granted_tools)).toEqual([]);
      expect(row.model_key).toBe(MODEL.modelId);
      w.value.release(1, HOST);
    });

    it('end-to-end: delegated children carry the root task id as parent_id and steer/cancel resolve the root', async () => {
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      let rootCapturedTaskId = '';
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'child-task', task: 'TASK: do child work', run_in_background: false } }]);
          return answer('done');
        }
        if (persona === 'summariser') return answer('{"summary":"child done"}');
        return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'build with root') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      // Access root execution record identity
      const childRow = children(sid)[0]!;
      rootCapturedTaskId = childRow.parent_id;
      expect(rootCapturedTaskId).toMatch(TASK_ID_PATTERN);
      expect(childRow.depth).toBe(1);

      // Steer by root task id
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: rootCapturedTaskId, text: 'keep going' } })).toMatchObject({ ok: true });
      // Steer by root canonical name
      expect(sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: 'orchestrator', text: 'focus' } })).toMatchObject({ ok: true });

      releaseChild();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('completed');
    });

    it('end-to-end: cancelAgent naming the root by task id stops the run', async () => {
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'child-task', task: 'TASK: do child work', run_in_background: false } }]);
          return answer('done');
        }
        if (persona === 'summariser') return answer('{"summary":"child done"}');
        return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'build with cancel') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      const childRow = children(sid)[0]!;
      const rootTaskId = childRow.parent_id;

      // Cancel by root task id
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: rootTaskId } })).toEqual({ ok: true });
      releaseChild();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('interrupted');
    });
  });

  describe('PD-ORCH-005 clause 16 (revision 4, OQ-101): one paused child is cancelled while its session rests', () => {
    const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow => children(sid).find((c) => c.canonical_name === name)!;
    const cancel = (sessions: Sessions, sid: SessionId, agentId: string) => sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId } });

    /**
     * The root delegates `one` and `two`; `one` delegates `grand` and `quick`, which finishes at once; the others hold a
     * step that asks for a call, so a pause leaves them and the root paused, and `quick` a finished descendant of `one`.
     */
    async function restedFamily() {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const state = { resumed: false };
      const rootAsked: string[] = [];
      const snapshots: SessionRecord[] = [];
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          rootAsked.push(req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n'));
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]) : answer('both delegated');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (state.resumed) return answer('done');
        const text = userText(req);
        if (text.includes('TASK: quick')) return answer('quick done');
        if (text.includes('TASK: one') && !req.messages.some((m) => m.role === 'tool')) return toolCalls([{ callId: 'g1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'grand', task: 'TASK: grand' } }, { callId: 'g2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quick', task: 'TASK: quick' } }], 'Delegating.');
        return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      }, { publisher: { increment: () => undefined, snapshot: (p) => { snapshots.push(p.session); } } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 4 && byName(sid, 'quick').state === 'succeeded' && children(sid).filter((c) => c.state === 'running').length === 3);
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      expect(children(sid).map((c) => [c.canonical_name, c.state]).sort()).toEqual([['grand', 'paused'], ['one', 'paused'], ['quick', 'succeeded'], ['two', 'paused']]);
      warnings.length = 0;
      return { sessions, sid, state, rootAsked, snapshots };
    }

    it('it and its paused descendant end cancelled with the live cancel\'s report, entry and artifact; the rest stay paused, the iteration open, and the count drops', async () => {
      const { sessions, sid, snapshots } = await restedFamily();
      expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 1, agents: 4 });
      const one = byName(sid, 'one').task_id;
      const grand = byName(sid, 'grand').task_id;
      expect(cancel(sessions, sid, one)).toEqual({ ok: true });
      expect([byName(sid, 'one').state, byName(sid, 'grand').state, byName(sid, 'two').state]).toEqual(['cancelled', 'cancelled', 'paused']);
      // A finished descendant is left as it is, and nothing is attempted on it.
      expect(byName(sid, 'quick').state).toBe('succeeded');
      expect(warnings).toEqual([]);
      expect(JSON.parse(byName(sid, 'one').report!)).toMatchObject({ status: 'cancelled', summary: 'The user cancelled this child.' });
      expect(JSON.parse(byName(sid, 'grand').report!)).toMatchObject({ status: 'cancelled', summary: 'Cancelled with one, which the user cancelled.' });
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled').map((t) => JSON.parse(t.metadata) as Record<string, unknown>)).toEqual([{ task_id: one }, { task_id: grand, cancelled_with: one }]);
      expect(dal.artifactsOf(sid).filter((a) => a.kind === 'child_report' && a.status === 'cancelled').map((a) => a.source_task_id).sort()).toEqual([one, grand].sort());
      // Clause 16: the iteration stays open, its task still held, and the Continue action's count drops by two.
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', interruption: 'pause' }]);
      expect(dal.getSession(sid)!.execution_status).toBe('paused');
      expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 1, agents: 2 });
      const last = snapshots.at(-1)!;
      expect(last.resumable).toEqual({ iteration: 1, agents: 2 });
      expect(Object.fromEntries(last.agents.map((a) => [a.name, a.presentationState]))).toEqual({ one: 'cancelled', two: 'paused', grand: 'cancelled', quick: 'done' });
    });

    it('REQ-ORCH-098 (the repair of a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries): it and its paused descendant are torn down once each, after their `child_user_cancelled`, in their reports\' words; the rest are not', async () => {
      const { sessions, sid } = await restedFamily();
      const one = byName(sid, 'one').task_id;
      expect(cancel(sessions, sid, one)).toEqual({ ok: true });
      const teardown = ['child_end', 'child_result', 'child_conversation_closed'];
      const ownOf = (taskId: string) => dal.timelineOf(sid).filter((t) => (JSON.parse(t.metadata) as { task_id?: string }).task_id === taskId);
      for (const name of ['one', 'grand']) {
        const c = byName(sid, name);
        expect(ownOf(c.task_id).filter((t) => teardown.includes(t.name)).map((t) => [t.name, t.message]), name).toEqual([
          ['child_end', `Child ${name} (${c.task_id}) ended cancelled.`],
          ['child_result', `Child ${name} reported cancelled: ${(JSON.parse(c.report!) as { summary: string }).summary}`],
          ['child_conversation_closed', `Child ${name}'s conversation closed.`],
        ]);
        expect(ownOf(c.task_id).findIndex((t) => t.name === 'child_end'), name).toBeGreaterThan(ownOf(c.task_id).findIndex((t) => t.name === 'child_user_cancelled'));
      }
      // `two` is still paused, and `quick` was torn down by its own settle when it finished.
      expect(ownOf(byName(sid, 'two').task_id).filter((t) => teardown.includes(t.name))).toEqual([]);
      expect(ownOf(byName(sid, 'quick').task_id).filter((t) => teardown.includes(t.name)).map((t) => t.name)).toEqual(teardown);
    });

    it('refused for the run, the root, an unknown id, and an agent no longer paused; a descendant alone takes nothing above it', async () => {
      const { sessions, sid } = await restedFamily();
      const root = dal.openIterationOf(sid)!.root_task_id;
      for (const id of [RUN_AGENT_ID, root, 'bg_ffffffff', '']) expect(cancel(sessions, sid, id)).toEqual({ ok: false });
      expect(cancel(sessions, sid, byName(sid, 'grand').task_id)).toEqual({ ok: true });
      expect([byName(sid, 'one').state, byName(sid, 'grand').state, byName(sid, 'two').state]).toEqual(['paused', 'cancelled', 'paused']);
      expect(cancel(sessions, sid, byName(sid, 'grand').task_id)).toEqual({ ok: false });
      expect(resumableOf(dal, dal.getSession(sid)!)).toEqual({ iteration: 1, agents: 3 });
    });

    it('the continue resumes the rest: the root is given the cancelled child\'s report, the other child finishes, and the iteration closes', async () => {
      const { sessions, sid, state, rootAsked } = await restedFamily();
      expect(cancel(sessions, sid, byName(sid, 'one').task_id)).toEqual({ ok: true });
      state.resumed = true;
      const before = rootAsked.length;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      expect(byName(sid, 'two').state).toBe('succeeded');
      expect([byName(sid, 'one').state, byName(sid, 'grand').state]).toEqual(['cancelled', 'cancelled']);
      expect(rootAsked.slice(before).some((t) => t.includes('The user cancelled this child.'))).toBe(true);
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
      // Nothing is left open, so nothing is cancellable at rest any more.
      expect(cancel(sessions, sid, byName(sid, 'two').task_id)).toEqual({ ok: false });
    });
    it('a dependent of the cancelled child (OQ-101) is blocked by the resumed run\'s first pass with its `blocked` report and artifact (REQ-ORCH-048 / REQ-ORCH-108 / REQ-LIBRARY-092)', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const state = { resumed: false };
      const rootAsked: string[] = [];
      const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          rootAsked.push(textOf(req));
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }]);
          const one = /task_id: (bg_[0-9a-f]{8})/.exec(textOf(req))?.[1] ?? '';
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'after', task: 'TASK: after', depends_on: [one] } }]);
          return answer('delegated');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (state.resumed) return answer('done');
        return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => children(sid).length === 2 && byName(sid, 'one').state === 'running' && byName(sid, 'after').state === 'waiting_on_dependencies');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      expect([byName(sid, 'one').state, byName(sid, 'after').state]).toEqual(['paused', 'paused']);
      const one = byName(sid, 'one').task_id;
      const after = byName(sid, 'after').task_id;
      // Clause 16: the at-rest cancel runs no cascade, so the dependent stays paused until the continue resumes it.
      expect(cancel(sessions, sid, one)).toEqual({ ok: true });
      expect(byName(sid, 'after').state).toBe('paused');
      state.resumed = true;
      const before = rootAsked.length;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await sessions.running(sid)!;
      expect(byName(sid, 'after')).toMatchObject({ state: 'blocked', report_stored: 1 });
      expect(JSON.parse(byName(sid, 'after').report!)).toMatchObject({ status: 'blocked', summary: `Blocked: Its dependency one (${one}) ended cancelled, so this child never started (REQ-ORCH-048).` });
      expect(dal.artifactsOf(sid).filter((a) => a.kind === 'child_report' && a.source_task_id === after).map((a) => a.status)).toEqual(['blocked']);
      // The root is resumed with the blocked child's report, and the iteration closes.
      expect(rootAsked.slice(before).some((t) => t.includes(`Its dependency one (${one}) ended cancelled`))).toBe(true);
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });

    describe('PD-ORCH-005 clause 16 (OQ-101): the cancel is made under the session\'s lock', () => {
      it('a session this process paused holds no lock: the cancel takes it for the write and gives it back; another live process holding it refuses the cancel, writing nothing', async () => {
        const { sessions, sid } = await restedFamily();
        expect(dal.getLock(sid)).toBeUndefined();
        const at = new Date(Number(clock.instant())).toISOString();
        expect(dal.claimLock(sid, 999, HOST, at).claimed).toBe(true);
        expect(cancel(sessions, sid, byName(sid, 'two').task_id)).toEqual({ ok: false, refusal: { code: 'session_locked', message: 'Another process holds this session, so the agent was not cancelled.' } });
        expect(byName(sid, 'two').state).toBe('paused');
        expect(dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled')).toEqual([]);
        expect(dal.getLock(sid)).toMatchObject({ pid: 999 });
        dal.releaseLock(sid, 999, HOST);
        expect(cancel(sessions, sid, byName(sid, 'two').task_id)).toEqual({ ok: true });
        expect(byName(sid, 'two').state).toBe('cancelled');
        expect(dal.getLock(sid)).toBeUndefined();
      });

      it('a store error while taking the lock involves no other process: it is refused store_failed in the engine\'s words, not session_locked, writing nothing', async () => {
        const { sessions, sid } = await restedFamily();
        const read = vi.spyOn(dal, 'getLock').mockImplementationOnce(() => { throw new Error('SQLITE_IOERR: disk I/O error'); });
        expect(cancel(sessions, sid, byName(sid, 'two').task_id)).toEqual({ ok: false, refusal: { code: 'store_failed', message: 'The workspace store could not take this session\'s lock, so the agent was not cancelled: Error: SQLITE_IOERR: disk I/O error' } });
        read.mockRestore();
        expect(byName(sid, 'two').state).toBe('paused');
        expect(dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled')).toEqual([]);
        expect(dal.getLock(sid)).toBeUndefined();
        expect(warnings.some((w) => w.includes('for a cancel failed'))).toBe(true);
      });

      it('a failed write of the chosen child\'s own move is refused store_failed in the engine\'s words, not "not cancellable", and the lock is given back', async () => {
        const { sessions, sid } = await restedFamily();
        const write = vi.spyOn(dal, 'setChildState').mockImplementationOnce(() => { throw new Error('SQLITE_FULL: database or disk is full'); });
        expect(cancel(sessions, sid, byName(sid, 'two').task_id)).toEqual({ ok: false, refusal: { code: 'store_failed', message: 'The workspace store requires recovery before an agent can be cancelled: Error: SQLITE_FULL: database or disk is full' } });
        write.mockRestore();
        expect(byName(sid, 'two').state).toBe('paused');
        expect(dal.timelineOf(sid).filter((t) => t.name === 'child_user_cancelled')).toEqual([]);
        expect(dal.getLock(sid)).toBeUndefined();
      });
    });
  });

  /**
   * PD-ORCH-005 clause 15 (revision 4): "A forced stop is a stop: its agents come to rest as clause 3 says." The
   * graceful stop is covered above; these are the forced one, reached either way the stop control forces it, and the
   * application's quit, whose `quit` a stop request received first would displace (the first reason stands — the
   * board-run defect, `docs/archive/defects/a-board-run-caught-by-a-quit-rests-as-a-stop.md`).
   */
  describe('REQ-ORCH-052 / REQ-ORCH-108, the repair of a-child-whose-execution-raises-before-its-turn-stays-running: a raise outside the turn settles the child', () => {
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow | undefined => children(sid).find((c) => c.canonical_name === name);
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');

    it('the fresh path: a tool port that cannot be built ends the child failed with its report and artifact, and the parent\'s foreground wait returns it', async () => {
      const rootAsked: string[] = [];
      const completed: Readonly<Record<string, unknown>>[] = [];
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => { if (event === 'child_completed') completed.push(fields); return []; }, advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') { rootAsked.push(textOf(req)); return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'broken', task: 'TASK: broken', run_in_background: false } }]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return answer('never reached');
      }, { raisingPort: 'broken', hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'broken')?.state === 'failed');
      const row = byName(sid, 'broken')!;
      expect(row).toMatchObject({ state: 'failed', report_stored: 1 });
      expect(JSON.parse(row.report!)).toMatchObject({ status: 'failed', summary: 'Child broken ended failed: its execution raised outside its turn: no tool port for broken', errors: [{ type: 'child_exception', message: 'no tool port for broken' }] });
      expect(dal.artifactsOf(sid).filter((a) => a.kind === 'child_report' && a.source_task_id === row.task_id).map((a) => a.status)).toEqual(['failed']);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'child_exception').map((i) => i.message)).toEqual(['Child broken raised: no tool port for broken']);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_end').map((t) => t.message)).toEqual([`Child broken (${row.task_id}) ended failed.`]);
      // REQ-ORCH-098: torn down "whether or not its execution raised" — its result and its closed conversation.
      expect(dal.timelineOf(sid).filter((t) => JSON.parse(t.metadata).task_id === row.task_id && ['child_end', 'child_result', 'child_conversation_closed'].includes(t.name)).map((t) => t.name)).toEqual(['child_end', 'child_result', 'child_conversation_closed']);
      // REQ-HOOKS-003: `child_completed` fires for it, whatever its final state.
      expect(completed).toEqual([{ child_id: row.task_id, child_name: 'broken', persona: 'coding-agent', state: 'failed', status: 'failed', summary: 'Child broken ended failed: its execution raised outside its turn: no tool port for broken' }]);
      await sessions.running(sid);
      // The foreground delegation's wait (REQ-TOOLS-156) resolved with the report, and the run went on to its end.
      expect(rootAsked.at(-1)).toContain('no tool port for broken');
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });

    it('the resume path: a record that cannot be decoded ends the child failed with its report, and the resumed iteration closes', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const state = { resumed: false };
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (state.resumed) return answer('done');
        return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'one')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      const one = byName(sid, 'one')!;
      expect(one.state).toBe('paused');
      dal.db.prepare('UPDATE agent_messages SET body = ? WHERE session_id = ? AND task_id = ?').run('{not json', sid, one.task_id);
      state.resumed = true;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => byName(sid, 'one')?.state === 'failed');
      const row = byName(sid, 'one')!;
      expect(row).toMatchObject({ state: 'failed', report_stored: 1 });
      expect(JSON.parse(row.report!)).toMatchObject({ status: 'failed', errors: [{ type: 'child_exception' }] });
      expect(JSON.parse(row.report!).summary).toMatch(/^Child one ended failed: its record could not be loaded to resume it: /);
      // REQ-ORCH-098: a resumed child that had a recorded conversation has it closed too.
      expect(dal.timelineOf(sid).filter((t) => JSON.parse(t.metadata).task_id === row.task_id && ['child_end', 'child_result', 'child_conversation_closed'].includes(t.name)).map((t) => t.name)).toEqual(['child_end', 'child_result', 'child_conversation_closed']);
      await sessions.running(sid);
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });

    it('the resume path: the rest waits for the settle, its `child_completed` hook included, as it waits for a fresh child\'s (PD-ORCH-005 clause 2)', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      let releaseTwo!: () => void;
      const holdTwo = new Promise<void>((r) => { releaseTwo = r; });
      let releaseHook!: () => void;
      const hookHold = new Promise<void>((r) => { releaseHook = r; });
      const state = { resumed: false, hookEntered: false, twoHeld: false };
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => { if (event === 'child_completed' && state.resumed && fields['child_name'] === 'one') { state.hookEntered = true; await hookHold; } return []; }, advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        // `two`, resumed, holds its step so the run is still live when the settle of `one` reaches its hook.
        if (state.resumed) { state.twoHeld = true; return { parts: [{ hold: holdTwo }, ...answer('two: done').parts] }; }
        return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'one')?.state === 'running' && byName(sid, 'two')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      const one = byName(sid, 'one')!;
      expect([one.state, byName(sid, 'two')!.state]).toEqual(['paused', 'paused']);
      dal.db.prepare('UPDATE agent_messages SET body = ? WHERE session_id = ? AND task_id = ?').run('{not json', sid, one.task_id);
      state.resumed = true;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => state.hookEntered && state.twoHeld);
      expect(byName(sid, 'one')?.state).toBe('failed');
      const resting = sessions.running(sid)!;
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      let rested = false;
      void resting.then(() => { rested = true; });
      releaseTwo();
      await settle(() => byName(sid, 'two')?.state !== 'running');
      await new Promise((r) => setTimeout(r, 100));
      // `two` has come to rest; the settle of `one` still holds in its hook, so the rest has not finished: the settle is
      // one of the executions it waits for.
      expect(rested).toBe(false);
      releaseHook();
      await resting;
      expect(rested).toBe(true);
    });
  });

  describe('REQ-HOOKS-076 / REQ-HOOKS-080, the repair of a-child-completed-hook-can-finish-after-its-iteration-ends: a child\'s `child_completed` hook runs in line — its parent takes it as ended, and the iteration ends, only once the hook is done', () => {
    const settle = async (until: () => boolean, rounds = 400) => { for (let i = 0; i < rounds && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow | undefined => children(sid).find((c) => c.canonical_name === name);
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    /** The run as a run without its hook in line would end it: given this long to get there before a test says it did not. */
    const RACE_ROUNDS = 40;
    /** Every lifecycle occurrence's start and end, in order, with each of `names`' `child_completed` held until it is released. */
    function heldHooks(...names: string[]) {
      const order: string[] = [];
      const held = new Map<string, { hold: Promise<void>; release: () => void; entered: boolean }>();
      for (const name of names) {
        let release!: () => void;
        const hold = new Promise<void>((r) => { release = r; });
        held.set(name, { hold, release, entered: false });
      }
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          const label = event === 'child_completed' ? `child_completed(${String(fields['child_name'])})` : event;
          order.push(`${label}:start`);
          const h = event === 'child_completed' ? held.get(String(fields['child_name'])) : undefined;
          if (h) { h.entered = true; await h.hold; }
          order.push(`${label}:end`);
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      return { order, hooks, entered: (name: string) => held.get(name)?.entered === true, release: (name: string) => { held.get(name)?.release(); } };
    }
    /** `heldHooks` for one child: its hook held until `release`. */
    function heldHook(name: string) {
      const { order, hooks, entered, release } = heldHooks(name);
      return { order, hooks, state: { get entered() { return entered(name); } }, release: () => release(name) };
    }
    /** REQ-HOOKS-076's order for two children whose hooks overlap, `first`'s having started first and ended first. */
    const bothInOrder = (first: string, second: string) => ['session_start:start', 'session_start:end', `child_completed(${first}):start`, `child_completed(${second}):start`, `child_completed(${first}):end`, `child_completed(${second}):end`, 'iteration_end:start', 'iteration_end:end', 'session_end:start', 'session_end:end'];
    /** PD-ORCH-005 clause 1: an agent's words are in its recorded conversation once the step that said them has ended. */
    const said = (sid: SessionId, text: string): boolean => (dal.db.prepare('SELECT body FROM agent_messages WHERE session_id = ?').all(sid) as { body: string }[]).some((r) => r.body.includes(text));
    /** REQ-HOOKS-076: the order of a run in which each of the four events occurs once. */
    const inOrder = (child: string) => ['session_start:start', 'session_start:end', `child_completed(${child}):start`, `child_completed(${child}):end`, 'iteration_end:start', 'iteration_end:end', 'session_end:start', 'session_end:end'];
    const lifecycle = (order: readonly string[]) => order.filter((e) => !e.startsWith('root:'));
    const delegation = (name: string, background = true) => ({ callId: `d-${name}`, name: 'delegate', args: { persona: 'coding-agent', task_name: name, task: `TASK: ${name}`, run_in_background: background } });

    it('the fresh path: a background child whose execution raises outside its turn — the root is given its report, and the iteration ends, only after its hook', async () => {
      const { order, hooks, state, release } = heldHook('broken');
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') { order.push(`root:${turn}`); return turn === 1 ? toolCalls([delegation('broken')]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return answer('never reached');
      }, { raisingPort: 'broken', hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => state.entered && order.includes('root:2'));
      await settle(() => order.includes('root:3') || order.includes('iteration_end:start'), RACE_ROUNDS);
      // The hook holds the run: the root has not been given the report, and the iteration has not ended.
      expect(order).not.toContain('root:3');
      expect(order).not.toContain('iteration_end:start');
      release();
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(broken):end'));
      expect(lifecycle(order)).toEqual(inOrder('broken'));
    });

    it('the resume path: a paused child whose record cannot be decoded — the resumed root is given its report, and the iteration ends, only after its hook', async () => {
      const { order, hooks, state, release } = heldHook('one');
      let releaseStep!: () => void;
      const step = new Promise<void>((r) => { releaseStep = r; });
      const script = { resumed: false };
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') { order.push(`root:${turn}`); return turn === 1 ? toolCalls([delegation('one')]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (script.resumed) return answer('done');
        return { parts: [{ hold: step }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'one')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      releaseStep();
      await sessions.running(sid)!;
      const one = byName(sid, 'one')!;
      expect(one.state).toBe('paused');
      dal.db.prepare('UPDATE agent_messages SET body = ? WHERE session_id = ? AND task_id = ?').run('{not json', sid, one.task_id);
      script.resumed = true;
      order.length = 0;
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => state.entered);
      await settle(() => order.some((e) => e.startsWith('root:')) || order.includes('iteration_end:start'), RACE_ROUNDS);
      // The root resumed into waiting for `one` (OQ-97); it is given the report only once the hook is done.
      expect(order.filter((e) => e.startsWith('root:'))).toEqual([]);
      expect(order).not.toContain('iteration_end:start');
      release();
      await sessions.running(sid);
      expect(order.findIndex((e) => e.startsWith('root:'))).toBeGreaterThan(order.indexOf('child_completed(one):end'));
      expect(lifecycle(order)).toEqual(inOrder('one'));
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });

    it('a child that ends while its parent is still in its turn (the normal settle): the parent is given its report, and the iteration ends, only after its hook', async () => {
      const { order, hooks, state, release } = heldHook('quick');
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          if (turn === 1) return toolCalls([delegation('quick')]);
          // The root's step after the delegation is still streaming when the child ends and its hook starts.
          if (turn === 2) return { parts: [{ hold: rootStep }, ...answer('still working').parts] };
          return answer('handled');
        }
        if (persona === 'summariser') return answer('{"summary":"quick is done"}');
        return answer('quick: done');
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => state.entered);
      expect(byName(sid, 'quick')?.state).toBe('succeeded');
      releaseRoot();
      await settle(() => order.includes('root:3') || order.includes('iteration_end:start'), RACE_ROUNDS);
      expect(order).not.toContain('root:3');
      expect(order).not.toContain('iteration_end:start');
      release();
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(quick):end'));
      expect(lifecycle(order)).toEqual(inOrder('quick'));
    });

    it('a root whose turn fails while its child\'s hook still runs: the session ends only after the hook', async () => {
      const { order, hooks, state, release } = heldHook('broken');
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          return turn === 1 ? toolCalls([delegation('broken')]) : { parts: [{ hold: rootStep }, { error: modelError({ code: 'unknown', headline: 'the provider failed' }) }] };
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return answer('never reached');
      }, { raisingPort: 'broken', hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => state.entered);
      releaseRoot();
      await settle(() => order.includes('iteration_end:start') || order.includes('session_end:start'), RACE_ROUNDS);
      expect(order).not.toContain('iteration_end:start');
      expect(order).not.toContain('session_end:start');
      release();
      await sessions.running(sid);
      // Whatever else the failed turn leads to, the child's hook ends before the iteration's and the session's own.
      const done = order.indexOf('child_completed(broken):end');
      expect(done).toBeGreaterThan(-1);
      expect(order.filter((e, i) => i < done && (e.startsWith('iteration_end') || e.startsWith('session_end')))).toEqual([]);
      expect(order.at(-1)).toBe('session_end:end');
    });

    it('wait_for_tasks naming a child whose settle is still running: the wait returns its report only after its hook', async () => {
      const { order, hooks, state, release } = heldHook('quick');
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      let sid!: SessionId;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          if (turn === 1) return toolCalls([delegation('quick')]);
          // Asked once `quick` has ended and its hook has started: the wait finds it terminal at once.
          if (turn === 2) return { parts: [{ hold: rootStep }, ...toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [byName(sid, 'quick')!.task_id] } }]).parts] };
          return answer('handled');
        }
        if (persona === 'summariser') return answer('{"summary":"quick is done"}');
        return answer('quick: done');
      }, { hooks });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => state.entered);
      releaseRoot();
      await settle(() => order.includes('root:3'), RACE_ROUNDS);
      expect(order).not.toContain('root:3');
      release();
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(quick):end'));
      expect(lifecycle(order)).toEqual(inOrder('quick'));
    });

    it('wait_for_tasks naming two children: the second one\'s settle does not release the wait while the first one\'s hook still runs', async () => {
      const { order, hooks, state, release } = heldHook('first');
      let releaseFirst!: () => void;
      const firstStep = new Promise<void>((r) => { releaseFirst = r; });
      let releaseSecond!: () => void;
      const secondStep = new Promise<void>((r) => { releaseSecond = r; });
      const waited = { issued: false };
      let sid!: SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          if (turn === 1) return toolCalls([delegation('first'), delegation('second')]);
          if (turn === 2) return toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [byName(sid, 'first')!.task_id, byName(sid, 'second')!.task_id] } }]);
          return answer('handled');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: first') ? { parts: [{ hold: firstStep }, ...answer('first: done').parts] } : { parts: [{ hold: secondStep }, ...answer('second: done').parts] };
      }, { hooks, tool: (name, _args, _ctx, builtIn) => { if (name !== 'wait_for_tasks') return undefined; waited.issued = true; return builtIn(); } });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      // The wait is registered while both children still run, so it is released by a settle, not found done at once.
      await settle(() => waited.issued);
      releaseFirst();
      await settle(() => state.entered);
      releaseSecond();
      await settle(() => order.includes('child_completed(second):end'));
      await settle(() => order.includes('root:3'), RACE_ROUNDS);
      expect(order).not.toContain('root:3');
      release();
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(first):end'));
      expect(lifecycle(order).filter((e) => !e.startsWith('child_completed(second)'))).toEqual(inOrder('first'));
    });

    it('wait_for_tasks waiting on the first child\'s hook while the second ends and starts its own: the wait returns only once both hooks are done', async () => {
      const { order, hooks, entered, release } = heldHooks('first', 'second');
      let releaseFirst!: () => void;
      const firstStep = new Promise<void>((r) => { releaseFirst = r; });
      let releaseSecond!: () => void;
      const secondStep = new Promise<void>((r) => { releaseSecond = r; });
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      const waited = { issued: false };
      let sid!: SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          if (turn === 1) return toolCalls([delegation('first'), delegation('second')]);
          // Asked once `first` has ended and its hook has started, while `second` still runs.
          if (turn === 2) return { parts: [{ hold: rootStep }, ...toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [byName(sid, 'first')!.task_id, byName(sid, 'second')!.task_id] } }]).parts] };
          return answer('handled');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: first') ? { parts: [{ hold: firstStep }, ...answer('first: done').parts] } : { parts: [{ hold: secondStep }, ...answer('second: done').parts] };
      }, { hooks, tool: (name, _args, _ctx, builtIn) => { if (name !== 'wait_for_tasks') return undefined; waited.issued = true; return builtIn(); } });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => order.includes('root:2') && byName(sid, 'second')?.state === 'running');
      releaseFirst();
      await settle(() => entered('first'));
      releaseRoot();
      // The wait is issued while `first`'s hook holds: it waits on that settle.
      await settle(() => waited.issued);
      releaseSecond();
      await settle(() => entered('second'));
      release('first');
      await settle(() => order.includes('child_completed(first):end'));
      await settle(() => order.includes('root:3'), RACE_ROUNDS);
      // `second` ended while the wait waited on `first`: its hook still holds, so the wait has not returned its report.
      expect(order).not.toContain('root:3');
      release('second');
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(second):end'));
      expect(lifecycle(order)).toEqual(bothInOrder('first', 'second'));
    });

    it('the resume loop waiting on the first child\'s hook while the second ends and starts its own: the parent is given the reports only once both hooks are done', async () => {
      const { order, hooks, entered, release } = heldHooks('first', 'second');
      let releaseFirst!: () => void;
      const firstStep = new Promise<void>((r) => { releaseFirst = r; });
      let releaseSecond!: () => void;
      const secondStep = new Promise<void>((r) => { releaseSecond = r; });
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          if (turn === 1) return toolCalls([delegation('first'), delegation('second')]);
          // Still streaming when `first` ends: the turn ends with `first` ended and unobserved, so the loop finds it at once.
          if (turn === 2) return { parts: [{ hold: rootStep }, ...answer('root is still working').parts] };
          return answer('handled');
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: first') ? { parts: [{ hold: firstStep }, ...answer('first: done').parts] } : { parts: [{ hold: secondStep }, ...answer('second: done').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => order.includes('root:2') && byName(sid, 'second')?.state === 'running');
      releaseFirst();
      await settle(() => entered('first'));
      releaseRoot();
      // The root's turn has ended: its loop waits on `first`'s settle.
      await settle(() => said(sid, 'root is still working'));
      await new Promise((r) => setTimeout(r, 20));
      releaseSecond();
      await settle(() => entered('second'));
      release('first');
      await settle(() => order.includes('child_completed(first):end'));
      await settle(() => order.includes('root:3'), RACE_ROUNDS);
      // `second` ended while the loop waited on `first`: its hook still holds, so neither report has been given.
      expect(order).not.toContain('root:3');
      release('second');
      await sessions.running(sid);
      expect(order.indexOf('root:3')).toBeGreaterThan(order.indexOf('child_completed(second):end'));
      expect(lifecycle(order)).toEqual(bothInOrder('first', 'second'));
    });

    it('a root whose turn fails while the first child\'s hook runs, the second then ending and starting its own: the session ends only after both hooks', async () => {
      const { order, hooks, entered, release } = heldHooks('first', 'second');
      let releaseFirst!: () => void;
      const firstStep = new Promise<void>((r) => { releaseFirst = r; });
      let releaseSecond!: () => void;
      const secondStep = new Promise<void>((r) => { releaseSecond = r; });
      let releaseRoot!: () => void;
      const rootStep = new Promise<void>((r) => { releaseRoot = r; });
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          order.push(`root:${turn}`);
          return turn === 1 ? toolCalls([delegation('first'), delegation('second')]) : { parts: [{ hold: rootStep }, { error: modelError({ code: 'unknown', headline: 'the provider failed' }) }] };
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: first') ? { parts: [{ hold: firstStep }, ...answer('first: done').parts] } : { parts: [{ hold: secondStep }, ...answer('second: done').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => order.includes('root:2') && byName(sid, 'second')?.state === 'running');
      releaseFirst();
      await settle(() => entered('first'));
      // The root's turn fails with `second` still running: the end of its loop waits on `first`'s settle.
      releaseRoot();
      await new Promise((r) => setTimeout(r, 20));
      releaseSecond();
      await settle(() => entered('second'));
      release('first');
      await settle(() => order.includes('child_completed(first):end'));
      await settle(() => order.includes('iteration_end:start') || order.includes('session_end:start'), RACE_ROUNDS);
      // `second` ended while the root waited on `first`: its hook still holds, so the iteration has not ended.
      expect(order).not.toContain('iteration_end:start');
      expect(order).not.toContain('session_end:start');
      release('second');
      await sessions.running(sid);
      // Whatever else the failed turn leads to, both hooks end before the iteration's and the session's own.
      const done = order.indexOf('child_completed(second):end');
      expect(done).toBeGreaterThan(order.indexOf('child_completed(first):end'));
      expect(order.filter((e, i) => i < done && (e.startsWith('iteration_end') || e.startsWith('session_end')))).toEqual([]);
      expect(order.at(-1)).toBe('session_end:end');
    });

    it('REQ-ORCH-088: a child that lands at its own limit while a child of its own is still in its hook settles only after that hook', async () => {
      const { order, hooks, state, release } = heldHook('leaf');
      let releaseLeaf!: () => void;
      const leafStep = new Promise<void>((r) => { releaseLeaf = r; });
      let releaseMid!: () => void;
      const midStep = new Promise<void>((r) => { releaseMid = r; });
      let midAsked = 0;
      let sid!: SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') { order.push(`root:${turn}`); return turn === 1 ? toolCalls([delegation('mid')]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (!textOf(req).includes('TASK: mid')) return { parts: [{ hold: leafStep }, ...answer('leaf: done').parts] };
        midAsked += 1;
        if (midAsked === 1) return toolCalls([delegation('leaf')]);
        // In flight when the limit expires: it finishes, and the child stops before its next step (the landing).
        if (midAsked === 2) return { parts: [{ hold: midStep }, ...toolCalls([{ callId: 'b1', name: 'background_output', args: { task_id: byName(sid, 'leaf')!.task_id } }], 'Checking on leaf.').parts] };
        return answer('mid: never asked again');
      }, { hooks, childTimeoutMs: 60_000 });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => midAsked === 2 && byName(sid, 'leaf')?.state === 'running');
      releaseLeaf();
      await settle(() => state.entered);
      clock.advance(60_000);
      releaseMid();
      await settle(() => order.includes('child_completed(mid):start') || order.includes('iteration_end:start'), RACE_ROUNDS);
      // `mid` has landed, its loop ended with `leaf` in its hook: it has not settled, and the iteration has not ended.
      expect(order).not.toContain('child_completed(mid):start');
      expect(order).not.toContain('iteration_end:start');
      expect(byName(sid, 'mid')?.state).toBe('running');
      release();
      await sessions.running(sid);
      expect(midAsked).toBe(2);
      const mid = byName(sid, 'mid')!;
      expect(mid.state).toBe('failed');
      expect((JSON.parse(mid.report!) as { errors: { type: string }[] }).errors.map((e) => e.type)).toContain('timeout');
      expect(lifecycle(order)).toEqual(['session_start:start', 'session_start:end', 'child_completed(leaf):start', 'child_completed(leaf):end', 'child_completed(mid):start', 'child_completed(mid):end', 'iteration_end:start', 'iteration_end:end', 'session_end:start', 'session_end:end']);
    });
  });

  describe('REQ-ORCH-048 / REQ-TOOLS-156 / REQ-HOOKS-079, the repair of a-raise-after-a-childs-terminal-transition-never-releases-its-parent: a `child_completed` hook that raises still releases the parent', () => {
    const settle = async (until: () => boolean, rounds = 400) => { for (let i = 0; i < rounds && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow | undefined => children(sid).find((c) => c.canonical_name === name);
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
    /** A hook port whose `child_completed` raises — the port's contract does not say it never does — counting each firing. */
    function raisingHooks() {
      const fired: string[] = [];
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => { if (event === 'child_completed') { fired.push(String(fields['child_name'])); throw new Error('the hook port exploded'); } return []; },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      return { hooks, fired };
    }

    it('the settle in `execute`: a foreground delegation\'s wait (REQ-TOOLS-156) resolves with the report, once, and the run ends', async () => {
      const { hooks, fired } = raisingHooks();
      const rootAsked: string[] = [];
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') { rootAsked.push(textOf(req)); return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quick', task: 'TASK: quick', run_in_background: false } }]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"quick is done"}');
        return answer('quick: done');
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => rootAsked.length >= 2);
      // Without the repair the wait never resolves: the child is `succeeded`, and its parent is never told.
      expect(byName(sid, 'quick')?.state).toBe('succeeded');
      expect(rootAsked).toHaveLength(2);
      expect(rootAsked[1]).toContain('quick: done');
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('completed');
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
      // The hook fired once; its raise reduced to a warning naming it (REQ-HOOKS-079), and the report reached the root once.
      expect(fired).toEqual(['quick']);
      expect(warnings.filter((w) => w.includes('child_completed') && w.includes('the hook port exploded'))).toHaveLength(1);
      expect(rootAsked.filter((t) => t.includes('quick: done'))).toHaveLength(1);
      // REQ-ORCH-098: its teardown is whole.
      const row = byName(sid, 'quick')!;
      expect(dal.timelineOf(sid).filter((t) => JSON.parse(t.metadata).task_id === row.task_id && ['child_end', 'child_result', 'child_conversation_closed'].includes(t.name)).map((t) => t.name)).toEqual(['child_end', 'child_result', 'child_conversation_closed']);
    });

    it('the settle in `execute`: a parent waiting in its resume loop for a background child is resumed with the report', async () => {
      const { hooks, fired } = raisingHooks();
      let releaseChild!: () => void;
      const childStep = new Promise<void>((r) => { releaseChild = r; });
      const rootAsked: string[] = [];
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') { rootAsked.push(textOf(req)); return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: slow' } }]) : answer(turn === 2 ? 'waiting for slow' : 'handled'); }
        if (persona === 'summariser') return answer('{"summary":"slow is done"}');
        return { parts: [{ hold: childStep }, ...answer('slow: done').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => rootAsked.length === 2 && byName(sid, 'slow')?.state === 'running');
      await new Promise((r) => setTimeout(r, 20));
      releaseChild();
      await settle(() => rootAsked.length >= 3);
      expect(byName(sid, 'slow')?.state).toBe('succeeded');
      expect(rootAsked).toHaveLength(3);
      expect(rootAsked[2]).toContain('slow: done');
      expect((await sessions.running(sid)!).status).toBe('completed');
      // The report reached the root once: its last request, which carries its whole conversation, holds it once.
      expect(rootAsked[2]!.split('slow: done')).toHaveLength(2);
      expect(fired).toEqual(['slow']);
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });

    it('the settle in `settleRaised`: a child whose execution raised outside its turn still releases its parent\'s foreground wait', async () => {
      const { hooks, fired } = raisingHooks();
      let releaseFirst!: () => void;
      const firstStep = new Promise<void>((r) => { releaseFirst = r; });
      const rootAsked: string[] = [];
      // One model slot (REQ-ORCH-050): `broken` is held behind `first`, so it starts — and raises — only once its parent is
      // already waiting on it, rather than inside the delegation, before the wait begins.
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') { rootAsked.push(textOf(req)); return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'first', task: 'TASK: first' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'broken', task: 'TASK: broken', run_in_background: false } }]) : answer('handled'); }
        if (persona === 'summariser') return answer('{"summary":"first is done"}');
        return { parts: [{ hold: firstStep }, ...answer('first: done').parts] };
      }, { raisingPort: 'broken', hooks, cap: 1 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'broken')?.state === 'waiting_on_model_slot');
      releaseFirst();
      await settle(() => rootAsked.length >= 2);
      expect(byName(sid, 'broken')?.state).toBe('failed');
      expect(rootAsked[1]).toContain('no tool port for broken');
      expect((await sessions.running(sid)!).status).toBe('completed');
      // Then resumed once more, with `first`'s report — whose own hook raised too.
      expect(rootAsked).toHaveLength(3);
      expect(rootAsked[2]).toContain('first: done');
      // Each report reached the root once: its last request, which carries its whole conversation, holds each once.
      expect(rootAsked[2]!.split('no tool port for broken')).toHaveLength(2);
      expect(rootAsked[2]!.split('first: done')).toHaveLength(2);
      expect(fired.sort()).toEqual(['broken', 'first']);
      expect(warnings.filter((w) => w.includes('child_completed') && w.includes('the hook port exploded'))).toHaveLength(2);
      expect(dal.iterationsOf(sid)[0]).toMatchObject({ iteration: 1, state: 'closed' });
    });
  });

  /**
   * REQ-HOOKS-003 ("`child_completed` once a delegated child agent has finished, whatever its final state"), REQ-HOOKS-075
   * (its `state` is one of `succeeded`, `failed`, `cancelled` or `blocked`), REQ-ORCH-048 and REQ-ORCH-052 (terminal-state
   * callbacks fire for cascaded and swept records "exactly as for directly completed ones"): the repair of
   * `a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`. Only a child's own execution and
   * `settleRaised` fired it; every other path that ends a child fired nothing.
   */
  describe('REQ-HOOKS-003 / REQ-ORCH-048 / REQ-ORCH-052 / REQ-ORCH-053 / REQ-ORCH-133 / PD-ORCH-005 clause 6: a child settled outside its execution fires `child_completed`', () => {
    const settle = async (until: () => boolean, rounds = 400) => { for (let i = 0; i < rounds && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const byName = (sid: SessionId, name: string): ChildRow => children(sid).find((c) => c.canonical_name === name)!;
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
    /**
     * Every lifecycle occurrence in order, a `child_completed` labelled by its child, and each `child_completed`'s fields.
     * `held`: the child whose `child_completed` is held until `release`, its end then recorded as `…:end`.
     */
    function recordingHooks(held?: string) {
      const order: string[] = [];
      const completed: Record<string, unknown>[] = [];
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          if (event !== 'child_completed') { order.push(event); return []; }
          const name = String(fields['child_name']);
          completed.push({ ...fields });
          order.push(`child_completed(${name})`);
          if (name === held) { await hold; order.push(`child_completed(${name}):end`); }
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      return { order, completed, hooks, release: () => release() };
    }
    const fieldsOf = (row: ChildRow, state: string, summary: string) => ({ child_id: row.task_id, child_name: row.canonical_name, persona: row.persona, state, status: state, summary });

    it('REQ-ORCH-048: a child the cascade blocks fires it, `blocked`, with its report\'s summary, before the iteration ends', async () => {
      const { order, completed, hooks } = recordingHooks();
      let sid = '' as SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'a', task: 'TASK: a' } }]);
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'b', task: 'TASK: b', depends_on: [byName(sid, 'a').task_id] } }]);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        // `a` says nothing and calls nothing, twice, so it ends failed and `b` is blocked.
        return answer(textOf(req).includes('TASK: b') ? 'b ran.' : '');
      }, { hooks });
      sid = (sessions.start(dal, 'C:/ws', 'a then b') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const b = byName(sid, 'b');
      expect(b.state).toBe('blocked');
      expect(completed.filter((f) => f['child_name'] === 'b')).toEqual([fieldsOf(b, 'blocked', (JSON.parse(b.report!) as { summary: string }).summary)]);
      expect(order.filter((e) => e.startsWith('child_completed(b)'))).toHaveLength(1);
      expect(order.indexOf('child_completed(b)')).toBeGreaterThan(order.indexOf('child_completed(a)'));
      expect(order.indexOf('child_completed(b)')).toBeLessThan(order.indexOf('iteration_end'));
    });

    it('REQ-ORCH-133: the user\'s cancel of one running child fires it once, `cancelled`, before the iteration ends', async () => {
      const { order, completed, hooks } = recordingHooks();
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      releaseChild();
      expect((await sessions.running(sid)!).status).toBe('completed');
      const work = byName(sid, 'work');
      expect(work.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(work, 'cancelled', 'The user cancelled this child.')]);
      expect(order).toEqual(['session_start', 'child_completed(work)', 'iteration_end', 'session_end']);
    });

    it('REQ-ORCH-052: a child the finalize sweep cancels at the explicit cancel — one that never started — fires it once, `cancelled`, before the run ends', async () => {
      // `second`'s hook is held: the run ends only after it (REQ-HOOKS-076 / REQ-HOOKS-080).
      const { order, completed, hooks, release } = recordingHooks('second');
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      // One model slot (REQ-ORCH-050): `second` waits behind `first`, so no execution of its own ends it.
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'first', task: 'TASK: first' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'second', task: 'TASK: second' } }]) : answer('never');
        if (persona === 'summariser') return answer('{}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks, cap: 1 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'first')?.state === 'running' && byName(sid, 'second')?.state === 'waiting_on_model_slot');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      releaseChild();
      await settle(() => order.includes('child_completed(second)'));
      await settle(() => order.includes('session_end'), 40);
      expect(order).not.toContain('session_end');
      release();
      await sessions.running(sid)!;
      const second = byName(sid, 'second');
      expect(second.state).toBe('cancelled');
      expect(completed.filter((f) => f['child_name'] === 'second')).toEqual([fieldsOf(second, 'cancelled', (JSON.parse(second.report!) as { summary: string }).summary)]);
      expect(order.filter((e) => e.startsWith('child_completed') && !e.endsWith(':end')).sort()).toEqual(['child_completed(first)', 'child_completed(second)']);
      expect(order.indexOf('child_completed(second):end')).toBeLessThan(order.indexOf('session_end'));
    });

    it('REQ-ORCH-052: a child the finalize sweep cancels at an ordinary exit — its root\'s turn failed — fires it, and the iteration ends only after it', async () => {
      const { order, completed, hooks, release } = recordingHooks('work');
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : { parts: [{ error: modelError({ code: 'unknown', headline: 'the provider failed' }) }] };
        if (persona === 'summariser') return answer('{}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => order.includes('child_completed(work)'));
      await settle(() => order.includes('iteration_end') || order.includes('session_end'), 40);
      // The sweep's hook holds the run: neither the iteration's hook nor the session's has started (REQ-HOOKS-076/080).
      expect(order).not.toContain('iteration_end');
      expect(order).not.toContain('session_end');
      release();
      releaseChild();
      await sessions.running(sid)!;
      const work = byName(sid, 'work');
      expect(work.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(work, 'cancelled', (JSON.parse(work.report!) as { summary: string }).summary)]);
      const done = order.indexOf('child_completed(work):end');
      expect(order.filter((e, i) => i < done && (e === 'iteration_end' || e === 'session_end'))).toEqual([]);
      expect(order.at(-1)).toBe('session_end');
    });

    it('REQ-ORCH-053: a child a previous run left unfinished, settled by the next run, fires it after that run\'s `session_start`', async () => {
      const { order, completed, hooks } = recordingHooks();
      const { sessions } = sessionsWith((persona) => (persona === 'orchestrator' ? answer('hi') : answer('{}')), { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await sessions.running(sid)!;
      // A child left `running` by a previous run, as a killed host would leave it.
      dal.insertChild({ session_id: sid, task_id: 'bg_0000dead', canonical_name: 'ghost', given_name: 'ghost', persona: 'coding-agent', state: 'running', parent_id: dal.iterationsOf(sid)[0]!.root_task_id, depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: new Date(Number(clock.instant())).toISOString() });
      order.length = 0;
      expect(sessions.prompt(sid, 'again').ok).toBe(true);
      await sessions.running(sid)!;
      const ghost = byName(sid, 'ghost');
      expect(ghost.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(ghost, 'cancelled', 'Cancelled: the run that owned this child ended (killed host or hard cancel) before it settled.')]);
      expect(order.slice(0, 2)).toEqual(['session_start', 'child_completed(ghost)']);
    });

    it('PD-ORCH-005 clause 6: "continue without them" fires it for each paused agent it cancels, after the continuing run\'s `session_start`', async () => {
      const { order, completed, hooks } = recordingHooks();
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      releaseChild();
      await sessions.running(sid)!;
      expect(byName(sid, 'work').state).toBe('paused');
      expect(completed).toEqual([]);
      order.length = 0;
      expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
      await sessions.running(sid)!;
      const work = byName(sid, 'work');
      expect(work.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(work, 'cancelled', (JSON.parse(work.report!) as { summary: string }).summary)]);
      expect(order.slice(0, 2)).toEqual(['session_start', 'child_completed(work)']);
    });

    it('REQ-HOOKS-076 with clause 22 (found by the verification of this repair): a child followed up while its cancel\'s hook still runs fires it once for each end, not a third time when the first hook ends mid-way through the second', async () => {
      const gateOf = () => { let open!: () => void; const hold = new Promise<void>((r) => { open = r; }); return { hold, open: () => open() }; };
      const ends: string[] = [];
      const gates = [gateOf(), gateOf()];
      let n = 0;
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          if (event !== 'child_completed') return [];
          const i = n; n += 1;
          ends.push(String(fields['state']));
          await gates[i]?.hold;
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      let sid = '' as SessionId;
      const rootGate = gateOf();
      let releaseChild!: () => void;
      const childHold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
          // Its second step is held until the cancel's hook is running, then follows the cancelled child up.
          if (turn === 2) return { parts: [{ hold: rootGate.hold }, ...toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: again', session_id: byName(sid, 'work').task_id } }]).parts] };
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: again') ? answer('Done again.') : { parts: [{ hold: childHold }, ...answer('late').parts] };
      }, { hooks });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      releaseChild();
      await settle(() => ends.length === 1);
      rootGate.open();
      // The follow-up ends and its own settle's hook starts while the cancel's hook still runs.
      await settle(() => ends.length === 2);
      expect(ends).toEqual(['cancelled', 'succeeded']);
      gates[0]!.open();
      await new Promise((r) => setTimeout(r, 20));
      gates[1]!.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(byName(sid, 'work').state).toBe('succeeded');
      expect(ends).toEqual(['cancelled', 'succeeded']);
    });

    it('REQ-HOOKS-080 (the third verification of this repair): a parent takes a child the user cancelled as ended only once its `child_completed` hook is done — its next model step waits for the hook', async () => {
      const { order, hooks, release } = recordingHooks('work');
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          order.push(`root(${turn})`);
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work', background: true } }]) : answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      // The root's turn has ended and it waits on its child in the resume loop.
      await settle(() => byName(sid, 'work')?.state === 'running' && order.includes('root(2)'));
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      releaseChild();
      await settle(() => order.includes('child_completed(work)'));
      await settle(() => order.includes('root(3)'), 40);
      // The cancel woke the parent, but the child is settling until its hook is done: no model step yet.
      expect(order).not.toContain('root(3)');
      release();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(order.indexOf('root(3)')).toBeGreaterThan(order.indexOf('child_completed(work):end'));
    });

    it('REQ-HOOKS-003 (the third verification of this repair): a store that cannot be read as the scheduler is told still fires the hook, from the moved row', async () => {
      const { completed, hooks } = recordingHooks();
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      const workId = byName(sid, 'work').task_id;
      // The cancel's timeline entry arms one failed read of the child's record: the next, the terminal listener's.
      let armed = false;
      const insert = dal.insertTimeline.bind(dal);
      const inserted = vi.spyOn(dal, 'insertTimeline').mockImplementation((...args: Parameters<typeof dal.insertTimeline>) => { if (args[3] === 'child_user_cancelled') armed = true; return insert(...args); });
      const getChild = dal.getChild.bind(dal);
      let raised = 0;
      const read = vi.spyOn(dal, 'getChild').mockImplementation((s: SessionId, taskId: string) => {
        if (armed && taskId === workId) { armed = false; raised += 1; throw new Error('SQLITE_IOERR: disk I/O error'); }
        return getChild(s, taskId);
      });
      try {
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: workId } })).toEqual({ ok: true });
      } finally { inserted.mockRestore(); read.mockRestore(); }
      expect(raised).toBe(1);
      releaseChild();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(byName(sid, 'work').state).toBe('cancelled');
      expect(completed.map((f) => [f['child_name'], f['state']])).toEqual([['work', 'cancelled']]);
    });

    it('REQ-HOOKS-080 with clause 22 (the third verification of this repair): a child followed up while its cancel\'s hook runs is still settling when that hook ends and the follow-up\'s own hook runs — its parent waits for the second', async () => {
      const gateOf = () => { let open!: () => void; const hold = new Promise<void>((r) => { open = r; }); return { hold, open: () => open() }; };
      const order: string[] = [];
      const gates = [gateOf(), gateOf()];
      let n = 0;
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          if (event !== 'child_completed') return [];
          const i = n; n += 1;
          order.push(`hook${i}(${String(fields['state'])})`);
          await gates[i]?.hold;
          order.push(`hook${i}:end`);
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      let sid = '' as SessionId;
      const followGate = gateOf();
      const endTurnGate = gateOf();
      let releaseChild!: () => void;
      const childHold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          order.push(`root(${turn})`);
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
          // Held until the cancel's hook is running, then follows the cancelled child up.
          if (turn === 2) return { parts: [{ hold: followGate.hold }, ...toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: again', session_id: byName(sid, 'work').task_id } }]).parts] };
          // Held until the follow-up has ended and the cancel's hook has ended too: the turn then ends and the root finds
          // its child ended on its own, while the follow-up's own hook still runs.
          if (turn === 3) return { parts: [{ hold: endTurnGate.hold }, ...answer('root turn 3').parts] };
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return textOf(req).includes('TASK: again') ? answer('Done again.') : { parts: [{ hold: childHold }, ...answer('late').parts] };
      }, { hooks });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      releaseChild();
      await settle(() => order.includes('hook0(cancelled)'));
      followGate.open();
      // The follow-up ends `succeeded` and its own settle's hook starts while the cancel's hook still runs.
      await settle(() => order.includes('hook1(succeeded)'));
      gates[0]!.open();
      await settle(() => order.includes('hook0:end'));
      endTurnGate.open();
      await settle(() => order.includes('root(4)'), 40);
      // The first hook's end did not end the second's settle: the root has not been resumed with its child's report.
      expect(order).not.toContain('root(4)');
      gates[1]!.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(byName(sid, 'work').state).toBe('succeeded');
      expect(order.indexOf('root(4)')).toBeGreaterThan(order.indexOf('hook1:end'));
    });

    /**
     * Two children, `y` and `x`. The user cancels `y`, whose hook is held, then `x`, whose hook is queued behind it; the
     * root follows `x` up (clause 22) before `y`'s hook ends. `again` says how the follow-up goes.
     */
    function queuedBehindAHeldHook(again: 'answers' | 'holds') {
      const gateOf = () => { let open!: () => void; const hold = new Promise<void>((r) => { open = r; }); return { hold, open: () => open() }; };
      const fired: { name: string; state: string; summary: string }[] = [];
      const yGate = gateOf();
      const rootGate = gateOf();
      const againGate = gateOf();
      let releaseChild!: () => void;
      const childHold = new Promise<void>((r) => { releaseChild = r; });
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          if (event !== 'child_completed') return [];
          const name = String(fields['child_name']);
          fired.push({ name, state: String(fields['state']), summary: String(fields['summary']) });
          if (name === 'y') await yGate.hold;
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      let sid = '' as SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'y', task: 'TASK: y' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'x', task: 'TASK: x' } }]);
          if (turn === 2) return { parts: [{ hold: rootGate.hold }, ...toolCalls([{ callId: 'd3', name: 'delegate', args: { persona: 'coding-agent', task_name: 'x', task: 'TASK: again', session_id: byName(sid, 'x').task_id } }]).parts] };
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"the follow-up\'s summary"}');
        if (textOf(req).includes('TASK: again')) return again === 'answers' ? answer('Done again.') : { parts: [{ hold: againGate.hold }, ...answer('late again').parts] };
        return { parts: [{ hold: childHold }, ...answer('late').parts] };
      }, { hooks });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      const cancelBoth = async () => {
        await settle(() => byName(sid, 'y')?.state === 'running' && byName(sid, 'x')?.state === 'running');
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'y').task_id } })).toEqual({ ok: true });
        await settle(() => fired.length === 1);
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'x').task_id } })).toEqual({ ok: true });
        releaseChild();
        rootGate.open();
      };
      return { sessions, sid, fired, cancelBoth, releaseY: yGate.open, releaseAgain: againGate.open };
    }

    it('REQ-HOOKS-075 / REQ-HOOKS-076 with clause 22 (found by the verification of this repair): a hook queued behind another carries the fields of the end that queued it, not those of a later end of the same child', async () => {
      const { sessions, sid, fired, cancelBoth, releaseY } = queuedBehindAHeldHook('answers');
      await cancelBoth();
      // The follow-up ends `succeeded` and its own settle's hook runs while `x`'s cancel's hook still waits behind `y`'s.
      await settle(() => fired.some((f) => f.name === 'x'));
      expect(byName(sid, 'x').state).toBe('succeeded');
      expect(fired.map((f) => `${f.name}:${f.state}`)).toEqual(['y:cancelled', 'x:succeeded']);
      releaseY();
      expect((await sessions.running(sid)!).status).toBe('completed');
      // Each end once, each with its own state and summary: the cancel's is not replaced by the follow-up's record.
      const xs = fired.filter((f) => f.name === 'x').sort((a, b) => a.state.localeCompare(b.state));
      expect(xs).toEqual([{ name: 'x', state: 'cancelled', summary: 'The user cancelled this child.' }, { name: 'x', state: 'succeeded', summary: 'the follow-up\'s summary' }]);
      expect(fired.filter((f) => f.name === 'y')).toEqual([{ name: 'y', state: 'cancelled', summary: 'The user cancelled this child.' }]);
    });

    it('REQ-HOOKS-003 with clause 22 (found by the verification of this repair): a followed-up child cancelled again while its first cancel\'s hook is still queued fires it for the second cancel too', async () => {
      const { sessions, sid, fired, cancelBoth, releaseY, releaseAgain } = queuedBehindAHeldHook('holds');
      await cancelBoth();
      // The follow-up is running while `x`'s first cancel's hook still waits behind `y`'s; the user cancels it again.
      await settle(() => byName(sid, 'x')?.state === 'running');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'x').task_id } })).toEqual({ ok: true });
      releaseAgain();
      releaseY();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(byName(sid, 'x').state).toBe('cancelled');
      expect(fired.filter((f) => f.name === 'x')).toEqual([
        { name: 'x', state: 'cancelled', summary: 'The user cancelled this child.' },
        { name: 'x', state: 'cancelled', summary: 'The user cancelled this child.' },
      ]);
    });

    /**
     * Two children, `a` and `b`, each held in its step, and `b`'s `child_completed` held. The run is brought to rest by
     * `op` and the user cancels `b` while the rest waits on the executions it saw when it began (the fourth verification
     * of this repair). The children are deaf to the stop's abort, so a stop's rest waits on their steps as a pause's does.
     */
    async function cancelledWhileTheRestWaits(op: 'pause' | 'cancel') {
      const { order, completed, hooks, release } = recordingHooks('b');
      const gateOf = () => { let open!: () => void; const hold = new Promise<void>((r) => { open = r; }); return { hold, open: () => open() }; };
      const aGate = gateOf();
      const bGate = gateOf();
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'a', task: 'TASK: a' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'b', task: 'TASK: b' } }]) : answer('never');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold: textOf(req).includes('TASK: b') ? bGate.hold : aGate.hold }, ...answer('late').parts] };
      }, { hooks, deaf: ['child'] });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'a')?.state === 'running' && byName(sid, 'b')?.state === 'running');
      expect(sessions.control({ op, sessionId: sid, args: {} })).toEqual({ ok: true });
      await new Promise((r) => setTimeout(r, 20));
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'b').task_id } })).toEqual({ ok: true });
      bGate.open();
      await settle(() => order.includes('child_completed(b)'));
      aGate.open();
      await settle(() => order.includes('session_end') || dal.timelineOf(sid).some((t) => t.name === 'iteration_paused'), 40);
      return { sessions, sid, order, completed, release };
    }

    it('REQ-HOOKS-076 / REQ-HOOKS-080 with PD-ORCH-005 clause 2 (the fourth verification of this repair): a child the user cancels while a pause waits on the executions is waited for too — its `child_completed` ends before the rest is recorded and before `session_end`', async () => {
      const { sessions, sid, order, completed, release } = await cancelledWhileTheRestWaits('pause');
      // The rest still waits: the hook `b`'s cancel queued is an execution it waits for, though it began after the rest did.
      expect(dal.timelineOf(sid).some((t) => t.name === 'iteration_paused')).toBe(false);
      expect(order).not.toContain('session_end');
      release();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(byName(sid, 'a').state).toBe('paused');
      const b = byName(sid, 'b');
      expect(b.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(b, 'cancelled', 'The user cancelled this child.')]);
      expect(order).toEqual(['session_start', 'child_completed(b)', 'child_completed(b):end', 'session_end']);
    });

    it('REQ-HOOKS-076 / REQ-HOOKS-080 with REQ-SESSION-092 (the fourth verification of this repair): a child the user cancels while a stop waits on the executions is waited for within the stop\'s grace — its `child_completed` ends before `session_end`', async () => {
      const { sessions, sid, order, release } = await cancelledWhileTheRestWaits('cancel');
      expect(dal.timelineOf(sid).some((t) => t.name === 'iteration_paused')).toBe(false);
      expect(order).not.toContain('session_end');
      release();
      await sessions.running(sid)!;
      expect(byName(sid, 'b').state).toBe('cancelled');
      expect(order).toEqual(['session_start', 'child_completed(b)', 'child_completed(b):end', 'session_end']);
    });

    it('REQ-HOOKS-076 / REQ-HOOKS-080 (the fourth verification of this repair): a paused child the user cancels once the rest is recorded, before the run ends, fires `child_completed` before `session_end`', async () => {
      const { order, completed, hooks, release } = recordingHooks('work');
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      let releaseDrain!: () => void;
      const drainHold = new Promise<void>((r) => { releaseDrain = r; });
      let holding = false;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('never');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      // REQ-EVENTS-165: the open iteration's drain waits on this consumer. The hold is taken at the first delivery once the
      // child is paused, which the rest's own drain — after `iteration_paused` is written — is queued behind. Holding only
      // once `iteration_paused` was in the timeline left the hold to whichever forward happened to straddle that write, and
      // one microtask more on a child's turn (the stall watch's `betweenTurns`, OQ-155) let the rest's drain pass first, so
      // the cancel landed after the run's last wait on the outside hooks — the open defect
      // `a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md`, not the path this case pins.
      sessions.bus.attach(sid, { mode: 'blocking', deliver: () => { if (dal.timelineOf(sid).some((t) => t.name === 'child_paused')) { holding = true; return drainHold; } return undefined; } });
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      releaseChild();
      await settle(() => holding && dal.timelineOf(sid).some((t) => t.name === 'iteration_paused'));
      expect(dal.timelineOf(sid).some((t) => t.name === 'iteration_paused')).toBe(true);
      expect(byName(sid, 'work').state).toBe('paused');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      await settle(() => order.includes('child_completed(work)'));
      releaseDrain();
      await settle(() => order.includes('session_end'), 40);
      expect(order).not.toContain('session_end');
      release();
      await sessions.running(sid)!;
      const work = byName(sid, 'work');
      expect(work.state).toBe('cancelled');
      expect(completed).toEqual([fieldsOf(work, 'cancelled', 'The user cancelled this child.')]);
      expect(order).toEqual(['session_start', 'child_completed(work)', 'child_completed(work):end', 'session_end']);
    });

    it('REQ-HOOKS-076 / REQ-HOOKS-081 with OQ-154 (the repair of a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md): a paused child the user cancels while `session_end` runs ends `cancelled` and fires no `child_completed` after it', async () => {
      const order: string[] = [];
      let releaseEnd!: () => void;
      const endHold = new Promise<void>((r) => { releaseEnd = r; });
      const hooks: HookPort = {
        auditSnapshot: () => [], trust: () => ({ withheld: 0, reinstated: 0, notice: '', workspace: 'C:/ws', fingerprint: 'f', loadWarning: '' }), announceWithheld: () => 0, hasHooksFor: () => true,
        fireLifecycle: async (event, fields) => {
          order.push(event === 'child_completed' ? `child_completed(${String(fields['child_name'])})` : event);
          if (event === 'session_end') await endHold;
          return [];
        },
        advisory: () => '', toolHooks: { preTool: async () => ({ blocked: false, refusal: '' }), postTool: async () => ({ feedback: '' }) },
      };
      let releaseChild!: () => void;
      const hold = new Promise<void>((r) => { releaseChild = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('never');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        return { parts: [{ hold }, ...answer('late').parts] };
      }, { hooks });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => byName(sid, 'work')?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      releaseChild();
      await settle(() => order.includes('session_end'));
      expect(byName(sid, 'work').state).toBe('paused');
      // While the run's `session_end` hook runs, the user cancels the paused child: it ends `cancelled` (REQ-ORCH-133), and
      // its `child_completed` is not fired after `session_end` (OQ-154's reading, confirmed 2026-10-06 by R-071: none fires where the run has announced its end).
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
      expect(byName(sid, 'work').state).toBe('cancelled');
      releaseEnd();
      await sessions.running(sid)!;
      await new Promise((r) => setTimeout(r, 30));
      expect(order).toEqual(['session_start', 'session_end']);
      expect(dal.timelineOf(sid).map((t) => t.name)).toContain('child_user_cancelled');
    });
  });

  describe('PD-ORCH-005 clause 15: a forced stop is a stop, and a quit rests by quit', () => {
    const restsBy = async (sessions: Sessions, sid: SessionId, interruption: 'stop' | 'quit') => {
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('interrupted');
      expect(children(sid)[0]!).toMatchObject({ state: 'paused', interruption, completed_at: null, report_stored: 0 });
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', outcome: null, interruption }]);
      expect(dal.getSession(sid)!.execution_status).toBe('paused');
    };

    it('a stop forced at its first activation leaves the child paused by the stop and the iteration open, as a graceful one does', async () => {
      const { sessions, release } = holdingChild();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: { force: true } })).toEqual({ ok: true });
      release();
      await restsBy(sessions, sid, 'stop');
    });

    it('a second activation of the stop control forces it (REQ-SESSION-186), and it still comes to rest', async () => {
      const { sessions, release } = holdingChild();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await restsBy(sessions, sid, 'stop');
    });

    it('the application\'s quit (`announceShutdown`, what a board run is sent at the last window\'s close) rests by quit', async () => {
      const { sessions, release } = holdingChild();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      expect(sessions.control({ op: 'announceShutdown', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await restsBy(sessions, sid, 'quit');
    });

    it('a stop that reaches the run before the quit keeps its reason: the run rests by stop (why the board sends the quit)', async () => {
      const { sessions, release } = holdingChild();
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await new Promise((r) => setTimeout(r, 10));
      expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
      expect(sessions.control({ op: 'announceShutdown', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await restsBy(sessions, sid, 'stop');
    });
  });

  describe('REQ-ORCH-098, the repair of a-child-that-never-started-gets-no-teardown-timeline-entries: a child the scheduler settles is torn down too (OQ-152)', () => {
    const TEARDOWN = ['child_end', 'child_result', 'child_conversation_closed'];
    const byName = (sid: SessionId, name: string): ChildRow => children(sid).find((c) => c.canonical_name === name)!;
    const teardownOf = (sid: SessionId, taskId: string) => dal.timelineOf(sid).filter((t) => (JSON.parse(t.metadata) as { task_id?: string }).task_id === taskId && TEARDOWN.includes(t.name));
    const resultLine = (name: string, status: string, summary: string): string => `Child ${name} reported ${status}: ${summary.slice(0, 120)}`;

    it('REQ-ORCH-048: a child its dependency\'s failure blocks — it never started — gets `child_end`, `child_result` and `child_conversation_closed`, once each, before its parent is resumed', async () => {
      let sid = '' as SessionId;
      /** What the timeline held for `b` when the root was resumed with its report. */
      let atResume: string[] | null = null;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'a', task: 'TASK: a' } }]);
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'b', task: 'TASK: b', depends_on: [byName(sid, 'a').task_id] } }]);
          const b = children(sid).find((c) => c.canonical_name === 'b');
          if (atResume === null && b?.state === 'blocked' && req.messages.some((m) => m.content.some((p) => p.kind === 'text' && p.text.includes('### b (')))) atResume = teardownOf(sid, b.task_id).map((t) => t.name);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        // `a` says nothing and calls nothing, twice, so it ends failed and `b` is blocked.
        return answer('');
      });
      sid = (sessions.start(dal, 'C:/ws', 'a then b') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const a = byName(sid, 'a');
      const b = byName(sid, 'b');
      expect([a.state, b.state]).toEqual(['failed', 'blocked']);
      expect(teardownOf(sid, b.task_id).map((t) => [t.name, t.message])).toEqual([
        ['child_end', `Child b (${b.task_id}) ended blocked.`],
        ['child_result', resultLine('b', 'blocked', `Blocked: Its dependency a (${a.task_id}) ended failed, so this child never started (REQ-ORCH-048).`)],
        ['child_conversation_closed', 'Child b\'s conversation closed.'],
      ]);
      expect(teardownOf(sid, b.task_id).map((t) => JSON.parse(t.metadata) as Record<string, unknown>)).toEqual([
        { task_id: b.task_id, state: 'blocked', at: expect.any(String) },
        { task_id: b.task_id, status: 'blocked' },
        { task_id: b.task_id },
      ]);
      // The teardown precedes the terminal callbacks, as the settle in `execute` writes it (`afterTerminal`).
      expect(atResume).toEqual(TEARDOWN);
      // `a`, which ran, is torn down once, as before.
      expect(teardownOf(sid, a.task_id).map((t) => t.name)).toEqual(TEARDOWN);
    });

    it('REQ-ORCH-052: the finalize sweep the explicit cancel runs tears down every child it settles — one held on its model slot, which never started, and one mid-step — once each', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      let childSteps = 0;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]) : answer('both delegated');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        childSteps += 1;
        return childSteps > 1 ? answer('done') : { parts: [{ hold }, ...answer('done').parts] };
      }, { cap: 1 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      for (let i = 0; i < 400 && !(children(sid).length === 2 && byName(sid, 'two').state === 'waiting_on_model_slot'); i += 1) await new Promise((r) => setTimeout(r, 5));
      expect(byName(sid, 'two').state).toBe('waiting_on_model_slot');
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      const one = byName(sid, 'one');
      const two = byName(sid, 'two');
      expect([one.state, two.state]).toEqual(['cancelled', 'cancelled']);
      // `two` never started: no `child_start` names it.
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_start').map((t) => (JSON.parse(t.metadata) as { task_id: string }).task_id)).toEqual([one.task_id]);
      for (const c of [one, two]) {
        expect(teardownOf(sid, c.task_id).map((t) => [t.name, t.message])).toEqual([
          ['child_end', `Child ${c.canonical_name} (${c.task_id}) ended cancelled.`],
          ['child_result', resultLine(c.canonical_name, 'cancelled', (JSON.parse(c.report!) as { summary: string }).summary)],
          ['child_conversation_closed', `Child ${c.canonical_name}'s conversation closed.`],
        ]);
      }
    });

    describe('the repair of a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries: every path that settles a child `cancelled` without its execution tears it down, once', () => {
      const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
      const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
      /** The three entries of `c`, as its stored report words them. */
      const tornDown = (c: ChildRow) => [
        ['child_end', `Child ${c.canonical_name} (${c.task_id}) ended cancelled.`],
        ['child_result', resultLine(c.canonical_name, 'cancelled', (JSON.parse(c.report!) as { summary: string }).summary)],
        ['child_conversation_closed', `Child ${c.canonical_name}'s conversation closed.`],
      ];
      const entriesOf = (sid: SessionId, taskId: string) => teardownOf(sid, taskId).map((t) => [t.name, t.message]);

      it('REQ-ORCH-133 / REQ-MONITOR-128: the user\'s cancel of a running child tears it and its live descendant down at the cancel, after each one\'s `child_user_cancelled`; their executions, which return later, write no second', async () => {
        let release!: () => void;
        const hold = new Promise<void>((r) => { release = r; });
        const { sessions } = sessionsWith((persona, turn, req) => {
          if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('ok');
          if (persona === 'summariser') return answer('{"summary":"x"}');
          const grand = userText(req).includes('TASK: grand');
          if (!grand && !req.messages.some((m) => m.role === 'tool')) return toolCalls([{ callId: 'g1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'grand', task: 'TASK: grand' } }], 'Delegating.');
          return { parts: [{ hold }, ...answer(grand ? 'grand late' : 'late').parts] };
        });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => children(sid).length === 2 && children(sid).every((c) => c.state === 'running'));
        expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: byName(sid, 'work').task_id } })).toEqual({ ok: true });
        for (const name of ['work', 'grand']) {
          const c = byName(sid, name);
          expect(entriesOf(sid, c.task_id), name).toEqual(tornDown(c));
          const cancelledAt = dal.timelineOf(sid).find((t) => t.name === 'child_user_cancelled' && (JSON.parse(t.metadata) as { task_id: string }).task_id === c.task_id)!.ordinal;
          expect(teardownOf(sid, c.task_id)[0]!.ordinal, name).toBeGreaterThan(cancelledAt);
        }
        release();
        await sessions.running(sid)!;
        for (const name of ['work', 'grand']) expect(entriesOf(sid, byName(sid, name).task_id), name).toEqual(tornDown(byName(sid, name)));
      });

      it('PD-ORCH-005 clause 6: "continue without them" tears down each paused agent it cancels, once', async () => {
        let releaseChild!: () => void;
        const hold = new Promise<void>((r) => { releaseChild = r; });
        const { sessions } = sessionsWith((persona, turn) => {
          if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('handled');
          if (persona === 'summariser') return answer('{"summary":"x"}');
          return { parts: [{ hold }, ...answer('late').parts] };
        });
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await settle(() => byName(sid, 'work')?.state === 'running');
        expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
        releaseChild();
        await sessions.running(sid)!;
        expect(byName(sid, 'work').state).toBe('paused');
        expect(teardownOf(sid, byName(sid, 'work').task_id)).toEqual([]);
        expect(sessions.continueSession(sid, 'continue', { withoutPaused: true }).ok).toBe(true);
        await sessions.running(sid)!;
        const work = byName(sid, 'work');
        expect(work.state).toBe('cancelled');
        expect(entriesOf(sid, work.task_id)).toEqual(tornDown(work));
      });

      it('REQ-ORCH-053: a child a previous run left unfinished is torn down by the settle of the next run, once', async () => {
        const { sessions } = sessionsWith((persona) => (persona === 'orchestrator' ? answer('hi') : answer('{}')));
        const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
        await sessions.running(sid)!;
        dal.insertChild({ session_id: sid, task_id: 'bg_0000dead', canonical_name: 'ghost', given_name: 'ghost', persona: 'coding-agent', state: 'running', parent_id: dal.iterationsOf(sid)[0]!.root_task_id, depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: new Date(Number(clock.instant())).toISOString() });
        expect(sessions.prompt(sid, 'again').ok).toBe(true);
        await sessions.running(sid)!;
        const ghost = byName(sid, 'ghost');
        expect(ghost.state).toBe('cancelled');
        expect(entriesOf(sid, ghost.task_id)).toEqual(tornDown(ghost));
        expect(JSON.parse(teardownOf(sid, ghost.task_id)[0]!.metadata)).toEqual({ task_id: ghost.task_id, state: 'cancelled', at: expect.any(String) });
      });
    });
  });
});
