## A poll after C-c says the interrupted command is still running

REQ-TOOLS-098's advice for a soft-paused command is to poll with an empty command or to interrupt it with `C-c` and
`is_input=true`. An agent that interrupts and then polls, as that advice reads, is told the command is still running:
exit −1, `soft_pause`, "The process may still be running", though the process died on the interrupt. An interactive
`sh` that takes the interrupt abandons the rest of the wrapper's line, so the paused call's end frame never prints, and
nothing else in the stream tells the session that the line is done. The call stays paused until the agent submits
another command, whose printed start marker then closes it (A10's repair,
[`keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output`](fixed/keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output.md)).
Every poll before that reads −1 again.

Noticed 2026-09-30 while repairing A10 under [R-067](../product/requests.md#r-067). Measured with dash through a
real PTY, in a scratch variant of the case "REQ-TOOLS-098/127/179 (A10): a soft-paused command interrupted with C-c …"
in `terminal.test.ts`: `sleep 20; printf …` soft-paused, `C-c` sent with `is_input`, 1.5 s waited, then a poll. The
poll read `^C` and `#` (the prompt), exit −1, `soft_pause`. Measured on `origin/main` before the repair too
(2026-09-30, the same scratch case with `df96ad2`'s `foreground.ts` swapped in): the same `^C`, `#`, −1, `soft_pause`,
"The command is still running". Recorded, not repaired.

## Specs

- `REQ-TOOLS-098`: the soft pause is "while its process keeps running"; here the process has ended, and the
  observation says it may still be running.
- `REQ-TOOLS-179`: −1 is a soft pause in the foreground. A command that has ended reads as one.
- What such a poll should report instead, once the end is known, is [OQ-147](../architecture/open-questions.md).

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts`:
  - `onData` closes a paused call on its own end frame or at the next call's printed start marker (`pausedShare`), and
    on nothing else;
  - `poll` reports −1 while the paused call is open.
- `packages/agent-tools/src/terminal/index.ts`: `sendInput(keystroke('C-c'))` for `is_input`, and the soft-pause detail
  a poll renders.
