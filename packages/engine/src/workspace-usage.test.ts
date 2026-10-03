import { describe, expect, it } from 'vitest';
import { workspaceUsage } from './workspace-usage.js';

/** REQ-SHELL-044/045 (OQ-188's build reading): the strip's tokens and cost, over this workspace's runs. */
describe('workspaceUsage — the status strip\'s tokens and cost', () => {
  const row = (workspace_root: string, tokens_input: number, tokens_output: number, cost: string, cost_qualifier: string) => ({ workspace_root, tokens_input, tokens_output, cost, cost_qualifier });

  it('sums the workspace\'s tokens and its reported cost exactly, and nothing of another workspace', () => {
    expect(workspaceUsage([row('/w', 100, 20, '0.1', 'reported'), row('/w', 5, 5, '0.2', 'configured'), row('/other', 999, 1, '9', 'reported')], '/w'))
      .toEqual({ tokens: 130, cost: '0.3' });
  });

  it('has no cost before any session reported usage, and `0 tok` is a known value', () => {
    expect(workspaceUsage([], '/w')).toEqual({ tokens: 0, cost: null });
    expect(workspaceUsage([row('/w', 0, 0, '0', 'unknown')], '/w')).toEqual({ tokens: 0, cost: null });
    // A priced qualifier stored before the session reported any usage is not a figure yet (no `0.00 cost`).
    expect(workspaceUsage([row('/w', 0, 0, '0', 'configured')], '/w')).toEqual({ tokens: 0, cost: null });
    expect(workspaceUsage([row('/w', 0, 0, '0', 'configured'), row('/w', 3, 1, '0.5', 'reported')], '/w')).toEqual({ tokens: 4, cost: '0.5' });
  });

  it('reads `n/a` where usage was reported on unpriced models only, and the priced figure beside an unpriced one', () => {
    expect(workspaceUsage([row('/w', 10, 2, '0', 'unknown')], '/w')).toEqual({ tokens: 12, cost: 'n/a' });
    expect(workspaceUsage([row('/w', 10, 2, '0', 'unknown'), row('/w', 1, 1, '0.00001', 'incomplete')], '/w')).toEqual({ tokens: 14, cost: '0.00001' });
  });
});
