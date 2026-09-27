## The continuation payload says no artifact is recorded

`buildContinuationPayload` writes the fixed line `Artifacts: (no orchestrator artifact is recorded in this build)`
into every continued run's handoff, although the session's artifact store holds the child reports and the sibling
artifacts it has published. The next run's root is told there is nothing to read.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-SESSION-115`: the continuation handoff carries the artifact, the todo and the progress. The artifact part is a
placeholder that asserts the opposite of the store's contents.

## Relevant files

- `packages/engine/src/sessions.ts` — `buildContinuationPayload`.
