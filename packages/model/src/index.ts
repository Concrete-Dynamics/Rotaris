import type { Result, Failure } from '@rotaris/kernel';

/**
 * @rotaris/model — the model boundary is TWO ports, not one (ADR-0026).
 *
 * `ModelClient` streams one call: text deltas, reasoning parts, incremental
 * tool calls, a terminal usage record; image parts in; a dialect of
 * `chat | responses` per model (REQ-PROVIDER-089); a thinking level
 * (REQ-PROVIDER-088); a per-call abort signal; a retry count; an error that
 * preserves the HTTP status and the provider's own message; a credential
 * resolver invoked inside the request path (REQ-PROVIDER-092).
 *
 * `AgentBackend` exposes the ability NOT to drive the loop (REQ-ORCH-146):
 * a provider whose native agentic loop owns the turn.
 *
 * The AI SDK sits behind `ModelClient` and no SDK type crosses the port
 * (ADR-0027). The skeleton fixes the port shapes; the adapter lands with the
 * first run.
 */
export type Dialect = 'chat' | 'responses';
export type ThinkingLevel = 'low' | 'medium' | 'high' | 'max' | 'unset';

export interface ModelRef {
  readonly providerId: string;
  readonly modelId: string;
  readonly dialect: Dialect;
}

export type StreamPart =
  | { readonly kind: 'text'; readonly delta: string }
  | { readonly kind: 'reasoning'; readonly delta: string }
  | { readonly kind: 'tool-call'; readonly callId: string; readonly name: string; readonly argsDelta: string }
  | { readonly kind: 'usage'; readonly input: number; readonly output: number };

export interface ModelError extends Failure {
  readonly status?: number;
  readonly providerMessage?: string;
  readonly retryAfterMs?: number;
}

export interface ModelRequest {
  readonly model: ModelRef;
  readonly messages: readonly unknown[];
  readonly thinking: ThinkingLevel;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly resolveCredential: () => Promise<string>;
}

export interface ModelClient {
  stream(req: ModelRequest): AsyncIterable<Result<StreamPart, ModelError>>;
}

export interface AgentBackend {
  /** True where the provider drives its own loop and the engine must not (REQ-ORCH-146). */
  readonly ownsTheLoop: boolean;
}
