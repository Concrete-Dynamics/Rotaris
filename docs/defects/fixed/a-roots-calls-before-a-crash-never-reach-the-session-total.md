## A root's calls before a crash never reach the session total

The session's tool-call total (`REQ-MONITOR-102`) counts an agent's calls when its turn returns: a child's when its
execution settles, the root's when `Run.turn` adds its outcome. A crash ends the root's turn without returning, so
the calls the root made before it are recorded in its conversation and its transcript rows but never counted. A
resumed child's are now credited at its resume from its record (`callsRun`); the root's are not, and the agents
panel, which derives the root's figure as the total less the children's, shows it too few. Noticed by phase 4's third
review of `PD-ORCH-005` (2026-09-27), established by reading the code; not driven.

## Specs

`REQ-MONITOR-102` (the session-wide total counts each call once), which a call counted never does not meet.

## Relevant files

- `packages/engine/src/run/run.ts` — `turn`, where the root's calls join the total (`aggregates.addToolCalls`).
- `packages/engine/src/children/orchestration.ts` — `execute`, where a resumed child's recovered calls are credited.
- `packages/ui/src/agents.ts` — the root's figure, the total less the children's.

## Measured live — the duress run of 2026-09-29 (D4's crash half)

Live-run finding: D4 (live runs of 2026-09-29), its crash half. Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`. The run was ended at its
40-minute deadline by the harness's immediate exit, which the run meets as a crash (the harness side is
`the-drivers-quit-skips-the-applications-shutdown.md`). At that point `sessions.tool_calls` read **240** against **309**
`tool_calls` rows: the orchestrator's **54** calls were never counted, because its one turn never returned, and the
running child `f`'s **15** were not either (`children.tool_calls` 0 for `f`, which never settled). The autopsy's header
said 240 above its own per-tool breakdown summing to 309. The session stayed `running`, `stop_reason` NULL. The same
figures are the lag half of the finding, which REQ-ORCH-097's "after each successful execution pass" permits while the
pass runs, and which is [OQ-116](../../architecture/open-questions.md), open.

## Outcome — repaired 2026-09-29 under R-067

The root now has a persisted count of its own: `iterations.root_tool_calls` (store **v26**, appended), the calls of the
iteration's root the session total holds — `0` for an iteration opened from v26, NULL (not known) for one written before.
`SessionWriter.countToolCalls` writes the session total together with the agent's own count in one transaction, so no
process death leaves a call held by one and not the other:

- **when the root's turn returns** (`Run.turn`), its calls join the total and its iteration's count together — at the same
  moment as before, so REQ-ORCH-097's cadence is unchanged and the live lag stays [OQ-116](../../architecture/open-questions.md)'s;
- **when the stop's grace gives up on the root** (`rootDetached`, whose count no returned turn carries), its calls are
  counted from its record once its open calls are answered, less what the record held when that execution began — the
  limb the repair of [`a-root-call-that-ignores-the-stop-holds-the-run-open.md`](a-root-call-that-ignores-the-stop-holds-the-run-open.md)
  left open;
- **a child's** resume credit (`IterationChildren.execute`'s `priorCalls`) and its settle now persist the child's
  `tool_calls` with the total through the same method (`ChildrenDeps.countToolCalls`'s `child`);
- **the crash record** (`run/crash.ts` `recordCrash`, at the next repair or continue) adds, after answering the dead run's
  open calls, what the root's record holds beyond `root_tool_calls` and what each unfinished child's holds beyond its
  `tool_calls` — both counts moved with the total, so a second recording, and a resumed child's own credit, find nothing
  more. A root whose count is NULL adds nothing, as before.

*Found while building it:* a resumed child's credit reached the run's aggregate only, its `tool_calls` left as the rest
wrote it, so a crash record counting children from their records would have counted twice a child resumed after a stop
and then lost to a crash. That is why the child's count now moves with the total. *Corrected at the verifier's review
(2026-09-29):* as first committed, that claim, and the settle's persist beside it, were pinned by no case — reverting either
left every test green. Two `children.test.ts` cases now pin them: the credit's — a child the stop's grace gave up on,
credited from its record by the continue, one more call, a crash — reads a total of **6** where **4** is due without the
child's count in the credit (the run's token sampler had saved the credited total before the death); the settle's — a
child that settles, then a crash while the root's next step runs — reads **1** where **3** is due without it.

*Found by building the credit's case:* a root that **returned** before the stop's grace ran out — while the rest waited for
its children — was counted a second time, from its record, because the grace's timer sets `rootDetached` whatever the
race had already decided. Only a root that never returned (`outcome === null`) is now counted from its record; the same
case reads a total of **2** where **1** is due without that guard. The double count never reached `main`.

What it does not do: a record a compression replaced holds fewer calls than were made, so what the crash record adds from
it may fall short (never over); a plan cycle has no `iterations` row, so a crash during one still loses its root's calls
([`a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md`](a-plan-cycles-root-calls-before-a-crash-never-reach-the-session-total.md);
repaired 2026-09-30: the session records the plan cycle's root under way, store v29, and the crash record counts it);
a child the stop's grace gave up on and a continue then declined still counts nothing
([`a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md`](a-child-the-stops-grace-gave-up-on-and-the-continue-declined-never-counts-its-calls.md);
repaired 2026-09-30: such a child is now counted from its record at the rest);
and the total still lags during a pass (OQ-116, open). The agents panel still derives the root's figure as the total less
the children's. A store a pre-v26 build crashed, continued and let crash again — a child credited from its record at that
continue, its `tool_calls` never persisted with the credit — has that credit counted a second time when a v26 build records
the second crash; the case is narrow and is not repaired. A root whose turn raises (neither a crash nor given up on)
counts none of its calls: [`a-root-whose-turn-raises-never-counts-its-calls.md`](../a-root-whose-turn-raises-never-counts-its-calls.md).

Pinned by: `packages/engine/src/run/crash.test.ts` — "the root's beyond its iteration's count and each unfinished child's
beyond its own…", "a root whose count is not known…", "the calls the root and a child made before the crash reach the
session total when it is repaired…" and "a continue after the crash counts what the crash left once…";
`packages/engine/src/children/children.test.ts` — "a root given up on counts the call it made from its record, and its
resume counts only the calls it adds", and, added at the verifier's review, "a child the stop's grace gave up on, credited
from its record by the continue and then lost to a crash, is counted once…", "a child's settle persists the total with its
own count…" and "a resumed root given up on at a second stop counts only what its record gained in that execution" (**6**
where **4** is due without `recordedAtStart`); `packages/store/src/store.test.ts` — the v25 → v26 migration. The first five
engine cases failed on the code before the repair (totals 0, 1 or 6 where 4, 3 and 9 were due); each of the three added
fails with the one piece of the repair it names removed.

**Measured live, 2026-09-29.** `pnpm live-run --confirm --skip-build --only=duress` on the repaired branch against the
unmetered `katalyst` endpoint, pack `.live-run/runs/2026-09-29T12-40-51-800Z/` (the `fix-turn-accounting` worktree;
git-ignored), session `c0066cc5`. The run met its 40-minute deadline as the first did — the harness's immediate exit, a
crash — and its store read as D4's did: `sessions.tool_calls` **178** against **247** `tool_calls` rows, the orchestrator's
**36** and the running child `d2`'s **33** not yet counted (the lag, OQ-116's, unchanged by design), the iteration's
`root_tool_calls` **0**. A repair of a copy of that store (`Sessions.repair` from the workspace source, through a
throwaway harness not committed) recorded the crash and brought the total to **247**, equal to the rows, with
`root_tool_calls` **36** and `d2`'s `tool_calls` **33**, `d2` paused. The built app itself never repaired the store: the
live run ends at the crash and does not reopen the session. The same repair left the cut call's ring row `running`, a
defect of its own: [`a-crash-leaves-its-cut-calls-ring-row-running-after-the-repair.md`](../a-crash-leaves-its-cut-calls-ring-row-running-after-the-repair.md).

