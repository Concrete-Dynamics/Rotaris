import { describe, expect, it } from 'vitest';
import { PLAYBOOK_SLOTS } from '@rotaris/contracts';
import { CATALOGUE } from './catalogue.js';
import { applyOverrides, BUILT_IN_ROWS, lookupRow, renderPlaybook, resolveCell, workerRoleFor } from './matrix.js';
import { BUDGET_CELLS, resolvePlaybooks } from './resolve.js';

describe('REQ-ORCH-019..027 the playbook matrix', () => {
  it('REQ-ORCH-021: lookup is concrete intent → group → default, then tier → any; a role with no row has no playbook', () => {
    expect(lookupRow(BUILT_IN_ROWS, 'refactorer', 'refactor', 'medium')?.intent).toBe('fix');
    expect(lookupRow(BUILT_IN_ROWS, 'refactorer', 'question', 'medium')?.intent).toBe('default');
    expect(lookupRow(BUILT_IN_ROWS, 'coding-agent', 'small_feature', 'large')?.tier).toBe('large');
    expect(lookupRow(BUILT_IN_ROWS, 'coding-agent', 'small_feature', null)?.tier).toBe('medium');
    expect(lookupRow(BUILT_IN_ROWS, 'orchestrator', 'whole_project', 'small')?.intent).toBe('large-build');
    expect(lookupRow(BUILT_IN_ROWS, 'nobody', 'question', 'small')).toBeNull();
    expect(lookupRow(BUILT_IN_ROWS, 'tester', 'question', 'small')?.cell).toEqual({ notRouted: true });
  });
  it('REQ-ORCH-020/023: every render carries all eight slots exactly once in order; the undetermined header; the not-routed text', () => {
    const cell = resolveCell(lookupRow(BUILT_IN_ROWS, 'orchestrator', 'moderate_feature', 'medium')!.cell);
    expect(Object.keys(cell)).toEqual([...PLAYBOOK_SLOTS]);
    const r = renderPlaybook({ role: 'orchestrator', cell, tier: 'medium', catalogue: CATALOGUE });
    const lines = r.text.split('\n');
    expect(lines[0]).toBe('PLAYBOOK');
    expect(lines.slice(1).map((l) => l.split(':')[0])).toEqual([...PLAYBOOK_SLOTS]);
    for (const s of PLAYBOOK_SLOTS) expect(r.text.split(`${s}:`).length).toBe(2);
    const u = renderPlaybook({ role: 'orchestrator', cell, tier: null, catalogue: CATALOGUE });
    expect(u.text.split('\n')[1]).toMatch(/model size undetermined/);
    const nr = renderPlaybook({ role: 'tester', cell: resolveCell({ notRouted: true }), tier: 'small', catalogue: CATALOGUE });
    expect(nr.text).toContain('ROUTE: Your assignment is outside the standard flow');
  });
  it('REQ-ORCH-020/022: planner and architect take CHUNKING and OUTPUT from the worker tier only when it is lower; never upward; nobody else', () => {
    const producer = resolveCell(lookupRow(BUILT_IN_ROWS, 'planner', 'small_feature', 'large')!.cell);
    const worker = resolveCell(lookupRow(BUILT_IN_ROWS, 'coding-agent', 'small_feature', 'small')!.cell);
    const down = renderPlaybook({ role: 'planner', cell: producer, tier: 'large', catalogue: CATALOGUE, consumer: { role: 'coding-agent', tier: 'small', cell: worker } });
    expect(down.cell.CHUNKING).toBe('single');
    expect(down.cell.OUTPUT).toBe('report');
    expect(down.cell.RESEARCH).toBe('thorough');
    const up = renderPlaybook({ role: 'planner', cell: producer, tier: 'small', catalogue: CATALOGUE, consumer: { role: 'coding-agent', tier: 'large', cell: resolveCell(lookupRow(BUILT_IN_ROWS, 'coding-agent', 'small_feature', 'large')!.cell) } });
    expect(up.cell.CHUNKING).toBe('milestones');
    expect(up.cell.OUTPUT).toBe('plan');
    const other = renderPlaybook({ role: 'orchestrator', cell: producer, tier: 'large', catalogue: CATALOGUE, consumer: { role: 'coding-agent', tier: 'small', cell: worker } });
    expect(other.cell).toEqual(producer);
    expect(workerRoleFor('refactor')).toBe('refactorer');
    expect(workerRoleFor('requirements')).toBe('requirements-engineer');
    expect(workerRoleFor('architectural')).toBe('architect');
    expect(workerRoleFor('question')).toBe('coding-agent');
  });
  it('REQ-ORCH-026: overrides re-word a variant; an unknown slot or variant is ignored with a warning naming it', () => {
    const warnings: string[] = [];
    const c = applyOverrides(CATALOGUE, { VERIFY: { prove: 'PROVE IT.', bogus: 'x' }, NOPE: { a: 'b' } }, (m) => warnings.push(m));
    expect(c.VERIFY!['prove']).toBe('PROVE IT.');
    expect(c.VERIFY!['none']).toBe(CATALOGUE.VERIFY!['none']);
    expect(warnings).toEqual([
      "playbook override names variant 'VERIFY.bogus', which the catalogue does not define; ignored (REQ-ORCH-026)",
      "playbook override names slot 'NOPE', which the catalogue does not define; ignored (REQ-ORCH-026)",
    ]);
    expect(CATALOGUE.VERIFY!['prove']).not.toBe('PROVE IT.');
  });
  it('REQ-ORCH-024/027: the resolved set names the row per role, the BUDGET cell clamps, wide is no clamp', () => {
    const r = resolvePlaybooks({ intent: 'whole_project', tier: 'medium', roles: ['orchestrator', 'coding-agent', 'nobody'], entryRole: 'orchestrator' });
    expect(r.perRole['orchestrator']).toMatchObject({ row: 'orchestrator:large-build:any' });
    expect(r.perRole['orchestrator']!.cell.BUDGET).toBe('wide');
    expect(r.budgetCell).toBeNull();
    expect(r.perRole['coding-agent']!.row).toBe('coding-agent:default:medium');
    expect(r.perRole['nobody']).toBeNull();
    const t = resolvePlaybooks({ intent: 'question', tier: null, roles: ['orchestrator'], entryRole: 'orchestrator' });
    expect(t.budgetCell).toEqual(BUDGET_CELLS['tight']);
    expect(t.perRole['orchestrator']!.text).toMatch(/undetermined/);
    const o = resolvePlaybooks({ intent: 'moderate_feature', tier: 'small', roles: ['orchestrator'], entryRole: 'orchestrator', overrides: { OUTPUT: { report: 'Report tersely.' }, ROUTE: { zzz: 'x' } } });
    expect(o.perRole['orchestrator']!.text).toContain('OUTPUT: Report tersely.');
    expect(o.warnings.length).toBe(1);
    expect(o.budgetCell).toEqual({ maxActive: 4, maxTotal: 12, maxDepth: 3 });
  });
  /*
   * K3 of the default live run at c2fdd6a (docs/defects/fixed/the-entry-roles-route-slot-says-the-coordinator-routed-the-task-to-it.md):
   * the entry role was rendered like a delegated specialist, so the coordinator read "the coordinator routed it to you",
   * on a direct-work run (PD-ORCH-006) too. Its ROUTE slot takes the catalogue's `entry` variant; a delegated child of the
   * same role still reads `routed`, and a cell marked not routed keeps its narrow text (REQ-ORCH-023).
   */
  it('REQ-ORCH-019/020/026, PD-ORCH-006: the entry role is given its own ROUTE wording; a delegated child keeps `routed`', () => {
    for (const intent of ['moderate_feature', 'explicit_trivial', 'question'] as const) {
      const r = resolvePlaybooks({ intent, tier: 'medium', roles: ['orchestrator', 'coding-agent'], entryRole: 'orchestrator' });
      const entry = r.asEntry['orchestrator']!;
      expect(entry.cell.ROUTE).toBe('entry');
      expect(entry.text).toContain(`ROUTE: ${CATALOGUE.ROUTE!['entry']}`);
      expect(entry.text).not.toMatch(/coordinator routed it to you/);
      expect(entry.row).toBe(r.perRole['orchestrator']!.row);
      expect({ ...entry.cell, ROUTE: 'routed' }).toEqual(r.perRole['orchestrator']!.cell);
      expect(r.perRole['orchestrator']!.cell.ROUTE).toBe('routed');
      expect(r.perRole['coding-agent']!.text).toContain(`ROUTE: ${CATALOGUE.ROUTE!['routed']}`);
    }
    expect(CATALOGUE.ROUTE!['entry']).not.toMatch(/coordinator routed/);
    // The budget the entry role's cell clamps is unchanged by the wording.
    expect(resolvePlaybooks({ intent: 'question', tier: 'small', roles: ['orchestrator'], entryRole: 'orchestrator' }).budgetCell).toEqual(BUDGET_CELLS['tight']);
    // REQ-ORCH-026: the variant is listed in the catalogue, so an override may re-word it.
    const o = resolvePlaybooks({ intent: 'moderate_feature', tier: 'small', roles: ['orchestrator'], entryRole: 'orchestrator', overrides: { ROUTE: { entry: 'The user asked you.' } } });
    expect(o.warnings).toEqual([]);
    expect(o.asEntry['orchestrator']!.text).toContain('ROUTE: The user asked you.');
    // REQ-ORCH-023: a not-routed cell keeps its narrow text, for the entry role too.
    const nr = resolvePlaybooks({ intent: 'question', tier: 'small', roles: ['tester'], entryRole: 'tester' });
    expect(nr.asEntry['tester']!.cell.ROUTE).toBe('not_routed');
    expect(nr.asEntry['tester']!.text).toContain(`ROUTE: ${CATALOGUE.ROUTE!['not_routed']}`);
    expect(resolvePlaybooks({ intent: 'question', tier: 'small', roles: ['nobody'], entryRole: 'nobody' }).asEntry['nobody']).toBeNull();
    // REQ-ORCH-024: an entry role with no row has no cell, so no BUDGET: the configured child policy stands unchanged.
    expect(resolvePlaybooks({ intent: 'question', tier: 'small', roles: ['nobody'], entryRole: 'nobody' }).budgetCell).toBeNull();
  });
});
