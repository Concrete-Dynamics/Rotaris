import type { SessionRow, SessionRunPatch } from '@rotaris/store';

/**
 * ADR-0008 "The metric aggregates are maintained, not recomputed":
 * REQ-SESSION-139 / REQ-SESSION-168 / REQ-SESSION-169 / REQ-ORCH-142.
 *
 * In-process figures, adjusted as the run goes, COPIED into every save,
 * rebuilt from the store exactly once at run start. Provider-reported totals
 * are cumulative and REPLACE, never sum (REQ-ORCH-142). Cost is a decimal
 * string (ADR-0031) and is zero until pricing exists.
 */
export interface AggregateFigures {
  readonly tokensInput: number;
  readonly tokensOutput: number;
  readonly cost: string;
  readonly toolCalls: number;
  readonly compressions: number;
}

export class Aggregates {
  private tokensInput: number;
  private tokensOutput: number;
  private cost: string;
  private toolCalls: number;
  private compressions: number;

  private constructor(f: AggregateFigures) {
    this.tokensInput = f.tokensInput;
    this.tokensOutput = f.tokensOutput;
    this.cost = f.cost;
    this.toolCalls = f.toolCalls;
    this.compressions = f.compressions;
  }

  /** REQ-SESSION-169: rehydrated from the persisted state, with the row's defaults as the fallback. */
  static rehydrate(row: Pick<SessionRow, 'tokens_input' | 'tokens_output' | 'cost' | 'tool_calls' | 'compressions'> | undefined): Aggregates {
    return new Aggregates({
      tokensInput: row?.tokens_input ?? 0, tokensOutput: row?.tokens_output ?? 0, cost: row?.cost ?? '0',
      toolCalls: row?.tool_calls ?? 0, compressions: row?.compressions ?? 0,
    });
  }

  /** A turn's cumulative figures for THIS turn are added to the run's running totals. */
  addTurnUsage(u: { input: number; output: number }): void {
    this.tokensInput += u.input;
    this.tokensOutput += u.output;
  }

  /** REQ-ORCH-097 / REQ-SESSION-139: per-turn tool-call counters accumulate. */
  addToolCalls(n: number): void {
    this.toolCalls += n;
  }

  get figures(): AggregateFigures {
    return { tokensInput: this.tokensInput, tokensOutput: this.tokensOutput, cost: this.cost, toolCalls: this.toolCalls, compressions: this.compressions };
  }
  get totalTokens(): number {
    return this.tokensInput + this.tokensOutput;
  }

  /** REQ-SESSION-168: what every persist copies. */
  patch(): SessionRunPatch {
    return { tokens_input: this.tokensInput, tokens_output: this.tokensOutput, cost: this.cost, tool_calls: this.toolCalls, compressions: this.compressions };
  }

  /** REQ-EVENTS-053: the payload of a usage.update, never empty. */
  usagePayload(): { tokens: { input: number; output: number; total: number }; cost: { total: string } } {
    return { tokens: { input: this.tokensInput, output: this.tokensOutput, total: this.totalTokens }, cost: { total: this.cost } };
  }
}
