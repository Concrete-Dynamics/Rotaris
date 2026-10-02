import { addAmounts } from '@rotaris/kernel';
import type { SessionRow } from '@rotaris/store';

/**
 * REQ-SHELL-044/045: what the status strip's tokens and cost items read — the running total of tokens this workspace's
 * runs used (OQ-188's build reading: the workspace's runs, as REQ-SHELL-045's cost is), and the provider-reported cost of
 * those runs so far. The cost is `null` until a session has reported usage (REQ-SHELL-045: "No cost item is present until
 * at least one session has reported usage and a cost figure exists for it"); then the exact sum of the figures the
 * sessions recorded (ADR-0031, summed by the money module), or `n/a` where every session that reported usage ran on a
 * model with no published pricing (its cost qualifier `unknown`, REQ-MONITOR-166). Read from the sessions' own records,
 * the columns every run's aggregates write (`tokens_input`, `tokens_output`, `cost`, `cost_qualifier`).
 */
export interface WorkspaceUsage {
  readonly tokens: number;
  readonly cost: string | null;
}

export function workspaceUsage(rows: readonly Pick<SessionRow, 'workspace_root' | 'tokens_input' | 'tokens_output' | 'cost' | 'cost_qualifier'>[], workspaceRoot: string): WorkspaceUsage {
  let tokens = 0;
  let used = false;
  let priced = false;
  let cost = '0';
  for (const row of rows) {
    if (row.workspace_root !== workspaceRoot) continue;
    const spent = row.tokens_input + row.tokens_output;
    tokens += spent;
    if (spent > 0) used = true;
    if (row.cost_qualifier !== '' && row.cost_qualifier !== 'unknown') {
      priced = true;
      cost = addAmounts(cost, row.cost);
    }
  }
  return { tokens, cost: priced ? cost : used ? 'n/a' : null };
}
