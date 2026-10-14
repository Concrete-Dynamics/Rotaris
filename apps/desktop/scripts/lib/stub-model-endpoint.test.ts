/**
 * The loopback stub ADR-0056 rule 4 (b) runs the packaged application against (OQ-312), read through the product's own model
 * client: what `AiSdkModelClient` parses from it is what the packaged launch's run receives, so a stub the AI SDK cannot read
 * fails here rather than as a packaged launch that recorded no terminal call.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { millis, type MonotonicClock, type Timers } from '@rotaris/kernel';
import { AiSdkModelClient, type ChatMessage, type ModelRequest, type StreamPart, type ToolSpec } from '@rotaris/model';
// @ts-expect-error — plain ESM beside the scripts that run it.
import { startStubModelEndpoint, STUB_INTENT, STUB_LOOP, STUB_REPLY } from './stub-model-endpoint.mjs';

interface Stub { baseUrl: string; counts: { requests: number; toolsRequests: number; terminalCalls: number; classifications: number }; close: () => Promise<void> }

const timers: Timers = {
  after: (delay, fn) => { const h = setTimeout(fn, delay); return { cancel: () => clearTimeout(h) }; },
  every: (period, fn) => { const h = setInterval(fn, period); return { cancel: () => clearInterval(h) }; },
};
const monotonic: MonotonicClock = { now: () => millis(performance.now()) };
const TERMINAL: ToolSpec = { name: 'terminal', description: 'Run a command.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } };
const READ: ToolSpec = { name: 'read_file', description: 'Read a file.', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } };
const user: ChatMessage = { role: 'user', content: [{ kind: 'text', text: 'show me the tree' }] };

let stub: Stub | undefined;
afterEach(async () => { await stub?.close(); stub = undefined; });

async function call(over: Partial<ModelRequest>): Promise<{ parts: StreamPart[]; error: unknown }> {
  stub ??= (await startStubModelEndpoint()) as Stub;
  const client = new AiSdkModelClient({ baseUrl: stub.baseUrl, timers, monotonic });
  const req: ModelRequest = {
    model: { providerId: 'openai', modelId: 'stub', dialect: 'chat', baseUrl: stub.baseUrl }, messages: [user], thinking: 'unset',
    signal: new AbortController().signal, timeoutMs: 5_000, retries: 0, resolveCredential: async () => 'placeholder', ...over,
  };
  const parts: StreamPart[] = [];
  for await (const r of client.stream(req)) { if (r.ok) parts.push(r.value); else return { parts, error: r.error }; }
  return { parts, error: null };
}
const text = (parts: StreamPart[]) => parts.filter((p) => p.kind === 'text').map((p) => (p as { delta: string }).delta).join('');

describe('the loopback stub model endpoint, read through AiSdkModelClient (ADR-0056 rule 4 (b), OQ-312)', () => {
  it('answers tools offering terminal with one streamed git status call, and the tool result after it with text', async () => {
    const first = await call({ tools: [READ, TERMINAL] });
    expect(first.error).toBeNull();
    const calls = first.parts.filter((p) => p.kind === 'tool-call') as Extract<StreamPart, { kind: 'tool-call' }>[];
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('terminal');
    expect(JSON.parse(calls[0]!.argsDelta)).toEqual({ command: 'git status' });
    const second = await call({
      tools: [READ, TERMINAL],
      messages: [user, { role: 'assistant', content: [{ kind: 'tool-call', callId: calls[0]!.callId, name: 'terminal', args: calls[0]!.argsDelta }] },
        { role: 'tool', content: [{ kind: 'tool-result', callId: calls[0]!.callId, name: 'terminal', result: 'On branch main', isError: false }] }],
    });
    expect(second.error).toBeNull();
    expect(second.parts.some((p) => p.kind === 'tool-call')).toBe(false);
    expect(text(second.parts)).toBe(STUB_REPLY);
    expect(stub!.counts).toEqual({ requests: 2, toolsRequests: 2, terminalCalls: 1, classifications: 0 });
  });

  it('answers a structured rung with a valid classification, the loop classifier\'s where its schema asks for loop_detected', async () => {
    const intent = await call({ output: { kind: 'json_schema', name: 'intent_classification', schema: { type: 'object', properties: { intent: { type: 'string' } } } } });
    expect(intent.error).toBeNull();
    expect(JSON.parse(text(intent.parts))).toEqual(STUB_INTENT);
    const loop = await call({ output: { kind: 'json_schema', name: 'loop_classification', schema: { type: 'object', properties: { loop_detected: { type: 'boolean' } } } } });
    expect(JSON.parse(text(loop.parts))).toEqual(STUB_LOOP);
    expect(stub!.counts).toMatchObject({ requests: 2, classifications: 2, terminalCalls: 0 });
  });

  it('answers a request with no terminal on offer, or no tools at all, with a short text reply', async () => {
    expect(text((await call({ tools: [READ] })).parts)).toBe(STUB_REPLY);
    const plain = await call({});
    expect(text(plain.parts)).toBe(STUB_REPLY);
    expect(plain.parts.at(-1)).toEqual({ kind: 'finish', reason: 'stop' });
    expect(stub!.counts).toEqual({ requests: 2, toolsRequests: 1, terminalCalls: 0, classifications: 0 });
  });
});
