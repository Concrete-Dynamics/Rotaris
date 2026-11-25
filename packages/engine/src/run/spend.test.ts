import { describe, expect, it } from 'vitest';
import { BUDGET_CELLS } from '../playbooks/resolve.js';
import { widenedCell } from './spend.js';

describe('PD-ORCH-021 clause 8 — the cell clamp widened by the stop', () => {
  const tight = BUDGET_CELLS['tight']!;
  const normal = BUDGET_CELLS['normal']!;
  it('below strong budget the cell clamps as resolved', () => {
    expect(widenedCell(tight, 'tight', 'cell')).toBe(tight);
    expect(widenedCell(null, 'wide', 'cell')).toBeNull();
  });
  it('strong budget clamps one cell wider: tight as normal, normal as wide (no clamp)', () => {
    expect(widenedCell(tight, 'tight', 'one_wider')).toEqual(normal);
    expect(widenedCell(normal, 'normal', 'one_wider')).toBeNull();
  });
  it('token burner clamps nothing', () => {
    expect(widenedCell(tight, 'tight', 'wide')).toBeNull();
  });
  it('a tier outside the three keeps the cell as resolved', () => {
    expect(widenedCell(tight, 'custom', 'one_wider')).toBe(tight);
  });
});
