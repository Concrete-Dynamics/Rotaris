## `terminal-proof`'s live section drives PowerShell commands on every platform

`apps/desktop/scripts/terminal-proof/main.cjs` runs three commands in the live terminal that only PowerShell understands,
and chooses no other off Windows: the size report (`Write-Output "cols=$($Host.UI.RawUI.WindowSize.Width) rows=…"`,
line 545), the motion run (`1..40 | ForEach-Object { "motion $_"; Start-Sleep -Milliseconds 55 }`, line 557) and the flood
(`1..10000 | ForEach-Object { "line $_" }; cmd /c "exit 3"`, line 611). On Linux the product's terminal runs them through
`/bin/sh`, which answers `not found` and exits 127, so four assertions fail whatever the product does:
`live.processReportsGridSize`, `live.motionReallyMoved`, `live.throughputEqualWindowClosedOrOpen` and `live.floodPainted`.

Measured 2026-09-29 on the built app of branch `fix-transcript-append-2`
(`xvfb-run -a -s "-screen 0 1600x1000x24" node apps/desktop/scripts/terminal-proof.mjs --skip-build`, as root, Node 24):
**112 of 116 assertions passed**, the four above failing with `/bin/sh: 9: ForEach-Object: not found` and
`/bin/sh: 5: .UI.RawUI.WindowSize.Width: not found`. The echo command beside them (`echoCommand`, line 439) is
`node "<script>"` and passes, which is a form the other three could take on every platform.

Noticed while running the proofs whose surfaces REQ-CHAT-055's CPU-profile round touched (the transcript preview is one
of this proof's three surfaces); recorded, not repaired — it is outside that round, and it is the proof's, not the
product's.

**Settled at the merge into `main`, 2026-09-29: a duplicate, already repaired.** This note was written on branch
`fix-transcript-append-2`, cut from `fa377e6`. `main` had meanwhile recorded the same defect as
[`terminal-proofs-live-section-drives-a-posix-shell-with-powershell.md`](terminal-proofs-live-section-drives-a-posix-shell-with-powershell.md)
and repaired it in `ef1540e` (the live section spells its commands in the host's shell over `ready.shell`). The run above
measured the branch's base, before that repair; the note moved to `fixed/` with no repair of its own.

## Specs

None contradicted by the product as far as this run shows. The proof cannot read REQ-SHELL-166's reported size,
REQ-SHELL-102's surfaces in motion or REQ-SHELL-103/166's throughput off Windows, so on Linux and macOS those clauses
have no driven evidence while the commands stay PowerShell's.

## Relevant files

- `apps/desktop/scripts/terminal-proof/main.cjs` — lines 545, 557 and 611, the three commands; line 439, `echoCommand`,
  the platform-neutral form beside them.
- `apps/desktop/scripts/terminal-proof.mjs` — the runner that builds and launches it.
