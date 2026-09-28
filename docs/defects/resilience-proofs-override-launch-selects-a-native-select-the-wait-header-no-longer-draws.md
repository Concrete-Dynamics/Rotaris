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
