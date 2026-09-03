import type { Result } from '@rotaris/kernel';

/**
 * @rotaris/model — the model boundary is TWO ports, not one (ADR-0026).
 *
 * `ModelClient` streams one call: text deltas, reasoning parts, incremental
 * tool calls, a finish reason, a terminal usage record; image parts in
 * (REQ-CHAT-171); a dialect of `chat | responses` per model (REQ-PROVIDER-089);
 * a thinking level (REQ-PROVIDER-088; `auto` is not in the vocabulary); a
 * per-call abort signal and a per-model timeout (REQ-CONFIG-115/086); a retry
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
  readonly code: 'aborted' | 'timeout' | 'connection' | 'http' | 'validation' | 'unknown';
  readonly headline: string;
  readonly status?: number;
  /** The provider's message, cut to its first 500 characters (REQ-PROVIDER-071). */
  readonly providerMessage?: string;
  readonly retryAfterMs?: number;
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
 */
export type OutputSpec =
  | { readonly kind: 'json_schema'; readonly name: string; readonly schema: Readonly<Record<string, unknown>> }
  | { readonly kind: 'json_object' };

export interface ModelRequest {
  readonly model: ModelRef;
  readonly messages: readonly ChatMessage[];
  readonly thinking: ThinkingLevel;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly retries: number;
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
