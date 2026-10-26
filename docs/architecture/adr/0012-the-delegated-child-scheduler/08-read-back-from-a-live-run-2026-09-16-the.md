# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — Read back from a live run — 2026-09-16: the ceiling's graceful arm had never run

Part 8 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## Read back from a live run — 2026-09-16: the ceiling's graceful arm had never run

`REQ-ORCH-088` names three acts on expiry and this decision built two of them. The fallback retry was
measured at the fourth execution above. The **graceful pause** — the requirement's first clause — was
never built at all, and it took a run on a real endpoint to notice, because every proof of the ceiling
until now asserted the *outcome* (`failed`, a `timeout` issue, the parent still completing) and none of
them asserted what the child got to say on its way out.

**What the run showed.** Run `a26918e8`, 2026-09-16: a `codebase-analyst` child made 96 tool calls,
reached 1200 s, and was aborted where it stood. Its report carried an empty last response and an empty
final response, and its parent — blocked in a `wait_for_tasks` that `REQ-TOOLS-156` deliberately leaves
unbounded — read that as "the work did not happen" and started delegating it again.

**The falsified reason, kept beside its replacement.** The ceiling was built as a cancellation, on the
reading that a child past its budget has nothing further to contribute and the cheapest end is the
safest one. That is wrong in the one way that matters: **the child's account of what it did is produced
at the end of a step, so cutting it mid-step destroys the only thing a timeout was ever going to yield.**
Restated: the ceiling ends the child's *work*, not its *turn* — the turn ends itself, one step later,
and the hard cancel is the backstop for a turn that will not.

**Built.** The ceiling now raises the same `shouldPause` flag `REQ-MONITOR-123`'s pause raises, so the
turn stops before its next model step with its text intact (`run/turn.ts`); the abort is armed
`STOP_GRACE` behind it. `timedOut` is still set at the ceiling and not at the backstop, so the retry
limb and the `Child timed out after <N>s` report are reached identically whether the child landed or had
to be cut. The report's extraction now falls back to the last assistant message that **carried text**
rather than stopping at the last assistant message, which on any tool-using child is the one that spoke
last before opening a call. `REQ-ORCH-110`'s final/last distinction is unchanged and is decided on the
plain last message, so a landed child's words reach `last_response` and never `final_response`.

**The change is observable from outside, which the old proofs were not.** `run/ladder.test.ts`'s
`REQ-ORCH-088` test — written before this and untouched in substance — stopped passing: it advanced the
clock to the ceiling and waited for the run, and the run no longer ended there, because a child holding on
a promise that never resolves is now ended by the backstop rather than by the ceiling. It passes again with
the grace advanced too. That the existing test had to learn the second figure is the measurement: the
ceiling alone had been the whole mechanism.

**One defect found while building it, and it is the kind a test would not have caught.** The window was
first written as `export const CHILD_LANDING_GRACE = STOP_GRACE` in `children/orchestration.ts`, taking
`run.ts`'s constant. `run.ts` imports `children/orchestration.ts`, so across that cycle the constant is
`undefined` at module-initialisation time; the timer was armed with `undefined`, its deadline computed
as `NaN`, and `NaN <= target` is false, so **the backstop never came due and a child asked to land was
never cut off at all**. It was found by the backstop's own regression test hanging. ADR-0014's one 30 s
allowance now lives in `run/grace.ts`, which neither file imports the other to reach.

**Still true, and still not a defect.** The wait remains unbounded and partial results remain
unavailable: `REQ-TOOLS-156` forbids a deadline in those words and `REQ-ORCH-064` blesses the long
block. What this execution changes is what the block is worth at the end of it.

**Reported back 2026-10-06: the 30 s window met a model that reasons, and the owner kept it.** The code beside
`CHILD_LANDING_GRACE` promised that a window proving wrong would be reported back here. The duress live runs of
2026-10-03 (`1763f7f`) and 2026-10-06 (`27a5127`) each had children reach the 1200 s ceiling mid-step on a model that
reasons before it answers, and the backstop aborted the step in flight at ceiling + 30 s three times, after 115.4 s,
87.0 s and 104.8 s of generation with no text and no tool call; the streamed reasoning stayed in the transcript as
`thinking` rows and nothing else of the step was kept
([`a-child-at-its-ceiling-has-the-model-step-in-flight-aborted-30-s-later.md`](../../../defects/fixed/a-child-at-its-ceiling-has-the-model-step-in-flight-aborted-30-s-later.md)).
At `71ad8e8` all three landings finished inside the window. The question was put to the owner as OQ-196, who ruled on
2026-10-06 ([R-071](../../../product/requests.md#r-071)) to keep the 30 s so the child's limit stays hard, and to keep the cut
step's reasoning in the transcript alone; `PD-ORCH-004` revision 5 writes the bound down. The reason above stands: the
window is the run's one 30 s allowance, and nothing in the code changed.
