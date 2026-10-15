/**
 * What `slice-proof` accepts from a live model, pinned against the evidence of its three reds of 2026-10-03
 * (`docs/defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`): run 4's `explicit_trivial (0.99)`
 * for the README question, run 5's classification that hit the 12 s bound, and run 2's run that completed with no
 * answer. Each line below is the log line those runs wrote. A fallback, a category the taxonomy's texts leave out of
 * reach, and a missing intent line stay reds (REQ-ORCH-006, REQ-ORCH-007, REQ-ORCH-021; Part L), except that a fallback at
 * REQ-ORCH-008's 12 s bound, like one answer outside the set, is asked once more first (OQ-332, 2026-10-15; F8). Since
 * PD-ORCH-011 (the owner's ruling of OQ-198, 2026-10-06) run 4's answer is one of those reds: `explicit_trivial` is a small edit.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INTENT_CATEGORIES, INTENT_GROUPS } from '@rotaris/contracts';
import { answerlessCompletion, answerRows, INTENTS, intentOutcome, intentVerdict, toldNoAnswer } from './live-answers.mjs';

const RUN4_INTENTS_1 = '[main 2026-10-03T06:02:51.969Z] info    run host: intent: explicit_trivial (0.99) via json_schema';
const RUN5_INTENTS_3 = '[main 2026-10-03T06:06:10.115Z] info    run host: intent: moderate_feature (fallback: the classification call timed out after 12 s)';
// fin46's final sweep at 3c03287 (F8): the classification's request and its fallback at the bound, 11,979 ms apart.
const F8_INTENTS_3 = [
  '[main 2026-10-15T02:39:24.190Z] info    run host: model request POST https://endpoint.invalid/v1/chat/completions',
  '[main 2026-10-15T02:39:36.169Z] info    run host: intent: moderate_feature (fallback: the classification call timed out after 12 s)',
  '[main 2026-10-15T02:39:36.272Z] info    run host: model request POST https://endpoint.invalid/v1/chat/completions',
].join('\n');
const line = (category: string, rest = ' (0.97) via json_schema') => `[main 2026-10-04T00:00:00.000Z] info    run host: intent: ${category}${rest}`;
const [readme, append, flag] = INTENTS;

describe('the intent scenario accepts what REQ-ORCH-006 and REQ-ORCH-021 leave in reach of each prompt', () => {
  it('names only categories of the taxonomy, each prompt with its reason', () => {
    for (const intent of INTENTS) {
      expect(intent.accept.length).toBeGreaterThan(0);
      for (const c of intent.accept) expect(INTENT_CATEGORIES).toContain(c);
      expect(intent.why.length).toBeGreaterThan(40);
    }
  });

  it('PD-ORCH-011 (OQ-198): run 4\'s explicit_trivial for the README question is a red, since explicit_trivial is a small edit', () => {
    expect(intentVerdict(RUN4_INTENTS_1, readme)).toMatchObject({ category: 'explicit_trivial', confidence: '0.99', rung: 'json_schema' });
    expect(intentVerdict(RUN4_INTENTS_1, readme).problem).toMatch(/classified as explicit_trivial, outside what REQ-ORCH-006 and REQ-ORCH-021 leave in reach of it: question, exploration$/);
  });

  it('accepts the answer group alone for the README question, and nothing that edits, fixes or builds', () => {
    expect(readme.accept).toEqual([...INTENT_GROUPS.answer]);
    for (const c of INTENT_GROUPS.answer) expect(intentVerdict(line(c), readme).problem).toBeNull();
    for (const c of ['explicit_trivial', 'single_file_change', 'problem_resolution', 'refactor', 'small_feature', 'moderate_feature', 'large_feature', 'architectural', 'whole_project', 'ambiguous', 'requirements']) {
      expect(intentVerdict(line(c), readme).problem).toMatch(new RegExp(`classified as ${c}, outside what REQ-ORCH-006 and REQ-ORCH-021 leave in reach`));
    }
  });

  it('accepts the micro group alone for the one-line append', () => {
    expect(append.accept).toEqual([...INTENT_GROUPS.micro]);
    expect(intentVerdict(line('question'), append).problem).not.toBeNull();
    expect(intentVerdict(line('small_feature'), append).problem).not.toBeNull();
  });

  it('accepts the three feature sizes for the flag and its test, and not architecture or the whole project', () => {
    expect(flag.accept).toEqual(['small_feature', 'moderate_feature', 'large_feature']);
    for (const c of ['architectural', 'whole_project', 'single_file_change', 'explicit_trivial']) expect(intentVerdict(line(c), flag).problem).not.toBeNull();
  });

  it('reads run 5\'s fallback at the 12 s bound as a problem, and names OQ-114', () => {
    const v = intentVerdict(RUN5_INTENTS_3, flag);
    expect(v.category).toBe('moderate_feature');
    expect(v.problem).toMatch(/^the classifier fell back: .*timed out after 12 s\).*OQ-114/);
  });

  it('keeps any fallback a red, even on a category the prompt accepts', () => {
    expect(intentVerdict(line('question', ' (fallback: unparseable response)'), readme).problem).toMatch(/^the classifier fell back/);
  });

  it('OQ-332 (F8): marks a fallback at REQ-ORCH-008\'s 12 s bound as timed out, and no other fallback', () => {
    expect(intentVerdict(RUN5_INTENTS_3, flag)).toMatchObject({ category: 'moderate_feature', timedOut: true, boundS: 12 });
    expect(intentVerdict(F8_INTENTS_3, flag)).toMatchObject({ timedOut: true, boundS: 12, elapsedMs: 11_979 });
    for (const rest of [
      ' (fallback: the classifier\'s response could not be mapped to a category (sure, timed out after 12 s))',
      ' (fallback: the classification call failed: the request timed out)',
      ' (fallback: the classifier returned an empty response)',
      ' (fallback: the classifier could not be set up: boom)',
      ' (fallback: the classification call timed out after 5 s)',
    ]) expect(intentVerdict(line('moderate_feature', rest), flag).timedOut, rest).toBeUndefined();
    // REQ-ORCH-007's fallback is `moderate_feature`: a timeout that lands anywhere else is the product's fault.
    expect(intentVerdict(line('question', ' (fallback: the classification call timed out after 12 s)'), flag).timedOut).toBeUndefined();
  });

  it('reads the line written before PD-MONITOR-002, and is red when there is none', () => {
    expect(intentVerdict('[main 2026-09-20T00:00:00.000Z] run host info: intent: question (1) via text', readme)).toMatchObject({ category: 'question', rung: 'text', problem: null });
    expect(intentVerdict('[main] info    run host: session started', readme).problem).toBe('no intent line in the log');
  });
});

/*
 * finacc3 A2-03 (docs/defects/fixed/slice-proof-reds-on-one-intent-answer-outside-the-accepted-set.md): r1 classified the flag
 * prompt `single_file_change (0.82)` and the re-run `moderate_feature`-range at 0.95. One answer outside the set is the
 * sampled model's call, as one answerless run is: the prompt is asked once more, and a second answer outside the set is the
 * red, naming both. A missing line, or a fallback for any reason but the 12 s bound (below), is a red at once: those are
 * the product's.
 */
describe('scenario 3b asks once more on one answer outside the accepted set, and only then', () => {
  const R1_INTENTS_3 = "[main 2026-10-07T04:08:50.000Z] info    run host: intent: single_file_change (0.82) via json_schema";
  it('a first answer outside the set asks the prompt once more; within the set it is done', () => {
    expect(intentOutcome([intentVerdict(R1_INTENTS_3, flag)], flag)).toEqual({ kind: 'again' });
    expect(intentOutcome([intentVerdict(line('moderate_feature'), flag)], flag)).toMatchObject({ kind: 'done', verdict: { category: 'moderate_feature' } });
    expect(intentOutcome([intentVerdict(R1_INTENTS_3, flag), intentVerdict(line('small_feature'), flag)], flag)).toMatchObject({ kind: 'done', verdict: { category: 'small_feature' }, earlier: [{ category: 'single_file_change' }] });
  });
  it('a second answer outside the set is the red, and it names both', () => {
    const out = intentOutcome([intentVerdict(R1_INTENTS_3, flag), intentVerdict(line('explicit_trivial'), flag)], flag);
    expect(out.kind).toBe('red');
    expect(out.problem).toMatch(/twice/);
    expect(out.problem).toMatch(/single_file_change \(0\.82\)/);
    expect(out.problem).toMatch(/explicit_trivial/);
  });
  it('a fallback other than the timeout, or a missing intent line, is a red at once, never asked again', () => {
    expect(intentOutcome([intentVerdict(line('moderate_feature', ' (fallback: the classifier returned an empty response)'), flag)], flag)).toMatchObject({ kind: 'red', problem: expect.stringMatching(/^the classifier fell back/) });
    expect(intentOutcome([intentVerdict(line('moderate_feature', " (fallback: the classifier's response could not be mapped to a category (x))"), flag)], flag)).toMatchObject({ kind: 'red' });
    expect(intentOutcome([intentVerdict(line('moderate_feature', ' (fallback: the classifier could not be set up: boom)'), flag)], flag)).toMatchObject({ kind: 'red' });
    expect(intentOutcome([intentVerdict('[main] info    run host: session started', flag)], flag)).toMatchObject({ kind: 'red', problem: 'no intent line in the log' });
  });
});

/*
 * OQ-332 (ruled 2026-10-15 under R-072), F8 of fin46's final acceptance: a classification cut at REQ-ORCH-008's 12 s bound
 * takes REQ-ORCH-007's fallback, which is the product's specified answer, not a fault. The sweep at 3c03287 went red on one
 * (intents-3) and its lone re-run passed. The timed-out fallback gets the one extra ask an answer outside the set gets; the
 * two share it, so the second problem of either kind is the red, naming both.
 */
describe('scenario 3b asks once more on one fallback at the 12 s bound, sharing the one extra ask', () => {
  const outside = "[main 2026-10-07T04:08:50.000Z] info    run host: intent: single_file_change (0.82) via json_schema";
  it('a first timed-out fallback asks the prompt once more; an answer within the set then is done, the timeout kept as earlier', () => {
    expect(intentOutcome([intentVerdict(F8_INTENTS_3, flag)], flag)).toEqual({ kind: 'again' });
    expect(intentOutcome([intentVerdict(F8_INTENTS_3, flag), intentVerdict(line('moderate_feature'), flag)], flag))
      .toMatchObject({ kind: 'done', verdict: { category: 'moderate_feature', problem: null }, earlier: [{ timedOut: true, problem: expect.stringMatching(/timed out after 12 s/) }] });
  });
  it('a second timed-out fallback is the red, and it names both', () => {
    const out = intentOutcome([intentVerdict(F8_INTENTS_3, flag), intentVerdict(RUN5_INTENTS_3, flag)], flag);
    expect(out.kind).toBe('red');
    expect(out.problem).toMatch(/one extra ask/);
    expect(out.problem.match(/timed out after 12 s/g)).toHaveLength(2);
  });
  it('a timeout then an answer outside the set, or the reverse, is the red: the extra ask is used once', () => {
    const a = intentOutcome([intentVerdict(F8_INTENTS_3, flag), intentVerdict(outside, flag)], flag);
    expect(a.kind).toBe('red');
    expect(a.problem).toMatch(/timed out after 12 s/);
    expect(a.problem).toMatch(/single_file_change \(0\.82\)/);
    const b = intentOutcome([intentVerdict(outside, flag), intentVerdict(F8_INTENTS_3, flag)], flag);
    expect(b.kind).toBe('red');
    expect(b.problem).toMatch(/single_file_change \(0\.82\)/);
    expect(b.problem).toMatch(/timed out after 12 s/);
  });
  it('a timeout then another kind of fallback is the red at once', () => {
    const out = intentOutcome([intentVerdict(F8_INTENTS_3, flag), intentVerdict(line('moderate_feature', ' (fallback: the classifier returned an empty response)'), flag)], flag);
    expect(out.kind).toBe('red');
    expect(out.problem).toMatch(/empty response/);
  });
});

describe('a run that completed without the model writing an answer (run 2 of 2026-10-03)', () => {
  const completed = { execution_status: 'completed', stop_reason: 'tasks_complete' };
  const terminal = [{ kind: 'usage.update' }, { kind: 'result' }, { kind: 'session.end' }];
  // Run 2's row kinds: user,thinking,tool,thinking,tool,thinking,system — two settled reads, no agent text.
  const run2 = ['user', 'thinking', 'tool', 'thinking', 'tool', 'thinking', 'system'].map((kind) => ({ kind, body: `${kind} row body, long enough to count` }));

  it('is the model\'s, not the product\'s: completed, the terminal pair written, no answer', () => {
    expect(answerRows(run2)).toEqual([]);
    expect(answerlessCompletion(completed, run2, terminal)).toBe(true);
  });

  it('is not when an agent row carries an answer', () => {
    const answered = [...run2, { kind: 'agent', body: 'The first heading of README.md is "Slice proof workspace".' }];
    expect(answerlessCompletion(completed, answered, terminal)).toBe(false);
    expect(answerlessCompletion(completed, [...run2, { kind: 'agent', body: 'ok' }], terminal)).toBe(true);
  });

  it('PD-ORCH-009 (OQ-199 as ruled): the product tells the person, in a system row, and the proof can tell a run that said so from one that did not', () => {
    expect(toldNoAnswer(run2)).toBe(false);
    expect(toldNoAnswer([...run2, { kind: 'system', body: 'The run ended without an answer: orchestrator ended its turn without writing one, even when asked once more.' }])).toBe(true);
    expect(toldNoAnswer([...run2, { kind: 'agent', body: 'The run ended without an answer: quoted by the model' }])).toBe(false);
  });

  it('is not when the product did not complete the run, or wrote no terminal pair: those stay reds at once', () => {
    expect(answerlessCompletion({ execution_status: 'failed' }, run2, terminal)).toBe(false);
    expect(answerlessCompletion(completed, run2, [{ kind: 'result' }])).toBe(false);
    expect(answerlessCompletion(undefined, run2, terminal)).toBe(false);
  });
});

describe('slice-proof reads its answers through this module and keeps its reds', () => {
  const proof = readFileSync(resolve(import.meta.dirname, '..', 'slice-proof.mjs'), 'utf8');
  it('holds no INTENTS of its own and asserts each intent through intentVerdict', () => {
    expect(proof).not.toMatch(/const INTENTS = \[/);
    expect(proof).toMatch(/import \{[^}]*\bINTENTS\b[^}]*\} from '\.\/lib\/live-answers\.mjs'/);
    expect(proof).toMatch(/intentVerdict\(log, c\)/);
    expect(proof).toMatch(/intentOutcome\(/);
    expect(proof).toMatch(/\.attempt-1\.log/);
  });
  it('re-runs scenario 3 once on an answerless completion, keeping the first attempt, and keeps every red', () => {
    expect(proof).toMatch(/answerlessCompletion\(/);
    expect(proof).toMatch(/toldNoAnswer\(/);
    expect(proof).toMatch(/run\.attempt-1/);
    expect(proof).toMatch(/keepRed\(/);
    expect(proof).toMatch(/slice-proof-reds/);
  });
  it('OQ-332 (F8): reports a timed-out first attempt as a NOTE with the bound, keeps its log, and lists it under earlier with its reason', () => {
    expect(proof).toMatch(/if \(first\.timedOut === true\) \{\s*console\.error\(`slice-proof: NOTE \$\{name\}: [^`]*REQ-ORCH-008's \$\{first\.boundS\} s bound/);
    expect(proof).toMatch(/earlier: outcome\.earlier\.map\(\(v\) => \(\{[^}]*log: `\$\{name\}\.attempt-1\.log`, reason: v\.timedOut === true \? 'timed-out fallback' : 'outside the accepted set', problem: v\.problem/);
    expect(proof).not.toMatch(/A fallback or a missing intent line is a red at once/);
  });
  it('copies an answerless first attempt out of the output directory the next run clears', () => {
    expect(proof).toMatch(/keepEvidence\(\{[^}]*'slice-proof-answerless'[^}]*only: \(name\) => name\.startsWith\('run\.attempt-1\.'\)/);
  });
});
