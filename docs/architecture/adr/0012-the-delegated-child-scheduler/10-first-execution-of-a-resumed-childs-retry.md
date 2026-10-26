# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — First execution of a resumed child's retry payload — 2026-09-30: what the launch held in memory

Part 10 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## First execution of a resumed child's retry payload — 2026-09-30: what the launch held in memory

*`REQ-TOOLS-154` fixes the payload a child starts from; this record's inherited-context section above kept item (5)'s
block, and the delegation kept item (4)'s attachment list, per task id in memory "for as long as the run lives". Since
`PD-ORCH-005` a child outlives that run: a paused child is resumed by a later run, whose `IterationChildren` is new. The
first execution of `REQ-ORCH-088`'s fallback retry for such a child reports here, under R-067
(`docs/defects/fixed/a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md`, acceptance A25).*

**What the execution found.** A case in `run/ladder.test.ts` drives it through `Sessions` over a real store and the
session's artifact store: a `survey` child succeeds with its report stored; a `slow` child that depends on it, names it in
`inherited_context` and attaches its report is paused mid-step; the Continue action resumes it; its hard timeout expires
and the fallback retries it. The first payload carried REQ-ORCH-047's prior-agent context, the attached report's
`PRIOR AGENT CONTEXT (FULL)` block and the inherited-context block. The retry's payload carried the workspace root, the
sibling index and the task — **none of the three**, and nothing told the child or its parent. The inherited block and the
attachments were in the old run's memory; the prior-agent context was guarded by `children.context_injected`, which the
first run had set, so the retry's `execute` rendered none, where a retry within the first run reuses the block it
rendered.

**What was changed.** Store **v28** appends `children.attach_artifacts` (the call's references as given) and
`children.inherited_context_block` (the block rendered at the call, since a sibling ignored then as unfinished may
complete later and the ids alone would not say which counted). `ChildLedger.spawn` writes both; `IterationChildren`'s
`attached` and `inherited` maps are removed, and `execute`'s `payload()` and `startingPayload` read the row. A resumed
execution's retry renders the prior-agent context again from its dependencies' rows: the block is still given once in the
conversation the payload starts, and never re-prefixed on a state hop (the reading is **OQ-151**). The same case, run
against the unrepaired code,
fails on all three blocks; repaired, the retry's payload equals the first payload exactly. `store.test.ts` pins the
migration and the round trip.

**What was not measured.** No live run: the live-run scenarios never pause a child that attached an artifact and then
time it out on a fallback, and the case above is the whole of the evidence. The `resume` scenario, run against `katalyst`
from this build, passed as regression evidence only: the built app migrated to v28 and resumed two paused children, which
attached and inherited nothing and were not retried. A row written before v28 carries neither, and
its retry in a later run carries none, as before. A dependency followed up (`PD-ORCH-005` clause 22) between the first
payload and a later run's retry is rendered as it now reads. The row is in
[`../first-executions.md`](../../first-executions.md).
