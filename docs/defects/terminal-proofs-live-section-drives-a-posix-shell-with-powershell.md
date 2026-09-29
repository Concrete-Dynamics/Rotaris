## `terminal-proof`'s live section drives a POSIX shell with PowerShell, so off Windows four of its checks measure nothing

`pnpm terminal-proof`'s live section (Part AL2, then T2) runs the product's terminal manager, run-host handler and
delivery limiter in `apps/desktop/scripts/terminal-proof/harness.mjs`. That harness is a Node child over the host's
real shell. The harness reports which shell it got (`ready.shell`, recorded as `results.live.shell`), and REQ-TOOLS-104
gives every host but Windows the POSIX backend, `/bin/sh`. But three of the commands `terminal-proof/main.cjs` sends it
are PowerShell:

- the size probe: `Write-Output "cols=$($Host.UI.RawUI.WindowSize.Width) rows=$($Host.UI.RawUI.WindowSize.Height)"`
- the motion command: `1..40 | ForEach-Object { "motion $_"; Start-Sleep -Milliseconds 55 }`
- the throughput flood: `1..10000 | ForEach-Object { "line $_" }; cmd /c "exit 3"`

On Linux each one is a shell error, exit 127, and four checks fail without measuring what they stand for:

- `live.processReportsGridSize`: `/bin/sh: 5: .UI.RawUI.WindowSize.Width: not found`
- `live.motionReallyMoved`: 0 samples while running, exit 127
- `live.throughputEqualWindowClosedOrOpen`: exit 127 twice. The two outputs differ only because the shell's error
  lines carry different line numbers (9 against 11).
- `live.floodPainted`: `["","",""]`

Three more checks pass vacuously: `live.motionStateIdentical`, `live.motionPreviewsIdentical` and
`live.motionGridNeverStaysBehind` compare surfaces over a stream that never moved. `live.motionReallyMoved` exists to
catch exactly that, and here it catches it. The rest of the sweep's run shows the product sound on Linux:

- the grid reports 118×16 after the mid-command resize;
- key to frame is 1.7–3.6 ms and key to paint 13–33 ms;
- end input and interrupt (exit 130) both complete in 61 ms;
- the limiter delivered 33 frames and merged none.

The reproduction below read the same figures within those ranges (key to paint 10.3–28.7 ms, 61 and 62 ms).

The echo program is a Node script (`node "<echo.cjs>"`), which is why those checks ran on both shells and these three
commands did not. The header of `harness.mjs` and the comment on the live section both say "a real PowerShell".

Measured by the proof sweep on 2026-09-28 on `main` at `392f681` (112/116, exit 1 in 20 s; a lone re-run gave exit 1
in 15 s). Reproduced 2026-09-28 on `fix-proofs-b6` from `main` at `fa377e6`: as root on Linux under Xvfb, Node 24,
`/bin/sh` → `dash`, 112/116, exit 1 in 15 s. The four failures were the same, and the cause is exit status 127, not
timing. Another agent's `code-intel-proof` was running in a separate worktree at the time.

## Specs

No requirement is contradicted by the product. Off Windows the proof produced no evidence for REQ-SHELL-166's
"the size the process reports" limb (with REQ-SHELL-100 and REQ-SHELL-106), for REQ-SHELL-102 in motion, or for
REQ-SHELL-103's throughput criterion (the same output and exit status whether the window is closed or open). On a
POSIX host those are the terminal every user runs.

## Relevant files

- `apps/desktop/scripts/terminal-proof/main.cjs`: `sizeRun`, `motionCommand` and `flood` in the live section.
- `apps/desktop/scripts/terminal-proof/harness.mjs`: `findShell()`'s backend, reported as `ready.shell`.
- `packages/agent-tools/src/terminal/index.ts`: `findShell()`.
- `AGENTS.md`: the proof's row.

Noticed 2026-09-28 by the proof sweep under R-062.
