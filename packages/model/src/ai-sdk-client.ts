import { err, millis, ok, type Result, type TimerHandle, type Timers } from '@rotaris/kernel';
import { APICallError, jsonSchema, Output, streamText, tool, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { modelError, type ChatMessage, type ModelClient, type ModelError, type ModelRequest, type OutputSpec, type StreamPart, type ToolSpec } from './ports.js';
import { createStreamNormaliser, reasoningItemSeparator } from './reasoning.js';

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
 * - `timeoutMs` is an IDLE bound, re-armed on every part the provider streams
 *   (REQ-CONFIG-115's "model HTTP timeout"), and WHICH signal ended the call
 *   decides the error's class: the caller's abort is `aborted` and fatal, the
 *   bound is `timeout` and transient (REQ-ORCH-092). ADR-0027's fourth
 *   execution has the falsified reason.
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
  /**
   * ADR-0006's timer port, which the idle bound is re-armed from. Required, not optional: this
   * package is engine code (`rotaris/no-bare-timers`), so there is no fallback to fall back to, and
   * the one production site — `apps/desktop/src/run-host/configuration.ts` — already holds clocks.
   */
  readonly timers: Timers;
}

const SECRET_HEADER = /authorization|api-key|x-api-key|cookie/i;

export function redactHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k] = SECRET_HEADER.test(k) ? '<redacted>' : v;
  return out;
}

function parseArgs(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

/**
 * The SDK's v7 prompt refuses a system message inside `messages` ("System messages are not allowed in the prompt or
 * messages fields. Use the instructions option instead.") — found on the first real call (spike 6's live half, Part K):
 * every system message goes to `instructions`, joined by a blank line, and the rest stay messages.
 */
function splitSystem(messages: readonly ChatMessage[]): { instructions: string | undefined; rest: readonly ChatMessage[] } {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join(''));
  return { instructions: system.length > 0 ? system.join('\n\n') : undefined, rest: messages.filter((m) => m.role !== 'system') };
}

function toModelMessages(messages: readonly ChatMessage[]): ModelMessage[] {
  return messages.map((m): ModelMessage => {
    if (m.role === 'system') return { role: 'system', content: m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') };
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        content: m.content.map((p) => (p.kind === 'text' ? { type: 'text' as const, text: p.text }
          : p.kind === 'tool-call' ? { type: 'tool-call' as const, toolCallId: p.callId, toolName: p.name, input: parseArgs(p.args) }
            : { type: 'text' as const, text: '' })),
      };
    }
    if (m.role === 'tool') {
      return {
        role: 'tool',
        content: m.content.map((p) => ({ type: 'tool-result' as const, toolCallId: p.callId, toolName: p.name, output: p.isError ? { type: 'error-text' as const, value: p.result } : { type: 'text' as const, value: p.result } })),
      };
    }
    return {
      role: 'user',
      content: m.content.map((p) => (p.kind === 'text' ? { type: 'text' as const, text: p.text } : { type: 'image' as const, image: p.base64, mediaType: p.mediaType })),
    };
  });
}

/** The callable set as the SDK wants it; no `execute`, so the SDK returns the calls and the engine runs them. */
function toToolSet(specs: readonly ToolSpec[] | undefined): ToolSet | undefined {
  if (!specs || specs.length === 0) return undefined;
  const set: ToolSet = {};
  for (const s of specs) set[s.name] = tool({ description: s.description, inputSchema: jsonSchema(s.parameters as Parameters<typeof jsonSchema>[0]) });
  return set;
}

function fromError(cause: unknown, aborted: boolean): ModelError {
  if (aborted) return modelError({ code: 'aborted', headline: 'the call was aborted', transient: false });
  if (APICallError.isInstance(cause)) {
    const body = typeof cause.responseBody === 'string' ? cause.responseBody.slice(0, 500) : undefined;
    // Part Q (REQ-NOTIFY-084): the header travels in both forms — integer seconds parsed here, the raw value (an HTTP
    // date, a suffixed value) for the engine, which reads its own clock; `rate-limit-reset` forms are not read here.
    const retryAfter = cause.responseHeaders?.['retry-after'];
    const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : undefined;
    const status = cause.statusCode;
    return modelError({
      code: status === undefined ? 'connection' : 'http', headline: cause.message.slice(0, 200),
      ...(status === undefined ? {} : { status }), ...(body === undefined ? {} : { providerMessage: body }), ...(retryAfterMs === undefined ? {} : { retryAfterMs }), ...(retryAfter === undefined ? {} : { retryAfter }),
    });
  }
  const e = cause as { name?: string; message?: string; statusCode?: number };
  // The provider's message reaches the engine for every shape, so REQ-NOTIFY-091/094's text matching has something to read.
  const providerMessage = typeof e?.message === 'string' && e.message !== '' ? e.message.slice(0, 500) : undefined;
  const withMessage = providerMessage === undefined ? {} : { providerMessage };
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return modelError({ code: 'timeout', headline: e.message ?? 'the call timed out', ...withMessage });
  if (typeof e?.statusCode === 'number') return modelError({ code: 'http', status: e.statusCode, headline: (e.message ?? 'provider error').slice(0, 200), ...withMessage });
  if (e?.name === 'TypeError' && /fetch|network|ECONN|ENOTFOUND|EAI_AGAIN|TLS|certificate/i.test(e.message ?? '')) return modelError({ code: 'connection', headline: e.message ?? 'connection failed', ...withMessage });
  return modelError({ code: 'unknown', headline: String(e?.message ?? cause).slice(0, 200), transient: false, ...withMessage });
}

/**
 * REQ-ORCH-010: a rung the adapter could not send is a rung rejection, and the SDK reports one by
 * WARNING rather than by failing — the call proceeds with the schema dropped, which is indistinguishable
 * from an honoured rung to everything above. Read at the step's start so the ladder descends instead of
 * reading an answer to a question that was never asked. Both warning spellings are matched (`feature`,
 * the v4 shape, and `setting`, the v2 one), and a free-text warning by its message.
 */
export function outputDowngrade(warnings: readonly unknown[], output: OutputSpec | undefined): ModelError | null {
  if (output?.kind !== 'json_schema') return null;
  for (const w of warnings) {
    const o = (w ?? {}) as { type?: string; feature?: string; setting?: string; details?: string; message?: string };
    const subject = `${o.feature ?? o.setting ?? ''} ${o.message ?? ''} ${o.details ?? ''}`;
    if (!/response_?format|structured|schema/i.test(subject)) continue;
    const detail = (o.details ?? o.message ?? subject).replace(/\s+/g, ' ').trim();
    return modelError({ code: 'unsupported_output', headline: `the json_schema rung was not sent: ${detail}`.slice(0, 200), transient: false });
  }
  return null;
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
      const openai = createOpenAI({ baseURL: req.model.baseUrl ?? this.opts.baseUrl, apiKey: 'resolved-per-request', fetch: decorated });
      return openai.responses(req.model.modelId);
    }
    /**
     * `supportsStructuredOutputs` is what decides whether REQ-ORCH-010's first rung leaves the process.
     * Without it the SDK does not refuse the schema — it warns, replaces `response_format` with
     * `{ type: 'json_object' }` and sends the call anyway, so the strict rung reached no openai-compatible
     * endpoint on any provider while every layer above believed it had. Measured 2026-09-16 on OpenRouter,
     * session `6696f6ed`. An endpoint that cannot take the schema now says so with a 400 or a 422, which
     * `isRungRejection` already reads as "descend a rung and remember it for this model".
     */
    const provider = createOpenAICompatible({ name: req.model.providerId, baseURL: req.model.baseUrl ?? this.opts.baseUrl, includeUsage: true, supportsStructuredOutputs: true, fetch: decorated });
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
    /**
     * The bound measures SILENCE, not the length of the answer. The first implementation armed one
     * `AbortSignal.timeout(req.timeoutMs)` for the whole call, so no generation longer than
     * `model_timeout` could ever complete — the reason it gave, that REQ-CONFIG-115 fixes "the model
     * HTTP timeout", was true of the wait and silent about the answer. Measured 2026-09-12: four
     * children writing long documents were killed at 120 s with their streamed text discarded
     * (ADR-0027, fourth execution). The timer is re-armed on every part received, so a stalled
     * connection still dies at the bound and a long answer does not.
     */
    const idle = new AbortController();
    let idleExpired = false;
    const arm = (): TimerHandle => this.opts.timers.after(millis(req.timeoutMs), () => {
      idleExpired = true;
      idle.abort();
    });
    let idleTimer: TimerHandle = arm();
    const rearm = (): void => {
      idleTimer.cancel();
      idleTimer = arm();
    };
    /**
     * WHICH signal ended the call decides the class (REQ-ORCH-092): the caller's abort is the run
     * stopping and is fatal; the idle bound produced no usable answer for a reason outside the
     * request's content, so it is a timeout and `isTransient` makes it transient — the ladder then
     * retries it and falls back, where `aborted` had it discard the turn.
     */
    const endedEarly = (): ModelError => (req.signal.aborted
      ? modelError({ code: 'aborted', headline: 'the call was aborted', transient: false })
      : modelError({ code: 'timeout', headline: `no stream activity for ${req.timeoutMs} ms` }));
    const signal = AbortSignal.any([req.signal, idle.signal]);
    try {
      const tools = toToolSet(req.tools);
      // REQ-ORCH-010: the structured-output rungs map to the SDK's `output`; a provider rejection surfaces as an error part.
      const output = req.output === undefined ? undefined : req.output.kind === 'json_schema' ? Output.object({ schema: jsonSchema(req.output.schema as Parameters<typeof jsonSchema>[0]) }) : Output.json();
      const { instructions, rest } = splitSystem(req.messages);
      const result = streamText({
        model, messages: toModelMessages(rest), ...(instructions === undefined ? {} : { instructions }), abortSignal: signal, maxRetries: req.retries, ...(tools ? { tools } : {}), ...(output ? { output } : {}),
        ...(req.thinking === 'unset' ? {} : { providerOptions: { openai: { reasoningEffort: req.thinking === 'max' ? 'high' : req.thinking } } }),
      });
      let usage: { input: number; output: number } | null = null;
      // REQ-CHAT-163: every text and reasoning part passes through the normaliser, which is where the three shapes
      // deliberation arrives in are recognised and where whitespace-only deltas are preserved exactly as received.
      const normalise = createStreamNormaliser();
      let reasoningItem: string | null = null;
      for await (const part of result.fullStream) {
        // Every part, of every kind — a reasoning delta and a tool-call argument are activity too.
        rearm();
        switch (part.type) {
          case 'text-delta':
            // Shape (b): a thinking block inside the content is routed to the reasoning channel here, never below.
            for (const out of normalise.accept({ kind: 'text', delta: part.text })) yield ok<StreamPart>(out);
            break;
          case 'reasoning-delta': {
            // Shape (a), and shape (c)'s item boundary: a new reasoning id is a new item, separated by a blank line.
            const id = (part as { id?: string }).id ?? null;
            const separator = reasoningItemSeparator(reasoningItem, id);
            reasoningItem = id;
            if (separator !== '') yield ok<StreamPart>({ kind: 'reasoning', delta: separator });
            for (const out of normalise.accept({ kind: 'reasoning', delta: part.text })) yield ok<StreamPart>(out);
            break;
          }
          case 'start-step': {
            // The only place the adapter learns the request was altered on its way out (REQ-ORCH-010).
            const downgraded = outputDowngrade(part.warnings ?? [], req.output);
            if (downgraded !== null) {
              yield err(downgraded);
              return;
            }
            break;
          }
          case 'tool-call':
            yield ok<StreamPart>({ kind: 'tool-call', callId: part.toolCallId, name: part.toolName, argsDelta: JSON.stringify(part.input ?? {}) });
            break;
          case 'finish': {
            // Anything the normaliser held back because it might have been the start of a tag is emitted before the
            // finish, so the finished message equals the concatenation of the deltas received (REQ-CHAT-157).
            for (const out of normalise.flush()) yield ok<StreamPart>(out);
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
            // The SDK reports the COMBINED signal firing and cannot say which half did; this can.
            yield err(endedEarly());
            return;
          default:
            break;
        }
      }
    } catch (cause) {
      // The same distinction on the thrown path, where `req.signal.aborted || timeoutSignal.aborted`
      // had collapsed both signals into the one `aborted` flag and reported a timeout as an abort too.
      yield err(req.signal.aborted || idleExpired ? endedEarly() : fromError(cause, false));
    } finally {
      // Including the path where the consumer walks away from the generator: the timer never outlives the call.
      idleTimer.cancel();
    }
  }
}
