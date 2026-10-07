/**
 * PD-CONFIG-003 revision 2 (OQ-223, the R-072 consortium's IT1) with REQ-NOTIFY-100: the detail of REQ-LIBRARY-124's
 * zero-proposal notice. A post-run analysis whose empty artifact carries REQ-LIBRARY-023's timeout note — `collector timed
 * out after <t> seconds` — reached its limit, and says so, naming the control that moves it; every other empty artifact,
 * and the retrospective (whose bound, `retrospective_timeout`, has no control: PD-LIBRARY-002), keeps "Nothing was proposed
 * in <id>.". The notice's title and its absence of an action are REQ-LIBRARY-124's and unchanged
 * (`docs/defects/fixed/a-timed-out-improvement-analysis-reads-as-one-that-found-nothing.md`).
 */

const TIMED_OUT = /^collector timed out after (\d+(?:\.\d+)?) seconds\b/;

/** The limit, in seconds, an empty artifact's notes say the analysis reached; null for notes of any other kind. */
export function analysisTimedOutAfter(notes: string | null | undefined): number | null {
  const m = TIMED_OUT.exec(notes ?? '');
  return m ? Number(m[1]) : null;
}

/** The zero-proposal notice's detail for an artifact with no proposals. */
export function zeroProposalDetail(artifact: { readonly artifact_id: string; readonly source_kind: string; readonly notes: string | null }): string {
  const limit = artifact.source_kind === 'post_run' ? analysisTimedOutAfter(artifact.notes) : null;
  return limit === null
    ? `Nothing was proposed in ${artifact.artifact_id}.`
    : `The review of this run reached its ${limit}-second limit before it proposed anything. Settings › Runtime › Improvement analysis timeout allows it longer.`;
}
