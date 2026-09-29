## A child waiting on its own children is reported stalled

A child that delegated in the foreground, or that the run resumes waiting on children from its record, waits inside
`IterationChildren.runWithChildren` between its turns. While it waits it has no model step and no tool call in
flight, so its `StallWatch` sees neither a model event nor an active call. Once the threshold passes, the watch reports
the child `stalled`: the warning says it "appears stalled … the run is still waiting on it", and every evaluation
writes a `stall` issue, although the child is working as designed and its children are the ones working. Noticed by
the verifier of the stall watchdog's build (2026-09-29, R-067), established by reading the code; not driven.

## Specs

REQ-ORCH-089 and REQ-MONITOR-118/119 tell a stall from a wait only by "active tool calls"; they do not name a wait on
delegated children, which the watch then reads as silence. Whether that wait pauses the watch, or counts as waiting on
N active children at the informational level of REQ-MONITOR-118, is a reading OQ-109 does not yet state.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `execute`, where the watch is started per attempt, and
  `runWithChildren`, where the wait happens between turns.
- `packages/engine/src/children/stall.ts` — `StallWatch.evaluate`, which knows only tool calls in flight.
