## A plan cycle's root calls before a crash never reach the session total

A plan cycle's root (`Run.turn` with iteration 0, PD-ORCH-003 / REQ-ORCH-153) has its tool calls added to the session's
tool-call total when its turn returns, as an execution root's are. A crash ends that turn without returning, and a plan
cycle has no `iterations` row (a plan cycle is not an iteration; a crash during one leaves no row open, OQ-96), so neither
the crash record nor the per-root count that repaired the execution root's case
([`a-roots-calls-before-a-crash-never-reach-the-session-total.md`](a-roots-calls-before-a-crash-never-reach-the-session-total.md))
reaches it: the calls the plan cycle's root made before the crash are in its conversation record (under iteration 0)
and its transcript rows, and never in `sessions.tool_calls`. Noticed while repairing that note (2026-09-29), established
by reading the code; not driven. A plan cycle is read-only work, so the calls lost are reads.

## Specs

`REQ-MONITOR-102` (a session-wide total tool-call count is persisted; the displayed total is the persisted value), which a
call never counted does not meet.

## Relevant files

- `packages/engine/src/run/run.ts` — `turn`, where a plan cycle's root has no `rootCount` (no iteration row).
- `packages/engine/src/run/crash.ts` — `recordCrash`, which reads only the open execution iteration.
- `packages/engine/src/run/record.ts` — the plan cycle root's record, under iteration 0.

## Outcome — repaired 2026-09-30 under R-067

Acceptance finding A19 (acceptance round 1). **Confirmed first on the branch's code** by a case that drives a plan-mode
session through the session manager: the plan cycle's root makes one call that completes and one that never returns, the
process is then treated as dead, and `Sessions.repair` from another process records the crash. Before the repair the
session's `tool_calls` read **0** after it, where **2** is due; the cut call's transcript row was left `running` as well,
since the crash record read only the open execution iteration.

The session now records the plan cycle's root while its turn runs and none of its calls is counted:
`sessions.plan_root_task_id` and `plan_root_persona` (store **v29**, appended). A plan cycle is not an iteration, so the
record is the session's, not an `iterations` row's; at most one plan cycle runs at a time in a session, so one pair of
columns holds it.

- **`Run.turn`** records a plan cycle's root when it starts (`SessionWriter.openPlanRoot`), and releases it in the same
  transaction that adds its calls to the total (`SessionWriter.countToolCalls`'s `planRoot`): when its turn returns, and
  when the stop's grace gives up on it (its calls counted from its record, as an execution root's are). A root whose turn
  raises is released with none counted, as an execution root's turn that raises counts none
  ([`a-root-whose-turn-raises-never-counts-its-calls.md`](../a-root-whose-turn-raises-never-counts-its-calls.md), open).
- **`recordCrash`** (`recordPlanRootCrash`, at the next repair or continue) finds a plan cycle's root still recorded — one
  a crash ended — answers its open calls as a crash's under the plan cycle's 0 (`answerOpenCalls`: the call the crash cut
  settles its row `failed`, REQ-SESSION-129; a call it asked for and never started is answered as not run and is not one),
  then adds every call its record holds, releasing it in the same transaction, so a second recording finds nothing. A plan
  cycle is never at rest (OQ-96): nothing is paused, and the root is never resumed.

What it does not do: a record a compression replaced holds fewer calls than were made, so what the crash record adds from
it may fall short (never over), as for an execution root. A **child** of a plan cycle that a crash leaves running is
settled `cancelled` by the stale-child settle at the continue (REQ-ORCH-053) and its calls are not counted there either,
which is recorded apart:
[`a-child-the-stale-settle-cancels-never-counts-its-calls-and-keeps-its-cut-rows-running.md`](../a-child-the-stale-settle-cancels-never-counts-its-calls-and-keeps-its-cut-rows-running.md).

Pinned by: `packages/engine/src/run/crash.test.ts`, describe "REQ-MONITOR-102 with REQ-ORCH-153: a plan cycle's root calls
before a crash reach the session total" — "the repair adds the calls the plan cycle's root made …" (**0** where **2** is due
before the repair; also the cut row settled and the marker cleared, and a second recording adding nothing), "a plan cycle
whose root returned … counted its calls once and names no root", "a plan cycle's root the stop's grace gave up on is
counted from its record and released", and "a plan cycle's root the stop's grace gave up on is released in the transaction
that adds its calls, not by a write apart from it"; `packages/store/src/store.test.ts` — the v28 → v29 migration. Not
pinned by a case: the release with none counted when a plan cycle's root's turn raises (no driven path makes a root's turn
raise in the engine's test harness).

*Corrected 2026-10-01 (the verifier's review of the repair, fix round 2).* This paragraph first said of the give-up case:
"without the release on that path the marker stays set and a later crash record counts its calls a second time: that case
fails with the release removed". **That was false.** With only the give-up path's release removed (its `rootCounts(gained)`
put back in the pre-repair form, which names no plan cycle's root), the give-up case still passes: the `finally` block's
release with none counted clears the marker anyway, and `persistToolCalls` writes the aggregates' total, which reads **2**
either way. The give-up case fails only with **both** releases removed — it pins that a root given up on is released at
all, not that its own path releases it. What the give-up path's release adds is that the marker clears **in the
transaction that adds its calls to the total**, and the fourth case now pins that: a store that drops every release written
once the total already holds the calls (a temporary trigger) stands in for a process death between two writes. With the
give-up path's release put back in the pre-repair form, that case fails (1 failed, 75 passed: the marker stays set) and the
give-up case still passes; with only the `finally` block's release removed, all 76 pass.

Not shown live: the finding was established by reading the code (A19, cosmetic: the calls lost are a plan cycle's reads).
No live-run scenario runs in `plan` mode (`duress`, the one that ends by a crash, crashes an execution iteration at its
deadline), and `plan-gate-proof` parks and answers the gate without a crash, so the repair is shown by the driven engine
cases above only.
