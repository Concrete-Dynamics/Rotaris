import type { Result } from '@rotaris/kernel';

/**
 * @rotaris/model — the model boundary is TWO ports, not one (ADR-0026).
 *
 * `ModelClient` streams one call: text deltas, reasoning parts, incremental
 * tool calls, a finish reason, a terminal usage record; image parts in
 * (REQ-CHAT-171); a dialect of `chat | responses` per model (REQ-PROVIDER-089);
 * a thinking level (REQ-PROVIDER-088; `auto` is not in the vocabulary); a
 * per-call abort signal and a per-model IDLE timeout (REQ-CONFIG-115/086); a retry
 * count (REQ-PROVIDER-089, default 5); an error preserving the HTTP status
 * and the provider's own message (REQ-ORCH-091/092, REQ-PROVIDER-098); a
 * credential resolver invoked INSIDE the request path (REQ-PROVIDER-092).
 *
 * `AgentBackend` owns a turn and exposes the ability NOT to drive the loop
 * (REQ-ORCH-146). The default backend runs over `ModelClient`; a provider
 * whose native loop owns the turn is a second backend (OQ-17 undecided).
 *
 * No SDK type crosses either port (ADR-0027). Cost is never computed here
 * (REQ-PROVIDER-121, ADR-0031).
 */
export type Dialect = 'chat' | 'responses';
export type ThinkingLevel = 'low' | 'medium' | 'high' | 'max' | 'unset';

export interface ModelRef {
  readonly providerId: string;
  readonly modelId: string;
  readonly dialect: Dialect;
  /** The entry's own endpoint (REQ-CONFIG-084 `base_url`); absent means the client's base URL. */
  readonly baseUrl?: string | undefined;
  /** REQ-PROVIDER-149: the selected model's explicit image-input declaration. */
  readonly acceptsImageInput?: boolean | undefined;
}

export type ContentPart =
  | { readonly kind: 'text'; readonly text: string }
  /** REQ-CHAT-171 / REQ-PROVIDER-149: an image part, base64 with its media type. */
  | { readonly kind: 'image'; readonly mediaType: string; readonly base64: string };

/** A tool the model may call: name, description, JSON-schema parameters — the ONE resolution's listing (REQ-TOOLS-010). */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

/** A tool call the model requested in a step; `args` is the raw JSON text as produced (repaired by the gate, REQ-TOOLS-032). */
export interface ToolCallRequest {
  readonly callId: string;
  readonly name: string;
  readonly args: string;
}

export type AssistantPart =
  | ContentPart
  | { readonly kind: 'tool-call'; readonly callId: string; readonly name: string; readonly args: string };

export type ToolResultPart = { readonly kind: 'tool-result'; readonly callId: string; readonly name: string; readonly result: string; readonly isError: boolean };

export type ChatMessage =
  | { readonly role: 'system' | 'user'; readonly content: readonly ContentPart[] }
  | { readonly role: 'assistant'; readonly content: readonly AssistantPart[] }
  | { readonly role: 'tool'; readonly content: readonly ToolResultPart[] };

export interface Usage {
  readonly input: number;
  readonly output: number;
  /**
   * PD-MONITOR-001: the cost of THIS request as the provider itself reported it, a decimal string,
   * present only when the provider answered with one. It is never computed here: the product asks
   * the endpoints whose protocol defines the field, carries what comes back, and adds figures to
   * each other and to nothing else (REQ-PROVIDER-121 — no amount is computed in binary floating
   * point). A provider that reports none leaves this absent, which is not the same as zero.
   */
  readonly cost?: string;
}

export type FinishReason = 'stop' | 'length' | 'other';

export type StreamPart =
  | { readonly kind: 'text'; readonly delta: string }
  | { readonly kind: 'reasoning'; readonly delta: string }
  | { readonly kind: 'tool-call'; readonly callId: string; readonly name: string; readonly argsDelta: string }
  | { readonly kind: 'finish'; readonly reason: FinishReason }
  /** The provider's own figures (REQ-MONITOR-081 prefers them over an estimate). */
  | { readonly kind: 'usage'; readonly usage: Usage };

/**
 * REQ-ORCH-092's classes, decided where the status and the cause are known and carried as a fact,
 * so the loop never pattern-matches on prose. `transient`: no usable answer for a reason outside
 * the request's content, expected to differ on repetition.
 */
export interface ModelError {
  /**
   * `unsupported_output` is the one code no provider produces: the adapter saw the SDK drop the
   * structured-output rung it was given rather than send it (REQ-ORCH-010). It falls into neither of
   * REQ-ORCH-092's two classes, as an unsupported request always has, so it fails a turn at once; the
   * ladder is the recovery that applies to it, and `isRungRejection` is where that is read.
   */
  readonly code: 'aborted' | 'timeout' | 'connection' | 'http' | 'validation' | 'unsupported_output' | 'unknown';
  readonly headline: string;
  readonly status?: number;
  /** The provider's message, cut to its first 500 characters (REQ-PROVIDER-071). */
  readonly providerMessage?: string;
  /** The `retry-after` header as integer seconds, when it was one (Part Q: the engine reads the raw form too). */
  readonly retryAfterMs?: number;
  /** The `retry-after` header verbatim — an HTTP date or a suffixed value the engine parses against its clock (REQ-NOTIFY-084). */
  readonly retryAfter?: string;
  readonly transient: boolean;
}

export const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([408, 425, 500, 502, 503, 504]);

export function isTransient(code: ModelError['code'], status?: number): boolean {
  if (code === 'connection' || code === 'timeout') return true;
  if (code === 'http' && status !== undefined) return TRANSIENT_STATUSES.has(status);
  return false;
}

export function modelError(fields: Omit<ModelError, 'transient'> & { readonly transient?: boolean }): ModelError {
  return { ...fields, transient: fields.transient ?? isTransient(fields.code, fields.status) };
}

/**
 * REQ-ORCH-010's rungs as the port sees them: a strict JSON schema, or JSON-object mode; absent means
 * ordinary text. A provider that rejects the rung fails the request with an HTTP error the caller reads.
 *
 * That sentence was the whole story only while the request was believed to leave as written. It does not
 * have to: an SDK that cannot carry the rung downgrades it and warns, and the adapter turns that warning
 * into `unsupported_output` so the caller reads a rejection either way.
 */
export type OutputSpec =
  | { readonly kind: 'json_schema'; readonly name: string; readonly schema: Readonly<Record<string, unknown>> }
  | { readonly kind: 'json_object' };

/**
 * OQ-110 (ruled 2026-09-29, R-067): one retry the DISPATCH LAYER absorbed. REQ-CONFIG-086's `num_retries` are spent
 * inside the model client, before the resilience ladder (REQ-ORCH-091/092) sees any failure, and the ladder takes over
 * only once they are exhausted. A retry absorbed there is invisible to everything above the client, so the client reports
 * each one as it sends it, with what the attempt before it met and how long it waited, and the turn writes it to the
 * session log (REQ-SESSION-142). The first live run's finding L3: a 429 and a 500 absorbed this way left no trace.
 */
export interface DispatchRetry {
  /** Which retry this is, from 1. */
  readonly attempt: number;
  /** The request's `retries` — how many the dispatch layer may absorb. */
  readonly of: number;
  /** The HTTP status the attempt before it met; null when it met no response (a connection failure). */
  readonly status: number | null;
  /** The connection failure's message, cut to 200 characters, when `status` is null. */
  readonly failure?: string | undefined;
  /** How long the dispatch layer waited between that failure and this retry, in ms, on the monotonic clock. */
  readonly delayMs: number;
}

export interface ModelRequest {
  readonly model: ModelRef;
  readonly messages: readonly ChatMessage[];
  readonly thinking: ThinkingLevel;
  readonly signal: AbortSignal;
  /**
   * REQ-CONFIG-115's model HTTP timeout (REQ-CONFIG-086 per model), as an **idle** bound: the longest
   * the call may go without a part arriving, re-armed on each one. It is not a cap on how long an
   * answer may take — read as one, it made every generation longer than `model_timeout` impossible
   * (ADR-0027, fourth execution). Its expiry is a `timeout`, which is transient; only the caller's
   * `signal` produces `aborted`, which is fatal (REQ-ORCH-092).
   */
  readonly timeoutMs: number;
  /** REQ-CONFIG-086's `num_retries` (REQ-PROVIDER-089: unset means 5) — the dispatch layer's own, spent before the caller sees a failure. */
  readonly retries: number;
  /** OQ-110: told of each retry the dispatch layer absorbs, as it is sent; absent means nobody is listening. */
  readonly onRetry?: ((retry: DispatchRetry) => void) | undefined;
  /** Invoked inside the request path, per request (REQ-PROVIDER-092). */
  readonly resolveCredential: () => Promise<string>;
  readonly headers?: Readonly<Record<string, string>>;
  /** The callable set; absent or empty means the model is offered no tool. */
  readonly tools?: readonly ToolSpec[];
  /** Structured output for the call; absent means text. */
  readonly output?: OutputSpec;
}

export interface ModelClient {
  stream(req: ModelRequest): AsyncIterable<Result<StreamPart, ModelError>>;
}

/**
 * One STEP as the loop hands it to a backend: one model call over the conversation so far. The engine
 * owns the tool loop (REQ-ORCH-146's non-native case, REQ-TOOLS-180): it dispatches the step's tool
 * calls, appends their results, and steps again until a step requests none.
 */
export interface TurnInput {
  readonly persona: string;
  readonly systemPrompt: string;
  readonly messages: readonly ChatMessage[];
  readonly tools: readonly ToolSpec[];
  readonly model: ModelRef;
  readonly thinking: ThinkingLevel;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly resolveCredential: () => Promise<string>;
  readonly output?: OutputSpec;
}

export interface TurnSink {
  delta(text: string): void;
  reasoning(text: string): void;
  usage(u: Usage): void;
  /** REQ-ORCH-090: the FIRST part of any kind the provider streamed — the unresponsive-model timer disarms on it. */
  started?(): void;
  /** OQ-110: a retry the dispatch layer absorbed inside this step's call (`ModelRequest.onRetry`). */
  retried?(retry: DispatchRetry): void;
  /**
   * REQ-ORCH-089: EVERY part the provider streamed, by its kind, `error` for an error it answered with — the stall
   * watch's "model event or token". Called before the part's own callback.
   */
  event?(kind: StreamPart['kind'] | 'error'): void;
}

export type TurnReport =
  | { readonly status: 'succeeded'; readonly text: string; readonly usage: Usage; readonly toolCalls?: readonly ToolCallRequest[] }
  /** The model stopped before it was done (a length stop): the task is returned to pending (REQ-ORCH-074). */
  | { readonly status: 'partial'; readonly text: string; readonly usage: Usage; readonly toolCalls?: readonly ToolCallRequest[] }
  | { readonly status: 'failed'; readonly text: string; readonly usage: Usage; readonly error: ModelError; readonly toolCalls?: readonly ToolCallRequest[] };

export interface AgentBackend {
  /** True where the provider drives its own loop and the engine must not (REQ-ORCH-146). */
  readonly ownsTheLoop: boolean;
  runTurn(input: TurnInput, sink: TurnSink, signal: AbortSignal): Promise<TurnReport>;
}
