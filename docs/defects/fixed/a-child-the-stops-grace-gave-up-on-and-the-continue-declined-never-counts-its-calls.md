## A child the stop's grace gave up on, and the continue declined, never counts its calls

A child whose execution was still running when a stop's 30 s grace ran out (REQ-SESSION-092) is detached: its execution
returns without counting (`IterationChildren.execute`'s `if (this.detached) return;` sits before `countToolCalls`), and the
rest records it `paused` without a count (`IterationChildren.rest` calls `ledger.rest` with no `toolCalls`). A continue that
resumes it credits its calls from its record (`priorCalls`), so that path is whole. A continue that declines the open
iteration (PD-ORCH-005 clause 6, `Run.closeLeftOpenIteration` → `cancelPausedAgents`) ends it `cancelled` and counts
nothing, so the calls it made before the stop are in its record and its transcript rows and never in `sessions.tool_calls`
or its own `children.tool_calls`. The root given up on is counted from its record at the detach (the repair of
[`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](a-roots-calls-before-a-crash-never-reach-the-session-total.md));
a detached child is not. Noticed while making that repair (2026-09-29), established by reading the code; not driven.

## Specs

`REQ-MONITOR-102` (per-agent tool-call counts and a session-wide total are persisted; the displayed total is the
persisted value), which a call never counted does not meet.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `execute` (the detached return before the count) and `rest` (the
  detached child rested with no count).
- `packages/engine/src/run/run.ts` — `closeLeftOpenIteration` / `cancelPausedAgents`, the decline, which counts nothing.
- `packages/engine/src/session-writer.ts` — `countToolCalls`, which a repair would write through.

## Outcome — repaired 2026-09-30 under R-067

Confirmed on `fix-accept1-11` (from origin/main 47d9acc) before the repair, by the case below with its assertions read as
values: after the stop's grace gave up on `stuck` (one call that returned, one that ignored its abort), it rested with
`tool_calls` 0 and the session's total was 1, the root's `delegate`; after a continue that declined it, it was
`cancelled` with `tool_calls` 0 and the total still 1, while its record showed 2 calls run.

The count is now taken where the root's is, at the detach rather than at the decline. `IterationChildren.outlast` keeps
which children it gave up on (`givenUpOn`, filled by `detach` from the executions still in flight), and `rest`, once it
has answered their open calls, counts the calls each one's record shows beyond its `children.tool_calls` into the
session's total with that count, in one transaction (`countGivenUpOn` → the run's `countToolCalls` →
`SessionWriter.countToolCalls`). A call it asked for and never started is answered as not run first, so it is not one.
The decline (`Run.closeLeftOpenIteration` → `cancelPausedAgents`) is unchanged and now has nothing left to count; a
resume's credit (`priorCalls`, the record's calls less the child's count) credits nothing twice; the crash record's
`countCrashedCalls` likewise finds the count already whole. The paused session's displayed total is right from the rest
on, not only once the session is continued.

Pinned by `packages/engine/src/children/children.test.ts`: the case "REQ-MONITOR-102 / PD-ORCH-005 clause 6 (the repair
of a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md) …" (a stop, the grace, a
continue that declines: `stuck` `cancelled` with `tool_calls` 2 and the total 3), red before the repair at the rest's
count; and the earlier case "… a child the stop's grace gave up on, credited from its record by the continue and then
lost to a crash, is counted once …", whose assertion that the given-up-on child rested with **no count** (`tool_calls` 0,
total 1) encoded this defect and now reads 2 and 3 — its continue, its resumed call and its crash still count each call
once (total 4). Not shown by a proof or a live-run scenario: no scenario stops a run while a child's call ignores its abort
for the whole 30 s grace and then declines the continue.

A session rested by a build before this repair and declined by a build after it keeps that child's calls uncounted; a
continue that resumes it still credits them from its record.

**Found by the repair's verifier, and repaired the same day:** the count first ran only where the rest pauses the child.
An explicit cancel (PD-ORCH-005 clause 3) that arrives while the rest waits within the grace makes `rest` pause nothing
and return — after `outlast` had already given up on the child — and `Run.turn` then ends it `cancelled`: the verifier
drove it (the decline case with `cancelAgent` on the run id sent after the stop) to `cancelled`, `tool_calls` 0, total 1,
2 calls in its record. `rest` now, on that return, answers each such child's open calls as cut off, naming no rest
(OQ-96, "A call cut by no rest"), and counts it through `countGivenUpOn` before returning; `Run.turn`'s `finalize` then
ends it `cancelled` with its count. Pinned by the case "REQ-MONITOR-102 / PD-ORCH-005 clause 3 (… found by its verifier)
…" beside the decline case (`cancelled`, `tool_calls` 2, total 3, its `hang` row `failed` with the cut-off statement),
red before at the child's count (0). The outcome above first read as if every child the stop's grace gave up on were
counted at the rest; that held only for the rest that pauses it.

Noticed while repairing: the explicit cancel's own `outlast` — the cancel that brings the iteration to no rest — gives up
on a child the same way and no rest follows, so that child's calls are never counted either; nor are those of a child
the user had cancelled on its own before a later stop's grace gave up on it (terminal, so no rest path counts it) —
[`a-child-the-explicit-cancel-gave-up-on-never-counts-its-calls.md`](../a-child-the-explicit-cancel-gave-up-on-never-counts-its-calls.md),
recorded open. Repaired 2026-09-30 under R-067.

