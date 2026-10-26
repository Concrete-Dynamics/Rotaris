# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — Decision

Part 3 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

## Decision

**Alternative B.**

- **The display emulator is fed the frame sequence of ADR-0021**, not raw PTY bytes it fetched itself.
  The authoritative screen lives in the run host; every view runs the same display emulator over the
  same frames from the same subscription point.
- **Input is gated in three layers**: the grid's key handler implements the five ordered rules; the
  **arming state** decides whether anything is transmitted at all; the **encoder** implements the closed
  vocabulary and transmits nothing for an unmapped key. The encoder is a **pure function with a table**,
  and it is shared with the agent's own input path, so there is one table and one test suite.
- **Geometry is reported only when it changes and only while visible and meaningfully laid out.** This
  is a real hazard with a hidden or virtualised panel: a zero-height or placeholder-size measurement
  must never be reported, or a running full-screen program has its screen shrunk and its output
  discarded. The reporting path needs an explicit "is this a real layout" guard, and the re-measure on
  theme change goes through the same guard.
- **Execution is never throttled by display.** Frames are consumed by the run host's model, so a slow or
  absent view cannot apply back-pressure; when repaints cannot keep up the view simply paints the latest
  state. Same shape as the transcript rule, implemented the same way.
- **Audit logging happens on the input side but is written by the run host** (ADR-0024): the renderer
  submits a line, main relays it, the run host redacts it through the shared pass and writes it through
  the single per-session writer. **It must not be possible for the renderer to write the audit log
  directly** — under ADR-0002 it cannot, because it has no filesystem.
