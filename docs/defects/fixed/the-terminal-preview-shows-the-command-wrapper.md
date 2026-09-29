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

## Repaired — 2026-09-29 under R-067

The foreground session gives its taps what the running call's command wrote, not every byte of the PTY
(`CommandRegion` and `ForegroundSession.onData` in `packages/agent-tools/src/terminal/foreground.ts`). The printed
start marker is told from its echo by what follows it — the echo quotes it — and everything up to the end of its row
is withheld: the echoed wrapper, both markers' text, the prompt. From there bytes pass, less a tail that could still be
the beginning of the end frame, and the end frame is cut at its first occurrence, as the capture cuts it. Between calls
nothing passes. That also withholds what the note did not name: the product's own PD-TOOLS-001 snapshot, the session's
environment in base64, which ran after every command while the stream was still open and was forwarded to it. The
closing frame and the agent's observation are unchanged. ADR-0021's POSIX execution recorded "the deltas byte-equal to
the PTY's bytes" as fidelity; that reading is reported falsified in place beside this one.

**Pinned by** `terminal.test.ts`: "REQ-TOOLS-127 (live-run L9): the live stream is given what the command wrote — …",
every split of a recorded byte sequence, and "REQ-TOOLS-127 (live-run L9): the tap a live stream reads carries what the
command wrote, …" against the host's real shell, which failed before the change with 304 lines on the tap — the echo,
the markers and the environment snapshot — for a command that wrote two. `pnpm terminal-stream-proof` asserts no marker
in the 10,000-line stream's deltas (`deltasCarryOnlyTheCommand`); on the branch it passed, the deltas carrying 108,894
bytes where the proof of 2026-09-28 recorded the PTY's 124,928. **Not shown in a picture**: the live run of the
branch (pack `.live-run/runs/2026-09-29T21-36-38-297Z`, git-ignored) delegated the commands to a child whose preview
block neither PNG caught. Windows is unmeasured. Repaired 2026-09-29 under R-067.
