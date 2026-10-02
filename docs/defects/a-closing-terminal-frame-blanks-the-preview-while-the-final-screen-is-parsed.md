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
[`terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md`](fixed/terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md).
