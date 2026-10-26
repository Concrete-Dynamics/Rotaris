# Architectural constraints extracted from the specification — 6. The run engine

Part 8 of 22 of [the constraints](../constraints.md), which indexes every part.

## 6. The run engine

| # | Constraint | Label | Requirements |
|---|---|---|---|
| R-01 | The child state set is exactly ten members; the last four are terminal and **absorbing**; the legal-transition table is fixed in full; `REQ-MONITOR-300` is designated the **single definition**. | HARD | REQ-MONITOR-014, REQ-MONITOR-300, REQ-ORCH-040, REQ-ORCH-041 |
| R-02 | An illegal transition is **rejected with an error naming both states, leaves the record untouched, and delivers no state-change event to any surface**. Entering a terminal state stamps a UTC completion timestamp. | HARD | REQ-MONITOR-016, REQ-MONITOR-017 |
| R-03 | Spawn admission runs **five checks in a fixed order**, first failure rejecting with no child record and no task id. Budget clamps only narrow. | HARD | REQ-ORCH-024, REQ-ORCH-038, REQ-ORCH-046 |
| R-04 | A child is started **at most once** however many scheduling passes are in flight, and **a suppressed start must be recorded** as a timeline event plus an issue. | HARD | REQ-ORCH-049 |
| R-05 | A child over the per-model cap is **created and held**, never rejected; held children are released in the order they were held, one per terminal transition on the same model key; a held child consumes no active-child allowance. | HARD | REQ-ORCH-050, REQ-MONITOR-015, REQ-MONITOR-020, REQ-MONITOR-021 |
| R-06 | A dependent starts only when **all** dependencies reached `succeeded` **and** stored their report artifact; the prior-context block is prepended exactly once. | HARD | REQ-ORCH-047 |
| R-07 | On a dependency failing or being cancelled, every dependent still pre-start moves to `blocked`, **transitively**; a dependent already under way is left to run. | HARD | REQ-ORCH-048 |
| R-08 | Scheduling continues until **three conditions hold simultaneously** and must then leave the parent idle; **the loop must not be able to alternate indefinitely without some child changing state**. | HARD | REQ-ORCH-056 |
| R-09 | There is **one** waiting mechanism in the product; at most one wait per parent; a wait carries **no deadline of its own**, and imposing one is explicitly forbidden. | HARD | REQ-ORCH-037, REQ-ORCH-062, REQ-TOOLS-153, REQ-TOOLS-156 |
| R-10 | Two idempotent sweeps close non-terminal children, one of them over records **read back from disk** after a crash and **without probing process liveness**, because holding the lock is proof. | HARD | REQ-ORCH-052, REQ-ORCH-053, REQ-SESSION-065 |
| R-11 | Timing: hard per-child timeout 1200 s; stall watchdog visibility-only, polling at `max(1, min(threshold/6, 5))` s, never cancelling; unresponsive-model fallback only before any model event. | HARD | REQ-ORCH-088 – REQ-ORCH-090, REQ-MONITOR-117, REQ-MONITOR-121 |
| R-12 | Every ledger, counter, budget, supervisor state, artifact store and snapshot is **scoped to one session id**; a run's stop reason, terminal status and child state sequence must not depend on other runs or their interleaving. | HARD | REQ-ORCH-151 |
| R-13 | Cancellation **first releases anything blocked on a person** — questions, then approvals **failing safe as denied** — and only then stops the run. | HARD | REQ-MONITOR-012, REQ-ORCH-132 |
| R-14 | A cancel is graceful first; a hard cancel follows at **30.0 s**; a forced stop performs a **second sweep** for work created during the first. | HARD | REQ-SESSION-092, REQ-MONITOR-129, REQ-ORCH-132 |
| R-15 | The stop request is **sticky**; a caller that requested cancellation receives `interrupted` even when the loop finished first; reporting both an effective cancellation and a successful run is forbidden. | HARD | REQ-SESSION-092, REQ-EVENTS-028 |
| R-16 | Teardown is an **ordered eight-step pipeline that runs even on any exception**, and an interrupt requested during child teardown must still take effect. | HARD | REQ-SESSION-094, REQ-ORCH-098 |
| R-17 | Application shutdown has a checkable order; the force-exit backstop is **30 s from the quit request, the same allowance as the cancellation grace, composing exactly with it**; a second quit force-exits immediately; a force exit is the **only** case in which the ordered effects may be left incomplete **and must be reported as such on the next start**. Shutdown asks **every** handle to stop **before waiting on any**. | HARD | REQ-MONITOR-131, REQ-MONITOR-255, REQ-MONITOR-283, REQ-SHELL-121 |
| R-18 | Two shutdown behaviours differ deliberately and must not be unified: shutdown **waits** for in-flight checkpoint version-control work, and **abandons** the improvement analysis's provider call, which must not be handed to a service that outlives the application. | HARD | REQ-GIT-101, REQ-GIT-102, REQ-LIBRARY-127 |
| R-19 | Terminal-result construction **must never raise**; a value outside the closed set must raise rather than be guessed; `failed` and `error` must never be collapsed. | HARD | REQ-MONITOR-028, REQ-MONITOR-032, REQ-ORCH-083 |
| R-20 | Failure containment: nothing a host supplies may change the run's outcome; history, diagnostics, transcript publication and the timeline-to-wire bridge all degrade to logged warnings; an unattachable store degrades to a warning and the run completes. | HARD | REQ-ORCH-138, REQ-ORCH-140, REQ-SESSION-089, REQ-SESSION-175, REQ-EVENTS-074, REQ-EVENTS-078, REQ-EVENTS-084, REQ-HOOKS-128 |
| R-21 | Concurrent runs: each gets its own handle; controls route to the **focused** run; notifications cover every run; background handles publish **only a summary**; focus change touches no run's lifecycle; an approval reaches the run that asked **even when unfocused**; a permission-mode change reaches only the focused run; the second concurrent launch goes in a worktree; the run-active gate list is **closed at five**. | HARD | REQ-MONITOR-249 – REQ-MONITOR-254, REQ-MONITOR-257, REQ-MONITOR-258, REQ-MONITOR-251 |
| R-22 | Every duration in domain 01 is measured against a **monotonic clock**, and conformance to every one must be **demonstrable with a controlled clock**; no conformance claim may depend on real provider latency. | HARD | REQ-ORCH-156 |
| R-23 | A budget fixes **when the run takes its stated action, not the total elapsed time**; where two budgets bound one activity the smaller governs and expiry of the smaller never resets the larger. | HARD | REQ-ORCH-069, REQ-ORCH-124, REQ-ORCH-156 |
| R-24 | Three timestamp conventions coexist deliberately: wall-clock UTC with an explicit offset on the wire (permitted to move backwards, never an error); UTC with a `Z` suffix in session state; **local** wall-clock time on transcript rows. | HARD | REQ-EVENTS-037, REQ-EVENTS-120, REQ-SESSION-014, REQ-SESSION-121 |
| R-25 | The persisted verification deadline is a **duration in whole seconds from a recorded start**, never an absolute instant. | HARD | REQ-MONITOR-155 |
| R-26 | Whether the scheduler is a tick loop, a reactive graph or an actor system; how the ledger is held in memory; which monotonic source is used. | FREE (bounded by R-01 to R-11, R-22) | — |

---
