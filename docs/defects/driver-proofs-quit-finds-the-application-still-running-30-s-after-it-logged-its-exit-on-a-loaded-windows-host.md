## driver-proof's quit finds the application still running 30 s after it logged its exit, on a loaded Windows host

`pnpm driver-proof`'s step 12 sends the driver's `quit` and waits 30 s for the launched process to exit (`exitWithin`). On
2026-11-01, on the owner's Windows 11 ARM64 machine with the CPU reading 100 % (other sessions' work and browsers beside it),
the check went red in four of four runs on one launch or the other: the application log ends orderly within about four
seconds of the quit (`quit: requested`, the run host and the workspace service `exited (0)`, `main process exiting with
status 0`, `quit: exiting with status 0`), the endpoint file is removed, and the process is still not reaped 30 s later
("still running after 30 s"; in launch 13 "still running after 60 s", while the store showed the run at rest with
`application_shutdown`). Once the harness's SIGTERM and SIGKILL were both not reaped within 15 s. The next launch of the same
run then failed its run host's hello bound (`NoReplyWithinBound: no reply to hello within 5000 ms`), which is
[the hello-bound note](../archive/defects/a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md)'s shape.

**Not caused by R-091's bundle A1.** Reproduced on a build of `origin/main` at `6a7f5088` driven by `main`'s own
`driver-proof.mjs` (first launch's quit red, second launch's hello red), and on the bundle's build with `app.enableSandbox()`
removed. Whether the process that lingers is Electron's main process or a child the harness waits on, and whether it ends
later on its own, was not measured; the cause is unidentified. A run of the same proof earlier the same evening passed the
first launch's quit with the same build, so the reading depends on the host's load.

**Observed again, 2026-11-03, in `pnpm questions-proof`'s `stale` launch** (R-093's proof sweep; `499a78c0` under the
seventeen-suite sweep, then `4edb333b` alone): the capture's 120 s wait for a result the stale scenario never delivers
timed out at 00:14:15, the application logged its orderly quit by 00:14:17.7 (`run host exited (0)`, `main process exiting
with status 0`), and the proof's 150 s `spawnBounded` bound still found it running: in the sweep "neither SIGTERM (10003 ms)
nor SIGKILL (5009 ms) was reaped", alone "SIGTERM ended it after 7278 ms". The product's own probes were right both times
(the stepper present, "Could not deliver answers. The waiting agent is no longer available.", Submit enabled, `stale.png`
captured), so the red is this note's shape and not the question flow's.

Seen again 2026-11-03 in `pnpm workspace-proof`'s `init-quit` launch, twice on one build of `f2143904` (Windows 11 ARM64,
Node 26.13.0, two other sessions' builders on the host, the proof run alone each time): the REQ-WORKSPACE-092 / 109 check
"an orderly quit during a setup step completes within 5000 ms" read the process gone 9222 ms after the driver's quit in one
run and not within 15 s in the other, while the application's own log put `quit: exiting with status 0` 2.6 s and 3.7 s
after `quit: requested` — the setup's cancelled create step terminated in 3978 ms and 4905 ms, the run host and the
workspace service exited 0 — so the seconds past the bound fall after the exit was logged, the shape above. Every other
check of the launch passed (49 of 50, 5 skipped).

Seen again 2026-11-03 in `secure-windows-and-fuses`' review (the hardening orchestration, on the Windows host): `pnpm
driver-proof`'s exit-trace launches, both the orderly quit and the crash quit, found the application still running past
the bound after it had logged its exit, the shape above.

## Specs

PD-ORCH-005 clause 9 and REQ-SHELL-121 (the application's quit ends the process), if the lingering process is the
application's; none, if it is the harness's wait.

## Relevant files

- `apps/desktop/scripts/driver-proof.mjs` — step 12 (`quit is the application's quit`) and launch 13's `the quit during a
  live run exits`.
- `apps/desktop/scripts/lib/bounded-launch.mjs` — `exitWithin`, the wait.
- `apps/desktop/src/main/exit.ts` — `exitAfterChildWindows`, `endBeforeMain`: the orderly end the log shows completing.
