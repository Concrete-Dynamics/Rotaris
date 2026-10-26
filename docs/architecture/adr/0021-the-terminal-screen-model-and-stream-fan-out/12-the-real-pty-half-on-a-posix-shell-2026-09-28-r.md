# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — The real-PTY half on a POSIX shell — 2026-09-28 (R-062)

Part 12 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## The real-PTY half on a POSIX shell — 2026-09-28 (R-062)

*A first execution, reported back in place. Every execution above measured the stream's fidelity against a real
PowerShell: the gapless `seq`, the deltas equal to the PTY bytes, the closing frame, the background stream, the armed
echo, streaming off, the resize and the kill. REQ-TOOLS-104 gives every other host a POSIX shell, and until this date
no POSIX shell had carried any of it.*

**Found — the half had never run anywhere but Windows, and it measured nothing off it.** The suite was not skipped on a
POSIX host. It sent PowerShell there, so `/bin/sh` answered every command with `not found`, exit 127, and six of the
proof's checks were red without the stream being measured at all. The proof sweep of 2026-09-28 read this as a proof
failure, and the record, correctly, had no product defect to explain it. The note is
[`terminal-stream-proofs-real-pty-half-speaks-powershell-to-a-posix-shell.md`](../../../defects/fixed/terminal-stream-proofs-real-pty-half-speaks-powershell-to-a-posix-shell.md).
Each command is now spelled in the host's shell (the PowerShell spellings are the same literals as before). Every
assertion is kept.

**Found nothing in the mechanism.** On Linux (`dash`), in three runs of `pnpm terminal-stream-proof`, every check held:

- **10,000 lines:** 5 frames, 2 deltas byte-equal to the PTY's 124,928 bytes, gapless, and the closing frame equal to
  the observation.
- **The `bg:` stream:** gapless on its own counter.
- **The armed echo:** framed 1.1–2.1 ms after the keystroke at an interval of 2,000 ms.
- **Streaming off:** 0 frames, against 4, with the same exit code (3) and the same output.
- **A resize to 80×24:** it reached the process as `cols=80 rows=24` (`stty size`), and the observation stayed clean.
- **Kill from the window:** it ended the command with exit −1 and closed the stream.

The echo figure is small because the kernel's line discipline echoes on a POSIX PTY, where PowerShell echoes the
keystroke itself. Either way it is the frame the armed flush produced.

*Reported back 2026-09-29 (R-067), from the first live run's `terminal` scenario
([`the-terminal-preview-shows-the-command-wrapper`](../../../defects/fixed/the-terminal-preview-shows-the-command-wrapper.md),
live-run finding L9): **"the deltas byte-equal to the PTY's bytes" measured the wrong equality, and is kept here beside
its replacement.** The foreground tap forwarded every byte the PTY produced. On a POSIX PTY those include the shell's
echo of the whole wrapped line, which names both markers, the prompt, and — after the command, before the stream
closes — the product's own PD-TOOLS-001 snapshot, the session's environment in base64. The preview of the live run
showed `s\n' "$?"` and `__rot_…_s` above the command's output. REQ-TOOLS-127 holds every frame before the closing one
faithful to what the command wrote, not to what the PTY carried. The foreground session now gives its taps only the
bytes between the printed start marker and the end frame (`CommandRegion`, `terminal/foreground.ts`), the same span the
agent's capture has always kept, and nothing between calls. The proof's equality now reads "the deltas equal what the
tap carries", and it asserts no marker in them. The PowerShell side is unmeasured: the region is told from the echo by
the quote that follows the marker in both wrappers, and a Windows host has not run it.* *(Measured 2026-10-15 on Windows 11
ARM64 under pwsh 7.6.6, three runs of `pnpm terminal-stream-proof`, all green: `deltasCarryOnlyTheCommand` true, the
10,000-line run gapless in 9 deltas of 108,894 bytes, as on Linux, in 1,259 to 1,374 ms; see "The stream proofs on Windows 11
ARM64" below.)*

*Reported back again the same day, at the verifier's second round: **the repair made a display defect visible that
the wrapper's echo had hidden.** The closing frame's literal replacement (OQ-5's reading) leaves the display's cursor
after the observation's last character, its trailing newline trimmed. The next command on the same re-opened
`fg:<agent>` stream then drew its first line onto that row (`first-cmdsecond-cmd`, measured from a real PTY). The
display now starts a re-opened stream on the row after the closing text (`applyFrame`,
`packages/ui/src/terminal/emulator.ts`). It adds no byte to any frame. `pnpm terminal-stream-proof` asserts it
through the renderer's own display (`reopenedStreamStartsOnAFreshRow`). The PowerShell side is still unmeasured, and
under ConPTY, which repaints with cursor positioning, a printed start marker not followed by a newline would
withhold the whole preview.*

**Could not show.** A Windows re-run on the branch (no host). Anything on macOS (IC-3). The synthetic ladder and the
packaged limb are unchanged, and are owed where the third execution left them. *(The Windows re-run: 2026-10-15, below.)*
