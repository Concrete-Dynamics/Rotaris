/**
 * The live `plan-open` and `empty-answer` scenarios' readings (fin42, N56; PD-ORCH-015, PD-ORCH-009 revision 2): the texts they
 * look for are the engine's own, and each reading is taken from what the model was sent, the log and the transcript.
 */
import { describe, expect, it } from 'vitest';
import { ANSWER_REPROMPT as productReprompt, BUILT_IN_PERSONAS, CLASSIFIER_SYSTEM_PROMPT, entryInstructionsFor, planCarryText, planCorrectionText, planHeldRowText } from '@rotaris/engine';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { ANSWER_REPROMPT, CARRY_HEAD, CLASSIFIER_MARK, HELD_ROW, NOT_COMPLETE, ROOT_MARK, SHOWN, UNANSWERED_ROW, answerReading, heldAnswerOf, planReading, requestOf } from './plan-open-reading.mjs';

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
});
