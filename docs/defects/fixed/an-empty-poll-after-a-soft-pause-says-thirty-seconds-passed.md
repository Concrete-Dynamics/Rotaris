## An empty poll after a soft pause returns at once and says thirty seconds passed

After a soft pause, the agent polls by calling the terminal tool again with an empty command. When nothing new was
written, `poll()` returns immediately, and the observation carries the text written for the soft pause itself: "No
output for 30 seconds in the merged terminal stream…". The poll waited well under a millisecond. The model believes
each poll waited 30 s, polls in a loop, and trips the loop supervisor.

Live-run finding: L2 (live runs of 2026-09-29)

## Specs

- `REQ-TOOLS-098`: the observation states the elapsed no-output window; a poll that waited no time states a window
  that did not elapse.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), session `8fbfa271` (`terminal`), tool calls #11–#14 took 0.93, 0.98, 0.58 and 0.61 ms, each detail "No
  output for 30 seconds in the merged terminal stream…". The model's reasoning (transcript rows 33 and 35) reads "each
  poll waits 30s" and "five 30-second polls have elapsed"; 21.6 s passed between the pause and the `C-c`. The polls
  tripped `loop_supervisor_activation` (timeline #10), and the `C-c` landed after `node` had exited, so the wedge's exit
  status never reached the agent. Cost: 5 turns, 70,698 input tokens.

## Relevant files

- `packages/agent-tools/src/terminal/index.ts:345-347` — the empty-capture detail, the same text for a soft pause and
  for an empty poll.
- `packages/agent-tools/src/terminal/foreground.ts:607-619` — `poll()`, which returns at once (`:618`).

## Repaired — 2026-09-29 under R-067

A poll of a command still running now carries what it measured on the monotonic clock (`ForegroundResult.waited`,
`ForegroundSession.poll` in `packages/agent-tools/src/terminal/foreground.ts`): the time since the previous
observation of the command — its soft pause, then each poll — and the time since the command last wrote anything.
An empty poll's detail (`packages/agent-tools/src/terminal/index.ts`) states both, and that a poll returns at once
rather than waiting for output, with REQ-TOOLS-098's capture semantics and poll-or-interrupt advice as before:
"No new output in 5.3 seconds since the previous observation, and none for 35.3 seconds in the merged terminal
stream; …". (As first built it read "in the 5.3 seconds", which below a tenth of a second became "in the under 0.1
seconds"; the article was dropped at the verifier's first round, and the real-shell case's pattern pins the form.
At the second round the span is truncated to the tenth rather than rounded, so a poll never states more than it
measured: rounding had read "1.7 seconds" for 1,686 ms in the verifier's live run.) The
soft pause itself still states the window it waited out. How long a poll should wait is stated
nowhere, and is raised as [OQ-136](../../architecture/open-questions.md) with this reading built.

**Pinned by** `terminal.test.ts`: "REQ-TOOLS-098 (live-run L2): an empty poll states the time it actually waited, not
the no-output window it did not wait out", against the host's real shell. It failed with the detail left as it was
("No output for 1.5 seconds …" after a poll of a few milliseconds). "REQ-TOOLS-098 (live-run L2): a measured span is
stated in tenths of a second, truncated, …" pins the rendering (1,686 ms reads "1.6 seconds"). The live run's `terminal` scenario gained the shape `poll`, one
empty command right after the wedge. On the built branch against `katalyst` (pack
`.live-run/runs/2026-09-29T21-36-38-297Z` of the `fix-terminal-output` worktree; git-ignored) the poll took 2 ms and
said "No new output in the 5.3 seconds since the previous observation, and none for 35.3 seconds"; 5,294 ms had passed
since the wedge's pause. The model polled once more after 25 s and received the wedge's own exit code 0, which the first
run's agent never saw. All checks passed. Repaired 2026-09-29 under R-067.

With the truncation, on the built branch against `katalyst` (pack `.live-run/runs/2026-09-29T22-46-43-191Z`,
git-ignored), the poll after the wedge stated 2.7 seconds where 2,772 ms had passed.
