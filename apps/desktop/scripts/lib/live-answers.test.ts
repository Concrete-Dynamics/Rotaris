/**
 * What `slice-proof` accepts from a live model, pinned against the evidence of its three reds of 2026-10-03
 * (`docs/defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`): run 4's `explicit_trivial (0.99)`
 * for the README question, run 5's classification that hit the 12 s bound, and run 2's run that completed with no
 * answer. Each line below is the log line those runs wrote. A fallback, a category the taxonomy's texts leave out of
 * reach, and a missing intent line stay reds (REQ-ORCH-006, REQ-ORCH-007, REQ-ORCH-021; Part L). Since PD-ORCH-010 (the
 * owner's ruling of OQ-198, 2026-10-06) run 4's answer is one of those reds: `explicit_trivial` is a small edit.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INTENT_CATEGORIES, INTENT_GROUPS } from '@rotaris/contracts';
import { answerlessCompletion, answerRows, INTENTS, intentVerdict, toldNoAnswer } from './live-answers.mjs';

const RUN4_INTENTS_1 = '[main 2026-10-03T06:02:51.969Z] info    run host: intent: explicit_trivial (0.99) via json_schema';
const RUN5_INTENTS_3 = '[main 2026-10-03T06:06:10.115Z] info    run host: intent: moderate_feature (fallback: the classification call timed out after 12 s)';
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

  it('PD-ORCH-010 (OQ-198): run 4\'s explicit_trivial for the README question is a red, since explicit_trivial is a small edit', () => {
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

  it('keeps run 5\'s fallback at the 12 s bound a red, and names OQ-114', () => {
    const v = intentVerdict(RUN5_INTENTS_3, flag);
    expect(v.category).toBe('moderate_feature');
    expect(v.problem).toMatch(/^the classifier fell back: .*timed out after 12 s\).*OQ-114/);
  });

  it('keeps any fallback a red, even on a category the prompt accepts', () => {
    expect(intentVerdict(line('question', ' (fallback: unparseable response)'), readme).problem).toMatch(/^the classifier fell back/);
  });

  it('reads the line written before PD-MONITOR-002, and is red when there is none', () => {
    expect(intentVerdict('[main 2026-09-20T00:00:00.000Z] run host info: intent: question (1) via text', readme)).toMatchObject({ category: 'question', rung: 'text', problem: null });
    expect(intentVerdict('[main] info    run host: session started', readme).problem).toBe('no intent line in the log');
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
  });
  it('re-runs scenario 3 once on an answerless completion, keeping the first attempt, and keeps every red', () => {
    expect(proof).toMatch(/answerlessCompletion\(/);
    expect(proof).toMatch(/toldNoAnswer\(/);
    expect(proof).toMatch(/run\.attempt-1/);
    expect(proof).toMatch(/keepRed\(/);
    expect(proof).toMatch(/slice-proof-reds/);
  });
  it('copies an answerless first attempt out of the output directory the next run clears', () => {
    expect(proof).toMatch(/keepEvidence\(\{[^}]*'slice-proof-answerless'[^}]*only: \(name\) => name\.startsWith\('run\.attempt-1\.'\)/);
  });
});
