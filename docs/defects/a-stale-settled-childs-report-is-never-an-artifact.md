## A stale-settled child's report is never made an artifact

`settleStaleChildren` stores the stub report of every child it settles through `writer.storeChildReport`, which
bypasses `ledger.storeReport`, so no child-report artifact is materialised for it. Every other terminal child's report
becomes an artifact the sibling-artifact index lists. The children a crash or a hard cancel left behind are the ones a
later run cannot find by reading artifacts.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

None directly; `REQ-ORCH-108` holds that every terminal child produces a report, which is met, and the artifact
materialisation it feeds elsewhere is skipped for this one path.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `settleStaleChildren`.
- `packages/engine/src/children/ledger.ts` — `storeReport`, which materialises the artifact.
