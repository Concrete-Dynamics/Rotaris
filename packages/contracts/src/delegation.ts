/**
 * The delegation strategies and the depth steps, apart from `config.ts` so that `money-slider.ts` (PD-ORCH-021), which
 * `config.ts` reads for its snapshot, can read them without an import cycle. `config.ts` re-exports both.
 */
export const DELEGATION_STRATEGY_NAMES = ['orchestrator', 'swarm', 'single', 'lead', 'intelligent'] as const;
/** REQ-ORCH-025 with PD-ORCH-019: the override a strategy puts on a run; `orchestrator` puts none. */
export type DelegationStrategyName = (typeof DELEGATION_STRATEGY_NAMES)[number];
/**
 * PD-ORCH-019 clause 4: `runtime.max_depth` has three meanings and no more. 1: only the entry role spawns. 2: its children
 * may. 3 or more: no depth limit. The owner's word, 2026-11-24: "1 2 and 3 is unlimited".
 */
export const UNLIMITED_DEPTH_FROM = 3;
export const DEPTH_STEPS = [1, 2, UNLIMITED_DEPTH_FROM] as const;
/** Whether a configured `max_depth` is the no-limit step. */
export function isUnlimitedDepth(maxDepth: number): boolean {
  return maxDepth >= UNLIMITED_DEPTH_FROM;
}
/** The depth the run enforces for a configured `max_depth`: the value itself, or a bound no run reaches. */
export function enforcedDepth(maxDepth: number): number {
  return isUnlimitedDepth(maxDepth) ? Number.MAX_SAFE_INTEGER : maxDepth;
}
/** How a surface names a configured `max_depth` as a limit: the number, or `no limit`. */
export function depthLimitLabel(maxDepth: number): string {
  return isUnlimitedDepth(maxDepth) ? 'no limit' : String(maxDepth);
}
