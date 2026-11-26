import type { DelegationStrategyName } from '@rotaris/contracts';

/** PD-ORCH-019 clause 10: the composer's names for the four strategies, and what each does in a few words. */
export const STRATEGY_LABELS: Readonly<Record<DelegationStrategyName, string>> = { orchestrator: 'Orchestrator', swarm: 'Swarm', single: 'Single', lead: 'Lead', intelligent: 'Intelligent' };
export const STRATEGY_HINTS: Readonly<Record<DelegationStrategyName, string>> = {
  orchestrator: 'coordinates specialists', swarm: 'delegates as widely as it can', single: 'one agent, no delegation', lead: 'one agent, delegates and scripts workflows',
  intelligent: 'picks Lead, Single or Orchestrator for each request',
};
