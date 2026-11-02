## A session's lock outlives the application that held it, for as long as its run host takes to exit

A session opened in one instance of the application is refused to the next instance with "Session S1200 is held by
another run in this application (pid 27377). Finish or stop that run first." when that next instance opens it within
about a second and a half of the first instance's main process exiting. The pid named is the FIRST instance's run
host — a utility child that main's exit does not wait for — and the lock's liveness check finds it still answering.
No run holds the session; a process that is shutting down does.

Seen 2026-09-28 in `transcript-proof` on Linux as root: the invariance launch's main exited at 08:07:11, its run host
(pid 27377) was still alive at 08:07:14.267 when the behaviour launch — a separate process the proof started once
`spawnSync` had returned — opened the same session, and the open was refused with the message above. The proof's four
earlier runs that day did not hit the window; the fifth did. The proof now waits for a launch's children to be gone
before the next launch (`apps/desktop/scripts/transcript-proof.mjs`, `launch`), which removes the race from the harness
and leaves the behaviour in the product.

Whether a person can meet it: REQ-STARTUP-161 keeps one instance per user account, so two instances do not run
together — but a quit followed by an immediate relaunch (the update restart of REQ-STARTUP-123, a crash's recovery, a
user re-opening the app) puts the new main process's session open in the same window if the old run host has not yet
exited. The message would then tell the user another run holds the session when nothing does, and the resume would be
refused until the next attempt.

## Specs

REQ-SESSION-186 and the lock's own rule (the run host holds a session while a run uses it; `packages/engine/src/sessions.ts`,
`lock-held-local`) — neither says the hold must end with the application that made it; the hold is keyed on the run
host's pid and released by its exit, and main does not wait for that exit before it is gone itself (`main/exit.ts`
races each child's shutdown against its exit, by design, PD-MONITOR-002's round). Not a contradiction of a stated
requirement; recorded as a window a reading of "is held by another run in this application" does not expect.

## Relevant files

- `packages/engine/src/sessions.ts` — the `lock-held-local` refusal and its pid liveness check.
- `apps/desktop/src/main/exit.ts` — the quit racing each child's shutdown against its exit.
- `apps/desktop/scripts/transcript-proof.mjs` — `launch` now waits for a launch's children before the next launch.

## Repaired — 2026-09-28 under R-062

**The choice: main waits, bounded, for the run host's exit before it is gone itself** (`endBeforeMain`,
`apps/desktop/src/main/exit.ts`). The other shape — the run host releasing every lock as the first step of its shutdown,
and the liveness check treating a holder that has begun shutting down as gone — was not taken, for four reasons read
from the record rather than chosen for size:

- **It would not have reached the case that was seen.** The launch in `transcript-proof` ended through the capture
  seam, which is an immediate exit (`exitCleanly` → `app.exit`, like the driver's `quit`): main asks the run host
  nothing on that path, so a release inside the run host's `shutdown` never runs. The run host was simply left to
  Electron's teardown, which took 1.57–1.81 s after main's exit in three launches of nine measured on this host (0–1 ms
  in the other six).
- **REQ-SESSION-047 and REQ-SESSION-056 fix the liveness test** — a lock is proved unheld only when its pid probes dead,
  and "the pid probes alive" is named among the cases in which it MUST be respected. "Begun shutting down" is not in
  that test, and a second reading of liveness is what REQ-SESSION-056's last sentences forbid.
- **Holding the lock is owning the session (REQ-SESSION-050)**, and a run stopping for shutdown is still writing its
  history under it (the runtime view's §6: the lock is released at the end of cleanup, after `session.end` and `result`,
  because REQ-EVENTS-098 makes the right to write the right to hold). Releasing first would let a relaunch take a
  session whose previous run is still writing it.
- **REQ-SESSION-049 orders the release after the session's long-lived services** (MCP servers, language servers) are
  torn down.

**What `exit.ts`'s race is, and why waiting does not undo it.** PD-MONITOR-002's round made the quit race each child's
`shutdown` against its exit because the ANSWER can be lost to the exit (3 quits in 26); the exit counts as the answer.
That is a reason not to wait for an answer that may never come, not a reason to leave before the exit. After an
answered `shutdown` the run host exits on a 0 ms timer, so waiting for that exit costs the timer.

**What changed.** An immediate exit (`exitCleanly`) ends the run host (`utilityProcess.kill()`, which Electron reports
as exit 0) and waits for its exit, at most `RUN_HOST_END_BOUND_MS` (2 000 ms), before `app.exit`. The orderly quit
(`window-all-closed`), after the run host's and the workspace services' `shutdown`, waits up to the same bound for the
run host to exit by itself, ends it only if it has not, and waits the bound again before `app.quit()`. A run host still
running after that is said once at `error` and main goes regardless. Nothing in the run host, the lock, the liveness
probe or the run's pause/stop/settle paths changed. A lock a killed run host leaves names a pid that is gone, which is
the one case REQ-SESSION-047 reaps — the crash path, taken deliberately. Because main is now gone only after the run
host, a launch reaches the old instance (REQ-STARTUP-161/164) until the run host is gone, and then finds its pid dead.

**Pinned by** `apps/desktop/src/main/exit.test.ts` (six cases over the clock port: an immediate exit ends the run host at
once and resolves before the ~1.75 s Electron would have taken, with the holder's pid then probing dead; an answered
shutdown's own exit is waited for and nothing is ended; a run host still running when the grace elapses is ended; one
that does not exit even then is said once and main is not held past the bound; one already gone is neither ended nor
waited on; a kill that throws is not a failure of its own). The engine's existing
`session-resume.test.ts` case ("reaps one dead local lock and preserves live local and foreign holders") is what makes a
dead pid open the session.

**Shown in the built app, once, under Xvfb (scratch drivers, not kept as a proof).** Five capture launches ended
through `app.exit`: the run host's pid probed dead 0 ms after main's exit in all five (before: 1 730, 1, 1 806, 1 573,
0, 0 ms, and three more not alive at main's exit). A driven launch that started a session (`session.start` → session
`8c7ff246-…`), then closed its window: main was gone 103 ms after the close, the log reading

    [main 2026-09-28T16:11:36.212Z] info    run host exited (0); NOT re-forked — …
    [main 2026-09-28T16:11:36.217Z] info    quit: requested (before-quit)
    [main 2026-09-28T16:11:36.220Z] info    quit: exiting with status 0

— the run host's exit before main's own quit — and a capture launch started the moment main was gone resumed the
latest session (`capture: opened session "latest" from the browser`) and ran it, with no "held by another run" line.
The refusal itself was not reproduced on demand before the repair: in the three unrepaired relaunches driven at once, the old run
host happened to be gone before the new launch opened the session, which is why the proof had met it once in five runs.
`transcript-proof`'s own wait for a launch's children stays, as a guard that now finds nothing to wait for.
