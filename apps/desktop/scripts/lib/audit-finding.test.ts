/**
 * `ui-audit` files every finding under the sweep that found it (the evidence of `docs/design/README.md` §7, R-007;
 * docs/architecture/views/04-seams.md §8 step 6). A contract row carries its relation's `kind`, which once overwrote
 * `CONTRACT` in `report.json` and in `ui-review`'s `manifest.json`
 * (docs/defects/fixed/a-contract-finding-in-ui-audit-is-filed-under-its-relation-kind.md).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the audit library is plain ESM beside the scripts that run it.
import { auditFinding, countByKind, countContractsByRelation } from './audit-finding.mjs';
// @ts-expect-error — the audit library is plain ESM beside the scripts that run it.
import { evaluateContracts } from './layout-relations.mjs';

/** The counterfactual of R-062: the window controls' contract as an object, which the probe reads as unreadable. */
const unreadable = evaluateContracts([{ id: 'shell-window-controls', unreadable: true, reason: 'contract is not an array' }]);

describe('design README §7 (R-007): ui-audit files a contract finding under CONTRACT', () => {
  it('keeps CONTRACT as the kind and carries the failed relation under `relation`', () => {
    const [row] = unreadable;
    expect(row.kind).toBe('schema');
    expect(auditFinding('CONTRACT', 'Settings', '1400x900', row)).toEqual({
      id: 'shell-window-controls', target: null, pass: false, detail: 'contract is not an array',
      kind: 'CONTRACT', relation: 'schema', view: 'Settings', size: '1400x900',
    });
  });

  it('files a failing containment relation apart from the whole-document CONTAINMENT sweep', () => {
    const [row] = evaluateContracts([{ id: 'panel', relations: [{
      relation: { kind: 'containment', target: '.workspace' },
      measurement: { own: { left: 0, top: 0, right: 900, bottom: 10 }, target: { left: 0, top: 0, right: 800, bottom: 600 } },
    }] }]);
    expect(row.pass).toBe(false);
    const contract = auditFinding('CONTRACT', 'Overview', '1000x680', row);
    const sweep = auditFinding('CONTAINMENT', 'Overview', '1000x680', { el: '.panel', top: 0, bottom: 10, right: 1100, left: 0 });
    expect([contract.kind, contract.relation]).toEqual(['CONTRACT', 'containment']);
    expect(sweep.kind).toBe('CONTAINMENT');
    expect('relation' in sweep).toBe(false);
    expect(countByKind([contract, sweep])).toEqual({ CONTRACT: 1, CONTAINMENT: 1 });
  });

  it('never lets a detail rename the view or the size it was measured at', () => {
    expect(auditFinding('STACKING', 'Chat', '1400x900', { el: '.send', view: 'elsewhere', size: '1x1' }))
      .toMatchObject({ kind: 'STACKING', view: 'Chat', size: '1400x900', el: '.send' });
  });

  it('counts the summary and the manifest by sweep, and contract failures by the relation that failed', () => {
    const findings = [
      auditFinding('CONTRACT', 'Settings', '1400x900', unreadable[0]),
      auditFinding('CONTRACT', 'Overview', '1400x900', { id: 'a', kind: 'align-x', pass: false }),
      auditFinding('CONTRACT', 'Overview', '1000x680', { id: 'b', kind: 'align-x', pass: false }),
      auditFinding('TRACKS', 'Overview', '1400x900', { grid: '.workspace' }),
    ];
    expect(countByKind(findings)).toEqual({ CONTRACT: 3, TRACKS: 1 });
    expect(countContractsByRelation(findings)).toEqual({ schema: 1, 'align-x': 2 });
  });
});
