## Output a command writes as it soft-pauses is lost to its poll

When a foreground call reaches REQ-TOOLS-098's no-output window, `execute` removes the call's listener, then awaits the
emulator's write of what it held, and only then opens the paused call that later chunks are given to. A chunk the PTY
delivers inside that await is given to neither: it reaches the live stream (`region`) and the marker scan, but not the
paused call's screen, so no poll ever returns it. If that chunk carries the command's own end frame, the scan resolves
the call's already-settled promise and clears `active`, and the paused call opened just after never sees its frame: it
reads "still running" on every poll until a later call's start marker closes it, and then with no status of its own
(OQ-147's −1). The window is the few milliseconds of one emulator write, at the moment the command has been silent for
the whole no-output window, so it needs a command that writes again just then.

Noticed 2026-09-30 while repairing A10's second verification findings under [R-067](../../product/requests.md#r-067).
Reasoned from the code, not measured. Recorded, not repaired.

## Specs

- `REQ-TOOLS-098`: a later poll returns what the command produced since the pause; bytes produced at the pause are not
  returned by any poll.
- `REQ-TOOLS-179`: a command that ended in that window reads −1 (soft pause) and then −1 with no status, where its own
  exit status was printed.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts`:
  - `execute`: the call's listener is removed before `await screen.write(hold.take())`, and `pausedCommand` is set only
    after it, in the `pause` branch;
  - `onData`: feeds a paused call only once `pausedCommand` is set (`pausedShare`), and closes `active` on its frame
    whatever the state of the call behind it.

## Outcome (repaired 2026-10-01)

Confirmed first, by measurement where the note had reasoned: the case "REQ-TOOLS-098/179: output and the end frame a
command writes while its soft pause is handed over reach the poll, with the command's own status" in
`packages/agent-tools/src/terminal/terminal.test.ts` drives a PTY double whose next chunk arrives from inside the
emulator's write at the pause. On the unrepaired `execute` both of its halves were red: a command that wrote
`late-output` and its own end frame (`:7`) in that window was polled as `(no output)`, exit −1, still running; one that
wrote `late-output` and kept running was polled as `(no output)`.

What changed, in `packages/agent-tools/src/terminal/foreground.ts`'s `execute`: the paused call is opened — `pausedCommand`
set with the call's screen and `hold`, `active` cleared, the session idle — in the same turn as the pause resolves, before
the call's listener goes and before the emulator's write of what it held is awaited. A chunk that arrives during that write
is given to the paused call by `onData` (`pausedShare`, into the same `hold`, which the next poll feeds to the screen), and
a chunk carrying the command's own end frame closes it with its own status. `delivered`, what the pause returned, is set
on the same call once the screen has it, so a call closed inside the write is handed over from there. With the repair both
halves pass: `late-output` with exit 7, and `late-output` with the call still running.

Not shown in a live run: the window is one emulator write at the moment the command has been silent for the whole
no-output window, and no scenario can time a command's output to it.
