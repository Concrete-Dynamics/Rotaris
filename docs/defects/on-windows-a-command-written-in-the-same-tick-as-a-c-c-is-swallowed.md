## On Windows a command written in the same tick as a C-c is swallowed

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, pwsh 7.6.6, at `f9076e70` (the
Windows ARM64 session's B5; a scratch case on the real `TerminalManager`, never committed). After a soft-paused
`Start-Sleep -Seconds 20; …` and the agent's `C-c` (`is_input`), the next call's line was written to the PTY at a measured
gap after the interrupt byte: written in the same tick (1 ms after, or after a microtask), `Write-Output 'AAA'` never ran —
the call reached its 8 s cap, exit 124, `session_reset`, `(no output)`; written a macrotask later (13 ms) or 50 ms or 200 ms
later, it ran at once and printed `AAA`. PowerShell's Ctrl-C handling discards a line that arrives with the interrupt.

An agent cannot reach it through the tool: its `C-c` and its next command are separate calls, seconds apart. It is reached
by code that writes a line right after an interrupt in the same turn of the event loop: the suite's A10 case "a soft-paused
command interrupted with C-c is closed by the next call" does, and so would any future path that interrupts and then writes.
The session writes the next line without waiting for the shell to have taken the interrupt.

Not repaired (record-only).

## Specs

REQ-TOOLS-096 (keystrokes reach the session in order) with REQ-TOOLS-097/099 (124 and a reset are the hard timeout's for a
command that ran past it): a command that never ran is reported as one that timed out.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `interrupt`/`sendInput` writing `\x03`, and `submit`, which writes the
  next line with no wait after it.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the A10 case kept POSIX-only for this reason.
