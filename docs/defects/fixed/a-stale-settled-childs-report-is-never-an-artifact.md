## A stale-settled child's report is never made an artifact

`settleStaleChildren` stores the stub report of every child it settles through `writer.storeChildReport`, which
bypasses `ledger.storeReport`, so no child-report artifact is materialised for it. Every other terminal child's report
becomes an artifact the sibling-artifact index lists. The children a crash or a hard cancel left behind are the ones a
later run cannot find by reading artifacts.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

None directly; `REQ-ORCH-108` holds that every terminal child produces a report, which is met, and the artifact
materialisation it feeds elsewhere is skipped for this one path.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `settleStaleChildren`.
- `packages/engine/src/children/ledger.ts` — `storeReport`, which materialises the artifact.

## Repaired — 2026-09-27

By PD-ORCH-005's phase 7. The report write and its artifact now live in one function, `storeChildReport` in
`children/ledger.ts`. Every path that stores a child's report goes through it:
- the ledger's own `storeReport`;
- `settleStaleChildren`, given the session's artifact store by both of its callers;
- the decline of a resumable iteration (`Run.cancelPausedAgents`, PD-ORCH-005 clause 6). That is a second path, built
  by PD-ORCH-005, that had the same gap.

Since PD-ORCH-005 the settle leaves a `paused` agent as it is, so it reaches fewer children than it did. The ones it
still reaches are those of a plan cycle a crash cut off, and those no open iteration holds.

Evidence:
- `children.test.ts`, "REQ-ORCH-053: a later run … settles a phantom child": the settled report is a `child_report`
  artifact, `cancelled`.
- `children.test.ts`, "clause 6, declined": each declined agent's report is one.
- `session-resume.test.ts`: the orphan a continue settles is one.
- The continue path's and the decline's assertions fail when their store is taken away. The same settle at a new
  session's start has no test that reaches it, because a new session has no earlier children.

A child REQ-ORCH-048's cascade blocks gets no report to materialise
([`a-child-blocked-by-its-dependency-gets-no-report.md`](../a-child-blocked-by-its-dependency-gets-no-report.md), found by
phase 7's review).
