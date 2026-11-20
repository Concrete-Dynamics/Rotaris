import { describe, expect, it } from 'vitest';
import { utf8ByteLength, type SessionId } from '@rotaris/kernel';
import type { ChildRow } from '@rotaris/store';
import { answer, modelError, toolCalls, type ScriptedModelClient, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { isDelegationTarget, RUN_AGENT_ID, TASK_ID_PATTERN, type ApprovalPayload, type SessionRecord, type TranscriptIncrement } from '@rotaris/contracts';
import { BUILT_IN_PERSONAS, type PortToolResult, type Publisher, type RoleName, type ToolPortContext } from '../index.js';
import type { AgentGrant, Persona, PersonaResolver } from './personas.js';
import { conversationOf } from '../run/record.js';
import { ANSWER_REPROMPT } from '../run/run.js';
import { summaryFactsOf } from '../run/summary.js';
import { FULL_CONTEXT_BUDGET } from '../artifacts/context.js';
import { CHILD_REPORT_ARTIFACT_SENTENCE, inheritedContext } from './notify.js';
import { CODE_INTELLIGENCE_MANIFEST } from '@rotaris/config';
import type { LoopActivation, LoopClassifier } from '../run/supervisor.js';
import { dal, clock, warnings, infos, type TestTool, sessionsWith, children, kinds, useIterationStore } from './children.test-support.js';

/**
 * Part 1 of 4 of the end-to-end cases of `children.test.ts`, which were one describe in that file and the longest
 * file of the parallel project by a factor of two. They are spread over files so that the cores run them side by side;
 * the store, the clock and the helpers every case starts from are `children.test-support.ts`. A new case goes into the
 * part its neighbours are in.
 */
describe('an iteration with children, end to end against the run (REQ-ORCH-055..060, 072, 080, 088, 108..112, REQ-TOOLS-152..156)', () => {
  useIterationStore();

  it('PD-ORCH-017: a productive child completes beyond 100 model steps without a partial report', async () => {
    const { sessions, counts } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1
        ? toolCalls([{ callId: 'delegate-long', name: 'delegate', args: { persona: 'coder', task_name: 'long-work', task: 'TASK: finish the work', run_in_background: false } }])
        : answer('done');
      if (persona === 'summariser') return answer('{"summary":"Finished all work."}');
      return turn <= 105
        ? toolCalls([{ callId: `work-${turn}`, name: 'write_file', args: { path: `part-${turn}.txt`, content: 'done' } }])
        : answer('Finished all 105 parts.');
    }, {
      tool: (name, args) => name === 'write_file'
        ? Promise.resolve({ text: 'Written.', isError: false, status: 'ok', durationMs: 1, label: name, args })
        : undefined,
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(counts.get('child')).toBe(106);
    expect(children(sid)).toHaveLength(1);
    expect(children(sid)[0]).toMatchObject({ state: 'succeeded', tool_calls: 105 });
    expect(children(sid)[0]!.report).toContain('Finished all 105 parts.');
    expect(warnings.some((line) => line.includes('final step belt fired'))).toBe(false);
  });

  /*
   * PD-ORCH-017 on every construction of a child's turn: "fresh, resumed, nested and continued children". Each case below
   * gives ONE child turn more than 100 model steps (the former belt's bound) along a different route into the child's
   * execution, so a numeric cap on any of them ends that turn `partial` at step 101 with the belt's warning, and the child
   * settles `succeeded` with an empty `final_response` (the repair of
   * `docs/archive/defects/the-final-step-belt-ends-a-working-child-as-succeeded-with-no-final-response.md`).
   */
  describe('PD-ORCH-017 (REQ-ORCH-088, REQ-ORCH-112): no route into a child\'s turn carries a fixed model-step cap', () => {
    /** More than the former belt's 100: the turn under test takes `LONG` working steps and answers on the next. */
    const LONG = 105;
    const tick = () => new Promise((r) => setTimeout(r, 10));
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
    const textOf = (m: ModelRequest['messages'][number]): string => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    /** The agent's first user message, its payload, which names its task. */
    const payloadOf = (req: ModelRequest): string => textOf(req.messages.find((m) => m.role === 'user')!);
    const SUMMARY = answer('{"summary":"Finished.","key_findings":[],"tags":[]}');
    const work = (agent: string, step: number): ScriptedCall => toolCalls([{ callId: `${agent}-${step}`, name: 'write_file', args: { path: `${agent}-${step}.txt`, content: 'done' } }]);
    const written = (name: string, args: Record<string, unknown>): Promise<PortToolResult> | undefined => (name === 'write_file' ? Promise.resolve({ text: 'Written.', isError: false, status: 'ok', durationMs: 1, label: name, args }) : undefined);
    const byName = (sid: SessionId, name: string): ChildRow => children(sid).find((c) => c.canonical_name === name)!;
    /** The child settled from its own words: succeeded, its last answer its final response, and the belt never fired. */
    const expectUnbelted = (row: ChildRow, final: string) => {
      expect(row.state).toBe('succeeded');
      expect(JSON.parse(row.report!)).toMatchObject({ status: 'succeeded', final_response: final });
      expect(warnings.filter((line) => line.includes('final step belt fired'))).toEqual([]);
    };

    it('a child followed up by session_id (PD-ORCH-005 clause 22) works past 100 model steps in its follow-up turn', async () => {
      let sid = '' as SessionId;
      let step = 0;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build', run_in_background: false } }]);
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: more', session_id: byName(sid, 'build').task_id, run_in_background: false } }]);
          return answer('done');
        }
        if (persona === 'summariser') return SUMMARY;
        step += 1;
        // Its first execution: one call and an answer. Its follow-up: steps 3 to 107 work, 108 answers.
        if (step === 1) return work('build', step);
        if (step === 2) return answer('First part built.');
        return step <= 2 + LONG ? work('build', step) : answer('Followed up and built every part.');
      }, { tool: written });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(step).toBe(3 + LONG);
      expect(children(sid)).toHaveLength(1);
      expect(byName(sid, 'build').tool_calls).toBe(1 + LONG);
      expectUnbelted(byName(sid, 'build'), 'Followed up and built every part.');
    });

    it('a nested child, and its parent\'s turn resumed with that child\'s report (REQ-ORCH-093), each work past 100 model steps', async () => {
      let mid = 0;
      let leaf = 0;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'mid', task: 'TASK: mid', run_in_background: false } }]) : answer('done');
        if (persona === 'summariser') return SUMMARY;
        if (payloadOf(req).includes('TASK: leaf')) { leaf += 1; return leaf <= LONG ? work('leaf', leaf) : answer('Leaf built every part.'); }
        mid += 1;
        // Its first turn delegates the leaf and ends; its turn resumed with the leaf's report works steps 3 to 107.
        if (mid === 1) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'leaf', task: 'TASK: leaf' } }], 'Delegating.');
        if (mid === 2) return answer('Waiting on leaf.');
        return mid <= 2 + LONG ? work('mid', mid) : answer('Mid built every part after the leaf.');
      }, { tool: written });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect([mid, leaf]).toEqual([3 + LONG, 1 + LONG]);
      expect(byName(sid, 'leaf').depth).toBe(2);
      expectUnbelted(byName(sid, 'leaf'), 'Leaf built every part.');
      expectUnbelted(byName(sid, 'mid'), 'Mid built every part after the leaf.');
    });

    it('a child resumed from its record after a pause (PD-ORCH-005 clause 4) works past 100 model steps in its resumed turn', async () => {
      const held = gate();
      let step = 0;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'long', task: 'TASK: long' } }]) : answer('done');
        if (persona === 'summariser') return SUMMARY;
        step += 1;
        // The step in flight when the pause is accepted asks for a call the pause never runs; the continue resumes it.
        if (step === 1) return { parts: [{ hold: held.p }, ...work('long', step).parts] };
        return step <= 1 + LONG ? work('long', step) : answer('Resumed and built every part.');
      }, { tool: written });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => step === 1);
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      held.open();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(byName(sid, 'long')).toMatchObject({ state: 'paused', resume_state: 'running' });
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(step).toBe(2 + LONG);
      expectUnbelted(byName(sid, 'long'), 'Resumed and built every part.');
    });

    it('a continuation of a child cut off while making progress (PD-ORCH-004) works past 100 model steps', async () => {
      const read = gate();
      const spoke = gate();
      let sid = '' as SessionId;
      let rest = 0;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build' } }]);
          if (turn === 3) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build-rest', task: 'TASK: continue', continuation_of: byName(sid, 'build').task_id } }]);
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return SUMMARY;
        if (payloadOf(req).includes('TASK: continue')) { rest += 1; return rest <= LONG ? work('rest', rest) : answer('Continued and built every part.'); }
        // `build`: a write and a read that completes inside the final 90 s, then a step its limit's landing cuts off.
        if (!req.messages.some((m) => m.role === 'assistant')) return toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'src/a.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'gate' } }]);
        return { parts: [{ hold: spoke.p }, { part: { kind: 'text', delta: 'I wrote a and was reading on' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { tool: (name, args) => (name === 'read_file' ? read.p.then((): PortToolResult => ({ text: 'ok', isError: false, status: 'ok', durationMs: 1, label: name, args })) : written(name, args)) });
      sid = (sessions.start(dal, '/ws', 'x') as { value: SessionId }).value;
      await tick();
      clock.advance(1_110_000);
      read.open();
      await tick();
      clock.advance(90_000);
      spoke.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(JSON.parse(byName(sid, 'build').report!)).toMatchObject({ status: 'failed', cut_off: expect.any(Object) });
      expect(byName(sid, 'build-rest').continuation_of).toBe(byName(sid, 'build').task_id);
      expect(rest).toBe(1 + LONG);
      expectUnbelted(byName(sid, 'build-rest'), 'Continued and built every part.');
    });

    it('a child re-prompted after a text-only answer (REQ-ORCH-095) works past 100 model steps in the re-prompted turn', async () => {
      let step = 0;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'talker', task: 'TASK: talk', run_in_background: false } }]) : answer('done');
        if (persona === 'summariser') return SUMMARY;
        step += 1;
        if (step === 1) return answer('I will build it.');
        return step <= 1 + LONG ? work('talker', step) : answer('Built every part once asked again.');
      }, { tool: written });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(step).toBe(2 + LONG);
      expectUnbelted(byName(sid, 'talker'), 'Built every part once asked again.');
    });

    it('a child given its corrective message after a silent failed step (REQ-NOTIFY-111) works past 100 model steps in the corrected turn', async () => {
      const held = gate();
      let step = 0;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quiet', task: 'TASK: be quiet' } }]) : answer('done');
        if (persona === 'summariser') return SUMMARY;
        step += 1;
        if (step === 1) return { parts: [{ hold: held.p }, { error: modelError({ code: 'unknown', headline: 'the stream ended with no answer' }) }] };
        return step <= 1 + LONG ? work('quiet', step) : answer('Corrected and built every part.');
      }, { tool: written });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => step === 1);
      clock.advance(90_000);
      held.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(warnings.filter((m) => m.startsWith('child corrective message:'))).toHaveLength(1);
      expect(step).toBe(2 + LONG);
      expectUnbelted(byName(sid, 'quiet'), 'Corrected and built every part.');
    });
  });

  describe('REQ-MCP-015 (fin36): only the code-intelligence server\'s tools are its EDIT tier in a child\'s report', () => {
    // docs/archive/defects/another-servers-tool-named-like-a-code-intelligence-edit-tool-is-counted-as-a-file-write.md
    const name = CODE_INTELLIGENCE_MANIFEST.tiers.edit.replaceInFile;
    const path = CODE_INTELLIGENCE_MANIFEST.editArguments.replaceInFile.path;
    const editedFor = async (server: string): Promise<string[]> => {
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'tidy', task: 'TASK: tidy' } }]) : answer('done');
        if (persona === 'summariser') return answer('{"summary":"Tidied."}');
        return turn === 1 ? toolCalls([{ callId: 'e1', name, args: { [path]: 'notes/inbox.md', needle: 'a', repl: 'b', mode: 'literal' } }], 'Tidying.') : answer('Tidied.');
      }, {
        grant: (ctx) => (ctx.depth === 1 ? { tools: [], mcp: { granted: { [server]: [name] }, servers: [] } } : null),
        tool: (n, a) => (n === name ? Promise.resolve({ text: 'OK', isError: false, status: 'ok' as const, durationMs: 1, label: n, args: a }) : undefined),
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await sessions.running(sid)!;
      const row = children(sid).find((c) => c.canonical_name === 'tidy')!;
      return (JSON.parse(row.report!) as { edited_files: string[] }).edited_files;
    };

    it('a call of another server\'s tool named like the tier is not in the edited files', async () => {
      expect(await editedFor('notes')).toEqual([]);
    });

    it('the same call of the code-intelligence server\'s tool is', async () => {
      expect(await editedFor('code_intelligence')).toEqual(['notes/inbox.md']);
    });
  });

  /*
   * PD-ORCH-009 revision 4 (OQ-283, ruled 2026-10-14 under R-072), narrowing REQ-ORCH-104's stuck-mode clause: a delegated
   * child's empty turn that REQ-ORCH-095's single re-prompt answers is no stuck report. The run withdraws the stuck trigger that
   * turn armed before it sends the re-prompt, so the re-prompt is the last message of the request it leads to: no classification
   * is asked, no corrective follows it, and no stuck `loop_supervisor_activation` is written. Until revision 4 this case pinned
   * the shape as found (revision 3 named every delegated child as unchanged): the request ended [task, empty turn, re-prompt,
   * "Pause and reassess the current task."], the classifier was asked once (`stuck`) and one activation was written for the
   * child.
   */
  describe('PD-ORCH-009 revisions 4 and 5 (OQ-283, OQ-296): an empty turn the run re-prompts or waits out is no stuck report', () => {
    const textOf = (m: ModelRequest['messages'][number]): string => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    const silentStep: ScriptedCall = { parts: [{ part: { kind: 'reasoning', delta: 'Thinking about it…' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    const supervised = () => {
      const asked: LoopActivation[] = [];
      const classifier: LoopClassifier = { classify: async (a) => { asked.push(a); return { loop_detected: true, reason: 'stuck', corrective_message: 'Pause and reassess the current task.' }; } };
      return { asked, classifier };
    };
    const delegateSurvey = (persona: string, turn: number, child: (turn: number) => ScriptedCall): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: read it', run_in_background: false } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      return child(turn);
    };

    it('silent then an answer: the re-prompt ends its request, no classification is asked and no activation is written', async () => {
      const { asked, classifier } = supervised();
      const { sessions, client } = sessionsWith((persona, turn) => delegateSurvey(persona, turn, (t) => (t === 1 ? silentStep : answer('The module is small.'))), { classifier });
      const sid = (sessions.start(dal, 'C:/ws', 'survey the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const reprompted = client.requests.find((r) => r.messages.some((m) => m.role === 'user' && textOf(m).startsWith('Carry out the task now')))!;
      expect(reprompted).toBeDefined();
      const users = reprompted.messages.filter((m) => m.role === 'user').map(textOf);
      expect(users.at(-1)).toMatch(/^Carry out the task now/);
      expect(users.some((u) => u.startsWith('Pause and reassess'))).toBe(false);
      expect(asked).toEqual([]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'loop_supervisor_activation')).toEqual([]);
      expect(children(sid).find((c) => c.canonical_name === 'survey')!.state).toBe('succeeded');
    });

    it('silent twice: the child ends failed with an incomplete_execution issue naming no_activity — no stuck activation, no escalation', async () => {
      const { asked, classifier } = supervised();
      const { sessions, client } = sessionsWith((persona, turn) => delegateSurvey(persona, turn, () => silentStep), { classifier });
      const sid = (sessions.start(dal, 'C:/ws', 'survey the thing') as { value: SessionId }).value;
      await sessions.running(sid)!;
      // Asked once, never twice; the re-prompt is still its request's last message.
      const reprompts = client.requests.filter((r) => r.messages.some((m) => m.role === 'user' && textOf(m).startsWith('Carry out the task now')));
      expect(reprompts).toHaveLength(1);
      expect(reprompts[0]!.messages.filter((m) => m.role === 'user').map(textOf).at(-1)).toMatch(/^Carry out the task now/);
      const row = children(sid).find((c) => c.canonical_name === 'survey')!;
      expect(row.state).toBe('failed');
      expect((JSON.parse(row.report!) as { errors: { type: string; message: string }[] }).errors).toEqual(expect.arrayContaining([{ type: 'incomplete_execution', message: 'no_activity' }]));
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'incomplete_execution').map((i) => i.message)).toEqual(['Child survey ended with no activity after one re-prompt (category no_activity).']);
      // The second silence arms stuck (REQ-ORCH-096 unchanged for it), but the child takes no further turn, so nothing takes it.
      expect(asked).toEqual([]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'loop_supervisor_activation')).toEqual([]);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'circuit_breaker_escalation')).toEqual([]);
    });

    /*
     * PD-ORCH-009 revision 5 (OQ-296, ruled 2026-10-14 under R-072), case (d): a parent's turn that ends with neither text nor a
     * call while a child of its is pending, or has ended with a report the parent has not seen, is REQ-ORCH-055's wait and no
     * stuck report. The run withdraws the stuck trigger that turn armed when it takes the parent into the wait, so the children's
     * reports are the only message the run adds for that turn. As found (revision 4 named it unchanged), the resumed request
     * ended [… report, "Pause and reassess the current task."], the classifier was asked once (`stuck`) and one stuck
     * activation was written for the root (`docs/archive/defects/a-roots-stuck-corrective-follows-a-childs-report-after-an-empty-turn.md`).
     */
    it('PD-ORCH-009 r5 (OQ-296): a root silent while its background child runs is resumed with the report alone — no classification, no activation', async () => {
      const { asked, classifier } = supervised();
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.');
          return turn === 2 ? silentStep : answer('All done: the child implemented it.');
        }
        if (persona === 'summariser') return answer('{"summary":"The child wrote the file.","key_findings":[],"tags":[]}');
        return answer('I implemented it.');
      }, { classifier });
      const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const resumed = client.requests.find((r) => r.messages.some((m) => m.role === 'user' && textOf(m).includes('[Background task completed]')))!;
      expect(resumed).toBeDefined();
      const users = resumed.messages.filter((m) => m.role === 'user').map(textOf);
      expect(users.at(-1)).toContain('[Background task completed]');
      expect(users.some((u) => u.startsWith('Pause and reassess'))).toBe(false);
      expect(asked).toEqual([]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'loop_supervisor_activation')).toEqual([]);
    });

    it('PD-ORCH-009 r5 (OQ-296): a root that delegates and waits silently across three batches completes — no escalation', async () => {
      const { asked, classifier } = supervised();
      const batch = ['first', 'second', 'third'];
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          // Odd calls delegate the next batch (the first and every resumed turn), even calls are the silent wait after it.
          if (turn % 2 === 1 && turn <= 5) return toolCalls([{ callId: `d${turn}`, name: 'delegate', args: { persona: 'coder', task_name: batch[(turn - 1) / 2]!, task: `TASK: part ${turn}` } }], 'Delegating.');
          return turn <= 6 ? silentStep : answer('All three parts are done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return answer('Part done.');
      }, { classifier });
      const sid = (sessions.start(dal, 'C:/ws', 'build it in three parts') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid).map((c) => [c.canonical_name, c.state])).toEqual(batch.map((n) => [n, 'succeeded']));
      expect(asked).toEqual([]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'loop_supervisor_activation')).toEqual([]);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'circuit_breaker_escalation')).toEqual([]);
    });

    it('PD-ORCH-009 r5 (OQ-296): a delegated child silent while its own background child runs takes no stuck activation', async () => {
      const { asked, classifier } = supervised();
      const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map(textOf).join('\n');
      let midAsked = 0;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'mid', task: 'TASK: mid', run_in_background: false } }], 'Delegating.') : answer('mid finished.');
        if (persona === 'summariser') return answer('{"summary":"x","key_findings":[],"tags":[]}');
        if (!userText(req).includes('TASK: mid')) return answer('leaf done');
        midAsked += 1;
        if (midAsked === 1) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'leaf', task: 'TASK: leaf' } }], 'Delegating.');
        return midAsked === 2 ? silentStep : answer('Leaf reported; done.');
      }, { classifier });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(midAsked).toBe(3);
      expect(children(sid).find((c) => c.canonical_name === 'mid')!.state).toBe('succeeded');
      const resumed = client.requests.find((r) => userText(r).includes('TASK: mid') && r.messages.some((m) => m.role === 'user' && textOf(m).includes('[Background task completed]')))!;
      expect(resumed).toBeDefined();
      expect(resumed.messages.filter((m) => m.role === 'user').map(textOf).at(-1)).toContain('[Background task completed]');
      expect(asked).toEqual([]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'loop_supervisor_activation')).toEqual([]);
    });

    /*
     * Revision 5 withdraws only a pending `stuck` trigger. A raw-count trigger the same empty turn armed first (its message
     * reached the threshold, so `observeStuck` armed nothing) is kept, and the resumed turn's first step takes it: the
     * classification is asked and its corrective follows the report (disjoint from PD-ORCH-016).
     */
    it('PD-ORCH-009 r5 guard: a raw-count trigger the silent turn armed is kept and taken after the report', async () => {
      const { asked, classifier } = supervised();
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.');
          return turn === 2 ? silentStep : answer('All done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return answer('I implemented it.');
      }, { classifier, supervisorConfig: { messageThreshold: 2 } });
      const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(asked.map((a) => a.trigger)).toEqual(['raw-count']);
      const resumed = client.requests.find((r) => r.messages.some((m) => m.role === 'user' && textOf(m).includes('[Background task completed]')))!;
      const users = resumed.messages.filter((m) => m.role === 'user').map(textOf);
      expect(users.at(-2)).toContain('[Background task completed]');
      expect(users.at(-1)).toBe('Pause and reassess the current task.');
      const root = dal.timelineOf(sid).filter((t) => t.name === 'loop_supervisor_activation').map((t) => [t.actor, (JSON.parse(t.metadata) as { trigger: string }).trigger]);
      expect(root).toEqual([['orchestrator', 'raw-count']]);
    });

    /*
     * Revision 5 leaves revisions 2 and 3 as they are: a root silent after its last report, with nothing pending, is idle, and
     * PD-ORCH-009's answer re-prompt follows it as the one message the run adds (revision 3 withdraws its stuck trigger).
     */
    it('PD-ORCH-009 r5 guard: a root silent after its last report with nothing pending is still asked for its answer', async () => {
      const { asked, classifier } = supervised();
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.');
          return turn <= 3 ? silentStep : answer('The child implemented it.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return answer('I implemented it.');
      }, { classifier });
      const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const reprompted = client.requests.filter((r) => r.messages.some((m) => m.role === 'user' && textOf(m) === ANSWER_REPROMPT));
      expect(reprompted).toHaveLength(1);
      expect(reprompted[0]!.messages.filter((m) => m.role === 'user').map(textOf).at(-1)).toBe(ANSWER_REPROMPT);
      expect(asked).toEqual([]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'loop_supervisor_activation')).toEqual([]);
    });
  });

  it('delegate in the background → the child runs its own turn, reports, the parent is resumed once with the report, the run completes', async () => {
    const { sessions, client } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.') : answer('All done: the child implemented it.');
      if (persona === 'summariser') return answer('{"summary":"The child wrote the file.","key_findings":["one file"],"tags":["implementation"]}');
      return answer('I implemented it.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const rows = children(sid);
    expect(rows).toHaveLength(1);
    const c = rows[0]!;
    expect(c).toMatchObject({ persona: 'coding-agent', canonical_name: 'implement', state: 'succeeded', iteration: 1, depth: 1, observed: 1, report_stored: 1 });
    // REQ-ORCH-072: the child names the root execution record's task id as its parent
    expect(c.parent_id).toMatch(TASK_ID_PATTERN);
    expect(JSON.parse(c.report!)).toMatchObject({ agent_name: 'implement', role: 'coding-agent', status: 'succeeded', summary: 'The child wrote the file.', key_findings: ['one file'], final_response: 'I implemented it.' });
    // the ordering obligations: child.spawn precedes every event naming the child, child.complete carries the report
    const ks = kinds(sid);
    expect(ks.indexOf('child.spawn')).toBeLessThan(ks.indexOf('child.transition'));
    expect(ks.filter((k) => k === 'child.spawn')).toHaveLength(1);
    expect(ks.filter((k) => k === 'child.complete')).toHaveLength(1);
    const transitions = dal.eventsOfKind(sid, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state);
    expect(transitions).toEqual(['starting', 'running', 'summarizing', 'succeeded']);
    // the parent's second model call carried the notification and the report block
    const resume = client.requests.filter((r) => /^You are the orchestrator/.test(r.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '')).at(-1)!;
    const lastUser = [...resume.messages].reverse().find((m) => m.role === 'user')!;
    const text = lastUser.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    expect(text).toContain('[Background task completed]');
    expect(text).toContain('### implement (coding-agent) — succeeded');
    expect(text).toContain('All background tasks finished.');
    // the child's rows are in the same transcript, tagged by its canonical name
    expect(dal.residentRows(sid).some((r) => r.kind === 'agent' && r.name === 'implement')).toBe(true);
    expect(dal.timelineOf(sid).map((t) => t.name)).toEqual(expect.arrayContaining(['child_start', 'child_end', 'child_result', 'child_conversation_closed']));
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
  });

  /**
   * REQ-ORCH-059's "Open-todo reminder lines are appended" (the repair of
   * `docs/archive/defects/the-completion-notification-carries-no-open-todo-reminder-lines.md`, found ruling OQ-213): the
   * notification that tells the coordinator a background child finished names the items its own plan still holds open.
   */
  it('REQ-ORCH-059: the completion notification names the coordinator\'s open plan items', async () => {
    const plan = (states: readonly string[]) => ({ schema_version: 1 as const, phases: [{ id: 'e002ab7d', name: 'Build', tasks: states.map((state, i) => ({ id: `0000000${i}`, name: ['Implement it', 'Check it'][i]!, description: '', state })) }] });
    const tool: TestTool = (name, a, ctx) => {
      if (name !== 'todo') return undefined;
      const written = ctx.writeTodo?.(plan(a['states'] as string[]) as never) ?? false;
      return Promise.resolve({ text: written ? 'Plan updated.' : 'not written', isError: !written, status: written ? 'ok' : 'failed', durationMs: 1, label: 'todo', args: a });
    };
    // PD-TOOLS-006 revision 6 (OQ-220): a coordinator that keeps a list names the item its implementation delegation serves.
    const { sessions, client } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) return toolCalls([{ callId: 't1', name: 'todo', args: { states: ['IN_PROGRESS', 'PENDING'] } }, { callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', todo_item: '00000000' } }], 'Planning, then delegating.');
        if (turn === 2) return answer('The child is working on it.');
        if (turn === 3) return toolCalls([{ callId: 't2', name: 'todo', args: { states: ['COMPLETED', 'COMPLETED'] } }], 'Done.');
        return answer('All done: implemented and checked.');
      }
      if (persona === 'summariser') return answer('{"summary":"The child wrote the file.","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    }, { tool });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const userTexts = client.requests.flatMap((r) => r.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')));
    const text = userTexts.find((t) => t.includes('[Background task completed]'))!;
    expect(text).toBeDefined();
    // Without the repair the notification ended at "All background tasks have completed." and named no item of the plan.
    expect(text).toContain('All background tasks have completed.\nYour todo list still holds 2 open items:\n- Implement it\n- Check it');
  });

  /**
   * REQ-MCP-065 with REQ-TOOLS-006 (the repair of `a-childs-recorded-grant-is-its-declared-tools-not-the-narrowed-set.md`):
   * the child's row recorded its persona's DECLARED tools at spawn and its persona's MCP surface before any control, so a tool
   * `coordinator_only`, `read_only` or `tool_restrictions` removed was still recorded as granted. The row now records what
   * the child's port reports once it is ready — the grant in force — and nothing at spawn, where no grant exists yet.
   */
  it('REQ-MCP-065 / REQ-TOOLS-006: a child\'s row records the grant its port reports once ready, not its persona\'s declared tools', async () => {
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', run_in_background: false } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    };
    const narrowed: AgentGrant = { tools: ['read_file', 'grep'], mcp: { granted: { srv: [] }, servers: [{ name: 'srv', transport: 'stdio', origin: 'workspace', fate: 'connected' }] } };
    const snapshots: SessionRecord[] = [];
    const publisher: Publisher = { increment: () => undefined, snapshot: (p: { session: SessionRecord }) => { snapshots.push(p.session); } };
    const { sessions } = sessionsWith(script, { grant: (ctx) => (ctx.depth === 1 ? narrowed : null), publisher });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const c = children(sid)[0]!;
    expect(JSON.parse(c.granted_tools)).toEqual(['read_file', 'grep']);
    expect(JSON.parse(c.granted_mcp)).toEqual({ ...narrowed.mcp, recorded: true });
    for (const declared of BUILT_IN_PERSONAS['coding-agent'].tools.filter((t) => !narrowed.tools.includes(t))) expect(JSON.parse(c.granted_tools)).not.toContain(declared);
    // The record reaches the projection: the agent's tools are the grant, not the declared set standing in.
    expect(snapshots.at(-1)?.agents.find((a) => a.name === 'implement')).toMatchObject({ grantedTools: ['read_file', 'grep'], grantedMcp: { srv: [] } });
  });

  /*
   * REQ-MONITOR-049/060 with REQ-TOOLS-006 (docs/archive/defects/a-grant-the-controls-left-empty-reads-as-no-grant-recorded.md):
   * a `tool_restrictions` list naming only a tool-server tool leaves the child no native tool. The row records that empty
   * grant, and the record says a grant was recorded, so the declared tools do not stand in for it on the surface. Until
   * 2026-10-01 the record could not tell it from the spawn's "no grant yet", and the inspector listed every tool removed.
   */
  it('REQ-MONITOR-049 / REQ-TOOLS-006: a grant the controls left empty of native tools is recorded as a grant, not read as none', async () => {
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', run_in_background: false } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    };
    const onlyEcho: AgentGrant = { tools: [], mcp: { granted: { srv: ['echo'] }, servers: [{ name: 'srv', transport: 'stdio', origin: 'workspace', fate: 'connected' }] } };
    const snapshots: SessionRecord[] = [];
    const publisher: Publisher = { increment: () => undefined, snapshot: (p: { session: SessionRecord }) => { snapshots.push(p.session); } };
    const { sessions } = sessionsWith(script, { grant: (ctx) => (ctx.depth === 1 ? onlyEcho : null), publisher });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    const c = children(sid)[0]!;
    expect(JSON.parse(c.granted_tools)).toEqual([]);
    expect(JSON.parse(c.granted_mcp)).toEqual({ ...onlyEcho.mcp, recorded: true });
    expect(snapshots.at(-1)?.agents.find((a) => a.name === 'implement')).toMatchObject({ grantedTools: [], grantRecorded: true, grantedMcp: { srv: ['echo'] } });
  });

  // A port that reports no grant records none: REQ-MONITOR-049's stand-in then applies on the surface, rather than the
  // declared set being written down as if it had been granted.
  it('REQ-MCP-065 / REQ-MONITOR-049: a child whose port reports no grant has none recorded — the spawn writes no declared set', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', run_in_background: false } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    });
    const sid2 = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid2)!).status).toBe('completed');
    const c2 = children(sid2)[0]!;
    expect(JSON.parse(c2.granted_tools)).toEqual([]);
    expect(JSON.parse(c2.granted_mcp)).toEqual({ granted: {}, servers: [] });
  });

  /*
   * REQ-MCP-065 with REQ-ORCH-088 / PD-ORCH-005: recording the grant waits on the port's readiness, the turn does not wait
   * on the recording. Until the 2026-10-01 repair round the whole first turn was chained behind it, so while an MCP
   * discovery was pending the child was `running` with an empty record — a crash then resumed it from no history, without
   * its task. The payload is recorded as it was before the grant was, and the grant still lands before the first request.
   */
  it('REQ-MCP-065 / PD-ORCH-005: a child\'s payload is in its record while its port\'s readiness is pending, and its grant is recorded before its first model request', async () => {
    let release!: () => void;
    const readiness = new Promise<void>((r) => { release = r; });
    let sid = '' as SessionId;
    let grantedAtFirstRequest: string | null = null;
    const script = (persona: string, turn: number): ScriptedCall => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', run_in_background: false } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      if (turn === 1) grantedAtFirstRequest = children(sid)[0]!.granted_tools;
      return answer('I implemented it.');
    };
    const narrowed: AgentGrant = { tools: ['read_file'], mcp: { granted: { srv: ['echo'] }, servers: [{ name: 'srv', transport: 'stdio', origin: 'workspace', fate: 'connected' }] } };
    const { sessions, contexts } = sessionsWith(script, { grant: (ctx) => (ctx.depth === 1 ? narrowed : null), readiness: (ctx) => (ctx.depth === 1 ? readiness : undefined) });
    sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    const until = async (cond: () => boolean): Promise<void> => { for (let i = 0; i < 400 && !cond(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const recorded = (): string[] => { const c = children(sid)[0]; return c ? dal.agentMessagesOf(sid, c.task_id).map((m) => m.body) : []; };
    await until(() => contexts.has('implement') && recorded().length > 0);
    // Read while readiness is still held, then released before asserting, so a failure leaves no run waiting on it.
    const heldRecord = recorded();
    const heldGrant = children(sid)[0]?.granted_tools ?? null;
    release();
    // The child's task is in its record, and no grant is (none is in force yet).
    expect(heldRecord.some((b) => b.includes('TASK: write it'))).toBe(true);
    expect(JSON.parse(heldGrant ?? 'null')).toEqual([]);
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(JSON.parse(grantedAtFirstRequest ?? 'null')).toEqual(['read_file']);
    expect(JSON.parse(children(sid)[0]!.granted_mcp)).toEqual({ ...narrowed.mcp, recorded: true });
  });

  it('REQ-EVENTS-053 / PD-MONITOR-001: a delegated child\'s provider requests reach the run\'s tokens, cost and usage.update', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1
        ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: read it', run_in_background: false } }], 'Delegating.', { input: 10, output: 2, cost: '0.001' })
        : answer('All done.', { input: 12, output: 3, cost: '0.002' });
      // The summariser reports nothing here, so this case is the child's alone; the next case counts the summariser.
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}', { input: 0, output: 0 });
      // A reader that answers in text is accepted at once (REQ-ORCH-095 re-prompts only an implementer), so this is one request.
      return answer('The module is small.', { input: 100, output: 20, cost: '0.0105' });
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    // The entry agent's two requests and the child's one, each counted once; the summariser reported no usage, so it moves no total.
    expect(dal.getSession(sid)).toMatchObject({ tokens_input: 122, tokens_output: 25, cost: '0.0135' });
    const updates = dal.eventsOfKind(sid, 'usage.update').map((e) => (JSON.parse(e.payload) as { tokens: { total: number }; cost: { total: string } }));
    expect(updates).toHaveLength(3);
    expect(updates.at(-1)).toMatchObject({ tokens: { input: 122, output: 25, total: 147 }, cost: { total: '0.0135' } });
    expect(updates.map((u) => u.cost.total)).toContain('0.0115');
  });

  it("OQ-111 (live-run finding D1): the child-report summariser's transcript starts with the child's task as given, the payload's blocks ahead of it marked omitted (REQ-ORCH-110)", async () => {
    const asked: string[] = [];
    const { sessions } = sessionsWith((persona, turn, req) => {
      if (persona === 'orchestrator') return turn === 1
        ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: read it\nEXPECTED OUTCOME: what the module does', run_in_background: false } }], 'Delegating.')
        : answer('All done.');
      if (persona === 'summariser') {
        asked.push(req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n'));
        return answer('{"summary":"done","key_findings":[],"tags":[]}');
      }
      return answer('The module is small.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(asked).toHaveLength(1);
    // REQ-TOOLS-154's payload puts the workspace root ahead of the task; the pass's start is the task itself.
    expect(asked[0]).toMatch(/\nTranscript:\nuser: … \[\d+ characters omitted\] … TASK: read it\nEXPECTED OUTCOME: what the module does\nassistant: The module is small\.$/);
    expect(asked[0]).not.toContain('Transcript:\nuser: Workspace root:');
  });

  it('REQ-EVENTS-053 / PD-MONITOR-001: the child-report summariser\'s request counts against the run like any agent\'s', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1
        ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: read it', run_in_background: false } }], 'Delegating.', { input: 10, output: 2, cost: '0.001' })
        : answer('All done.', { input: 12, output: 3, cost: '0.002' });
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}', { input: 40, output: 8, cost: '0.0004' });
      return answer('The module is small.', { input: 100, output: 20, cost: '0.0105' });
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    // The three agent requests of the case above, plus the summariser's one — no agent's turn, and still the run's.
    expect(dal.getSession(sid)).toMatchObject({ tokens_input: 162, tokens_output: 33, cost: '0.0139' });
    const updates = dal.eventsOfKind(sid, 'usage.update').map((e) => (JSON.parse(e.payload) as { cost: { total: string } }));
    expect(updates).toHaveLength(4);
    expect(updates.at(-1)).toMatchObject({ cost: { total: '0.0139' } });
  });

  describe('PD-TOOLS-006: write scopes', () => {
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
    // PD-TOOLS-006 revision 3: a scope is for a persona that can write files, so the scoped child is a `docs-writer`.
    const heldByApi = { canonicalName: 'api', persona: 'docs-writer', pattern: 'src/api/**' };
    /** Until `ready()` holds, yielding to the run between looks; the scripted children park on a hold meanwhile. */
    async function until(ready: () => boolean): Promise<void> {
      for (let i = 0; i < 500 && !ready(); i += 1) await new Promise((r) => setTimeout(r, 1));
      expect(ready()).toBe(true);
    }

    it('a live scope refuses its sibling and the entry agent but not its holder; each child is told the live scopes; the claim lapses when its child ends', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const payloads = new Map<string, string>();
      const { sessions, contexts } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([
            { callId: 'd1', name: 'delegate', args: { persona: 'docs-writer', task_name: 'api', task: 'TASK: api', write_scope: ['src/api/**'] } },
            { callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'ui', task: 'TASK: ui' } },
          ], 'Delegating.') : answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: api') ? 'api' : 'ui';
        if (!payloads.has(name)) payloads.set(name, text);
        return { parts: [{ hold }, ...answer(`${name}: read.`).parts] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'split the work') as { value: SessionId }).value;
      const running = sessions.running(sid)!;
      await until(() => payloads.size === 2);
      const claim = (agent: string, rel: string) => contexts.get(agent)!.writeClaimFor!(rel);
      // The entry agent and the unscoped sibling are refused inside the scope; the holder is not, and nobody is outside it.
      expect(claim('orchestrator', 'src/api/users.ts')).toMatchObject(heldByApi);
      expect(claim('ui', 'src/api/users.ts')).toMatchObject(heldByApi);
      expect(claim('ui', 'SRC/API/users.ts')).toMatchObject(heldByApi);
      expect(claim('api', 'src/api/users.ts')).toBeNull();
      expect(claim('ui', 'src/ui/view.ts')).toBeNull();
      expect(claim('api', 'src/ui/view.ts')).toBeNull();
      // The disclosure sits immediately after the workspace-root prefix: the holder's own scope, the sibling's view of it.
      // PD-TOOLS-006 revision 10 (OQ-334): the report-artifact sentence sits between them, ahead of the scopes.
      const root = (scopes: string) => new RegExp(`Workspace root: [^\\n]*\\n\\n${CHILD_REPORT_ARTIFACT_SENTENCE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n\\n${scopes}`);
      expect(payloads.get('api')).toMatch(root("Write scopes:\\n- Yours: 'src\\/api\\/\\*\\*'\\."));
      expect(payloads.get('ui')).toMatch(root("Write scopes:\\n- Held by other agents[^\\n]*\\n {2}- api: 'src\\/api\\/\\*\\*'\\n"));
      // PD-TOOLS-006 revision 2: the declared scope is stored with the child's record, so a resumed child can claim it again.
      expect(Object.fromEntries(children(sid).map((c) => [c.canonical_name, c.write_scope]))).toEqual({ api: '["src/api/**"]', ui: '[]' });
      release();
      expect((await running).status).toBe('completed');
      expect(claim('orchestrator', 'src/api/users.ts')).toBeNull();
    });

    it('the holder\'s own descendants are not refused, and are told the scope belongs to an agent they work under', async () => {
      let release!: () => void;
      const hold = new Promise<void>((r) => { release = r; });
      const payloads = new Map<string, string>();
      const calls = new Map<string, number>();
      const { sessions, contexts } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'docs-writer', task_name: 'api', task: 'TASK: api', write_scope: ['src/api/**'] } }], 'Delegating.') : answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: deep') ? 'deep' : 'api';
        const n = (calls.get(name) ?? 0) + 1;
        calls.set(name, n);
        if (!payloads.has(name)) payloads.set(name, text);
        if (name === 'api' && n === 1) return toolCalls([{ callId: 'g1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'deep', task: 'TASK: deep' } }], 'Delegating further.');
        return name === 'deep' ? { parts: [{ hold }, ...answer('deep: read.').parts] } : answer('api: done.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'nest the work') as { value: SessionId }).value;
      const running = sessions.running(sid)!;
      await until(() => payloads.has('deep'));
      const claim = (agent: string, rel: string) => contexts.get(agent)!.writeClaimFor!(rel);
      expect(claim('deep', 'src/api/users.ts')).toBeNull();
      expect(claim('orchestrator', 'src/api/users.ts')).toMatchObject(heldByApi);
      expect(payloads.get('deep')).toContain("  - api: 'src/api/**' (you work under this agent, so its scope does not fence you)");
      release();
      expect((await running).status).toBe('completed');
    });

    it('PD-TOOLS-006 revision 3 (OQ-112, live-run finding D6): a scope for a persona that cannot write files rejects the delegation — no child, no task id, the writers named', async () => {
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'c: write docs/overview.md', task: 'TASK: write it', write_scope: ['docs/overview.md'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'write the overview') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'c: write docs/overview.md': rejected — write_scope was given to 'codebase-analyst', which cannot write files");
      expect(resumed).toContain('Personas that can write files: coding-agent, tester, docs-writer, refactorer.');
      expect(resumed).not.toContain('task_id:');
    });

    it('PD-TOOLS-006 revision 3 (OQ-112): an ALIAS of a persona that cannot write files is refused the same way — the persona the ledger would resolve', async () => {
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'playwright', task_name: 'ui: write docs/overview.md', task: 'TASK: write it', write_scope: ['docs/overview.md'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'write the overview') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'ui: write docs/overview.md': rejected — write_scope was given to 'ui-verifier', which cannot write files");
      expect(resumed).not.toContain('task_id:');
    });

    it('a scope reaching outside the workspace root rejects the delegation: no child, no task id, the reason names the pattern', async () => {
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'escape', task: 'TASK: x', write_scope: ['src/**', '../elsewhere/**'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'try it') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'escape': rejected — write_scope pattern '../elsewhere/**' reaches outside the workspace root.");
      expect(resumed).not.toContain('task_id:');
    });

    /*
     * Acceptance finding A4 (R-067): "after REQ-TOOLS-006's controls" read the first three alone while the fourth narrowed
     * no grant. Under OQ-145 the delegating persona's `tool_restrictions` entry naming the child's persona binds the child's
     * grant, so it binds this refusal, and the writers the reason names are the ones this caller's map lets write.
     */
    it("PD-TOOLS-006 revision 3 with REQ-TOOLS-006 (4) (OQ-145): the parent agent's tool_restrictions bind the refusal — a writer it restricts to reading cannot take a scope, and is not named", async () => {
      const personas: PersonaResolver = {
        resolve: (name) => {
          const base = BUILT_IN_PERSONAS[name as RoleName];
          if (!base) return null;
          return { persona: name === 'orchestrator' ? { ...base, toolRestrictions: { 'coding-agent': ['read_file', 'grep'], tester: ['read_file'] } } : base, alias: null };
        },
        delegationTargets: () => Object.keys(BUILT_IN_PERSONAS),
      };
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'api', task: 'TASK: api', write_scope: ['src/api/**'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      }, { personas });
      const sid = (sessions.start(dal, 'C:/ws', 'build the api') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'api': rejected — write_scope was given to 'coding-agent', which cannot write files");
      expect(resumed).toContain('Personas that can write files: docs-writer, refactorer.');
    });

    it('REQ-TOOLS-006 (4) (OQ-145): a child\'s tool port is told the persona that delegated it; the root\'s is told none', async () => {
      const { sessions, contexts } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'api', task: 'TASK: api', run_in_background: false } }], 'Delegating.') : answer('Done.');
        }
        return answer('Built it.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'build the api') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(contexts.get('api')?.parentPersona).toBe('orchestrator');
      expect(contexts.get('orchestrator')?.parentPersona).toBeUndefined();
    });
  });

  /**
   * OQ-228 (ruled 2026-10-07 under R-072), REQ-MCP-014, REQ-ORCH-126, REQ-ORCH-034 and REQ-ORCH-038: a delegation names only a
   * delegation target. The three personas the product runs itself are refused first, with no record and no task id, by the
   * unknown-role message carrying the targets, the aliases and what the persona is run for (finding P5 at a68f121: 71 of 71
   * coordinator requests offered `intent-classifier`, docs/archive/defects/delegate-offers-and-admits-personas-that-are-not-delegation-targets.md).
   * OQ-229: a non-empty `delegates_to` narrows the caller's targets; an empty one narrows nothing
   * (docs/archive/defects/a-personas-delegates-to-never-narrows-its-delegations.md).
   */
  describe('OQ-228 / OQ-229: a delegation names only a delegation target of its caller', () => {
    const textOfReq = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
    const extra = (name: string, tools: readonly string[], prompt = `You are ${name}.`): Persona => ({ ...BUILT_IN_PERSONAS['codebase-analyst'], name, tools, systemPrompt: prompt, implementer: tools.some((t) => t === 'write_file' || t === 'terminal') });
    /** A configured table over the built-in one, resolved as the run host's resolver does: aliases to an existing target, the delegation targets filtered. */
    function resolverOf(over: Record<string, Partial<Persona>> = {}, added: Record<string, Persona> = {}): PersonaResolver {
      const table: Record<string, Persona> = { ...BUILT_IN_PERSONAS, 'intent-classifier': extra('intent-classifier', []), ...added };
      for (const [name, o] of Object.entries(over)) table[name] = { ...(table[name] ?? extra(name, [])), ...o };
      const aliases: Record<string, string> = { coder: 'coding-agent', playwright: 'ui-verifier' };
      return {
        resolve: (name) => (table[name] ? { persona: table[name], alias: null } : aliases[name] && table[aliases[name]] ? { persona: table[aliases[name]]!, alias: name } : null),
        delegationTargets: () => Object.keys(table).filter(isDelegationTarget),
      };
    }
    const del = (callId: string, persona: string, name: string, more: Record<string, unknown> = {}) => ({ callId, name: 'delegate', args: { persona, task_name: name, task: `TASK: ${name}`, ...more } });
    /** The root makes `calls` in one step and answers; every child answers. Returns each delegate observation, in order. */
    async function rootDelegates(calls: ReturnType<typeof del>[], personas?: PersonaResolver) {
      const observed: string[] = [];
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls(calls, 'Delegating.') : answer('Done.');
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return answer('Did it.');
      }, { ...(personas ? { personas } : {}), tool: (name, _a, _ctx, builtIn) => (name === 'delegate' ? builtIn().then((r) => { observed.push(r.text); return r; }) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'work') as { value: SessionId }).value;
      await sessions.running(sid)!;
      return { observed, rows: children(sid) };
    }

    it('(red) intent-classifier and gatekeeper are refused first, with no record, the purpose named, the targets without the three and the aliases listed', async () => {
      const { observed, rows } = await rootDelegates([del('d1', 'intent-classifier', 'classify'), del('d2', 'gatekeeper', 'gate', { write_scope: ['src/**'] })], resolverOf());
      expect(rows).toEqual([]);
      expect(observed[0]).toMatch(/^Task 'classify': rejected — 'intent-classifier' is a persona the product runs itself \(request classification\); it is not a delegation target\. Known personas: orchestrator, /);
      // write_scope's own refusal never answers: the target check comes first
      expect(observed[1]).toMatch(/^Task 'gate': rejected — 'gatekeeper' is a persona the product runs itself \(verification-gate authoring\); it is not a delegation target\./);
      for (const o of observed) {
        expect(o).toContain('Supported aliases: coder->coding-agent, playwright->ui-verifier.');
        expect(o).not.toMatch(/Known personas: [^.]*(intent-classifier|gatekeeper|project-initializer)/);
        expect(o).not.toContain('task_id:');
      }
      expect(warnings.some((w) => w.includes("'classify'") && w.includes('REQ-ORCH-038'))).toBe(true);
    });

    it('(red) a configured project-initializer is refused with its purpose; a configured release-manager is a target and accepted', async () => {
      const personas = resolverOf({}, { 'project-initializer': extra('project-initializer', ['read_file']), 'release-manager': extra('release-manager', ['read_file']) });
      const { observed, rows } = await rootDelegates([del('d1', 'project-initializer', 'init'), del('d2', 'release-manager', 'release')], personas);
      expect(observed[0]).toMatch(/^Task 'init': rejected — 'project-initializer' is a persona the product runs itself \(project onboarding\)/);
      expect(observed[1]).toMatch(/^Task 'release': queued/);
      expect(rows.map((r) => r.persona)).toEqual(['release-manager']);
    });

    it('(red) an unknown persona\'s message carries the aliases, as REQ-ORCH-034 requires, on the resolver path too', async () => {
      const { observed } = await rootDelegates([del('d1', 'wizard', 'magic')], resolverOf());
      expect(observed[0]).toMatch(/^Task 'magic': rejected — Unknown persona 'wizard'\. Known personas: .*\. Supported aliases: coder->coding-agent, playwright->ui-verifier\.$/);
    });

    it('(red) an intent-classifier configured to write files is refused and never named among a write-scope refusal\'s writers', async () => {
      const personas = resolverOf({ 'intent-classifier': { tools: ['read_file', 'write_file'] } });
      const { observed } = await rootDelegates([del('d1', 'intent-classifier', 'classify'), del('d2', 'codebase-analyst', 'survey', { write_scope: ['docs/**'] })], personas);
      expect(observed[0]).toMatch(/^Task 'classify': rejected — 'intent-classifier' is a persona the product runs itself/);
      expect(observed[1]).toMatch(/Personas that can write files: coding-agent, tester, docs-writer, refactorer\./);
      expect(observed[1]).not.toContain('intent-classifier');
    });

    it('OQ-229 (red): a non-empty delegates_to narrows the root: an unlisted persona is refused naming the list; an alias of a listed one is accepted', async () => {
      const personas = resolverOf({ orchestrator: { delegatesTo: ['codebase-analyst', 'coding-agent'] } });
      const { observed, rows } = await rootDelegates([del('d1', 'tester', 'test'), del('d2', 'coder', 'build'), del('d3', 'playwright', 'look'), del('d4', 'gatekeeper', 'gate')], personas);
      expect(observed[0]).toBe("Task 'test': rejected — 'tester' is not a persona orchestrator may delegate to: its delegates_to lists codebase-analyst, coding-agent. Known personas: codebase-analyst, coding-agent. Supported aliases: coder->coding-agent.");
      expect(observed[1]).toMatch(/^Task 'build': queued — .*Alias 'coder' resolved to 'coding-agent'\./);
      expect(observed[2]).toMatch(/^Task 'look': rejected — 'playwright' \(alias of 'ui-verifier'\) is not a persona orchestrator may delegate to/);
      expect(observed[2]).not.toContain('playwright->');
      // a reserved persona keeps OQ-228's reason, whatever the list holds
      expect(observed[3]).toMatch(/^Task 'gate': rejected — 'gatekeeper' is a persona the product runs itself/);
      expect(rows.map((r) => r.persona)).toEqual(['coding-agent']);
    });

    it('OQ-229 (red): a list naming only gatekeeper refuses every delegation, saying the caller can delegate to no persona', async () => {
      const { observed, rows } = await rootDelegates([del('d1', 'coding-agent', 'build')], resolverOf({ orchestrator: { delegatesTo: ['gatekeeper'] } }));
      expect(observed[0]).toBe("Task 'build': rejected — 'coding-agent' is not a persona orchestrator may delegate to: its delegates_to lists gatekeeper. orchestrator can delegate to no persona.");
      expect(rows).toEqual([]);
    });

    it('OQ-229 (red): the target check comes before the continuation check, and the write-scope reason names only writers among the caller\'s targets', async () => {
      const personas = resolverOf({ orchestrator: { delegatesTo: ['codebase-analyst', 'docs-writer'] } });
      const { observed } = await rootDelegates([del('d1', 'tester', 'more', { continuation_of: 'bg_0000dead' }), del('d2', 'codebase-analyst', 'survey', { write_scope: ['docs/**'] })], personas);
      expect(observed[0]).toMatch(/^Task 'more': rejected — 'tester' is not a persona orchestrator may delegate to/);
      expect(observed[1]).toMatch(/Personas that can write files: docs-writer\./);
    });

    it('OQ-229 (red): a child persona holding delegate is checked against its own list; the root\'s list does not bind it', async () => {
      const lead = { ...extra('lead', ['read_file', 'delegate'], 'You lead the work.'), delegatesTo: ['tester'] };
      const personas = resolverOf({ orchestrator: { delegatesTo: ['lead'] } }, { lead });
      const observed: string[] = [];
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([del('d1', 'lead', 'lead', { run_in_background: false })]) : answer('Done.');
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const isLead = textOfReq(req).startsWith('You lead the work.');
        const leadTurn = req.messages.filter((m) => m.role === 'assistant').length;
        if (isLead && leadTurn === 0) return toolCalls([del('l1', 'tester', 'check'), del('l2', 'codebase-analyst', 'read')]);
        return answer('Did it.');
      }, { personas, tool: (name, _a, _ctx, builtIn) => (name === 'delegate' ? builtIn().then((r) => { observed.push(r.text); return r; }) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'work') as { value: SessionId }).value;
      await sessions.running(sid)!;
      const byName = (n: string) => observed.find((o) => o.startsWith(`Task '${n}'`));
      expect(byName('check')).toMatch(/^Task 'check': queued/);
      expect(byName('read')).toMatch(/^Task 'read': rejected — 'codebase-analyst' is not a persona lead may delegate to: its delegates_to lists tester\. Known personas: tester\. Supported aliases: none\.$/);
      expect(children(sid).map((c) => c.persona).sort()).toEqual(['lead', 'tester']);
    });

    it('OQ-229: a session_id follow-up is not checked against the list', async () => {
      const personas = resolverOf({ orchestrator: { delegatesTo: ['coding-agent'] } });
      let firstId = '';
      const observed: string[] = [];
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([del('d1', 'coding-agent', 'build', { run_in_background: false })]);
          if (turn === 2) return toolCalls([del('d2', 'tester', 'again', { session_id: firstId, run_in_background: false })]);
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return answer('Did it.');
      }, { personas, tool: (name, _a, _ctx, builtIn) => (name === 'delegate' ? builtIn().then((r) => { if (firstId === '') firstId = /task_id: (bg_[0-9a-f]{8})/.exec(r.text)?.[1] ?? ''; observed.push(r.text); return r; }) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'work') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(observed[1]).toMatch(/^Task 'build': queued — Following up build/);
    });

    it('OQ-229: with the key unset every delegation target is accepted, a user-defined one included', async () => {
      const open = resolverOf({}, { 'release-manager': extra('release-manager', ['read_file']) });
      // the last six targets (the default active-children limit), the user-defined one among them
      const all = open.delegationTargets().filter((n) => n !== 'orchestrator').slice(-6);
      expect(all).toContain('release-manager');
      const { observed: o2, rows } = await rootDelegates(all.map((n, i) => del(`a${i}`, n, `t${i}`, { run_in_background: true })), open);
      expect(o2.filter((o) => !/: (queued|waiting_on_[a-z_]+) — /.test(o))).toEqual([]);
      expect(rows.map((r) => r.persona)).toEqual(all);
    });
  });

  describe('REQ-TOOLS-152 / REQ-TOOLS-154 (3): suppress_auto_context omits the sibling-artifact index', () => {
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');
    /** A survey whose report becomes an artifact, then `build` delegated with `buildArgs`; returns each child's first payload. */
    async function surveyThenBuild(buildArgs: Record<string, unknown>, over: { personas?: PersonaResolver } = {}) {
      const payloads = new Map<string, string>();
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey', run_in_background: false } }], 'Surveying.');
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build', run_in_background: false, ...buildArgs } }], 'Building.');
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: build') ? 'build' : 'survey';
        if (!payloads.has(name)) payloads.set(name, text);
        return answer(name === 'survey' ? 'The module is small.' : 'Built it.');
      }, over);
      const sid = (sessions.start(dal, 'C:/ws', 'survey then build') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const build = children(sid).find((c) => c.canonical_name === 'build')!;
      const selection = dal.timelineOf(sid).filter((t) => t.name === 'context_selection');
      return { payloads, build, selection };
    }

    it('REQ-TOOLS-152: the default gives the index — the survey\'s artifact is listed in the build\'s payload, and nothing is stored', async () => {
      const { payloads, build } = await surveyThenBuild({});
      expect(payloads.get('build')).toMatch(/PRIOR SIBLING ARTIFACT INDEX\n[^\n]*survey/);
      expect(build.suppress_auto_context).toBe(0);
    });

    it('REQ-TOOLS-152: a call that sets it omits the index from the child\'s payload, and the flag is stored with the child\'s record', async () => {
      const { payloads, build } = await surveyThenBuild({ suppress_auto_context: true });
      expect(payloads.get('build')).toContain('TASK: build');
      expect(payloads.get('build')).toMatch(/Workspace root: C:\/ws\./);
      expect(payloads.get('build')).not.toContain('PRIOR SIBLING ARTIFACT INDEX');
      expect(build.suppress_auto_context).toBe(1);
    });

    it('REQ-CONFIG-107: the persona-level setting forces the same omission for a call that did not ask for it, and only for that role', async () => {
      const personas: PersonaResolver = {
        resolve: (name) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: name === 'coding-agent' ? { ...base, skipAutoSiblingContext: true } : base, alias: null } : null; },
        delegationTargets: () => Object.keys(BUILT_IN_PERSONAS),
      };
      const { payloads, build } = await surveyThenBuild({}, { personas });
      expect(payloads.get('build')).toContain('TASK: build');
      expect(payloads.get('build')).not.toContain('PRIOR SIBLING ARTIFACT INDEX');
      // Configuration, read at each assembly — not copied onto the record.
      expect(build.suppress_auto_context).toBe(0);
    });

    it('REQ-LIBRARY-098: the attached artifacts are the caller\'s explicit choice — a suppressed index still carries them, and the diagnostic says the index was suppressed', async () => {
      const { payloads, build, selection } = await surveyThenBuild({ suppress_auto_context: true, attach_artifacts: ['no-such-artifact'] });
      expect(payloads.get('build')).not.toContain('PRIOR SIBLING ARTIFACT INDEX');
      expect(payloads.get('build')).toContain('PRIOR AGENT CONTEXT (FULL)');
      expect(payloads.get('build')).toContain('no-such-artifact');
      const buildSelection = selection.map((t) => JSON.parse(t.metadata) as Record<string, unknown>).find((m) => m['task_id'] === build.task_id);
      expect(buildSelection).toMatchObject({ sibling_index_suppressed: true, sibling_index_included: 0, attached_unresolved: ['no-such-artifact'] });
    });

    it("PD-LIBRARY-007: a child's answer reaches its report's artifact, so attach_artifacts hands a later child the answer and not a summary of it", async () => {
      // The summariser says 'done'; the survey said 'The module is small.' Until PD-LIBRARY-007 only the first reached the artifact.
      const { payloads } = await surveyThenBuild({ attach_artifacts: ['survey'] });
      expect(payloads.get('build')).toContain('PRIOR AGENT CONTEXT (FULL)');
      expect(payloads.get('build')).toContain('## Summary\n\ndone');
      expect(payloads.get('build')).toContain('## Answer\n\nThe module is small.');
    });

    /*
     * PD-SESSION-002 (OQ-207, ruled 2026-10-07): summary.md's Mostly-elided artifacts line reads the `task_id` and the
     * `attached_elided` that `artifactContext` writes on a `context_selection` entry. Each side names those keys on its own
     * (`orchestration.ts` writes them, `StoreDal.elidedAttachmentRowsOf` and `elidedAttachmentsOf` read them), so this case
     * drives a real delegation whose attachment overflows FULL_CONTEXT_BUDGET and reads it back through `summaryFactsOf`:
     * a rename on either side fails here, where each side's own test would still pass (fin28's reviewers).
     */
    it('PD-SESSION-002: a delegation whose attachment does not fit its budget reaches summaryFactsOf as one mostly-elided artifact', async () => {
      // The survey's report is its summariser's findings: well over FULL_CONTEXT_BUDGET in all.
      const findings = Array.from({ length: 2 * Math.ceil(FULL_CONTEXT_BUDGET / 1_000) }, (_, i) => `Finding ${i}: ${'x'.repeat(1_000)}`);
      let sid = '' as SessionId;
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey', run_in_background: false } }], 'Surveying.');
          if (turn === 2) {
            const survey = dal.artifactsOf(sid).find((a) => a.canonical_name === 'survey')!;
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'build', task: 'TASK: build', run_in_background: false, attach_artifacts: [survey.id] } }], 'Building.');
          }
          return answer('Done.');
        }
        if (persona === 'summariser') return answer(JSON.stringify({ summary: 'surveyed', key_findings: findings, tags: [] }));
        return answer('Done it.');
      });
      sid = (sessions.start(dal, 'C:/ws', 'survey then build') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const survey = dal.artifactsOf(sid).find((a) => a.canonical_name === 'survey')!;
      const build = children(sid).find((c) => c.canonical_name === 'build')!;
      const selection = dal.timelineOf(sid).filter((t) => t.name === 'context_selection').map((t) => JSON.parse(t.metadata) as Record<string, unknown>).find((m) => m['task_id'] === build.task_id);
      expect(selection).toMatchObject({ attached_included: 0, attached_elided: [survey.id] });
      expect(summaryFactsOf(dal, sid)!.elidedAttachments).toEqual({ artifacts: 1, agents: 1 });
    });
  });

  /**
   * PD-TOOLS-006 revision 5 (OQ-221, ruled 2026-10-07 under R-072): the delegate observation and the child's block read ONE
   * selection, so what the caller is told it was given is what the child receives — the repair of
   * `docs/archive/defects/the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md`.
   */
  describe('PD-TOOLS-006 revision 5: the delegate observation names what the child is given of its attachments', () => {
    it('for a child started at once, the observation\'s left-out ids are the context_selection entry\'s, its given count the entry\'s, and the payload carries exactly those', async () => {
      const outcomes: { attachments?: unknown }[] = [];
      const ids: Record<string, string> = {};
      const tool: TestTool = (name, a, ctx) => {
        if (name === 'publish') {
          // Two long bodies and a short one: 60,000 + 45,000 overflow the 100,000 section, and 60,000 alone overflowed 48,000.
          for (const [slug, body] of [['long-one', 'L'.repeat(60_000)], ['long-two', 'M'.repeat(45_000)], ['short-one', 'the short body']] as const) {
            const w = ctx.artifacts!.write({ slug, title: slug, body, tags: ['research'], supersedes: null });
            if (w.ok) ids[slug] = w.id;
          }
          return Promise.resolve({ text: 'Published.', isError: false, status: 'ok', durationMs: 1, label: 'publish', args: a });
        }
        if (name !== 'delegate') return undefined;
        return (async () => {
          const ops = ctx.delegation!;
          const r = await ops.delegate(ctx.parentId!, { persona: 'coding-agent', taskName: 'build', task: 'TASK: build', dependsOn: [], inheritedContext: [], category: '', runInBackground: false, writeScope: [], attachArtifacts: ['long-one', 'long-two', 'short-one', 'no-such-artifact'] });
          outcomes.push(r as { attachments?: unknown });
          if (r.status !== 'rejected') await ops.waitForTasks(ctx.parentId!, [r.taskId]);
          return { text: r.message, isError: false, status: 'ok' as const, durationMs: 1, label: 'delegate', args: a };
        })();
      };
      const payloads: string[] = [];
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'p1', name: 'publish', args: {} }], 'Publishing.');
          if (turn === 2) return toolCalls([{ callId: 'd1', name: 'delegate', args: {} }], 'Delegating.');
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        payloads.push(req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n'));
        return answer('Built it.');
      }, { tool });
      const sid = (sessions.start(dal, 'C:/ws', 'attach three') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const build = children(sid).find((c) => c.canonical_name === 'build')!;
      const entry = dal.timelineOf(sid).filter((t) => t.name === 'context_selection').map((t) => JSON.parse(t.metadata) as Record<string, unknown>).find((m) => m['task_id'] === build.task_id)!;
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]!.attachments).toEqual({ given: 2, elidedForSize: [ids['long-two']], unresolved: ['no-such-artifact'], unreadable: [], budget: 100_000 });
      expect(entry).toMatchObject({ attached_included: 2, attached_elided: [ids['long-two']], attached_unresolved: ['no-such-artifact'] });
      const payload = payloads[0]!;
      expect(payload).toContain(`## long-one (${ids['long-one']})`);
      expect(payload).toContain(`## short-one (${ids['short-one']})`);
      expect(payload).not.toContain(`## long-two (${ids['long-two']})`);
      expect(payload).toContain(`was left out: ${ids['long-two']}`);
    });
  });

  describe('PD-ORCH-005 clause 22 / PD-TOOLS-006 revision 3 (OQ-66, R-067): a follow-up by session_id resumes the caller\'s own settled child from its record', () => {
    const textOf = (m: ModelRequest['messages'][number]): string => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('');
    const isRoot = (req: ModelRequest) => /^You are the orchestrator/.test(textOf(req.messages[0]!));
    const rootRequests = (client: ScriptedModelClient) => client.requests.filter(isRoot);
    const childRequests = (client: ScriptedModelClient) => client.requests.filter((r) => !isRoot(r) && !/summarise/i.test(textOf(r.messages[0]!)));
    /** The text of the root's last tool result in its `n`th request (1-based): what its last delegate call observed. */
    const observed = (client: ScriptedModelClient, n: number) => textOf(rootRequests(client)[n - 1]!.messages.at(-1)!);

    /**
     * The root delegates `survey`, ends its turn and, resumed with the survey's report (its third request), calls
     * `delegate` again with `followUp(surveyId)` as the rest of the call's arguments; what that call observed is the last
     * message of its fourth request. Then it answers. `child` scripts the survey's steps.
     */
    async function surveyThenFollowUp(followUp: (surveyId: string) => Record<string, unknown>, child: (step: number, req: ModelRequest) => ScriptedCall = (step) => answer(step === 1 ? 'The module is small.' : 'It has two files: a.ts and b.ts.'), over: { childTimeoutMs?: number } = {}) {
      let sid = '' as SessionId;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey the module' } }], 'Surveying.');
          if (turn === 2) return answer('Waiting for the survey.');
          if (turn === 3) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: which files does it have?', ...followUp(children(sid).find((c) => c.canonical_name === 'survey')!.task_id) } }], 'Following up.');
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"surveyed","key_findings":[],"tags":[]}');
        return child(req.messages.filter((m) => m.role === 'assistant').length + 1, req);
      }, over);
      sid = (sessions.start(dal, 'C:/ws', 'survey, then ask again') as { value: SessionId }).value;
      const result = await sessions.running(sid)!;
      return { sid, result, client };
    }

    it('clause 22: the named child resumes under its own task id from its recorded conversation, the call\'s task as its next user message, and ends and reports again', async () => {
      const { sid, result, client } = await surveyThenFollowUp((id) => ({ session_id: id }));
      expect(result.status).toBe('completed');
      // No second record: the follow-up is the same child.
      const rows = children(sid);
      expect(rows).toHaveLength(1);
      const survey = rows[0]!;
      expect(survey).toMatchObject({ canonical_name: 'survey', state: 'succeeded', observed: 1, report_stored: 1 });
      // Its second request carries its whole first conversation, then the follow-up as the next user message.
      const [first, second] = childRequests(client);
      expect(second).toBeDefined();
      const firstTexts = first!.messages.map(textOf);
      expect(second!.messages.slice(0, firstTexts.length).map(textOf)).toEqual(firstTexts);
      expect(textOf(second!.messages[firstTexts.length]!)).toBe('The module is small.');
      expect(second!.messages.at(-1)!.role).toBe('user');
      expect(textOf(second!.messages.at(-1)!)).toBe('TASK: which files does it have?');
      // The record holds the follow-up where the model saw it.
      const record = conversationOf(dal.agentConversation(sid, survey.task_id));
      expect(record.map(textOf)).toEqual(expect.arrayContaining(['TASK: which files does it have?', 'It has two files: a.ts and b.ts.']));
      // REQ-MONITOR-300 narrowed by clause 22: one exit from the terminal state, then the path any child takes.
      const moves = dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { from_state: string; to_state: string });
      expect(moves.map((m) => m.to_state)).toEqual(['starting', 'running', 'summarizing', 'succeeded', 'queued', 'starting', 'running', 'summarizing', 'succeeded']);
      expect(moves[4]).toEqual(expect.objectContaining({ from_state: 'succeeded', to_state: 'queued' }));
      // It reported again: two stored reports, the second the follow-up's.
      expect(dal.eventsOfKind(sid, 'child.complete')).toHaveLength(2);
      expect(JSON.parse(survey.report!)).toMatchObject({ final_response: 'It has two files: a.ts and b.ts.' });
      // REQ-TOOLS-153: the call returned the child's own task id; the root was told of its second end.
      expect(observed(client, 4)).toMatch(new RegExp(`^Task 'survey': queued — .*\\ntask_id: ${survey.task_id}$`));
      const told = rootRequests(client)[4]!;
      expect(textOf([...told.messages].reverse().find((m) => m.role === 'user')!)).toContain('It has two files: a.ts and b.ts.');
      expect(dal.timelineOf(sid).filter((t) => t.name === 'child_resumed').map((t) => JSON.parse(t.metadata) as Record<string, unknown>)).toEqual([expect.objectContaining({ task_id: survey.task_id, follow_up: true, from_state: 'succeeded', resume_state: 'queued' })]);
    });

    it('run_in_background false waits for the follow-up as for any child, and the call returns its new report', async () => {
      const { sid, result, client } = await surveyThenFollowUp((id) => ({ session_id: id, run_in_background: false }));
      expect(result.status).toBe('completed');
      expect(children(sid)).toHaveLength(1);
      expect(observed(client, 4)).toContain('It has two files: a.ts and b.ts.');
    });

    /** A settled child of another agent — a grandchild's shape — in the case's one session, `S1`. */
    const othersChild = () => {
      const OTHER = 'bg_0000a7e1';
      dal.insertChild({ session_id: 'S1', task_id: OTHER, canonical_name: 'grand', given_name: 'grand', persona: 'codebase-analyst', state: 'succeeded', parent_id: 'bg_0000a11e', depth: 2, iteration: 1, model_key: 'm', category: '', background: 1, task: 't', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: 't' });
      return { session_id: OTHER };
    };
    it.each([
      ['no task', () => ({ session_id: 'bg_0000dead' }), 1],
      ['a name rather than a task id', () => ({ session_id: 'survey' }), 1],
      ["another agent's child", othersChild, 2],
    ] as const)('PD-TOOLS-006 revision 3: a session_id naming %s is refused rejected, with no record and no task id', async (_name, followUp, records) => {
      const { sid, client } = await surveyThenFollowUp(followUp);
      expect(children(sid)).toHaveLength(records);
      expect(observed(client, 4)).toMatch(/^Task 'survey': rejected — .*session_id.*no settled child of yours/);
      expect(observed(client, 4)).not.toContain('task_id:');
      expect(dal.eventsOfKind(sid, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state)).not.toContain('queued');
    });

    it('OQ-66 ruled, REQ-TOOLS-155: a later iteration\'s root is refused a session_id naming an earlier iteration\'s child, which stays as it ended', async () => {
      let sid = '' as SessionId;
      let asked = false;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey the module' } }]);
          // The second iteration's root names the first iteration's settled child.
          if (!asked && textOf(req.messages.at(-1)!).includes('ask the survey again')) {
            asked = true;
            const survey = children(sid).find((c) => c.canonical_name === 'survey')!;
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: which files does it have?', session_id: survey.task_id } }]);
          }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"surveyed","key_findings":[],"tags":[]}');
        return answer('The module is small.');
      });
      sid = (sessions.start(dal, 'C:/ws', 'survey the module') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const survey = children(sid).find((c) => c.canonical_name === 'survey')!;
      expect(survey).toMatchObject({ state: 'succeeded', iteration: 1 });
      expect(sessions.prompt(sid, 'ask the survey again').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(asked).toBe(true);
      const refused = rootRequests(client).map((r) => textOf(r.messages.at(-1)!)).find((t) => t.startsWith("Task 'survey': rejected"));
      expect(refused).toMatch(/session_id.*no settled child of yours: none of your children has that task id/);
      expect(refused).not.toContain('task_id:');
      // Nothing moved: no second record, no exit from its terminal state, one report.
      expect(children(sid)).toHaveLength(1);
      expect(children(sid)[0]).toMatchObject({ task_id: survey.task_id, state: 'succeeded', iteration: 1 });
      expect(dal.eventsOfKind(sid, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state)).not.toContain('queued');
      expect(dal.eventsOfKind(sid, 'child.complete')).toHaveLength(1);
      expect(childRequests(client).filter((r) => r.messages.some((m) => textOf(m) === 'TASK: which files does it have?'))).toHaveLength(0);
    });

    it('PD-TOOLS-006 revision 3: a session_id naming a child that has not ended is refused rejected, and the child runs on untouched', async () => {
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      let sid = '' as SessionId;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'slow', task: 'TASK: slow' } }, { callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'quick', task: 'TASK: quick' } }], 'Two.');
          if (turn === 2) { const slow = children(sid).find((c) => c.canonical_name === 'slow')!; return toolCalls([{ callId: 'd3', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'slow', task: 'TASK: and?', session_id: slow.task_id } }]); }
          // The refusal is observed; only now may `slow` end.
          if (turn === 3) release();
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return textOf(req.messages.at(-1)!).includes('TASK: slow') ? { parts: [{ hold: held }, { part: { kind: 'text', delta: 'slow done' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer('quick done');
      });
      sid = (sessions.start(dal, 'C:/ws', 'two') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toHaveLength(2);
      expect(observed(client, 3)).toMatch(/^Task 'slow': rejected — .*session_id.*has not ended/);
      expect(children(sid).find((c) => c.canonical_name === 'slow')).toMatchObject({ state: 'succeeded' });
      expect(dal.eventsOfKind(sid, 'child.complete')).toHaveLength(2);
    });

    it('OQ-131: a child that never started — blocked by its dependency — is followed up from the payload it would have started with, then the follow-up, and REQ-ORCH-048\'s cascade does not block it again', async () => {
      let sid = '' as SessionId;
      let followed = false;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'a', task: 'TASK: a' } }]);
          if (turn === 2) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'b', task: 'TASK: b', depends_on: [children(sid).find((c) => c.canonical_name === 'a')!.task_id] } }]);
          const b = children(sid).find((c) => c.canonical_name === 'b');
          if (!followed && b?.state === 'blocked') { followed = true; return toolCalls([{ callId: 'd3', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'b', task: 'TASK: go ahead without a', session_id: b.task_id } }]); }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        // `a` says nothing and calls nothing, twice, so it ends failed and `b` is blocked; `b` answers.
        return answer(req.messages.some((m) => textOf(m).includes('TASK: b')) ? 'b went ahead.' : '');
      });
      sid = (sessions.start(dal, 'C:/ws', 'a then b') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(followed).toBe(true);
      const b = children(sid).find((c) => c.canonical_name === 'b')!;
      expect(children(sid).find((c) => c.canonical_name === 'a')!.state).toBe('failed');
      expect(b.state).toBe('succeeded');
      const asked = childRequests(client).filter((r) => r.messages.some((m) => textOf(m).includes('TASK: b')));
      expect(asked).toHaveLength(1);
      const users = asked[0]!.messages.filter((m) => m.role === 'user').map(textOf);
      // Its payload — the workspace root, then its task — and then the follow-up as its next user message.
      expect(users).toHaveLength(2);
      expect(users[0]).toMatch(/Workspace root: C:\/ws\.[\s\S]*TASK: b$/);
      expect(users[1]).toBe('TASK: go ahead without a');
      const moves = dal.eventsOfKind(sid, 'child.transition').map((e) => JSON.parse(e.payload) as { child_id: string; to_state: string }).filter((m) => m.child_id === b.task_id).map((m) => m.to_state);
      expect(moves).toEqual(['blocked', 'queued', 'starting', 'running', 'summarizing', 'succeeded']);
    });

    it('PD-ORCH-005 clauses 2 and 4: a follow-up still waiting for a model slot when the run is paused is paused where it stood, and the continue starts it from its record, the follow-up included', async () => {
      let sid = '' as SessionId;
      let release!: () => void;
      const hog = new Promise<void>((r) => { release = r; });
      let followed = false;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey the module' } }]);
          const survey = children(sid).find((c) => c.canonical_name === 'survey');
          if (!followed && survey?.state === 'succeeded') {
            followed = true;
            // `hog` takes the one model slot first, so the follow-up waits for it.
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'hog', task: 'TASK: hog' } }, { callId: 'd3', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: which files does it have?', session_id: survey.task_id } }]);
          }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const last = req;
        if (last.messages.some((m) => textOf(m).includes('TASK: hog'))) return { parts: [{ hold: hog }, { part: { kind: 'text', delta: 'hog done' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        return answer(textOf(last.messages.at(-1)!) === 'TASK: which files does it have?' ? 'It has two files.' : 'The module is small.');
      }, { cap: 1 });
      sid = (sessions.start(dal, 'C:/ws', 'survey, then ask again') as { value: SessionId }).value;
      for (let i = 0; i < 400 && children(sid).find((c) => c.canonical_name === 'survey')?.state !== 'waiting_on_model_slot'; i += 1) await new Promise((r) => setTimeout(r, 5));
      expect(children(sid).find((c) => c.canonical_name === 'survey')!.state).toBe('waiting_on_model_slot');
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      release();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      const paused = children(sid).find((c) => c.canonical_name === 'survey')!;
      expect(paused).toMatchObject({ state: 'paused', interruption: 'pause', resume_state: 'waiting_on_model_slot', report_stored: 0 });
      // The follow-up is in the record the continue resumes from.
      expect(textOf(conversationOf(dal.agentConversation(sid, paused.task_id)).at(-1)!)).toBe('TASK: which files does it have?');
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      const survey = children(sid).find((c) => c.canonical_name === 'survey')!;
      expect(survey.state).toBe('succeeded');
      expect(JSON.parse(survey.report!)).toMatchObject({ final_response: 'It has two files.' });
      // Its request after the continue carried its first conversation and the follow-up — never its payload afresh.
      const second = childRequests(client).filter((r) => textOf(r.messages.at(-1)!) === 'TASK: which files does it have?');
      expect(second).toHaveLength(1);
      expect(second[0]!.messages.filter((m) => m.role === 'user').map(textOf).filter((t) => t.includes('TASK: survey the module'))).toHaveLength(1);
      expect(second[0]!.messages.some((m) => m.role === 'assistant' && textOf(m) === 'The module is small.')).toBe(true);
    });

    it('clause 22 with REQ-ORCH-133: a child the user cancelled mid-step is followed up only once its execution has wound down, so that execution writes nothing over the follow-up', async () => {
      let sid = '' as SessionId;
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      let followed = false;
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey the module' } }]);
          const survey = children(sid).find((c) => c.canonical_name === 'survey');
          if (!followed && survey?.state === 'cancelled') { followed = true; return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: try again', session_id: survey.task_id } }]); }
          return answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        // The first step ignores its abort (a provider that does not honour it) and ends only when released.
        return textOf(req.messages.at(-1)!) === 'TASK: try again' ? answer('Tried again.') : { parts: [{ hold: held }, { part: { kind: 'text', delta: 'late words' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { deaf: ['child'] });
      sid = (sessions.start(dal, 'C:/ws', 'survey') as { value: SessionId }).value;
      for (let i = 0; i < 400 && childRequests(client).length === 0; i += 1) await new Promise((r) => setTimeout(r, 5));
      const id = children(sid)[0]!.task_id;
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: id } })).toEqual({ ok: true });
      // The root is told, and follows it up while the cancelled step still streams.
      for (let i = 0; i < 400 && !followed; i += 1) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 20));
      expect(children(sid)[0]!.state).toBe('cancelled');
      expect(childRequests(client)).toHaveLength(1);
      release();
      expect((await sessions.running(sid)!).status).toBe('completed');
      const survey = children(sid)[0]!;
      expect(survey.state).toBe('succeeded');
      expect(JSON.parse(survey.report!)).toMatchObject({ final_response: 'Tried again.' });
      // Two reports — the cancel's and the follow-up's — and nothing from the wound-down step between them.
      expect(dal.eventsOfKind(sid, 'child.complete').map((e) => (JSON.parse(e.payload) as { report: { status: string } }).report.status)).toEqual(['cancelled', 'succeeded']);
      expect(childRequests(client)).toHaveLength(2);
    });

    it('clause 4\'s rule for a record, at a follow-up: a call left open by an execution that raised out of it is answered as cut off before the follow-up is appended', async () => {
      const CRASHY = 'bg_0000c0de';
      const { sid, client } = await surveyThenFollowUp((surveyId) => {
        const survey = dal.getChild('S1' as SessionId, surveyId)!;
        dal.insertChild({ session_id: survey.session_id, task_id: CRASHY, canonical_name: 'crashy', given_name: 'crashy', persona: 'codebase-analyst', state: 'failed', parent_id: survey.parent_id, depth: 1, iteration: 1, model_key: 'm', category: '', background: 1, task: 'TASK: crashy', depends_on: '[]', inherited_context: '[]', granted_tools: '[]', granted_mcp: '{}', spawned_at: survey.spawned_at });
        dal.setChildObserved(survey.session_id as SessionId, CRASHY);
        for (const m of [{ role: 'user', content: [{ kind: 'text', text: 'TASK: crashy' }] }, { role: 'assistant', content: [{ kind: 'tool-call', callId: 'x1', name: 'read_file', args: '{"path":"a.ts"}' }] }]) {
          dal.insertAgentMessage({ session_id: survey.session_id, task_id: CRASHY, iteration: 1, kind: 'message', body: JSON.stringify(m), at: 't' });
        }
        return { session_id: CRASHY };
      }, (_step, req) => answer(req.messages.some((m) => textOf(m) === 'TASK: crashy') ? 'Crashy answers.' : 'The module is small.'));
      expect(children(sid).find((c) => c.task_id === CRASHY)!.state).toBe('succeeded');
      const asked = childRequests(client).find((r) => r.messages.some((m) => textOf(m) === 'TASK: crashy'))!;
      const tail = asked.messages.slice(-3);
      expect(tail.map((m) => m.role)).toEqual(['assistant', 'tool', 'user']);
      expect(tail[1]!.content).toEqual([expect.objectContaining({ kind: 'tool-result', callId: 'x1', isError: true, result: expect.stringMatching(/^This call was not run: its agent was stopped before it started/) })]);
      expect(textOf(tail[2]!)).toBe('TASK: which files does it have?');
    });

    it('PD-TOOLS-006 revision 3: a child its child_timeout cut off is refused, and the reason names continuation_of', async () => {
      // The survey never answers within its limit: its step holds until the limit and the landing grace have passed.
      let release!: () => void;
      const held = new Promise<void>((r) => { release = r; });
      const { sid, client } = await (async () => {
        const run = surveyThenFollowUp((id) => ({ session_id: id }), (step) => (step === 1 ? { parts: [{ hold: held }, { part: { kind: 'text', delta: 'partial' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer('never')), { childTimeoutMs: 1_000 });
        await new Promise((r) => setTimeout(r, 10));
        clock.advance(1_000);
        release();
        return run;
      })();
      const survey = children(sid).find((c) => c.canonical_name === 'survey')!;
      expect(JSON.parse(survey.report!)).toMatchObject({ errors: expect.arrayContaining([expect.objectContaining({ type: 'timeout' })]) });
      expect(survey.state).toBe('failed');
      expect(observed(client, 4)).toMatch(/^Task 'survey': rejected — .*child_timeout.*continuation_of/);
      expect(dal.eventsOfKind(sid, 'child.transition').map((e) => (JSON.parse(e.payload) as { to_state: string }).to_state)).not.toContain('queued');
    });
  });

  describe('REQ-TOOLS-152 / REQ-TOOLS-154 (5): inherited context reaches the child', () => {
    const textOf = (req: ModelRequest): string => req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('')).join('\n');

    it('the named completed sibling\'s report is item (5) of the child\'s payload: after the workspace root, immediately before the task, as the block the parent read', async () => {
      const payloads = new Map<string, string>();
      const { sessions, client } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'survey', task: 'TASK: survey', run_in_background: false } }], 'Surveying.');
          if (turn === 2) {
            const surveyId = /task_id: (bg_[0-9a-f]{8})/.exec(textOf(req))![1]!;
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coder', task_name: 'build', task: 'TASK: build', inherited_context: [surveyId], run_in_background: false } }], 'Building.');
          }
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: build') ? 'build' : 'survey';
        if (!payloads.has(name)) payloads.set(name, text);
        return answer(name === 'survey' ? 'The module is small.' : 'Built it.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'survey then build') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const rows = children(sid);
      expect(rows.map((c) => c.canonical_name).sort()).toEqual(['build', 'survey']);
      const survey = rows.find((c) => c.canonical_name === 'survey')!;
      const build = rows.find((c) => c.canonical_name === 'build')!;
      expect(JSON.parse(build.inherited_context)).toEqual([survey.task_id]);
      // (1) the root, (3) the sibling-artifact index the survey's report became, (5) the same report block the parent
      // was handed, (6) the task — in REQ-TOOLS-154's order, with nothing between (5) and (6).
      // PD-TOOLS-006 revision 10 (OQ-334): the report-artifact sentence follows the root, ahead of (3).
      expect(payloads.get('build')).toContain(`Workspace root: C:/ws. Treat any other absolute path you encounter as stale; every path you use is relative to this root.\n\n${CHILD_REPORT_ARTIFACT_SENTENCE}\n\nPRIOR SIBLING ARTIFACT INDEX\n`);
      expect(payloads.get('build')?.replace(`${CHILD_REPORT_ARTIFACT_SENTENCE}\n\n`, '')).toMatch(/Workspace root: C:\/ws\.[^\n]*\n\nPRIOR SIBLING ARTIFACT INDEX\n[^\n]*survey[^\n]*\n\n\[Inherited context — [^\n]*\]\n\n### survey \(codebase-analyst\) — succeeded\nThe module is small\.\n\nTASK: build$/);
      const parentRead = textOf(client.requests.find((r) => textOf(r).includes('TASK: build'))!);
      expect(parentRead).toContain('### survey (codebase-analyst) — succeeded\nThe module is small.');
      // The survey's own payload carried no such block: nothing had been named for it.
      expect(payloads.get('survey')).not.toContain('[Inherited context');
      // The delegation itself was ordinary: accepted, no wait on the sibling (REQ-ORCH-032).
      expect(JSON.parse(build.depends_on)).toEqual([]);
    });

    /*
     * PD-TOOLS-006 revision 9 (OQ-256): the duress live run at 552d346 handed the architect's 28,330-character answer to the
     * writer cut to 4,000 characters (finding V1). Each hand-off field now carries a whole answer up to 100,000 characters,
     * and the caller is told at acceptance exactly what the stored block, or the dependency's block as a forecast, cut.
     */
    const handOffRun = async (answerLength: number, field: 'inherited_context' | 'depends_on') => {
      const payloads = new Map<string, string>();
      const observed: string[] = [];
      const long = `A${'x'.repeat(answerLength - 2)}Z`;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'architect', task_name: 'design', task: 'TASK: design', run_in_background: false } }], 'Designing.');
          if (turn === 2) {
            const designId = /task_id: (bg_[0-9a-f]{8})/.exec(textOf(req))![1]!;
            return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'docs-writer', task_name: 'write', task: 'TASK: write', [field]: [designId], run_in_background: false } }], 'Writing.');
          }
          observed.push(textOf(req));
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = textOf(req);
        const name = text.includes('TASK: write') ? 'write' : 'design';
        if (!payloads.has(name)) payloads.set(name, text);
        return answer(name === 'design' ? long : 'Written.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'design then write') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const rows = children(sid);
      return { long, payload: payloads.get('write') ?? '', observed: observed.join('\n'), design: rows.find((c) => c.canonical_name === 'design')!, write: rows.find((c) => c.canonical_name === 'write')! };
    };

    it('PD-TOOLS-006 revision 9: a 28,330-character answer reaches the writer whole through inherited_context, and the caller is warned of nothing', async () => {
      const r = await handOffRun(28_330, 'inherited_context');
      expect(r.payload).toContain(`### design (architect) — succeeded\n${r.long}\n\nTASK: write`);
      expect(r.payload).not.toContain('omitted');
      expect(r.observed).not.toContain('hand-off cuts');
    });

    it('PD-TOOLS-006 revision 9: an answer over the budget is cut with the marker, and the observation names the very cut the stored block holds', async () => {
      const r = await handOffRun(120_000, 'inherited_context');
      expect(r.write.inherited_context_block).toContain(`${r.long.slice(0, 100_000)}\n… [hand-off cut: 100000 of 120000 characters of design's answer are given here and 20000 are omitted`);
      expect(r.payload).toContain(r.write.inherited_context_block);
      const stored = inheritedContext([r.design]);
      expect(stored.block).toBe(r.write.inherited_context_block);
      expect(r.observed).toContain(`hand-off cuts: ${JSON.stringify({ inherited: stored.cuts, dependsOn: [], budget: 100_000 })}`);
      expect(stored.cuts).toEqual([{ taskId: r.design.task_id, name: 'design', given: 100_000, omitted: 20_000 }]);
    });

    it('PD-TOOLS-006 revision 9: depends_on on a completed task forecasts the cut REQ-ORCH-047\'s block then makes', async () => {
      const r = await handOffRun(120_000, 'depends_on');
      expect(r.payload.indexOf('[Prior agent context — authoritative')).toBeGreaterThanOrEqual(0);
      expect(r.payload.indexOf('[Prior agent context — authoritative')).toBeLessThan(r.payload.indexOf('Workspace root: C:/ws.'));
      expect(r.payload).toContain(`#### design (architect, succeeded)\n${r.long.slice(0, 100_000)}\n… [hand-off cut: 100000 of 120000`);
      expect(r.observed).toContain(`hand-off cuts: ${JSON.stringify({ inherited: [], dependsOn: [{ taskId: r.design.task_id, name: 'design', given: 100_000, omitted: 20_000 }], budget: 100_000 })}`);
    });

    it('an id naming no task refuses the delegation: no child, no task id, the reason names the id (REQ-TOOLS-153)', async () => {
      const { sessions, client } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'build', task: 'TASK: x', inherited_context: ['bg_00000000'] } }], 'Delegating.') : answer('Understood.');
        }
        return answer('unreachable');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'try it') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(children(sid)).toEqual([]);
      const resumed = textOf(client.requests.at(-1)!);
      expect(resumed).toContain("Task 'build': rejected — inherited_context id 'bg_00000000' refers to nothing: no task has that id");
      expect(resumed).not.toContain('task_id:');
    });
  });

  it('REQ-TOOLS-030/073 (PD-TOOLS-002): a mid-run switch to autonomous reaches the children built after it', async () => {
    const ref: { sid?: SessionId } = {};
    const { sessions, built } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) {
          // Mid-run, while the entry agent is the only agent: the user picks `autonomous` in the composer.
          expect(sessions.control({ op: 'setPermissionMode', sessionId: ref.sid!, args: { mode: 'autonomous' } })).toEqual({ ok: true });
          return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.');
        }
        return answer('All done.');
      }
      if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
      return answer('I implemented it.');
    });
    ref.sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(ref.sid)!).status).toBe('completed');
    // The entry agent was built before the switch; the child was built after it and must carry the new mode.
    expect(built[0]).toMatchObject({ persona: 'orchestrator', mode: 'ask' });
    expect(built.slice(1).map((b) => b.mode)).not.toContain('ask');
  });

  /**
   * PD-TOOLS-005, the engine's half: ONE away holder per run reaches every agent's port context, delegated children
   * included; the user's input to the run's session — a mode change, a message, an answer — clears it; and a later run of
   * the session starts with the user present. The gate's half (marking on the expired wait, resolving at once with the
   * directive's reason) is `gate.test.ts`'s and `run-host/tools.test.ts`'s; here a stand-in reads the holder as the gate does.
   */
  describe('PD-TOOLS-005: the run\'s away state reaches every agent, ends on the user\'s input, and does not outlive the run', () => {
    const tick = () => new Promise((r) => setTimeout(r, 10));
    const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
    /** The gate's consultation, stood in: a `write_file` ask is denied at once while away, and "times out" (marks away) when the path says so. */
    const asks: { agent: string; away: { afterSeconds: number } | null }[] = [];
    const gateStandIn = (name: string, a: Record<string, unknown>, ctx: ToolPortContext): Promise<PortToolResult> | undefined => {
      if (name !== 'write_file') return undefined;
      const away = ctx.presence?.away() ?? null;
      asks.push({ agent: ctx.agentName, away });
      if (away !== null) return Promise.resolve({ text: `Permission denied. The user is treated as away because an earlier approval in this run went unanswered for ${away.afterSeconds} seconds, so the request was denied.`, isError: true, status: 'blocked', durationMs: 0, label: name, args: a });
      if (String(a['path']) === 'unanswered.ts') { ctx.presence?.markAway(5); return Promise.resolve({ text: 'Permission denied. Denied because no answer arrived within 5 seconds.', isError: true, status: 'blocked', durationMs: 5_000, label: name, args: a }); }
      return Promise.resolve({ text: 'ok', isError: false, status: 'ok', durationMs: 1, label: name, args: a });
    };

    it('a child\'s ask in an away run reads the mark the root\'s expired wait set, on the one holder the run hands every port', async () => {
      asks.length = 0;
      const { sessions, contexts } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([{ callId: 'w0', name: 'write_file', args: { path: 'unanswered.ts', content: 'a' } }]);
          if (turn === 2) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it', run_in_background: false } }]);
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return turn === 1 ? toolCalls([{ callId: 'w1', name: 'write_file', args: { path: 'child.ts', content: 'b' } }]) : answer('I could not write.');
      }, { tool: gateStandIn });
      const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      const root = contexts.get('orchestrator')!;
      const child = contexts.get('implement')!;
      expect(root.presence).toBeDefined();
      expect(child.presence).toBe(root.presence);
      expect(asks).toEqual([{ agent: 'orchestrator', away: null }, { agent: 'implement', away: { afterSeconds: 5 } }]);
      // The transition is in the session log's words, once.
      expect(warnings.filter((w) => w.startsWith('user away: an approval in this run went unanswered for 5 seconds'))).toHaveLength(1);
      // OQ-76's ruling (PD-TOOLS-011): and on the timeline, as `user_away`, the run's own entry.
      expect(dal.timelineOf(sid).filter((t) => t.name === 'user_away').map((t) => [t.actor, JSON.parse(t.metadata)])).toEqual([['rotaris', { after_seconds: 5 }]]);
      // The run ended: the holder is the run's, and a later run of this session starts present (below).
      expect(root.presence!.away()).toEqual({ afterSeconds: 5 });
    });

    it('the user returns on a permission-mode change, a message or an answer; shutdown is not the user; a new run starts present', async () => {
      asks.length = 0;
      const hold = gate();
      let sid = '' as SessionId;
      const { sessions, contexts } = sessionsWith((persona, turn) => {
        if (persona !== 'orchestrator') return answer('unused');
        if (turn === 1) return toolCalls([{ callId: 'w0', name: 'write_file', args: { path: 'unanswered.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'hold' } }]);
        return answer(`root turn ${turn}`);
      }, { tool: (name, a, ctx) => (name === 'read_file' ? hold.p.then(() => ({ text: 'held', isError: false, status: 'ok' as const, durationMs: 1, label: name, args: a })) : gateStandIn(name, a, ctx)) });
      sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
      // The run is live, parked on the held read, with the user marked away by the expired wait before it.
      await tick();
      const presence = contexts.get('orchestrator')!.presence!;
      expect(presence.away()).toEqual({ afterSeconds: 5 });
      // A permission-mode change returns the user …
      expect(sessions.control({ op: 'setPermissionMode', sessionId: sid, args: { mode: 'autonomous' } })).toEqual({ ok: true });
      expect(presence.away()).toBeNull();
      expect(warnings.filter((w) => w.startsWith('user returned:'))).toHaveLength(1);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'user_returned').map((t) => [t.actor, JSON.parse(t.metadata)])).toEqual([['user', { after_seconds: 5 }]]);
      // … so does a message to the run, even one the operation then refuses (blank text) — the input is the user's.
      presence.markAway(5);
      expect(sessions.control({ op: 'createQueuedPrompt', sessionId: sid, args: { text: '   ' } })).toEqual({ ok: false });
      expect(presence.away()).toBeNull();
      // An answer routed by request id returns the user of the session that held it; a stale id, held by none, returns nobody.
      presence.markAway(5);
      expect(sessions.answerApproval('no-such-request', 'once')).toBe(false);
      expect(presence.away()).toEqual({ afterSeconds: 5 });
      // The application's shutdown announcement is not the user's input; a run control is. (Shutdown is not sent here — it would stop the run.)
      expect(sessions.control({ op: 'setReasoning', sessionId: sid, args: { level: 'low' } }).ok).toBe(true);
      expect(presence.away()).toBeNull();
      presence.markAway(5);
      hold.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
      // A later run of the same session: a fresh holder, present, and the old one is not consulted.
      contexts.clear();
      const again = sessions.prompt(sid, 'and again');
      expect(again.ok).toBe(true);
      expect((await sessions.running(sid)!).status).toBe('completed');
      const next = contexts.get('orchestrator')!.presence!;
      expect(next).not.toBe(presence);
      expect(next.away()).toBeNull();
      expect(presence.away()).toEqual({ afterSeconds: 5 });
    });

    it('the user returns on a confirmed transcript clear, a compression, and an approval or question answer the run holds', async () => {
      const hold = gate();
      const { sessions, contexts } = sessionsWith((persona, turn) => {
        if (persona !== 'orchestrator') return answer('unused');
        if (turn === 1) return toolCalls([{ callId: 'w0', name: 'write_file', args: { path: 'unanswered.ts', content: 'a' } }, { callId: 'r1', name: 'read_file', args: { path: 'hold' } }]);
        return answer(`root turn ${turn}`);
      }, {
        tool: (name, a, ctx) => (name === 'read_file' ? hold.p.then(() => ({ text: 'held', isError: false, status: 'ok' as const, durationMs: 1, label: name, args: a })) : gateStandIn(name, a, ctx)),
        pending: new Set(['live-approval', 'live-questions', 'cancelled-questions']),
      });
      const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
      await tick();
      const presence = contexts.get('orchestrator')!.presence!;
      expect(presence.away()).toEqual({ afterSeconds: 5 });
      // REQ-MONITOR-004 / REQ-CHAT-084: the confirmed clear is an operation on the live run, answered before `control`'s common line.
      expect(sessions.control({ op: 'clearTranscript', sessionId: sid, args: {} }).ok).toBe(true);
      expect(presence.away()).toBeNull();
      // REQ-MONITOR-092: the compression the host awaits reaches `controlAsync`, never `control`; the return is taken before it settles.
      presence.markAway(5);
      const compressing = sessions.controlAsync({ op: 'forceCompression', sessionId: sid, args: {} });
      expect(presence.away()).toBeNull();
      await compressing;
      // ADR-0013: answers routed by request id — the session whose run holds the id is the one whose user returns.
      presence.markAway(5);
      expect(sessions.answerApproval('live-approval', 'once')).toBe(true);
      expect(presence.away()).toBeNull();
      presence.markAway(5);
      expect(sessions.answerQuestions('live-questions', {})).toBe(true);
      expect(presence.away()).toBeNull();
      presence.markAway(5);
      expect(sessions.cancelQuestions('cancelled-questions')).toBe(true);
      expect(presence.away()).toBeNull();
      hold.open();
      expect((await sessions.running(sid)!).status).toBe('completed');
    });
  });

  /*
   * PD-ORCH-005 clause 9 / REQ-SESSION-031 (docs/archive/defects/pending-approvals-holds-one-agents-list-when-two-agents-wait-on-approvals.md):
   * each agent's port holds its own approvals and the session has one `pending_approvals` column, so what every port is
   * handed to write there (`pendingApprovalsOfSession`) is the run's list over EVERY port — the root's and each child's —
   * not the asking port's alone. Until 2026-10-14 nothing gathered them, and two agents waiting at once overwrote each other.
   */
  it('PD-ORCH-005 clause 9 / REQ-SESSION-031: every port is handed the run\'s pending approvals over all its agents', async () => {
    const gates: (() => void)[] = [];
    const approval = (agent: string): ApprovalPayload => ({ request_id: `ask-${agent}`, session_id: 'S1', agent_id: agent, persona: agent, tool_name: 'write_file', command: '', argument_summary: '', rule_id: 'r', reason: 'asks', sequence: 1 });
    const { sessions, contexts } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'one', task: 'TASK: one' } }, { callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'two', task: 'TASK: two' } }]) : answer('both done');
      if (persona === 'summariser') return answer('{"summary":"x"}');
      if (turn > 2) return answer('Done.');
      const hold = new Promise<void>((r) => { gates.push(r); });
      return { parts: [{ hold }, ...answer('Done.').parts] };
    }, { approvals: (ctx) => [approval(ctx.agentName)] });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    for (let i = 0; i < 400 && gates.length < 2; i += 1) await new Promise((r) => setTimeout(r, 5));
    expect(gates).toHaveLength(2);
    const ids = (agent: string) => [...(contexts.get(agent)!.pendingApprovalsOfSession?.() ?? [])].map((a) => a.request_id).sort();
    const all = ['ask-one', 'ask-orchestrator', 'ask-two'];
    expect(ids('orchestrator')).toEqual(all);
    expect(ids('one')).toEqual(all);
    expect(ids('two')).toEqual(all);
    for (const open of gates) open();
    expect((await sessions.running(sid)!).status).toBe('completed');
  });

  it('REQ-MONITOR-102: the persisted tool-call total is session-wide — the entry agent\'s calls AND its children\'s', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coder', task_name: 'implement', task: 'TASK: write it' } }], 'Delegating.') : answer('All done.');
      if (persona === 'summariser') return answer('{"summary":"done"}');
      return turn === 1 ? toolCalls([{ callId: 'b1', name: 'background_output', args: { task_id: 'none' } }], 'Checking.') : answer('I implemented it.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'build the thing') as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(children(sid)[0]!.tool_calls).toBe(1);
    // One delegate by the entry agent, one call by the child. A total that held the entry agent's alone read 1,
    // and every surface that subtracts the per-agent counts from it — the synthetic run row — read zero.
    expect(dal.getSession(sid)!.tool_calls).toBe(2);
  });

  it('a foreground delegation waits through the one mechanism and returns the report inline; wait_for_tasks refuses the caller\'s own task', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') {
        if (turn === 1) return toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'tester', task_name: 'test it', task: 'TASK: run tests', run_in_background: false } }]);
        if (turn === 2) return toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: ['root:1'] } }]);
        return answer('done');
      }
      if (persona === 'summariser') return answer('{"summary":"tests pass"}');
      return answer('All tests pass.');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'test') as { value: SessionId }).value;
    await sessions.running(sid)!;
    const rows = dal.residentRows(sid);
    const delegateRow = rows.find((r) => r.kind === 'tool' && r.tool_name === 'delegate')!;
    expect(delegateRow.output).toContain('The waited-for background tasks completed (1).');
    expect(delegateRow.output).toContain('### test-it (tester) — succeeded');
    const waitRow = rows.find((r) => r.kind === 'tool' && r.tool_name === 'wait_for_tasks')!;
    expect(waitRow.output).toBe('An agent cannot wait for its own task.');
    expect(waitRow.tool_status).toBe('failed');
  });

  it('REQ-ORCH-088: a child that never answers times out, reports failed with the timeout, and the parent still completes', async () => {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow' } }]) : answer('finished after the timeout');
      if (persona === 'summariser') return answer('not json');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'late' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    expect(children(sid)[0]!.state).toBe('running');
    clock.advance(1_200_000);
    releaseChild();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const c = children(sid)[0]!;
    expect(c.state).toBe('failed');
    const report = JSON.parse(c.report!) as { errors: { type: string; message: string }[] };
    expect(report.errors.map((e) => e.type)).toEqual(expect.arrayContaining(['timeout', 'summary_failure']));
    expect(dal.issuesOf(sid).map((i) => i.kind)).toContain('timeout');
  });

  describe('REQ-NOTIFY-111/112 with REQ-ORCH-089: a child that produces no output is given its one corrective message', () => {
    const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const failed = modelError({ code: 'unknown', headline: 'the stream ended with no answer' });
    /** Each child request is `silent` (held, then fails) or answers; `gates` releases the silent ones in order. */
    function stalling(plan: readonly ('silent' | 'fails at once' | 'answers')[], over: { childStallTimeoutMs?: number } = {}) {
      const gates: (() => void)[] = [];
      const childAsked: string[] = [];
      const made = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quiet', task: 'TASK: be quiet' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        childAsked.push(userText(req));
        const step = plan[turn - 1] ?? 'answers';
        if (step === 'answers') return answer('I carried on and finished.');
        if (step === 'fails at once') return { parts: [{ error: failed }] };
        const hold = new Promise<void>((r) => { gates.push(r); });
        return { parts: [{ hold }, { error: failed }] };
      }, over);
      return { ...made, gates, childAsked };
    }
    const child = (sid: SessionId) => children(sid)[0]!;

    it('the step goes silent for the window and then fails: the stall is warned with its issue, the child is given one corrective message and resumes from where it stopped, and it succeeds', async () => {
      const { sessions, gates, childAsked } = stalling(['silent', 'answers']);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(90_000);
      // REQ-MONITOR-119: the stall is reported while the child is still running — nothing is cancelled.
      expect(child(sid).state).toBe('running');
      const stall = dal.issuesOf(sid).filter((i) => i.kind === 'stall');
      expect(stall.map((i) => [i.severity, i.message])).toEqual([['warning', `child appears stalled: no model event or token for 90 seconds (quiet, ${child(sid).task_id}); the run is still waiting on it.`]]);
      expect(JSON.parse(stall[0]!.metadata)).toEqual({ task_id: child(sid).task_id, silent_seconds: 90, active_tools: [], recent_tool_calls: [], last_model_event: null });
      expect(warnings).toContain(stall[0]!.message);
      gates[0]!();
      const result = await sessions.running(sid)!;
      expect(result.status).toBe('completed');
      // Its third request is REQ-ORCH-095's, a separate re-prompt: an implementer that answered without acting on anything.
      expect(childAsked).toHaveLength(3);
      expect(childAsked[2]).toContain('Carry out the task now');
      // The corrective message follows the conversation the failed turn left: the task, then the message.
      expect(childAsked[1]).toContain('TASK: be quiet');
      expect(childAsked[1]).toContain('[Corrective message] You produced no output for 90 seconds (the stall window, runtime.child_stall_timeout, is 90 seconds), and your last model request then failed: the stream ended with no answer.');
      // OQ-127's ruling: the session log says it was sent, at WARNING (it follows a failed step), and the timeline records
      // it as a `corrective_message` entry (OQ-157's word) of the same severity (finding F11: `info` until 2026-10-06).
      const line = `child corrective message: quiet (${child(sid).task_id}) produced no output for 90 seconds and its model request then failed (the stream ended with no answer); it was given its one corrective message and resumes (REQ-NOTIFY-111)`;
      expect(warnings.filter((m) => m.startsWith('child corrective message:'))).toEqual([line]);
      const entries = dal.timelineOf(sid).filter((t) => t.name === 'corrective_message');
      expect(entries.map((t) => [t.actor, t.message, t.severity])).toEqual([['quiet', line, 'warning']]);
      expect(JSON.parse(entries[0]!.metadata)).toEqual({ task_id: child(sid).task_id, quiet_seconds: 90, window_seconds: 90, failure: 'the stream ended with no answer' });
      expect(child(sid).state).toBe('succeeded');
      expect(JSON.parse(child(sid).report!)).toMatchObject({ status: 'succeeded' });
    });

    it('PD-MONITOR-005 revision 2 (REQ-MONITOR-119/120): the `stall` issue is written with each throttled warning and only then — at entry and at the throttle', async () => {
      const { sessions, gates } = stalling(['silent', 'answers']);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(90_000);
      clock.advance(10_000);
      const silent = () => dal.issuesOf(sid).filter((i) => i.kind === 'stall').map((i) => (JSON.parse(i.metadata) as { silent_seconds: number }).silent_seconds);
      // The evaluations at 90, 95 and 100 s each find the stall; the warning and its issue are written once, at entry.
      expect(silent()).toEqual([90]);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall').every((i) => i.severity === 'warning')).toBe(true);
      expect(warnings.filter((m) => m.startsWith('child appears stalled'))).toEqual([`child appears stalled: no model event or token for 90 seconds (quiet, ${child(sid).task_id}); the run is still waiting on it.`]);
      // REQ-MONITOR-120: the next warning is due max(90 s, 30 s) after the first.
      clock.advance(80_000);
      // Nineteen evaluations found the stall; two issues, each beside its warning, so one long stall cannot evict the
      // session's other issues from REQ-SESSION-133's ring.
      expect(silent()).toEqual([90, 180]);
      expect(warnings.filter((m) => m.startsWith('child appears stalled')).map((m) => /for (\d+) seconds/.exec(m)![1])).toEqual(['90', '180']);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall').map((i) => i.message)).toEqual(warnings.filter((m) => m.startsWith('child appears stalled')));
      gates[0]!();
      expect((await sessions.running(sid)!).status).toBe('completed');
    });

    it('REQ-MONITOR-118/120: a tool call in flight is waited on, not a stall; a stall that ends in output is recorded as recovered', async () => {
      let releaseTool!: () => void;
      const toolHeld = new Promise<void>((r) => { releaseTool = r; });
      let speak!: () => void;
      const spoken = new Promise<void>((r) => { speak = r; });
      let finish!: () => void;
      const finished = new Promise<void>((r) => { finish = r; });
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quiet', task: 'TASK: be quiet' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (turn === 1) return toolCalls([{ callId: 'r1', name: 'read_file', args: { path: 'a' } }]);
        return { parts: [{ hold: spoken }, { part: { kind: 'text', delta: 'Read it; ' } }, { hold: finished }, { part: { kind: 'text', delta: 'done.' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      }, { tool: (name, a) => (name === 'read_file' ? toolHeld.then(() => ({ text: 'contents', isError: false, status: 'ok' as const, durationMs: 1, label: name, args: a })) : undefined) });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.timelineOf(sid).length > 0 && child(sid)?.state === 'running');
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(90_000);
      // OQ-127's ruling: REQ-MONITOR-118's informational message is an intended state — at INFO, never a warning — and a
      // `waiting_on_tools` timeline entry.
      const waitLine = `child waiting on tools: quiet (${child(sid).task_id}) has 1 active tool call and no model event or token for 90 seconds; the run is still waiting on it (REQ-MONITOR-118)`;
      expect(infos.filter((m) => m.startsWith('child waiting on tools:'))).toEqual([waitLine]);
      expect(warnings.filter((m) => m.startsWith('child waiting on tools:'))).toEqual([]);
      const waited = dal.timelineOf(sid).filter((t) => t.name === 'waiting_on_tools');
      expect(waited.map((t) => [t.actor, t.message, t.severity])).toEqual([['quiet', waitLine, 'info']]);
      expect(JSON.parse(waited[0]!.metadata)).toEqual({ task_id: child(sid).task_id, silent_seconds: 90, active_calls: 1 });
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall')).toEqual([]);
      releaseTool();
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(90_000);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall')).toHaveLength(1);
      speak();
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(5_000);
      const recoveredLine = `child stall recovered: quiet (${child(sid).task_id}) is active again after a stall (REQ-MONITOR-120)`;
      expect(infos.filter((m) => m.startsWith('child stall recovered:'))).toEqual([recoveredLine]);
      expect(warnings.filter((m) => m.startsWith('child stall recovered:'))).toEqual([]);
      finish();
      await sessions.running(sid)!;
      expect(child(sid).state).toBe('succeeded');
      // OQ-127's ruling: the recovery is a `stall_recovered` timeline entry beside its line.
      expect(dal.timelineOf(sid).filter((t) => t.name === 'stall_recovered').map((t) => [t.actor, t.message, JSON.parse(t.metadata)])).toEqual([['quiet', recoveredLine, { task_id: child(sid).task_id }]]);
    });

    /*
     * The duress live runs' child (L2 at c2fdd6a, N1 at c2a9444): its last text token, then a `write_file` whose arguments
     * streamed for about 97 s. Each piece now reaches the run as a `tool-input` model event
     * (docs/archive/defects/a-child-streaming-a-long-tool-call-is-reported-stalled.md).
     */
    it('REQ-ORCH-089 / REQ-NOTIFY-112 / REQ-CHAT-164: a child streaming a tool call\'s arguments for 95 s is not stalled, its row is not marked stalled, and a failure after it earns no corrective message', async () => {
      const increments: TranscriptIncrement[] = [];
      const gates: (() => void)[] = [];
      const childAsked: string[] = [];
      const PIECES = 19;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'writer', task: 'TASK: write the report' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        childAsked.push(userText(req));
        const gate = (): Promise<void> => new Promise<void>((r) => { gates.push(r); });
        const pieces = Array.from({ length: PIECES }, () => [{ hold: gate() }, { part: { kind: 'tool-input' as const, callId: 'w1' } }]).flat();
        return { parts: [{ part: { kind: 'text', delta: 'Writing the report now.' } }, ...pieces, { hold: gate() }, { error: failed }] };
      }, { publisher: { increment: (p) => increments.push(p), snapshot: () => undefined } });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === PIECES + 1);
      await new Promise((r) => setTimeout(r, 20));
      // A piece every 5 s: 95 s of arguments, past the 90 s threshold and nine times REQ-CHAT-164's ten seconds.
      for (let i = 0; i < PIECES; i += 1) {
        clock.advance(5_000);
        gates[i]!();
        await new Promise((r) => setTimeout(r, 5));
      }
      expect(child(sid).state).toBe('running');
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall')).toEqual([]);
      expect(warnings.filter((m) => m.startsWith('child appears stalled'))).toEqual([]);
      // REQ-CHAT-164: the child's live row was never marked as a provider producing no output.
      expect(increments.flatMap((p) => p.rows).filter((r) => r.stalledSince !== undefined)).toEqual([]);
      gates[PIECES]!();
      expect((await sessions.running(sid)!).status).toBe('completed');
      // REQ-NOTIFY-112: the child produced output until it failed, so it is not owed the corrective message.
      expect(childAsked).toHaveLength(1);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'corrective_message')).toEqual([]);
      expect(child(sid).state).toBe('failed');
    });

    it('at most one corrective message per child: a second silent failure ends it failed', async () => {
      const { sessions, gates, childAsked } = stalling(['silent', 'silent']);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(90_000);
      gates[0]!();
      await settle(() => gates.length === 2);
      clock.advance(90_000);
      gates[1]!();
      await sessions.running(sid)!;
      expect(childAsked).toHaveLength(2);
      expect(childAsked.filter((t) => t.includes('[Corrective message]'))).toHaveLength(1);
      expect(child(sid).state).toBe('failed');
      expect(JSON.parse(child(sid).report!)).toMatchObject({ status: 'failed', errors: [{ type: 'model', message: 'the stream ended with no answer' }] });
    });

    it('a failure inside the window is not the stall condition: no corrective message, and the child ends failed', async () => {
      const { sessions, childAsked } = stalling(['fails at once']);
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(childAsked).toHaveLength(1);
      expect(warnings.filter((m) => m.startsWith('child corrective message:'))).toEqual([]);
      expect(child(sid).state).toBe('failed');
    });

    it('runtime.child_stall_timeout is the window: at 30 s, a failure 29 s into the silence earns nothing', async () => {
      const { sessions, gates, childAsked } = stalling(['silent'], { childStallTimeoutMs: 30_000 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(29_000);
      gates[0]!();
      await sessions.running(sid)!;
      expect(childAsked).toHaveLength(1);
      expect(child(sid).state).toBe('failed');
    });

    it('runtime.child_stall_timeout is the window: at 30 s, a failure 30 s into the silence earns its message', async () => {
      const { sessions, gates, childAsked } = stalling(['silent', 'answers'], { childStallTimeoutMs: 30_000 });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(30_000);
      gates[0]!();
      await sessions.running(sid)!;
      expect(childAsked[1]).toContain('[Corrective message] You produced no output for 30 seconds (the stall window, runtime.child_stall_timeout, is 30 seconds)');
      expect(child(sid).state).toBe('succeeded');
    });

    /** How many corrective messages one request's conversation carries. */
    const correctives = (text: string): number => (text.match(/\[Corrective message\]/g) ?? []).length;

    it('REQ-NOTIFY-112 across PD-ORCH-005: a child given its corrective message before a pause is not given a second after the continue', async () => {
      const gates: (() => void)[] = [];
      const childAsked: string[] = [];
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quiet', task: 'TASK: be quiet' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        childAsked.push(userText(req));
        if (turn >= 4) return answer('I carried on and finished.');
        const hold = new Promise<void>((r) => { gates.push(r); });
        // The step after the corrective message is the one in flight when the pause is accepted: it asks for a call.
        if (turn === 2) return { parts: [{ hold }, ...toolCalls([{ callId: 'p1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
        return { parts: [{ hold }, { error: failed }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      clock.advance(90_000);
      gates[0]!();
      await settle(() => gates.length === 2);
      expect(correctives(childAsked[1]!)).toBe(1);
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      gates[1]!();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(child(sid)).toMatchObject({ state: 'paused', resume_state: 'running' });
      // The same child task resumes from its record, goes silent for the whole window again, and fails.
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => gates.length === 3);
      clock.advance(90_000);
      gates[2]!();
      await sessions.running(sid)!;
      // The count is per child task: no request carries a second corrective message, and the second failure ends it failed.
      expect(childAsked).toHaveLength(3);
      expect(childAsked.map(correctives)).toEqual([0, 1, 1]);
      expect(warnings.filter((m) => m.startsWith('child corrective message:'))).toHaveLength(1);
      expect(child(sid).state).toBe('failed');
    });

    it('REQ-NOTIFY-112: a child that waited on its own child past the window was asked for no output then, so a resumed step that fails at once earns nothing', async () => {
      let releaseLeaf!: () => void;
      const leafHeld = new Promise<void>((r) => { releaseLeaf = r; });
      const midAsked: string[] = [];
      let leafAsked = 0;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'mid', task: 'TASK: mid' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        const text = userText(req);
        if (!text.includes('TASK: mid')) { leafAsked += 1; return { parts: [{ hold: leafHeld }, ...answer('leaf done').parts] }; }
        midAsked.push(text);
        if (midAsked.length === 1) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'leaf', task: 'TASK: leaf' } }], 'Delegating.');
        if (midAsked.length === 2) return answer('Waiting on leaf.');
        // Resumed with leaf's report, its step fails at once.
        return { parts: [{ error: failed }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      const byName = (name: string) => children(sid).find((c) => c.canonical_name === name);
      await settle(() => midAsked.length === 2 && leafAsked === 1);
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(120_000);
      releaseLeaf();
      await sessions.running(sid)!;
      expect(midAsked).toHaveLength(3);
      expect(midAsked.map(correctives)).toEqual([0, 0, 0]);
      expect(warnings.filter((m) => m.startsWith('child corrective message:'))).toEqual([]);
      expect(byName('mid')!.state).toBe('failed');
    });

    it('REQ-ORCH-089 / REQ-MONITOR-119 (OQ-155): a child waiting on its own child between its turns is not reported stalled; the child that is silent is, by its own watch', async () => {
      let releaseLeaf!: () => void;
      const leafHeld = new Promise<void>((r) => { releaseLeaf = r; });
      let midAsked = 0;
      let leafAsked = 0;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'mid', task: 'TASK: mid' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (!userText(req).includes('TASK: mid')) { leafAsked += 1; return { parts: [{ hold: leafHeld }, ...answer('leaf done').parts] }; }
        midAsked += 1;
        if (midAsked === 1) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'leaf', task: 'TASK: leaf' } }], 'Delegating.');
        if (midAsked === 2) return answer('Waiting on leaf.');
        return answer('Leaf reported; done.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      const byName = (name: string) => children(sid).find((c) => c.canonical_name === name)!;
      await settle(() => midAsked === 2 && leafAsked === 1);
      await new Promise((r) => setTimeout(r, 20));
      // Two minutes: past the 90 s window, the leaf silent in its step and `mid` waiting on it between its turns.
      clock.advance(120_000);
      const stallsOf = (name: string) => dal.issuesOf(sid).filter((i) => i.kind === 'stall' && i.actor === name);
      // The leaf is silent inside a model step: its own watch reports it (REQ-MONITOR-119), at every evaluation.
      expect(stallsOf('leaf').length).toBeGreaterThan(0);
      expect(warnings.some((m) => m.startsWith(`child appears stalled: no model event or token for 90 seconds (leaf, ${byName('leaf').task_id})`))).toBe(true);
      // `mid`, asked for nothing while it waits, is not silent: no `stall` issue and no stall warning name it.
      expect(stallsOf('mid')).toEqual([]);
      expect(warnings.filter((m) => m.startsWith('child appears stalled') && m.includes(`(mid, ${byName('mid').task_id})`))).toEqual([]);
      releaseLeaf();
      await sessions.running(sid)!;
      expect(midAsked).toBe(3);
      expect(byName('mid').state).toBe('succeeded');
      // Its resumed turn after the wait is not a recovery from a stall it never had.
      expect(infos.filter((m) => m.startsWith('child stall recovered:') && m.includes('(mid,'))).toEqual([]);
      expect(stallsOf('mid')).toEqual([]);
    });

    it('REQ-ORCH-089 / REQ-MONITOR-119 (OQ-155) with PD-ORCH-005 clause 4: a child resumed into waiting on its own child is not reported stalled; the child that is silent is, by its own watch', async () => {
      const leafGates: (() => void)[] = [];
      let midAsked = 0;
      let leafAsked = 0;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'mid', task: 'TASK: mid' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (!userText(req).includes('TASK: mid')) {
          leafAsked += 1;
          // Its only call never ran, so REQ-ORCH-095's one re-prompt follows its resumed answer: that one is not held.
          if (leafAsked > 2) return answer('leaf done');
          const hold = new Promise<void>((r) => { leafGates.push(r); });
          // The leaf's first step is the one in flight when the pause is accepted: it asks for a call the pause cuts.
          if (leafAsked === 1) return { parts: [{ hold }, ...toolCalls([{ callId: 'l1', name: 'background_output', args: { task_id: 'bg_00000000' } }], 'Checking.').parts] };
          return { parts: [{ hold }, ...answer('leaf done').parts] };
        }
        midAsked += 1;
        if (midAsked === 1) return toolCalls([{ callId: 'd2', name: 'delegate', args: { persona: 'coding-agent', task_name: 'leaf', task: 'TASK: leaf' } }], 'Delegating.');
        if (midAsked === 2) return answer('Waiting on leaf.');
        return answer('Leaf reported; done.');
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      const byName = (name: string) => children(sid).find((c) => c.canonical_name === name)!;
      await settle(() => midAsked === 2 && leafGates.length === 1);
      expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
      leafGates[0]!();
      expect((await sessions.running(sid)!).status).toBe('interrupted');
      expect(byName('mid')).toMatchObject({ state: 'paused' });
      expect(byName('leaf')).toMatchObject({ state: 'paused' });
      // Continued: `mid`'s record ends on its answer, so it resumes into waiting and takes no step; the leaf's resumed step
      // is held, silent.
      expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
      await settle(() => leafGates.length === 2);
      await new Promise((r) => setTimeout(r, 20));
      expect(midAsked).toBe(2);
      clock.advance(120_000);
      const stallsOf = (name: string) => dal.issuesOf(sid).filter((i) => i.kind === 'stall' && i.actor === name);
      // The leaf is silent inside a model step: its own watch reports it (REQ-MONITOR-119).
      expect(stallsOf('leaf').length).toBeGreaterThan(0);
      expect(warnings.some((m) => m.startsWith(`child appears stalled: no model event or token for 90 seconds (leaf, ${byName('leaf').task_id})`))).toBe(true);
      // `mid`, resumed into waiting and asked for nothing, is not silent: no `stall` issue and no stall warning name it.
      expect(stallsOf('mid')).toEqual([]);
      expect(warnings.filter((m) => m.startsWith('child appears stalled') && m.includes(`(mid, ${byName('mid').task_id})`))).toEqual([]);
      leafGates[1]!();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(midAsked).toBe(3);
      expect(byName('mid').state).toBe('succeeded');
      expect(infos.filter((m) => m.startsWith('child stall recovered:') && m.includes('(mid,'))).toEqual([]);
      expect(stallsOf('mid')).toEqual([]);
    });
  });

  it('REQ-ORCH-088: the ceiling asks the child to land, so the step in flight finishes and its words reach the report', async () => {
    let releaseChild!: () => void;
    const hold = new Promise<void>((r) => { releaseChild = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'slow', task: 'TASK: be slow' } }]) : answer('finished after the timeout');
      if (persona === 'summariser') return answer('not json');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'I surveyed nine files and found the lockfile pins yaml twice' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    clock.advance(1_200_000);
    // The ceiling has passed and the child has NOT been cut: the step in flight is still allowed to answer.
    releaseChild();
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const c = children(sid)[0]!;
    expect(c.state).toBe('failed');
    const report = JSON.parse(c.report!) as { last_response: string; final_response: string; errors: { type: string }[] };
    // REQ-ORCH-088: "carrying the last/final response extracted from the transcript" — before the landing
    // this read '' for both, because the abort killed the child inside the step that was about to speak.
    expect(report.last_response).toContain('the lockfile pins yaml twice');
    expect(report.errors.map((e) => e.type)).toContain('timeout');
    // REQ-ORCH-110: it is the LAST response, never the final one — the child was stopped, it did not conclude.
    expect(report.final_response).toBe('');
  });

  it('REQ-ORCH-088 / REQ-CONFIG-113: a child that cannot land inside the grace is still cut off by the backstop', async () => {
    // Nothing in this test ever resolves the hold: the point is that a child which CANNOT land is
    // still ended by the product rather than by the test.
    const hold = new Promise<void>(() => undefined);
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'stuck', task: 'TASK: never answer' } }]) : answer('finished after the backstop');
      if (persona === 'summariser') return answer('not json');
      return { parts: [{ hold }, { part: { kind: 'text', delta: 'never said' } }, { part: { kind: 'finish', reason: 'stop' } }] };
    });
    const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
    await new Promise((r) => setTimeout(r, 10));
    clock.advance(1_200_000);
    await new Promise((r) => setTimeout(r, 10));
    expect(children(sid)[0]!.state).toBe('running'); // asked to land; not cut, because nothing has spoken yet
    // Past the grace, and past a second ceiling too: REQ-ORCH-088's fallback retry may take one more
    // attempt, and it is bounded by the same ladder. The run must end on its own either way.
    for (let i = 0; i < 4 && sessions.running(sid) !== undefined && children(sid)[0]!.state === 'running'; i += 1) {
      clock.advance(30_000);
      await new Promise((r) => setTimeout(r, 10));
      clock.advance(1_200_000);
      await new Promise((r) => setTimeout(r, 10));
    }
    const result = await sessions.running(sid)!;
    expect(result.status).toBe('completed');
    const c = children(sid)[0]!;
    expect(c.state).toBe('failed');
    const report = JSON.parse(c.report!) as { last_response: string; errors: { type: string }[] };
    expect(report.errors.map((e) => e.type)).toContain('timeout');
    // Cut before it could speak — the grace is a chance to land, not an extension of the ceiling.
    expect(report.last_response).toBe('');
    expect(dal.issuesOf(sid).map((i) => i.kind)).toContain('timeout');
  });

  describe('REQ-ORCH-089 / REQ-MONITOR-117..122 / REQ-MONITOR-135, the repair of a-stalled-child-is-never-shown-stalled: the stall callback reaches the host, the root is watched, and a stall evaluation lands a steer', () => {
    const settle = async (until: () => boolean) => { for (let i = 0; i < 400 && !until(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
    const userText = (req: ModelRequest): string => req.messages.filter((m) => m.role === 'user').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
    const failed = modelError({ code: 'unknown', headline: 'the stream ended with no answer' });
    /** Every published whole-session record, in order. */
    const recorder = () => { const snapshots: SessionRecord[] = []; return { snapshots, publisher: { increment: () => undefined, snapshot: (p: { session: SessionRecord }) => { snapshots.push(p.session); } } as Publisher }; };
    /** The figure each published record carried for the child named `name`, consecutive repeats folded. */
    const figures = (snapshots: readonly SessionRecord[], of: (s: SessionRecord) => number | null | undefined): (number | null | undefined)[] => snapshots.map(of).filter((v, i, all) => i === 0 || v !== all[i - 1]);

    it('REQ-ORCH-089 / REQ-MONITOR-119/120/122: a stalled child\'s record carries its silence, republished at every evaluation so the figure advances, and clears once it is no longer stalled', async () => {
      const gates: (() => void)[] = [];
      const { snapshots, publisher } = recorder();
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'coding-agent', task_name: 'quiet', task: 'TASK: be quiet' } }]) : answer('handled');
        if (persona === 'summariser') return answer('{"summary":"x"}');
        if (turn === 1) { const hold = new Promise<void>((r) => { gates.push(r); }); return { parts: [{ hold }, { error: failed }] }; }
        return answer('I carried on and finished.');
      }, { publisher });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      const quiet = (s: SessionRecord) => s.agents.find((a) => a.name === 'quiet')?.stalledSeconds;
      clock.advance(89_000);
      clock.advance(100);
      expect(quiet(snapshots.at(-1)!)).toBeNull();
      // The evaluations at 90, 95 and 100 s each find it stalled; each changes the figure, and each is published.
      clock.advance(1_000); clock.advance(100);
      expect(quiet(snapshots.at(-1)!)).toBe(90);
      clock.advance(4_900); clock.advance(100);
      expect(quiet(snapshots.at(-1)!)).toBe(95);
      clock.advance(4_900); clock.advance(100);
      expect(quiet(snapshots.at(-1)!)).toBe(100);
      // Nothing is cancelled: the child still runs (REQ-MONITOR-121).
      expect(children(sid)[0]!.state).toBe('running');
      gates[0]!();
      await sessions.running(sid)!;
      expect(children(sid)[0]!.state).toBe('succeeded');
      // The recovery reaches the record (REQ-MONITOR-120's "notified"): the last record the child ran in carries no figure.
      expect(figures(snapshots, quiet)).toEqual([undefined, null, 90, 95, 100, null]);
      expect(snapshots.at(-1)!.agents[0]!.stalledSeconds).toBeNull();
    });

    it('REQ-MONITOR-117: the entry agent is watched too — its stall is warned in REQ-MONITOR-119\'s words with its `stall` issue, and the session record carries its figure until its step speaks again', async () => {
      let speak!: () => void;
      const spoken = new Promise<void>((r) => { speak = r; });
      let finish!: () => void;
      const finished = new Promise<void>((r) => { finish = r; });
      const { snapshots, publisher } = recorder();
      const { sessions } = sessionsWith((persona) => {
        if (persona === 'orchestrator') return { parts: [{ hold: spoken }, { part: { kind: 'text', delta: 'Working; ' } }, { hold: finished }, { part: { kind: 'text', delta: 'done.' } }, { part: { kind: 'finish', reason: 'stop' } }] };
        return answer('');
      }, { publisher });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.timelineOf(sid).some((t) => t.name === 'run_start'));
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(90_000); clock.advance(100);
      expect(snapshots.at(-1)!.entryStalledSeconds).toBe(90);
      const stall = dal.issuesOf(sid).filter((i) => i.kind === 'stall');
      expect(stall).toHaveLength(1);
      const rootTaskId = (JSON.parse(stall[0]!.metadata) as { task_id: string }).task_id;
      expect(rootTaskId).toMatch(TASK_ID_PATTERN);
      expect([stall[0]!.severity, stall[0]!.actor, stall[0]!.message]).toEqual(['warning', 'orchestrator', `agent appears stalled: no model event or token for 90 seconds (orchestrator, ${rootTaskId}); the run is still waiting on it.`]);
      expect(warnings).toContain(stall[0]!.message);
      clock.advance(5_000); clock.advance(100);
      expect(snapshots.at(-1)!.entryStalledSeconds).toBe(95);
      speak();
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(5_000); clock.advance(100);
      expect(infos.filter((m) => m.startsWith('agent stall recovered:'))).toEqual([`agent stall recovered: orchestrator (${rootTaskId}) is active again after a stall (REQ-MONITOR-120)`]);
      expect(dal.timelineOf(sid).filter((t) => t.name === 'stall_recovered').map((t) => t.actor)).toEqual(['orchestrator']);
      expect(snapshots.at(-1)!.entryStalledSeconds).toBeNull();
      finish();
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(figures(snapshots, (s) => s.entryStalledSeconds)).toEqual([null, 90, 95, null]);
    });

    it('REQ-MONITOR-120 with OQ-153: a stalled root that is cancelled did not resume — its stall ends with its figure cleared and is not logged recovered', async () => {
      const { snapshots, publisher } = recorder();
      const { sessions } = sessionsWith((persona) => (persona === 'orchestrator' ? { parts: [{ hold: new Promise<void>(() => undefined) }, { part: { kind: 'text', delta: 'never' } }] } : answer('')), { publisher });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => dal.timelineOf(sid).some((t) => t.name === 'run_start'));
      await new Promise((r) => setTimeout(r, 20));
      clock.advance(90_000); clock.advance(100);
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall')).toHaveLength(1);
      expect(snapshots.at(-1)!.entryStalledSeconds).toBe(90);
      expect(sessions.control({ op: 'cancelAgent', sessionId: sid, args: { agentId: RUN_AGENT_ID } })).toEqual({ ok: true });
      await sessions.running(sid)!;
      expect(infos.filter((m) => m.startsWith('agent stall recovered:'))).toEqual([]);
      expect(snapshots.at(-1)!.entryStalledSeconds).toBeNull();
    });

    it('REQ-MONITOR-117 with OQ-153: a root waiting on its own children between its turns is not silent — no `stall` issue while its child works', async () => {
      const gates: (() => void)[] = [];
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'slow', task: 'TASK: slow' } }]) : answer(`root turn ${turn}`);
        if (persona === 'summariser') return answer('{"summary":"x"}');
        // The child keeps streaming: it is not stalled either, so any `stall` issue would be the root's.
        const hold = new Promise<void>((r) => { gates.push(r); });
        return { parts: [{ part: { kind: 'text', delta: 'Reading.' } }, { hold }, { part: { kind: 'finish', reason: 'stop' } }] };
      });
      const sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1);
      await new Promise((r) => setTimeout(r, 20));
      for (let t = 0; t < 40; t += 1) { clock.advance(5_000); if (t % 10 === 0) await new Promise((r) => setTimeout(r, 1)); }
      expect(dal.issuesOf(sid).filter((i) => i.kind === 'stall' && i.actor === 'orchestrator')).toEqual([]);
      gates[0]!();
      expect((await sessions.running(sid)!).status).toBe('completed');
    });

    it('REQ-MONITOR-135 / REQ-MONITOR-122: a steer to the root while it waits on its children lands at the next stall evaluation — it takes a step before any child ends, then waits again', async () => {
      const gates: (() => void)[] = [];
      const rootAsked: string[] = [];
      let sid = '' as SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          rootAsked.push(userText(req));
          return turn === 1 ? toolCalls([{ callId: 'd1', name: 'delegate', args: { persona: 'codebase-analyst', task_name: 'slow', task: 'TASK: slow' } }]) : answer(`root turn ${turn}`);
        }
        if (persona === 'summariser') return answer('{"summary":"x"}');
        const hold = new Promise<void>((r) => { gates.push(r); });
        return { parts: [{ hold }, { part: { kind: 'text', delta: 'Read it.' } }, { part: { kind: 'finish', reason: 'stop' } }] };
      });
      sid = (sessions.start(dal, 'C:/ws', 'x') as { value: SessionId }).value;
      await settle(() => gates.length === 1 && rootAsked.length === 2);
      await new Promise((r) => setTimeout(r, 20));
      const r = sessions.control({ op: 'submitSteeringPrompt', sessionId: sid, args: { agentId: RUN_AGENT_ID, text: 'Also check the README.' } });
      expect(r.ok && typeof r.value === 'string').toBe(true);
      // Nothing lands before the evaluation: the root waits on its child, with no step to inject at.
      await new Promise((r) => setTimeout(r, 20));
      expect(rootAsked).toHaveLength(2);
      clock.advance(5_000);
      await settle(() => rootAsked.length === 3);
      expect(rootAsked[2]).toContain('[Steering prompt] Also check the README.');
      expect(children(sid)[0]!.state).toBe('running');
      expect(dal.timelineOf(sid).filter((t) => t.name === 'steering_injected')).toHaveLength(1);
      gates[0]!();
      expect((await sessions.running(sid)!).status).toBe('completed');
      // The child's report reached the root afterwards, as its fourth request.
      expect(rootAsked).toHaveLength(4);
      expect(rootAsked[3]).toContain('### slow (codebase-analyst)');
    });
  });

  /**
   * PD-TOOLS-006 revision 6 (OQ-220, ruled 2026-10-07 under R-072): a delegation names the item of its caller's own plan it
   * serves, the record stores it, and admission refuses an unknown id, a finished item, an item another outstanding
   * implementation child holds, and — once the coordinating root keeps a list — an implementation delegation naming none
   * (REQ-ORCH-028, REQ-ORCH-029). Each refusal is red with its check removed.
   */
  describe('PD-TOOLS-006 revision 6: a delegation names the todo item it serves', () => {
    const IDS = ['0000000a', '0000000b', '0000000c'] as const;
    type ItemState = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
    const planOf = (states: readonly ItemState[], ids: readonly string[] = IDS) => ({ schema_version: 1 as const, phases: [{ id: 'e002ab7d', name: 'Build', tasks: states.map((state, i) => ({ id: ids[i]!, name: ['Implement it', 'Test it', 'Document it'][i]!, description: '', state })) }] });
    const todoCall = (callId: string, states: readonly ItemState[], ids?: readonly string[]) => ({ callId, name: 'todo', args: { states, ...(ids ? { ids } : {}) } });
    const del = (callId: string, persona: string, name: string, extra: Record<string, unknown> = {}) => ({ callId, name: 'delegate', args: { persona, task_name: name, task: `TASK: ${name}`, ...extra } });
    /** The todo tool as the run host's is to the run, and every delegate observation the agents read, in order. */
    function tools(observed: string[]): TestTool {
      return (name, a, ctx, builtIn) => {
        if (name === 'todo') {
          const written = ctx.writeTodo?.(planOf(a['states'] as ItemState[], (a['ids'] as string[] | undefined) ?? IDS)) ?? false;
          return Promise.resolve({ text: written ? 'Plan updated.' : 'not written', isError: !written, status: written ? 'ok' : 'failed', durationMs: 1, label: 'todo', args: a });
        }
        if (name === 'delegate') return builtIn().then((r) => { observed.push(r.text); return r; });
        return undefined;
      };
    }
    /** A gate the test opens; a child whose task names HOLD waits on it before answering. */
    const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
    const childAnswer = (req: ModelRequest, hold: Promise<void>): ScriptedCall => {
      const held = req.messages.some((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text.includes('HOLD')));
      return held ? { parts: [{ hold }, { part: { kind: 'text', delta: 'Built it.' } }, { part: { kind: 'finish', reason: 'stop' } }] } : answer('Built it.');
    };
    /** The root takes `steps` in order, then writes its plan complete and answers; every child answers, HOLD ones once opened. */
    async function runSteps(steps: readonly ReturnType<typeof toolCalls>[], openAfter = 0) {
      const observed: string[] = [];
      const hold = gate();
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === openAfter + 1) hold.open();
          if (turn <= steps.length) return steps[turn - 1]!;
          if (turn === steps.length + 1) return toolCalls([todoCall('done', ['COMPLETED', 'COMPLETED', 'COMPLETED'])]);
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return childAnswer(req, hold.p);
      }, { tool: tools(observed) });
      const sid = (sessions.start(dal, 'C:/ws', 'build it') as { value: SessionId }).value;
      if (openAfter === 0) hold.open();
      const result = await sessions.running(sid)!;
      return { sid, result, observed, rows: children(sid) };
    }
    const itemOf = (rows: readonly ChildRow[], name: string) => rows.find((c) => c.canonical_name === name)?.todo_item;

    it('before the coordinator keeps a list, an unnamed implementation delegation is admitted and serves no item', async () => {
      const { observed, rows } = await runSteps([toolCalls([del('d1', 'coding-agent', 'first')])]);
      expect(observed[0]).toMatch(/^Task 'first': queued/);
      expect(itemOf(rows, 'first')).toBeNull();
    });

    it('(d) once it keeps a list, an unnamed implementation delegation is refused with the open items named, and a named one is admitted and stored', async () => {
      const { observed, rows } = await runSteps([
        toolCalls([todoCall('t1', ['IN_PROGRESS', 'PENDING', 'COMPLETED'])]),
        toolCalls([del('d1', 'coding-agent', 'unnamed'), del('d2', 'coding-agent', 'named', { todo_item: '0000000a' })]),
      ]);
      expect(observed[0]).toBe("Task 'unnamed': rejected — This delegation names no todo item, and you keep a todo list for this task: a delegation to 'coding-agent', which writes workspace files, gives todo_item, the id of the open item it serves. Its open items: Implement it (0000000a), Test it (0000000b). If none of them is this work, add one with the todo tool (add_task) and name its id.");
      expect(observed[1]).toMatch(/^Task 'named': queued/);
      expect(rows.map((c) => c.canonical_name)).toEqual(['named']);
      expect(itemOf(rows, 'named')).toBe('0000000a');
      // PD-STARTUP-011 / REQ-STARTUP-134: the refusal's warning is an application-log line, so it names the refusal (the tool's
      // result, quoting the plan) by source, kind and byte length, and neither the model's task name nor an item of the plan.
      const refusal = observed[0]!.slice("Task 'unnamed': rejected — ".length);
      expect(warnings.filter((w) => w.includes('was refused for its todo item'))).toEqual([`a delegation to coding-agent was refused for its todo item (REQ-ORCH-029): tool output from the delegate tool's refusal, ${utf8ByteLength(refusal)} bytes, not quoted`]);
      for (const w of warnings) { expect(w).not.toContain("'unnamed'"); expect(w).not.toContain('Implement it'); }
    });

    it('(d) binds implementation delegations only: a read-only role still delegates unnamed after the list', async () => {
      const { observed, rows } = await runSteps([
        toolCalls([todoCall('t1', ['PENDING', 'PENDING', 'PENDING'])]),
        toolCalls([del('d1', 'codebase-analyst', 'survey')]),
      ]);
      expect(observed[0]).toMatch(/^Task 'survey': queued/);
      expect(itemOf(rows, 'survey')).toBeNull();
    });

    it('a todo write and an unnamed implementation delegate in one step leave the delegate refused, with the ids listed', async () => {
      const { observed } = await runSteps([toolCalls([todoCall('t1', ['PENDING', 'PENDING', 'PENDING']), del('d1', 'coding-agent', 'build')])]);
      expect(observed[0]).toMatch(/^Task 'build': rejected — This delegation names no todo item.*Implement it \(0000000a\), Test it \(0000000b\), Document it \(0000000c\)\. If none of them is this work, add one with the todo tool \(add_task\) and name its id\.$/);
    });

    it('(a) an id the caller\'s plan does not hold is refused for any delegation, read-only roles included', async () => {
      const { observed, rows } = await runSteps([
        toolCalls([todoCall('t1', ['PENDING', 'PENDING', 'PENDING'])]),
        toolCalls([del('d1', 'codebase-analyst', 'survey', { todo_item: 'ffffffff' }), del('d2', 'coding-agent', 'build', { todo_item: 'ffffffff' })]),
      ]);
      expect(observed[0]).toBe("Task 'survey': rejected — todo_item 'ffffffff' names no item of your todo list. Name an id your todo tool's last result shows. Its open items: Implement it (0000000a), Test it (0000000b), Document it (0000000c). If none of them is this work, add one with the todo tool (add_task) and name its id.");
      expect(observed[1]).toMatch(/^Task 'build': rejected — todo_item 'ffffffff' names no item of your todo list\./);
      expect(rows).toEqual([]);
    });

    it('(a) before any list, a named id is refused and the reason says to write the list first', async () => {
      const { observed } = await runSteps([toolCalls([del('d1', 'coding-agent', 'build', { todo_item: '0000000a' })])]);
      expect(observed[0]).toBe("Task 'build': rejected — todo_item '0000000a' names no item of your todo list. You keep no todo list with items yet: write one with the todo tool first, and name an id its result shows.");
    });

    it('(b) a COMPLETED or ABANDONED item is refused to an implementation delegation, and admitted for a read-only one', async () => {
      const { observed, rows } = await runSteps([
        toolCalls([todoCall('t1', ['COMPLETED', 'ABANDONED', 'PENDING'])]),
        toolCalls([del('d1', 'coding-agent', 'redo', { todo_item: '0000000a' }), del('d2', 'tester', 'retest', { todo_item: '0000000b' }), del('d3', 'codebase-analyst', 'review', { todo_item: '0000000a' })]),
      ]);
      expect(observed[0]).toBe("Task 'redo': rejected — todo_item '0000000a' names 'Implement it', which is COMPLETED, and a delegation to 'coding-agent', which writes workspace files, serves an open item. Reopen it with todo update, or name an open item. Its open items: Document it (0000000c). If none of them is this work, add one with the todo tool (add_task) and name its id.");
      expect(observed[1]).toMatch(/^Task 'retest': rejected — todo_item '0000000b' names 'Test it', which is ABANDONED/);
      expect(observed[2]).toMatch(/^Task 'review': queued/);
      expect(rows.map((c) => [c.canonical_name, c.todo_item])).toEqual([['review', '0000000a']]);
    });

    it('(c) an item an outstanding implementation child holds is refused, naming the holder; two items run in parallel; a terminal holder frees its item', async () => {
      const { observed, rows } = await runSteps([
        toolCalls([todoCall('t1', ['IN_PROGRESS', 'PENDING', 'PENDING'])]),
        toolCalls([del('d1', 'coding-agent', 'first', { todo_item: '0000000a', task: 'TASK: HOLD first' }), del('d2', 'coding-agent', 'second', { todo_item: '0000000a' }), del('d3', 'tester', 'other', { todo_item: '0000000b', task: 'TASK: HOLD other' })]),
        // Once the hold opens and `first` has ended, the same item is admitted again.
        toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [] } }]),
        toolCalls([del('d4', 'coding-agent', 'again', { todo_item: '0000000a' })]),
      ], 2);
      const first = rows.find((c) => c.canonical_name === 'first')!;
      expect(observed[1]).toMatch(/^Task 'second': rejected — todo_item '0000000a' \('Implement it'\) is held by first \(coding-agent, task_id bg_[0-9a-f]{8}, state (queued|starting|running)\): no two delegations/);
      expect(observed[1]).toContain(`task_id ${first.task_id}`);
      expect(observed[1]).toContain(`follow it up with session_id: "${first.task_id}"`);
      expect(observed[2]).toMatch(/^Task 'other': queued/);
      expect(observed[3]).toMatch(/^Task 'again': queued/);
      expect(rows.map((c) => [c.canonical_name, c.todo_item])).toEqual([['first', '0000000a'], ['other', '0000000b'], ['again', '0000000a']]);
      // PD-STARTUP-011 / REQ-STARTUP-134: the warning names the refusal's length, not the model's task name or the item it held.
      expect(warnings.some((w) => w.startsWith('a delegation to coding-agent was refused for its todo item (REQ-ORCH-028): tool output from the delegate tool') && w.includes(`${utf8ByteLength(observed[1]!.slice("Task 'second': rejected — ".length))} bytes, not quoted`))).toBe(true);
      for (const w of warnings) { expect(w).not.toContain("'second'"); expect(w).not.toContain('Implement it'); }
    });

    it('(c) a read-only child naming an item never holds it', async () => {
      const { observed, rows } = await runSteps([
        toolCalls([todoCall('t1', ['PENDING', 'PENDING', 'PENDING'])]),
        toolCalls([del('d1', 'codebase-analyst', 'survey', { todo_item: '0000000b', task: 'TASK: HOLD survey' }), del('d2', 'coding-agent', 'build', { todo_item: '0000000b' })]),
      ], 2);
      expect(observed[0]).toMatch(/^Task 'survey': queued/);
      // The read-only survey holds nothing, so the implementation delegation for the same item is admitted beside it.
      expect(observed[1]).toMatch(/^Task 'build': queued/);
      expect(rows.map((c) => [c.canonical_name, c.todo_item])).toEqual([['survey', '0000000b'], ['build', '0000000b']]);
    });

    it('(c) a child waiting on its dependencies holds its item', async () => {
      const observed: string[] = [];
      const hold = gate();
      let sid = '' as SessionId;
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([todoCall('t1', ['PENDING', 'PENDING', 'PENDING'])]);
          if (turn === 2) return toolCalls([del('d1', 'coding-agent', 'base', { todo_item: '0000000a', task: 'TASK: HOLD base' })]);
          if (turn === 3) {
            const base = children(sid).find((c) => c.canonical_name === 'base')!.task_id;
            return toolCalls([del('d2', 'coding-agent', 'dependant', { todo_item: '0000000b', depends_on: [base] }), del('d3', 'tester', 'rival', { todo_item: '0000000b' })]);
          }
          if (turn === 4) { hold.open(); return toolCalls([todoCall('done', ['COMPLETED', 'COMPLETED', 'COMPLETED'])]); }
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return childAnswer(req, hold.p);
      }, { tool: tools(observed) });
      sid = (sessions.start(dal, 'C:/ws', 'build it') as { value: SessionId }).value;
      await sessions.running(sid)!;
      const dependant = children(sid).find((c) => c.canonical_name === 'dependant')!;
      expect(observed[1]).toMatch(/^Task 'dependant': waiting_on_dependencies/);
      expect(observed[2]).toBe(`Task 'rival': rejected — todo_item '0000000b' ('Test it') is held by dependant (coding-agent, task_id ${dependant.task_id}, state waiting_on_dependencies): no two delegations to personas that write workspace files serve one todo item at once. Wait for it with wait_for_tasks and follow it up with session_id: "${dependant.task_id}", or split the item with todo add_task and name the new item's id.`);
    });

    it('a follow-up by session_id is never refused as unnamed: it keeps its stored item, here none', async () => {
      let firstId = '';
      const observed: string[] = [];
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([del('d1', 'coding-agent', 'build', { run_in_background: false })]);
          if (turn === 2) return toolCalls([todoCall('t1', ['PENDING', 'PENDING', 'PENDING'])]);
          if (turn === 3) return toolCalls([del('d2', 'coding-agent', 'build-again', { session_id: firstId, run_in_background: false })]);
          if (turn === 4) return toolCalls([todoCall('done', ['COMPLETED', 'COMPLETED', 'COMPLETED'])]);
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return answer('Built it.');
      }, { tool: (name, a, ctx, builtIn) => { if (name === 'delegate' && firstId === '') { return builtIn().then((r) => { firstId = /task_id: (bg_[0-9a-f]{8})/.exec(r.text)?.[1] ?? ''; observed.push(r.text); return r; }); } return tools(observed)(name, a, ctx, builtIn); } });
      const sid = (sessions.start(dal, 'C:/ws', 'build it') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(observed[1]).toMatch(/^Task 'build': queued — Following up build/);
      expect(children(sid)).toHaveLength(1);
    });

    /*
     * The follow-up's own refusal (`followUp`): it keeps its stored item and is refused while another outstanding
     * implementation child of the plan holds that item, and admitted once the holder has ended. Red with the check removed
     * (the review of fin29: no case reached it).
     */
    it('(c) a follow-up by session_id is refused while another implementation child holds its stored item, and admitted once that child ends', async () => {
      let firstId = '';
      const observed: string[] = [];
      const hold = gate();
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([todoCall('t1', ['IN_PROGRESS', 'PENDING', 'PENDING'])]);
          if (turn === 2) return toolCalls([del('d1', 'coding-agent', 'first', { todo_item: '0000000a', run_in_background: false })]);
          // `first` has ended, so its item is free: `second` takes it, and holds it until the gate opens.
          if (turn === 3) return toolCalls([del('d2', 'coding-agent', 'second', { todo_item: '0000000a', task: 'TASK: HOLD second' })]);
          if (turn === 4) return toolCalls([del('d3', 'coding-agent', 'first-again', { session_id: firstId, task: 'TASK: more' })]);
          if (turn === 5) { hold.open(); return toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [] } }]); }
          if (turn === 6) return toolCalls([del('d4', 'coding-agent', 'first-again', { session_id: firstId, task: 'TASK: more', run_in_background: false })]);
          if (turn === 7) return toolCalls([todoCall('done', ['COMPLETED', 'COMPLETED', 'COMPLETED'])]);
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return childAnswer(req, hold.p);
      }, { tool: (name, a, ctx, builtIn) => {
        if (name === 'delegate' && firstId === '') return builtIn().then((r) => { firstId = /task_id: (bg_[0-9a-f]{8})/.exec(r.text)?.[1] ?? ''; observed.push(r.text); return r; });
        return tools(observed)(name, a, ctx, builtIn);
      } });
      const sid = (sessions.start(dal, 'C:/ws', 'build it') as { value: SessionId }).value;
      await sessions.running(sid)!;
      const rows = children(sid);
      const second = rows.find((c) => c.canonical_name === 'second')!;
      expect(observed[1]).toMatch(/^Task 'second': queued/);
      expect(observed[2]).toBe(`Task 'first-again': rejected — session_id '${firstId}' serves todo item '0000000a', which second (coding-agent, task_id ${second.task_id}, state ${/state (\w+)\)/.exec(observed[2]!)?.[1] ?? '?'}) now holds: no two delegations to personas that write workspace files serve one todo item at once. Wait for second with wait_for_tasks, then follow this child up.`);
      expect(observed[2]).toMatch(/state (queued|starting|running)\)/);
      expect(observed[3]).toMatch(/^Task 'first': queued — Following up first/);
      expect(rows.map((c) => [c.canonical_name, c.todo_item])).toEqual([['first', '0000000a'], ['second', '0000000a']]);
      expect(warnings.some((w) => w.includes("first's follow-up was refused") && w.includes('(REQ-ORCH-028)'))).toBe(true);
    });

    it('a child keeps its own plan: it names its own item, and the root\'s id is not one of its plan', async () => {
      const observed: string[] = [];
      const hold = gate();
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([todoCall('t1', ['PENDING', 'PENDING', 'PENDING'])]);
          if (turn === 2) return toolCalls([del('d1', 'planner', 'lead', { todo_item: '0000000a', run_in_background: false })]);
          if (turn === 3) return toolCalls([todoCall('done', ['COMPLETED', 'COMPLETED', 'COMPLETED'])]);
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        const text = req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n');
        if (text.includes('TASK: lead')) {
          const step = req.messages.filter((m) => m.role === 'assistant').length + 1;
          if (step === 1) return toolCalls([todoCall('c1', ['PENDING', 'PENDING'], ['000000c1', '000000c2'])]);
          if (step === 2) return toolCalls([del('c2', 'coding-agent', 'sub-own', { todo_item: '000000c1', run_in_background: false }), del('c3', 'coding-agent', 'sub-root', { todo_item: '0000000b' })]);
          return answer('Led it.');
        }
        return childAnswer(req, hold.p);
      }, { tool: tools(observed) });
      hold.open();
      const sid = (sessions.start(dal, 'C:/ws', 'lead it') as { value: SessionId }).value;
      await sessions.running(sid)!;
      const rows = children(sid);
      expect(itemOf(rows, 'lead')).toBe('0000000a');
      expect(itemOf(rows, 'sub-own')).toBe('000000c1');
      expect(observed.find((o) => o.startsWith("Task 'sub-root'"))).toMatch(/^Task 'sub-root': rejected — todo_item '0000000b' names no item of your todo list\. .*Implement it \(000000c1\)/);
    });

    /**
     * PD-TOOLS-006 revision 7 and PD-TOOLS-008 revision 2 (OQ-249, ruled 2026-10-07 under R-072): an admitted delegation hands
     * back the item it serves, so the caller's port marks it IN_PROGRESS, and the items the caller's non-terminal children hold
     * are the set REQ-TOOLS-145's count leaves out — read live, so an item whose child has ended counts again. (Until
     * 2026-10-15: since `PD-TOOLS-008` revision 4, OQ-333, the count leaves out the served set, held inside it, so such an item
     * no longer counts; the held set still decides which served item a `replace` may close.)
     */
    it('revision 7: an admitted delegation hands back its item, a rejected one none, and the held set is the live children\'s items (and, revision 3, the served set every child\'s)', async () => {
      const observed: string[] = [];
      const heldAt: string[][] = [];
      const servedAt: string[][] = [];
      const hold = gate();
      const { sessions } = sessionsWith((persona, turn, req) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([todoCall('t1', ['PENDING', 'PENDING', 'PENDING'])]);
          if (turn === 2) return toolCalls([del('d1', 'coding-agent', 'impl', { todo_item: '0000000a', task: 'TASK: HOLD impl' }), del('d2', 'tester', 'tests', { todo_item: '0000000b', task: 'TASK: HOLD tests' }), del('d3', 'codebase-analyst', 'survey', { todo_item: '0000000c', task: 'TASK: HOLD survey' }), del('d4', 'coding-agent', 'rival', { todo_item: '0000000a' })]);
          if (turn === 3) return toolCalls([todoCall('t2', ['IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS'])]);
          if (turn === 4) { hold.open(); return toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [] } }]); }
          if (turn === 5) return toolCalls([todoCall('done', ['COMPLETED', 'COMPLETED', 'COMPLETED'])]);
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return childAnswer(req, hold.p);
      }, { tool: (name, a, ctx, builtIn) => {
        if (name === 'todo') heldAt.push([...(ctx.heldTodoItems?.() ?? [])].sort());
        if (name === 'todo') servedAt.push([...(ctx.servedTodoItems?.() ?? [])].sort());
        return tools(observed)(name, a, ctx, builtIn);
      } });
      const sid = (sessions.start(dal, 'C:/ws', 'build it') as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(observed[0]).toMatch(/^Task 'impl': queued — .*\ntask_id: bg_[0-9a-f]{8}\nserves todo item 0000000a$/);
      expect(observed[1]).toMatch(/\nserves todo item 0000000b$/);
      // a read-only child's item is held too: the count is the plan owner's, whatever the child's persona
      expect(observed[2]).toMatch(/\nserves todo item 0000000c$/);
      expect(observed[3]).toMatch(/^Task 'rival': rejected/);
      expect(observed[3]).not.toContain('serves todo item');
      // before any child, nothing is held; while the three run, all three items; once they ended, none
      expect(heldAt).toEqual([[], ['0000000a', '0000000b', '0000000c'], []]);
      // PD-TOOLS-008 revision 3 (OQ-255): the served set keeps the ended children's items, so the closing `todo` call (turn 5)
      // reads all three served and none held — the items a `replace` may close; the rejected `rival` serves nothing
      expect(servedAt).toEqual([[], ['0000000a', '0000000b', '0000000c'], ['0000000a', '0000000b', '0000000c']]);
    });

    it('revision 7: a follow-up hands back the item it keeps', async () => {
      let firstId = '';
      const observed: string[] = [];
      const { sessions } = sessionsWith((persona, turn) => {
        if (persona === 'orchestrator') {
          if (turn === 1) return toolCalls([todoCall('t1', ['PENDING', 'PENDING', 'PENDING'])]);
          if (turn === 2) return toolCalls([del('d1', 'coding-agent', 'build', { todo_item: '0000000a', run_in_background: false })]);
          if (turn === 3) return toolCalls([del('d2', 'coding-agent', 'build-again', { session_id: firstId, run_in_background: false })]);
          if (turn === 4) return toolCalls([todoCall('done', ['COMPLETED', 'COMPLETED', 'COMPLETED'])]);
          return answer('Done.');
        }
        if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
        return answer('Built it.');
      }, { tool: (name, a, ctx, builtIn) => { if (name === 'delegate' && firstId === '') { return builtIn().then((r) => { firstId = /task_id: (bg_[0-9a-f]{8})/.exec(r.text)?.[1] ?? ''; observed.push(r.text); return r; }); } return tools(observed)(name, a, ctx, builtIn); } });
      const sid = (sessions.start(dal, 'C:/ws', 'build it') as { value: SessionId }).value;
      await sessions.running(sid)!;
      expect(observed[0]).toContain('\nserves todo item 0000000a');
      expect(observed[1]).toMatch(/^Task 'build': queued — Following up build/);
      expect(observed[1]).toContain('\nserves todo item 0000000a');
    });

    /**
     * PD-TOOLS-006 revision 11 (OQ-333, ruled 2026-10-15 under R-072): the message that resumes a wait (REQ-ORCH-063) adds, after
     * each reported child's result, a line naming that child's item while it is still IN_PROGRESS in the caller's plan and no
     * running child holds it. The default live run at 3c03287 (delegation-swarm #14) resumed with three reports whose items
     * stayed open, and nothing told the coordinator to close them. The run marks nothing here (the run host's port does); the
     * coordinator's plan is written IN_PROGRESS by its own `todo` call, as the mark leaves it.
     */
    describe('revision 11: the message that resumes a wait names a reported child\'s item still open', () => {
      const line = (name: string, id: string) => `Todo item ${name} (${id}) is still IN_PROGRESS: close it with update once you accept this report.`;
      const textOf = (m: ModelRequest['messages'][number]) => m.content.map((p) => (p.kind === 'text' ? p.text : p.kind === 'tool-result' ? p.result : '')).join('');

      it('a wait_for_tasks result: the line follows the report whose item is open, and not the one whose item the coordinator closed', async () => {
        const hold = gate();
        const { sessions } = sessionsWith((persona, turn, req) => {
          if (persona === 'orchestrator') {
            if (turn === 1) return toolCalls([todoCall('t1', ['IN_PROGRESS', 'IN_PROGRESS', 'PENDING'])]);
            if (turn === 2) return toolCalls([del('d1', 'coding-agent', 'impl', { todo_item: '0000000a', task: 'TASK: HOLD impl' }), del('d2', 'tester', 'tests', { todo_item: '0000000b', task: 'TASK: HOLD tests' })]);
            // the coordinator closes impl's item while its child still runs; tests' item stays open
            if (turn === 3) return toolCalls([todoCall('t2', ['COMPLETED', 'IN_PROGRESS', 'PENDING'])]);
            if (turn === 4) { hold.open(); return toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [] } }]); }
            if (turn === 5) return toolCalls([todoCall('done', ['COMPLETED', 'COMPLETED', 'COMPLETED'])]);
            return answer('Done.');
          }
          if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
          return childAnswer(req, hold.p);
        }, { tool: tools([]) });
        const sid = (sessions.start(dal, 'C:/ws', 'build it') as { value: SessionId }).value;
        expect((await sessions.running(sid)!).status).toBe('completed');
        const wait = dal.residentRows(sid).find((r) => r.kind === 'tool' && r.tool_name === 'wait_for_tasks')!;
        expect(wait.output ?? '').toMatch(/^The waited-for background tasks completed \(2\)\./);
        expect(wait.output ?? '').toContain(`### tests (tester) — succeeded\nBuilt it.\n${line('Test it', '0000000b')}`);
        expect(wait.output ?? '').not.toContain('(0000000a) is still IN_PROGRESS');
        expect((wait.output ?? '').match(/is still IN_PROGRESS/g)).toHaveLength(1);
      });

      it('a foreground delegate\'s result carries the line; it is absent while another running child holds the item', async () => {
        const hold = gate();
        const { sessions } = sessionsWith((persona, turn, req) => {
          if (persona === 'orchestrator') {
            if (turn === 1) return toolCalls([todoCall('t1', ['IN_PROGRESS', 'IN_PROGRESS', 'PENDING'])]);
            if (turn === 2) return toolCalls([del('d1', 'coding-agent', 'impl', { todo_item: '0000000a', run_in_background: false })]);
            // a read-only survey and a running writer serve one item: the survey's report adds no line while the writer holds it
            if (turn === 3) return toolCalls([del('d2', 'coding-agent', 'writer', { todo_item: '0000000b', task: 'TASK: HOLD writer' }), del('d3', 'codebase-analyst', 'survey', { todo_item: '0000000b', run_in_background: false })]);
            if (turn === 4) { hold.open(); return toolCalls([{ callId: 'w1', name: 'wait_for_tasks', args: { task_ids: [] } }]); }
            if (turn === 5) return toolCalls([todoCall('done', ['COMPLETED', 'COMPLETED', 'COMPLETED'])]);
            return answer('Done.');
          }
          if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
          return childAnswer(req, hold.p);
        }, { tool: tools([]) });
        const sid = (sessions.start(dal, 'C:/ws', 'build it') as { value: SessionId }).value;
        expect((await sessions.running(sid)!).status).toBe('completed');
        const delegates = dal.residentRows(sid).filter((r) => r.kind === 'tool' && r.tool_name === 'delegate');
        const impl = delegates.find((r) => r.output?.startsWith("Task 'impl'"))!;
        expect(impl.output ?? '').toContain(`### impl (coding-agent) — succeeded\nBuilt it.\n${line('Implement it', '0000000a')}`);
        const survey = delegates.find((r) => r.output?.startsWith("Task 'survey'"))!;
        expect(survey.output ?? '').toContain('### survey (codebase-analyst) — succeeded');
        expect(survey.output ?? '').not.toContain('is still IN_PROGRESS');
        // once the writer has ended too, its report names the item
        const wait = dal.residentRows(sid).find((r) => r.kind === 'tool' && r.tool_name === 'wait_for_tasks')!;
        expect(wait.output ?? '').toContain(`### writer (coding-agent) — succeeded\nBuilt it.\n${line('Test it', '0000000b')}`);
      });

      it('the orchestration pass\'s resume message carries the line after the report, and REQ-ORCH-059\'s completion notification is unchanged', async () => {
        const hold = gate();
        const asked: string[] = [];
        const { sessions } = sessionsWith((persona, turn, req) => {
          if (persona === 'orchestrator') {
            asked.push(textOf(req.messages[req.messages.length - 1]!));
            if (turn === 1) return toolCalls([todoCall('t1', ['IN_PROGRESS', 'PENDING', 'PENDING'])]);
            if (turn === 2) return toolCalls([del('d1', 'coding-agent', 'impl', { todo_item: '0000000a', task: 'TASK: HOLD impl' })]);
            if (turn === 3) { hold.open(); return answer('Waiting for impl.'); }
            if (turn === 4) return toolCalls([todoCall('done', ['COMPLETED', 'COMPLETED', 'COMPLETED'])]);
            return answer('Done.');
          }
          if (persona === 'summariser') return answer('{"summary":"done","key_findings":[],"tags":[]}');
          return childAnswer(req, hold.p);
        }, { tool: tools([]) });
        const sid = (sessions.start(dal, 'C:/ws', 'build it') as { value: SessionId }).value;
        expect((await sessions.running(sid)!).status).toBe('completed');
        const resumed = asked[3]!;
        const [notification, resume] = resumed.split('Child task updates are available.') as [string, string];
        expect(notification).toMatch(/^\[Background task completed\]\n/);
        expect(notification).not.toContain('is still IN_PROGRESS');
        expect(resume).toContain(`### impl (coding-agent) — succeeded\nBuilt it.\n${line('Implement it', '0000000a')}`);
        // the coordinator closed the item at turn 4: no later message names it
        expect(asked.slice(4).some((t) => t.includes('is still IN_PROGRESS'))).toBe(false);
      });
    });
  });
});
