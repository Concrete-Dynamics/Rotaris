import type { SessionRow, SessionRunPatch } from '@rotaris/store';
import type { CostQualifier } from '@rotaris/contracts';
import { addAmounts } from '@rotaris/kernel';
import { qualifierOf, tallyFrom, tallyRequest, type PricedUsage, type PricingTally } from './pricing.js';

/**
 * ADR-0008 "The metric aggregates are maintained, not recomputed":
 * REQ-SESSION-139 / REQ-SESSION-168 / REQ-SESSION-169 / REQ-ORCH-142.
 *
 * In-process figures, adjusted as the run goes, COPIED into every save,
 * rebuilt from the store exactly once at run start. Provider-reported totals
 * are cumulative and REPLACE, never sum (REQ-ORCH-142). Cost is a decimal
 * string (ADR-0031), the exact sum of the run's priced requests, and it is
 * persisted with the qualifier it earned (PD-MONITOR-001 revision 2).
 */
export interface AggregateFigures {
  readonly tokensInput: number;
  readonly tokensOutput: number;
  readonly cost: string;
  readonly costQualifier: CostQualifier;
  readonly toolCalls: number;
  readonly compressions: number;
}

export class Aggregates {
  private tokensInput: number;
  private tokensOutput: number;
  private cost: string;
  private tally: PricingTally;
  private toolCalls: number;
  private compressions: number;

  private constructor(f: Omit<AggregateFigures, 'costQualifier'>, tally: PricingTally) {
    this.tokensInput = f.tokensInput;
    this.tokensOutput = f.tokensOutput;
    this.cost = f.cost;
    this.tally = tally;
    this.toolCalls = f.toolCalls;
    this.compressions = f.compressions;
  }

  /**
   * REQ-SESSION-169: rehydrated from the persisted state, with the row's defaults as the fallback. The pricing tally
   * comes back from the qualifier and the token totals (`tallyFrom`), so a continuation keeps counting where the
   * previous run of the session stopped.
   */
  static rehydrate(row: Pick<SessionRow, 'tokens_input' | 'tokens_output' | 'cost' | 'cost_qualifier' | 'tool_calls' | 'compressions'> | undefined): Aggregates {
    const tokensInput = row?.tokens_input ?? 0;
    const tokensOutput = row?.tokens_output ?? 0;
    return new Aggregates({
      tokensInput, tokensOutput, cost: row?.cost ?? '0',
      toolCalls: row?.tool_calls ?? 0, compressions: row?.compressions ?? 0,
    }, tallyFrom(row?.cost_qualifier, tokensInput + tokensOutput > 0));
  }

  /**
   * OQ-8 / PD-MONITOR-001: ONE completed provider request joins the run's figures — its tokens, its cost where it
   * was priced, and its pricing into the tally the qualifier is read from. The cost is added in exact decimal
   * arithmetic (REQ-PROVIDER-121) and added rather than replaced: REQ-ORCH-142's "provider-reported totals are
   * cumulative and MUST be replaced" is about a TOTAL a provider reports for the run, and this is a figure for one
   * request — two requests are two purchases, and the run's total is their sum.
   *
   * Two readings, kept beside their replacement: the class once said "cost is zero until pricing exists", which was
   * true of every route through a rate while OQ-21 held them; revision 1 then added a reported figure only. Since
   * revision 2 a request the provider did not price is priced from configured rates before it reaches here.
   */
  addRequest(u: PricedUsage): void {
    this.tokensInput += u.input;
    this.tokensOutput += u.output;
    if (u.cost !== undefined) this.cost = addAmounts(this.cost, u.cost);
    this.tally = tallyRequest(this.tally, u);
  }

  /** PD-MONITOR-001 revision 2: the qualifier the run's requests have earned so far. */
  get costQualifier(): CostQualifier {
    return qualifierOf(this.tally);
  }

  /** REQ-ORCH-097 / REQ-SESSION-139: per-turn tool-call counters accumulate. */
  addToolCalls(n: number): void {
    this.toolCalls += n;
  }

  /**
   * REQ-SESSION-139: the compression aggregate, raised once per COMPLETED compression, wherever the
   * completion happens (`run/compression.ts`, beside the per-agent counter of REQ-MONITOR-086).
   *
   * The reason it was missing, kept beside its replacement: the figure was declared, rehydrated and copied
   * into every save from the day this class was written, and nothing ever added to it — so a run measured at
   * three `context_compressed` timeline entries persisted `compressions = 0` while the PER-AGENT counter said
   * three. Counting the timeline back at save time would have closed the gap and is refused: ADR-0008 rules
   * these figures maintained, not recomputed, and a scan per save is the cost that decision exists to remove.
   */
  addCompression(): void {
    this.compressions += 1;
  }

  get figures(): AggregateFigures {
    return { tokensInput: this.tokensInput, tokensOutput: this.tokensOutput, cost: this.cost, costQualifier: this.costQualifier, toolCalls: this.toolCalls, compressions: this.compressions };
  }
  get totalTokens(): number {
    return this.tokensInput + this.tokensOutput;
  }

  /** REQ-SESSION-168: what every persist copies. */
  patch(): SessionRunPatch {
    return { tokens_input: this.tokensInput, tokens_output: this.tokensOutput, cost: this.cost, cost_qualifier: this.costQualifier, tool_calls: this.toolCalls, compressions: this.compressions };
  }

  /** REQ-EVENTS-053: the payload of a usage.update, never empty. */
  usagePayload(): { tokens: { input: number; output: number; total: number }; cost: { total: string } } {
    return { tokens: { input: this.tokensInput, output: this.tokensOutput, total: this.totalTokens }, cost: { total: this.cost } };
  }
}
