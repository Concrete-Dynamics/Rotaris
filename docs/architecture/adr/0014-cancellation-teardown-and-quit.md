# ADR-0014 — Cancellation, teardown and the quit choreography

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01, under `owner-decisions.md` **SR-1** (one running instance), **SR-4** (the
  lock, the session state and the event store are one object) and the amendment of `REQ-SESSION-067`
  (no save is deferred), and to carry one measurement from the `ipc-hop-latency` spike that bears
  directly on the quit path. **The choreography is unchanged.** What changed is what a force exit can
  actually lose — consequence 2 was wrong on both of its clauses — and what can make the force-exit
  backstop fire for a reason that is not the run's fault.
- **Origin:** RUNTIME (ADR-RUNTIME-10)
- **Depends on:** ADR-0002, ADR-0005, ADR-0006, ADR-0008, ADR-0013, ADR-0058

## Context

`REQ-MONITOR-012` and `REQ-ORCH-132`: cancellation **first releases anything blocked on a person** —
pending questions, then pending approvals, approvals failing safe as **denied** — and only then stops
the run.

`REQ-SESSION-092`, `REQ-MONITOR-129` and `REQ-ORCH-132`: a cancel is a **graceful stop first**; if the
loop has not reached a stop check within **30.0 s** a hard cancel follows; a forced stop performs a
**second sweep** for work created during the first.

`REQ-SESSION-092` and `REQ-EVENTS-028`: the stop request is **sticky** — a cancel arriving before the
loop's callbacks are wired replays when they are; a caller that requested cancellation receives an
`interrupted` outcome even when the loop finished first, and reporting both an effective cancellation
and a successful run is forbidden; a cancellation raised from inside the run must still release the
lock and emit the terminal result.

`REQ-SESSION-094` fixes teardown as an **ordered pipeline that runs even on any exception**: the
`run_end` timeline entry, logging cleanup, **lock release**, construction of one run result,
publication of `session.end` then exactly one `result` — both over the bus while the sink is still
attached — a final notice about disabled hooks, and removal of every per-session binding.
`REQ-ORCH-098` adds that an interrupt requested **while a child is being torn down** must still take
effect.

`REQ-MONITOR-131`, `REQ-MONITOR-283` and `REQ-SHELL-121` fix application shutdown in checkable order:
polling stops; the run is cancelled with human blocks released first; queued follow-up jobs are
cleared; **the process does not exit until the run has reported its terminal result and finished
writing session state**. The force-exit backstop is **30 s from the quit request**, the same allowance
as the cancellation grace and composing exactly with it; a second quit request during that allowance
force-exits immediately; a force exit is the **only** case in which the ordered effects may be left
incomplete, **and it must be reported as such on the next start**. `REQ-MONITOR-255`: shutdown
requests **every** run handle to stop **before waiting on any** of them. `REQ-MONITOR-131` also fixes a
figure this record previously did not carry: **a restart that is not a shutdown waits at most 5 s** for
the previous run to finish before proceeding, which `REQ-MONITOR-287` states as the worker join cap —
5 s on restart, **unbounded at shutdown**. The two are different numbers for different events and must
not be unified with the 30 s allowance.

`REQ-SESSION-106` closes the background-run case in terms: quitting ends a background run "through the
ordinary cancellation and teardown path (`REQ-SESSION-092`, `REQ-SESSION-094`), so no run is ever left
holding a lock that this machine cannot reclaim." Under **SR-5** that sentence is doing real work — a
lock this machine cannot reclaim is the one condition that needs a person — so the quit path is where
the product earns it.

Two shutdown behaviours elsewhere differ deliberately and must not be unified: `REQ-GIT-101` requires
shutdown to **wait** for an in-flight checkpoint Git operation rather than killing it mid-call, while
`REQ-LIBRARY-127` requires shutdown to **abandon** the improvement analysis's provider call and must
not wait, and forbids handing that work to a durable out-of-process service that would outlive the
application. `REQ-STARTUP-046` and `REQ-SHELL-121` bound in-flight update work at **5000 ms**.

## Alternatives considered

**A — `AbortController` alone.** A fine primitive, an insufficient decision. It gives no ordering
(`REQ-MONITOR-012` fixes one), no fail-safe semantics for suspended approvals (`REQ-ORCH-132` requires
denial), no stickiness before listeners exist (`REQ-SESSION-092`), and no second sweep. It would end
up wrapped anyway.

**B — Cancellation by exception, unwinding the loop.** Attractive because teardown lands naturally in
a `finally`. But `REQ-ORCH-098` requires an interrupt raised *during* teardown to still take effect,
and `REQ-SESSION-094`'s step order must hold "even on any exception" — so the teardown cannot itself
be the exception path. And `REQ-ORCH-052`'s sweep must re-check per record because closing one
cascade-blocks another, which an unwinding stack does not express.

**C — An explicit `StopRequest` plus an ordered teardown pipeline.** Chosen.

## Decision

A per-run `StopRequest {requested, forced, reason}` set by the control channel or by shutdown. It is
**observable rather than thrown**, and it is **sticky**: setting it before the loop's callbacks are
wired replays when they are.

Stopping proceeds in the order `REQ-MONITOR-012` fixes: cancel pending questions, then cancel pending
approvals resolving each as **denied**, then request the loop's graceful stop, then arm a 30 s deadline
from the `MonotonicClock` of ADR-0006, and on expiry hard-cancel and run the second sweep.

Teardown is a fixed pipeline of `REQ-SESSION-094`'s eight steps, executed under a guard that cannot be
skipped by an exception, each step's failure logged and the pipeline continuing.

Three composition rules — the third added in the 2026-09-01 revision, on measured evidence:

1. **One deadline object serves both 30 s allowances.** `REQ-MONITOR-131` says the force-exit backstop
   and the cancellation grace fall due together; making them one `Budget` rather than two constants is
   what makes that true by construction rather than by two numbers that could drift.
2. **The quit path is main-driven, run-host-executed.** Main evaluates the window-close guards
   (`REQ-SHELL-119`), asks the run host to stop **every** run before waiting on any
   (`REQ-MONITOR-255`), and holds process exit until the run host reports teardown complete or the
   shared deadline expires. A second quit request during that window force-exits immediately. An
   incomplete force exit leaves live-looking locks, which the next start surfaces through stale
   detection and the repair announcement (ADR-0005) — that is how `REQ-MONITOR-283`'s "reported as
   such on the next start" is satisfied without a separate mechanism. **Under SR-4 that mechanism gets
   cheaper rather than harder:** the lock is a row in the same store as the session state
   (ADR-0005, ADR-0058), so "the lock says live, the process is gone" is one query on the next start
   rather than a file read that has to be correlated with a separate state document. The lock a force
   exit leaves names *this* machine, so it is reapable; SR-5's unreapable case is a lock naming another
   machine and is not produced by this path.

3. **Main is on the quit path, and main is the process the relay can wedge.** The `ipc-hop-latency`
   spike measured main relaying run-host traffic to the renderer and found that under an unthrottled
   terminal-frame load main's **event-loop lag reached 22,777 ms**, with the queue still draining for
   tens of seconds after the run host had stopped publishing, and with **nothing dropped and nothing
   reordered** — the relay degrades into unbounded latency, not into loss. A quit request is a main-side
   event. If main is that far behind, the 30 s backstop can fall due because *main* could not act on the
   request, while the run host has already stopped cleanly. **The force exit would then be attributed to
   a run that did nothing wrong**, and `REQ-MONITOR-283`'s obligation that the interface stay
   responsive and show how much of the allowance remains would fail with it. Two things follow and both
   are cheap. First, **the deadline is armed from the quit request and is owned by the run host as well
   as by main**, so a wedged main cannot also be the only holder of the clock. Second, the load that
   produces this state is bounded by ADR-0021's frame-rate cap, which the same spike shows is what keeps
   the relay inside its budget at all — so the quit path is one more consumer of that cap's guarantee.
   The measured rate at which the collapse begins is far above what the architecture licenses; this is
   recorded because it is a *shared-fate* property of the relay topology that no requirement covers, not
   because it is expected in ordinary use.

The workspace service participates in the same choreography with its own two rules: it **waits** for
an in-flight checkpoint Git operation (`REQ-GIT-101`) and for a Git refresh already under way
(`REQ-GIT-102`), and it **abandons** an in-flight improvement analysis (`REQ-LIBRARY-127`). Because
`REQ-LIBRARY-127` also requires the time from asking to quit to exiting not to depend on whether an
analysis was in flight, the workspace service must be a child that dies with the application and never
a detachable daemon.

## Consequences accepted

1. Approvals suspended at quit are resolved as **denied**, not left pending. That is the specified
   fail-safe direction and it means a user who quits mid-approval loses that tool call rather than
   having it silently permitted.
2. **What a force exit can lose is now much narrower, and this record's earlier statement of it was
   wrong on both clauses.** It read: "can therefore leave a partial trailing JSON line and up to a
   debounce window of unwritten state". Neither survives. There is no line-delimited runtime write path
   — `REQ-EVENTS-079` is withdrawn and the line-delimited form "moves whole to the export" — and there
   is no debounce, because `REQ-SESSION-067` now states that no save is deferred, parked or coalesced,
   and `REQ-SESSION-034` states the crash-loss budget **in saves**. `REQ-SESSION-028` makes a save
   all-or-nothing, so "every save that was requested and completed is durable, and every save that was
   interrupted is absent whole". **A force exit therefore loses at most one in-flight transaction, and
   can never leave a half-written record for a reader to find.** What it can still leave is: the ordered
   effects of `REQ-SESSION-094` incomplete (the permitted case); a lock row that reads live until the
   next start reaps it; and, on the two write paths that remain files, a truncated last line in **the
   session's log** (`REQ-SESSION-142`) and a summary rewrite that `REQ-SESSION-033`'s atomic replacement
   leaves as one of its two complete versions. *(Path citation corrected 2026-09-02: this named
   `evidence/debug.log`, which is withdrawn with the session-directory layout domain 18 carried.
   `REQ-SESSION-002` fixes three kinds of per-session file and no filenames.)* That is a materially better story than the one this record accepted and it is
   owed entirely to the store, not to this design.
3. The teardown pipeline runs in the run host, so main cannot observe its intermediate steps; it
   observes completion or the deadline. That is enough for `REQ-MONITOR-131`, which fixes what must
   have happened before exit, not what main must see happening.
4. Three processes must be sequenced at quit — main, the run host, the workspace service — with two
   different waiting policies among them. They must be implemented separately and must not be
   "simplified" into one. **SR-1 reduces the instance count to one but not the process count to one**,
   and SR-4 adds a shared object across two of the three: the run host and the workspace service both
   open the workspace store (OQ-2), so the quit sequence must also close two connections to one store
   in a defined order rather than leaving it to process exit.
5. **A launch arriving inside the force-exit allowance is a state nobody owns.** Under SR-1 a second
   launch is handed to the running instance and must surface a window while writing nothing and showing
   no dialog, banner, acknowledgement or error (`REQ-STARTUP-161`, `REQ-STARTUP-162`); where the
   instance holds the record but has no window open, `REQ-STARTUP-162` requires it to **build and show
   one**. During the 30 s allowance this instance still holds that record and is about to exit. Building
   a window in a process that will force-exit within seconds is the wrong outcome, and refusing the
   handover silently is also wrong, because `REQ-STARTUP-162` forbids the launch reporting anything.
   Neither `REQ-MONITOR-131` nor `REQ-STARTUP-161` to `REQ-STARTUP-164` says which wins. **This is a
   real gap opened by SR-1 and it is raised rather than architected around**, because every available
   answer is user-visible.

## Revisit if

Measurement shows real runs routinely needing more than 30 s to reach a stop check, making the hard
cancel the normal path rather than the backstop. The figure is fixed by `REQ-SESSION-092` and
`REQ-MONITOR-129`, so that would be a specification change, not a design change. **Or** measurement
shows main's relay backlog is reachable at licensed load, in which case rule 3's shared deadline stops
being a defence and the quit path needs main off the traffic path altogether — the direct message port
ADR-0043 and ADR-0044 already name as the remedy. **Or** the launch-during-quit case of consequence 5
is answered in a way that requires the instance to keep serving handovers while shutting down, which
would make the quit path hold the single-instance record rather than release it at exit.

## First execution — 2026-09-03, the stop request, the deadline and the teardown pipeline

*Recorded under GD-10.*

**Built and run:** `StopRequest` as decided — observable, never thrown, sticky (a listener wired after the
request is replayed at once; a request before the loop exists skips the agent runtime, `REQ-SESSION-091`),
a second request able only to raise `forced`. On request the in-flight model call's abort signal fires and
**one `Budget` of 30 s** is armed from the monotonic clock; on expiry the request is re-raised forced. With
no tools in flight the graceful stop is the abort of the stream, so the deadline never fires in practice;
the test proves it is armed and that it fires the force by itself at 30 s. Teardown is `REQ-SESSION-094`'s
pipeline under a guard: a step that throws is logged and the pipeline continues; tested with an
iteration that raised and a teardown step made to throw, and the lock was still released and the pair
still recorded. Shutdown asks every run to stop before waiting on any (`REQ-MONITOR-255`) and the run
host's reply to main's bounded `shutdown` follows their terminal results, which is what lets main hold
process exit until the run has reported (`REQ-MONITOR-131`).

**Found: nothing in this record.** Rule 3's shared-fate case (a wedged main) is not reachable at this load.
**Not exercised:** the second sweep (nothing to sweep); the workspace service's two waiting policies; the
force-exit backstop from main's side; consequence 5's launch-during-quit.
