## Cancelling one child does not stop it

`Run.cancelAgent` moves the child's row to `cancelled`, stores a "The user cancelled this child." report and writes
`child_user_cancelled`, but it has no handle on the child's execution: there is no per-child abort. The child keeps
running, and when its turn ends `execute` stores its own report over the cancellation's, since `storeReport` does not
check the state; its own transition is refused as illegal and only warns. The last writer wins the report.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-ORCH-133` (a single user cancel stops the child and its report states the user cancelled it; a bulk cancel
waits 5 s and records `child_force_cancelled`) and `REQ-MONITOR-128` (cancelling an agent cascades to its live
descendants): the child is marked cancelled while it goes on working, and the report that survives is not the
cancellation's.

## Relevant files

- `packages/engine/src/run/run.ts` — `cancelAgent`.
- `packages/engine/src/children/orchestration.ts` — `execute`, `storeReport` after the turn.
- `packages/engine/src/children/ledger.ts` — `storeReport`, which writes whatever the state.
