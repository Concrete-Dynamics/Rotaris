# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Decision

Part 3 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

## Decision

**Foreground.** Each terminal session owns one pseudo-terminal running the platform's interactive
shell — `/bin/sh` or the user's login shell on POSIX, `pwsh` else `powershell` on Windows. A command is
submitted as a line; completion and exit status are recovered by an **out-of-band marker protocol**:
write the command, then a delimiter-emitting echo of the shell's exit-status variable, and scan the
byte stream for a nonce that cannot appear in ordinary output. This is the price of `REQ-TOOLS-097`: a
persistent shell has no per-command wait, so the exit status of `REQ-TOOLS-179` must be manufactured
from the stream. **The nonce must be unguessable, per session and per call.**

The session is a small state machine — idle, running, resetting — with a queue of one, so a second
foreground call waits. The hard timeout kills the process tree (POSIX: signal the foreground process
group of the PTY; Windows: the Job Object of ADR-0002) and then **restarts the session**, which is where
`kill_status: session_reset` and `reset_failed` come from.

**Background.** A background call is a plain subprocess, shell-interpreted, stdout and stderr merged
into one pipe, stdin piped, its own process group on POSIX and inside the Job Object on Windows *(measured 2026-10-20, the Windows ARM64 session's C1: there is no Job Object of the product's; the background command ended with the run host when the run host was killed alone, at an orderly quit and when main was killed, consistent with libuv's kill-on-close job — ADR-0002, "First execution — 2026-10-20")*. It
never touches a terminal session, so the concurrency statement holds by construction. Termination is
SIGTERM, grace-until-exit capped at 5 s, then SIGKILL; on Windows, where signals do not exist, this
maps onto graceful-close-then-terminate and the specification supplies no mapping (open question
OQ-10) *(ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): the foreground scope confirmed as built,
beside R-044's ruling for background pipe sessions)*.

**Library.** `node-pty` for the PTY, checked against its current documentation: Linux, macOS and
Windows support, Windows through the ConPTY API requiring Windows 10 1809 or later with winpty support
removed; `spawn(file, args, { cols, rows, cwd, env })`, data and exit callbacks, `resize(cols, rows)`
and `kill(signal?)` where the signal argument is **ignored on Windows**. `resize` is what satisfies
`REQ-SHELL-100`'s reported-size rule; the ignored-signal note is a direct input to OQ-10.

**Backend name.** Ship `single-session` and stamp it on every observation.
