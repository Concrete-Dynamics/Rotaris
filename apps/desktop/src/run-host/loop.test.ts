import { describe, expect, it } from 'vitest';
import { RungMemory, type HelperModel, type LoopActivation } from '@rotaris/engine';
import type { AgentBackend, TurnInput, TurnReport } from '@rotaris/model';
import { createLoopClassifier, REVIEW_SYSTEM_PROMPT } from './loop.js';

const M = (id: string) => ({ providerId: 'p', modelId: id, dialect: 'chat' as const });
const ok = (text: string): TurnReport => ({ status: 'succeeded', text, usage: { input: 1, output: 1 } });
const activation = { trigger: 'repetition', reason: 'the same call four times', excerpt: 'tool: glob {}', events: [] } as unknown as LoopActivation;

function backend() {
  const inputs: TurnInput[] = [];
  const b: AgentBackend = { ownsTheLoop: false, runTurn: async (input) => { inputs.push(input); return ok('{"loop_detected":true,"reason":"repeated","corrective_message":"Try another approach."}'); } };
  return { b, inputs };
}
const deps = (b: AgentBackend, helperModel?: HelperModel) => ({
  backend: b, runModel: M('entry'), thinking: 'unset' as const, credentialFor: () => async () => 'k', memory: new RungMemory(),
  configuredModel: null, slots: { small: M('small'), fallback: null, summary: null }, modelTimeoutMs: 30_000, reviewTimeoutMs: 45_000, ...(helperModel ? { helperModel } : {}),
});

/*
 * OQ-189's ruling (R-071, PD-MONITOR-007): the loop classifier's model follows the session's override, read at each
 * classification, and a pair held out of quota is not called — the classification fails with the reason, which the
 * supervisor reads as an unanswered one. Until 2026-10-06 the slot was called as configured.
 */
describe('run-host/loop — the loop classifier\'s model (REQ-ORCH-100/103, OQ-189, PD-MONITOR-007)', () => {
  it('calls the slot as configured when the session leaves it alone', async () => {
    const { b, inputs } = backend();
    const c = createLoopClassifier(deps(b, (choice) => ({ ok: true, model: choice.model, thinking: choice.thinking })))!;
    await expect(c.classify(activation, new AbortController().signal)).resolves.toMatchObject({ loop_detected: true });
    expect(inputs.map((i) => i.model.modelId)).toEqual(['small']);
  });
  it('follows the session\'s override, read at each classification', async () => {
    const { b, inputs } = backend();
    let target = 'small';
    const c = createLoopClassifier(deps(b, () => ({ ok: true, model: M(target), thinking: 'unset' })))!;
    await c.classify(activation, new AbortController().signal);
    target = 'override';
    await c.classify(activation, new AbortController().signal);
    expect(inputs.map((i) => i.model.modelId)).toEqual(['small', 'override']);
  });
  it('sends the reasoning level the helper resolved with the override, not the slot\'s own', async () => {
    const { b, inputs } = backend();
    const c = createLoopClassifier(deps(b, () => ({ ok: true, model: M('override'), thinking: 'high' })))!;
    await c.classify(activation, new AbortController().signal);
    expect(inputs.map((i) => i.thinking)).toEqual(['high']);
  });
  it('makes no call on a pair held out of quota, and fails with the reason', async () => {
    const { b, inputs } = backend();
    const c = createLoopClassifier(deps(b, () => ({ ok: false, reason: 'p/small is held out of quota for this session' })))!;
    await expect(c.classify(activation, new AbortController().signal)).rejects.toThrow("the loop classifier's model p/small is held out of quota for this session; no classification call was made");
    expect(inputs).toEqual([]);
  });
});

describe('run-host/loop — a periodic review (PD-ORCH-018 clauses 3 and 6)', () => {
  const textOf = (i: TurnInput): string => i.messages.flatMap((m) => m.content.map((c) => (c.kind === 'text' ? c.text : ''))).join('\n');
  const periodic = { trigger: 'periodic', reason: 'review interval', excerpt: 'tool: read_file {"path":"a.ts"}', events: [], objective: 'Fix the failing parser test.' } as unknown as LoopActivation;

  it('asks about progress toward the task, hands it the task ahead of the excerpt, and bounds the request by the review timeout', async () => {
    const { b, inputs } = backend();
    const c = createLoopClassifier(deps(b))!;
    await expect(c.classify(periodic, new AbortController().signal)).resolves.toMatchObject({ loop_detected: true });
    expect(inputs[0]!.systemPrompt).toBe(REVIEW_SYSTEM_PROMPT);
    expect(textOf(inputs[0]!)).toContain('<task>\nFix the failing parser test.\n</task>\n<conversation_excerpt>');
    expect(inputs[0]!.timeoutMs).toBe(45_000);
  });
  it('leaves every other trigger on the loop prompt and the capped bound', async () => {
    const { b, inputs } = backend();
    const c = createLoopClassifier(deps(b))!;
    await c.classify(activation, new AbortController().signal);
    expect(inputs[0]!.systemPrompt).not.toBe(REVIEW_SYSTEM_PROMPT);
    expect(textOf(inputs[0]!)).toContain('Trigger: repetition (the same call four times).');
    expect(textOf(inputs[0]!)).not.toContain('<task>');
    expect(inputs[0]!.timeoutMs).toBe(30_000);
  });
  it('says so when no task was recorded rather than sending an empty one', async () => {
    const { b, inputs } = backend();
    await createLoopClassifier(deps(b))!.classify({ ...periodic, objective: undefined }, new AbortController().signal);
    expect(textOf(inputs[0]!)).toContain('the task was not recorded');
  });
});
