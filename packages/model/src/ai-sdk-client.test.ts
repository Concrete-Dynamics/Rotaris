import { describe, expect, it } from 'vitest';
import type { Timers } from '@rotaris/kernel';
import { AiSdkModelClient, redactHeaders, type FetchLike } from './ai-sdk-client.js';
import type { ModelRequest, StreamPart } from './ports.js';

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
    const client = new AiSdkModelClient({ timers: realTimers, baseUrl: 'https://acme.example/v1', headers: { 'editor-version': 'rotaris/0.1' }, fetch: fake, onRequest: (i) => logged.push(i.headers) });
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
  it('responses: the same base URL reaches <base>/responses through the vendor constructor; a 401 keeps its status and body', async () => {
    const seen: string[] = [];
    const fake: FetchLike = async (input, init) => {
      seen.push(`${init?.method ?? 'GET'} ${String(input)} auth=${new Headers(init?.headers).get('authorization')}`);
      return new Response(JSON.stringify({ error: { message: 'bad key for acme', type: 'invalid_request_error' } }), { status: 401, headers: { 'content-type': 'application/json' } });
    };
    const client = new AiSdkModelClient({ timers: realTimers, baseUrl: 'https://acme.example/v1', fetch: fake });
    const { error } = await collect(client.stream(request('responses')));
    expect(seen[0]).toBe('POST https://acme.example/v1/responses auth=Bearer sk-test-secret');
    expect(error).not.toBeNull();
    expect(error!.code).toBe('http');
    expect(error!.status).toBe(401);
    expect(error!.providerMessage).toContain('bad key for acme');
  });
  it('a 503 is transient, a 400 is not (REQ-ORCH-092 decided on the status, not on prose)', async () => {
    const at = (status: number): FetchLike => async () => new Response('{"error":{"message":"x"}}', { status, headers: { 'content-type': 'application/json' } });
    const e503 = (await collect(new AiSdkModelClient({ timers: realTimers, baseUrl: 'https://a.example/v1', fetch: at(503) }).stream(request('chat')))).error!;
    const e400 = (await collect(new AiSdkModelClient({ timers: realTimers, baseUrl: 'https://a.example/v1', fetch: at(400) }).stream(request('chat')))).error!;
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
    const client = new AiSdkModelClient({ timers: realTimers, baseUrl: 'https://a.example/v1', fetch: fake });
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
    const client = new AiSdkModelClient({ timers: realTimers, baseUrl: 'https://a.example/v1', fetch: fake });
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
    const client = new AiSdkModelClient({ timers: realTimers, baseUrl: 'https://a.example/v1', fetch: fake });
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
    const client = new AiSdkModelClient({ timers: realTimers, baseUrl: 'https://acme.example/v1', fetch: fake });
    const req = request('chat', { messages: [{ role: 'system', content: [{ kind: 'text', text: 'You are the orchestrator.' }] }, { role: 'user', content: [{ kind: 'text', text: 'hi' }] }] });
    const { parts, error } = await collect(client.stream(req));
    expect(error).toBeNull();
    const body = JSON.parse(seen[0]!) as { messages: { role: string; content: string }[] };
    expect(body.messages[0]).toMatchObject({ role: 'system', content: 'You are the orchestrator.' });
    expect(body.messages[1]).toMatchObject({ role: 'user' });
    expect(parts.some((p) => p.kind === 'text')).toBe(true);
  });
});
