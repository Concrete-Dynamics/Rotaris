import { err, ok, type Result } from '@rotaris/kernel';
import { APICallError, streamText, type LanguageModel, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { modelError, type ChatMessage, type ModelClient, type ModelError, type ModelRequest, type StreamPart } from './ports.js';

/**
 * ADR-0027 — the AI SDK behind `ModelClient`, for the request-and-stream
 * step only. Pinned exactly (ai 7.0.92, @ai-sdk/openai 4.0.58,
 * @ai-sdk/openai-compatible 3.0.43); the usage-field mapping is re-checked
 * at every pin because it moved between v6 and v7 (top-level `inputTokens`
 * and `outputTokens` are what REQ-MONITOR-081 depends on and are still there).
 *
 * - `chat` goes through the compatible provider against the base URL;
 *   `responses` through the vendor package's responses constructor against
 *   the same base URL (REQ-PROVIDER-089/092: two dialects, one base URL,
 *   chosen per model).
 * - ONE custom `fetch` is the only place a request is decorated: the
 *   credential is resolved INSIDE it, per request (REQ-PROVIDER-092), the
 *   per-provider headers are added, and anything handed to a log goes through
 *   the redacting hook (REQ-PROVIDER-131). It is a security-relevant
 *   chokepoint (ADR-0027 consequence 4).
 * - The retry count is the request's (REQ-PROVIDER-089), never the SDK's own.
 * - An error preserves the HTTP status and the provider's message, cut to 500
 *   characters (REQ-PROVIDER-071, REQ-ORCH-091/092).
 * - No SDK type crosses the port; cost is never computed here.
 */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AiSdkClientOptions {
  readonly baseUrl: string;
  /** Per-provider headers (e.g. REQ-PROVIDER-070's editor identity), added on every request. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Injected for tests; the global fetch otherwise. */
  readonly fetch?: FetchLike;
  /** Observes each request with its secret-bearing headers already redacted (REQ-PROVIDER-131). */
  readonly onRequest?: (info: { url: string; method: string; headers: Record<string, string> }) => void;
}

const SECRET_HEADER = /authorization|api-key|x-api-key|cookie/i;

export function redactHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k] = SECRET_HEADER.test(k) ? '<redacted>' : v;
  return out;
}

function toModelMessages(messages: readonly ChatMessage[]): ModelMessage[] {
  return messages.map((m): ModelMessage => {
    if (m.role === 'system') return { role: 'system', content: m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') };
    if (m.role === 'assistant') return { role: 'assistant', content: m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') };
    return {
      role: 'user',
      content: m.content.map((p) => (p.kind === 'text' ? { type: 'text' as const, text: p.text } : { type: 'image' as const, image: p.base64, mediaType: p.mediaType })),
    };
  });
}

function fromError(cause: unknown, aborted: boolean): ModelError {
  if (aborted) return modelError({ code: 'aborted', headline: 'the call was aborted', transient: false });
  if (APICallError.isInstance(cause)) {
    const body = typeof cause.responseBody === 'string' ? cause.responseBody.slice(0, 500) : undefined;
    const retryAfter = cause.responseHeaders?.['retry-after'];
    const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : undefined;
    const status = cause.statusCode;
    return modelError({
      code: status === undefined ? 'connection' : 'http', headline: cause.message.slice(0, 200),
      ...(status === undefined ? {} : { status }), ...(body === undefined ? {} : { providerMessage: body }), ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    });
  }
  const e = cause as { name?: string; message?: string; statusCode?: number };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return modelError({ code: 'timeout', headline: e.message ?? 'the call timed out' });
  if (typeof e?.statusCode === 'number') return modelError({ code: 'http', status: e.statusCode, headline: (e.message ?? 'provider error').slice(0, 200) });
  if (e?.name === 'TypeError' && /fetch|network|ECONN|ENOTFOUND|EAI_AGAIN|TLS|certificate/i.test(e.message ?? '')) return modelError({ code: 'connection', headline: e.message ?? 'connection failed' });
  return modelError({ code: 'unknown', headline: String(e?.message ?? cause).slice(0, 200), transient: false });
}

export class AiSdkModelClient implements ModelClient {
  constructor(private readonly opts: AiSdkClientOptions) {}

  private languageModel(req: ModelRequest): LanguageModel {
    // The one decorated fetch. The credential is resolved per request, inside the request path.
    const base = this.opts.fetch ?? fetch;
    const decorated: FetchLike = async (input, init) => {
      const credential = await req.resolveCredential();
      const headers = new Headers(init?.headers);
      for (const [k, v] of Object.entries(this.opts.headers ?? {})) headers.set(k, v);
      for (const [k, v] of Object.entries(req.headers ?? {})) headers.set(k, v);
      if (credential) headers.set('authorization', `Bearer ${credential}`);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      this.opts.onRequest?.({ url, method: init?.method ?? 'POST', headers: redactHeaders(Object.fromEntries(headers.entries())) });
      return base(input, { ...init, headers });
    };
    if (req.model.dialect === 'responses') {
      const openai = createOpenAI({ baseURL: this.opts.baseUrl, apiKey: 'resolved-per-request', fetch: decorated });
      return openai.responses(req.model.modelId);
    }
    const provider = createOpenAICompatible({ name: req.model.providerId, baseURL: this.opts.baseUrl, includeUsage: true, fetch: decorated });
    return provider.chatModel(req.model.modelId);
  }

  async *stream(req: ModelRequest): AsyncIterable<Result<StreamPart, ModelError>> {
    let model: LanguageModel;
    try {
      model = this.languageModel(req);
    } catch (cause) {
      yield err(fromError(cause, req.signal.aborted));
      return;
    }
    const timeoutSignal = AbortSignal.timeout(req.timeoutMs);
    const signal = AbortSignal.any([req.signal, timeoutSignal]);
    try {
      const result = streamText({
        model, messages: toModelMessages(req.messages), abortSignal: signal, maxRetries: req.retries,
        ...(req.thinking === 'unset' ? {} : { providerOptions: { openai: { reasoningEffort: req.thinking === 'max' ? 'high' : req.thinking } } }),
      });
      let usage: { input: number; output: number } | null = null;
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            yield ok<StreamPart>({ kind: 'text', delta: part.text });
            break;
          case 'reasoning-delta':
            yield ok<StreamPart>({ kind: 'reasoning', delta: part.text });
            break;
          case 'tool-call':
            yield ok<StreamPart>({ kind: 'tool-call', callId: part.toolCallId, name: part.toolName, argsDelta: JSON.stringify(part.input ?? {}) });
            break;
          case 'finish': {
            const u = part.totalUsage;
            usage = { input: u.inputTokens ?? 0, output: u.outputTokens ?? 0 };
            yield ok<StreamPart>({ kind: 'usage', usage });
            yield ok<StreamPart>({ kind: 'finish', reason: part.finishReason === 'stop' ? 'stop' : part.finishReason === 'length' ? 'length' : 'other' });
            break;
          }
          case 'error':
            yield err(fromError(part.error, req.signal.aborted));
            return;
          case 'abort':
            yield err(fromError(null, true));
            return;
          default:
            break;
        }
      }
    } catch (cause) {
      yield err(fromError(cause, req.signal.aborted || timeoutSignal.aborted));
    }
  }
}
