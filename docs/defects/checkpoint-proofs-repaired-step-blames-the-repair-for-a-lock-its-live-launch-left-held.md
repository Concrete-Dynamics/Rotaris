## checkpoint-proof's repaired step blames the repair for a lock its live launch left held

`pnpm checkpoint-proof` failed on Linux in the sweep of 2026-09-28 at step (d), `repaired`, with "the stale session
reads running, not interrupted". A lone re-run on a quiet host passed. The sweep tree was `392f681`.

The scenario has two launches. Step (c), `live`, resumes the session with `wait:20000,answer` and exits mid-run.
That leaves the session `running` behind a lock that names the live launch's **run host**. Step (d), `repaired`,
opens the Git view, whose checkpoint listing must repair the session (REQ-GIT-094). The repair is due only when the
pid in the lock probes dead (REQ-SESSION-056, REQ-GIT-093, REQ-GIT-160).

In the failing run, `live.log` ends at `main process exiting ... 23:46:15.057` with no `run host exited` line.
`repaired.log` opens with `instance claimed ... 23:46:15.285`, 0.22 s later, and has no repair line. The passing
re-run's `live.log` has `run host exited (0)` before main's exit. The failing run is the signature of the
product defect recorded and repaired the same day in
[`a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md`](fixed/a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md).
Before that repair, main left before its run host, and Electron's teardown of the run host took 1.57 to 1.81 s in
three launches of nine. Here, the next launch opened the session inside that window. The live launch's run host
still answered to its pid, so the listing read the session as **live**, as REQ-GIT-093 requires, and made no repair.
The repair (`459e7c8`, `endBeforeMain` in `apps/desktop/src/main/exit.ts`) was not yet in `392f681`. On `main`
(`fa377e6`) the proof passed at the first attempt: the run host exited before main, and the repair happened 1.5 s
into the next launch.

So the product was not wrong at step (d): it correctly refused to repair a session whose lock holder was still
alive. **The harness defect is that the proof never checks the precondition it states.** Its header says the live
launch leaves "a persisted-running session with a dead lock". Step (c) checks only that the session reads
`running`. It never checks that the pid in the lock is gone. A lock that outlived its application therefore shows
up one launch later, blamed on REQ-GIT-094's repair, instead of at step (c) with the requirement it actually
breaks. Two things made the triage harder than it needed to be:

- The failure message names the wrong mechanism.
- Once the evidence directory was overwritten, the failing run's logs were the only evidence that the holder had
  outlived main.

This is not a fixed-offset flake. Step (d)'s repair happens on the Git view's first listing, before the step's own
select at 3 000 ms, in every log read here. The select only re-chooses the session that is already selected.

## Specs

The harness mis-states what it measures. The product contradicts no requirement at `fa377e6`. At `392f681`, the
lock outlived the application for as long as its run host took to exit. That is the defect already recorded in
fixed/, where REQ-SESSION-047 and REQ-SESSION-056 make a live pid binding. REQ-GIT-093 and REQ-GIT-094 behaved as
written in both trees: a lock holder that answers is live, and a live session is not repaired.

## Relevant files

- `apps/desktop/scripts/checkpoint-proof.mjs`: step (c) `live` and step (d) `repaired`; the header's "dead lock".
- `apps/desktop/src/main/exit.ts`: `endBeforeMain`, the product repair that closed the window.
- `packages/engine/src/sessions.ts`: `liveness` and `repairOne`, the probe and the repair step (d) measures.
- `apps/desktop/scripts/sessions-proof.mjs`: the same `live`-then-repair pair (launches 2 and 3), with the same
  unchecked precondition.
