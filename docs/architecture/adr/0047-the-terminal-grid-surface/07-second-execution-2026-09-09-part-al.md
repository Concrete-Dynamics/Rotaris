# ADR-0047 — The terminal grid surface: emulator as a screen, input owned by the product — Second execution — 2026-09-09 (Part AL′)

Part 7 of 12 of [ADR-0047](../0047-the-terminal-grid-surface.md), which indexes every part.

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
