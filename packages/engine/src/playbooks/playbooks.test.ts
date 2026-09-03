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
});
