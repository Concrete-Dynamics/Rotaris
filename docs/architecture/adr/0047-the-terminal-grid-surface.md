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

## Second execution — 2026-09-09 (Part AL′)

*The grid, the window and the preview over REAL frames from a real pseudo-terminal, with real keystrokes going back to
the process — `pnpm terminal-proof`'s REQ-SHELL-166 section (the harness is described in ADR-0021's note of the same
date). Two consecutive green runs, 112 assertions each; the figures are in the handoff.*

**Built.** The window is mounted (`renderer/main.tsx` `role=terminal`, `main/windows.ts`): its six actions bound to the
`terminal.*` commands, the title REQ-SHELL-081's, the empty state's "Go to Workspace" reaching the main window, the
auto-open control (REQ-SHELL-109) in a slim bar under the content, the acknowledgement stack per window. The row
preview and the persona card's preview read one `TerminalStreamSet` per renderer through a terminal host context
(`ui/terminal/host.tsx`), and the toolbar control with its counts (REQ-SHELL-108) reads the same host. The palette's
"Open terminal" entry is back from the omitted list (Ctrl+Shift+T).

**Measured (what the first execution could not, having no producer).** Key press to painted frame **12.4–23.1 ms**
armed on the first of the two runs recorded here and **16.0–25.0 ms** on the second, both taken while four other
agents built on the same machine (REQ-SHELL-166's budget is 100 ms); a nine-key burst with two unmapped keys inside
arrived as typed and nothing else; the grid's reported geometry came back in the stream's `meta` and the process
reported that size, before and after the box shrank in the middle of a command (118×26 → 118×16); the three surfaces
held identical cells, state, truncation and exit at rest (REQ-SHELL-102, REQ-SHELL-075 b).

**Found — defect AL2-4 (the display's half; ADR-0021's note has the registry's).** The transition was one way for the
stream's whole life; the registry re-opens an agent's one stream per command. The display now re-opens on a later
`meta` with `running: true` and a higher `seq`, and the window's tick clears the exit notice and re-enables the
once-per-lifetime notices when a stream re-opens (REQ-SHELL-090/091's "re-enabled if the … exited state changes").

**Found — defect AL2-3's trigger at this surface.** Consequence 1 of the first note said "every banner shrinks the host
and reports a new geometry to the process — stated, not changed". Through a real pseudo-terminal that geometry report
resizes the process mid-command and ConPTY repaints its viewport into the agent's observation (ADR-0021's note). The
banner slot now reserves the notice's own height from the notice's own tokens, so a banner costs the process no
resize; a message that wraps still grows the slot, stated. That banner was also the last mid-command resize on the
proof's own path, so the proof now drives one itself — the window's box from 620 px to 460 px while the first command
runs — and the defect ADR-0021's note records is produced by the runs this branch rests on rather than by the trigger
this surface removed. What remains in the product is a user resizing the window.

**Readings.** The window's registry is the paint-capable one (`createTerminalWindowStreams`) and the previews' the
headless one, both over the contract's `TerminalFrame` — `DisplayFrame` is that type by alias now. `document.title`
is the window title (Electron follows it), so REQ-SHELL-081's label is the renderer's. A `focusStream` for a stream
already in front is re-requested through a null-then-id cycle so the tick sees it.

**Not executed here.** The full-screen program's repaint to a new size with no corrupted cells (no such program in the
harness); the window under the packaged application; REQ-MONITOR-306 across two windows (T″).

## Third execution — 2026-09-11 (Part T″)

*REQ-SHELL-102 measured IN MOTION. The two executions before this compared the three surfaces after the closing frame,
with the stream at rest; the requirement is stated at the same time, and a still screen is the one state in which its
claim cannot be false. `pnpm terminal-proof`, two consecutive green runs of 116 assertions each (112 before this).*

**What was measured.** A real PowerShell writes forty lines with a 55 ms pause between them through the real
pseudo-terminal, and while it writes, the proof samples every 70 ms. One `state()` call reads all three surfaces in
ONE page turn — the window's grid (`@xterm/xterm`, a DOM terminal), the transcript row's preview and the persona
card's preview (two separate `@xterm/headless` registries, which is ADR-0021 consequence 3's "two emulator instances
per visible stream" and UI's objection in that record that two parsers may disagree) — so a sample is simultaneous
rather than three reads with a gap between them, and a disagreement would be a real one rather than a sampling
artefact. Then one settled sample after the closing frame, so a divergence in the last moving sample has the turn to
resolve that "moving between the two never shows the user older output in one than in the other" allows it.

**The figures.** **36 samples, 33 of them while the stream was running, over 21 distinct screens.** Identical visible
cells at every sample across all three surfaces; identical running state, truncation and exit code at every sample;
**zero divergences of any kind** — `previewsDisagreed: 0`, `gridDivergedSamples: 0`, `gridStayedBehind: 0`. The two
headless registries never differed from each other and neither differed from the DOM grid, at any instant of the
motion, including the frame in which the closing screen replaced the whole screen with the observation's plain text.

**Why this is evidence rather than a tautology, which the record should say plainly.** The three surfaces are fed from
one subscription point in arrival order, so agreement is the design's intent; what the samples test is whether the
intent survives three *different* parser instances, two of them a different implementation from the third, painting on
their own schedules — xterm's `write` is asynchronous (the first execution's own reading), so the DOM grid could have
trailed the headless pair by a frame at any of the 33 moving samples and did not. The assertion that keeps the section
honest is `live.motionReallyMoved`: it requires at least eight samples taken while the stream was running and at
least five distinct screens among them, so an equality asserted over a screen that never changed fails rather than
passes. It read 33 and 21.

**Found nothing.** No defect at this surface on this execution. The four assertions added are
`live.motionReallyMoved`, `live.motionStateIdentical`, `live.motionPreviewsIdentical` and
`live.motionGridNeverStaysBehind`.

**Still not executed.** The full-screen program's repaint to a new size with no corrupted cells — no such program is
in the harness, and this Part did not add one; REQ-SHELL-166's other limbs are measured. The terminal WINDOW under the
packaged application: Part T″ measured the packaged application for `runtime.terminal_stream_enabled` (ADR-0021's note
of this date) and did not open the terminal window inside it, so the window's own lifecycle in a packaged build
remains covered by the unit suites and by the Electron proof, not by a packaged launch.

## The live section on a POSIX shell — 2026-09-28 (R-062)

*A first execution, reported back in place. The second and third executions drove the grid over a real PowerShell.
REQ-TOOLS-104 gives every other host a POSIX shell, and the live section had never measured one.*

**Found — three of the live section's commands spoke PowerShell to `/bin/sh`.** The echo program is a Node script, so
the checks it drives ran on Linux and passed: the echo, the burst, end input, interrupt and the audit entries. The size
probe, the motion command and the throughput flood were PowerShell. There each one exited 127, and four checks were
red with nothing measured: `live.processReportsGridSize`, `live.motionReallyMoved`,
`live.throughputEqualWindowClosedOrOpen` and `live.floodPainted`. Three motion checks passed vacuously over a stream
that never moved. The note is
[`terminal-proofs-live-section-drives-a-posix-shell-with-powershell.md`](../../defects/fixed/terminal-proofs-live-section-drives-a-posix-shell-with-powershell.md).
Each command is now spelled in the shell the harness reports (`live.shell`), and the PowerShell spellings are the same
literals as before. Every assertion is kept.

**Found nothing at this surface.** On Linux (`dash`), three consecutive runs each passed **116 of 116** assertions:

- **Size:** the process reports the grid's last report, `cols=118 rows=16` (`stty size`), after the box shrank mid-command.
- **Echo:** key to frame 1.5–4.0 ms and key to paint 8.4–29.5 ms (budget 100 ms).
- **End input and interrupt:** end input 60–62 ms, and interrupt 61–62 ms with exit 130.
- **Motion:** 34 samples, 31–32 of them while running, over 20 distinct screens, with zero divergences of any kind.
- **Throughput:** 10,000 lines and exit 3 with the window closed and open, the output equal. Closed took 129–143 ms and
  open 112–148 ms.
- **Limiter:** delivered 54 frames and merged none.

**One reading beside it, not a finding.** Defect AL2-3's trigger (the box shrinking mid-command) left the observation
clean on a POSIX PTY: `READY` once, no start marker in the body, five lines. What this record attributes to ConPTY's
repaint is not seen here. That says nothing of Windows.

**Could not show.** A Windows re-run of the unchanged PowerShell spellings on this branch (no host), and macOS (IC-3).
On POSIX the motion command's 55 ms pause is `sleep 0.055`, a fraction that GNU and BSD `sleep` accept and POSIX does
not require. The full-screen program and the packaged window stay where the third execution left them.

## The re-measure under load — 2026-10-01 (R-067)

*Defect fifty-five came back: `pnpm terminal-proof`'s `theme.remeasureReportsOnce` failed once under load with the same
three shapes, `118×26`, `118×25`, `89×19`
([note](../../defects/fixed/a-font-change-under-load-reports-an-intermediate-terminal-geometry.md)).*

**The cause.** The repair above silenced the resize observer only once the theme-change layout effect had run. That
effect runs when React renders the root's mutation, and React renders it in a scheduler task, not in the mutation
observer's microtask. When a frame falls between the style change and that task, the frame lays out the grown header,
the observer runs with no re-measure pending, and it measures the shrunk host against the cell the library still draws
with the old face. Load made that order likely but not certain: twelve runs of the proof beside six busy loops (load
average 6.8 to 17) all passed. Making the face change inside a `requestAnimationFrame` callback forces the order, and
on the code before the repair it reported `118×25` on three runs out of three.

**The repair.** `geometry.ts`'s `RemeasureGate` sits between every measurement and the library. It remembers the face it
last gave the library, and each resize or visibility observation compares that with the face the root names now. A
different face is applied there and then, and the grid is measured once, in the frame after. The layout effect calls
the same gate, so whichever of the two paths sees the change first, one shape is reported. The library re-measures its
own cell synchronously on the option change (`CharSizeService.measure` on `fontFamily`/`fontSize`), so one frame is
enough and no settling over several frames was added.

**Pinned.** Five `terminal.test.ts` cases drive the gate over a modelled host and cell. Two of them fail with the face
comparison removed, the first reporting `118×25` exactly. The proof has a second check,
`theme.remeasureReportsOnceAtFrame`, which makes the face change inside the frame. It failed on the code before (two
runs, three reports each). On the repair as committed it passed three runs alone and twelve beside the busy loops (load
average 4.8 to 14.9), as did `theme.remeasureReportsOnce`; an earlier wiring of the same gate passed twelve more at 11.6
to 18.

**Could not show.** Windows and macOS (IC-3 — *corrected 2026-10-14: for the Windows half, a Windows host, which this Linux container is not; IC-3 binds Linux and macOS artifacts*). A face still loading when it is applied would change the cell after the
measurement. The mono face is bundled but declared `font-display: swap` (`packages/ui/src/fonts.css`), so this could
happen at first paint. The gate does not watch font loading, and this round did not measure that case.


## The proof's reads under load — 2026-10-01 (R-062)

*`pnpm terminal-proof`'s wheel, selection and empty-copy checks, and its flood and echo readings, went red at random on a
loaded host ([note](../../defects/fixed/terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md)).*

**Which side.** The proof's, for every input check. Eighty runs beside pinned busy loops (load average 5.7 to 18 on four
CPUs) kept every run's results. The two `wheel.subNotch` reds moved exactly three rows over the ten tenths of a notch, so the
accumulator was right and the readings came early. Chromium's browser process holds a wheel event until the renderer has
handled the one before it, and merges what it holds; key and pointer events are not held behind wheel events. A fixed
pause after `sendInputEvent` is therefore no guarantee that the page has the event, for a notch least of all.

**The repair, in the proof only.** Each key, click and wheel event now waits until the page has counted it, in the capture
phase of the dispatch the grid handles it in (`terminal-proof/fence.cjs`; the proof page's `inputs()`). One wheel event is
in flight at a time, and a fence that times out is recorded rather than passed. The flood is read once its closing frame
has been parsed. No product code changed, and no assertion was weakened. `live.echoUnder100ms` keeps REQ-SHELL-166's 100 ms
and the page's own timestamps, and records the host's load beside it (`results.live.echoLoad`). In the eighty runs on the
repair no input check went red and no fence timed out. The echo was red six times, at load averages of 9.3 to 13.5, each
time one keystroke of three missing the bound by 0 to 44 ms. Whether the bound holds on an oversubscribed host is OQ-176. *(Ruled 2026-10-06, [R-071](../../product/requests.md#r-071): it holds on a host whose CPUs other programs do not oversubscribe, [`PD-SHELL-007`](../../product/directives.md#pd-shell-007).)*

**Found along the way.** A closing `screen` frame resets each emulator and rewrites the final screen, which the library
parses over several tasks; one read in that window saw the row preview empty while the grid showed the flood's last line
([note](../../defects/fixed/a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md), recorded, not
repaired).

**Repaired 2026-10-02 (fin7): the previews hold the replaced screen while a `screen` frame's reset and text parse.**
The subscription point (`TerminalStreamSet`, `streams.ts`) holds, per stream, the screen as parsed when the parser
reaches a `screen` frame's reset: `applyFrame` queues an empty write with a `resetReached` callback just ahead of the
reset (itself queued) and hands the frame's text a `parsed` callback. Between the two, `previewOf` reads the held lines
with the frame's own state (running, exit code); before the reset it reads the emulator as it parses, so deltas queued
ahead of the frame still move the preview forward. Once the text has parsed the hold is dropped and the listeners are
told again (`parsed`). No product listener redraws on it today (the toolbar's counts ignore it); a row preview is drawn
again by the transcript's own renders (REQ-CHAT-063's refresh while the row is live, and the row's next publication).
The grid reads its own emulator and is unchanged, so inside the window the grid shows the reset or half-written screen
while the previews show the screen it replaced: the surfaces differ there by design, the previews never the older.
Deltas are never held. *Corrected the same day:* the first form took the hold when the frame ARRIVED; under load the
parser is behind, xterm parses the deltas queued ahead of the reset first, and the preview froze on the arrival's
screen through the whole backlog while the grid moved on (fin7's verifier, `@xterm/headless`: `line 0` against 4300 and
6300), older output in one surface than the other (REQ-SHELL-102). Pinned by five cases in `terminal.test.ts`, four
over an emulator whose parse completes on a later task and one over the real parser with 10,000 queued lines (three of the
four red on the code before, the preview reading `[]` after the reset had parsed; both queued-delta cases red on the
arrival hold).
`terminal-proof`'s live section samples both previews from the flood's closing frame until every surface has parsed it
(`live.closingFrameNeverBlanksPreview`, and `live.closingFramePreviewNeverBehindItsScreen` against each preview's own
emulator): three runs on the repair passed 120 of 120 at load averages of 2.6 to 3.1 on 4 CPUs. Five runs on the code
before had passed too, at 2.6 to 3.2, the closing text parsing in one task there: the window the note saw is shown by the
tests, not by the proof on this host
([note](../../defects/fixed/a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md), the outcome written on it).
