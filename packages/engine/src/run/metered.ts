import type { AgentBackend, ModelRef, Usage } from '@rotaris/model';

/**
 * REQ-EVENTS-053, PD-MONITOR-001: one completed provider request made on the run's behalf, with the model it was
 * sent to, so the run prices it at that model's rates and counts it exactly once (`Run.countUsage`).
 */
export type CountUsage = (usage: Usage, model: ModelRef) => void;

/**
 * The backend for the run's model calls that belong to no agent's turn: compression, the child-report summariser,
 * the intent classifier and the loop supervisor's classifier. An agent's own requests are counted by its turn
 * (`turn.ts` and the ladder), so only these callers are handed a metered backend, and none of them needs to know.
 *
 * Every request that completed is counted, a failed one included, because the provider reported that usage as
 * spent. A call that throws completed no request and reports nothing.
 */
export function meteredBackend(backend: AgentBackend, count: CountUsage): AgentBackend {
  return {
    ownsTheLoop: backend.ownsTheLoop,
    async runTurn(input, sink, signal) {
      const report = await backend.runTurn(input, sink, signal);
      count(report.usage, input.model);
      return report;
    },
  };
}
