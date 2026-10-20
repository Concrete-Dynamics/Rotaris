## checkpoint-proof's repaired step blames the repair for a lock its live launch left held

`pnpm checkpoint-proof` failed on Linux in the sweep of 2026-09-28 at step (d), `repaired`, with "the stale session
reads running, not interrupted". A lone re-run on a quiet host passed. The sweep tree was `392f681`.

The scenario has two launches. Step (c), `live`, resumes the session with `wait:20000,answer` and exits mid-run.
That leaves the session `running` behind a lock that names the live launch's **run host**. Step (d), `repaired`,
opens the Git view, whose checkpoint listing must repair the session (REQ-GIT-094). The repair is due only when the
pid in the lock probes dead (REQ-SESSION-056, REQ-GIT-093, REQ-GIT-160).

In the failing run, `live.log` ends at `main process exiting ... 23:46:15.057` with no `run host exited` line.
`repaired.log` opens with `instance claimed ... 23:46:15.285`, 0.22 s later, and has no repair line. The passing
re-run, on the same tree, logs `run host exited (0)` 5 ms **after** main's exit (`live.log` lines 79 to 81:
`main process exiting` at 23:48:34.628, `run host exited (0)` at 23:48:34.633). On that tree main always left
first; what separates the two runs is how long the holder lagged behind it. In the pass the lag was 5 ms. In the
failure the exit is not logged at all, so the holder outlived main's logger and was still alive when the next
launch was claimed 0.22 s later. The failing run is the signature of the
product defect recorded and repaired the same day in
[`a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md`](a-session-lock-outlives-the-application-that-held-it-for-as-long-as-its-run-host-takes-to-exit.md).
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

## Repaired — 2026-09-28 under R-062

**The product needed no repair here.** The red was the lock-outlives-its-application defect, which `459e7c8` had
already repaired. The repair made here is to the harness. Step (c) now checks the precondition the header states.
Right after the `live` launch returns, the proof reads the pid in the session's lock and probes it once
(`lockHolderAfterExit`, `apps/desktop/scripts/lib/lock-holder.mjs`). A holder that is still alive fails step (c) at
once. The failure says how long the holder outlived main, up to a 10 s bound, and names REQ-SESSION-047/056 and
REQ-GIT-093 (`describeLingeringHolder`).

The helper **does not wait for the holder and then pass**. Since `endBeforeMain`, the product guarantees that main
is gone only after its run host, so the proof asserts exactly that guarantee. Waiting would have hidden a regression
of it. `results.json` now records the lock's pid (`live.lockPid`, `live.lockHolderGoneAtExit`). If step (d) still
fails after a holder was dead, the failure says so and quotes the outcome of the session select, which is reported
and not asserted.

No assertion was weakened. Step (d)'s five checks are unchanged: status, lock released, timeline entry, the two log
lines. The select offset stays at 3 000 ms. In all five logs read (the sweep's passing run, the reproduction and the
three runs here), the repair came from the Git view's first listing, 1.3 to 1.6 s into the launch, before the select. So the offset is not
what this proof depends on, and moving the launch onto the driver would not have changed this red.
`sessions-proof`'s launches 2 and 3 are the same `live`-then-repair pair and gained the same check, under that
proof's own note.

**Pinned by** `apps/desktop/scripts/lib/lock-holder.test.ts`, 5 cases:

- a holder already gone is read once, never waited on;
- a holder that goes 1 750 ms later still fails, and its sentence names the time and the requirements;
- a holder that never goes is bounded at 10 s;
- given the `live` launch's log, the sentence says whether main logged its run host still running when the 2 s
  bound for its end (`RUN_HOST_END_BOUND_MS`) elapsed. The product guarantees the holder gone at main's exit only
  within that bound, so on a host loaded enough to exceed it step (c) fails, truly, and the sentence tells that
  case apart from a main that left without waiting;
- over a real child process, the probe answers alive, then dead after the child's exit, and never probes a pid ≤ 0.

**Shown on the built app**, `fa377e6` plus this change, as root under Xvfb, Node 24, after one `pnpm build`:
`node apps/desktop/scripts/checkpoint-proof.mjs --skip-build` passed three times in a row, exit 0 each time. The
runs took 166 s, 165 s and 168 s, at load 0.5 to 1.4. After runs 1 and 2, `ps` counted 8 Electron processes on the
host, and after run 3 none. Which tree they belonged to was not recorded. The sweep's worktree may have been running
proofs.

| Run | Lock pid | `run host exited` → `main process exiting` | Next launch claimed | Repair logged at |
|---|---|---|---|---|
| 1 | 26303 | 2 ms | +200 ms | +1.52 s |
| 2 | 30518 | 2 ms | +209 ms | +1.48 s |
| 3 | 1389 | 4 ms | +263 ms | +1.81 s |

Each `results.json` holds all twelve scenarios through `disabled`.

**Re-run at the later branch head** (after `6232e35`, the log-reading failure sentence, and after the second round's
`sessions-proof` commits, which change nothing this proof runs). The same build and `--skip-build`. Three more runs
in a row exited 0 in 168 s, 170 s and 169 s, each with all twelve scenarios through `disabled` (lock pids 11780,
16300, 22540). The load at the start was 1.2 to 4.7, with 16 or 17 Electron processes from another tree running.

**Not shown:** the new check failing on the built app. The window closed with `459e7c8`, and it was not reopened
to watch the check fire. Its failure path is shown only by the unit cases above.

## Addendum, 2026-10-20 — on Windows

The Windows ARM64 session's C2 (Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, Git Bash, at `30d35b3c`) ran `checkpoint-proof` three times. The check this repair added held each time: the `live` launch's lock holder was dead at the first probe, and `repaired` read `interrupted` with the lock released and the notice raised. The runs stopped later, at `loaded-restore` and `isolated-restore`, on steps placed at fixed offsets a slower Git outran ([`checkpoint-and-sessions-proofs-time-their-steps-by-fixed-offsets-a-slower-git-outruns.md`](../checkpoint-and-sessions-proofs-time-their-steps-by-fixed-offsets-a-slower-git-outruns.md)).
