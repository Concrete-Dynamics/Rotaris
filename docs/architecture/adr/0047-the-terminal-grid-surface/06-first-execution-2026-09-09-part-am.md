# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — First execution — 2026-09-09 (Part AM)

Part 6 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

## First execution — 2026-09-09 (Part AM)

*Recorded under GD-10. Evidence: `pnpm terminal-proof` (`.terminal-proof/results.json`, ninety-two assertions, two
consecutive green runs, then three more after the seam ruling of the same day) and `packages/ui/src/terminal/terminal.test.ts` (thirty-seven tests).*

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
plain text; the display resets and writes it with each newline carried to column 0. (2) the frame is the
manager's ruled shape `{ v, sessionId, streamId, seq, kind, payload, meta?, closing? }` (`channels.ts` had spelt the counter
`streamSeq` and carried no session; AL rewrites the schema); the display declares that shape itself and reads the
counter in one function (`frameSeq`), so the merge is one type alias.
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

- **Fifty-three — the grid host was a scroll container.** `.term-grid` clipped with `overflow: hidden`, which leaves an
  element scrollable by script and by focus. Focusing the library's helper textarea, which it parks at the cursor
  cell, scrolled the host by the banner's height: the screen sat 49 px above its own gutter, the pointer's cell
  coordinates were off, and a drag selected nothing. `overflow: clip` — which cannot be scrolled — replaced it, with the
  reason beside the rule.
- **Fifty-four — the initial-focus race.** `REQ-SHELL-085`'s "on show, focus goes to take-control" was written as a
  `requestAnimationFrame` after the tick that first saw a stream, on the reading that the frame follows React's
  commit. It ran before it: the button did not exist yet and focus fell to the grid. It is now an effect keyed on the
  tabs, which runs after the commit that drew them.
- **Fifty-five — a stale cell reported on a face change.** A theme change that alters the monospace face also
  re-lays the tab's header in the same frame, so the grid's host shrinks before the library has repainted with the
  new face; the resize observer measured the new host against the OLD cell and one wrong geometry reached the
  process a frame before the right one (`118×25` then `89×19` in the proof, two reports where `REQ-SHELL-100` wants
  one). Seen on the third consecutive run, not the first two — a race. ~~The observer now stays quiet while a
  re-measure is pending and the frame after the repaint measures once.~~ *(Falsified 2026-10-01: the pending flag was
  raised by the layout effect React runs for the theme change, which React renders in a task of its own, so a frame
  falling between the root's style change and that task still let the observer measure first. The same `118×25` came
  back under load; the repair that replaced this one is in "The re-measure under load — 2026-10-01" below.)*

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
The defect tally stands at **fifty-five**.
