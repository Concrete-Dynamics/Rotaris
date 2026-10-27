# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — Third execution — 2026-09-11 (Part T″)

Part 8 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

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
