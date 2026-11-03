/**
 * One `ui-audit` finding, filed under the sweep that found it.
 *
 * A finding is the sweep's kind (`TRACKS`, `CONTAINMENT`, `STACKING`, `TRAPPED`, `SHRUNK`, `CONTRACT`, …), the view
 * and the size it was measured at, and whatever the sweep measured. A contract row from `evaluateContracts` carries
 * its relation's own `kind` (`containment`, `align-x`, `schema`, …); spreading it after the sweep's kind once filed a
 * failing contract under that relation in `report.json` and in `ui-review`'s `manifest.json`, where a failing
 * `containment` contract read as the whole-document `CONTAINMENT` sweep but for case
 * (docs/archive/defects/a-contract-finding-in-ui-audit-is-filed-under-its-relation-kind.md). The measured detail is
 * spread first, so the sweep's kind, the view and the size always win; a detail's own `kind` moves to `relation`.
 *
 * @param {string} kind the sweep that found it
 * @param {string} view the view (or `overlay: <name>`) it was measured in
 * @param {string} size the size label it was measured at
 * @param {Record<string, unknown> | null | undefined} detail what the sweep measured
 */
export function auditFinding(kind, view, size, detail) {
  const { kind: relation, ...measured } = detail ?? {};
  return { ...measured, kind, ...(relation === undefined ? {} : { relation }), view, size };
}

/**
 * How many findings each sweep filed — the summary line's and the manifest's `byKind`.
 * @param {ReadonlyArray<{ kind: string }>} findings
 * @returns {Record<string, number>}
 */
export function countByKind(findings) {
  return findings.reduce((/** @type {Record<string, number>} */ acc, finding) => ({ ...acc, [finding.kind]: (acc[finding.kind] ?? 0) + 1 }), {});
}

/**
 * How many `CONTRACT` findings each relation kind accounts for — the manifest's `contractsByRelation`.
 * @param {ReadonlyArray<{ kind: string, relation?: unknown }>} findings
 */
export function countContractsByRelation(findings) {
  return countByKind(findings
    .filter((finding) => finding.kind === 'CONTRACT')
    .map((finding) => ({ kind: String(finding.relation ?? '(unnamed)') })));
}
