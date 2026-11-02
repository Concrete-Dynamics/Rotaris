## terminal-proof's input checks fail at random on a heavily loaded host

On 2026-10-01 `pnpm terminal-proof` was run 36 times beside six busy loops, to reproduce
[the font-change note](a-font-change-under-load-reports-an-intermediate-terminal-geometry.md). The other plan's
agents were on the host as well (4 CPUs, load average 4.8 to 18). Ten runs were not fully green: seven of the twelve on
the code before that repair, and three of the twenty-four after it. None of those reds was the font-change check. Each was an
input or timing check:

| Check | Red in | What it read |
| --- | --- | --- |
| `wheel.subNotch` | the last run before the repair | the fractional notches moved rows at events 7 and 9, not at 4, 7 and 10 |
| `selection.text` | the last run before the repair | the extracted text equalled the expected text, so another part of the check failed (the range or `hasSelection`) |
| `live.echoUnder100ms` | 2 of the 24 runs after the repair | a keystroke's echo took more than 100 ms to paint |
| `selection.emptyCopyFails` | 1 of the 24 runs after the repair | the "Nothing copied" acknowledgement, or the single clipboard entry, was missing |

The first loop kept only its last run's `results.json`. Its other six unclean runs (114 or 115 of 116) are counted by
run, not by check. Six runs with nothing else in the worktree running passed 117/117 each. It is not known whether
any of these reds is a product fault that load exposes, as the font change turned out to be, or a proof whose pauses are
too short for a loaded host. `live.echoUnder100ms` is a time bound, and it may be expected to fail at that load.

## Specs

- None contradicted as far as is known. The checks measure `REQ-SHELL-101` (the wheel, the selection, the empty copy)
  and `REQ-SHELL-166` (the echo). A product cause would contradict those requirements; a proof cause contradicts none.

## Relevant files

- `apps/desktop/scripts/terminal-proof/main.cjs`: the four checks (`wheel.subNotch`, `selection.text`,
  `selection.emptyCopyFails`, `live.echoUnder100ms`) and the fixed pauses before them.
- `packages/ui/src/terminal/wheel.ts`, `selection.ts` and `TerminalGrid.tsx`: what the first three measure.

## Repaired — 2026-10-02, under R-062 (measured 2026-10-01)

**Which side each red was on.** `terminal-proof` (`--skip-tests`, as root under Xvfb, Node 24) was run in loops of
twenty with each run's `results.json` kept, in two shapes. In shape A, the launch and two busy loops were pinned to one
CPU. In shape B, the launch and three busy loops were pinned to two CPUs. The other plan's agents were on the host
throughout. On the code before the repair (`b19b74e`):

| Shape | Load average | Not fully green | Checks red |
| --- | --- | --- | --- |
| A | 5.7 to 15.3 | 9 of 20 | `live.floodPainted` 7, `live.echoUnder100ms` 3 |
| B | 7.8 to 15.3 | 3 of 20 | `wheel.subNotch` 2, `live.echoUnder100ms` 1 |

None of these reds was the product's:

- **`wheel.subNotch`** read rows moving at events 4, 8 and 10 in one run, and at 7 and 10 in the other. Both times the ten
  tenths of a notch moved exactly three rows, as the check's second half confirms. So the accumulator (`wheel.ts`) was
  right, and the readings were taken before some events had arrived. Chromium's browser process holds a wheel event
  until the renderer has handled the one before it, and merges the events it holds. Key and pointer events are not held
  behind them. A notch read 60 ms after it was sent could therefore still be queued, or arrive merged with the next.
- **`selection.text`** and **`selection.emptyCopyFails`** (red in the note's own loop, not in these) read the page 120 ms
  and 40 ms after the input. The same race applies, plus one more: the Shift+End that returns the view to the tail is a
  key event, so it can overtake the last queued notches. The view then moves after the drag has been measured, which fits
  the note's red: the text right, the rows of the range off.
- **`live.floodPainted`** read the grid 500 ms after the 10,000-line flood ended, and the grid was still parsing (its last
  line 7,399 to 9,755).
- **`live.echoUnder100ms`** missed by one keystroke of three each time (105 to 131 ms). The time went into the frame
  (key to frame up to 60 ms) and into waiting for its paint, at load averages of 9 to 13.6 on four CPUs.

**What changed.**
- `apps/desktop/scripts/terminal-proof/fence.cjs` (new): `until`, and an input fence that waits until the page has
  counted an event. The proof page (`packages/ui/src/terminal/proof-entry.tsx`) counts every keydown and mouseup in the
  capture phase of the same dispatch that the grid handles them in, and every wheel event as before (`inputs()`). A fence
  that times out is recorded in `results.inputFences`, the summary names it, and it fails the run
  (`harness.everyInputCounted`, the proof's 118th assertion), so it is never read beside a pass.
- `main.cjs`: every `key`, `click` and `wheel` waits on its fence; one wheel event is in flight at a time, so none is
  held or merged. The selection is read once the drag's mouseup has been counted. The copy and empty-copy checks wait
  for their acknowledgement, which follows the clipboard write's promise. The flood is read once its closing frame has
  arrived and every surface has parsed it (`settled`). The fixed pauses that only paced the script stay.
- `live.echoUnder100ms` keeps REQ-SHELL-166's 100 ms bound and the page's own timestamps it always used (`pressedAt` in
  the page's keydown listener, `paintedAt` in the animation frame after the grid parsed the frame). Two things are now
  recorded beside it: how long the key waited in the renderer's queue (`queuedMs`, from the event's own time stamp), and
  the host's load average and CPU count (`results.live.echoLoad`, printed with the live figures). Whether the bound holds
  on an oversubscribed host is a question the specification leaves open: [OQ-176](../../architecture/open-questions.md).
- **Pinned** by `fence.test.ts`'s three cases, over a page that counts the event only on its fourth read: the old form's
  single read sees the state before the event, and the fence waits for it. An event never counted is recorded as a miss.

**After.** The same two loops on the repair, before the flood's wait was added:

| Shape | Load average | Not fully green | Checks red |
| --- | --- | --- | --- |
| A | 7.3 to 12.8 | 2 of 20 | `live.echoUnder100ms` 1 (load 12.3), `live.floodPainted` 1 |
| B | 7.4 to 18.0 | 2 of 20 | `live.echoUnder100ms` 2 (load 9.3 and 13.5) |

No input check went red in those forty runs, and no fence timed out. The one `live.floodPainted` red was a second
mechanism. The grid showed `line 10000` but the row preview was empty: the closing frame had reset the preview's emulator,
and the read fell before it had parsed the final screen. The read now waits for that, and the product's side is recorded
in [`a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md`](a-closing-terminal-frame-blanks-the-preview-while-the-final-screen-is-parsed.md).
The echo reds stayed red, as they should: the bound is the requirement's. Each missed by one keystroke of three, with
the key queued in the renderer for at most 11 ms and the rest in the frame or its paint.

**Final.** The same two loops on the repair as committed, with the flood's wait in place:

| Shape | Load average | Not fully green | Checks red |
| --- | --- | --- | --- |
| A | 6.9 to 11.2 | 1 of 20 | `live.echoUnder100ms` 1 (load 11.1) |
| B | 5.7 to 16.0 | 2 of 20 | `live.echoUnder100ms` 2 (load 11.1 and 12.8) |

No input check and no flood reading went red, and no fence timed out. Across the eighty runs on the repair, the input
checks were green in all eighty. Every echo red came at a load average above twice the CPU count. Alone, the proof
passed 117/117 (key to paint 20 to 30 ms).

**Again on the branch, 2026-10-02**, on the repair with `harness.everyInputCounted` and after origin/main `503a98d`
(as root under Xvfb, Node 24, `--skip-tests`, every run's `results.json` kept): three runs with only the other plan's
agents on the host (load average 6.4 to 10.7) and eight beside two busy loops (6.1 to 12.3). All eleven passed 118/118,
no fence timed out, and the echo read key to paint at 8.3 to 80.9 ms.

**After verification, 2026-10-02.** `live.echoUnder100ms` now reads from the key event's own time stamp where the page
has it (`from: 'event'` on each echo), so the time the key waited in the renderer's queue is inside REQ-SHELL-166's
100 ms rather than beside it ("measured from the key press"); the listener's time is the fallback. This tightens the
reading and relaxes nothing. `live.floodPainted`'s `waitedMs` is recorded and bounds nothing of REQ-SHELL-150's budget.

**What this note leaves open, to the owner.** The proof side is repaired: every input check reads the state it waited
for. Whether the 100 ms echo must hold on a host whose CPUs other processes oversubscribe is not this note's to rule;
it stays open as [OQ-176](../../architecture/open-questions.md), and a red echo at a load average above the CPU count is
run again alone meanwhile.
