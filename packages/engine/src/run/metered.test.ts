import { describe, expect, it } from 'vitest';
import type { AgentBackend, ModelRef, TurnInput, TurnReport, Usage } from '@rotaris/model';
import { meteredBackend } from './metered.js';

const MODEL: ModelRef = { providerId: 'p', modelId: 'small', dialect: 'chat' };
const SINK = { delta: () => undefined, reasoning: () => undefined, usage: () => undefined };
const input = { persona: 'summariser', systemPrompt: '', messages: [], tools: [], model: MODEL, thinking: 'unset', timeoutMs: 1_000, retries: 0, resolveCredential: async () => 'k' } as unknown as TurnInput;

function backendAnswering(report: TurnReport | Error): AgentBackend {
  return { ownsTheLoop: false, runTurn: async () => { if (report instanceof Error) throw report; return report; } };
}

describe('meteredBackend — REQ-EVENTS-053, PD-MONITOR-001', () => {
  it('counts a completed request once, with the model it was sent to, and returns the report unchanged', async () => {
    const counted: [Usage, ModelRef][] = [];
    const report: TurnReport = { status: 'succeeded', text: 'ok', usage: { input: 7, output: 2, cost: '0.0003' } };
    const out = await meteredBackend(backendAnswering(report), (u, m) => counted.push([u, m])).runTurn(input, SINK, new AbortController().signal);
    expect(out).toBe(report);
    expect(counted).toEqual([[{ input: 7, output: 2, cost: '0.0003' }, MODEL]]);
  });

  it('counts a failed request too, because the provider reported that usage as spent', async () => {
    const counted: Usage[] = [];
    const report: TurnReport = { status: 'failed', text: '', usage: { input: 5, output: 0 }, error: { headline: 'rejected' } as never };
    await meteredBackend(backendAnswering(report), (u) => counted.push(u)).runTurn(input, SINK, new AbortController().signal);
    expect(counted).toEqual([{ input: 5, output: 0 }]);
  });

  it('counts nothing when the call throws, because no request completed', async () => {
    const counted: Usage[] = [];
    const call = meteredBackend(backendAnswering(new Error('no credential')), (u) => counted.push(u)).runTurn(input, SINK, new AbortController().signal);
    await expect(call).rejects.toThrow('no credential');
    expect(counted).toEqual([]);
  });

  it('keeps the wrapped backend’s loop ownership', () => {
    expect(meteredBackend({ ownsTheLoop: true, runTurn: async () => { throw new Error('unused'); } }, () => undefined).ownsTheLoop).toBe(true);
  });
});
