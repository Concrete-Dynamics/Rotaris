import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { modelError, type AgentBackend, type TurnInput, type TurnReport } from '@rotaris/model';
import { RungMemory, type ClassifierSlots } from './classifier.js';
import { chooseStrategy, readStrategy, STRATEGY_CHOICE_TIMEOUT_MS, STRATEGY_SYSTEM_PROMPT } from './strategy.js';

const M = (id: string) => ({ providerId: 'p', modelId: id, dialect: 'chat' as const });
const SLOTS: ClassifierSlots = { small: M('small'), fallback: M('fb'), summary: M('sum') };
const ok = (text: string): TurnReport => ({ status: 'succeeded', text, usage: { input: 1, output: 1 } });
const fail = (status: number, headline: string): TurnReport => ({ status: 'failed', text: '', usage: { input: 0, output: 0 }, error: modelError({ code: 'http', status, headline, transient: false }) });

function backend(script: (input: TurnInput, n: number) => TurnReport | 'hold') {
  const inputs: TurnInput[] = [];
  const b: AgentBackend = {
    ownsTheLoop: false,
    runTurn: async (input, _sink, signal) => {
      inputs.push(input);
      const r = script(input, inputs.length);
      if (r === 'hold') {
        await new Promise<void>((resolve) => { signal.addEventListener('abort', () => resolve(), { once: true }); });
        return { status: 'failed', text: '', usage: { input: 0, output: 0 }, error: modelError({ code: 'aborted', headline: 'aborted', transient: false }) };
      }
      return r;
    },
  };
  return { b, inputs };
}
const deps = (b: AgentBackend, clock = new FakeClock(), memory = new RungMemory()) => ({ backend: b, timers: clock.timers, credentialFor: () => async () => 'k', modelTimeoutMs: 30_000, memory, warn: () => undefined });
const never = () => new AbortController().signal;

describe('PD-ORCH-020: the strategy of an intelligent run', () => {
  it('clause 1: one request to the small model, carrying the request text and no tool', async () => {
    const { b, inputs } = backend(() => ok('{"strategy":"single","reason":"a one-line fix"}'));
    const r = await chooseStrategy('fix the typo in README', SLOTS, deps(b), never());
    expect(r).toEqual({ strategy: 'single', reason: 'a one-line fix', fallback: false });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.model.modelId).toBe('small');
    expect(inputs[0]!.tools).toEqual([]);
    expect(inputs[0]!.systemPrompt).toBe(STRATEGY_SYSTEM_PROMPT);
    expect(JSON.stringify(inputs[0]!.messages)).toContain('fix the typo in README');
  });

  it('clause 2: each of the three is taken as named, on a structured rung and on the text rung', () => {
    expect(readStrategy('{"strategy":"lead","reason":"r"}', 'json_schema')).toEqual({ kind: 'chosen', strategy: 'lead', reason: 'r' });
    expect(readStrategy('```json\n{"strategy":"Orchestrator","reason":"a whole project"}\n```', 'json_object')).toEqual({ kind: 'chosen', strategy: 'orchestrator', reason: 'a whole project' });
    expect(readStrategy('single\none command', 'text')).toEqual({ kind: 'chosen', strategy: 'single', reason: 'one command' });
    expect(STRATEGY_SYSTEM_PROMPT).toContain('When two strategies are plausible, choose lead.');
  });

  it('clause 3: swarm is never taken, on any rung; the run goes on under lead', async () => {
    expect(readStrategy('{"strategy":"swarm","reason":"many hands"}', 'json_schema')).toEqual({ kind: 'unmapped' });
    expect(readStrategy('swarm\nmany hands', 'text')).toEqual({ kind: 'unmapped' });
    expect(STRATEGY_SYSTEM_PROMPT).not.toContain('swarm');
    const { b } = backend(() => ok('{"strategy":"swarm","reason":"many hands"}'));
    const r = await chooseStrategy('do it all at once', SLOTS, deps(b), never());
    expect(r).toMatchObject({ strategy: 'lead', fallback: true });
    expect(r.reason).toContain('named no strategy that may be chosen');
  });

  it('clause 4: no small model, no request text, a failed call, an empty answer and the bound all leave lead with the reason', async () => {
    const none = backend(() => ok('{"strategy":"single"}'));
    expect(await chooseStrategy('p', { small: null, fallback: null, summary: null }, deps(none.b), never())).toMatchObject({ strategy: 'lead', fallback: true, reason: expect.stringContaining('no small model is configured') });
    expect(await chooseStrategy('   ', SLOTS, deps(none.b), never())).toMatchObject({ strategy: 'lead', fallback: true });
    expect(none.inputs).toEqual([]);
    expect(await chooseStrategy('p', SLOTS, deps(backend(() => fail(500, 'server error')).b), never())).toMatchObject({ strategy: 'lead', fallback: true, reason: expect.stringContaining('the call failed') });
    expect(await chooseStrategy('p', SLOTS, deps(backend(() => ok('')).b), never())).toMatchObject({ strategy: 'lead', fallback: true, reason: expect.stringContaining('empty response') });
    const clock = new FakeClock();
    const held = backend(() => 'hold');
    const pending = chooseStrategy('p', SLOTS, deps(held.b, clock), never());
    await Promise.resolve();
    clock.advance(millis(STRATEGY_CHOICE_TIMEOUT_MS));
    expect(await pending).toMatchObject({ strategy: 'lead', fallback: true, reason: expect.stringContaining('timed out after 12 s') });
  });

  it('REQ-ORCH-010: a rejected structured rung is remembered and the next rung asked', async () => {
    const memory = new RungMemory();
    const { b, inputs } = backend((input) => (input.output?.kind === 'json_schema' ? fail(400, 'response_format json_schema is not supported') : ok('{"strategy":"orchestrator","reason":"a migration"}')));
    const r = await chooseStrategy('migrate the whole codebase', SLOTS, deps(b, new FakeClock(), memory), never());
    expect(r).toEqual({ strategy: 'orchestrator', reason: 'a migration', fallback: false });
    expect(inputs.map((i) => i.output?.kind)).toEqual(['json_schema', 'json_object']);
    expect(memory.ladder('small')).toEqual(['json_object', 'text']);
  });
});
