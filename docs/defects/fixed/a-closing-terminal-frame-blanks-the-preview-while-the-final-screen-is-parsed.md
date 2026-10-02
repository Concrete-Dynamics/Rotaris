## A closing terminal frame can blank the row's preview while the final screen is parsed

When a command ends, its stream's closing `screen` frame replaces the screen. `applyFrame` (`packages/ui/src/terminal/emulator.ts`)
calls `reset()` (RIS through the write queue) and then writes the whole final text. The library parses that text over
several tasks: it drains its write queue on macrotasks and yields when a chunk outlasts its time budget. A `snapshot()`
taken between the reset and the end of the parse reads a partial screen, and empty at first. `previewOf`
(`packages/ui/src/terminal/streams.ts`) reads that snapshot, so a transcript row or persona card drawn in that window
shows an empty or partial preview of a command whose output had been on screen a moment before. Each surface's emulator
parses at its own pace, so in that window the pop-out grid can show the output while a preview shows none.

Seen once, 2026-10-01, in `terminal-proof`'s live section, run 16 of 20 beside two busy loops on one CPU (load average
11.2 on 4 CPUs). The read came after the 10,000-line flood had ended (`live.floodPainted`). The grid's last rows were
`line 9998`, `line 9999` and `line 10000`, and the row preview's lines were `[]`. The read waited until both had shown
`line 10000` (852 ms), but a second read moments later found the preview empty. The closing frame arriving between the
two reads fits that result. It was not traced to the closing frame directly, and it was not seen on screen: the proof
reads the registries, not pixels. A final text of a screen or so parses within one task, so the window should be long
only when the closing text is long and the host is slow.

Not repaired here. `terminal-proof` now takes that reading only after the closing frame has arrived and every surface has
parsed it (`window.__terminalProof.settled`). The check measures the painted end state, which is what it is for, and
the transient state is left to this note.

## Specs

- `REQ-SHELL-102`: the pop-out window and the previews "show the same thing at the same time … Moving between the two
  never shows the user older output in one than in the other". A preview blanked by the reset shows less than the grid
  for as long as the parse takes, if the surfaces are drawn in that window.
- `REQ-CHAT-063` / `REQ-CHAT-076`: the row's preview of a running or finished command.

## Relevant files

- `packages/ui/src/terminal/emulator.ts`: `applyFrame`'s `screen` branch, `reset()` and then `write(payload)`.
- `packages/ui/src/terminal/headless.ts`: the preview emulator; `reset()` is RIS through the queue.
- `packages/ui/src/terminal/streams.ts`: `previewOf`, which snapshots whatever has been parsed.
- `apps/desktop/scripts/terminal-proof/main.cjs`: `live.floodPainted`, and the read that saw it.

Noticed 2026-10-01 while repairing
[`terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md`](terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md).

## Outcome (2026-10-02, fin7, repaired)

The subscription point holds, for the previews, the screen a `screen` frame's reset replaces, from the moment the parser
reaches that reset until the frame's text has parsed, and only then. `applyFrame` (`packages/ui/src/terminal/emulator.ts`)
takes two hooks for an applied `screen` frame: `resetReached`, an empty write queued just ahead of the reset (which is
itself queued, RIS), so it runs once every delta queued before the frame has parsed; and `parsed`, the callback of the
frame's text. `TerminalStreamSet.apply` (`packages/ui/src/terminal/streams.ts`) takes the emulator's snapshot in
`resetReached` and holds it, and drops the hold in `parsed`. Until the reset is reached `previewOf` reads the emulator as
it parses, so a backlog of deltas queued ahead of the closing frame still moves the preview forward at its surface's
pace; inside the window it returns the held lines (the last complete screen) with the frame's own state (running, exit
code, command), never the reset or half-written screen. The queue parses in order, so at most one screen frame per
stream is inside its window at a time. When the hold is dropped the listeners are notified a second time with a new
outcome, `parsed`. In the product today the only listener is the toolbar's counts (`useTerminalCounts`), which ignore
it; a row preview or persona card is drawn again by the transcript's own renders (REQ-CHAT-063's refresh while the row is
live, and the row's next publication). `clear()` drops every hold, and a hook whose stream was cleared or re-created since
does nothing. The grid reads its own emulator and is unchanged, so inside the window the grid shows the reset or
half-written screen while the previews show the screen it replaced: the two differ there by design, and the previews are
never the older of the two. Deltas are never held.

**The first form of this repair was wrong, and is kept here.** As first committed on this branch, the hold was taken
when the `screen` frame ARRIVED and kept until every pending screen frame had parsed. Under load, the condition the
defect needs, the parser is behind, and xterm parses the deltas still in its queue before the reset: the preview froze
on the screen of the frame's arrival through the whole backlog while the grid's emulator moved on. That shows the user
older output in the preview than in the grid, which REQ-SHELL-102 forbids. fin7's verifier showed it with
`@xterm/headless`: after 200 queued deltas of 50 lines and the closing frame, the preview stayed at `line 0` while
another set's emulator showed line 4300 and then 6300; on origin/main the preview moved forward (900, 2500). The hold
now starts at the reset.

Pinned by `packages/ui/src/terminal/terminal.test.ts`, "preview — a closing screen frame never blanks the preview while
the final screen is parsed", over an emulator whose parse completes one queued write per step, and one case over the real
parser:
- between the reset and the closing text the preview reads the old lines while the emulator's own screen reads `[]`, and
  the listeners see `applied` then `parsed`;
- two screen frames in a row: each holds only from its own reset, so the preview reads the first frame's screen once it
  has parsed, then holds it through the second's window; a later delta is read live;
- four deltas queued (not drained) ahead of a closing frame: the preview moves through each of them, is never `[]`, and
  never has fewer lines than its own emulator's screen (red on the arrival hold: 1 line against 2);
- the real parser (`@xterm/headless`), 10,000 queued lines and the closing frame behind them, sampled once per task: the
  preview's last line is never below its own emulator's and never empty (red three runs of three on the arrival hold,
  `0` against 800 to 1450);
- a stream cleared mid-parse announces nothing.
The first three are red on origin/main's code too (the preview read `[]` after the reset had parsed). The real-parser
case passes there, three runs of three: origin/main reads its emulator live, so it is never behind it, and its samples
never landed between the reset and the first rows of text.

Shown by `terminal-proof` (`node apps/desktop/scripts/terminal-proof.mjs --skip-tests` after `pnpm build`, as root under
Xvfb, Node 24): the live section samples both previews from each closing frame's arrival until every surface has parsed
it, at once and on every task the page gets (`watchPreviews` / `previewWatched` in `proof-entry.tsx`).
`live.closingFrameNeverBlanksPreview` fails on an empty sample, and `live.closingFramePreviewNeverBehindItsScreen` on a
sample whose preview shows a lower `line N` than its own emulator. Three runs on the repair as now committed passed 120 of
120 at load averages of 2.6 to 3.1 on 4 CPUs (one closing frame, three samples, none empty, none behind; the preview went
from 15 lines to 16). Earlier, on the first form, five runs passed 119 of 119 at 1.6 to 3.6, and five with only
`streams.ts` and `emulator.ts` restored passed too, at 2.6 to 3.2: on this host the flood's closing text parsed within one
task and no delta was queued behind it, so the proof's sampling did not open the window the note saw (run 16 of 20 at
load 11.2). The tests are the pin; the proof shows the repaired previews never blank and never fall behind.
