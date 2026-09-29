## The terminal's live preview shows the command wrapper and its start marker

The live terminal preview forwards every byte the PTY produces, including the shell's echo of the wrapper the product
sent around the command. The preview therefore shows `s\n' "$?"` and `__rot_<nonce>_s` beside the command's own
output. What the agent reads is clean; what the user watches is not.

Live-run finding: L9 (live runs of 2026-09-29)

## Specs

- `REQ-TOOLS-127`: every frame is faithful to what the command wrote.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), `terminal/terminal.early.png` (session `8fbfa271`, the wedge running): `s\n' "$?"` and
  `__rot_d793b836cbb7e3f564f21e6_s` under the `awk` output.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts:430-431` — `onData` feeds every PTY chunk to the taps, the echoed
  wrapper included.
- `packages/agent-tools/src/terminal/index.ts:112`, `:396` — the taps forwarded to the live streams.
