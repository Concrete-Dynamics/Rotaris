/**
 * The live `plan-open` and `empty-answer` scenarios' readings (fin42, N56; PD-ORCH-015, PD-ORCH-009 revision 2): the texts they
 * look for are the engine's own, and each reading is taken from what the model was sent, the log and the transcript.
 */
import { describe, expect, it } from 'vitest';
import { ANSWER_REPROMPT as productReprompt, BUILT_IN_PERSONAS, CLASSIFIER_SYSTEM_PROMPT, completionNotification, entryInstructionsFor, planCarryText, planCorrectionText, planHeldRowText, RungMemory, type LoopActivation } from '@rotaris/engine';
import { renderDelegateObservation } from '@rotaris/agent-tools';
import type { ChildRow } from '@rotaris/store';
import type { AgentBackend, TurnInput } from '@rotaris/model';
import { createLoopClassifier } from '../../src/run-host/loop.js';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { ANSWER_REPROMPT, CARRY_HEAD, CLASSIFIER_MARK, DELEGATED_MARK, HELD_ROW, NOT_COMPLETE, REPORT_MARK, ROOT_MARK, SHOWN, STUCK_TRIGGER, UNANSWERED_ROW, answerReading, heldAnswerOf, planReading, requestOf, waitReading } from './plan-open-reading.mjs';

const SYSTEM = `${ROOT_MARK} You coordinate.`;
const body = (messages: { role: string; content: unknown }[], system = SYSTEM) => JSON.stringify({ model: 'm', stream: true, messages: [{ role: 'system', content: system }, ...messages] });
const TASK = 'Write your todo list, do the reading, answer.';
const ANSWER = 'The function `remaining` counts the todos still to do.';
const OPEN = ['Tell me which function counts the remaining todos'];

describe('plan-open reading (live-run `plan-open`, PD-ORCH-015)', () => {
  it('the texts it looks for are the engine\'s', () => {
    expect(ANSWER_REPROMPT).toBe(productReprompt);
    expect(planCorrectionText(OPEN, true).startsWith(SHOWN)).toBe(true);
    expect(planCorrectionText(OPEN, false)).toContain(NOT_COMPLETE);
    expect(planCarryText(OPEN, ANSWER).startsWith(CARRY_HEAD)).toBe(true);
    expect(planCarryText(OPEN, ANSWER)).toContain(NOT_COMPLETE);
    expect(heldAnswerOf(planCarryText(OPEN, ANSWER))).toBe(ANSWER);
    expect(heldAnswerOf(planCarryText(OPEN))).toBeNull();
    expect(HELD_ROW.test(planHeldRowText(1, OPEN, false))).toBe(true);
    expect(HELD_ROW.test(planHeldRowText(3, [...OPEN, 'Report'], true))).toBe(true);
    expect(UNANSWERED_ROW.test('The run ended without an answer: orchestrator ended its turn without writing one, even when asked once more.')).toBe(true);
    expect(UNANSWERED_ROW.test('Iteration 2 ended without an answer: orchestrator ended its turn without writing one, even when asked once more.')).toBe(true);
  });

  it('a correction after an answer, recorded in the root\'s own conversation: one iteration, nothing re-queued', () => {
    const log = 'warn iteration 1: the coordinator answered with 1 item of its plan not done: X; a correction is sent into its conversation (1 of 1, REQ-ORCH-078, PD-ORCH-015)';
    const bodies = [
      body([{ role: 'user', content: TASK }]),
      body([{ role: 'user', content: TASK }, { role: 'assistant', content: ANSWER }, { role: 'user', content: planCorrectionText(OPEN, true) }]),
      body([{ role: 'user', content: 'classify this' }], 'You classify a user request'),
    ];
    const r = planReading({ log, bodies, systemRows: ['The run completed.'], iterations: [{ iteration: 1, outcome: 'succeeded' }], answers: [ANSWER] });
    expect(r).toMatchObject({ reached: true, warnings: [{ n: 1, of: 1 }], corrections: 1, shownSaid: true, requeued: false, carries: 0, reprompts: 0, outcomes: ['succeeded'] });
  });

  it('an ignored correction: the held row, and the next fresh root handed the answer the person was shown', () => {
    const log = 'a correction is sent into its conversation (1 of 1, REQ-ORCH-078, PD-ORCH-015)';
    const bodies = [
      body([{ role: 'user', content: TASK }]),
      body([{ role: 'user', content: TASK }, { role: 'assistant', content: ANSWER }, { role: 'user', content: planCorrectionText(OPEN, true) }]),
      body([{ role: 'user', content: `${TASK}\n\n${planCarryText(OPEN, ANSWER)}` }]),
      body([{ role: 'user', content: `${TASK}\n\n${planCarryText(OPEN, ANSWER)}` }, { role: 'assistant', content: 'Recorded.' }]),
    ];
    const r = planReading({ log, bodies, systemRows: [planHeldRowText(1, OPEN, false), 'The run completed.'], iterations: [{ iteration: 1, outcome: 'partial' }, { iteration: 2, outcome: 'succeeded' }], answers: [ANSWER, 'Recorded.'] });
    expect(r).toMatchObject({ reached: true, corrections: 1, requeued: true, carries: 1, heldAnswers: [ANSWER], heldIsAnAnswer: true, outcomes: ['partial', 'succeeded'] });
  });

  it('a root that closed its plan before answering is "not reached", and a held answer the session never wrote is named', () => {
    expect(planReading({ log: '', bodies: [body([{ role: 'user', content: TASK }])], systemRows: [], iterations: [{ iteration: 1, outcome: 'succeeded' }] })).toMatchObject({ reached: false, corrections: 0, requeued: false });
    const carried = body([{ role: 'user', content: `${TASK}\n\n${planCarryText(OPEN, 'an answer nobody was shown')}` }]);
    expect(planReading({ log: '', bodies: [carried], systemRows: [], iterations: [], answers: [ANSWER] }).heldIsAnAnswer).toBe(false);
  });
});

describe('answer reading (live-run `empty-answer`, PD-ORCH-009 revision 2)', () => {
  it('one re-prompt, logged once, then the row and the warning issue', () => {
    const bodies = [
      body([{ role: 'user', content: 'say one word' }]),
      body([{ role: 'user', content: 'say one word' }, { role: 'assistant', content: '' }, { role: 'user', content: productReprompt }]),
    ];
    const r = answerReading({
      log: 'iteration 1: orchestrator ended its turn without writing an answer; it is asked once more (PD-ORCH-009, OQ-199)',
      bodies, fired: 2,
      systemRows: ['The run ended without an answer: orchestrator ended its turn without writing one, even when asked once more.'],
      issues: [{ kind: 'incomplete_execution', severity: 'warning', metadata: JSON.stringify({ reprompted: true, run_ended: true }) }, { kind: 'tool_error', severity: 'warning', metadata: '{}' }],
    });
    expect(r).toMatchObject({ fired: 2, rootRequests: 2, reprompts: 1, logged: 1, unanswered: [expect.stringMatching(/^The run ended without an answer/)], incomplete: [{ severity: 'warning', metadata: { reprompted: true, run_ended: true } }] });
  });

  /*
   * A re-prompt or a correction is counted by the request it LEADS TO, the one whose final message it is: the requests after it
   * repeat it as their last user message behind the model's tool calls and their results, and are not re-prompts again. Read
   * by the last user message, `empty-once`'s model reading README.md after the re-prompt counted two re-prompts and failed.
   */
  it('a re-prompt or a correction is counted once, not again in the requests the model\'s tool calls make after it', () => {
    const toolTurn = [{ role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"README.md"}' } }] }, { role: 'tool', tool_call_id: 'c1', content: '# todo app' }];
    const asked = [{ role: 'user', content: 'say one word' }, { role: 'assistant', content: '' }, { role: 'user', content: productReprompt }];
    const r = answerReading({ log: '', bodies: [body([{ role: 'user', content: 'say one word' }]), body(asked), body([...asked, ...toolTurn])], systemRows: [], issues: [], fired: 1 });
    expect(r).toMatchObject({ rootRequests: 3, reprompts: 1 });
    const corrected = [{ role: 'user', content: TASK }, { role: 'assistant', content: ANSWER }, { role: 'user', content: planCorrectionText(OPEN, true) }];
    const p = planReading({ log: 'a correction is sent into its conversation (1 of 1, REQ-ORCH-078, PD-ORCH-015)', bodies: [body([{ role: 'user', content: TASK }]), body(corrected), body([...corrected, ...toolTurn])], systemRows: [], iterations: [{ iteration: 1, outcome: 'succeeded' }], answers: [ANSWER] });
    expect(p).toMatchObject({ corrections: 1, shownSaid: true, reprompts: 0 });
  });

  /*
   * PD-ORCH-009 revision 3 (OQ-282, ruled 2026-10-13 under R-072): the silent turn the re-prompt answers is no stuck report. The
   * live run at ce5f952 (F1) sent [prompt, empty turn, re-prompt, "Pause and reassess …"] after a classification over an empty
   * excerpt; the reading counts the stuck classifications asked and the root's stuck activations, and the scenario owes none.
   */
  it('PD-ORCH-009 revision 3: the stuck trigger it looks for is the one the loop classifier\'s prompt opens with', async () => {
    const inputs: TurnInput[] = [];
    const b: AgentBackend = { ownsTheLoop: false, runTurn: async (input) => { inputs.push(input); return { status: 'succeeded', text: '{"loop_detected":true,"reason":"r","corrective_message":"m"}', usage: { input: 1, output: 1 } }; } };
    const M = { providerId: 'p', modelId: 'small', dialect: 'chat' as const };
    const classifier = createLoopClassifier({ backend: b, runModel: M, thinking: 'unset', credentialFor: () => async () => 'k', memory: new RungMemory(), configuredModel: null, slots: { small: M, fallback: null, summary: null }, modelTimeoutMs: 30_000 })!;
    await classifier.classify({ trigger: 'stuck', reason: 'the agent reported that it cannot make progress', excerpt: '', events: [], activationCount: 1 } as LoopActivation, new AbortController().signal);
    const prompt = inputs[0]!.messages[0]!.content.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    expect(prompt.startsWith(STUCK_TRIGGER)).toBe(true);
  });

  it('PD-ORCH-009 revision 3: a stuck classification and the root\'s stuck activation are read; a child\'s, and other triggers, are not', () => {
    const asked = [{ role: 'user', content: 'say one word' }, { role: 'assistant', content: '' }, { role: 'user', content: productReprompt }];
    const classifierBody = (trigger: string) => body([{ role: 'user', content: `Trigger: ${trigger} (why).\n<conversation_excerpt>\n\n</conversation_excerpt>\n\nAnswer in JSON.` }], 'You judge whether an agent is looping.');
    const f1 = answerReading({
      log: '', fired: 2, systemRows: [], issues: [],
      bodies: [body([{ role: 'user', content: 'say one word' }]), classifierBody('stuck'), body([...asked, { role: 'user', content: 'Pause and reassess the current task.' }]), classifierBody('raw-count')],
      activations: [
        { name: 'loop_supervisor_activation', actor: 'orchestrator', message: 'Pause and reassess the current task.', metadata: JSON.stringify({ trigger: 'stuck', activation_count: 1 }) },
        { name: 'loop_supervisor_activation', actor: 'survey', message: 'Pause.', metadata: JSON.stringify({ trigger: 'stuck', activation_count: 1 }) },
        { name: 'loop_supervisor_activation', actor: 'orchestrator', message: 'Pause.', metadata: JSON.stringify({ trigger: 'raw-count', activation_count: 1 }) },
      ],
      childNames: ['survey'],
    });
    // The ce5f952 shape: the steering after the re-prompt makes it no request's final message, one stuck classification, and
    // the root's stuck activation.
    expect(f1).toMatchObject({ reprompts: 0, stuckClassifications: 1, stuckActivations: [{ actor: 'orchestrator', message: 'Pause and reassess the current task.' }] });
    const fixed = answerReading({ log: '', fired: 2, systemRows: [], issues: [], bodies: [body([{ role: 'user', content: 'say one word' }]), body(asked)] });
    expect(fixed).toMatchObject({ reprompts: 1, stuckClassifications: 0, stuckActivations: [] });
  });

  it('reads a request\'s content given as parts as well as a string', () => {
    const r = requestOf(JSON.stringify({ messages: [{ role: 'system', content: [{ type: 'text', text: ROOT_MARK }] }, { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }] }));
    expect(r).toMatchObject({ root: true, lastUser: 'ab', firstUser: 'ab' });
    expect(requestOf('not json')).toMatchObject({ root: false, messages: [] });
  });
});

describe('the marks the readings and the `empty` traffic rule match on are the engine\'s own texts', () => {
  it('ROOT_MARK opens the orchestrator\'s prompt, coordinating and direct-work alike; CLASSIFIER_MARK opens the classifier\'s', () => {
    const coordinating = BUILT_IN_PERSONAS.orchestrator.systemPrompt;
    expect(coordinating.startsWith(ROOT_MARK)).toBe(true);
    expect(entryInstructionsFor(coordinating, 'direct-work', { coordinatorOnly: true }).startsWith(ROOT_MARK)).toBe(true);
    expect(CLASSIFIER_SYSTEM_PROMPT.startsWith(CLASSIFIER_MARK)).toBe(true);
  });

  it('PD-ORCH-009 revision 5: DELEGATED_MARK is in an admitted delegation\'s observation, REPORT_MARK opens a completion notification', () => {
    expect(renderDelegateObservation('survey', 'admitted', 'running in the background', 'bg_0a1b2c3d')).toContain(DELEGATED_MARK);
    expect(renderDelegateObservation('survey', 'rejected', 'no such persona', null)).not.toContain(DELEGATED_MARK);
    const done = { task_id: 'bg_0a1b2c3d', canonical_name: 'survey', given_name: 'survey', state: 'succeeded' } as ChildRow;
    expect(completionNotification(done, 0, 1).startsWith(REPORT_MARK)).toBe(true);
  });
});

describe('wait reading (live-run `empty-wait`, PD-ORCH-009 revision 5)', () => {
  const delegated = [{ role: 'user', content: 'Delegate one child and wait.' }, { role: 'assistant', content: '' }, { role: 'tool', content: `Task 'survey': admitted — running\n${DELEGATED_MARK}0a1b2c3d` }, { role: 'assistant', content: '' }];
  const report = { role: 'user', content: `${REPORT_MARK}\ntask_id: bg_0a1b2c3d\n…` };

  it('the report ending the request that resumes the silent root is read as resumed, with nothing behind it', () => {
    const r = waitReading({ fired: 1, bodies: [body(delegated.slice(0, 1)), body(delegated.slice(0, 3)), body([...delegated, report])] });
    expect(r).toMatchObject({ fired: 1, rootRequests: 3, resumed: 1, followed: 0, stuckClassifications: 0, stuckActivations: [] });
  });

  it('as built before revision 5: the stuck corrective behind the report, its classification and the root\'s activation are read', () => {
    const r = waitReading({
      fired: 1,
      bodies: [body([...delegated, report, { role: 'user', content: 'Pause and reassess the current task.' }]), body([{ role: 'user', content: 'Trigger: stuck (why).' }], 'You judge whether an agent is looping.')],
      activations: [{ name: 'loop_supervisor_activation', actor: 'orchestrator', message: 'Pause and reassess the current task.', metadata: JSON.stringify({ trigger: 'stuck', activation_count: 1 }) }],
    });
    expect(r).toMatchObject({ resumed: 0, followed: 1, stuckClassifications: 1, stuckActivations: [{ actor: 'orchestrator' }] });
  });
});
