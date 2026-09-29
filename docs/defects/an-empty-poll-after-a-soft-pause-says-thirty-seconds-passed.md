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
