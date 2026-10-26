# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — The proof's reads under load — 2026-10-01 (R-062)

Part 11 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

## The proof's reads under load — 2026-10-01 (R-062)

*`pnpm terminal-proof`'s wheel, selection and empty-copy checks, and its flood and echo readings, went red at random on a
loaded host ([note](../../../defects/fixed/terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md)).*

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
time one keystroke of three missing the bound by 0 to 44 ms. Whether the bound holds on an oversubscribed host is OQ-176. *(Ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): it holds on a host whose CPUs other programs do not oversubscribe, [`PD-SHELL-007`](../../../product/directives/pd-shell-007.md#pd-shell-007).)*

**Found along the way.** A closing `screen` frame resets each emulator and rewrites the final screen, which the library
parses over several tasks; one read in that window saw the row preview empty while the grid showed the flood's last line
([note](../../../defects/fixed/a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md), recorded, not
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
([note](../../../defects/fixed/a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md), the outcome written on it).
