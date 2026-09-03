import { describe, expect, it } from 'vitest';
import { answer, DefaultAgentBackend, isTransient, modelError, ScriptedModelClient, type ModelRef, type TurnInput, type TurnSink } from './index.js';

const model: ModelRef = { providerId: 'p', modelId: 'm', dialect: 'chat' };
const input = (task: string): TurnInput => ({
  persona: 'orchestrator', systemPrompt: 'You are the orchestrator.', messages: [{ role: 'user', content: [{ kind: 'text', text: task }] }], tools: [], model, thinking: 'unset', timeoutMs: 1000, retries: 0,
  resolveCredential: async () => 'k',
});
function sink(): TurnSink & { deltas: string[]; usages: { input: number; output: number }[] } {
  const deltas: string[] = [];
  const usages: { input: number; output: number }[] = [];
  return { deltas, usages, delta: (t) => deltas.push(t), reasoning: () => undefined, usage: (u) => usages.push(u) };
}

describe('model — REQ-ORCH-092 classification is a fact on the error, not a pattern on prose', () => {
  it('408/425/500/502/503/504, connection and timeout are transient; 400, 401, 429 and validation are not', () => {
    for (const s of [408, 425, 500, 502, 503, 504]) expect(isTransient('http', s)).toBe(true);
    for (const s of [400, 401, 403, 404, 429]) expect(isTransient('http', s)).toBe(false);
    expect(isTransient('connection')).toBe(true);
    expect(isTransient('timeout')).toBe(true);
    expect(isTransient('validation')).toBe(false);
    expect(modelError({ code: 'http', status: 503, headline: 'x' }).transient).toBe(true);
    expect(modelError({ code: 'http', status: 503, headline: 'x', transient: false }).transient).toBe(false);
  });
});

describe('model — the default backend over a scripted client (ADR-0026 alternative B)', () => {
  it('streams every delta to the sink, reports the whole text, the usage, and succeeded on a stop finish', async () => {
    const client = new ScriptedModelClient([answer('hello world', { input: 7, output: 2 })]);
    const be = new DefaultAgentBackend(client);
    const s = sink();
    const r = await be.runTurn(input('say hi'), s, new AbortController().signal);
    expect(r).toMatchObject({ status: 'succeeded', text: 'hello world', usage: { input: 7, output: 2 } });
    expect(s.deltas.join('')).toBe('hello world');
    expect(s.usages).toEqual([{ input: 7, output: 2 }]);
    // The credential resolver ran inside the request path, and the system prompt led the messages.
    expect(client.requests[0]!.messages[0]!.role).toBe('system');
    expect(client.requests[0]!.messages.at(-1)!.content[0]).toEqual({ kind: 'text', text: 'say hi' });
  });
  it('a length finish is partial, so the loop returns the task to pending rather than completing it', async () => {
    const client = new ScriptedModelClient([{ parts: [{ part: { kind: 'text', delta: 'half' } }, { part: { kind: 'finish', reason: 'length' } }] }]);
    const r = await new DefaultAgentBackend(client).runTurn(input('t'), sink(), new AbortController().signal);
    expect(r.status).toBe('partial');
    expect(r.text).toBe('half');
  });
  it('an error part ends the turn as failed with the error preserved and the text so far kept', async () => {
    const e = modelError({ code: 'http', status: 503, headline: 'overloaded', providerMessage: 'try later', retryAfterMs: 1000 });
    const client = new ScriptedModelClient([{ parts: [{ part: { kind: 'text', delta: 'a' } }, { error: e }] }]);
    const r = await new DefaultAgentBackend(client).runTurn(input('t'), sink(), new AbortController().signal);
    expect(r.status).toBe('failed');
    if (r.status === 'failed') { expect(r.error).toBe(e); expect(r.text).toBe('a'); }
  });
  it('an abort while the stream is held ends the turn as failed/aborted; the hold is released by the abort', async () => {
    let release!: () => void;
    const hold = new Promise<void>((res) => { release = res; });
    const client = new ScriptedModelClient([{ parts: [{ part: { kind: 'text', delta: 'a' } }, { hold, part: { kind: 'text', delta: 'b' } }] }]);
    const ac = new AbortController();
    const s = sink();
    const turn = new DefaultAgentBackend(client).runTurn(input('t'), s, ac.signal);
    await Promise.resolve();
    ac.abort();
    const r = await turn;
    expect(r.status).toBe('failed');
    if (r.status === 'failed') expect(r.error.code).toBe('aborted');
    expect(s.deltas).toEqual(['a']);
    release();
  });
  it('a stream with no script left fails as unknown, never throws', async () => {
    const r = await new DefaultAgentBackend(new ScriptedModelClient([])).runTurn(input('t'), sink(), new AbortController().signal);
    expect(r.status).toBe('failed');
  });
});
