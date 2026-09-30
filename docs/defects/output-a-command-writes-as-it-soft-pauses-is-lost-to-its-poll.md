## Output a command writes as it soft-pauses is lost to its poll

When a foreground call reaches REQ-TOOLS-098's no-output window, `execute` removes the call's listener, then awaits the
emulator's write of what it held, and only then opens the paused call that later chunks are given to. A chunk the PTY
delivers inside that await is given to neither: it reaches the live stream (`region`) and the marker scan, but not the
paused call's screen, so no poll ever returns it. If that chunk carries the command's own end frame, the scan resolves
the call's already-settled promise and clears `active`, and the paused call opened just after never sees its frame: it
reads "still running" on every poll until a later call's start marker closes it, and then with no status of its own
(OQ-147's −1). The window is the few milliseconds of one emulator write, at the moment the command has been silent for
the whole no-output window, so it needs a command that writes again just then.

Noticed 2026-09-30 while repairing A10's second verification findings under [R-067](../product/requests.md#r-067).
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
