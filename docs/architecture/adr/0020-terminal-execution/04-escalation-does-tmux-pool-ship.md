# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Escalation — does `tmux-pool` ship?

Part 4 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

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
