# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Context

Part 1 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

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
