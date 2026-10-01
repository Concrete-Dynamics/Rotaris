## A call made while a command is soft-paused waits behind it without saying so, and the paused command's end goes unreported

After a soft pause, REQ-TOOLS-098 tells the agent it can poll or interrupt. An agent can also issue a new command. The
product sends the new command's line to the shell at once, and the shell runs it only when the paused command has
finished. The new call's observation reports its own command and nothing else: not that it waited, not what for, and not
that the paused command ended. The paused command's end, meaning what it wrote since the last poll and its exit status,
is held for an empty poll that nothing prompts the agent to make.

In the default live run's `terminal` scenario, `node -e "setTimeout(…, 45000)"` soft-paused at 30.0 s, and one poll
found it still running. The agent then issued `node -e "console.log('failed to connect to the docker API');
process.exit(0)"`. That call took 5,932 ms and ended at 02:57:59.105, when the 45 s timer ran out. Its observation said
only "The command exited with code 0." The agent never polled again, so the paused command's own exit was never
reported.

The code shows a worse case, not measured here. Behind a paused command that stays silent, a new call that names no
timeout reaches its own no-output window and soft-pauses in turn. That pause replaces the earlier paused call: its screen
is disposed and its end never reaches a poll (`foreground.ts:886-899`). A call that names a timeout runs into that
timeout instead. The autopsy said the new call would run into "its 100 s hard timeout and reset the session"; that holds
only for a call that names a timeout, because a call that names none soft-pauses at 30 s first.

Live-run finding: a71-8

No requirement covers this third move. It is raised as [OQ-164](../architecture/open-questions.md).
[OQ-147](../architecture/open-questions.md) covers a paused call's status only once a poll hands it over. The open notes
[`output-a-command-writes-as-it-soft-pauses-is-lost-to-its-poll.md`](output-a-command-writes-as-it-soft-pauses-is-lost-to-its-poll.md)
and [`a-poll-after-c-c-says-the-interrupted-command-is-still-running.md`](a-poll-after-c-c-says-the-interrupted-command-is-still-running.md)
are neighbours, and neither describes this case. Recorded, not repaired.

## Specs

- `REQ-TOOLS-098`: a soft-paused call returns −1 "while its process keeps running", and the observation explains "that
  the agent can poll with an empty `command` or interrupt with `C-c` and `is_input=true`". No third move is described.
- `REQ-TOOLS-187`: "a second foreground call against a session whose previous foreground command has not returned
  waits for it". A soft-paused call has returned while its command has not finished, so the requirement does not settle
  whether the wait applies, whether it counts against the new call's window and timeout, or what the new call reports.
- `REQ-TOOLS-096`: the empty-command poll is the only route by which the paused command's end is reported.

## Evidence

- Default pack `.live-run/runs/2026-10-01T02-42-49-120Z/` (the `accept` worktree; git-ignored), session `cd083fc1`
  (`terminal`):
  - #5, at 02:57:13.986: `node -e "setTimeout(() => {}, 45000)"`. It returned −1 after 30,008 ms: "No output for 30
    seconds in the merged terminal stream … Poll by calling the tool again with an empty command, or interrupt by
    sending C-c with is_input=true."
  - #6, at 02:57:45.744: an empty poll. It returned −1, with "No new output in 1.7 seconds since the previous
    observation".
  - #7, at 02:57:53.173: the `console.log` command. It took 5,932 ms and returned exit 0, with the observation "The
    command exited with code 0." Its 5.9 s are the wedge's remaining time.
  - #8 and #9 are later calls. No poll followed.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts:764-858` — `execute`. The new call's hard timeout and no-output window
  are armed from its own start (`:836-847`), and its line is submitted at once (`:858`), whether or not a command is
  paused.
- `packages/agent-tools/src/terminal/foreground.ts:655-716` — `onData`. The paused call's share of the stream ends at its
  own end frame or at the next call's start marker, and the paused call is then kept as `pausedDone`.
- `packages/agent-tools/src/terminal/foreground.ts:886-899` — a new soft pause disposes of `pausedDone` and of a
  still-running `pausedCommand` and replaces them.
- `packages/agent-tools/src/terminal/foreground.ts:940-950` — `poll`, the only reader of `pausedDone`.
