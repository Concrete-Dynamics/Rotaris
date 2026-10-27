# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — Context

Part 1 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## Context

`REQ-TOOLS-127` fixes stream names as `fg:<scope>` and `bg:<session_id>`, frame types as `delta`,
`screen` or `meta`, a completed foreground stream ending with a `screen` frame **whose text equals the
observation's final output text** before the stream is closed carrying the exit code, and — crucially —
that streaming changes nothing the agent sees: with or without a consumer, and whether or not
publishing succeeds, the command still runs to completion and the observation is identical.

`REQ-SHELL-103` and `REQ-SHELL-166` reinforce it from the shell side: a command's completion time and
output are the same whether the terminal window is open, closed, hidden or visible, and **no output is
dropped or reordered when repaints cannot keep up**.

`REQ-SHELL-095` and `REQ-SHELL-098` require a **character grid, not an append-only log**, checkable by
behaviour: cursor addressing overwrites addressed cells, entering the alternate screen replaces
visible content and leaving it restores what was there, a self-rewriting progress line updates in
place; per-cell bold, italic, underline and reverse video, and the 16 ANSI colours as theme tokens.

`REQ-SHELL-102`, `REQ-SHELL-079` and `REQ-SHELL-075` require the same stream to be shown in **three
places at once** — the transcript preview in the main window, the persona window's transcript card,
and the pop-out grid — with identical visible cells, identical running/exited state and identical
truncation indication at the same time, the persona card lagging by at most one refresh interval, and
only the pop-out accepting input.

`REQ-SHELL-104` and `REQ-SHELL-105`: delivery is ordered frames with a **monotonically increasing
sequence number**; metadata frames are idempotent; a late-attaching viewer receives everything
accumulated so far; an already-applied sequence number is never applied twice, so no line is ever shown
twice even while retained and fresh output are both arriving.

`REQ-SHELL-085` and `REQ-SHELL-104`: bringing a stream forward creates its tab **only if retained
screen state still exists**; when nothing is retained the window stays on its empty state rather than
fabricating a terminal, and a session read back from storage produces no terminal tabs at all.
Retained screen state is therefore a first-class, queryable, **non-persisted** object.

`REQ-SHELL-151`, `REQ-SHELL-084` and `REQ-SHELL-086`: an off-screen surface performs zero repaints and
runs zero refresh timers, yet shows fully current content the instant it becomes visible.

`REQ-TOOLS-126` fixes the streaming configuration: `runtime.terminal_stream_enabled` (default true,
disabling costs the live view never the command), `runtime.terminal_stream_interval_ms` (default 100,
range 20–2000, the **output sampling period**), `runtime.terminal_stream_buffer_kb` (default 256, range
0–8192, the per-stream replay buffer, `0` disabling replay).
