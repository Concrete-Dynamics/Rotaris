## A poll after C-c says the interrupted command is still running

REQ-TOOLS-098's advice for a soft-paused command is to poll with an empty command or to interrupt it with `C-c` and
`is_input=true`. An agent that interrupts and then polls, as that advice reads, is told the command is still running:
exit −1, `soft_pause`, "The process may still be running", though the process died on the interrupt. An interactive
`sh` that takes the interrupt abandons the rest of the wrapper's line, so the paused call's end frame never prints, and
nothing else in the stream tells the session that the line is done. The call stays paused until the agent submits
another command, whose printed start marker then closes it (A10's repair,
[`keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output`](keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output.md)).
Every poll before that reads −1 again.

Noticed 2026-09-30 while repairing A10 under [R-067](../../product/requests.md#r-067). Measured with dash through a
real PTY, in a scratch variant of the case "REQ-TOOLS-098/127/179 (A10): a soft-paused command interrupted with C-c …"
in `terminal.test.ts`: `sleep 20; printf …` soft-paused, `C-c` sent with `is_input`, 1.5 s waited, then a poll. The
poll read `^C` and `#` (the prompt), exit −1, `soft_pause`. Measured on `origin/main` before the repair too
(2026-09-30, the same scratch case with `df96ad2`'s `foreground.ts` swapped in): the same `^C`, `#`, −1, `soft_pause`,
"The command is still running". Recorded, not repaired.

## Specs

- `REQ-TOOLS-098`: the soft pause is "while its process keeps running"; here the process has ended, and the
  observation says it may still be running.
- `REQ-TOOLS-179`: −1 is a soft pause in the foreground. A command that has ended reads as one.
- What such a poll should report instead, once the end is known, is [OQ-147](../../architecture/open-questions.md).

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts`:
  - `onData` closes a paused call on its own end frame or at the next call's printed start marker (`pausedShare`), and
    on nothing else;
  - `poll` reports −1 while the paused call is open.
- `packages/agent-tools/src/terminal/index.ts`: `sendInput(keystroke('C-c'))` for `is_input`, and the soft-pause detail
  a poll renders.

## Outcome (repaired 2026-10-01)

Confirmed first on the branch, cut from `origin/main` `7fe05a7`: the note's scratch case, kept as the case "REQ-TOOLS-098/179
(OQ-147): a poll after C-c reports …" in `packages/agent-tools/src/terminal/terminal.test.ts`, read `soft_pause` on the
poll 1.5 s after the `C-c` (dash through a real PTY).

What changed, in `packages/agent-tools/src/terminal/foreground.ts`:
- **An interrupt marks the paused call.** Keystrokes carrying `C-c` written while a command is soft-paused — the agent's
  `is_input`, or the terminal window's interrupt or send-keys — set `interrupted` on it (`noteInterrupt`).
- **A poll of a marked call finds the end of its line.** Once the shell holds its terminal again (`shellHoldsTerminal`:
  `/proc/<pid>/stat`'s `tpgid` is the shell's own `pgrp`; unknown off Linux, where the line is submitted at once), the poll
  submits one no-op line of the product's own, as OQ-144's handshake does, and waits for it at most 2 s
  (`findInterruptedEnd`, `INTERRUPTED_END_WAIT_MS`). The shell reaches it only once the paused line is done, so its printed
  start marker closes the paused call (`closer`, read by `pausedShare` ahead of any later call's marker), and the poll hands
  the call over with OQ-147's reading: exit −1, `execution_error`, "the paused command ended without an exit status of its
  own". A program that survived the interrupt and still holds the terminal is written nothing, and the poll answers "still
  running" as before.
- **The line is nobody's output.** Its echo and frames are cut from the paused call's capture (`until`) and withheld from
  the live stream (`CommandRegion.withholdRowsWith`, live-run L9).

Whether the product may write that line is [OQ-168](../../architecture/open-questions.md), raised with this reading built;
OQ-147's sentence that recorded this defect is annotated in place, and ADR-0020's note reports the repair back.

Pinned by three cases in `terminal.test.ts`:
- "REQ-TOOLS-098/179 (OQ-147): a poll after C-c reports the interrupted command as ended …" (dash through a real PTY): the
  note's case — red on the unrepaired code (`soft_pause`); red with the terminal window's interrupt left unmarked; red
  with the live-stream withholding removed (the tap carried `# printf '%s\n' '__rot_…`).
- "REQ-TOOLS-096/098 (OQ-147): a poll after C-c writes nothing into a program that survived the interrupt …": a child `sh`
  that ignores SIGINT and waits in `read` keeps the terminal; red with the terminal-holder check removed, when the line
  went to `read` and the agent's `hello` to the shell.
- "REQ-TOOLS-127 (OQ-147): the no-op line a poll after an interrupt submits reaches the live stream in no row …" (pure,
  every two-chunk split).

The live run's `terminal` scenario carries the shape now (`interrupt` in `apps/desktop/scripts/lib/terminal-shapes.mjs`:
`C-c` with `is_input` after the wedge's poll, and one poll after it, read by `interruptedPollReading`, pinned in
`terminal-shapes.test.ts`). Shown on the live run's `terminal` scenario against the self-hosted `katalyst` endpoint (pack `2026-10-01T07-22-08-254Z` of this worktree, git-ignored; `--only=terminal --skip-build` after one `pnpm build`, Xvfb, as root): the model sent `C-c` to the soft-paused wedge (`node -e "setTimeout(…,
45000)"`) and polled; the poll, 1,346 ms after the interrupt, read exit −1, `execution_error`, "the paused command ended
without an exit status of its own", output `^C`, and the scenario passed with no `__rot_` in any terminal result.

Not reached: Windows and macOS, where nothing says who holds the terminal; PowerShell's no-op (`$null`) and whether it
abandons its line on `C-c` are reasoned, not measured.

## Outcome, corrected by the repair's first verification (2026-10-01)

**Falsified, kept beside its replacement:** "keystrokes carrying `C-c` … — the agent's `is_input`, or the terminal window's
interrupt or send-keys — set `interrupted` on it", read above and in OQ-168 as covering the window's interrupt. It covered
one ordering only: an interrupt written once the call was soft-paused. The window's interrupt (REQ-SHELL-093) can also
arrive while the call still RUNS, the natural moment for a user watching a long command, and the shell abandons the
wrapper's line just as it does under a paused call, so no end frame prints. Nothing was marked then. The verifier measured
it with dash through a real PTY: without a `timeout`, an interrupt 0.8 s into `sleep 20; printf done-later` soft-paused the
call (`^C`, `#`), and both polls after it, 1.5 s and 3 s later, read `soft_pause` — this note's own symptom; with
`timeout: 8` and the interrupt at 1 s, the call waited 8,017 ms and returned `timeout`, exit 124, a session reset with its
shell state lost for a process that had died at 1 s. Reproduced on the branch before the change by the first two cases
below (both `soft_pause`).

What changed, in `packages/agent-tools/src/terminal/foreground.ts`:
- **An interrupt marks the running call too.** A `C-c` written while a foreground call runs and no call is paused calls
  `ActiveCall.onInterrupt`; the call then looks every 100 ms (`INTERRUPT_WATCH_MS`) for its shell holding the terminal
  again, and at that moment submits the same no-op line (`submitCloser`). Its printed start marker (`printsMarker`, told
  from the echo as `pausedShare` tells it) ends the call: −1, `execution_error`, "the command ended without an exit status
  of its own", no reset, the shell's state kept, and the snapshot refreshed as after any exit. The line's echo and frames
  are cut from the capture (`until`) and withheld from the live stream as before. A line that reaches its own frame first
  keeps its own status.
- **The mark is carried into the soft pause.** A running call that soft-pauses before its shell holds the terminal hands
  `interrupted` (and any no-op line already submitted) to the paused call, and a poll after the program died reads it as
  a `C-c` sent after the pause.
- **A poll made at once after the `C-c`** (the verifier's optional VS1) waits up to 500 ms (`INTERRUPT_SETTLE_MS`) for the
  shell to take its terminal back before it looks, so it no longer depends on the model's latency.

Pinned by three more cases in `terminal.test.ts`:
- "REQ-SHELL-093/REQ-TOOLS-098/179 (OQ-147): the terminal window's interrupt while the call still runs ends it …" (dash,
  real PTY): no timeout, interrupt at 0.8 s, the call ends before its 4 s window with OQ-147's reading; `timeout: 8`,
  interrupt at 1 s, it ends within 6 s with no `kill_status`, and a variable set before both interrupts is still `[kept]`
  with no reinitialization. Red before the change (`soft_pause`).
- "REQ-SHELL-093/REQ-TOOLS-098 (OQ-147): an interrupt that reached the call before its soft pause is carried …": a child
  `sh` that runs an INT trap for 4 s and then dies of the interrupt, so the line is abandoned after the pause; the poll
  after it reads −1, `execution_error`. Red before the change (`soft_pause`).
- "REQ-TOOLS-098/179 (OQ-147): a poll made at once after C-c reads the interrupted command as ended": red before the
  change (`softPaused` true).

Still not reached, stated in OQ-168: off Linux nothing says who holds the terminal, so nothing is written while a call
runs. There the window's interrupt is only carried into the soft pause, and a call given a `timeout` still runs out its
hard cap and is reset. Unmeasured: no Windows host here, and no macOS artifact under IC-3.
