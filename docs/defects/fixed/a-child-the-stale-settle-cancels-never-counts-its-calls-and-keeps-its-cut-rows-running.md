## A child the stale settle cancels never counts its calls and keeps its cut rows running

A child a dead run left neither terminal nor `paused` — a plan cycle's child a crash ended (a plan cycle has no
`iterations` row, so the crash record pauses none of its agents, OQ-96), or another root's orphan — is settled `cancelled`
by the stale-child settle at the next continue (`settleStaleChildren`, REQ-ORCH-053). The settle writes its transition and
its report and nothing else: the calls its record holds beyond its `children.tool_calls` never join the session's total
(its count moves only when its execution settles or rests, and the crash record counts only the open iteration's
unfinished agents), its record's last unanswered calls are never answered, and a transcript row of a call the crash cut is
left `running` for good — the same shapes the crash record repairs for an execution iteration's agents
(`answerOpenCalls`, `countCrashedCalls`). The settle runs only at a continue, so a repair alone leaves the child `running`
too. Noticed 2026-09-30 while repairing
[`a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md`](a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md),
which repaired the plan cycle's root only; established by reading the code, not driven.

## Specs

`REQ-MONITOR-102` (a session-wide total tool-call count is persisted, and counts each call), which a call never counted does
not meet. `REQ-SESSION-129` ("when a child agent dies while a tool call is open … no transcript row of its own left at status
`running`; every such row MUST be persisted at status `failed`"), which a cut row left `running` does not meet.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `settleStaleChildren`, which transitions and reports only.
- `packages/engine/src/run/crash.ts` — `answerOpenCalls` and `countCrashedCalls`, what the crash record does for an open
  iteration's agents and not for these.
- `packages/engine/src/sessions.ts` — `launchContinuation`, where the settle runs after the crash record.

## Outcome — repaired 2026-10-01

**Found the note true on the branch.** A plan-mode session's root delegated `look`. `look` made one call that completed and
one that never returned, and the session's host then died. After the repair, the cut call's transcript row was still
`running`. After the continue, the stale-child settle ended `look` `cancelled` with `tool_calls` 0, and its two calls never
reached the session total. A phantom child the settle ended directly kept its unanswered call and its `running` row. All
three cases were red on the unrepaired code.

**What changed.** `recordCutChild` (`run/crash.ts`) does for one child what the crash record does for an open iteration's
unfinished agent. It answers the child's open calls (`answerOpenCalls`), so a cut row settles `failed`, and it adds the
calls its record holds beyond `children.tool_calls` to the session total, in one transaction with the child's count
(`countToolCalls`). Two places call it:

- `recordPlanRootCrash`, for each unfinished child of the plan cycle's root, with the crash's cause. A repair, and not only
  a continue, therefore leaves no transcript row `running`.
- `settleStaleChildren`, for every child it ends, before the `cancelled` move, with a call cut by no rest (OQ-96).

Both steps are idempotent: an answered call is not answered again, and a count already held adds nothing. The settle after
a crash record therefore adds nothing twice, and a death between the count and the move leaves nothing double-counted.
The counts are not written in the transaction of the `cancelled` move, as the triage sketched. They follow the crash
record's own pattern (`recordAcceptedCancel`), separate writes that are each idempotent.

**Pinned by** `packages/engine/src/run/crash.test.ts`, describe "a plan cycle's child a crash ended mid-call": a repair and
then a continue, and a continue with no repair before it. Each expects no transcript row `running`, the session total equal
to the tool rows, and the child's count equal to its record. Also pinned by `packages/engine/src/children/children.test.ts`,
"REQ-MONITOR-102 / REQ-SESSION-129 (the repair of
a-child-the-stale-settle-cancels-never-counts-its-calls-and-keeps-its-cut-rows-running): …", the settle alone over a
phantom child with one completed and one cut call. All three fail without the repair, and the last fails with only the
settle's change removed.

**Not shown in the built app.** `live-run.mjs` has no crash or plan-gate scenario, and no proof crashes a run under a plan
cycle's child. The unit cases are the evidence. No live run was driven.

