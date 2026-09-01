# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-06)
- **Depends on:** ADR-0002, ADR-0017, ADR-0022
- **Contains an escalation.**

## Context

`REQ-TOOLS-095` and `REQ-TOOLS-096` fix the tool name `terminal` and its action schema, including the
special-key vocabulary for `is_input=true`, the session-action vocabulary, the signal vocabulary and
the `ts_XXXXXXXX` id format.

`REQ-TOOLS-097`, `REQ-TOOLS-098` and `REQ-CONFIG-116`: foreground bounds are two and the first reached
governs. A hard wall-clock timeout — the call's `timeout`, else `runtime.shell_command_timeout`,
default 100 s — terminates **the entire process tree**, restarts the terminal session, and returns an
observation stating shell state was lost. A soft pause fires only when the call supplied **no**
`timeout` and 30 seconds pass with no output, returning exit code -1 while the process keeps running.

`REQ-TOOLS-097` also fixes the reason a persistent shell is unavoidable: shell state — working
directory, exported variables, aliases, background jobs — **persists across foreground calls** in a
session and is *observably* lost on a hard timeout.

`REQ-TOOLS-187`, `REQ-TOOLS-108` and `REQ-SANDBOX-089`: each terminal session runs at most one
foreground command at a time and a second foreground call against a busy session **waits**; sessions
belonging to different agents run concurrently; background sessions never occupy a terminal session
and are fully concurrent up to `runtime.shell_max_background_sessions` (default 20, minimum 1).

`REQ-TOOLS-107` and `REQ-TOOLS-109`: background sessions spawn in their own OS subprocess,
shell-interpreted, stdout and stderr merged to a pipe, stdin piped, cwd the tool's working directory,
own process group on POSIX; the spawn returns immediately with a fixed text; termination is SIGTERM,
then up to 5 s grace returning as soon as the process exits, then SIGKILL.

`REQ-TOOLS-104`: on Windows the terminal runs commands through PowerShell, and backend availability is
decided **solely** by the presence of `pwsh` or `powershell` on the host — never by how quickly
anything responds. `REQ-TOOLS-106`: the tool must load and register however the application process was
started and whatever its own standard streams are attached to, and the agent must observe an identical
tool surface in every case; encoding of captured output is a property of the child, never of the
host's own streams.

`REQ-TOOLS-179` and `REQ-SANDBOX-083` make the exit codes a cross-surface contract: 124 hard timeout
(foreground and background), 126 sandbox unavailable and never ran, -1 soft pause or killed, otherwise
the command's real outcome. `REQ-TOOLS-100` and `REQ-TOOLS-112` close `failure_kind`, `outcome_kind`
and `outcome_severity` and fix a six-test ordered classification cascade. `REQ-TOOLS-098` and
`REQ-TOOLS-100` require every observation to carry a `[terminal_diagnostic]` block with sorted keys and
null-valued keys dropped, and to render an output section — never omitted. `REQ-TOOLS-103` requires a
backend failure never to surface as a partial or malformed observation.

`REQ-SHELL-166` and `REQ-SHELL-100` require interactive input and resize to be demonstrated against a
**real pseudo-terminal**: keystroke-to-frame inside 100 ms; keystrokes reaching the process in order,
none dropped, duplicated or reordered; interrupt and end-input acting within 500 ms; and **the size the
process itself reports for its terminal equal to the columns and rows the grid last reported**, no
later than the process's first output after the resize.

`REQ-TOOLS-099`, `REQ-TOOLS-100` and `REQ-TOOLS-103` stamp `backend` on every observation as
`single-session` or `tmux-pool`, fix `kill_status` values two of which only a pane-based pool can
produce, and specify pooled-recovery behaviour in detail — **and the specification never states how a
backend is selected or when `tmux-pool` is used.**

## Alternatives considered

**A — A fresh child process per foreground call, pipes only.** Simple, exact exit codes, clean stream
separation, trivially correct truncation. Fatal against `REQ-TOOLS-097` — working directory and
exported variables must persist across calls and must be observably lost on a hard timeout — and
against `REQ-SHELL-166`, which requires a real pseudo-terminal whose reported size follows the grid.

**B — One PTY per call.** Keeps the PTY requirement and gives a clean exit status per child. Still
fails the persistence rule, and re-pays PTY setup on every call.

**C — One long-lived PTY-hosted interactive shell per terminal session with an out-of-band completion
protocol; background commands spawned separately with merged pipes.** Chosen.

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
into one pipe, stdin piped, its own process group on POSIX and inside the Job Object on Windows. It
never touches a terminal session, so the concurrency statement holds by construction. Termination is
SIGTERM, grace-until-exit capped at 5 s, then SIGKILL; on Windows, where signals do not exist, this
maps onto graceful-close-then-terminate and the specification supplies no mapping (open question
OQ-10).

**Library.** `node-pty` for the PTY, checked against its current documentation: Linux, macOS and
Windows support, Windows through the ConPTY API requiring Windows 10 1809 or later with winpty support
removed; `spawn(file, args, { cols, rows, cwd, env })`, data and exit callbacks, `resize(cols, rows)`
and `kill(signal?)` where the signal argument is **ignored on Windows**. `resize` is what satisfies
`REQ-SHELL-100`'s reported-size rule; the ignored-signal note is a direct input to OQ-10.

**Backend name.** Ship `single-session` and stamp it on every observation.

## Escalation — does `tmux-pool` ship?

`REQ-TOOLS-100` fixes the closed `backend` vocabulary `{single-session, tmux-pool}`, `REQ-TOOLS-099`
fixes `kill_status` values (`pane_replaced`, `replace_failed`) that only a pane-based pool can produce,
and `REQ-TOOLS-103` specifies pooled-recovery behaviour in detail — at most 3 recoveries in a
10-second window, a fourth yielding an `execution_error`, a completed command clearing the count.
Nothing states when a pooled backend is used, whether it is required to exist, or what selects it. If
both must ship, a POSIX-only pooled backend cannot exist on Windows, where `REQ-TOOLS-104` mandates
PowerShell, and `REQ-TOOLS-187` requires the two backends to be observationally identical apart from
the name.

Options: **(a)** ship one backend and withdraw `tmux-pool`, `pane_replaced` and `replace_failed`,
keeping the field for forward compatibility; **(b)** ship both, accepting the cost, the external
dependency and the platform asymmetry; **(c)** keep both names and define the pooled one as a future
backend, leaving a specified behaviour with no implementation. This changes what a conformance claim
can say, so it is the product owner's call.

## Consequences accepted

1. The exit status of a foreground command is **derived from a marker protocol rather than from a
   wait**. A pathological command could therefore forge one. The nonce must be unguessable per call,
   and the protocol must be tested against a command that echoes attacker-chosen text.
2. Under a PTY, stdout and stderr are **merged** and the shell echoes the submitted line. The capture
   handed to the agent must strip the echoed command and the marker frames; `REQ-TOOLS-113`'s
   output-derived warning checks then run over the cleaned text, or they will match the command line
   itself. `REQ-TOOLS-098`'s soft-pause advisory tells the agent the process "may be writing to
   stderr" and suggests re-running with `2>&1`, which only makes sense if stderr is not captured —
   open question OQ-13.
3. `background=true` gives pipes, not a PTY, so a background session's terminal tab has no real
   terminal to resize. `REQ-TOOLS-128` and `REQ-SHELL-106` already anticipate this: a resize always
   resizes the emulated screen, even when the backend is gone, and then the real terminal when
   possible.
4. `node-pty` is a native module, so ADR-0002's rebuild-and-unpack obligation is load-bearing, and the
   ConPTY floor of Windows 10 1809 becomes a platform requirement ADR-0054 must state.
5. Foreground output is capped at 100,000 characters per call truncated from the **oldest** end, and
   background output buffered to 1 MB per session truncated the same direction with the read cursor
   adjusted (`REQ-TOOLS-097`, `REQ-TOOLS-100`, `REQ-TOOLS-108`).

## Revisit if

The escalation is decided; or a requirement arrives that needs a true per-command exit status, which
would push toward alternative B and force `REQ-TOOLS-097` to be re-read; or `node-pty` stops being
maintained, in which case the PTY port defined here is the seam to replace.
