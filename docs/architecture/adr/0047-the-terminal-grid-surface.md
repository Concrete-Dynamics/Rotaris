# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** UI (ADR-UI-10)
- **Depends on:** ADR-0021, ADR-0024, ADR-0043, ADR-0044

## Context

`REQ-SHELL-095` and `REQ-SHELL-098` require a real character grid with alternate-screen fidelity,
per-cell bold, italic, underline and reverse video, and the sixteen ANSI colours as **theme tokens**.

`REQ-SHELL-089`, `REQ-SHELL-090` and `REQ-SHELL-097`: **no keystroke reaches the process until
take-control is armed.** While unarmed, any printable or named key raises a one-time informational
banner and is consumed. Key handling priority is fixed in five ordered rules, and one chord always
leaves the grid and is never forwarded.

`REQ-SHELL-096` and `REQ-SHELL-166`: the key encoding vocabulary is **closed** — named encodings for the
arrows, home and end, page up and down, tab, backspace, escape, enter and control-letter chords;
printable text verbatim; and **a key with no encoding transmits nothing at all**, with no substitute
sequence invented.

`REQ-SHELL-101` and `REQ-CHAT-075`: scrollbar range equals retained history rows; a refresh keeps the
tail only if already at the tail; one wheel notch scrolls **exactly three rows**, and high-resolution
deltas scroll proportionally with the **fractional remainder accumulated across events** so slow
continuous scrolling loses no motion; clamped at both ends, never wrapping. Selection is whole-cell,
direction-independent, right-trimmed per row, newline-joined; an empty-selection copy puts nothing on
the clipboard and **reports failure**.

`REQ-SHELL-098`: the cursor is painted only when *all three* hold — process running, grid focused, view
at the tail — filled while armed, hollow while read-only; the theme's terminal background fills the
entire widget throughout a resize so no frame exposes the platform surface colour.

`REQ-SHELL-100`: cell size comes from the theme's monospace face, is **re-measured on theme change** and
the new grid size re-reported to the backend; a padding gutter; never fewer than a stated minimum;
dimensions reported to the backend **only while visible and meaningfully laid out, and only when they
change**, so a placeholder-size viewport can never shrink the emulated screen and discard output.

`REQ-SHELL-107`: user terminal input is **not a tool call** — it bypasses permission patterns but is
written to the session permission audit log as user-originated input, one entry per submitted line, with
control sequences flushing the pending line, navigation keys unlogged, a held key not flooding the log,
and both the typed line and the command context secret-redacted before logging.

`REQ-SHELL-086`: closing the pop-out stops its ticking, the previews keep streaming, and the next open
rebuilds it fresh — a **deliberate difference** from the persona window, which hides rather than
rebuilds.

## Alternatives considered

**A — A terminal emulator library with its default input and link handling.**

*For:* a mature parser, a correct screen model including the alternate screen, per-cell attributes and
reverse video, and a fast renderer.
*Against:* as configured by default it **is** the input path — it attaches key handlers and writes
sequences to whatever is attached. The arming gate forbids a keystroke reaching the process until
armed; the closed encoding vocabulary forbids inventing any sequence for a key outside it; and the wheel
rule fixes exactly three rows per notch with fractional accumulation, which is not the library's own
sensitivity behaviour. **Adopting the defaults would fail three hard constraints quietly.**

**B — The library used as a *screen*, with the product owning input entirely.** The emulator receives
bytes and maintains the grid; every key event is intercepted before the library sees it, and what
reaches the process is produced by our own encoder implementing the closed vocabulary. Chosen.

*For:* keeps the hard part — parsing, the alternate screen, wide characters, per-cell attributes — and
replaces exactly the parts the specification fixes differently. The arming gate, the
transmit-nothing-for-unknown-keys rule, the five-rule priority ordering and the wheel arithmetic all
become our code, which is where the requirements put them. Theme integration is straightforward: the
sixteen colours are theme tokens and the cell geometry derives from the theme's monospace face.
*Against:* we are fighting a library's defaults, which needs discipline — a custom key handler that
refuses everything, no data wiring to the backend, our own wheel handler, our own
selection-to-text extraction.

**C — Our own parser and grid.** Total control, nothing to fight. *Against:* a terminal parser is a
deep, adversarial surface — the bytes come from arbitrary programs — and getting the alternate screen,
scroll regions, wide and combining characters and attribute handling right is a project of its own,
while `REQ-SHELL-166` demands demonstration against a real pseudo-terminal with full-screen programs
repainting without corrupted cells. Not worth it.

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

## Consequences accepted

1. We own the input path, the wheel arithmetic, the selection extraction and the encoder, and **we must
   keep them from drifting back to library defaults during upgrades.** A test that asserts an unmapped
   key transmits nothing is the cheapest guard.
2. The persona window is a separate renderer running its own display emulator over the same frames. That
   is ADR-0021's decision and its cost — a golden-stream equality test is the evidence for
   `REQ-SHELL-102`.
3. The pop-out and the persona window have **deliberately different lifecycles** — rebuild versus hide —
   and must not be unified.
4. The wheel's fractional-remainder accumulation is a stateful detail that is easy to lose in a
   refactor; it is specified and it needs a test with sub-notch deltas.

## Revisit if

ADR-0021's placement of the authoritative screen changes; or a requirement asks for terminal scrollback
to survive a restart, which would make retention persistent and change both records.
