import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { millis, type SessionId } from '@rotaris/kernel';
import type { ChildRow } from '@rotaris/store';
import { answer, toolCalls, type ModelRequest } from '@rotaris/model';
import { RUN_AGENT_ID, type SessionRecord } from '@rotaris/contracts';
import { BUILT_IN_PERSONAS, SessionWriter, type PortToolResult, type Publisher, type RoleName } from '../index.js';
import type { PersonaResolver } from './personas.js';
import { conversationOf } from '../run/record.js';
import { interruptedResult } from '../run/interruption.js';
import { HOST, dir, dal, clock, warnings, infos, sessionsWith, children, holdingChild, useIterationStore } from './children.test-support.js';

/**
 * Part 2 of 4 of the end-to-end cases of `children.test.ts`, which were one describe in that file and the longest
 * file of the parallel project by a factor of two. They are spread over files so that the cores run them side by side;
 * the store, the clock and the helpers every case starts from are `children.test-support.ts`. A new case goes into the
 * part its neighbours are in.
 */
describe('an iteration with children, end to end against the run (REQ-ORCH-055..060, 072, 080, 088, 108..112, REQ-TOOLS-152..156)', () => {
  useIterationStore();

  describe('PD-ORCH-004: a child cut off while making progress hands its work back', () => {
    const tick = () => new Promise((r) => setTimeout(r, 10));
    const textOf = (m: ModelRequest['messages'][number]) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('');
    /** A gate the test opens: a tool call waiting on it completes at whatever the clock reads when it is opened. */
    const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
    type StoredCutOff = { statement: string; changed_paths: string[]; changes: string; continuation_offer: string | null };
    type Stored = { status: string; last_response: string; errors: { type: string; message: string }[]; cut_off?: StoredCutOff };
    const reportOf = (row: ChildRow) => JSON.parse(row.report!) as Stored;
    /** The file tools and `read_file`, answered here: a write to `fail.ts` fails, a read of a gate waits for it. */
    const fileTools = (gates: Record<string, Promise<void>>) => (name: string, a: Record<string, unknown>): Promise<PortToolResult> | undefined => {
      if (!['write_file', 'haet_edit', 'read_file'].includes(name)) return undefined;
      const failed = String(a['path']).endsWith('fail.ts');
      const result: PortToolResult = { text: failed ? 'the edit did not apply' : 'ok', isError: failed, status: failed ? 'failed' : 'ok', durationMs: 1, label: name, args: a };
      const waitOn = gates[String(a['path'])];
      return waitOn ? waitOn.then(() => result) : Promise.resolve(result);
    };
    /** A child's step number is the count of its own assistant messages so far, plus one. */
    const stepOf = (req: ModelRequest) => req.messages.filter((m) => m.role === 'assistant').length + 1;
    const hasTask = (req: ModelRequest, task: string) => req.messages.some((m) => m.role === 'user' && textOf(m).includes(task));

    /**
     * One child, delegated by the root, whose last tool call completes when the clock reads `completedAt` (the child
     * started at 0, so its 1,200 s limit expires at 1,200,000); it then speaks once more and is cut off. At its next
     * turn the root tries to continue it and then ends.
     */
    async function cutOffAt(completedAt: number, over: { childStallTimeoutMs?: number; publisher?: Publisher } = {}) {
      const g = gate();
      const hold = gate();
      let sid = '' as SessionId;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build' } }]);
          if (turn === 3) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build-rest', task: 'TASK: continue', continuation_of: children(sid)[0]!.task_id } }]);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (stepOf(req) === 1) return toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'src/a.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'gate' } }]);
        return { parts: [{ hold: hold.p }, { part: { kind: 'text', delta: 'I wrote a and was reading on' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { tool: fileTools({ gate: g.p }), ...over });
      sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(completedAt);
      g.open();
      await tick();
      clock.advance(1_200_000 - completedAt);
      hold.open();
      const result = await sessions.running(sid)!;
      return { sid, result, client, row: children(sid)[0]! };
    }

    /** PD-CONFIG-003 revision 3 (OQ-234): the published session's agents, as the surfaces read them. */
    const published = () => { const snapshots: SessionRecord[] = []; return { snapshots, publisher: { increment: () => undefined, snapshot: (p: { session: SessionRecord }) => { snapshots.push(p.session); } } as Publisher }; };

    it('a call completed exactly at the start of the final 90 s is progress: the report adds the statement, the paths and the offer, and the parent reads them', async () => {
      const { snapshots, publisher } = published();
      const { sid, result, client, row } = await cutOffAt(1_110_000, { publisher });
      expect(result.status).toBe('completed');
      expect(row.state).toBe('failed');
      const report = reportOf(row);
      // REQ-ORCH-088's report stands as it was.
      expect(report.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 1200s' }]));
      expect(report.last_response).toBe('I wrote a and was reading on');
      expect(report.cut_off).toEqual({
        statement: 'Cut off while making progress: this child completed a tool call within the final 90s before its 1200s limit expired.',
        changed_paths: ['src/a.ts'],
        changes: 'Workspace paths its file-writing calls changed, in the order first changed: src/a.ts.',
        continuation_offer: expect.stringContaining(`continuation_of: "${row.task_id}"`),
      });
      // OQ-217 (R-072): the summarising pass was told how the child ended — the timeout and the statement, at the facts' head
      // (the continuation, which succeeded, is summarised with no Outcome line).
      const summarising = client.requests.map((r) => r.messages.map(textOf).join('\n')).filter((t) => t.includes('Condense the transcript below') && !t.includes('TASK: continue'));
      expect(summarising.length).toBeGreaterThan(0);
      for (const t of summarising) expect(t).toContain(`Facts:\nOutcome of this agent, not of the session: failed — Child timed out after 1200s. ${report.cut_off!.statement}\nEdited files: src/a.ts`);
      // The parent's resume message carries all three, after the report's result text.
      const resume = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!)))[2]!;
      const block = textOf([...resume.messages].reverse().find((m) => m.role === 'user')!);
      expect(block).toContain(`### build (coding-agent) — failed\nI wrote a and was reading on\n${report.cut_off!.statement}\n${report.cut_off!.changes}\n${report.cut_off!.continuation_offer}`);
      // The continuation was admitted and carries the relationship in its record.
      const rest = children(sid).find((c) => c.canonical_name === 'build-rest')!;
      expect(rest.continuation_of).toBe(row.task_id);
      expect(row.continuation_of).toBeNull();
      // PD-CONFIG-003 revision 3 (OQ-234): the presented agent carries the limit it ran under and that it was making progress,
      // read back from the report's own error; the continuation, which succeeded, carries nothing.
      const agents = snapshots.at(-1)!.agents;
      expect(agents.find((a) => a.name === 'build')!.timedOut).toEqual({ limitSeconds: 1200, makingProgress: true });
      expect(agents.find((a) => a.name === 'build-rest')!.timedOut).toBeNull();
    });

    /**
     * PD-TOOLS-006 revision 6 (OQ-220): a continuation that names no todo item inherits the item of the child it continues, so
     * the coordinator that keeps a list is not refused for leaving it out, and the record says which item the continuation
     * serves.
     */
    it('PD-TOOLS-006 revision 6: a continuation naming no todo item inherits the continued child\'s', async () => {
      const g = gate();
      const hold = gate();
      let sid = '' as SessionId;
      const plan = { schema_version: 1 as const, phases: [{ id: 'e002ab7d', name: 'Build', tasks: [{ id: '0000000a', name: 'Build it', description: '', state: 'IN_PROGRESS' as const }] }] };
      const done = { ...plan, phases: [{ ...plan.phases[0]!, tasks: [{ ...plan.phases[0]!.tasks[0]!, state: 'COMPLETED' as const }] }] };
      const files = fileTools({ gate: g.p });
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 't1', name: 'todo', args: { done: false } }, { callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build', todo_item: '0000000a' } }]);
          if (turn === 3) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build-rest', task: 'TASK: continue', continuation_of: children(sid)[0]!.task_id } }]);
          if (turn === 5) return toolCalls([{ callId: 't2', name: 'todo', args: { done: true } }]);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (hasTask(req, 'TASK: continue')) return answer('Finished the rest.');
        if (stepOf(req) === 1) return toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'src/a.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'gate' } }]);
        return { parts: [{ hold: hold.p }, { part: { kind: 'text', delta: 'I wrote a and was reading on' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { tool: (name, a, ctx) => {
        if (name === 'todo') { const written = ctx.writeTodo?.((a['done'] === true ? done : plan)) ?? false; return Promise.resolve({ text: written ? 'Plan updated.' : 'not written', isError: !written, status: written ? 'ok' : 'failed', durationMs: 1, label: 'todo', args: a }); }
        return files(name, a);
      } });
      sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(1_110_000);
      g.open();
      await tick();
      clock.advance(90_000);
      hold.open();
      await sessions.running(sid)!;
      const [build, rest] = [children(sid).find((c) => c.canonical_name === 'build')!, children(sid).find((c) => c.canonical_name === 'build-rest')];
      expect(build.todo_item).toBe('0000000a');
      expect(rest?.continuation_of).toBe(build.task_id);
      expect(rest?.todo_item).toBe('0000000a');
    });

    it('a call completed one millisecond before the final 90 s is not progress: exactly REQ-ORCH-088\'s report, and no continuation is admitted', async () => {
      const { snapshots, publisher } = published();
      const { sid, client, row } = await cutOffAt(1_109_999, { publisher });
      expect(row.state).toBe('failed');
      const report = reportOf(row);
      expect(report.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 1200s' }]));
      expect(report.cut_off).toBeUndefined();
      // OQ-217: the pass is told the timeout, and no cut-off statement, since none was made.
      const asks = client.requests.map((r) => r.messages.map(textOf).join('\n')).filter((t) => t.includes('Condense the transcript below') && !t.includes('TASK: continue'));
      expect(asks.length).toBeGreaterThan(0);
      for (const t of asks) expect(t).toContain('Facts:\nOutcome of this agent, not of the session: failed — Child timed out after 1200s\nEdited files: src/a.ts');
      const resume = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!)))[2]!;
      expect(textOf([...resume.messages].reverse().find((m) => m.role === 'user')!)).not.toMatch(/Cut off|continuation/);
      // The root's attempt to continue it is refused before a record exists.
      expect(children(sid)).toHaveLength(1);
      const after = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!)))[3]!;
      expect(textOf(after.messages.at(-1)!)).toMatch(/rejected — Task 'build' \(bg_[0-9a-f]{8}\) made no continuation offer/);
      // PD-CONFIG-003 revision 3: cut off, but not while making progress.
      expect(snapshots.at(-1)!.agents.find((a) => a.name === 'build')!.timedOut).toEqual({ limitSeconds: 1200, makingProgress: false });
    });

    it('revision 3, an offer outlives its run: a later run\'s root takes up the offer an earlier iteration left, once; a later child cannot', async () => {
      const g = gate();
      const hold = gate();
      let sid = '' as SessionId;
      let run = 1;
      const acted = new Set<number>();
      const buildId = () => children(sid).find((c) => c.canonical_name === 'build')!.task_id;
      const PEER = 'bg_0000be01';
      const GRAND = 'bg_0000be02';
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          // Run 1: delegate, and leave the offer untaken. Run 2: take it up. Run 3: try again, and have a child try too.
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build' } }]);
          if (run === 2 && !acted.has(2)) { acted.add(2); return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build-rest', task: 'TASK: continue', continuation_of: buildId() } }]); }
          if (run === 3 && !acted.has(3)) {
            acted.add(3);
            return toolCalls([
              { callId: 'd3', name: 'delegate', args: { persona: 'coding-agent', task_name: 'again', task: 'TASK: again', continuation_of: buildId() } },
              { callId: 'd4', name: 'delegate', args: { persona: 'coding-agent', task_name: 'helper', task: 'TASK: helper' } },
            ]);
          }
          if (run === 3 && !acted.has(30)) {
            acted.add(30);
            // An offer this iteration's `helper` delegated and this run cut off (its child's): the root does not take it
            // up, for the delegating agent still runs (found by phase 6's second review: a seed outside the root's tree
            // could not tell "ended before this run" from "ended at all"). A grandchild's offer an earlier iteration left
            // is the root's like any other of that iteration's.
            const helper = children(sid).find((c) => c.canonical_name === 'helper')!.task_id;
            for (const [id, name, iteration, parent] of [[PEER, 'peer', 3, helper], [GRAND, 'grand', 1, 'bg_0000a11e']] as const) {
              dal.insertChild({ session_id: sid, task_id: id, canonical_name: name, given_name: name, persona: 'coding-agent', state: 'failed', parent_id: parent, depth: 2, iteration, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
              dal.setChildReport(sid, id, JSON.stringify({ ...reportOf(children(sid)[0]!), task_id: id }));
            }
            return toolCalls([
              { callId: 'd5', name: 'delegate', args: { persona: 'coding-agent', task_name: 'peer-rest', task: 'TASK: peer-rest', continuation_of: PEER } },
              { callId: 'd6', name: 'delegate', args: { persona: 'coding-agent', task_name: 'grand-rest', task: 'TASK: grand-rest', continuation_of: GRAND } },
            ]);
          }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (hasTask(req, 'TASK: build')) {
          if (stepOf(req) === 1) return toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'src/a.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'gate' } }]);
          return { parts: [{ hold: hold.p }, { part: { kind: 'text', delta: 'I wrote a and was reading on' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        }
        // The helper, a child of run 3, names the earlier offer itself: only a root may take up an earlier iteration's.
        if (hasTask(req, 'TASK: helper') && stepOf(req) === 1) return toolCalls([{ callId: 'h1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'sneak', task: 'TASK: sneak', continuation_of: buildId() } }]);
        return answer('done');
      }, { tool: fileTools({ gate: g.p }) });
      sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(1_110_000); g.open(); await tick();
      clock.advance(90_000); hold.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(reportOf(children(sid)[0]!).cut_off!.continuation_offer).toContain(`continuation_of: "${buildId()}"`);

      run = 2;
      expect(sessions.prompt(sid, 'finish the build').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      const rest = children(sid).find((c) => c.canonical_name === 'build-rest')!;
      expect(rest).toMatchObject({ continuation_of: buildId(), iteration: 2 });
      expect(rest.parent_id).toBe(dal.iterationsOf(sid)[1]!.root_task_id);

      run = 3;
      expect(sessions.prompt(sid, 'and again').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid).map((c) => c.canonical_name).sort()).toEqual(['build', 'build-rest', 'grand', 'grand-rest', 'helper', 'peer']);
      expect(children(sid).find((c) => c.canonical_name === 'grand-rest')).toMatchObject({ continuation_of: GRAND, iteration: 3 });
      const refusals = client.requests.map((r) => textOf(r.messages.at(-1)!)).join('\n');
      expect(refusals).toContain(`Task 'again': rejected — Task 'build' (${buildId()}) was already continued by 'build-rest' (${rest.task_id})`);
      // Within its iteration an offer is taken up by the agent that delegated the child, the root included.
      expect(refusals).toContain(`Task 'peer-rest': rejected — continuation_of '${PEER}' names no child task of yours, nor a child that an earlier iteration, or an earlier run of this iteration, left`);
      expect(refusals).toContain(`Task 'sneak': rejected — continuation_of '${buildId()}' names no child task of yours: a continuation continues one of your own children`);
    });

    it('revision 3 (found by phase 6\'s review): a resumed iteration\'s root takes up an offer its own iteration left in an earlier run, whoever had delegated the child', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const LEFT = 'bg_0000be03';
      let taking = false;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]);
          if (taking) { taking = false; return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'left-rest', task: 'TASK: left-rest', continuation_of: LEFT } }]); }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (hasTask(req, 'TASK: work') && stepOf(req) === 1) return { parts: [{ hold }, ...answer('work done').parts] };
        return answer('done');
      });
      const sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      for (let i = 0; i < 400 && children(sid)[0]?.state !== 'running'; i += 1) await tick();
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      await sessions.running(sid)!;
      expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open' }]);
      // In that earlier run, a child of this iteration that another agent had delegated — `work`'s — was cut off with an offer.
      dal.insertChild({ session_id: sid, task_id: LEFT, canonical_name: 'left', given_name: 'left', persona: 'coding-agent', state: 'failed', parent_id: children(sid)[0]!.task_id, depth: 2, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
      dal.setChildReport(sid, LEFT, JSON.stringify({ agent_name: 'left', role: 'coding-agent', status: 'failed', summary: 'Child timed out after 1200s', key_findings: [], last_response: '', final_response: '', errors: [], cut_off: { statement: 'Cut off while making progress.', changed_paths: ['src/a.ts'], changes: 'It changed src/a.ts.', continuation_offer: `Continue it with continuation_of: "${LEFT}".` } }));
      taking = true;
      expect(sessions.prompt(sid, 'take up what was left').ok).toBe(true);
      await sessions.running(sid)!;
      expect(children(sid).find((c) => c.canonical_name === 'left-rest')).toMatchObject({ continuation_of: LEFT, iteration: 1 });
      // It was told of the offer at the continue, before the user's message (found by phase 6's second review).
      const root = dal.iterationsOf(sid)[0]!.root_task_id;
      const told = conversationOf(dal.agentConversation(sid, root)).map((m) => textOf(m));
      const at = told.indexOf('take up what was left');
      expect(told[at - 1]).toBe(`Open continuation offers (delegate with \`continuation_of\` set to the task id to take one up):\n- left (${LEFT})`);
    });

    it('runtime.child_stall_timeout is the window: at 60 s, a call completed 60.001 s before the expiry is not progress', async () => {
      const { row } = await cutOffAt(1_139_999, { childStallTimeoutMs: 60_000 });
      expect(reportOf(row).cut_off).toBeUndefined();
    });

    it('the paths are listed in the order first changed, once each; the continuation says it changed none and is never continued in turn; work is continued once', async () => {
      const g1 = gate(); const hold1 = gate(); const g2 = gate(); const hold2 = gate();
      let sid = '' as SessionId;
      const idOf = (name: string) => children(sid).find((c) => c.canonical_name === name)!.task_id;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build' } }]);
          if (turn === 3) {
            // The offer named the id to use: take it from the resume message rather than from the store.
            const offered = /continuation_of: "(bg_[0-9a-f]{8})"/.exec(textOf([...req.messages].reverse().find((m) => m.role === 'user')!))![1]!;
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build-rest', task: 'TASK: continue', continuation_of: offered } }]);
          }
          if (turn === 5) return toolCalls([
            { callId: 'd3', name: 'delegate', args: { persona: 'coding-agent', task_name: 'chain', task: 'TASK: chain', continuation_of: idOf('build-rest') } },
            { callId: 'd4', name: 'delegate', args: { persona: 'coding-agent', task_name: 'again', task: 'TASK: again', continuation_of: idOf('build') } },
            { callId: 'd5', name: 'delegate', args: { persona: 'coding-agent', task_name: 'nobody', task: 'TASK: nobody', continuation_of: 'bg_00000000' } },
          ]);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('not json');
        if (hasTask(req, 'TASK: build')) {
          const step = stepOf(req);
          if (step === 1) return toolCalls([
            { callId: 'b1', name: 'write_file', args: { path: 'src/b.ts', content: 'b' } },
            { callId: 'b2', name: 'haet_edit', args: { path: './src/a.ts' } },
            { callId: 'b3', name: 'write_file', args: { path: 'src/fail.ts', content: 'x' } },
          ]);
          if (step === 2) return toolCalls([
            { callId: 'b4', name: 'write_file', args: { path: '/ws/src/b.ts', content: 'b2' } },
            { callId: 'b5', name: 'haet_edit', args: { file_path: 'docs/c.md' } },
            { callId: 'b6', name: 'read_file', args: { path: 'gate1' } },
          ]);
          return { parts: [{ hold: hold1.p }, { part: { kind: 'text', delta: 'halfway' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        }
        if (stepOf(req) === 1) return toolCalls([{ callId: 'c1', name: 'read_file', args: { path: 'gate2' } }]);
        return { parts: [{ hold: hold2.p }, { part: { kind: 'text', delta: 'still reading' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { tool: fileTools({ gate1: g1.p, gate2: g2.p }) });
      sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(1_150_000); g1.open(); await tick();
      clock.advance(50_000); hold1.open(); await tick(); await tick();
      // The continuation started when the root delegated it, at 1,200,000; its own limit expires at 2,400,000.
      expect(children(sid).find((c) => c.canonical_name === 'build-rest')?.state).toBe('running');
      clock.advance(1_150_000); g2.open(); await tick();
      clock.advance(50_000); hold2.open();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('completed');

      const build = children(sid).find((c) => c.canonical_name === 'build')!;
      const rest = children(sid).find((c) => c.canonical_name === 'build-rest')!;
      expect(reportOf(build).cut_off!.changed_paths).toEqual(['src/b.ts', 'src/a.ts', 'docs/c.md']);
      expect(rest.continuation_of).toBe(build.task_id);
      expect(rest.state).toBe('failed');
      const restReport = reportOf(rest);
      expect(restReport.errors).toEqual(expect.arrayContaining([{ type: 'timeout', message: 'Child timed out after 1200s' }]));
      expect(restReport.cut_off).toMatchObject({ changed_paths: [], changes: 'Its file-writing calls changed no workspace paths.', continuation_offer: null });
      expect(restReport.cut_off!.statement).toMatch(/^Cut off while making progress/);
      // The three refused continuations created no record, and each says why.
      expect(children(sid).map((c) => c.canonical_name)).toEqual(['build', 'build-rest']);
      const last = client.requests.filter((r) => /^You are the orchestrator/.test(textOf(r.messages[0]!))).at(-1)!;
      const refusals = textOf(last.messages.at(-1)!);
      expect(refusals).toContain(`Task 'chain': rejected — Task 'build-rest' (${rest.task_id}) made no continuation offer`);
      expect(refusals).toContain(`Task 'again': rejected — Task 'build' (${build.task_id}) was already continued by 'build-rest' (${rest.task_id})`);
      expect(refusals).toContain("Task 'nobody': rejected — continuation_of 'bg_00000000' names no child task of yours");
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'timeout')).toHaveLength(2);
    });
  });

  it('PD-ORCH-005 clause 3 (narrowing REQ-ORCH-052): a stop while a child runs leaves it paused by the stop, the iteration open, and the run ends interrupted', async () => {
    const { sessions, release } = holdingChild();
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'cancel', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    const c = children(sid)[0]!;
    // Its model step was cut by the stop, so it resumes running; nothing settled it, summarised it or stored a report.
    expect(c).toMatchObject({ state: 'paused', interruption: 'stop', resume_state: 'running', completed_at: null, report_stored: 0 });
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'open', outcome: null, interruption: 'stop' }]);
    expect(dal.getSession(sid)!.execution_status).toBe('paused');
    expect(dal.getSession(sid)!.iterations_completed).toBe(0);
    // OQ-127's ruling: a stop is the user's own too, and the child it leaves paused is logged at INFO.
    expect(infos).toContain('iteration 1: 1 child(ren) left paused by stop (PD-ORCH-005)');
    expect(warnings.filter((m) => m.includes('left paused by'))).toEqual([]);
  });

  it('PD-ORCH-005 clause 3: the explicit cancel (REQ-MONITOR-126, the reserved run id) is final — its child settles cancelled with a report and the iteration closes', async () => {
    const { sessions, release } = holdingChild();
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
    release();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('interrupted');
    const c = children(sid)[0]!;
    expect(c.state).toBe('cancelled');
    expect(c.interruption).toBeNull();
    expect(c.completed_at).not.toBeNull();
    expect(JSON.parse(c.report!)).toMatchObject({ status: 'cancelled' });
    expect(dal.iterationsOf(sid)).toMatchObject([{ iteration: 1, state: 'closed', outcome: 'cancelled', interruption: null }]);
  });

  it('REQ-ORCH-053: a later run on the same session settles a phantom child left by a killed host before its first iteration', async () => {
    const { sessions } = sessionsWith(() => answer('hi'));
    // A child left `running` by a previous run (as a killed host would leave it).
    const sid0 = 'S-prev' as SessionId;
    const w = SessionWriter.create({ dal, sessionId: sid0, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
    if (!w.ok) throw new Error('writer');
    w.value.spawnChild({ task_id: 'bg_0000dead', canonical_name: 'ghost', given_name: 'ghost', persona: 'coding-agent', state: 'running', parent_id: 'root:1', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}' });
    w.value.release(1, HOST);
    // The next run on that session id is refused by design (a new session is minted per prompt today), so the sweep is exercised directly.
    const { ArtifactStore } = await import('../artifacts/store.js');
    const artifacts = new ArtifactStore({ dal, sessionId: sid0, directory: () => join(dir, 'phantom-artifacts'), wall: clock, warn: () => undefined });
    const settled = (await import('./orchestration.js')).settleStaleChildren(dal, w.value, sid0, () => undefined, artifacts);
    expect(settled).toBe(1);
    expect(dal.getChild(sid0, 'bg_0000dead')).toMatchObject({ state: 'cancelled', report_stored: 1 });
    // REQ-LIBRARY-092: the settled report is an artifact like every other terminal child's, so a later run finds it by
    // reading artifacts (the repair of a-stale-settled-childs-report-is-never-an-artifact.md).
    expect(dal.artifactsOf(sid0).map((a) => [a.kind, a.source_task_id, a.canonical_name, a.status])).toEqual([['child_report', 'bg_0000dead', 'ghost', 'cancelled']]);
    void sessions;
  });

  it('REQ-MONITOR-102 / REQ-SESSION-129 (the repair of a-child-the-stale-settle-cancels-never-counts-its-calls-and-keeps-its-cut-rows-running): the stale settle answers the phantom child\'s open calls as cut by no rest, settles its row, and counts its calls once', async () => {
    const sid0 = 'S-prev-calls' as SessionId;
    const w = SessionWriter.create({ dal, sessionId: sid0, wall: clock, retentionCap: 0, warn: () => undefined, onCommitted: () => undefined }, { workspaceRoot: 'C:/ws', pid: 1, host: HOST });
    if (!w.ok) throw new Error('writer');
    w.value.spawnChild({ task_id: 'bg_0000dead', canonical_name: 'ghost', given_name: 'ghost', persona: 'coding-agent', state: 'running', parent_id: 'root:1', depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}' });
    // A call that completed, and one the dead run cut while its row was `running`.
    w.value.recordAgentMessage('bg_0000dead', 1, 'message', { role: 'user', content: [{ kind: 'text', text: 'TASK' }] });
    w.value.recordAgentMessage('bg_0000dead', 1, 'message', { role: 'assistant', content: [{ kind: 'tool-call', callId: 'a', name: 'grep', args: '{}' }, { kind: 'tool-call', callId: 'b', name: 'glob', args: '{}' }] });
    w.value.appendRow('tool', 'grep', true, { name: 'ghost', toolName: 'grep', toolStatus: 'ok', callKey: 'a', output: 'a.ts:1' });
    w.value.appendRow('tool', 'glob', false, { name: 'ghost', toolName: 'glob', toolStatus: 'running', callKey: 'b', output: 'partial' });
    const { settleStaleChildren } = await import('./orchestration.js');
    expect(settleStaleChildren(dal, w.value, sid0, () => undefined)).toBe(1);
    expect(dal.getChild(sid0, 'bg_0000dead')).toMatchObject({ state: 'cancelled', tool_calls: 2 });
    expect(dal.getSession(sid0)!.tool_calls).toBe(2);
    expect(conversationOf(dal.agentConversation(sid0, 'bg_0000dead')).at(-1)).toEqual({ role: 'tool', content: [
      { kind: 'tool-result', callId: 'a', name: 'grep', isError: false, result: 'a.ts:1' },
      { kind: 'tool-result', callId: 'b', name: 'glob', isError: true, result: interruptedResult(null, true, 'partial') },
    ] });
    expect(dal.residentRows(sid0).map((r) => [r.call_key, r.tool_status])).toEqual([['a', 'ok'], ['b', 'failed']]);
    // A second settle finds the child terminal and changes nothing.
    expect(settleStaleChildren(dal, w.value, sid0, () => undefined)).toBe(0);
    expect(dal.getSession(sid0)!.tool_calls).toBe(2);
  });

  it('REQ-ORCH-050: with a cap of 1 the second child parks waiting_on_model_slot and is promoted when the first ends', async () => {
    let releaseFirst!: () => void;
    const hold = new Promise<void>((r) => { releaseFirst = r; });
    let childCalls = 0;
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]);
        return answer('both done');
      }
      if (persona === 'summariser') return answer('{"summary":"ok"}');
      childCalls += 1;
      // the first child holds its slot until the second has been delegated and parked
      return childCalls === 1 ? { parts: [{ hold }, { part: { kind: 'text', delta: 'done' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer('done');
    }, { cap: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 200 && !(children(sid).length === 2 && children(sid)[1]!.state === 'waiting_on_model_slot'); i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(children(sid).map((c) => c.state).sort()).toEqual(['running', 'waiting_on_model_slot']);
    releaseFirst();
    await sessions.running(sid)!;
    const rows = children(sid);
    expect(rows.map((c) => c.state)).toEqual(['succeeded', 'succeeded']);
    const delegateRows = dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.tool_name === 'delegate');
    expect(delegateRows[1]!.output).toMatch(/waiting_on_model_slot — Queued behind model 'm''s slot cap: 1 of 1 slots in use/);
    const trans = dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { child_id: string; from_state: string; to_state: string });
    const two = rows.find((c) => c.canonical_name === 'two')!.task_id;
    expect(trans.filter((t) => t.child_id === two).map((t) => t.to_state)).toEqual(['queued', 'starting', 'running', 'summarizing', 'succeeded']);
  });

  describe('live-run finding D5: a child is recorded, capped and measured under its model\'s models: key (REQ-CONFIG-094, REQ-MONITOR-020, REQ-MONITOR-049)', () => {
    /** Two coding-agent children in one turn, the first holding its slot until the second has been delegated. */
    async function twoChildren(over: { personas?: PersonaResolver; capFor: (modelKey: string) => number | null; modelKey?: string }) {
      let releaseFirst!: () => void;
      const hold = new Promise<void>((r) => { releaseFirst = r; });
      let childCalls = 0;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]);
          return answer('both done');
        }
        if (persona === 'summariser') return answer('{"summary":"ok"}');
        childCalls += 1;
        return childCalls === 1 ? { parts: [{ hold }, { part: { kind: 'text', delta: 'done' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer('done');
      }, over);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      for (let i = 0; i < 200 && !(children(sid).length === 2 && children(sid)[1]!.state !== 'queued'); i += 1) await new Promise((r) => setTimeout(r, 5));
      const parked = children(sid).map((c) => c.state).sort();
      releaseFirst();
      await sessions.running(sid)!;
      const delegateRows = dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.tool_name === 'delegate');
      return { parked, rows: children(sid), second: delegateRows[1]!.output };
    }

    it('REQ-CONFIG-094: a child on the run\'s model is recorded under the run\'s models: key, and the cap stated under that key parks the second', async () => {
      const KEY = 'openai-compatible--katalyst/m';
      const { parked, rows, second } = await twoChildren({ modelKey: KEY, capFor: (k) => (k === KEY ? 1 : null) });
      expect(rows.map((c) => c.model_key)).toEqual([KEY, KEY]);
      expect(parked).toEqual(['running', 'waiting_on_model_slot']);
      expect(second).toMatch(new RegExp(`waiting_on_model_slot — Queued behind model '${KEY}''s slot cap: 1 of 1 slots in use`));
    });

    it('REQ-CONFIG-094: a child of a role with its own model is recorded under that role\'s models: key, not the model\'s bare id', async () => {
      const KEY = 'openai-compatible--other/bare-id';
      const personas: PersonaResolver = {
        resolve: (name) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: name === 'coding-agent' ? { ...base, modelRef: { providerId: 'openai-compatible', modelId: 'bare-id', dialect: 'chat' }, modelKey: KEY } : base, alias: null } : null; },
        delegationTargets: () => Object.keys(BUILT_IN_PERSONAS),
      };
      const { parked, rows } = await twoChildren({ personas, modelKey: 'run-key', capFor: (k) => (k === KEY ? 1 : null) });
      expect(rows.map((c) => c.model_key)).toEqual([KEY, KEY]);
      expect(parked).toEqual(['running', 'waiting_on_model_slot']);
    });

    it('where no configuration names a key, the model id stands in, as before', async () => {
      const { rows } = await twoChildren({ capFor: () => null });
      expect(rows.map((c) => c.model_key)).toEqual(['m', 'm']);
    });
  });

  describe('acceptance A13: the per-model cap counts every child in the process, not one iteration\'s (REQ-CONFIG-094, REQ-MONITOR-020, REQ-ORCH-050)', () => {
    const KEY = 'openai-compatible--katalyst/m';
    const textOf = (m: ModelRequest['messages'][number]): string => m.content.map((p) => ('text' in p && typeof p.text === 'string' ? p.text : '')).join('');
    /**
     * Two sessions in one `Sessions` — one run host — each delegating one coding-agent child on the same `models:` key
     * with `max_parallel` 1. The first session's child holds its model call until released.
     */
    function twoSessions(onSecondChild: () => void = () => undefined) {
      let releaseFirst!: () => void;
      const hold = new Promise<void>((r) => { releaseFirst = r; });
      // The first session's root, once it has delegated, holds its every later turn until released — so that run is still
      // under way when its child ends, and only the child's end can free the slot for the other session.
      let releaseFirstRoot!: () => void;
      const rootHold = new Promise<void>((r) => { releaseFirstRoot = r; });
      const setup = sessionsWith((persona, _turn, req) => {
        const all = req.messages.map(textOf).join('\n');
        if (persona === 'orchestrator') {
          // A first turn has no tool result in it yet; the task name is the session's own prompt.
          if (!req.messages.some((m) => m.role === 'tool')) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: /first/.test(all) ? 'one' : 'two', task: /first/.test(all) ? 'TASK: one' : 'TASK: two' } }]);
          if (/the first task/.test(all)) return { parts: [{ hold: rootHold }, { part: { kind: 'text', delta: 'done' } }, { part: { kind: 'finish', reason: 'stop' } }] };
          return answer('done');
        }
        if (persona === 'summariser') return answer('{"summary":"ok"}');
        if (/TASK: one/.test(all)) return { parts: [{ hold }, { part: { kind: 'text', delta: 'done' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        onSecondChild();
        return answer('done');
      }, { modelKey: KEY, capFor: (k) => (k === KEY ? 1 : null) });
      return { ...setup, releaseFirst, releaseFirstRoot };
    }
    const until = async (cond: () => boolean): Promise<void> => { for (let i = 0; i < 400 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 5)); };

    it('a second session\'s child on a key the first session\'s child holds at its cap is held waiting_on_model_slot, and runs once that child ends', async () => {
      const { sessions, releaseFirst, releaseFirstRoot } = twoSessions();
      const s1 = (sessions.start(dal, 'C:/ws', 'the first task') as { value: SessionId }).value;
      await until(() => children(s1)[0]?.state === 'running');
      expect(children(s1).map((c) => c.state)).toEqual(['running']);
      const s2 = (sessions.start(dal, 'C:/ws', 'the second task') as { value: SessionId }).value;
      await until(() => children(s2).length === 1 && children(s2)[0]!.state !== 'queued');
      // REQ-CONFIG-094: "children belonging to any other session running in the same process" count against the cap.
      expect(children(s2).map((c) => [c.model_key, c.state])).toEqual([[KEY, 'waiting_on_model_slot']]);
      const told = dal.residentRows(s2).find((r) => r.kind === 'tool' && r.tool_name === 'delegate')?.output ?? '';
      expect(told).toMatch(new RegExp(`waiting_on_model_slot — Queued behind model '${KEY}''s slot cap: 1 of 1 slots in use`));
      // REQ-MONITOR-020: the first session's child finishing frees the slot, and the held child in the OTHER session is
      // promoted — while the first session's run is still under way, its root held.
      releaseFirst();
      expect((await sessions.running(s2)!).status).toBe('completed');
      expect(sessions.running(s1)).not.toBeNull();
      expect(dal.getSession(s1)!.execution_status).toBe('running');
      releaseFirstRoot();
      expect((await sessions.running(s1)!).status).toBe('completed');
      expect(children(s1).map((c) => c.state)).toEqual(['succeeded']);
      expect(children(s2).map((c) => c.state)).toEqual(['succeeded']);
      // Created held (REQ-ORCH-050), its first move is the promotion back to `queued`, then its start.
      const moves = dal.eventsOfKind(s2, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state);
      expect(moves.slice(0, 2)).toEqual(['queued', 'starting']);
    });

    it('a session whose run has ended holds no slot: the next session\'s child starts at once', async () => {
      const { sessions, releaseFirst, releaseFirstRoot } = twoSessions();
      releaseFirst(); releaseFirstRoot();
      const s1 = (sessions.start(dal, 'C:/ws', 'the first task') as { value: SessionId }).value;
      expect((await sessions.running(s1)!).status).toBe('completed');
      const s2 = (sessions.start(dal, 'C:/ws', 'the second task') as { value: SessionId }).value;
      expect((await sessions.running(s2)!).status).toBe('completed');
      expect(dal.eventsOfKind(s2, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state)).not.toContain('waiting_on_model_slot');
    });

    /**
     * PD-ORCH-005 clause 4 with REQ-CONFIG-094 (OQ-149's reading, confirmed 2026-10-06 by R-071): a child paused while it held a slot keeps that place
     * while its session rests, so no other session takes it, and continuing never puts two on the key. The first session is
     * paused with its child mid-step and comes to rest `interrupted`, its child `paused`. The second session is another
     * project's: the cap counts every child in the process whatever its workspace, and a base-tree session is not continued
     * beside a run sharing its own workspace's tree (REQ-GIT-120 under PD-GIT-001), so a second run in `C:/ws` would refuse
     * the continue these cases make.
     */
    async function pausedFirst(onSecondChild?: () => void) {
      const setup = twoSessions(onSecondChild);
      const { sessions, releaseFirst, releaseFirstRoot } = setup;
      const s1 = (sessions.start(dal, 'C:/ws', 'the first task') as { value: SessionId }).value;
      await until(() => children(s1)[0]?.state === 'running');
      expect(sessions.control({ op: 'pause', sessionId: s1, args: {} })).toEqual({ ok: true });
      releaseFirst(); releaseFirstRoot();
      expect((await sessions.running(s1)!).status).toBe('interrupted');
      expect(children(s1).map((c) => [c.state, c.resume_state])).toEqual([['paused', expect.stringMatching(/^(running|summarizing)$/)]]);
      const s2 = (sessions.start(dal, 'C:/other', 'the second task') as { value: SessionId }).value;
      await until(() => children(s2).length === 1 && children(s2)[0]!.state !== 'queued');
      return { ...setup, s1, s2 };
    }
    const holding = (sid: SessionId): number => children(sid).filter((c) => c.state === 'starting' || c.state === 'running' || c.state === 'summarizing').length;

    it('PD-ORCH-005 clause 4: a paused child keeps its place while its session rests — another session\'s child is held, and a continue never runs two on the key', async () => {
      const { sessions, s1, s2 } = await pausedFirst();
      expect(children(s2).map((c) => c.state)).toEqual(['waiting_on_model_slot']);
      expect(sessions.running(s2)).not.toBeNull();
      // Sampled on every poll from the continue to both runs' ends: never more than the cap on the key across the process.
      let most = 0;
      expect(sessions.continueSession(s1, 'continue').ok).toBe(true);
      const done = Promise.all([sessions.running(s1)!, sessions.running(s2)!]);
      let settled = false; void done.then(() => { settled = true; });
      while (!settled) { most = Math.max(most, holding(s1) + holding(s2)); await new Promise((r) => setTimeout(r, 1)); }
      const [r1, r2] = await done;
      expect([r1.status, r2.status]).toEqual(['completed', 'completed']);
      expect(most).toBeLessThanOrEqual(1);
      expect(children(s1).map((c) => c.state)).toEqual(['succeeded']);
      expect(children(s2).map((c) => c.state)).toEqual(['succeeded']);
    });

    it('PD-ORCH-005 clause 6: continuing without the paused child gives its place up, and the other session\'s held child starts', async () => {
      // What the first session had when the second's child made its first model call: the decline alone frees the place,
      // not a later child of the first session's new iteration ending.
      let firstHad: string[] | null = null;
      const { sessions, s1, s2 } = await pausedFirst(() => { firstHad ??= children(s1).map((c) => c.state); });
      expect(children(s2).map((c) => c.state)).toEqual(['waiting_on_model_slot']);
      expect(sessions.continueSession(s1, 'continue', { withoutPaused: true }).ok).toBe(true);
      expect((await sessions.running(s2)!).status).toBe('completed');
      expect(children(s2).map((c) => c.state)).toEqual(['succeeded']);
      expect(children(s1)[0]!.state).toBe('cancelled');
      expect(firstHad).toEqual(['cancelled']);
      await sessions.running(s1);
    });

    it('PD-ORCH-005 clause 16: cancelling the paused child while its session rests gives its place up at once', async () => {
      const { sessions, s1, s2 } = await pausedFirst();
      expect(children(s2).map((c) => c.state)).toEqual(['waiting_on_model_slot']);
      expect(sessions.control({ op: 'cancelAgent', sessionId: s1, args: { agentId: children(s1)[0]!.task_id } }).ok).toBe(true);
      expect((await sessions.running(s2)!).status).toBe('completed');
      expect(children(s2).map((c) => c.state)).toEqual(['succeeded']);
    });
  });

  it('REQ-MONITOR-009 / REQ-ORCH-133: cancelAgent settles one child cancelled with the user\'s timeline entry; the reserved id cancels the run; unknown ids refuse', async () => {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'work', task: 'TASK: work' } }]) : answer('ok');
      if (persona === 'summariser') return answer('{"summary":"x"}');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    const id = children(sid)[0]!.task_id;
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: '' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: 'bg_00000000' } })).toEqual({ ok: false });
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: id } })).toEqual({ ok: true });
    expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: id } })).toEqual({ ok: false });
    expect(dal.timelineOf(sid).map((t) => t.name)).toContain('child_user_cancelled');
    releaseChild();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    expect(children(sid)[0]!.state).toBe('cancelled');
    void millis;
  });
});
