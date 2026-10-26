# Architectural constraints extracted from the specification — 8. Terminal execution and streaming

Part 10 of 22 of [the constraints](../constraints.md), which indexes every part.

## 8. Terminal execution and streaming

| # | Constraint | Label | Requirements |
|---|---|---|---|
| X-01 | Shell state — working directory, exported variables, aliases, background jobs — **persists across foreground calls** and is *observably* lost on a hard timeout. This forces a long-lived interactive shell per terminal session. | HARD | REQ-TOOLS-097 |
| X-02 | Two foreground bounds and the first reached governs: a hard timeout terminating **the entire process tree** and restarting the session; a soft pause firing only when the call supplied no timeout. | HARD | REQ-TOOLS-097, REQ-TOOLS-098, REQ-CONFIG-116 |
| X-03 | On Windows commands run through PowerShell, and backend availability is decided **solely by presence on the host**, never by response time. | HARD | REQ-TOOLS-104 |
| X-04 | Interactive input and resize must be demonstrated against a **real pseudo-terminal**, with the **size the process itself reports equal to the columns and rows the grid last reported**. | HARD | REQ-SHELL-100, REQ-SHELL-166 |
| X-05 | Exit codes are a cross-surface contract; failure, outcome and severity vocabularies are closed; classification is a fixed six-test ordered cascade. | HARD | REQ-TOOLS-100, REQ-TOOLS-112, REQ-TOOLS-179, REQ-SANDBOX-083 |
| X-06 | Every observation carries a diagnostic block with sorted keys and null keys dropped, and **always renders an output section**; a backend failure never surfaces as a partial or malformed observation. | HARD | REQ-TOOLS-098, REQ-TOOLS-100, REQ-TOOLS-103 |
| X-07 | Once the application has exited, **no background command it started is still running and no terminal resource it opened is still held — whatever ended it**. | HARD | REQ-TOOLS-111 |
| X-08 | Streaming changes nothing the agent sees: with or without a consumer, and whether or not publishing succeeds, the command runs to completion and the observation is identical. | HARD | REQ-TOOLS-127, REQ-SHELL-103 |
| X-09 | Frames are typed `delta`, `screen` or `meta`, and a completed foreground stream ends with a `screen` frame **whose text equals the observation's final output text**. | HARD | REQ-TOOLS-127 |
| X-10 | Delivery is ordered frames with a **monotonically increasing sequence number**; metadata frames are idempotent; a late-attaching viewer receives everything accumulated; an already-applied sequence is never applied twice. | HARD | REQ-SHELL-104, REQ-SHELL-105 |
| X-11 | The window is a **character grid, not an append-only log**, checkable by behaviour, with per-cell attributes and the sixteen colours as theme tokens. | HARD | REQ-SHELL-095, REQ-SHELL-098 |
| X-12 | One stream is shown in **three places at once** with identical visible cells, identical running state and identical truncation indication at the same time; only the pop-out accepts input. | HARD | REQ-SHELL-075, REQ-SHELL-079, REQ-SHELL-102 |
| X-13 | Bringing a stream forward creates its tab **only if retained screen state still exists**; a session read back from storage produces no terminal tabs. Retained screen state is a first-class, queryable, **non-persisted** object. | HARD | REQ-SHELL-085, REQ-SHELL-104 |
| X-14 | **No keystroke reaches the process until take-control is armed**; the key encoding vocabulary is **closed**, and a key with no encoding **transmits nothing at all**. | HARD | REQ-SHELL-089, REQ-SHELL-090, REQ-SHELL-096, REQ-SHELL-097 |
| X-15 | Wheel scrolling is exactly three rows per notch with the **fractional remainder accumulated across events**; an empty-selection copy puts nothing on the clipboard and **reports failure**. | HARD | REQ-SHELL-101, REQ-CHAT-075 |
| X-16 | Grid dimensions are reported to the backend **only while visible and meaningfully laid out, and only when they change**, so a placeholder-size viewport can never shrink the emulated screen. | HARD | REQ-SHELL-100 |
| X-17 | The closed `backend` vocabulary names a pooled backend with specified recovery behaviour and two `kill_status` values only a pane-based pool can produce, **and nothing states when it is selected or whether it must exist**. | CONFLICT / silence | REQ-TOOLS-099, REQ-TOOLS-100, REQ-TOOLS-103, REQ-TOOLS-187 |
| X-18 | Which terminal emulator library provides the screen model; the wire encoding of a frame's payload. | FREE (bounded by X-08 to X-16, and now by X-19) | — |
| X-19 | **New. The frame-coalescing floor is a latency control, not a display concern, and it must be tested as one.** ADR-0021's coalescing of flush-triggered frames against the bottom of `REQ-TOOLS-126`'s own range is what keeps `REQ-MONITOR-222` inside its budget, because a distinct IPC channel name buys no isolation (T-42). Three obligations follow. The floor **may not be relaxed without re-measuring** `REQ-MONITOR-222`. The conformance test must measure the **emitted aggregate frame rate across streams**, not the appearance of the grid. And the measured margin is a **floor**: the harness's frame handler stored bytes in a ring rather than driving a VT emulator and a grid paint, and modelled one window and one session, so a real renderer saturates lower. | HARD (derived) | REQ-TOOLS-126, REQ-CONFIG-117, REQ-MONITOR-222; `spikes/ipc-hop-latency.md` §5.1, §7.1, §8 |

---
