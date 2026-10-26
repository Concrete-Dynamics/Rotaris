# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — Second execution — 2026-09-09 (Part AL′)

Part 9 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## Second execution — 2026-09-09 (Part AL′)

*The mechanism's first execution THROUGH A WINDOW: the run host's stream reaching a real terminal window, a real
transcript preview and a persona card, with real keystrokes going back. Proven by `pnpm terminal-proof`'s REQ-SHELL-166
section — the product's own modules in the product's own arrangement minus Electron's main (`harness.mjs`: the real
terminal manager over a real PowerShell pseudo-terminal, the real `createTerminalHost`, the real `FrameDeliveryLimiter`
over a real `UpdateRelay`; the page: the real window component, the real preview, the real registries; the keys: real
input events) — and by the unit suites. Two consecutive green runs; the figures are in the handoff.*

**Built and run.** The terminal window exists (`main/windows.ts` `TerminalWindows`; `renderer/main.tsx` `role=terminal`):
one per main window, 900×620, titled by the renderer (`terminalWindowTitle`), shown without focus when it opens
automatically under `terminal/autoOpen` (since 2026-10-14 the registered `interface/terminalPopout`, REQ-CONFIG-405; the old key
is carried over once), destroyed on close and rebuilt on the next open, closed and reopened without
focus when the followed session changes, closed and discarded when a session starts from none, gone with its main
window (REQ-SHELL-080/081/086/109/110/111). It subscribes to the followed session for itself and asks the run host for
the resync (REQ-SHELL-104). The main window and each persona window hold one `TerminalStreamSet` over the headless
emulator, read by the transcript pane and the persona card through one terminal host (REQ-SHELL-079, REQ-SHELL-075 b),
and the Workspace toolbar's control carries the running count (REQ-SHELL-108). `terminal.sendKeys` consumes AM's
`EncodedKey` through the one table; REQ-SHELL-107's entries were read back from the run host's writer in the proof and
have spec 12's shape (`user-input`, `user`, `terminal`, the reason sentence, `terminal fg:live-1: typed "abc123XYZ"
(in: node …)`, `sent C-d`, `sent C-c`, `took control of the terminal`).

**REQ-SHELL-166, measured against the real pseudo-terminal through the window.** The figures are the two consecutive
green runs this note rests on (112 assertions each), both taken with four other agents building on the same machine.
Echo latency, take-control armed, key press to the painted frame: **12.4 / 23.1 / 18.1 ms** over three keystrokes on
the first run and **21.5 / 25.0 / 16.0 ms** on the second (key to the frame's arrival 3.9–16.1 ms and 12.0–15.9 ms;
the budget is 100 ms, and the worst of the six readings is 25.0 ms). Order and fidelity: a burst of nine keys with
`F5` and `Insert` inside it reached the process as exactly `abc123XYZ` — nothing dropped, duplicated, reordered or
invented, and the two unmapped keys transmitted nothing. Interrupt: **69 ms** and **73 ms** from the control to the
command's end (exit 130, the process's own `INTERRUPTED`); end input: **69 ms** and **64 ms** (exit 0, `EOF`). Resize:
the proof shrinks the window's box from 620 px to 460 px **while the first command runs**, the grid re-measures and
reports 118×26 → 118×16, the run host resizes the pseudo-terminal, and the size the process reports (`cols=118
rows=16`) equals the grid's last report — an assertion of its own (`live.midCommandResizeReachedProcess`) and the
trigger for the repaint below. Throughput: a 10,000-line command finished with the same 10,000 lines and the same
exit status (3) with the window's delivery off and on — 3.4 s against 2.7 s on the first run and 3.3 s against 2.7 s
on the second. Three surfaces — the grid, the row preview, the persona card's preview — held identical cells, running
state, truncation and exit code at rest (REQ-SHELL-102). The limiter delivered every frame unmerged at these rates
(59 delivered, 0 merged, on both runs).

**Found — defect AL2-1: the delivery limiter re-ordered a stream's metadata under saturation.** The first draft kept
ONE concatenated delta and ONE latest meta per stream and drained delta-then-meta, so a `meta` that arrived between two
deltas went out after the merged delta with a LOWER `seq`, and every display refused it as already applied
(REQ-SHELL-104's own rule): under saturation a running→closed transition or a resize could be lost. Owed by Part AL's
handoff as a regression test; the pending state is an ordered list of segments now (adjacent deltas merge, a screen
supersedes what precedes it except the metas, a meta after a meta supersedes it), and the test pins the order.

**Found — defect AL2-2: a late attacher's resync frames carried no metadata.** A display created from a bare `screen`
frame took the unknown-stream defaults — "Terminal", running, 80×24, no command — and an ENDED stream was shown as
running for ever, since no later meta was coming. The resync frame carries the stream's meta (any frame may; the display
applies it idempotently, REQ-SHELL-105). Unseen in wave 1 because nothing attached late.

**Found — defect AL2-3, measured and NOT repaired: a resize during a command repaints into the observation.** A grid
resize while a command runs resizes the pseudo-terminal (REQ-SHELL-166 requires it), and ConPTY answers a resize by
repainting its viewport — the visible text again, with cursor addressing. The observation the agent reads is
ADR-0020's VT-strip over the raw bytes, so the repainted text appears in it a second time. **The commonest trigger is
removed**: a banner appearing or leaving in the terminal window changed the grid's host, so every banner cost the
process a resize (AM's handoff §9 named it); the banner slot now reserves the notice's own height, so a banner costs
no resize, and the throughput criterion holds with the window open. What is left in the product is a **user resizing
the window** — and since nothing else on the proof's path resizes mid-command any more, the proof performs that resize
itself (the window's box from 620 px to 460 px, 26 rows to 16, in the middle of the first command), so the defect is
measured by the runs this note rests on and not by a trigger that has since gone. Both runs observe the same thing:
the echo program printed five lines and the agent read sixteen — `READY`, the start marker `__rot_…_s`, `READY`
again, ten blank lines, then `qwe`, `abc123XYZ`, a blank and `EOF` (`results.json`: `live.resizeRepaint` =
`{ readyLines: 2, markerInBody: true, lines: 16 }`, and `live.endInput.output` is the whole observation). The repair
is an observation derived from the screen model rather than from the bytes — a revision of ADR-0020's capture, not
this record's — and it is raised, not made.

**Found — defect AL2-4: the display closed a stream for good, but the registry re-opens it.** ADR-0047's display read
REQ-SHELL-105's "running → closed exactly once" over the stream's whole life; this record's registry (Part AL) re-opens
an agent's one `fg:<agent>` stream in place for each next command. Through the window: "exit 0" over a running command,
every control disabled, the toolbar counting nothing, and the interrupt of the proof's second command never sent. The
reading is now per command — a later `meta` with `running: true` and a higher `seq` is the next command opening the same
stream, the exit code going with it; an older frame still cannot reopen anything. Recorded in ADR-0047's note too.

**Readings.** (1) REQ-SHELL-110/111 at their meeting point: a change of the followed session to NONE closes the window
and leaves it closed; from one session to ANOTHER closes and reopens without focus when it had been open; from NONE to
a session closes and does NOT reopen — an open window on no session can only have been on its empty state, so nothing
was being watched and 111's discard is the rule taken (`TerminalWindows.onSessionChange`). (2) REQ-SHELL-109 names no
surface for the preference; it is drawn in the terminal window itself, in a slim bar under the content, since the window
the preference is about is where a user looks for it. (3) The resync is requested after the first whole-session update
of a newly followed session — the subscribe's attach delivers it, so channel 3 reaches the window by then.

**Not executed here.** REQ-MONITOR-306 across two windows (T″); the full-screen program repainting to a new size with
no corrupted cells (no such program is in the harness; the size round trip and the emulated screen's resize are
measured); the packaged application's terminal window (the proof drives the components, the renderer boot branch and
main's registry are covered by the unit suite, not by a launch). OQ-5 and OQ-38 stand as wave 1 recorded them; the
echo figures above are the ceiling-plus-flush reading measured end to end.
