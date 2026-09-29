import type { z } from 'zod';
import type { MonotonicClock, WallClock } from '@rotaris/kernel';

/**
 * What a built-in tool is to the gate: a name, a description the prompt lists, a zod schema the gate
 * validates the (repaired) payload against, and an `execute` that returns an Observation and never
 * throws for an ordinary failure. Observations carry the model-visible text and, separately, what is
 * for the record and the surfaces only (REQ-TOOLS-135's diff is excluded from model-visible content).
 */
export interface Observation {
  /** Model-visible text. */
  readonly text: string;
  readonly isError: boolean;
  /** For the evidence record (REQ-SESSION-136) and the row. */
  readonly outcomeKind?: string;
  readonly exitCode?: number | null;
  readonly failureKind?: string | null;
  readonly warnings?: readonly string[];
  /** REQ-CHAT-050: a structured diff for the user-only row, never for the model. */
  readonly diff?: string;
  /** A one-line rendering of the call for the tool row's header (`▸ toolname args`). */
  readonly label?: string;
  /**
   * PD-ORCH-005 clause 9: the call waited on a person and the run's rest withdrew it (`ask_questions`), naming the
   * interruption. The gate records the withdrawal and settles the call as never run.
   */
  readonly withdrawnBy?: string;
}

export interface ToolContext {
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly agentName: string;
  readonly persona: string;
  readonly monotonic: MonotonicClock;
  readonly wall: WallClock;
  readonly signal: AbortSignal;
  readonly warn: (message: string) => void;
}

export interface ToolExecutor<A = unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType<A>;
  /** Product-specific diagnostics for schema refusal, before permissions or execution. */
  validationError?(args: Readonly<Record<string, unknown>>, detail: string): Observation;
  execute(args: A, ctx: ToolContext): Promise<Observation>;
  /** REQ-TOOLS-105 etc.: how the call renders in a row header; defaults to the sorted argument keys. */
  label?(args: A): string;
  /** ADR-0034 (Part S): a tool outside the registry hands the model the server's own input schema; absent means the zod schema's JSON form. */
  readonly parameters?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * PD-ORCH-005: the failure kind of an observation the run's rest cut short — a question withdrawn, a wait on children
 * released by the pause. The gate carries it through to the run host's port, which marks the result interrupted, and
 * the turn records the call as interrupted and never re-run.
 */
export const INTERRUPTED_FAILURE_KIND = 'interrupted';

export function observation(text: string, extra: Omit<Observation, 'text' | 'isError'> & { isError?: boolean } = {}): Observation {
  return { text, isError: extra.isError ?? false, ...extra };
}

export function errorObservation(text: string, extra: Omit<Observation, 'text' | 'isError'> = {}): Observation {
  return { text, isError: true, ...extra };
}
