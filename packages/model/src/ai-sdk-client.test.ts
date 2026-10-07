import { describe, expect, it } from 'vitest';
import { millis, type MonotonicClock, type Timers } from '@rotaris/kernel';
import { AiSdkModelClient, outputDowngrade, redactHeaders, type FetchLike } from './ai-sdk-client.js';
import { DefaultAgentBackend } from './default-backend.js';
import type { DispatchRetry, ModelRequest, StreamPart } from './ports.js';

/**
 * Spike 6's structural half, against a fake fetch: which URL each dialect
 * reaches under one base URL, that the custom fetch carries the per-request
 * credential and the custom headers, that an HTTP error keeps its status and
 * body, that an abort ends the stream as aborted, and the v7 usage mapping.
 * The live half — a real responses-dialect endpoint — is owed and recorded in
 * docs/architecture/spikes/responses-dialect.md.
 *
 * The idle-bound pair below (ADR-0027's fourth execution) reads REAL time on
 * purpose. A FakeClock cannot falsify the shape it was written against: the
 * bound it replaces was an `AbortSignal.timeout`, which reads the platform
 * clock and would not have noticed a controlled one advancing. The two tests
 * therefore run under a 300 ms bound rather than the product's 120 s.
 */
const realTimers: Timers = {
  after: (delay, fn) => { const h = setTimeout(fn, delay); return { cancel: () => clearTimeout(h) }; },
  every: (period, fn) => { const h = setInterval(fn, period); return { cancel: () => clearInterval(h) }; },
};

const realMonotonic: MonotonicClock = { now: () => millis(performance.now()) };

function sse(lines: string[]): Response {
  const body = lines.map((l) => `data: ${l}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
const chatChunk = (content: string | null, finish: string | null, usage?: { prompt_tokens: number; completion_tokens: number }) =>
  JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [{ index: 0, delta: content === null ? {} : { content }, finish_reason: finish }], ...(usage ? { usage: { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens } } : {}) });

function request(dialect: 'chat' | 'responses', over: Partial<ModelRequest> = {}): ModelRequest {
  return {
    model: { providerId: 'acme', modelId: 'acme-1', dialect }, messages: [{ role: 'user', content: [{ kind: 'text', text: 'hi' }] }],
    thinking: 'unset', signal: new AbortController().signal, timeoutMs: 5_000, retries: 0, resolveCredential: async () => 'sk-test-secret', ...over,
  };
}

async function collect(it: AsyncIterable<{ ok: true; value: StreamPart } | { ok: false; error: { code: string; status?: number; providerMessage?: string } }>) {
  const parts: StreamPart[] = [];
  let error: { code: string; status?: number; providerMessage?: string } | null = null;
  for await (const r of it) { if (r.ok) parts.push(r.value); else { error = r.error; break; } }
  return { parts, error };
}

describe('model — the AI SDK adapter (ADR-0027) through one decorated fetch', () => {
  it('chat: reaches <base>/chat/completions with the per-request credential and the custom headers; deltas, usage and finish map across', async () => {
    const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fake: FetchLike = async (input, init) => {
      const h = Object.fromEntries(new Headers(init?.headers).entries());
      seen.push({ url: String(input), headers: h, body: String(init?.body ?? '') });
      return sse([chatChunk('Hel', null), chatChunk('lo', null), chatChunk(null, 'stop', { prompt_tokens: 7, completion_tokens: 2 }), '[DONE]']);
    };
    const logged: Record<string, string>[] = [];
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://acme.example/v1', headers: { 'editor-version': 'rotaris/0.1' }, fetch: fake, onRequest: (i) => logged.push(i.headers) });
    const { parts, error } = await collect(client.stream(request('chat')));
    expect(error).toBeNull();
    expect(seen[0]!.url).toBe('https://acme.example/v1/chat/completions');
    expect(seen[0]!.headers['authorization']).toBe('Bearer sk-test-secret');
    expect(seen[0]!.headers['editor-version']).toBe('rotaris/0.1');
    expect(JSON.parse(seen[0]!.body)).toMatchObject({ model: 'acme-1', stream: true });
    // What reached the log never carried the bearer (REQ-PROVIDER-131).
    expect(logged[0]!['authorization']).toBe('<redacted>');
    expect(parts.filter((p) => p.kind === 'text').map((p) => (p as { delta: string }).delta).join('')).toBe('Hello');
    expect(parts.find((p) => p.kind === 'usage')).toEqual({ kind: 'usage', usage: { input: 7, output: 2 } });
    expect(parts.at(-1)).toEqual({ kind: 'finish', reason: 'stop' });
  });
  it('PD-MONITOR-001: the endpoint that reports a cost is asked for one, and the figure it answers rides out on the usage part', async () => {
    const seen: string[] = [];
    const costChunk = JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9, cost: 0.0123 } });
    const fake: FetchLike = async (_input, init) => {
      seen.push(String(init?.body ?? ''));
      return sse([chatChunk('done', null), costChunk, '[DONE]']);
    };
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://openrouter.ai/api/v1', fetch: fake });
    const { parts, error } = await collect(client.stream(request('chat')));
    expect(error).toBeNull();
    // The ask, in the endpoint's own field — the SDK has no option for it, so it goes through `transformRequestBody`.
    expect(JSON.parse(seen[0]!)).toMatchObject({ usage: { include: true } });
    // The SDK's usage mapping keeps the token fields and drops the rest; the figure survives as metadata.
    expect(parts.find((p) => p.kind === 'usage')).toEqual({ kind: 'usage', usage: { input: 7, output: 2, cost: '0.0123' } });
  });
  it('PD-MONITOR-001: an endpoint whose protocol defines no cost field is asked nothing, and its usage carries none', async () => {
    const seen: string[] = [];
    const fake: FetchLike = async (_input, init) => {
      seen.push(String(init?.body ?? ''));
      return sse([chatChunk('done', 'stop', { prompt_tokens: 3, completion_tokens: 1 }), '[DONE]']);
    };
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://api.openai.com/v1', fetch: fake });
    const { parts, error } = await collect(client.stream(request('chat')));
    expect(error).toBeNull();
    // A strict OpenAI-shaped API rejects an unrecognised body key with a 400, so the ask is never sent to one.
    expect(JSON.parse(seen[0]!)).not.toHaveProperty('usage');
    expect(parts.find((p) => p.kind === 'usage')).toEqual({ kind: 'usage', usage: { input: 3, output: 1 } });
  });
  it('REQ-ORCH-010: the strict rung leaves as a schema, and a rung the SDK drops is read back as a rejection', async () => {
    const seen: string[] = [];
    const fake: FetchLike = async (_input, init) => {
      seen.push(String(init?.body ?? ''));
      return sse([chatChunk('{"intent":"question"}', 'stop', { prompt_tokens: 3, completion_tokens: 4 }), '[DONE]']);
    };
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://acme.example/v1', fetch: fake });
    const schema = { type: 'object', properties: { intent: { type: 'string' } }, required: ['intent'], additionalProperties: false };
    const { error } = await collect(client.stream(request('chat', { output: { kind: 'json_schema', name: 'intent_classification', schema } })));
    expect(error).toBeNull();
    const body = JSON.parse(seen[0]!) as { response_format?: { type?: string; json_schema?: { schema?: unknown } } };
    // Without `supportsStructuredOutputs` this was `{ type: 'json_object' }` with the schema discarded.
    expect(body.response_format?.type).toBe('json_schema');
    expect(body.response_format?.json_schema?.schema).toMatchObject({ properties: { intent: { type: 'string' } } });
    // And the warning that reported the discard, had it happened, is a rung rejection rather than nothing.
    const schemaOut = { kind: 'json_schema', name: 'intent_classification', schema } as const;
    expect(outputDowngrade([{ type: 'unsupported', feature: 'responseFormat', details: 'JSON response format schema is only supported with structuredOutputs' }], schemaOut))
      .toMatchObject({ code: 'unsupported_output', transient: false });
    expect(outputDowngrade([{ type: 'unsupported-setting', setting: 'responseFormat' }], schemaOut)).toMatchObject({ code: 'unsupported_output' });
    expect(outputDowngrade([{ type: 'unsupported', feature: 'topK' }], schemaOut)).toBeNull();
    expect(outputDowngrade([{ type: 'unsupported', feature: 'responseFormat' }], { kind: 'json_object' })).toBeNull();
  });
  it('responses: the same base URL reaches <base>/responses through the vendor constructor; a 401 keeps its status and body', async () => {
    const seen: string[] = [];
    const fake: FetchLike = async (input, init) => {
      seen.push(`${init?.method ?? 'GET'} ${String(input)} auth=${new Headers(init?.headers).get('authorization')}`);
      return new Response(JSON.stringify({ error: { message: 'bad key for acme', type: 'invalid_request_error' } }), { status: 401, headers: { 'content-type': 'application/json' } });
    };
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://acme.example/v1', fetch: fake });
    const { error } = await collect(client.stream(request('responses')));
    expect(seen[0]).toBe('POST https://acme.example/v1/responses auth=Bearer sk-test-secret');
    expect(error).not.toBeNull();
    expect(error!.code).toBe('http');
    expect(error!.status).toBe(401);
    expect(error!.providerMessage).toContain('bad key for acme');
  });
  it('OQ-110 (REQ-CONFIG-086, REQ-SESSION-142): each retry the dispatch layer absorbs is reported as it is sent, with the status it met and the delay it waited', async () => {
    const statuses = [429, 500];
    let n = 0;
    const fake: FetchLike = async () => {
      const status = statuses[n++];
      // The SDK honours `retry-after-ms`, which keeps the test's real waits short; the delay reported is MEASURED, not read off the header.
      if (status !== undefined) return new Response(JSON.stringify({ error: { message: `refused ${status}` } }), { status, headers: { 'content-type': 'application/json', 'retry-after-ms': String(40 * n) } });
      return sse([chatChunk('ok', null), chatChunk(null, 'stop', { prompt_tokens: 3, completion_tokens: 1 }), '[DONE]']);
    };
    const retries: DispatchRetry[] = [];
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://acme.example/v1', fetch: fake });
    const { parts, error } = await collect(client.stream(request('chat', { retries: 5, onRetry: (r) => retries.push(r) })));
    expect(error).toBeNull();
    expect(parts.at(-1)).toEqual({ kind: 'finish', reason: 'stop' });
    expect(n).toBe(3);
    expect(retries.map(({ delayMs: _d, ...r }) => r)).toEqual([{ attempt: 1, of: 5, status: 429 }, { attempt: 2, of: 5, status: 500 }]);
    // A timer may fire a fraction of a millisecond early against the monotonic reading; never a whole 5 ms.
    expect(retries[0]!.delayMs).toBeGreaterThanOrEqual(35);
    expect(retries[1]!.delayMs).toBeGreaterThanOrEqual(75);
    expect(retries[1]!.delayMs).toBeLessThan(5_000);
  });
  it('OQ-110: a connection failure the dispatch layer retries is reported with no status and the failure beneath it; a call that met none reports nothing', async () => {
    let n = 0;
    const fake: FetchLike = async () => {
      n += 1;
      if (n === 1) throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9'), { code: 'ECONNREFUSED' }) });
      return sse([chatChunk('ok', null), chatChunk(null, 'stop', { prompt_tokens: 3, completion_tokens: 1 }), '[DONE]']);
    };
    const retries: DispatchRetry[] = [];
    // A controlled clock: the failure is met at 5,000 and the retry sent at 7,000 (the SDK's own 2 s wait passes in real time).
    const readings = [5_000, 7_000];
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: { now: () => millis(readings.shift() ?? 9_999) }, baseUrl: 'https://acme.example/v1', fetch: fake });
    const { error } = await collect(client.stream(request('chat', { retries: 1, onRetry: (r) => retries.push(r) })));
    expect(error).toBeNull();
    expect(retries).toEqual([{ attempt: 1, of: 1, status: null, failure: 'fetch failed (ECONNREFUSED)', delayMs: 2_000 }]);
    retries.length = 0;
    await collect(client.stream(request('chat', { retries: 5, onRetry: (r) => retries.push(r) })));
    expect(retries).toEqual([]);
  });
  it('OQ-110 (REQ-ORCH-091/092): when the dispatch layer\'s retries are exhausted the ladder is handed the last attempt\'s error, its status and retry-after intact', async () => {
    const refuse = (status: number): FetchLike => async () => new Response(JSON.stringify({ error: { message: `refused ${status}` } }), { status, headers: { 'content-type': 'application/json', 'retry-after-ms': '5', 'retry-after': '7' } });
    const rateLimited = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://acme.example/v1', fetch: refuse(429) });
    const limited = await collect(rateLimited.stream(request('chat', { retries: 2 })));
    // Before: `unknown`, not transient, no status — "Failed after 3 attempts" — so REQ-ORCH-091 (c)'s wait never began.
    expect(limited.error).toMatchObject({ code: 'http', status: 429, retryAfterMs: 7_000, retryAfter: '7' });
    expect(limited.error?.providerMessage).toContain('refused 429');
    const overloaded = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://acme.example/v1', fetch: refuse(503) });
    const failed = await collect(overloaded.stream(request('chat', { retries: 1 })));
    expect(failed.error).toMatchObject({ code: 'http', status: 503, transient: true });
  });
  it('a 503 is transient, a 400 is not (REQ-ORCH-092 decided on the status, not on prose)', async () => {
    const at = (status: number): FetchLike => async () => new Response('{"error":{"message":"x"}}', { status, headers: { 'content-type': 'application/json' } });
    const e503 = (await collect(new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://a.example/v1', fetch: at(503) }).stream(request('chat')))).error!;
    const e400 = (await collect(new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://a.example/v1', fetch: at(400) }).stream(request('chat')))).error!;
    expect((e503 as { transient?: boolean }).transient).toBe(true);
    expect((e400 as { transient?: boolean }).transient).toBe(false);
  });
  it('an abort mid-stream ends the stream as aborted', async () => {
    const ac = new AbortController();
    const fake: FetchLike = async (_input, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${chatChunk('part', null)}\n\n`));
          // …and then nothing, until the abort — which a real fetch honours through init.signal.
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://a.example/v1', fetch: fake });
    const it = client.stream(request('chat', { signal: ac.signal }))[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.value).toEqual({ ok: true, value: { kind: 'text', delta: 'part' } });
    ac.abort();
    let last = await it.next();
    while (!last.done && last.value.ok) last = await it.next();
    // Asserted unconditionally: the earlier form skipped its own assertion when the stream simply ended.
    if (last.done || last.value.ok) throw new Error('the stream ended without an error');
    expect(last.value.error.code).toBe('aborted');
  });
  it('a stream that goes SILENT past the bound fails as a timeout, not as an abort (REQ-CONFIG-115, REQ-ORCH-092)', async () => {
    // The shape that killed four children on 2026-09-12: nothing aborted the call; the bound expired, and the
    // adapter reported `aborted`, which REQ-ORCH-092 classes fatal — no retry, no fallback, the partial discarded.
    const fake: FetchLike = async (_input, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${chatChunk('part', null)}\n\n`));
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://a.example/v1', fetch: fake });
    const { parts, error } = await collect(client.stream(request('chat', { timeoutMs: 300 })));
    expect(parts.some((p) => p.kind === 'text')).toBe(true);
    expect(error).not.toBeNull();
    expect(error!.code).toBe('timeout');
    expect((error as { transient?: boolean }).transient).toBe(true);
  });
  it('a stream still emitting past the bound runs to completion: the bound measures silence, not total duration (REQ-CONFIG-115)', async () => {
    const enc = new TextEncoder();
    const fake: FetchLike = async (_input, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          void (async () => {
            try {
              // Eight deltas 60 ms apart is 480 ms of generation under a 300 ms bound — a long answer, in miniature.
              for (let i = 0; i < 8; i++) {
                await new Promise((r) => setTimeout(r, 60));
                if (init?.signal?.aborted === true) return;
                controller.enqueue(enc.encode(`data: ${chatChunk(`d${i} `, null)}\n\n`));
              }
              controller.enqueue(enc.encode(`data: ${chatChunk(null, 'stop', { prompt_tokens: 4, completion_tokens: 8 })}\n\n`));
              controller.enqueue(enc.encode('data: [DONE]\n\n'));
              controller.close();
            } catch { /* the reader is gone; nothing to close */ }
          })();
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://a.example/v1', fetch: fake });
    const { parts, error } = await collect(client.stream(request('chat', { timeoutMs: 300 })));
    expect(error).toBeNull();
    expect(parts.filter((p) => p.kind === 'text').map((p) => (p as { delta: string }).delta).join('')).toBe('d0 d1 d2 d3 d4 d5 d6 d7 ');
    expect(parts.at(-1)).toEqual({ kind: 'finish', reason: 'stop' });
  });
  it('redactHeaders blanks every secret-bearing header', () => {
    expect(redactHeaders({ Authorization: 'Bearer x', 'x-api-key': 'k', accept: 'a' })).toEqual({ Authorization: '<redacted>', 'x-api-key': '<redacted>', accept: 'a' });
  });
});

describe('model — a system message reaches the provider (spike 6, live half: the SDK refuses one inside `messages`)', () => {
  it('chat: the system text travels as instructions and lands in the request body; the stream still maps across', async () => {
    const seen: string[] = [];
    const fake: FetchLike = async (_input, init) => { seen.push(String(init?.body ?? '')); return sse([chatChunk('ok', null), chatChunk(null, 'stop', { prompt_tokens: 3, completion_tokens: 1 }), '[DONE]']); };
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://acme.example/v1', fetch: fake });
    const req = request('chat', { messages: [{ role: 'system', content: [{ kind: 'text', text: 'You are the orchestrator.' }] }, { role: 'user', content: [{ kind: 'text', text: 'hi' }] }] });
    const { parts, error } = await collect(client.stream(req));
    expect(error).toBeNull();
    const body = JSON.parse(seen[0]!) as { messages: { role: string; content: string }[] };
    expect(body.messages[0]).toMatchObject({ role: 'system', content: 'You are the orchestrator.' });
    expect(body.messages[1]).toMatchObject({ role: 'user' });
    expect(parts.some((p) => p.kind === 'text')).toBe(true);
  });
});

describe('model — a replayed tool call always carries a mapping (REQ-TOOLS-032; docs/defects/fixed/a-tool-call-whose-arguments-are-a-json-string-ends-the-run-with-http-400.md)', () => {
  /*
   * The arguments text a model produced is replayed in the next request's assistant message. A text that parses to
   * something other than a plain object (a JSON string literal holding the object, a number, an array, null) used to be
   * handed to the SDK as the call's input, which sent it on as a non-object; an endpoint whose chat template iterates the
   * arguments as a mapping refused the whole request (HTTP 400, "Can only get item pairs from a mapping.") and the run
   * ended, so the gate's recoverable answer never reached the model. Each is wrapped as an unreadable text is.
   */
  const replayed = async (args: string) => {
    const seen: string[] = [];
    const fake: FetchLike = async (_input, init) => { seen.push(String(init?.body ?? '')); return sse([chatChunk('ok', null), chatChunk(null, 'stop', { prompt_tokens: 3, completion_tokens: 1 }), '[DONE]']); };
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://acme.example/v1', fetch: fake });
    const req = request('chat', {
      messages: [
        { role: 'user', content: [{ kind: 'text', text: 'hi' }] },
        { role: 'assistant', content: [{ kind: 'tool-call', callId: 'c1', name: 'delegate', args }] },
        { role: 'tool', content: [{ kind: 'tool-result', callId: 'c1', name: 'delegate', result: 'could not be read', isError: true }] },
      ],
    });
    const { error } = await collect(client.stream(req));
    expect(error).toBeNull();
    const body = JSON.parse(seen[0]!) as { messages: { role: string; tool_calls?: { function: { arguments: string } }[] }[] };
    return JSON.parse(body.messages.find((m) => m.role === 'assistant')!.tool_calls![0]!.function.arguments) as unknown;
  };
  const isPlainObject = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);

  it('an object\'s text is replayed as that object', async () => {
    expect(await replayed('{"persona":"x"}')).toEqual({ persona: 'x' });
  });
  for (const args of ['"{\\"persona\\":\\"x\\"}"', '42', '[1]', 'null', 'true']) {
    it(`arguments that parse to a non-object (${args}) are replayed as a mapping holding the text`, async () => {
      const sent = await replayed(args);
      expect(isPlainObject(sent)).toBe(true);
      expect(sent).toEqual({ _raw: args });
    });
  }
  it('an unreadable text is replayed as a mapping holding the text, as before', async () => {
    expect(await replayed('{"persona":')).toEqual({ _raw: '{"persona":' });
  });
});

describe('model — a tool call\'s streamed arguments are model events (REQ-ORCH-089, REQ-ORCH-090; docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md)', () => {
  /*
   * An OpenAI-shaped endpoint streams a tool call's arguments in pieces, one `delta.tool_calls` chunk each. The SDK reads
   * them as `tool-input-start` and `tool-input-delta` parts and only then gives the complete `tool-call`. The adapter
   * dropped the pieces, so a step writing a long file was silent to every layer above it until its last piece arrived:
   * the duress live runs' child streamed 3,011 of them for about 97 s and was warned stalled at 94 s.
   */
  const toolChunk = (call: { id?: string; name?: string; args: string }) => JSON.stringify({
    id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'm',
    choices: [{ index: 0, delta: { tool_calls: [{ index: 0, ...(call.id === undefined ? {} : { id: call.id, type: 'function' }), function: { ...(call.name === undefined ? {} : { name: call.name }), arguments: call.args } }] }, finish_reason: null }],
  });
  const pieces = ['{"path":"docs/', 'verification.md",', '"operation":"create",', '"content":"line 1\\n', 'line 2\\n', 'line 3\\n"}'];
  const streamed = (): Response => sse([
    toolChunk({ id: 'call_1', name: 'write_file', args: '' }),
    ...pieces.map((args) => toolChunk({ args })),
    chatChunk(null, 'tool_calls', { prompt_tokens: 9, completion_tokens: 40 }),
    '[DONE]',
  ]);

  it('the adapter yields a `tool-input` part for each piece of the arguments, before the complete call, which carries them whole once', async () => {
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://acme.example/v1', fetch: async () => streamed() });
    const { parts, error } = await collect(client.stream(request('chat', { tools: [{ name: 'write_file', description: 'write', parameters: { type: 'object' } }] })));
    expect(error).toBeNull();
    const kinds = parts.map((p) => p.kind);
    const firstCall = kinds.indexOf('tool-call');
    // The first part of the step is the call's start, not its end.
    expect(kinds[0]).toBe('tool-input');
    expect(kinds.slice(0, firstCall).every((k) => k === 'tool-input')).toBe(true);
    // One for the call's start and one per piece of its arguments.
    expect(kinds.filter((k) => k === 'tool-input').length).toBeGreaterThanOrEqual(pieces.length);
    expect(parts.filter((p) => p.kind === 'tool-input').every((p) => p.kind === 'tool-input' && p.callId === 'call_1')).toBe(true);
    expect(parts.filter((p) => p.kind === 'tool-call')).toEqual([{ kind: 'tool-call', callId: 'call_1', name: 'write_file', argsDelta: JSON.stringify(JSON.parse(pieces.join(''))) }]);
  });

  it('through the default backend: the watchdog\'s `started` fires on the first piece, every piece is a model event, and the call is assembled once', async () => {
    const client = new AiSdkModelClient({ timers: realTimers, monotonic: realMonotonic, baseUrl: 'https://acme.example/v1', fetch: async () => streamed() });
    const seen: string[] = [];
    const report = await new DefaultAgentBackend(client).runTurn(
      { persona: 'p', systemPrompt: 's', messages: [{ role: 'user', content: [{ kind: 'text', text: 'hi' }] }], tools: [{ name: 'write_file', description: 'write', parameters: { type: 'object' } }], model: { providerId: 'acme', modelId: 'acme-1', dialect: 'chat' }, thinking: 'unset', timeoutMs: 5_000, retries: 0, resolveCredential: async () => 'k' },
      { delta: () => undefined, reasoning: () => undefined, usage: () => undefined, started: () => seen.push('started'), event: (k) => seen.push(k) },
      new AbortController().signal,
    );
    // REQ-ORCH-090: the step's first model event is the call's first piece; before the repair it was the finished call.
    expect(seen.slice(0, 2)).toEqual(['started', 'tool-input']);
    expect(seen.filter((k) => k === 'tool-input').length).toBeGreaterThanOrEqual(pieces.length);
    expect(seen.indexOf('tool-call')).toBeGreaterThan(seen.lastIndexOf('tool-input'));
    expect(report.status).toBe('succeeded');
    expect(report.toolCalls).toEqual([{ callId: 'call_1', name: 'write_file', args: JSON.stringify(JSON.parse(pieces.join(''))) }]);
  });
});
