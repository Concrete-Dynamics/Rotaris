import type { IntentCategory, ModelTier, PlaybookCatalogue, PlaybookSlot } from '@rotaris/contracts';
import type { PlaybookOverrides } from '@rotaris/config';
import type { Budget } from '../children/ledger.js';
import { CATALOGUE } from './catalogue.js';
import { applyOverrides, BUILT_IN_ROWS, lookupRow, renderPlaybook, resolveCell, workerRoleFor, type Row } from './matrix.js';

/**
 * REQ-ORCH-019/022/024/027: the cells in force for a run, per role, rendered into the text each role's
 * instructions carry, with the coordinator keyed on the worker role's tier, and the BUDGET slot turned
 * into the clamp that narrows the configured child policy. What is recorded in the launch audit is the
 * row key and the variant per slot, so which row was in force is verifiable after the run.
 */
export const BUDGET_CELLS: Readonly<Record<string, Budget | null>> = Object.freeze({
  tight: { maxActive: 2, maxTotal: 6, maxDepth: 2 },
  normal: { maxActive: 4, maxTotal: 12, maxDepth: 3 },
  wide: null,
});

export interface ResolvedPlaybook {
  readonly row: string;
  readonly cell: Readonly<Record<PlaybookSlot, string>>;
  readonly text: string;
}

export interface ResolvedPlaybooks {
  readonly intent: IntentCategory;
  readonly tier: ModelTier | null;
  readonly workerRole: string;
  /** Per role; null where the role has no row (REQ-ORCH-023: no playbook at all). */
  readonly perRole: Readonly<Record<string, ResolvedPlaybook | null>>;
  /** REQ-ORCH-024: the entry role's BUDGET cell as a clamp; null = wide, no clamp. */
  readonly budgetCell: Budget | null;
  readonly budgetTier: string;
  readonly warnings: readonly string[];
}

export interface ResolveInput {
  readonly intent: IntentCategory;
  /** The one model every role runs on today; null = undetermined (REQ-ORCH-023). */
  readonly tier: ModelTier | null;
  readonly roles: readonly string[];
  readonly entryRole: string;
  readonly overrides?: PlaybookOverrides;
  readonly rows?: readonly Row[];
}

export function resolvePlaybooks(input: ResolveInput): ResolvedPlaybooks {
  const warnings: string[] = [];
  const catalogue: PlaybookCatalogue = input.overrides ? applyOverrides(CATALOGUE, input.overrides, (m) => warnings.push(m)) : CATALOGUE;
  const rows = input.rows ?? BUILT_IN_ROWS;
  const workerRole = workerRoleFor(input.intent);
  const workerRow = lookupRow(rows, workerRole, input.intent, input.tier);
  const workerCell = workerRow ? resolveCell(workerRow.cell) : null;
  const perRole: Record<string, ResolvedPlaybook | null> = {};
  for (const role of input.roles) {
    // REQ-ORCH-022: the coordinator's row is keyed on the worker role's tier — the same model today, so the same tier.
    const r = lookupRow(rows, role, input.intent, input.tier);
    if (!r) { perRole[role] = null; continue; }
    const cell = resolveCell(r.cell);
    const rendered = renderPlaybook({ role, cell, tier: input.tier, catalogue, consumer: workerCell ? { role: workerRole, tier: input.tier, cell: workerCell } : null });
    perRole[role] = { row: `${r.role}:${r.intent}:${r.tier}`, cell: rendered.cell, text: rendered.text };
  }
  const entry = perRole[input.entryRole];
  const budgetTier = entry?.cell.BUDGET ?? 'normal';
  const budgetCell = budgetTier in BUDGET_CELLS ? BUDGET_CELLS[budgetTier]! : null;
  if (!(budgetTier in BUDGET_CELLS)) warnings.push(`the BUDGET variant '${budgetTier}' is not a budget tier; the configured child policy stands unchanged (REQ-ORCH-024)`);
  return { intent: input.intent, tier: input.tier, workerRole, perRole, budgetCell, budgetTier, warnings };
}
