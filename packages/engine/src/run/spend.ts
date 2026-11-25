import type { BudgetWidening, IntentCategory, MoneyAudit, MoneyStop } from '@rotaris/contracts';
import type { ModelRef, ThinkingLevel } from '@rotaris/model';
import { BUDGET_CELLS } from '../playbooks/resolve.js';
import type { Budget } from '../children/ledger.js';
import type { PersonaResolver } from '../children/personas.js';

/**
 * PD-ORCH-021: the money slider as a run reads it. The run host resolves what a stop yields for the run's configuration
 * (`@rotaris/contracts`' `resolveMoneyStop`, laid over the files by `@rotaris/config`'s `applyMoneyResolution`) and hands the
 * run this port; the engine decides only WHEN each answer is read — the entry role's once its intent is known (clause 4),
 * each delegated agent's at its admission under the session's stop at that moment (clause 10).
 */
export interface SpendApplied {
  /** The entry role's model and level at this stop under this intent; null where the stop leaves them as configured. */
  readonly entry: { readonly model: ModelRef; readonly key?: string | undefined; readonly thinking: ThinkingLevel } | null;
  /** The personas a child delegated at this stop runs as: each role's model, its key and its level as the stop yields them. */
  readonly personas: PersonaResolver;
  /** The configured child limits at this stop (clause 3), before the cell's clamp. */
  readonly budget: Budget;
  /** Clause 8: how the resolved cell's BUDGET clamps at this stop. */
  readonly widening: BudgetWidening;
  /** Clause 7: the stop and, per lever, whether the stop moved it or the user had set it. */
  readonly audit: MoneyAudit;
}

export interface RunSpend {
  /** The stop the run started at: the session's own, else the default as the run's configuration read it. */
  readonly startStop: MoneyStop;
  /** What `stop` yields for this run under `intent` (null: a run that classifies nothing, a `lead` run). */
  readonly at: (stop: MoneyStop, intent: IntentCategory | null) => SpendApplied;
}

/** What a run's children read: the session's stop as it stands now, and the personas a stop yields under the run's intent. */
export interface ChildSpend {
  readonly stopNow: () => MoneyStop;
  readonly personasAt: (stop: MoneyStop) => PersonaResolver;
}

const WIDER: Readonly<Record<string, string>> = { tight: 'normal', normal: 'wide', wide: 'wide' };

/**
 * Clause 8 over REQ-ORCH-024: the cell's clamp one step wider at `strong_budget` (`tight` as `normal`, `normal` as `wide`) and
 * `wide` at `token_burner`; null is no clamp. The cell is named by its variant (`budgetTier`), since a clamp alone cannot say
 * which tier it was. A tier outside the three keeps the cell as resolved.
 */
export function widenedCell(cell: Budget | null, tier: string, widening: BudgetWidening): Budget | null {
  if (widening === 'cell' || cell === null) return cell;
  if (widening === 'wide') return null;
  const wider = WIDER[tier];
  return wider === undefined ? cell : BUDGET_CELLS[wider] ?? null;
}
