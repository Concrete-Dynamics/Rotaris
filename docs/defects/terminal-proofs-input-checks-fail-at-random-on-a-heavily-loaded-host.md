## terminal-proof's input checks fail at random on a heavily loaded host

On 2026-10-01 `pnpm terminal-proof` was run 36 times beside six busy loops, to reproduce
[the font-change note](fixed/a-font-change-under-load-reports-an-intermediate-terminal-geometry.md). The other plan's
agents were on the host as well (4 CPUs, load average 4.8 to 18). Ten runs were not fully green: seven of the twelve on
the code before that repair, and three of the twenty-four after it. None of those reds was the font-change check. Each was an
input or timing check:

| Check | Red in | What it read |
| --- | --- | --- |
| `wheel.subNotch` | the last run before the repair | the fractional notches moved rows at events 7 and 9, not at 4, 7 and 10 |
| `selection.text` | the last run before the repair | the extracted text equalled the expected text, so another part of the check failed (the range or `hasSelection`) |
| `live.echoUnder100ms` | 2 of the 24 runs after the repair | a keystroke's echo took more than 100 ms to paint |
| `selection.emptyCopyFails` | 1 of the 24 runs after the repair | the "Nothing copied" acknowledgement, or the single clipboard entry, was missing |

The first loop kept only its last run's `results.json`. Its other six unclean runs (114 or 115 of 116) are counted by
run, not by check. Six runs with nothing else in the worktree running passed 117/117 each. It is not known whether
any of these reds is a product fault that load exposes, as the font change turned out to be, or a proof whose pauses are
too short for a loaded host. `live.echoUnder100ms` is a time bound, and it may be expected to fail at that load.

## Specs

- None contradicted as far as is known. The checks measure `REQ-SHELL-101` (the wheel, the selection, the empty copy)
  and `REQ-SHELL-166` (the echo). A product cause would contradict those requirements; a proof cause contradicts none.

## Relevant files

- `apps/desktop/scripts/terminal-proof/main.cjs`: the four checks (`wheel.subNotch`, `selection.text`,
  `selection.emptyCopyFails`, `live.echoUnder100ms`) and the fixed pauses before them.
- `packages/ui/src/terminal/wheel.ts`, `selection.ts` and `TerminalGrid.tsx`: what the first three measure.
