## `resilience-proof`'s override launch selects a native `<select>` the wait header no longer draws, and the launch never ends

Scenario 4 of `apps/desktop/scripts/resilience-proof.mjs` (`override`: a quota exhaustion with no candidate, then a
model chosen from the wait header) drives the header with `ROTARIS_CAPTURE_CLICKS: '.wait-header .btn-secondary>>Change
model'` and `ROTARIS_CAPTURE_SELECT: '.wait-header select>>beta'`. The click lands — the log reads `capture: clicked
"Change model"` — but the chooser the header draws in its place is a `DesignSearchableSelect`
(`packages/ui/src/WorkspaceView.tsx`, `ariaLabel="Change model"`), not a native `<select>`, so the select seam answers
`capture: select .wait-header select = beta → no such control`, no model is chosen, and the run keeps the indefinite
wait REQ-NOTIFY-092 specifies. `ROTARIS_CAPTURE_WAIT: 'result'` then never fires. The same shape as defect 122
(`config-proof` driving a `.seg-opt` that `PD-CHAT-001` replaced with a chip): the seam missed a control the design
system replaced, and the proof accuses a mechanism that was never exercised.

A second fact, observed on the same run and not traced: the launch's `spawnSync` timeout (180 s) sent SIGTERM and the
Electron process was still alive 649 s after its start; only SIGKILL ended it, after which the proof threw `override
exited SIGKILL`. The log holds no `quit: requested (before-quit)` line, so the signal never reached the application's
quit path (Chromium as root under Xvfb, or the harness's kill, is the suspect; not decided here). A launch that waits
on a condition that cannot come therefore hangs the proof rather than failing it in 180 s.

Measured 2026-09-28 as root under Xvfb on Linux, Node 24, on `fix-proofs-linux` after `hostSwitches` let the proof
launch at all. Scenarios 1 to 3 passed; scenarios 5 to 7 are unmeasured behind this one.

## Specs

None contradicted by the product: the wait header offered the chooser and the run waited as REQ-NOTIFY-092 says. The
defect is the proof's — a seam addressed to a control that no longer exists — plus the harness's inability to end a
launch that overran its timeout.

## Relevant files

- `apps/desktop/scripts/resilience-proof.mjs`: scenario 4's `ROTARIS_CAPTURE_SELECT`, and `launch`'s 180 s `spawnSync` timeout.
- `packages/ui/src/WorkspaceView.tsx`: the wait header's `DesignSearchableSelect` behind "Change model".
- `apps/desktop/src/main/capture/seams.ts`: the `select` seam, which addresses a native `<select>`.
- `apps/desktop/scripts/lib/driver.mjs`: the driver's `waitFor` and `select`, the design-system-aware path other proofs took.

Noticed 2026-09-28 while re-running the proofs on Linux under R-062. Not repaired: outside that item.

## Repaired — 2026-09-28, under R-062

**The chooser.** Scenario 4's first launch is driven through `lib/driver.mjs` (`drivenOverride` in
`resilience-proof.mjs`). It types the prompt once the composer holds the caret and reads the wait header once it is on
screen. It presses "Change model" and chooses `beta` in the `SearchableSelect` the header draws, by two real clicks
through the driver's `choose`: the trigger `.wait-header button[aria-label="Change model"]`, then the option carrying
`data-value="beta"`. It then waits for the session to settle in the store. The assertions are the same:
REQ-NOTIFY-263's indefinite-wait header, the `model_wait` issue, `model_override` naming `beta`
(REQ-NOTIFY-089), the system row, no same-tier fallback, and the calls moving to `scripted-b/beta`. The relaunch and
resume keeps its capture seams, which wait on deadlines. Each step lands in `override.steps.json`.

**The overrun.** Every launch of the proof is now bounded, and none goes through `spawnSync`. The ten launches the
capture seams drive go through `spawnBounded` (`lib/bounded-launch.mjs`): a launch past its timeout gets SIGTERM, a
10 s grace, then SIGKILL to its process group. The driven override launch is bounded by the driver's own ending: its
steps by a 180 s bound (a store wait still polling is abandoned with them), `startApp` ends a launch whose driver
never answers, and `stopApp` asks for the closing picture and sends the driver's quit each within 10 s, allows 15 s
to exit, then ends the application by SIGTERM, the same grace and SIGKILL (`endOverrun`). Either way the proof reports
a failure naming the bound, what ended the launch, and the last thirty lines of its log; the override launch also
fails, as the others do, on a non-zero exit or a missing screenshot. While a `spawnBounded` launch is live, a SIGINT,
SIGTERM or SIGHUP to the proof SIGKILLs the launch's group before the proof dies of the signal, because the launch
leads its own process group and a Ctrl+C to the proof no longer reaches it. `lib/bounded-launch.test.ts` and
`lib/driver.test.ts` pin these against real child processes and a socket that never answers. (The driven launch's
bounds, its exit and screenshot checks, its log tail and the signal handling were added in the verification round:
the first form's `stopApp` waited on the quit without a bound, and an interrupted proof left its launch running.) The
proof has no shared launch helper (`harness.mjs` says why), so the helper sits in `lib/` for the others. Every scenario now runs
to its end whatever the one before it did: a failure goes into `results.json`'s `failures` and the proof exits 1 at
the end.

**Why SIGTERM did not reach the quit path.** It did. The signal was not ignored. `spawnSync`'s timeout closes its
ends of the child's pipes as it signals. The quit path's first line (`quit: requested (before-quit)`) then met
EPIPE, and main's uncaught-exception handler logged that failure to the same closed stream, again and again, at full
CPU. A launch whose pipes stay open quits on SIGTERM in about 60 ms with `quit: exiting with status 0`. The log
showed no `before-quit` line because the pipe that line needed was already closed. The product defect is recorded,
not repaired: [`a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md`](a-quit-with-its-standard-output-closed-loops-on-its-own-epipe.md)
(repaired 2026-09-29 under R-067)
(REQ-MONITOR-131's 30 s backstop never fires). `bounded-launch.test.ts` pins that `spawnBounded` keeps the pipes open
across SIGTERM, so a quit line reaches the proof.

**Evidence.** `pnpm resilience-proof --skip-build` under Xvfb, as root on Linux, Node 24, with another agent's Electron
proofs running in a different worktree, exited 0 in 3 min 29 s. All ten scenario blocks (eleven launches) passed, scenarios
4 to 7 included: `override` in 13 s (the choice made 1.6 s in, the run settled 2.4 s later), `unresponsive` 36 s,
`unresponsive-no-fallback` 37 s, `child-timeout` 50 s, `child-timeout-no-fallback` 46 s, `transient` 6 s, `fatal` 3 s.
No product red appeared in scenarios 4 to 7. The overrun path was exercised against the real application in a
scratch launch with scenario 4's old seams (the native `select` the header does not draw) and a 25 s bound. The
launch was ended at 25 s by SIGTERM, which it answered in 57 ms with `quit: requested (before-quit)` and exit 0, and
it was reported as `override overran its 25000 ms bound: SIGTERM ended it after 57 ms.` with its log tail. The
SIGKILL step is pinned by the unit test against a child that ignores SIGTERM. It was not reached by the real
application, which answers SIGTERM whenever its pipes are open.

Re-run after the verification round (the driven launch's bounds, its exit and screenshot checks, the signal handling),
same host and command, with another agent's transcript proof running in a different worktree: exit 0 in 3 min 29 s,
all ten scenario blocks passed (`override` 13 s: the chooser driven as the design-system kind 1.5 s in, the run
settled 2.4 s later, `override.png` present). The driven launch's failure path was exercised against the real
application in a scratch copy of the proof that asked the chooser for a model it does not offer, with a 40 s bound:
it failed after 17 s with `override: nothing matched "[role=\"option\"][data-value=\"gamma\"]" within 15000 ms`
followed by the log's last thirty lines, which end on the driver's `screenshot → ok`, `quit → ok` and
`quit: exiting with status 0`; no process of that launch was left. `stopApp` against a socket that never answers, and
an interrupted proof, were reproduced from the verifier's own scripts: `stopApp` returned in 12 s with the quit
unanswered and SIGTERM having ended the child, and SIGINT, SIGTERM and SIGHUP to the proof's group each left no
launch behind, the proof dying of the signal.
