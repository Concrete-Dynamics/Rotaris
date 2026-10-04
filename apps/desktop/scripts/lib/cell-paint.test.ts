/**
 * The cell-paint verdict against fixed numbers (REQ-GIT-109, REQ-SHELL-022): a run painted past its own cell is an
 * `overrun`, a run clipped short outside an eliding column is `cut`, and each fails in both directions. The probe that
 * feeds it runs in the renderer under `pnpm git-proof`; what this file pins is the verdict, and that the probe is a
 * single line the capture seam's step grammar cannot split.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the proof library is plain ESM beside the scripts that run it.
import { CELL_PAINT_TOLERANCE, cellPaintFindings, cellPaintProbe, cellsShortOfRow, controlsOutsideCell, runShownWhole, runShowsLeadingChars } from './cell-paint.mjs';

const run = (text: string, left: number, right: number, clipLeft: number | null = null, clipRight: number | null = null) => ({ text, left, right, clipLeft, clipRight });
const cell = (column: string, left: number, right: number, runs: ReturnType<typeof run>[]) => ({ column, left, right, runs });

// The bound worktree row as the unrepaired build painted it at 1440x900 (rounded): the State cell 504..580, `ready` reaching
// 614 under the Ahead figure; measured 504.19..580.53 and 613.84 by `pnpm git-proof` on 2026-10-04.
const unrepaired = {
  rows: [{
    key: '83af3e28',
    cells: [
      cell('Branch', 132, 435, [run('rotaris/session/83af3e28-e346', 147, 400, 147, 290)]),
      cell('State', 504, 580, [run('completed', 512, 576), run('· ready', 578, 614)]),
      cell('Ahead', 580, 640, [run('1', 588, 596)]),
    ],
  }],
};

describe('cell paint — overrun and cut (REQ-GIT-109)', () => {
  it('names the State cell\'s merge status painted under the Ahead cell, and nothing in a column that elides', () => {
    expect(CELL_PAINT_TOLERANCE).toBe(1);
    const findings = cellPaintFindings(unrepaired, { elide: ['Branch'] });
    expect(findings).toEqual([{ row: '83af3e28', column: 'State', kind: 'overrun', text: '· ready', detail: 'painted 578..614 in a cell spanning 504..580' }]);
  });

  it('holds a cell whose runs stay inside it, within the tolerance', () => {
    const fits = { rows: [{ key: 'k', cells: [cell('State', 504, 640, [run('completed', 512, 576), run('· ready', 578, 600.5)])] }] };
    expect(cellPaintFindings(fits)).toEqual([]);
    const justOver = { rows: [{ key: 'k', cells: [cell('State', 504, 600, [run('· ready', 578, 601.5)])] }] };
    expect(cellPaintFindings(justOver).map((f) => f.kind)).toEqual(['overrun']);
  });

  it('counts a run past the LEFT edge as an overrun too', () => {
    const leftward = { rows: [{ key: 'k', cells: [cell('Ahead', 580, 640, [run('12345', 570, 600)])] }] };
    expect(cellPaintFindings(leftward).map((f) => f.kind)).toEqual(['overrun']);
  });

  it('judges what is visible: a run clipped at its cell\'s edge does not paint into the next one, but is cut', () => {
    const clipped = { rows: [{ key: 'k', cells: [cell('State', 504, 580, [run('completed · merge_failed', 512, 660, 504, 580)])] }] };
    expect(cellPaintFindings(clipped)).toEqual([{ row: 'k', column: 'State', kind: 'cut', text: 'completed · merge_failed', detail: '80 px of 148 clipped' }]);
    // The same run in a column that elides by design is no finding at all.
    expect(cellPaintFindings({ rows: [{ key: 'k', cells: [{ ...clipped.rows[0]!.cells[0]!, column: 'Branch' }] }] }, { elide: ['Branch'] })).toEqual([]);
  });

  it('refuses a measurement that did not happen rather than passing it', () => {
    expect(() => cellPaintFindings(undefined)).toThrow(/no cell measurement/);
    expect(() => cellPaintFindings({ error: 'no table' })).toThrow(/no table/);
    expect(() => cellPaintFindings({ rows: [] })).toThrow(/no rows/);
  });

  it('says whether a run that may be elided is drawn whole', () => {
    expect(runShownWhole(unrepaired, '83af3e28', 'Branch', 'rotaris/session/83af3e28-e346')).toBe(false);
    expect(runShownWhole(unrepaired, '83af3e28', 'State', 'completed')).toBe(true);
    expect(runShownWhole(unrepaired, '83af3e28', 'State', 'absent')).toBe(false);
  });

  // The base row at the 1000x680 minimum as the unrepaired build painted it (`pnpm git-proof` launch 3b, 2026-10-04): `main`
  // laid out 146.9..175.7 with nothing of it visible, `base` whole, `active` wholly past the cell's edge at 201.6.
  const baseAtMinimum = {
    rows: [{
      key: 'D:/ws',
      cells: [cell('Branch', 132.9, 201.6, [run('main', 146.9, 175.7, 146.9, 146.9), run('base', 162.9, 187.5, 132.9, 201.6), run('active', 211.5, 248.4, 132.9, 201.6), run('[base]', 154.9, 195.5, 132.9, 201.6), run('[active]', 203.5, 256.4, 132.9, 201.6)])],
    }],
  };

  it('says whether an eliding run still draws its first character and the marker (the base row\'s `main`)', () => {
    expect(runShowsLeadingChars(baseAtMinimum, 'D:/ws', 'Branch', 'main')).toBe(false);
    // One character's advance is 7.2 px here: `m` and the marker need 14.4, and 14 px within the tolerance is enough.
    const elided = (right: number) => ({ rows: [{ key: 'k', cells: [cell('Branch', 132.9, 260, [run('main', 146.9, 175.7, 146.9, right)])] }] });
    expect(runShowsLeadingChars(elided(146.9 + 14.4), 'k', 'Branch', 'main')).toBe(true);
    expect(runShowsLeadingChars(elided(146.9 + 13), 'k', 'Branch', 'main')).toBe(false);
    expect(runShowsLeadingChars(elided(175.7), 'k', 'Branch', 'main')).toBe(true);
    expect(runShowsLeadingChars(elided(175.7), 'k', 'Branch', 'absent')).toBe(false);
    expect(runShowsLeadingChars(elided(146.9 + 21.6), 'k', 'Branch', 'main', 2)).toBe(true);
    expect(runShowsLeadingChars(elided(146.9 + 20), 'k', 'Branch', 'main', 2)).toBe(false);
  });

  it('names a control laid out past its cell\'s edge, which the clip hides rather than paints over the next cell', () => {
    expect(cellPaintFindings(baseAtMinimum, { elide: ['Branch'] })).toEqual([]);
    expect(controlsOutsideCell(baseAtMinimum, 'D:/ws', 'Branch')).toEqual(['[active] laid out 203.5..256.4 in a cell spanning 132.9..201.6']);
    const inside = { rows: [{ key: 'k', cells: [cell('Branch', 132.9, 260, [run('[base]', 154.9, 195.5), run('[active]', 203.5, 256.4)])] }] };
    expect(controlsOutsideCell(inside, 'k', 'Branch')).toEqual([]);
    const leftward = { rows: [{ key: 'k', cells: [cell('Branch', 132.9, 260, [run('[base]', 120, 160)])] }] };
    expect(controlsOutsideCell(leftward, 'k', 'Branch')).toHaveLength(1);
    expect(controlsOutsideCell(inside, 'k', 'Session')).toEqual([]);
  });

  it('names a cell whose box stops short of its row\'s height, and passes one that spans it', () => {
    const row = (cellTop: number, cellBottom: number) => ({ rows: [{ key: 'k', top: 300, bottom: 339, cells: [{ ...cell('Branch', 132.9, 260, []), top: cellTop, bottom: cellBottom }, { ...cell('Actions', 700, 760, []), top: 300, bottom: 339 }] }] });
    expect(cellsShortOfRow(row(305.5, 333.5))).toEqual(['k Branch 305.5..333.5 of 300..339']);
    expect(cellsShortOfRow(row(300, 339))).toEqual([]);
    expect(cellsShortOfRow(row(300.5, 338.5))).toEqual([]);
    // A measurement taken before rows carried their heights is skipped, not failed.
    expect(cellsShortOfRow(unrepaired)).toEqual([]);
  });

  it('builds a one-line probe the capture seam cannot split (no `;;`, no `>>`) that parses as an expression', () => {
    const probe = cellPaintProbe('[data-testid="git-worktrees"] table') as string;
    expect(probe).not.toMatch(/\n/u);
    expect(probe).not.toContain(';;');
    expect(probe).not.toContain('>>');
    expect(() => new Function(`return ${probe}`)).not.toThrow();
  });
});
