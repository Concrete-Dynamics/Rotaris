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

## First execution — 2026-09-09 (Part AM)

*Recorded under GD-10. Evidence: `pnpm terminal-proof` (`.terminal-proof/results.json`, ninety-two assertions, two
consecutive green runs) and `packages/ui/src/terminal/terminal.test.ts` (thirty-seven tests).*

**Built.** Alternative B as decided, against a **scripted frame source** — no producer existed in this worktree; Part
AL builds it beside. `contracts/src/terminal-keys.ts` is the one table: `encodeKey` (the closed vocabulary of
`REQ-SHELL-096`, `null` for a key outside it) and `bytesFor` (the PTY side, normal cursor-key mode). `ui/src/terminal/`
holds the emulator **port** with two adapters over the same parser — `@xterm/headless` for the transcript preview and
tests, `@xterm/xterm` opened once per stream into a detached container for the grid — and one subscription point per
renderer (`TerminalStreamSet`) applying ADR-0021's frames by sequence (`REQ-SHELL-104/105`). The product owns what the
Decision says it owns: the five-rule key priority (`keys.ts`), the arming gate, the wheel with the carried remainder
(`wheel.ts`), the selection extraction (`selection.ts`), the cursor (an overlay the grid positions; the library's own
cursor is themed to the ground), the geometry guard (`geometry.ts`), and the audit buffer (`audit.ts`). The window
(`TerminalWindow`, tabs "Terminal sessions", the 120 ms tick gated on `document.visibilityState`, the four banners in
one slot, the kill `ConfirmDialog`, the empty state) and the transcript preview block (`Row.tsx`) draw from the design
language alone — the window has no mockup (design README §3.2); the preview follows the mockup's live terminal block.
The sixteen ANSI colours, the ground, the ink, the cursor and the selection are `--rt-term-*` tokens in all three
palettes, with a static floor check (ADR-0050's note).

**Readings taken, stated as readings.** (1) OQ-5: the closing frame is a `screen` frame carrying `closing: true` and
plain text; the display resets and writes it with each newline carried to column 0. (2) `channels.ts` spells the
sequence field `streamSeq` where the plan's seam spells it `seq`; the display reads it in one function (`frameSeq`).
(3) A display emulator follows the size a `meta` frame carries, so the run host must publish the size it took AFTER
answering `terminal.resize` — a stale size in a later `meta` shrinks every display back (the proof's scripted host
echoes each report, which is what the real one must do). (4) A theme switch that keeps the same monospace face
re-measures the cell and reports **nothing**, because `REQ-SHELL-100` reports only on change; the proof measures both
that silence and the one report a face-size change produces. (5) `document.visibilityState` is `hidden` for a window
another window covers on Windows (Chromium's native occlusion tracking), so an occluded terminal window stops
ticking — read as `REQ-SHELL-084`'s intent, and recorded because a reader who sees a covered window not repaint should
know why. (6) Every banner that appears shrinks the grid's host and so reports a new geometry to the process; a
full-screen program repaints on each. Stated, not changed.

**Defects found, none of which a reading had caught.**

- **Forty-six — the grid host was a scroll container.** `.term-grid` clipped with `overflow: hidden`, which leaves an
  element scrollable by script and by focus. Focusing the library's helper textarea, which it parks at the cursor
  cell, scrolled the host by the banner's height: the screen sat 49 px above its own gutter, the pointer's cell
  coordinates were off, and a drag selected nothing. `overflow: clip` — which cannot be scrolled — replaced it, with the
  reason beside the rule.
- **Forty-seven — the initial-focus race.** `REQ-SHELL-085`'s "on show, focus goes to take-control" was written as a
  `requestAnimationFrame` after the tick that first saw a stream, on the reading that the frame follows React's
  commit. It ran before it: the button did not exist yet and focus fell to the grid. It is now an effect keyed on the
  tabs, which runs after the commit that drew them.

**Harness findings, not product defects.** The scripted source's own sequence numbers were not monotonic at first and
`REQ-SHELL-104`'s "never applied twice" silently dropped the later frames — the mechanism working, and a lesson for
any scripted feeder. A selection coordinate rounds at the cell's centre in the library (`Mouse.ts` adds half a cell
before the ceiling), so a drag that means column 0 lands a fifth of the way into the cell. A window taller than the
display's work area is clamped, so the page holds the 900×620 box and puts the preview beside it, never below.

**What the proof guards against drift (consequence 1).** An unmapped key transmits nothing (`F5`, `Insert`,
`Alt+Up`, `Ctrl+Left` while armed: zero calls); an unarmed printable raises the read-only banner once per tab
lifetime (`data-banner-seq`); one wheel notch moves three rows and ten tenths of a notch land rows on the fourth,
seventh and tenth events; a two-row drag extracts right-trimmed, newline-joined text and Ctrl+C with it copies rather
than interrupts; an empty-selection copy is reported as a failure and touches no clipboard; the cursor is hollow
read-only, filled armed, hidden off the tail and after exit; the gutter pixel samples to the theme's `--rt-term-bg`
after a switch; a hidden host reports no geometry.

**Not executed here.** `REQ-SHELL-166` against a real pseudo-terminal and `REQ-SHELL-102`'s three-surface equality on
a live stream (wave 2, AL′); the window's lifecycle, title and focus-on-auto-open (`REQ-SHELL-080/081/086/108..111`,
`main/windows.ts`); the audit log's write (the renderer submits `terminal.audit`; the run host redacts and writes).
The defect tally stands at **forty-seven**.
