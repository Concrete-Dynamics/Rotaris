import { describe, expect, it } from 'vitest';
import { AiSdkModelClient, redactHeaders, type FetchLike } from './ai-sdk-client.js';
import type { ModelRequest, StreamPart } from './ports.js';

/**
 * Spike 6's structural half, against a fake fetch: which URL each dialect
 * reaches under one base URL, that the custom fetch carries the per-request
 * credential and the custom headers, that an HTTP error keeps its status and
 * body, that an abort ends the stream as aborted, and the v7 usage mapping.
 * The live half — a real responses-dialect endpoint — is owed and recorded in
 * docs/architecture/spikes/responses-dialect.md.
 */
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
    const client = new AiSdkModelClient({ baseUrl: 'https://acme.example/v1', headers: { 'editor-version': 'rotaris/0.1' }, fetch: fake, onRequest: (i) => logged.push(i.headers) });
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
    const client = new AiSdkModelClient({ baseUrl: 'https://acme.example/v1', fetch: fake });
    const { error } = await collect(client.stream(request('responses')));
    expect(seen[0]).toBe('POST https://acme.example/v1/responses auth=Bearer sk-test-secret');
    expect(error).not.toBeNull();
    expect(error!.code).toBe('http');
    expect(error!.status).toBe(401);
    expect(error!.providerMessage).toContain('bad key for acme');
  });
  it('a 503 is transient, a 400 is not (REQ-ORCH-092 decided on the status, not on prose)', async () => {
    const at = (status: number): FetchLike => async () => new Response('{"error":{"message":"x"}}', { status, headers: { 'content-type': 'application/json' } });
    const e503 = (await collect(new AiSdkModelClient({ baseUrl: 'https://a.example/v1', fetch: at(503) }).stream(request('chat')))).error!;
    const e400 = (await collect(new AiSdkModelClient({ baseUrl: 'https://a.example/v1', fetch: at(400) }).stream(request('chat')))).error!;
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
    const client = new AiSdkModelClient({ baseUrl: 'https://a.example/v1', fetch: fake });
    const it = client.stream(request('chat', { signal: ac.signal }))[Symbol.asyncIterator]();
    const first = await it.next();
    expect(first.value).toEqual({ ok: true, value: { kind: 'text', delta: 'part' } });
    ac.abort();
    let last = await it.next();
    while (!last.done && last.value.ok) last = await it.next();
    expect(last.done).toBe(false);
    if (!last.done && !last.value.ok) expect(last.value.error.code).toBe('aborted');
  });
  it('redactHeaders blanks every secret-bearing header', () => {
    expect(redactHeaders({ Authorization: 'Bearer x', 'x-api-key': 'k', accept: 'a' })).toEqual({ Authorization: '<redacted>', 'x-api-key': '<redacted>', accept: 'a' });
  });
});
