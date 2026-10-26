# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — The conflict

Part 2 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## The conflict

**EXEC's position.** The run host holds the authoritative headless emulator per stream — the current
screen, the retained scrollback, the running flag, the exit code and a `truncated` flag. Frames carry
**VT byte payloads**; each view runs a *display* emulator fed the same frame sequence from the same
subscription point. Its argument: `REQ-SHELL-085` asks whether retained screen state **exists** before
any view is built, which only the run host can answer; `REQ-TOOLS-127` requires the observation to be
identical whether or not anyone is attached, so retention must be independent of viewers; and with
`terminal_stream_buffer_kb: 0` replay is disabled entirely, so a view-side-only design can show
nothing on attach while `REQ-SHELL-102` still demands the preview and the window agree.

**UI's position.** One screen model per stream **in the renderer that owns the main window**, fed by
the ordered frames; the persona window — a separate renderer — receives a *serialised snapshot of the
visible cells plus metadata flags*, not raw bytes, "so there is one parser and `REQ-SHELL-102`'s
identical-cells claim holds by construction rather than by hoping two parsers agree".

**Recommendation: EXEC's placement, with UI's concern answered rather than dismissed.**

The run host must hold the authority, because `REQ-SHELL-085`'s existence question and
`REQ-TOOLS-127`'s viewer-independence are both unanswerable from a renderer that may not exist. UI's
objection — that two parser instances may disagree — is real but is a **testable equality of inputs**
rather than a structural risk: the run host and every view run the same emulator implementation over
the same byte sequence from the same subscription point, and a golden byte stream must produce the
same serialised screen in both. That test is cheap and it is the evidence `REQ-SHELL-102` wants.

UI's serialise-the-cells idea is retained where it is genuinely better: a **`screen` frame is emitted
on attach and on resync**, so a late attacher receives one `screen` followed by `delta`s and can never
show a line twice regardless of the replay-buffer size — which is what makes
`terminal_stream_buffer_kb: 0` survivable.
