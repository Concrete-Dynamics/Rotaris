# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — Decision

Part 3 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## Decision

- **The run host holds one headless emulator per live stream.** It consumes PTY output at the
  configured sampling period and maintains the current screen, the retained scrollback, the running
  flag, the exit code and the `truncated` flag. It is **not persisted**, which is why a session read
  back from storage produces no tabs — satisfied by doing nothing, the correct amount of work.
- **Frames carry VT bytes and a monotonic sequence number.** A `delta` frame is the bytes appended
  since the previous frame; a `screen` frame is a serialisation of the current screen; `meta` frames
  are idempotent. The frame kind vocabulary is `REQ-TOOLS-127`'s; the sequence number is
  `REQ-SHELL-104`'s. Both are required and neither replaces the other.
- **Views run a display emulator over the same frames.** The transcript preview, the persona card and
  the pop-out grid subscribe at one point. The emulator library is a **port**, not the decision;
  xterm.js used as a *screen* with the product owning input entirely is the expected fit — see
  ADR-0047 for why the library's own input, wheel and link handling must all be replaced.
- **Control traffic** — send-keys, resize, interrupt, kill (`REQ-TOOLS-128`) — travels the opposite
  direction on the same channel. `REQ-SHELL-166`'s ordering criterion requires only that keystrokes reach
  the **process** in order, which the run host guarantees by writing them to the PTY in receipt order.
- **The sampling period is a ceiling on batching, not a metronome.** `REQ-TOOLS-126`'s
  `runtime.terminal_stream_interval_ms` bounds how long output may be withheld from a frame; it does not
  bound how soon one may be emitted. Writing user keystrokes to the PTY therefore **arms an immediate
  flush** of that stream's next available output, so an echoed character is not held for the next tick.
  **Narrowed by the owner's ruling of 2026-09-11 (OQ-38), and the narrowing is the whole of it:** "user
  keystrokes" means exactly that — input a person has directed at a stream whose control they have taken.
  `REQ-CONFIG-117` now states that an agent's own `is_input` call does not arm, because the licence exists for
  `REQ-SHELL-166`'s gesture budget and an agent waits on the observation, not on a painted frame. See the
  ruling section at the end of this record for what the first execution's wider reading cost.
  Flush-triggered frames are coalesced so the emitted frame rate never exceeds what the bottom of
  `REQ-TOOLS-126`'s own range — 20 ms — already licenses, and the flush changes only *when* bytes are
  framed, never which bytes or in what order, leaving `REQ-SHELL-103`'s no-drop-no-reorder rule and
  `REQ-SHELL-104`'s monotonic sequence untouched. This is a choice between two mechanisms, and the other
  two candidates are rejected for stated reasons: **lowering the interval for armed streams** overrides a
  value the user set, so a configured 2000 silently means 20 and the setting stops describing the
  product; **local echo painted by the grid** meets the budget by fabricating a character the process may
  never produce — `REQ-SHELL-166` measures "the character a keystroke produces", and a password prompt
  produces none, so local echo would both miss the requirement and display what the user typed into a
  prompt that deliberately hides it. See consequence 2 and OQ-38.
- **Execution is never throttled by display.** Frames are consumed by the run host's model, not by a
  renderer, so a slow or absent view cannot apply back-pressure. This is the same shape as
  `REQ-MONITOR-232`'s rule for the transcript and is implemented the same way.
