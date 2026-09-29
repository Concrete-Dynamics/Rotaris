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

The reproduction below read comparable figures (key to paint 10.3–28.7 ms, end input 61 ms, interrupt 62 ms).

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

## Repaired — 2026-09-28, under R-062

`main.cjs` now reads the shell the harness reports (`live.shell`, from `findShell()`) and spells its three commands in
that shell, from a small `PS`/`SH` table beside it. On PowerShell each spelling is the old literal, character for
character. On a POSIX shell the equivalents are:

- the size the process reads from its own terminal: `stty size`, printed as `cols=<c> rows=<r>`;
- a `while` loop printing `motion <i>` with `sleep 0.055` after each line;
- a `while` loop printing `line 1` … `line 10000`, then `sh -c 'exit 3'` for a native exit status.

No assertion was loosened or removed. The harness's header now says it runs the host's shell.

Pinned by the proof itself, since the defect is in the proof. Measured by `pnpm terminal-proof` as root on Linux under
Xvfb, Node 24, `/bin/sh` → `dash`: three runs in a row, each exit 0 with **116/116**, in 17–18 s. Another agent's
`code-intel-proof` (nine Electron processes) was live in a separate worktree throughout, at load 0.9–1.1:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| grid's last report / what the process reports | 118×16 / `cols=118 rows=16` | 118×16 / `cols=118 rows=16` | 118×16 / `cols=118 rows=16` |
| motion: samples, while running, distinct screens, divergences | 34, 32, 20, 0 | 34, 31, 20, 0 | 34, 31, 20, 0 |
| flood closed / open: ms, exit, lines, output equal | 138 / 138, 3 / 3, 10,000, yes | 129 / 112, 3 / 3, 10,000, yes | 143 / 148, 3 / 3, 10,000, yes |
| `live.floodPainted` (grid and preview show `line 10000`) | yes | yes | yes |
| key to frame / key to paint (ms) | 1.5–3.7 / 8.4–27.7 | 3.1–3.9 / 9.5–29.5 | 3.5–4.0 / 10.6–29.2 |

The product did not change. **Could not show:** a Windows re-run on this branch. The PowerShell spellings are the same
literals, so nothing that ran there changed, but no Windows host was available. Nothing ran on macOS (IC-3). `sleep`
with a fraction is accepted by GNU coreutils and BSD `sleep`, and POSIX does not require it. ADR-0047's "live section
on a POSIX shell" note (2026-09-28) records this as a first execution.
