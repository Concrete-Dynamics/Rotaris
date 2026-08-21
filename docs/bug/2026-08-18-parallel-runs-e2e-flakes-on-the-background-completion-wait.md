# A background run's completion notice is wiped by the next run starting

**Status:** Fixed 2026-08-18. Filed as a test flake; it was a product defect.

**Found:** 2026-08-18, while gating the Plan 05/06 slice · **Severity:** Medium ·
**Platform:** Linux, seen locally; not yet characterised on CI

## What happens

`apps/rotaris/tests/test_parallel_runs_e2e.py::test_background_completion_notifies_without_disturbing_the_focused_run`
fails intermittently on a `waitUntil` that times out after 5 s, usually with
`asyncio.exceptions.CancelledError` reported from the Qt event loop at teardown:

```
E       pytestqt.exceptions.TimeoutError: waitUntil timed out in 5000 milliseconds
apps/rotaris/tests/test_parallel_runs_e2e.py:328: TimeoutError
TEARDOWN ERROR: Exceptions caught in Qt event loop:
asyncio.exceptions.CancelledError  (x4)
```

The test is marked `serial` — it "needs real CPU headroom (drives concurrent runs
and asserts on their interleaving)" — but the failure is **not** only a
contention effect: it reproduces with the file run on its own, with nothing else
on the machine.

## It is not a regression, and the rate says so

Measured by running the file's serial selection six times in isolation on each
side, same machine, back to back:

| Revision | Failures |
| --- | --- |
| `origin/master` (`01defdf`) | **4 / 6** |
| `claude/six-plan-refactor-0sajbm` (`9c8dd67`) | **1 / 6** |

So the branch is not the cause; it is, if anything, less prone. The plausible
reason is incidental: that branch makes the requirement engine's read
substantially faster (SWR-3223), which leaves more headroom inside the 5 s
window on a machine doing several things at once. That is a symptom of the same
underlying fragility, not a fix for it — a test whose pass depends on how fast an
unrelated subsystem is has no margin worth relying on.

## Why it matters

A test that fails one run in three teaches the team to re-run rather than to
read. This one guards a real product claim — a background run completing must
notify without disturbing the focused run — so the cost of it being ignored is
that the claim stops being checked.

## Where to start

The wait at `test_parallel_runs_e2e.py:328` is the symptom, not necessarily the
cause. The `CancelledError`s at teardown suggest the asyncio tasks driving the
background run are being torn down while the assertion is still waiting for the
notification they produce — so the question is whether the notification is
genuinely late, or whether the test's completion signal can be missed when it
arrives before the wait is armed. The second shape would be the same defect
class as the bridge race fixed in
`57cfa02 fix: a finished pass retires itself and never the one that replaced it`.

Not fixed at the time of filing: it was outside the Plan 05/06 slice, and fixing
a concurrency test's timing without knowing which of those two it was would just
have moved the flake. It turned out to be neither — see the resolution below.

---

## Resolution (2026-08-18): it was not a test bug

**`MainWindow._run_started` cleared the standing notice unconditionally.** That
is right for the banner the new run replaces — a stale "Run completed — review
the transcript" must not follow the user into the next run — and wrong for a
notice about a *different* session, which is news nobody has read.

The interleaving: session B is running, session A finishes in the background and
publishes its completion notice, and B's `run_started` — which crosses from the
run thread and can land at any point — clears it. Nothing republishes it. The
user is never told that A finished.

That is **SWR-2415 AC-010** ("when a run that is not currently focused
completes, a non-blocking notification appears"), silently unmet whenever the
timing lands that way.

### How it was pinned down

The evidence that settled it was the failing run's final state: session A
`completed`, session B `running` and focused, `active == [session_b]` — every
assertion the test makes afterwards would have passed — and `notice=None`. The
notice was not late and not superseded by another notice; it was gone. In a
passing run it arrives 0.12s after the release, nowhere near the 5s deadline, so
"slow" was never the explanation.

Two rounds of instrumentation made the test pass 8/8 and then 10/10 — the
timing is that tight — which is why the reproduction that mattered was
**deterministic**: publish a background-completion notice, call `_run_started`
for another session, watch it disappear. No threads, no waiting.

### The fix

`UiNotice` gained `session_id` — which session a notice is *about*, empty for
the ordinary case. `_run_started` clears the standing notice only when it is
unscoped or belongs to the run being started; another session's stays.

Measured interleaved on one machine, uninstrumented serial selection:

| | Failures |
|---|---|
| without the fix | **3 / 12** |
| with the fix | **0 / 30** |

Regression cover is `test_a_second_run_starting_does_not_wipe_another_sessions_completion_notice`,
which drives the order by hand rather than waiting for it. Mutation-checked
against three breaks: restoring the unconditional clear, never clearing at all
(the over-correction), and the notice forgetting which session it names.

### What this leaves

The e2e that surfaced it is unchanged, and still marked `serial` for the reason
its own comment gives. If it flakes again it is a *different* defect, and the
5s deadline is still generous against a 0.12s answer.
